/* Live connection between the website and this dashboard.
   Website orders appear as cards on the week board; website chats appear in the Chat tab.
   Everything is drawn with the dashboard's own styles. No customer data is stored in the browser. */
(() => {
  const state = { authorized: false, checked: false, error: "", orders: [], conversations: [], current: null, messages: [], sending: false, refreshing: false };
  const seen = new Set(), drafts = new Map(), pending = new Map();
  let firstLoad = true;
  const zh = () => window.mcaLang?.() === "zh";
  const L = (en, cn) => (zh() ? cn : en);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = iso => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  async function api(path, body, method = "POST") {
    const response = await fetch("/api/staff" + path, { credentials: "same-origin", cache: "no-store", method: body === undefined ? "GET" : method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json", "X-MCA-Client": "1" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.headers.get("content-type")?.includes("application/json")) throw Object.assign(new Error(L("The live connection is not set up on this site yet.", "此网站尚未连接实时数据。")), { status: 503 });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || "Unable to connect."), { status: response.status });
    return result;
  }

  // ---------- Status bar (Orders and Chat tabs) ----------
  function barHTML() {
    if (!state.checked) return `<div class="live-bar"><p><span class="live-dot"></span>${L("Connecting to website orders…", "正在连接网站订单…")}</p></div>`;
    if (!state.authorized) {
      const msg = state.error && !/sign-in required/i.test(state.error) ? esc(state.error) : L("Sign in to see real orders and chats from the website. Sample orders are shown meanwhile.", "登录后可查看来自网站的真实订单和消息。现在显示的是示例订单。");
      return `<div class="live-bar${state.error && !/sign-in required/i.test(state.error) ? " err" : ""}"><p><span class="live-dot"></span>${msg}</p><a class="live-btn red" href="/sign-in">${L("Staff sign in", "员工登录")}</a></div>`;
    }
    const n = state.orders.filter(o => o.status !== "complete").length;
    const msg = state.error ? esc(state.error) : `<b>${L("Live", "实时")}</b> · ${L(`Website orders and chats appear here automatically.${n ? ` ${n} open website order${n > 1 ? "s" : ""}.` : ""}`, `网站订单和消息会自动出现在这里。${n ? `${n} 个未完成订单。` : ""}`)}`;
    return `<div class="live-bar ${state.error ? "err" : "on"}"><p><span class="live-dot"></span>${msg}</p><a class="live-btn" href="/staff-sign-out">${L("Sign out", "退出")}</a></div>`;
  }
  function renderBar() {
    const board = document.getElementById("confirmedDemoOrders");
    if (board) board.innerHTML = barHTML();
    const chatBar = document.getElementById("liveChatBar");
    if (chatBar) chatBar.innerHTML = barHTML();
  }

  // ---------- Orders: hand real orders to the week board ----------
  function publishOrders() {
    window.mcaServerOrders = state.orders.map(order => {
      const d = order.details || {};
      return { id: order.id, name: d.name || "Website customer", phone: d.phone || "", notes: d.notes || "", items: d.items || [],
        totalCents: order.totalCents, createdAt: order.createdAt, status: order.status };
    });
  }
  const chatSeen = new Map();
  function announce() {
    const fresh = state.orders.filter(o => !seen.has(o.id));
    fresh.forEach(o => seen.add(o.id));
    const freshChat = state.conversations.filter(c => c.lastRole === "customer" && chatSeen.get(c.id) !== c.updatedAt);
    state.conversations.forEach(c => chatSeen.set(c.id, c.updatedAt));
    if (firstLoad) return;
    if (fresh.length) window.mcaToast?.(`${L("New website order from", "新网站订单：")} <b>${esc(fresh[0].details?.name || "")}</b>`);
    else if (freshChat.length) window.mcaToast?.(`${L("New chat message:", "新消息：")} <b>${esc(freshChat[0].lastMessage.slice(0, 60))}</b>`);
  }

  // ---------- Chat ----------
  function chatRoot() {
    const panel = document.getElementById("chat");
    if (!panel) return null;
    if (!document.getElementById("liveChatBar")) { const bar = document.createElement("div"); bar.id = "liveChatBar"; panel.prepend(bar); }
    let root = document.getElementById("staffChatLive");
    if (!root) {
      root = document.createElement("div"); root.id = "staffChatLive"; root.className = "chat-dashboard live-chat"; root.hidden = true;
      root.innerHTML = `<article class="service-card chat-preview">
          <div class="chat-preview-head"><span class="chat-avatar" aria-hidden="true">念</span><div><h2 id="staffThreadTitle"></h2><span class="chat-presence" id="staffThreadSub"></span></div></div>
          <div class="chat-thread" id="staffMessages" aria-live="polite"></div>
          <form class="live-reply" id="staffReplyForm"><label class="sr-only" for="staffReply">Reply</label><textarea id="staffReply" rows="3" maxlength="2000" required></textarea>
            <button class="cta" type="submit"></button></form>
          <p class="chat-disclaimer" id="staffReplyState" role="status"></p>
        </article>
        <aside class="service-card chat-quick"><span class="eyebrow" id="staffThreadsLabel"></span><div id="staffThreads" style="display:grid;gap:10px"></div></aside>`;
      panel.append(root);
      root.querySelector("#staffReplyForm").addEventListener("submit", sendReply);
      root.querySelector("#staffReply").addEventListener("input", event => { if (state.current) drafts.set(state.current, event.target.value); });
    }
    return root;
  }
  function renderChat() {
    const root = chatRoot();
    if (!root) return;
    renderBar();
    const sample = document.querySelector("#chat > .chat-dashboard:not(#staffChatLive)");
    if (sample) sample.hidden = state.authorized;
    root.hidden = !state.authorized;
    if (!state.authorized) return;
    if (!state.current && state.conversations.length) state.current = state.conversations[0].id;
    const thread = state.conversations.find(c => c.id === state.current);
    root.querySelector("#staffThreadsLabel").textContent = L("Website conversations", "网站对话");
    root.querySelector("#staffThreads").innerHTML = state.conversations.length ? state.conversations.map(c =>
      `<button type="button" data-thread="${esc(c.id)}" aria-pressed="${c.id === state.current}">${esc(when(c.updatedAt))}${c.lastRole === "customer" ? `<em class="needs-reply">${L("Needs reply", "待回复")}</em>` : ""}<span>${c.lastRole === "staff" ? L("You: ", "你：") : ""}${esc(c.lastMessage || L("No messages yet", "暂无消息"))}</span></button>`
    ).join("") : `<p>${L("No customer messages yet. They will appear here as soon as someone writes on the website.", "还没有顾客消息。顾客在网站上留言后会立即出现在这里。")}</p>`;
    root.querySelector("#staffThreadTitle").textContent = thread ? L("Customer chat", "顾客对话") : L("Customer chat", "顾客对话");
    root.querySelector("#staffThreadSub").textContent = thread ? L(`Started ${when(thread.createdAt)} · updates automatically`, `开始于 ${when(thread.createdAt)} · 自动更新`) : L("Waiting for the first message", "等待第一条消息");
    const box = root.querySelector("#staffMessages");
    const content = thread && state.messages.length ? state.messages.map(m =>
      `<p class="chat-bubble${m.role === "staff" ? " chat-answer" : ""}"><small>${m.role === "staff" ? L("You", "你") : L("Customer", "顾客")} · ${esc(when(m.createdAt))}</small>${esc(m.body)}</p>`).join("")
      : `<p class="chat-empty">${L("Messages will show here.", "消息会显示在这里。")}</p>`;
    if (box.innerHTML !== content) { box.innerHTML = content; box.scrollTop = box.scrollHeight; }
    const form = root.querySelector("#staffReplyForm");
    form.hidden = !thread;
    form.querySelector("textarea").placeholder = L("Reply to this customer", "回复这位顾客");
    form.querySelector("button").textContent = state.sending ? L("Sending…", "发送中…") : L("Send reply", "发送回复");
  }
  async function refreshMessages() {
    if (!state.current || !state.authorized) { state.messages = []; return; }
    const id = state.current;
    const rows = await api(`/conversations/${id}/messages`);
    if (id === state.current) state.messages = rows;
  }
  async function sendReply(event) {
    event.preventDefault();
    if (!state.current || state.sending) return;
    const id = state.current, input = event.currentTarget.querySelector("textarea"), body = input.value.trim();
    if (!body) return;
    const old = pending.get(id), submission = old?.body === body ? old : { requestId: crypto.randomUUID(), body };
    pending.set(id, submission);
    const status = document.getElementById("staffReplyState");
    state.sending = true; renderChat(); status.textContent = "";
    try {
      await api(`/conversations/${id}/messages`, submission);
      pending.delete(id); drafts.delete(id);
      if (state.current === id) input.value = "";
      await refresh();
    } catch (error) { status.textContent = L(`Not sent: ${error.message} Your text is kept, try again.`, `未发送：${error.message} 文字已保留，请重试。`); }
    finally { state.sending = false; renderChat(); }
  }

  // ---------- Refresh loop ----------
  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      await api("/session");
      const [orders, threads] = await Promise.all([api("/orders"), api("/conversations")]);
      state.authorized = true; state.error = ""; state.orders = orders; state.conversations = threads;
      if (state.current && !threads.some(t => t.id === state.current)) state.current = null;
      if (!state.current && threads.length) state.current = threads[0].id;
      await refreshMessages();
      announce();
    } catch (error) {
      state.error = error.message;
      if (error.status === 401 || error.status === 403 || error.status === 503) { state.authorized = false; state.orders = []; state.conversations = []; state.messages = []; state.current = null; }
    } finally {
      state.checked = true; state.refreshing = false; firstLoad = false;
      publishOrders();
      window.mcaRenderSamples?.();
      renderBar();
      renderChat();
    }
  }

  document.addEventListener("click", async event => {
    const thread = event.target.closest("[data-thread]");
    if (thread) {
      state.current = thread.dataset.thread; state.messages = [];
      const input = document.getElementById("staffReply"); if (input) input.value = drafts.get(state.current) || "";
      document.getElementById("staffReplyState").textContent = "";
      renderChat();
      try { await refreshMessages(); } catch (error) { state.error = error.message; }
      renderChat(); return;
    }
    const advance = event.target.closest("[data-advance]");
    if (advance) {
      advance.disabled = true;
      try { await api(`/orders/${advance.dataset.advance}`, { status: advance.dataset.status }, "PATCH"); await refresh(); }
      catch (error) { window.mcaToast?.(esc(L(`Not updated: ${error.message}`, `未更新：${error.message}`))); advance.disabled = false; }
    }
  });
  document.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => setTimeout(() => { renderBar(); renderChat(); }, 220)));

  window.mcaLive = { renderBar, renderChat, refresh };
  publishOrders();
  renderBar(); renderChat();
  void refresh();
  setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
})();
