/**
 * db.js — MitShop data access layer
 * Storage: JSON flat-file for local development.
 * All function signatures are storage-agnostic so the implementation can be
 * swapped for Postgres (pg) in production without touching route handlers.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

// ─── Seed data ───────────────────────────────────────────────────────────────
const SEED = {
  users: [
    {
      user_id:    1,
      google_sub: null,
      name:       'Karan',
      email:      'karan@campus.edu',
      picture:    '',
      hostel_room:'H2 · Room 316',
      phone:      null,
      is_admin:   false,
      is_blocked: false,
      created_at: new Date('2026-10-01T10:00:00Z').toISOString(),
      last_login: null
    },
    {
      user_id:    2,
      google_sub: null,
      name:       'Neha',
      email:      'neha@campus.edu',
      picture:    '',
      hostel_room:'H7 · Room 505',
      phone:      null,
      is_admin:   false,
      is_blocked: false,
      created_at: new Date('2026-10-02T11:00:00Z').toISOString(),
      last_login: null
    },
    {
      user_id:    3,
      google_sub: null,
      name:       'Rahul',
      email:      'rahul@campus.edu',
      picture:    '',
      hostel_room:'H4 · Room 210',
      phone:      null,
      is_admin:   false,
      is_blocked: false,
      created_at: new Date('2026-10-03T12:00:00Z').toISOString(),
      last_login: null
    }
  ],
  items: [
    {
      item_id:    1,
      seller_id:  1,
      title:      'Data Structures in C',
      category:   'Books',
      price:      180,
      condition:  'Good',
      hostel_room:'H2 · Room 316',
      details:    '3rd Edition by Reema Thareja. Useful for 2nd year CS. Clean pages with highlighted key topics.',
      status:     'Available',
      image_type: 'book',
      image_url:  '',
      created_at: new Date('2026-10-05T09:00:00Z').toISOString()
    },
    {
      item_id:    2,
      seller_id:  1,
      title:      'Wired earphones',
      category:   'Electronics',
      price:      120,
      condition:  'Like new',
      hostel_room:'H2 · Room 316',
      details:    'Boat Bassheads 3.5mm jack with microphone. Crisp sound, only used twice.',
      status:     'Available',
      image_type: 'calculator',
      image_url:  '',
      created_at: new Date('2026-10-06T10:30:00Z').toISOString()
    },
    {
      item_id:    3,
      seller_id:  2,
      title:      'Bucket and mug set',
      category:   'Hostel Essentials',
      price:      60,
      condition:  'Good',
      hostel_room:'H7 · Room 505',
      details:    'Heavy-duty 20L blue bucket and matching 1L mug. Clean and ready for hostel use.',
      status:     'Available',
      image_type: 'bucket',
      image_url:  '',
      created_at: new Date('2026-10-07T14:15:00Z').toISOString()
    },
    {
      item_id:    4,
      seller_id:  3,
      title:      'Engineering Drafter kit',
      category:   'Stationery',
      price:      150,
      condition:  'Good',
      hostel_room:'H4 · Room 210',
      details:    'Omega mini drafter with clamp, scale, and drawing sheet protective carrying tube.',
      status:     'Available',
      image_type: 'drafter',
      image_url:  '',
      created_at: new Date('2026-10-08T08:45:00Z').toISOString()
    },
    {
      item_id:    5,
      seller_id:  3,
      title:      'Electric Kettle (1.2L)',
      category:   'Hostel Essentials',
      price:      320,
      condition:  'Like new',
      hostel_room:'H4 · Room 210',
      details:    'Stainless steel instant heating kettle with auto cut-off. Great for midnight coffee and noodles.',
      status:     'Available',
      image_type: 'kettle',
      image_url:  '',
      created_at: new Date('2026-10-08T15:20:00Z').toISOString()
    },
    {
      item_id:    6,
      seller_id:  2,
      title:      'White Lab Coat (M)',
      category:   'Stationery',
      price:      130,
      condition:  'Good',
      hostel_room:'H7 · Room 505',
      details:    'Medium size pure cotton lab coat. Cleaned and pressed, required for chemistry/biology labs.',
      status:     'Available',
      image_type: 'labcoat',
      image_url:  '/images/labcoat.png',
      created_at: new Date('2026-10-09T08:10:00Z').toISOString()
    }
  ],
  orders: [
    {
      order_id:        1,
      buyer_id:        2,
      seller_id:       1,
      item_id:         1,
      item_title:      'Data Structures in C',
      quantity:        1,
      total:           180,
      pickup_location: 'Hostel Gate 2 (Boys)',
      hostel_room:     'H7 · Room 505',
      payment_method:  'Cash',
      status:          'Pending',
      created_at:      new Date('2026-10-09T10:00:00Z').toISOString()
    }
  ],
  messages: [
    {
      message_id:   1,
      item_id:      1,
      sender_id:    2,
      receiver_id:  1,
      message_text: 'Hi, is the Data Structures in C still available?',
      timestamp:    new Date('2026-10-09T09:15:00Z').toISOString(),
      read_at:      null
    },
    {
      message_id:   2,
      item_id:      1,
      sender_id:    1,
      receiver_id:  2,
      message_text: 'Yes, it is still available. Can we meet at the hostel gate?',
      timestamp:    new Date('2026-10-09T09:16:30Z').toISOString(),
      read_at:      null
    },
    {
      message_id:   3,
      item_id:      1,
      sender_id:    2,
      receiver_id:  1,
      message_text: 'What is the edition of this book',
      timestamp:    new Date('2026-10-09T09:18:00Z').toISOString(),
      read_at:      null
    },
    {
      message_id:   4,
      item_id:      1,
      sender_id:    1,
      receiver_id:  2,
      message_text: 'It is the 3rd edition by Reema Thareja! No missing pages, very clean.',
      timestamp:    new Date('2026-10-09T09:19:15Z').toISOString(),
      read_at:      null
    }
  ],
  wishlist: [],   // { user_id, item_id }
  counters: {
    user_id:    4,
    item_id:    7,
    order_id:   2,
    message_id: 5
  }
};

// ─── I/O helpers ─────────────────────────────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    writeDB(SEED);
    return JSON.parse(JSON.stringify(SEED));
  }
  try {
    const raw    = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.users || !parsed.items) {
      writeDB(SEED);
      return JSON.parse(JSON.stringify(SEED));
    }
    // Back-fill new fields on existing user records
    parsed.users = parsed.users.map(u => ({
      google_sub: null,
      picture:    '',
      phone:      null,
      is_admin:   false,
      is_blocked: false,
      last_login: null,
      ...u
    }));
    if (!parsed.wishlist)  parsed.wishlist  = [];
    if (!parsed.messages)  parsed.messages  = [];
    parsed.messages = parsed.messages.map(m => ({ read_at: null, ...m }));
    return parsed;
  } catch (err) {
    console.error('DB read error — re-seeding:', err.message);
    writeDB(SEED);
    return JSON.parse(JSON.stringify(SEED));
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('DB write error:', err.message);
  }
}

// ─── USERS ───────────────────────────────────────────────────────────────────

/**
 * Upsert by Google sub.  Creates a new row on first login; updates name,
 * picture and last_login on subsequent logins.  Never overwrites hostel_room
 * or phone once the user has set them.
 */
