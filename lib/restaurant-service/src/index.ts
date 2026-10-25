import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, customers, submittedOrders, conversations, messages, rateLimits } from "@workspace/db";
import { SubmitCustomerOrderBody, SendCustomerMessageBody, SendStaffMessageBody, UpdateStaffOrderBody } from "@workspace/api-zod";
// Prices come straight from the website menu, so the two can never drift apart.
import catalog from "../../../artifacts/miss-chang-an/src/data/menu.json";

const router = Router();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const COOKIE = "mca_customer";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const menu = new Map(catalog.categories.flatMap(category => category.items).map(item => [
  item.id, { name: item.name, chinese: "chinese" in item ? item.chinese : "", unitCents: Math.round(Number(item.price.replace(/[^0-9.]/g, "")) * 100), from: /^from/i.test(item.price) },
]));
const CATEGORY_IDS = new Set(catalog.categories.map(category => category.id));
type MenuState = { off: string[]; added: { id: string; name: string; chinese: string; price: number; cat: string }[] };
async function readMenuState(): Promise<MenuState> {
  const result = await db.execute(sql`SELECT state FROM mca_menu_state WHERE id = 'main'`);
  const state = (result.rows[0] as { state?: Partial<MenuState> } | undefined)?.state;
  return { off: Array.isArray(state?.off) ? state.off : [], added: Array.isArray(state?.added) ? state.added : [] };
}
function cleanMenuState(input: unknown): MenuState | null {
  const value = input as Partial<MenuState> | null;
  if (!value || !Array.isArray(value.off) || !Array.isArray(value.added) || value.off.length > 300 || value.added.length > 60) return null;
  const text = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const off = [...new Set(value.off.map(id => text(id, 80)).filter(Boolean))];
  const added = value.added.map(item => ({ id: text(item?.id, 80), name: text(item?.name, 60), chinese: text(item?.chinese, 30),
    price: Math.round(Math.min(1000, Math.max(0, Number(item?.price) || 0)) * 100) / 100, cat: text(item?.cat, 40) }))
    .filter(item => /^new-[a-z0-9]+$/.test(item.id) && item.name && CATEGORY_IDS.has(item.cat));
  return { off, added };
}
function fail(res: Response, status: number, error: string): void { res.status(status).json({ error }); }
function customerToken(req: Request): string {
  const token = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : "";
}
async function customerId(req: Request): Promise<string | undefined> {
  const token = customerToken(req);
  if (!token) return;
  const [customer] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.tokenHash, hash(token)), gt(customers.expiresAt, new Date())));
  return customer?.id;
}
async function requireCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = await customerId(req);
  if (!id) { fail(res, 401, "Your private customer session has expired. Reconnect before sending."); return; }
  res.locals.customerId = id;
  next();
}
// Owner dashboard login (demo): one shared password, kept in a signed,
// browser-only cookie for 30 days. Set STAFF_PASSWORD on the host to replace
// the demo default. Changing the password signs everyone out.
const STAFF_COOKIE = "mca_staff";
const STAFF_DAYS = 30;
const staffPassword = () => process.env.STAFF_PASSWORD || "misschangan";
function staffKey(): string {
  const password = staffPassword();
  return password ? hash(`mca-staff:${password}:${process.env.SESSION_SECRET || ""}`) : "";
}
function staffSign(expires: number): string {
  return createHmac("sha256", staffKey()).update(String(expires)).digest("hex");
}
function sameText(a: string, b: string): boolean {
  const x = Buffer.from(hash(a)), y = Buffer.from(hash(b));
  return timingSafeEqual(x, y);
}
function staffSignedIn(req: Request): boolean {
  if (!staffKey()) return false;
  const raw = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(STAFF_COOKIE + "="))?.slice(STAFF_COOKIE.length + 1) || "";
  const [expires, signature] = raw.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return sameText(signature, staffSign(Number(expires)));
}
async function requireStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!staffKey()) { fail(res, 503, "Owner password is not set up on this deployment yet (STAFF_PASSWORD)."); return; }
  if (!staffSignedIn(req)) { fail(res, 401, "Owner sign-in required."); return; }
  next();
}
async function allow(key: string, max: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 3600000);
  const [limit] = await db.insert(rateLimits).values({
    key: hash(`${process.env.SESSION_SECRET || "mca-rate"}:${key}:${bucket}`),
    count: 1, expiresAt: new Date((bucket + 1) * 3600000),
  }).onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } }).returning();
  return limit.count <= max;
}
const orderResponse = (row: typeof submittedOrders.$inferSelect) => ({
  id: row.id, details: row.details, totalCents: row.totalCents, status: row.status,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
const messageResponse = (row: typeof messages.$inferSelect) => ({
  id: row.id, role: row.role, body: row.body, createdAt: row.createdAt.toISOString(),
});

// No cross-origin credential reflection. JSON + a custom header and an Origin
// check protect cookie-authorized writes, including staff replies and updates.
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const publicHost = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
    let sameOrigin = true;
    try { if (origin) sameOrigin = new URL(origin).host === publicHost; } catch { sameOrigin = false; }
    if (!sameOrigin || req.get("x-mca-client") !== "1" || !req.is("application/json")) {
      fail(res, 403, "Only same-site application requests are accepted."); return;
    }
    if (process.env.MCA_SUBMISSIONS_ENABLED === "false") {
      fail(res, 503, "Shared review submissions are not enabled on this deployment."); return;
    }
  }
  next();
});

