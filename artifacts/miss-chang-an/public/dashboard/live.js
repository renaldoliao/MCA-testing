/* Live connection between the website and this dashboard.
   Website orders appear as cards on the week board; website chats appear in the Chat tab.
   Everything is drawn with the dashboard's own styles. No customer data is stored in the browser. */
(() => {
  const state = { authorized: false, checked: false, error: "", orders: [], conversations: [], current: null, messages: [], sending: false, refreshing: false, reservations: [] };
  const seen = new Set(), drafts = new Map(), pending = new Map(), resSeen = new Set();
  let firstLoad = true;
  const zh = () => window.mcaLang?.() === "zh";
  const L = (en, cn) => (zh() ? cn : en);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // All times are shown in restaurant time (Troy, Michigan).
  const TZ = "America/Detroit";
  const rt = date => (window.mcaRT ? window.mcaRT(date) : date);
  const when = iso => new Date(iso).toLocaleString(zh() ? "zh-CN" : "en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
    const n = state.orders.filter(o => o.status !== "complete").length, r = state.reservations.filter(x => x.status === "new").length;
    const extra = L(`${n ? ` ${n} open order${n > 1 ? "s" : ""}.` : ""}${r ? ` ${r} booking${r > 1 ? "s" : ""} to confirm.` : ""}`, `${n ? ` ${n} 个未完成订单。` : ""}${r ? ` ${r} 个订座待确认。` : ""}`);
    const msg = state.error ? esc(state.error) : `<b>${L("Live", "实时")}</b> · ${L("Website orders, bookings and chats appear here automatically.", "网站订单、订座和消息会自动出现在这里。")}${extra}`;
    return `<div class="live-bar ${state.error ? "err" : "on"}"><p><span class="live-dot"></span>${msg}</p><a class="live-btn" href="/staff-sign-out">${L("Sign out", "退出")}</a></div>`;
  }
  function renderBar() {
    // A status bar at the top of the Sales and Website tabs too, so it's clear the numbers are real.
    for (const [panelId, barId] of [["sales", "liveSalesBar"], ["site", "liveSiteBar"]]) {
      const panel = document.getElementById(panelId);
      if (panel && !document.getElementById(barId)) { const bar = document.createElement("div"); bar.id = barId; bar.style.marginBottom = "18px"; panel.prepend(bar); }
    }
    const board = document.getElementById("confirmedDemoOrders");
    if (board) board.innerHTML = barHTML();
    for (const id of ["liveChatBar", "liveResBar", "liveSalesBar", "liveSiteBar"]) { const el = document.getElementById(id); if (el) el.innerHTML = barHTML(); }
  }

  // ---------- Orders: hand real orders to the week board ----------
  function publishOrders() {
    window.mcaServerOrders = state.orders.map(order => {
      const d = order.details || {};
      return { id: order.id, name: d.name || "Website customer", phone: d.phone || "", notes: d.notes || "", items: d.items || [],
        totalCents: order.totalCents, createdAt: order.createdAt, status: order.status, pickup: d.pickup || null };
    });
  }
  const chatSeen = new Map();
  function announce() {
    const fresh = state.orders.filter(o => !seen.has(o.id));
    fresh.forEach(o => seen.add(o.id));
    const freshChat = state.conversations.filter(c => c.lastRole === "customer" && chatSeen.get(c.id) !== c.updatedAt);
    state.conversations.forEach(c => chatSeen.set(c.id, c.updatedAt));
    const freshRes = state.reservations.filter(x => !resSeen.has(x.id));
    freshRes.forEach(x => resSeen.add(x.id));
    if (firstLoad) return;
    if (fresh.length) { window.mcaToast?.(`${L("New website order from", "新网站订单：")} <b>${esc(fresh[0].details?.name || "")}</b>`); chime(); }
    else if (freshRes.length) { window.mcaToast?.(`${L("New table booking:", "新订座：")} <b>${esc(freshRes[0].name)}, ${freshRes[0].party}</b>`); chime(); }
    else if (freshChat.length) { window.mcaToast?.(`${L("New chat message:", "新消息：")} <b>${esc(freshChat[0].lastMessage.slice(0, 60))}</b>`); chime(); }
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

  // ---------- Menu: sold out and new dishes, shared with the website ----------
  let menuEditAt = 0, menuTick = 0, menuChain = Promise.resolve();
  async function loadMenu() {
    try {
      const response = await fetch("/api/menu-state", { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
      const st = await response.json();
      if (Date.now() - menuEditAt > 8000) window.mcaApplyMenu?.(st);
    } catch (_) { /* offline: keep what is on screen */ }
  }
  function saveMenu(st) {
    menuEditAt = Date.now();
    if (!state.authorized) {
      window.mcaToast?.(L("Sign in to update the website menu. This change is only saved in this browser.", "请登录后再更新网站菜单。此更改只保存在本浏览器。"));
      return;
    }
    // Save one change at a time, in order, always sending the latest menu.
    menuChain = menuChain.then(() => api("/menu-state", window.mcaMenuNow?.() || st, "PUT"))
      .then(() => { menuEditAt = Date.now(); })
      .catch(error => window.mcaToast?.(esc(L(`Menu not saved to the website: ${error.message}`, `菜单未同步到网站：${error.message}`))));
  }

  // ---------- A short chime for new orders, bookings and messages ----------
  let audio = null;
  document.addEventListener("pointerdown", () => { try { audio = audio || new AudioContext(); } catch (_) {} }, { once: true });
  function chime() {
    try {
      if (!audio || audio.state !== "running") return;
      const t0 = audio.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0.0001, t0 + i * 0.12); g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.35);
        o.connect(g).connect(audio.destination); o.start(t0 + i * 0.12); o.stop(t0 + i * 0.12 + 0.4);
      });
    } catch (_) {}
  }

  // ---------- Reservations tab: real table bookings from the website ----------
  const RES_ST = () => ({ new: [L("To confirm", "待确认"), "wait"], confirmed: [L("Confirmed", "已确认"), "later"], seated: [L("Seated", "已入座"), "done"], declined: [L("Declined", "已拒绝"), "done"], cancelled: [L("Cancelled", "已取消"), "done"] });
  const RES_NEXT = { new: [["confirmed", "Confirm", "确认"], ["declined", "Decline", "拒绝"]], confirmed: [["seated", "Seated", "已入座"], ["cancelled", "Cancel", "取消"]] };
  const dayKey = d => d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  function resRoot() {
    const panel = document.getElementById("reservations");
    if (!panel) return null;
    if (!document.getElementById("liveResBar")) { const bar = document.createElement("div"); bar.id = "liveResBar"; bar.style.marginBottom = "18px"; panel.prepend(bar); }
    let root = document.getElementById("liveRes");
    if (!root) { root = document.createElement("div"); root.id = "liveRes"; root.hidden = true; panel.append(root); }
    return root;
  }
  function renderReservations() {
    const root = resRoot();
    if (!root) return;
    renderBar();
    const sample = document.querySelector("#reservations > .service-grid");
    if (sample) sample.hidden = state.authorized;
    root.hidden = !state.authorized;
    if (!state.authorized) return;
    const start = rt(new Date()); start.setHours(0, 0, 0, 0);
    const list = state.reservations.filter(x => rt(new Date(x.at)) >= start).sort((a, b) => new Date(a.at) - new Date(b.at));
    const today = list.filter(x => dayKey(rt(new Date(x.at))) === dayKey(rt(new Date())) && x.status !== "declined" && x.status !== "cancelled");
    const kpi = (label, value, note) => `<div class="kpi"><span class="k-label">${label}</span><span class="k-value">${value}</span><span class="k-note">${note}</span></div>`;
    const toConfirm = list.filter(x => x.status === "new").length;
    let html = `<div class="kpis hero">${kpi(L("Bookings today", "今天订座"), today.length, L(`${today.reduce((n, x) => n + x.party, 0)} guests`, `共 ${today.reduce((n, x) => n + x.party, 0)} 位`))}${kpi(L("To confirm", "待确认"), toConfirm, toConfirm ? L("new requests from the website", "来自网站的新请求") : L("all answered", "都已处理"))}${kpi(L("Upcoming", "即将到来"), list.filter(x => x.status === "new" || x.status === "confirmed").length, L("from today on", "从今天起"))}</div>`;
    if (!list.length) html += `<p class="c-empty" style="margin-top:22px">${L("No bookings yet. When a guest requests a table on the website, it shows up here.", "还没有订座。顾客在网站上申请订座后会显示在这里。")}</p>`;
    const groups = new Map();
    list.forEach(x => { const k = dayKey(rt(new Date(x.at))); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    for (const rows of groups.values()) {
      const d = new Date(rows[0].at), isToday = dayKey(rt(d)) === dayKey(rt(new Date()));
      const title = (isToday ? L("Today", "今天") + ", " : "") + d.toLocaleDateString(zh() ? "zh-CN" : "en-US", { timeZone: TZ, weekday: isToday ? undefined : "long", month: "short", day: "numeric" });
      html += `<div class="list-head" style="margin-top:26px"><h2>${esc(title)}</h2><span>${L(`${rows.length} booking${rows.length > 1 ? "s" : ""}`, `${rows.length} 个订座`)}</span></div><ul class="orders">` + rows.map(x => {
        const [label, cls] = RES_ST()[x.status] || [x.status, "done"];
        const next = RES_NEXT[x.status] || [];
        return `<li class="order"><span class="o-time">${esc(new Date(x.at).toLocaleTimeString(zh() ? "zh-CN" : "en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }))}</span>
          <span class="o-who"><span class="o-name">${esc(x.name)}</span><span class="o-type">${esc(x.phone)}</span>${x.notes ? `<span class="o-customer-note">${L("Note", "备注")}: ${esc(x.notes)}</span>` : ""}</span>
          <span class="o-total">${x.party} ${L(x.party === 1 ? "guest" : "guests", "位")}</span>
          ${next.length ? `<span class="o-state"><span class="status ${cls}">${label}</span>${next.map(([to, en, cn]) => `<button type="button" class="o-advance" data-res="${esc(x.id)}" data-status="${to}">${L(en, cn)}</button>`).join("")}</span>` : `<span class="status ${cls}">${label}</span>`}</li>`;
      }).join("") + "</ul>";
    }
    if (root.innerHTML !== html) root.innerHTML = html;
  }

  // ---------- Website tab and Sales tab: real visit numbers ----------
  let visitsTick = 0;
  async function loadVisits() {
    try { window.mcaVisits = await api("/visits"); if (!document.getElementById("site")?.hidden) window.mcaRenderSite?.(); } catch (_) {}
  }

  // ---------- Menu photos: saved on the server so the website shows them ----------
  async function uploadPhoto(dishId, file) {
    if (!state.authorized) { window.mcaToast?.(L("Sign in to save photos to the website. This photo only shows in this browser.", "请登录后再把照片保存到网站。此照片只在本浏览器显示。")); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let quality = 0.82, dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > 900000 && quality > 0.4) { quality -= 0.12; dataUrl = canvas.toDataURL("image/jpeg", quality); }
      const result = await api(`/photos/${encodeURIComponent(dishId)}`, { dataUrl }, "PUT");
      window.mcaApplyMenu?.({ ...(window.mcaMenuNow?.() || { off: [], added: [] }), photos: result.photos });
      window.mcaToast?.(L("Photo saved. It now shows on the website too.", "照片已保存，网站上也会显示。"));
    } catch (error) { window.mcaToast?.(esc(L(`Photo not saved: ${error.message}`, `照片未保存：${error.message}`))); }
  }

  // ---------- Refresh loop ----------
  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      await api("/session");
      const [orders, threads, bookings] = await Promise.all([api("/orders"), api("/conversations"), api("/reservations")]);
      state.authorized = true; state.error = ""; state.orders = orders; state.conversations = threads; state.reservations = bookings;
      window.mcaSetReal?.(true);
      if (visitsTick++ % 10 === 0) await loadVisits();
      if (state.current && !threads.some(t => t.id === state.current)) state.current = null;
      if (!state.current && threads.length) state.current = threads[0].id;
      await refreshMessages();
      announce();
      if (menuTick++ % 10 === 0) await loadMenu();
    } catch (error) {
      state.error = error.message;
      if (error.status === 401 || error.status === 403 || error.status === 503) { state.authorized = false; state.orders = []; state.conversations = []; state.messages = []; state.current = null; state.reservations = []; window.mcaSetReal?.(false); }
    } finally {
      state.checked = true; state.refreshing = false; firstLoad = false;
      publishOrders();
      window.mcaRenderSamples?.();
      renderBar();
      renderChat();
      renderReservations();
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
      renderChat();
      if (window.innerWidth < 760) document.getElementById("staffMessages")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const res = event.target.closest("[data-res]");
    if (res) {
      res.disabled = true;
      try { await api(`/reservations/${res.dataset.res}`, { status: res.dataset.status }, "PATCH"); await refresh(); }
      catch (error) { window.mcaToast?.(esc(L(`Not updated: ${error.message}`, `未更新：${error.message}`))); res.disabled = false; }
      return;
    }
    const advance = event.target.closest("[data-advance]");
    if (advance) {
      advance.disabled = true;
      try { await api(`/orders/${advance.dataset.advance}`, { status: advance.dataset.status }, "PATCH"); await refresh(); }
      catch (error) { window.mcaToast?.(esc(L(`Not updated: ${error.message}`, `未更新：${error.message}`))); advance.disabled = false; }
    }
  });
  document.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => setTimeout(() => { renderBar(); renderChat(); renderReservations(); }, 220)));

  window.mcaLive = { renderBar, renderChat, refresh, saveMenu, renderReservations, uploadPhoto };
  void loadMenu();
  publishOrders();
  renderBar(); renderChat(); renderReservations();
  void refresh();
  setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
})();