function upsertUserBySub({ google_sub, email, name, picture }) {
  const store = readDB();
  const now   = new Date().toISOString();

  const existing = store.users.find(u => u.google_sub === google_sub);
  if (existing) {
    existing.name       = name || existing.name;
    existing.picture    = picture || existing.picture;
    existing.last_login = now;
    writeDB(store);
    return existing;
  }

  // First time: check by email too (in case legacy seed user exists)
  const byEmail = store.users.find(
    u => u.email.toLowerCase() === email.toLowerCase()
  );
  if (byEmail) {
    byEmail.google_sub  = google_sub;
    byEmail.picture     = picture || byEmail.picture;
    byEmail.last_login  = now;
    writeDB(store);
    return byEmail;
  }

  const newUser = {
    user_id:    store.counters.user_id++,
    google_sub,
    name:       name || email.split('@')[0],
    email,
    picture:    picture || '',
    hostel_room:'',
    phone:      null,
    is_admin:   false,
    is_blocked: false,
    created_at: now,
    last_login: now
  };
  store.users.push(newUser);
  writeDB(store);
  return newUser;
}

function getUserById(id) {
  return readDB().users.find(u => u.user_id === Number(id)) || null;
}

function getUserByEmail(email) {
  return readDB().users.find(
    u => u.email.toLowerCase() === email.toLowerCase()
  ) || null;
}

function getUsers() {
  return readDB().users;
}