router.post("/customer/session", async (req, res): Promise<void> => {
  if (await customerId(req)) { res.json({ saved: true }); return; }
  if (!await allow(`session:${req.ip}`, 60)) { fail(res, 429, "Too many connection attempts. Try again later."); return; }
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 86400000);
  await db.insert(customers).values({ id: randomUUID(), tokenHash: hash(token), expiresAt: expires });
  res.cookie(COOKIE, token, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/api", expires });
  res.json({ saved: true });
});
router.use("/customer", requireCustomer);
router.get("/customer/orders", async (_req, res): Promise<void> => {
  const rows = await db.select().from(submittedOrders).where(eq(submittedOrders.customerId, res.locals.customerId)).orderBy(desc(submittedOrders.createdAt)).limit(100);
  res.json(rows.map(orderResponse));
});
router.post("/customer/orders", async (req, res): Promise<void> => {
  const parsed = SubmitCustomerOrderBody.safeParse(req.body);
  if (!parsed.success) { fail(res, 400, "Check the order fields and quantities."); return; }
  const input = parsed.data;
  if (!input.name.trim() || (input.phone && !/^(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(input.phone.trim()))) {
    fail(res, 400, "Provide a pickup name and a valid optional phone number."); return;
  }
  const fingerprint = hash(JSON.stringify(input));
  const [prior] = await db.select().from(submittedOrders).where(and(eq(submittedOrders.customerId, res.locals.customerId), eq(submittedOrders.requestId, input.requestId)));
  if (prior) {
    if (prior.fingerprint !== fingerprint) { fail(res, 409, "This retry ID was already used for a different order."); return; }
    res.json(orderResponse(prior)); return;
  }
  if (new Set(input.items.map(item => item.id)).size !== input.items.length || input.items.reduce((n, item) => n + item.quantity, 0) > 100) {
    fail(res, 400, "Use unique dishes and no more than 100 items."); return;
  }
  // Today's menu: the published menu plus dishes the owner added, minus anything marked sold out.
  const menuState = await readMenuState();
  const todays = new Map(menu);
  for (const dish of menuState.added) todays.set(dish.id, { name: dish.name, chinese: dish.chinese, unitCents: Math.round(dish.price * 100), from: false });
  const items = input.items.map(item => ({ id: item.id, quantity: item.quantity, ...todays.get(item.id) }));
  if (items.some(item => !item.name || item.unitCents === undefined)) { fail(res, 400, "A dish is not in the published menu. Refresh the menu before submitting."); return; }
  const soldOut = items.find(item => menuState.off.includes(item.id));
  if (soldOut) { fail(res, 409, `Sorry, ${soldOut.name} just sold out. Remove it and submit again.`); return; }
  if (!await allow(`orders:${res.locals.customerId}`, 30)) { fail(res, 429, "Too many submissions. Try again later."); return; }
  const [created] = await db.insert(submittedOrders).values({
    id: randomUUID(), customerId: res.locals.customerId, requestId: input.requestId, fingerprint,
    details: { name: input.name.trim(), phone: input.phone.trim(), notes: input.notes.trim(), items, mode: "review" },
    totalCents: items.reduce((n, item) => n + item.unitCents! * item.quantity, 0),
  }).onConflictDoNothing({ target: [submittedOrders.customerId, submittedOrders.requestId] }).returning();
  const saved = created || (await db.select().from(submittedOrders).where(and(eq(submittedOrders.customerId, res.locals.customerId), eq(submittedOrders.requestId, input.requestId))))[0];
  if (saved.fingerprint !== fingerprint) { fail(res, 409, "This retry ID was already used for a different order."); return; }
  res.json(orderResponse(saved));
});
async function saveMessage(conversationId: string, role: string, input: { requestId: string; body: string }, res: Response): Promise<void> {
  const body = input.body.trim();
  if (!body) { fail(res, 400, "Enter a message."); return; }
  if (!await allow(`message:${conversationId}:${role}`, 300)) { fail(res, 429, "Too many messages. Try again later."); return; }
  const [created] = await db.insert(messages).values({ id: randomUUID(), conversationId, role, body, requestId: input.requestId })
    .onConflictDoNothing({ target: [messages.conversationId, messages.requestId] }).returning();
  const saved = created || (await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.requestId, input.requestId))))[0];
  if (saved.role !== role || saved.body !== body) { fail(res, 409, "This retry ID was used for a different message."); return; }
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  res.json(messageResponse(saved));
}
router.get("/customer/messages", async (_req, res): Promise<void> => {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.customerId, res.locals.customerId));
  if (!conversation) { res.json([]); return; }
  const rows = await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt)).limit(500);
  res.json(rows.reverse().map(messageResponse));
});
router.post("/customer/messages", async (req, res): Promise<void> => {
  const parsed = SendCustomerMessageBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.body.trim()) { fail(res, 400, "Enter a message of 1 to 2,000 characters."); return; }
  await db.insert(conversations).values({ id: randomUUID(), customerId: res.locals.customerId }).onConflictDoNothing({ target: conversations.customerId });
  const [conversation] = await db.select().from(conversations).where(eq(conversations.customerId, res.locals.customerId));
  await saveMessage(conversation.id, "customer", parsed.data, res);
});

