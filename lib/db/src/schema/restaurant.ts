import { pgTable, text, timestamp, uuid, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const customers = pgTable("mca_customers", {
  id: uuid("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const submittedOrders = pgTable("mca_submitted_orders", {
  id: uuid("id").primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  requestId: uuid("request_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  details: jsonb("details").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("mca_order_retry").on(table.customerId, table.requestId)]);
export const conversations = pgTable("mca_conversations", {
  id: uuid("id").primaryKey(),
  customerId: uuid("customer_id").notNull().unique().references(() => customers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const messages = pgTable("mca_messages", {
  id: uuid("id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id),
  requestId: uuid("request_id").notNull(),
  role: text("role").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("mca_message_retry").on(table.conversationId, table.requestId)]);
export const staffMembers = pgTable("mca_staff_members", {
  userId: text("user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const rateLimits = pgTable("mca_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const insertOrderSchema = createInsertSchema(submittedOrders);
export type SubmittedOrder = typeof submittedOrders.$inferSelect;
