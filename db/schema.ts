import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  userId: serial("user_id").primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  hostelRoom: text("hostel_room").notNull().default("Campus Hostel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable("items", {
  itemId: serial("item_id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  title: text().notNull(),
  category: text().notNull().default("Other"),
  price: integer().notNull().default(0),
  condition: text().notNull().default("Good"),
  hostelRoom: text("hostel_room").notNull().default(""),
  details: text().notNull().default(""),
  status: text().notNull().default("Available"),
  imageType: text("image_type").notNull().default("default"),
  imageUrl: text("image_url").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  orderId: serial("order_id").primaryKey(),
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  itemId: integer("item_id").notNull(),
  itemTitle: text("item_title").notNull(),
  quantity: integer().notNull().default(1),
  total: integer().notNull().default(0),
  pickupLocation: text("pickup_location").notNull().default("Hostel Gate"),
  hostelRoom: text("hostel_room").notNull().default(""),
  paymentMethod: text("payment_method").notNull().default("Cash"),
  status: text().notNull().default("Pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  messageId: serial("message_id").primaryKey(),
  itemId: integer("item_id").notNull(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  messageText: text("message_text").notNull(),
  timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