router.post("/staff-login", async (req, res): Promise<void> => {
  if (!staffKey()) { fail(res, 503, "Owner password is not set up on this deployment yet (STAFF_PASSWORD)."); return; }
  if (!await allow(`staff-login:${req.ip}`, 20)) { fail(res, 429, "Too many attempts. Try again in an hour."); return; }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || !sameText(password, staffPassword())) { fail(res, 401, "Wrong password."); return; }
  const expires = Date.now() + STAFF_DAYS * 86400000;
  res.cookie(STAFF_COOKIE, `${expires}.${staffSign(expires)}`, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/api", expires: new Date(expires) });
  res.json({ authorized: true });
});
router.get("/menu-state", async (_req, res): Promise<void> => { res.json(await readMenuState()); });
router.post("/staff-logout", (_req, res) => {
  res.clearCookie(STAFF_COOKIE, { path: "/api" });
  res.json({ authorized: false });
});
router.use("/staff", requireStaff);
router.get("/staff/session", (_req, res) => { res.json({ authorized: true }); });
router.put("/staff/menu-state", async (req, res): Promise<void> => {
  const state = cleanMenuState(req.body);
  if (!state) { fail(res, 400, "Invalid menu update."); return; }
  await db.execute(sql`INSERT INTO mca_menu_state (id, state, updated_at) VALUES ('main', ${JSON.stringify(state)}::jsonb, now()) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`);
  res.json(state);
});
router.get("/staff/orders", async (_req, res): Promise<void> => {
  const rows = await db.select().from(submittedOrders).orderBy(desc(submittedOrders.createdAt)).limit(100);
  res.json(rows.map(orderResponse));
});
router.patch("/staff/orders/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const parsed = UpdateStaffOrderBody.safeParse(req.body);
  if (!uuid.test(id) || !parsed.success) { fail(res, 400, "Invalid order or status."); return; }
  const [saved] = await db.update(submittedOrders).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(submittedOrders.id, id)).returning();
  if (!saved) { fail(res, 404, "Order not found."); return; }
  res.json(orderResponse(saved));
});
router.get("/staff/conversations", async (_req, res): Promise<void> => {
  const rows = await db.select({ id: conversations.id, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt }).from(conversations).orderBy(desc(conversations.updatedAt)).limit(200);
  // Latest message per conversation, so the inbox can show a preview line.
  const latest = await db.execute(sql`SELECT DISTINCT ON (conversation_id) conversation_id, body, role FROM mca_messages ORDER BY conversation_id, created_at DESC`);
  const last = new Map((latest.rows as { conversation_id: string; body: string; role: string }[]).map(row => [row.conversation_id, row]));
  res.json(rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    lastMessage: last.get(row.id)?.body.slice(0, 120) ?? "", lastRole: last.get(row.id)?.role ?? "" })));
});
router.use("/staff/conversations/:id/messages", async (req, res, next): Promise<void> => {
  const id = String(req.params.id);
  if (!uuid.test(id)) { fail(res, 400, "Invalid conversation."); return; }
  const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, id));
  if (!conversation) { fail(res, 404, "Conversation not found."); return; }
  res.locals.conversationId = id;
  next();
});
router.get("/staff/conversations/:id/messages", async (_req, res): Promise<void> => {
  const rows = await db.select().from(messages).where(eq(messages.conversationId, res.locals.conversationId)).orderBy(desc(messages.createdAt)).limit(500);
  res.json(rows.reverse().map(messageResponse));
});
router.post("/staff/conversations/:id/messages", async (req, res): Promise<void> => {
  const parsed = SendStaffMessageBody.safeParse(req.body);
  if (!parsed.success) { fail(res, 400, "Enter a message of 1 to 2,000 characters."); return; }
  await saveMessage(res.locals.conversationId, "staff", parsed.data, res);
});
export { router as restaurantRouter };
