import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { and, desc, asc, eq, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users, items, orders, messages } from "../../db/schema.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const json = (data: unknown, status = 200) => Response.json(data, { status });

// ==================== Serializers (keep the snake_case shape the frontend expects) ====================
const userOut = (u: typeof users.$inferSelect) => ({
  user_id: u.userId,
  name: u.name,
  email: u.email,
  hostel_room: u.hostelRoom,
  created_at: u.createdAt,
});

const itemOut = (i: typeof items.$inferSelect, seller?: typeof users.$inferSelect | null) => ({
  item_id: i.itemId,
  seller_id: i.sellerId,
  title: i.title,
  category: i.category,
  price: i.price,
  condition: i.condition,
  hostel_room: i.hostelRoom,
  details: i.details,
  status: i.status,
  image_type: i.imageType,
  image_url: i.imageUrl,
  created_at: i.createdAt,
  seller_name: seller ? seller.name : "Student",
  seller_email: seller ? seller.email : "",
  seller_hostel: seller ? seller.hostelRoom : i.hostelRoom,
});

const orderOut = (o: typeof orders.$inferSelect) => ({
  order_id: o.orderId,
  buyer_id: o.buyerId,
  seller_id: o.sellerId,
  item_id: o.itemId,
  item_title: o.itemTitle,
  quantity: o.quantity,
  total: o.total,
  pickup_location: o.pickupLocation,
  hostel_room: o.hostelRoom,
  payment_method: o.paymentMethod,
  status: o.status,
  created_at: o.createdAt,
});

const messageOut = (m: typeof messages.$inferSelect, userMap: Map<number, typeof users.$inferSelect>) => ({
  message_id: m.messageId,
  item_id: m.itemId,
  sender_id: m.senderId,
  receiver_id: m.receiverId,
  message_text: m.messageText,
  timestamp: m.timestamp,
  sender_name: userMap.get(m.senderId)?.name || "Student",
  receiver_name: userMap.get(m.receiverId)?.name || "Student",
});

async function userMap() {
  const all = await db.select().from(users);
  return new Map(all.map((u) => [u.userId, u]));
}

async function getItemById(id: number) {
  const [row] = await db
    .select()
    .from(items)
    .leftJoin(users, eq(items.sellerId, users.userId))
    .where(eq(items.itemId, id));
  return row ? itemOut(row.items, row.users) : null;
}

async function getOrCreateUser(name: string, email: string, hostelRoom?: string) {
  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ name, email, hostelRoom: hostelRoom || "Campus Hostel" })
    .returning();
  return created;
}

async function getOrders(userId?: number) {
  const map = await userMap();
  const allItems = await db.select().from(items);
  const itemMap = new Map(allItems.map((i) => [i.itemId, i]));
  const rows = await db
    .select()
    .from(orders)
    .where(userId ? or(eq(orders.buyerId, userId), eq(orders.sellerId, userId)) : undefined)
    .orderBy(desc(orders.createdAt));
  return rows.map((o) => ({
    ...orderOut(o),
    buyer_name: map.get(o.buyerId)?.name || "Student",
    seller_name: map.get(o.sellerId)?.name || "Student",
    item_condition: itemMap.get(o.itemId)?.condition || "Good",
  }));
}

async function updateOrderStatus(orderId: number, status: string) {
  const [order] = await db.update(orders).set({ status }).where(eq(orders.orderId, orderId)).returning();
  if (!order) return null;
  if (status === "Completed") {
    await db.update(items).set({ status: "Sold" }).where(eq(items.itemId, order.itemId));
  } else if (status === "Cancelled") {
    await db.update(items).set({ status: "Available" }).where(eq(items.itemId, order.itemId));
  }
  return orderOut(order);
}