/**
 * Allow user to update hostel_room and phone only.
 */
function updateUserProfile(userId, { hostel_room, phone }) {
  const store = readDB();
  const user  = store.users.find(u => u.user_id === Number(userId));
  if (!user) return null;
  if (hostel_room !== undefined) user.hostel_room = hostel_room;
  if (phone !== undefined)       user.phone       = phone;
  writeDB(store);
  return user;
}

// Keep for legacy compatibility during transition
function createUser({ name, email, hostel_room }) {
  const store = readDB();
  const existing = store.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) return existing;
  const now     = new Date().toISOString();
  const newUser = {
    user_id:    store.counters.user_id++,
    google_sub: null,
    name,
    email,
    picture:    '',
    hostel_room: hostel_room || 'Campus Hostel',
    phone:      null,
    is_admin:   false,
    is_blocked: false,
    created_at: now,
    last_login: null
  };
  store.users.push(newUser);
  writeDB(store);
  return newUser;
}

// ─── ITEMS ───────────────────────────────────────────────────────────────────

const VALID_CATEGORIES  = ['Books', 'Electronics', 'Hostel Essentials', 'Stationery', 'Other'];
const VALID_CONDITIONS  = ['Good', 'Like new', 'Brand new', 'Fair'];
const VALID_IMAGE_TYPES = ['book', 'calculator', 'bucket', 'drafter', 'kettle', 'labcoat', 'default'];

function _itemOut(item, store) {
  const seller = store.users.find(u => u.user_id === item.seller_id);
  return {
    ...item,
    seller_name:  seller ? seller.name  : 'Student',
    seller_email: seller ? seller.email : '',
    seller_hostel: seller ? seller.hostel_room : item.hostel_room
  };
}

function getItems(filters = {}) {
  const store = readDB();
  let list = store.items
    .filter(i => i.status !== 'Removed')
    .map(i => _itemOut(i, store));

  if (filters.category && filters.category !== 'All') {
    list = list.filter(i => i.category.toLowerCase() === filters.category.toLowerCase());
  }
  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.details.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.hostel_room && i.hostel_room.toLowerCase().includes(q))
    );
  }
  if (filters.status) {
    list = list.filter(i => i.status.toLowerCase() === filters.status.toLowerCase());
  } else {
    // By default only show Available items in the buy feed
    list = list.filter(i => i.status === 'Available');
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getItemById(id) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item) return null;
  return _itemOut(item, store);
}

function createItem({ seller_id, title, category, price, condition, hostel_room, details, image_url, image_type }) {
  const store  = readDB();
  const seller = store.users.find(u => u.user_id === Number(seller_id));
  const now    = new Date().toISOString();
  const newItem = {
    item_id:    store.counters.item_id++,
    seller_id:  Number(seller_id),
    title:      String(title).slice(0, 120),
    category:   VALID_CATEGORIES.includes(category) ? category : 'Other',
    price:      Math.max(0, Math.round(Number(price))) || 0,
    condition:  VALID_CONDITIONS.includes(condition) ? condition : 'Good',
    hostel_room: hostel_room || (seller ? seller.hostel_room : 'Hostel Gate'),
    details:    String(details || '').slice(0, 1000),
    status:     'Available',
    image_type: VALID_IMAGE_TYPES.includes(image_type) ? image_type : 'default',
    image_url:  image_url || '',
    created_at: now
  };
  store.items.unshift(newItem);
  writeDB(store);
  return _itemOut(newItem, store);
}

function updateItemStatus(id, status) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item) return null;
  item.status = status;
  writeDB(store);
  return item;
}

function updateItem(id, sellerId, fields) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item || item.seller_id !== Number(sellerId)) return null;
  const { title, category, price, condition, details, image_type } = fields;
  if (title)      item.title     = String(title).slice(0, 120);
  if (category && VALID_CATEGORIES.includes(category))  item.category  = category;
  if (price  !== undefined) item.price    = Math.max(0, Math.round(Number(price))) || 0;
  if (condition && VALID_CONDITIONS.includes(condition)) item.condition = condition;
  if (details !== undefined) item.details = String(details).slice(0, 1000);
  if (image_type && VALID_IMAGE_TYPES.includes(image_type)) item.image_type = image_type;
  writeDB(store);
  return _itemOut(item, store);
}

