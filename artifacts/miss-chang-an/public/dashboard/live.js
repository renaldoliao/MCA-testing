/* Shared review inbox. No customer records or auth tokens are stored here. */
(() => {
  const state = { mode: "submitted", authorized: false, orders: [], conversations: [], current: null, messages: [], error: "Connecting to shared review inbox…", sending: false, refreshing: false };
  const drafts = new Map(), pending = new Map();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = cents => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  async function api(path, body, method = "POST") {
    const response = await fetch("/api/staff" + path, { credentials: "same-origin", cache: "no-store", method: body === undefined ? "GET" : method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json", "X-MCA-Client": "1" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.headers.get("content-type")?.includes("application/json")) throw Object.assign(new Error("Shared API is not configured on this deployment."), { status: 503 });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || "Unable to connect."), { status: response.status });
    return result;
  }
  function controls() {
    return `<div class="demo-order-head" style="flex-wrap:wrap"><div><span class="demo-order-label">Shared review system · not restaurant fulfillment</span><h2>Customer submissions</h2></div>
      <div><button class="ghostbtn" data-source="submitted" aria-pressed="${state.mode === "submitted"}">Submitted</button>
      <button class="ghostbtn" data-source="samples" aria-pressed="${state.mode === "samples"}">Samples</button>
      <a class="ghostbtn" href="${state.authorized ? "/staff-sign-out" : "/sign-in"}">${state.authorized ? "Staff sign out" : "Staff sign in"}</a></div></div>
      <p class="demo-order-empty" role="status">${esc(state.error || (state.mode === "samples" ? "Generated samples and this browser's old previews only. These are not shared submissions." : "Connected. Submitted orders and private chat update automatically every 3 seconds. No payment or restaurant notification is sent."))}</p>`;
  }
  function renderOrders() {
    const board = document.getElementById("confirmedDemoOrders");
    if (board) board.innerHTML = controls();
    if (state.mode === "samples") return;
    const root = document.getElementById("orderView"), kpis = document.getElementById("orderKpis");
    if (!root || !kpis) return;
    if (!state.authorized) {
      kpis.innerHTML = "";
      root.innerHTML = `<article class="service-card"><h2>Staff access required</h2><p>${esc(state.error)}</p><a class="cta" href="/sign-in">Staff sign in</a></article>`;
      return;
    }
    const waiting = state.orders.filter(order => order.status !== "complete").length;
    kpis.innerHTML = `<div class="kpi"><span class="k-label">Submitted review orders</span><div class="k-value">${state.orders.length}</div></div><div class="kpi"><span class="k-label">Review total, not sales</span><div class="k-value">${money(state.orders.reduce((n, order) => n + order.totalCents, 0))}</div></div><div class="kpi"><span class="k-label">Not completed</span><div class="k-value">${waiting}</div></div>`;
    root.innerHTML = `<div class="list-head"><h2>Submitted orders</h2><span>Latest 100 · saved history · review only</span></div><ul class="orders">${state.orders.length ? state.orders.map(order => {
      const details = order.details || {};
      const next = { new: "preparing", preparing: "ready", ready: "complete" }[order.status];
      return `<li class="order website-demo" data-submitted-order="${esc(order.id)}"><span class="time">${esc(new Date(order.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</span><div style="min-width:0;overflow-wrap:anywhere"><strong>${esc(details.name)}</strong><small> · MCA-${esc(order.id.slice(0, 8).toUpperCase())}</small>
        <p>${(details.items || []).map(item => `${item.quantity} × ${esc(item.name)}`).join(", ")}</p>
        ${details.phone ? `<p>Phone: ${esc(details.phone)}</p>` : ""}${details.notes ? `<p>Notes: ${esc(details.notes)}</p>` : ""}</div>
        <strong>${money(order.totalCents)}</strong><div><span class="pill">${esc(order.status)}</span>${next ? `<button class="ghostbtn" data-order="${esc(order.id)}" data-status="${next}">Mark ${next}</button>` : ""}</div></li>`;
    }).join("") : '<li class="service-card">No submitted review orders yet. Samples are available separately.</li>'}</ul>`;
  }
  function renderChat() {
    const panel = document.getElementById("chat");
    if (!panel) return;
    const preview = panel.querySelector(".chat-dashboard");
    if (preview) preview.hidden = state.mode !== "samples";
    let root = document.getElementById("staffChatLive");
    if (!root) {
      root = document.createElement("div"); root.id = "staffChatLive";
      root.className = "chat-dashboard";
      root.innerHTML = `<aside class="service-card"><h2>Customer conversations</h2><p id="staffChatState" role="status"></p><div id="staffThreads"></div></aside>
        <article class="service-card"><h2 id="staffThreadTitle">Private review chat</h2><div class="chat-thread" id="staffMessages" aria-live="polite"></div>
        <form id="staffReplyForm"><label for="staffReply">Reply to this customer</label><textarea id="staffReply" rows="3" maxlength="2000" required style="width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--cream)"></textarea>
        <button class="cta" type="submit">Send reply</button><p id="staffReplyState" role="status"></p></form></article>`;
      panel.append(root);
      root.querySelector("#staffReplyForm").addEventListener("submit", sendReply);
      root.querySelector("#staffReply").addEventListener("input", event => { if (state.current) drafts.set(state.current, event.target.value); });
    }
    root.hidden = state.mode === "samples";
    root.querySelector("#staffChatState").textContent = state.error || "Private staff inbox. Updates automatically.";
    root.querySelector("#staffThreads").innerHTML = state.authorized ? state.conversations.map(thread =>
      `<button class="ghostbtn" style="display:block;width:100%;margin-block:8px;text-align:left" data-thread="${esc(thread.id)}" aria-pressed="${thread.id === state.current}">Conversation ${esc(thread.id.slice(0, 8))}<small style="display:block">${esc(new Date(thread.updatedAt).toLocaleString())}</small></button>`
    ).join("") || "<p>No customer conversations yet.</p>" : '<a class="cta" href="/sign-in">Staff sign in</a>';
    root.querySelector("#staffReplyForm").hidden = !state.authorized || !state.current;
    const thread = root.querySelector("#staffMessages");
    const content = state.messages.map(message => `<p class="chat-bubble${message.role === "staff" ? " chat-answer" : ""}"><small>${message.role === "staff" ? "Staff" : "Customer"} · Saved</small><br>${esc(message.body)}</p>`).join("");
    if (thread.innerHTML !== content) { thread.innerHTML = content; thread.scrollTop = thread.scrollHeight; }
    root.querySelector("#staffThreadTitle").textContent = state.current ? `Conversation ${state.current.slice(0, 8)}` : "Private review chat";
  }
  async function refreshMessages() {
    if (!state.current || !state.authorized) return;
    const id = state.current;
    const rows = await api(`/conversations/${id}/messages`);
    if (id === state.current) { state.messages = rows; renderChat(); }
  }
  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      await api("/session");
      const [orders, threads] = await Promise.all([api("/orders"), api("/conversations")]);
      state.authorized = true; state.orders = orders; state.conversations = threads; state.error = "";
      if (state.current && !threads.some(thread => thread.id === state.current)) { state.current = null; state.messages = []; }
      await refreshMessages();
    } catch (error) {
      state.error = error.message;
      if (error.status === 401 || error.status === 403) {
        state.authorized = false; state.orders = []; state.conversations = []; state.messages = []; state.current = null;
      }
    } finally {
      state.refreshing = false;
      if (state.mode !== "samples") renderOrders();
      renderChat();
    }
  }
  async function sendReply(event) {
    event.preventDefault();
    if (!state.current || state.sending) return;
    const id = state.current, form = event.currentTarget, input = form.querySelector("textarea"), body = input.value.trim();
    if (!body) return;
    const old = pending.get(id), submission = old?.body === body ? old : { requestId: crypto.randomUUID(), body };
    pending.set(id, submission); drafts.set(id, body);
    state.sending = true;
    const button = form.querySelector("button"); button.disabled = true;
    const status = form.querySelector("#staffReplyState"); status.textContent = "Sending…";
    try {
      await api(`/conversations/${id}/messages`, submission);
      pending.delete(id); drafts.delete(id);
      if (state.current === id) { input.value = ""; status.textContent = "Reply saved. The customer will see it automatically."; }
      await refreshMessages();
    } catch (error) { status.textContent = `Not confirmed: ${error.message} Text retained; retry safely.`; }
    finally { state.sending = false; button.disabled = false; }
  }
  document.addEventListener("click", async event => {
    const source = event.target.closest("[data-source]");
    if (source) {
      state.mode = source.dataset.source;
      if (state.mode === "samples") { window.mcaRenderSamples?.(); document.getElementById("confirmedDemoOrders").innerHTML = controls(); }
      else renderOrders();
      renderChat(); return;
    }
    const thread = event.target.closest("[data-thread]");
    if (thread) {
      state.current = thread.dataset.thread; state.messages = []; renderChat();
      const input = document.getElementById("staffReply"); if (input) input.value = drafts.get(state.current) || "";
      document.getElementById("staffReplyState").textContent = "";
      try { await refreshMessages(); } catch (error) { state.error = error.message; renderChat(); }
      return;
    }
    const action = event.target.closest("[data-order][data-status]");
    if (action) {
      action.disabled = true;
      try { await api(`/orders/${action.dataset.order}`, { status: action.dataset.status }, "PATCH"); await refresh(); }
      catch (error) { state.error = `Update not confirmed: ${error.message}`; renderOrders(); }
      finally { action.disabled = false; }
    }
  });
  window.mcaLive = { get mode() { return state.mode; }, renderOrders, renderChat, refresh };
  renderOrders(); renderChat(); void refresh();
  setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
})();