// ==================== Route handlers ====================
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method;
  const q = url.searchParams;
  const body = async () => {
    try {
      return await req.json();
    } catch {
      return {};
    }
  };

  // ---------- AUTH ----------
  if (parts[0] === "auth") {
    if (parts[1] === "register" && method === "POST") {
      const { name, email, hostel_room } = await body();
      if (!name || !email) return json({ error: "Name and email are required" }, 400);
      const user = await getOrCreateUser(name, email, hostel_room);
      return json({ success: true, user: userOut(user), token: "jwt-token-campus-" + user.userId }, 201);
    }
    if (parts[1] === "login" && method === "POST") {
      const { email } = await body();
      if (!email) return json({ error: "Campus email is required" }, 400);
      const defaultName = String(email).split("@")[0];
      const user = await getOrCreateUser(
        defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
        email,
        "Campus Hostel"
      );
      return json({ success: true, user: userOut(user), token: "jwt-token-campus-" + user.userId });
    }
    if (parts[1] === "users" && method === "GET") {
      const all = await db.select().from(users).orderBy(asc(users.userId));
      return json(all.map(userOut));
    }
  }

  // ---------- ITEMS ----------
  if (parts[0] === "items") {
    if (parts.length === 1 && method === "GET") {
      const category = q.get("category");
      const search = q.get("search")?.toLowerCase().trim();
      const status = q.get("status");
      const conds = [];
      if (category && category !== "All") conds.push(sql`lower(${items.category}) = lower(${category})`);
      if (status) conds.push(sql`lower(${items.status}) = lower(${status})`);
      if (search) {
        const like = `%${search}%`;
        conds.push(
          sql`(lower(${items.title}) like ${like} or lower(${items.details}) like ${like} or lower(${items.category}) like ${like} or lower(${items.hostelRoom}) like ${like})`
        );
      }
      const rows = await db
        .select()
        .from(items)
        .leftJoin(users, eq(items.sellerId, users.userId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(items.createdAt));
      return json(rows.map((r) => itemOut(r.items, r.users)));
    }

    if (parts.length === 1 && method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      let fields: Record<string, any> = {};
      let photo: File | null = null;
      if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        for (const [k, v] of form.entries()) {
          if (typeof v === "string") fields[k] = v;
          else if (k === "photo" && v.size > 0) photo = v;
        }
      } else {
        fields = await body();
      }

      const { seller_id, title, category, price, condition, hostel_room, details, image_type } = fields;
      if (!title || !price) return json({ error: "Title and price are required" }, 400);

      let imageUrl = "";
      if (photo) {
        if (photo.size > 5 * 1024 * 1024) return json({ error: "Photo must be 5MB or smaller" }, 400);
        const ext = (photo.name.match(/\.[a-zA-Z0-9]+$/)?.[0] || "").toLowerCase();
        const key = `item-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
        await getStore("uploads").set(key, await photo.arrayBuffer(), {
          metadata: { contentType: photo.type || "application/octet-stream" },
        });
        imageUrl = "/uploads/" + key;
      }

      const sellerId = Number(seller_id) || 1;
      const [seller] = await db.select().from(users).where(eq(users.userId, sellerId));
      const [item] = await db
        .insert(items)
        .values({
          sellerId,
          title,
          category: category || "Other",
          price: Math.round(Number(price)) || 0,
          condition: condition || "Good",
          hostelRoom: hostel_room || (seller ? seller.hostelRoom : "Hostel Gate"),
          details: details || "",
          imageType: image_type || "default",
          imageUrl,
        })
        .returning();
      return json({ success: true, item: itemOut(item, seller) }, 201);
    }

    const id = Number(parts[1]);
    if (parts.length === 2 && method === "GET") {
      const item = await getItemById(id);
      return item ? json(item) : json({ error: "Item not found" }, 404);
    }

    if (parts.length === 3 && parts[2] === "status" && method === "PATCH") {
      const { status } = await body();
      const [updated] = await db.update(items).set({ status }).where(eq(items.itemId, id)).returning();
      if (!updated) return json({ error: "Item not found" }, 404);
      return json({ success: true, item: itemOut(updated) });
    }
  }

  // ---------- ORDERS ----------
  if (parts[0] === "orders") {
    if (parts.length === 1 && method === "POST") {
      const { buyer_id, item_id, items: cart, pickup_location, payment_method, total, hostel_room } = await body();
      const buyerId = Number(buyer_id) || 2;
      const [buyer] = await db.select().from(users).where(eq(users.userId, buyerId));
      const entries =
        Array.isArray(cart) && cart.length > 0 ? cart : [{ item_id: Number(item_id), quantity: 1, price: total }];

      const created = [];
      for (const entry of entries) {
        const itemId = Number(entry.item_id);
        const [target] = await db.select().from(items).where(eq(items.itemId, itemId));
        const quantity = Number(entry.quantity) || 1;
        const [order] = await db
          .insert(orders)
          .values({
            buyerId,
            sellerId: target ? target.sellerId : 1,
            itemId,
            itemTitle: target ? target.title : entry.title || "Campus Item",
            quantity,
            total: Math.round(Number(entry.price ? entry.price * quantity : total)) || 0,
            pickupLocation: pickup_location || "Hostel Gate",
            hostelRoom: hostel_room || (buyer ? buyer.hostelRoom : ""),
            paymentMethod: payment_method || "Cash",
          })
          .returning();
        if (target) await db.update(items).set({ status: "Pending" }).where(eq(items.itemId, itemId));
        created.push(orderOut(order));
      }
      return json({ success: true, order: created.length === 1 ? created[0] : created }, 201);
    }

    if (parts.length === 1 && method === "GET") {
      const userId = Number(q.get("userId")) || undefined;
      return json(await getOrders(userId));
    }

    if (parts.length === 3 && parts[2] === "status" && method === "PATCH") {
      const { status } = await body();
      const updated = await updateOrderStatus(Number(parts[1]), status);
      if (!updated) return json({ error: "Order not found" }, 404);
      return json({ success: true, order: updated });
    }
  }

  // ---------- CHAT ----------
  if (parts[0] === "chat" && parts.length === 2) {
    const itemId = Number(parts[1]);

    if (method === "GET") {
      const u1 = Number(q.get("user1"));
      const u2 = Number(q.get("user2"));
      const pair =
        u1 && u2
          ? or(
              and(eq(messages.senderId, u1), eq(messages.receiverId, u2)),
              and(eq(messages.senderId, u2), eq(messages.receiverId, u1))
            )
          : undefined;
      const rows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.itemId, itemId), pair))
        .orderBy(asc(messages.timestamp));
      const map = await userMap();
      return json({ item: await getItemById(itemId), messages: rows.map((m) => messageOut(m, map)) });
    }

    if (method === "POST") {
      const { sender_id, receiver_id, message_text } = await body();
      if (!message_text || !String(message_text).trim()) {
        return json({ error: "Message text cannot be empty" }, 400);
      }
      const senderId = Number(sender_id) || 2;
      let receiverId = Number(receiver_id) || 0;
      if (!receiverId) {
        const [item] = await db.select().from(items).where(eq(items.itemId, itemId));
        receiverId = item ? (senderId === item.sellerId ? 2 : item.sellerId) : 1;
      }
      const [msg] = await db
        .insert(messages)
        .values({ itemId, senderId, receiverId, messageText: String(message_text).trim() })
        .returning();
      return json({ success: true, message: messageOut(msg, await userMap()) }, 201);
    }
  }

  if (parts[0] === "chat-threads" && parts.length === 2 && method === "GET") {
    const uid = Number(parts[1]);
    const rows = await db
      .select()
      .from(messages)
      .where(or(eq(messages.senderId, uid), eq(messages.receiverId, uid)))
      .orderBy(asc(messages.timestamp));
    const map = await userMap();
    const allItems = await db.select().from(items);
    const itemMap = new Map(allItems.map((i) => [i.itemId, i]));
    const threads = new Map<string, any>();
    for (const m of rows) {
      const otherId = m.senderId === uid ? m.receiverId : m.senderId;
      const item = itemMap.get(m.itemId);
      threads.set(`${m.itemId}_${otherId}`, {
        item_id: m.itemId,
        item_title: item ? item.title : "Item",
        item_price: item ? item.price : 0,
        other_user_id: otherId,
        other_user_name: map.get(otherId)?.name || "Student",
        last_message: m.messageText,
        last_timestamp: m.timestamp,
      });
    }
    return json(
      [...threads.values()].sort(
        (a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime()
      )
    );
  }

  // ---------- ADMIN ----------
  if (parts[0] === "admin" && parts[1] === "orders") {
    if (q.get("password") !== ADMIN_PASSWORD) return json({ error: "Unauthorized" }, 401);

    if (parts.length === 2 && method === "GET") return json(await getOrders());

    if (parts.length === 4 && method === "POST" && (parts[3] === "fulfill" || parts[3] === "pay")) {
      const updated = await updateOrderStatus(Number(parts[2]), "Completed");
      if (!updated) return json({ error: "Order not found" }, 404);
      return json({ success: true, order: updated });
    }
  }

  return json({ error: "Not found" }, 404);
}

export default async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error("API error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
