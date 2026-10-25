CREATE TABLE "mca_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mca_conversations_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "mca_customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mca_customers_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mca_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mca_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mca_staff_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "mca_conversations" ADD CONSTRAINT "mca_conversations_customer_id_mca_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mca_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mca_messages" ADD CONSTRAINT "mca_messages_conversation_id_mca_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."mca_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mca_submitted_orders" ADD CONSTRAINT "mca_submitted_orders_customer_id_mca_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mca_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mca_message_retry" ON "mca_messages" USING btree ("conversation_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mca_order_retry" ON "mca_submitted_orders" USING btree ("customer_id","request_id");