function deleteItem(id, sellerId) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(id));
  if (!item || item.seller_id !== Number(sellerId)) return false;
  item.status = 'Removed';
  writeDB(store);
  return true;
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────

const VALID_PICKUP_LOCATIONS = [
  'Hostel Gate 2 (Boys)',
  'Hostel Gate 1 (Main Entrance)',
  'Hostel Gate 7 (Girls Block)',
  'College Cafeteria Gate'
];
const VALID_PAYMENT_METHODS  = ['Cash', 'UPI'];

function _orderOut(order, store) {
  const buyer  = store.users.find(u => u.user_id === order.buyer_id);
  const seller = store.users.find(u => u.user_id === order.seller_id);
  const item   = store.items.find(i => i.item_id === order.item_id);
  return {
    ...order,
    buyer_name:     buyer  ? buyer.name  : 'Student',
    seller_name:    seller ? seller.name : 'Student',
    item_condition: item   ? item.condition : 'Good'
  };
}

function createOrder({ buyer_id, items: cartItems, pickup_location, payment_method, hostel_room }) {
  const store    = readDB();
  const buyer    = store.users.find(u => u.user_id === Number(buyer_id));
  const now      = new Date().toISOString();
  const created  = [];

  for (const entry of cartItems) {
    const targetItem = store.items.find(i => i.item_id === Number(entry.item_id));
    if (!targetItem || targetItem.status !== 'Available') continue;

    const quantity = Math.min(Math.max(1, Math.round(Number(entry.quantity) || 1)), 10);
    const lineTotal = targetItem.price * quantity;

    const newOrder = {
      order_id:        store.counters.order_id++,
      buyer_id:        Number(buyer_id),
      seller_id:       targetItem.seller_id,
      item_id:         targetItem.item_id,
      item_title:      targetItem.title,
      quantity,
      total:           lineTotal,
      pickup_location: VALID_PICKUP_LOCATIONS.includes(pickup_location)
                         ? pickup_location
                         : 'Hostel Gate 2 (Boys)',
      hostel_room:     hostel_room || (buyer ? buyer.hostel_room : ''),
      payment_method:  VALID_PAYMENT_METHODS.includes(payment_method) ? payment_method : 'Cash',
      status:          'Pending',
      created_at:      now
    };
    store.orders.unshift(newOrder);
    targetItem.status = 'Reserved';
    created.push(_orderOut(newOrder, store));
  }

  writeDB(store);
  return created.length === 1 ? created[0] : created;
}

