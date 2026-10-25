import { pool } from "@workspace/db";

// Creates the order and chat tables the first time the live site runs, so a
// fresh database needs no manual setup. Safe to run on every cold start.
const TABLES = `CREATE TABLE "mca_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mca_conversations_customer_id_unique" UNIQUE("customer_id")
);

CREATE TABLE "mca_customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mca_customers_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE "mca_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "mca_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "mca_staff_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "mca_submitted_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"details" jsonb NOT NULL,
	"total_cents" integer NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "mca_conversations" ADD CONSTRAINT "mca_conversations_customer_id_mca_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mca_customers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mca_messages" ADD CONSTRAINT "mca_messages_conversation_id_mca_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."mca_conversations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mca_submitted_orders" ADD CONSTRAINT "mca_submitted_orders_customer_id_mca_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mca_customers"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "mca_message_retry" ON "mca_messages" USING btree ("conversation_id","request_id");
CREATE UNIQUE INDEX "mca_order_retry" ON "mca_submitted_orders" USING btree ("customer_id","request_id");`;
let ready: Promise<void> | null = null;
// The online database can close idle connections (for example when it goes to sleep). Without this
// listener that would crash the server; with it, the pool simply opens a fresh connection next time.
pool.on("error", () => { /* dropped idle connection: ignore, pool reconnects */ });
export function ensureTables(): Promise<void> {
  if (!ready) ready = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(18010001)");
      const { rows } = await client.query("SELECT to_regclass('public.mca_submitted_orders') AS t");
      if (!rows[0]?.t) await client.query(TABLES);
      // Added later: the owner's menu changes (sold out, new dishes), shared with the website.
      await client.query("CREATE TABLE IF NOT EXISTS mca_menu_state (id text PRIMARY KEY, state jsonb NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL)");
      // Table bookings from the website.
      await client.query(`CREATE TABLE IF NOT EXISTS mca_reservations (
        id uuid PRIMARY KEY, customer_id uuid NOT NULL REFERENCES mca_customers(id), request_id uuid NOT NULL,
        name text NOT NULL, phone text NOT NULL, party integer NOT NULL, at timestamp with time zone NOT NULL, notes text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'new', created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL,
        UNIQUE (customer_id, request_id))`);
      // Website visit counters per day (restaurant time): page views, order page opens, call taps.
      await client.query("CREATE TABLE IF NOT EXISTS mca_visits (day date NOT NULL, kind text NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY (day, kind))");
      // Dish photos uploaded from the dashboard, shown on the website.
      await client.query("CREATE TABLE IF NOT EXISTS mca_photos (dish_id text PRIMARY KEY, mime text NOT NULL, data bytea NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL)");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  })().catch(error => { ready = null; throw error; });
  return ready;
}