function getOrders(userId = null) {
  const store = readDB();
  let list    = store.orders.map(o => _orderOut(o, store));
  if (userId) {
    const uid = Number(userId);
    list = list.filter(o => o.buyer_id === uid || o.seller_id === uid);
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getOrderById(orderId) {
  const store = readDB();
  const order = store.orders.find(o => o.order_id === Number(orderId));
  if (!order) return null;
  return _orderOut(order, store);
}

/**
 * State machine enforcement:
 *   seller  → Completed  (from Pending)
 *   buyer   → Cancelled  (from Pending)
 */
function updateOrderStatus(orderId, status, requestingUserId) {
  const store = readDB();
  const order = store.orders.find(o => o.order_id === Number(orderId));
  if (!order || order.status !== 'Pending') return null;

  const uid = Number(requestingUserId);
  if (status === 'Completed' && order.seller_id !== uid) return null;
  if (status === 'Cancelled' && order.buyer_id  !== uid) return null;
  if (!['Completed', 'Cancelled'].includes(status))       return null;

  order.status = status;
  const targetItem = store.items.find(i => i.item_id === order.item_id);
  if (targetItem) {
    targetItem.status = status === 'Completed' ? 'Sold' : 'Available';
  }
  writeDB(store);
  return _orderOut(order, store);
}

// ─── MESSAGES / CHAT ─────────────────────────────────────────────────────────

const MAX_MSG_LENGTH = 1000;

function _msgOut(msg, store) {
  const sender   = store.users.find(u => u.user_id === msg.sender_id);
  const receiver = store.users.find(u => u.user_id === msg.receiver_id);
  return {
    ...msg,
    sender_name:   sender   ? sender.name   : 'Student',
    receiver_name: receiver ? receiver.name : 'Student'
  };
}

function getMessages(itemId, userId1, userId2) {
  const store = readDB();
  let msgs    = store.messages.filter(m => m.item_id === Number(itemId));

  if (userId1 && userId2) {
    const u1 = Number(userId1);
    const u2 = Number(userId2);
    msgs = msgs.filter(m =>
      (m.sender_id === u1 && m.receiver_id === u2) ||
      (m.sender_id === u2 && m.receiver_id === u1)
    );
  }

  return msgs
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(m => _msgOut(m, store));
}

function createMessage({ item_id, sender_id, receiver_id, message_text }) {
  const store = readDB();
  const item  = store.items.find(i => i.item_id === Number(item_id));

  // Derive receiver from item if not supplied
  let finalReceiver = Number(receiver_id);
  if (!finalReceiver && item) {
    finalReceiver = (Number(sender_id) === item.seller_id) ? 2 : item.seller_id;
  }

  const now = new Date().toISOString();
  const msg = {
    message_id:   store.counters.message_id++,
    item_id:      Number(item_id),
    sender_id:    Number(sender_id),
    receiver_id:  finalReceiver,
    message_text: String(message_text).trim().slice(0, MAX_MSG_LENGTH),
    timestamp:    now,
    read_at:      null
  };
  store.messages.push(msg);
  writeDB(store);
  return _msgOut(msg, store);
}

function markMessagesRead(itemId, readerId) {
  const store = readDB();
  let changed = false;
  const now   = new Date().toISOString();
  store.messages.forEach(m => {
    if (m.item_id === Number(itemId) && m.receiver_id === Number(readerId) && !m.read_at) {
      m.read_at = now;
      changed = true;
    }
  });
  if (changed) writeDB(store);
}

function countUnread(userId) {
  const store = readDB();
  return store.messages.filter(
    m => m.receiver_id === Number(userId) && !m.read_at
  ).length;
}

function getChatThreads(userId) {
  const store    = readDB();
  const uid      = Number(userId);
  const threadMap = new Map();

  store.messages.forEach(m => {
    if (m.sender_id !== uid && m.receiver_id !== uid) return;
    const otherId = m.sender_id === uid ? m.receiver_id : m.sender_id;
    const key     = `${m.item_id}_${otherId}`;
    const item    = store.items.find(i => i.item_id === m.item_id);
    const other   = store.users.find(u => u.user_id === otherId);

    threadMap.set(key, {
      item_id:         m.item_id,
      item_title:      item  ? item.title : 'Item',
      item_price:      item  ? item.price : 0,
      other_user_id:   otherId,
      other_user_name: other ? other.name : 'Student',
      last_message:    m.message_text,
      last_timestamp:  m.timestamp,
      unread_count:    store.messages.filter(
        x => x.item_id === m.item_id &&
             x.sender_id === otherId &&
             x.receiver_id === uid &&
             !x.read_at
      ).length
    });
  });

  return Array.from(threadMap.values())
    .sort((a, b) => new Date(b.last_timestamp) - new Date(a.last_timestamp));
}

// ─── WISHLIST ─────────────────────────────────────────────────────────────────

function getWishlist(userId) {
  const store = readDB();
  const uid   = Number(userId);
  const ids   = store.wishlist
    .filter(w => w.user_id === uid)
    .map(w => w.item_id);
  return store.items
    .filter(i => ids.includes(i.item_id) && i.status === 'Available')
    .map(i => _itemOut(i, store));
}

function addToWishlist(userId, itemId) {
  const store = readDB();
  const uid   = Number(userId);
  const iid   = Number(itemId);
  if (!store.wishlist.find(w => w.user_id === uid && w.item_id === iid)) {
    store.wishlist.push({ user_id: uid, item_id: iid });
    writeDB(store);
  }
}

function removeFromWishlist(userId, itemId) {
  const store = readDB();
  const uid   = Number(userId);
  const iid   = Number(itemId);
  store.wishlist = store.wishlist.filter(
    w => !(w.user_id === uid && w.item_id === iid)
  );
  writeDB(store);
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  // Users
  upsertUserBySub,
  getUserById,
  getUserByEmail,
  getUsers,
  createUser,
  updateUserProfile,
  // Items
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  updateItemStatus,
  // Orders
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  // Chat / Messages
  getMessages,
  createMessage,
  markMessagesRead,
  countUnread,
  getChatThreads,
  // Wishlist
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  // Exposed for tests
  VALID_CATEGORIES,
  VALID_CONDITIONS,
  VALID_PICKUP_LOCATIONS,
  VALID_PAYMENT_METHODS
};
