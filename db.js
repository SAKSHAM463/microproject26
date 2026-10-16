const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data.json');

// Initial seed data representing campus marketplace
const initialData = {
  users: [
    {
      user_id: 1,
      name: 'Karan',
      email: 'karan@campus.edu',
      hostel_room: 'H2 · Room 316',
      created_at: new Date('2026-10-01T10:00:00Z').toISOString()
    },
    {
      user_id: 2,
      name: 'Neha',
      email: 'neha@campus.edu',
      hostel_room: 'H7 · Room 505',
      created_at: new Date('2026-10-02T11:00:00Z').toISOString()
    },
    {
      user_id: 3,
      name: 'Rahul',
      email: 'rahul@campus.edu',
      hostel_room: 'H4 · Room 210',
      created_at: new Date('2026-10-03T12:00:00Z').toISOString()
    }
  ],
  items: [
    {
      item_id: 1,
      seller_id: 1,
      title: 'Data Structures in C',
      category: 'Books',
      price: 180,
      condition: 'Good',
      hostel_room: 'H2 · Room 316',
      details: '3rd Edition by Reema Thareja. Useful for 2nd year CS. Clean pages with highlighted key topics.',
      status: 'Available',
      image_type: 'book',
      image_url: '',
      created_at: new Date('2026-10-05T09:00:00Z').toISOString()
    },
    {
      item_id: 2,
      seller_id: 1,
      title: 'Wired earphones',
      category: 'Electronics',
      price: 120,
      condition: 'Like new',
      hostel_room: 'H2 · Room 316',
      details: 'Boat Bassheads 3.5mm jack with microphone. Crisp sound, only used twice.',
      status: 'Available',
      image_type: 'calculator',
      image_url: '',
      created_at: new Date('2026-10-06T10:30:00Z').toISOString()
    },
    {
      item_id: 3,
      seller_id: 2,
      title: 'Bucket and mug set',
      category: 'Hostel Essentials',
      price: 60,
      condition: 'Good',
      hostel_room: 'H7 · Room 505',
      details: 'Heavy-duty 20L blue bucket and matching 1L mug. Clean and ready for hostel use.',
      status: 'Available',
      image_type: 'bucket',
      image_url: '',
      created_at: new Date('2026-10-07T14:15:00Z').toISOString()
    },
    {
      item_id: 4,
      seller_id: 3,
      title: 'Engineering Drafter kit',
      category: 'Stationery',
      price: 150,
      condition: 'Good',
      hostel_room: 'H4 · Room 210',
      details: 'Omega mini drafter with clamp, scale, and drawing sheet protective carrying tube.',
      status: 'Available',
      image_type: 'drafter',
      image_url: '',
      created_at: new Date('2026-10-08T08:45:00Z').toISOString()
    },
    {
      item_id: 5,
      seller_id: 3,
      title: 'Electric Kettle (1.2L)',
      category: 'Hostel Essentials',
      price: 320,
      condition: 'Like new',
      hostel_room: 'H4 · Room 210',
      details: 'Stainless steel instant heating kettle with auto cut-off. Great for midnight coffee and noodles.',
      status: 'Available',
      image_type: 'kettle',
      image_url: '',
      created_at: new Date('2026-10-08T15:20:00Z').toISOString()
    },
    {
      item_id: 6,
      seller_id: 2,
      title: 'White Lab Coat (M)',
      category: 'Stationery',
      price: 130,
      condition: 'Good',
      hostel_room: 'H7 · Room 505',
      details: 'Medium size pure cotton lab coat. Cleaned and pressed, required for chemistry/biology labs.',
      status: 'Available',
      image_type: 'labcoat',
      image_url: '/images/labcoat.png',
      created_at: new Date('2026-10-09T08:10:00Z').toISOString()
    }
  ],
  orders: [
    {
      order_id: 1,
      buyer_id: 2,
      seller_id: 1,
      item_id: 1,
      item_title: 'Data Structures in C',
      quantity: 1,
      total: 180,
      pickup_location: 'Hostel Gate 2',
      hostel_room: 'H7 · Room 505',
      payment_method: 'Cash',
      status: 'Pending',
      created_at: new Date('2026-10-09T10:00:00Z').toISOString()
    }
  ],
  messages: [
    {
      message_id: 1,
      item_id: 1,
      sender_id: 2, // Neha
      receiver_id: 1, // Karan
      message_text: 'Hi, is the Data Structures in C still available?',
      timestamp: new Date('2026-10-09T09:15:00Z').toISOString()
    },
    {
      message_id: 2,
      item_id: 1,
      sender_id: 1, // Karan
      receiver_id: 2, // Neha
      message_text: 'Yes, it is still available. Can we meet at the hostel gate?',
      timestamp: new Date('2026-10-09T09:16:30Z').toISOString()
    },
    {
      message_id: 3,
      item_id: 1,
      sender_id: 2, // Neha
      receiver_id: 1, // Karan
      message_text: 'What is the edition of this book',
      timestamp: new Date('2026-10-09T09:18:00Z').toISOString()
    },
    {
      message_id: 4,
      item_id: 1,
      sender_id: 1, // Karan
      receiver_id: 2, // Neha
      message_text: 'It is the 3rd edition by Reema Thareja! No missing pages, very clean.',
      timestamp: new Date('2026-10-09T09:19:15Z').toISOString()
    }
  ],
  counters: {
    user_id: 4,
    item_id: 7,
    order_id: 2,
    message_id: 5
  }
};

function readDB() {
  if (!fs.existsSync(dbPath)) {
    writeDB(initialData);
    return initialData;
  }
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.users || !parsed.items) {
      writeDB(initialData);
      return initialData;
    }
    return parsed;
  } catch (err) {
    console.error('Error reading DB, re-initializing seed data:', err);
    writeDB(initialData);
    return initialData;
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to DB:', err);
  }
}

// ==================== USERS ====================
function getUsers() {
  return readDB().users;
}

function getUserById(id) {
  const users = getUsers();
  return users.find(u => u.user_id === Number(id)) || null;
}

function getUserByEmail(email) {
  const users = getUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function createUser({ name, email, hostel_room }) {
  const db = readDB();
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return existing;
  }
  const newUser = {
    user_id: db.counters.user_id++,
    name,
    email,
    hostel_room: hostel_room || 'Campus Hostel',
    created_at: new Date().toISOString()
  };
  db.users.push(newUser);
  writeDB(db);
  return newUser;
}

// ==================== ITEMS ====================
function getItems(filters = {}) {
  const db = readDB();
  let list = db.items.map(item => {
    const seller = db.users.find(u => u.user_id === item.seller_id);
    return {
      ...item,
      seller_name: seller ? seller.name : 'Student',
      seller_email: seller ? seller.email : ''
    };
  });

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
  }

  // Newest items first
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getItemById(id) {
  const db = readDB();
  const item = db.items.find(i => i.item_id === Number(id));
  if (!item) return null;
  const seller = db.users.find(u => u.user_id === item.seller_id);
  return {
    ...item,
    seller_name: seller ? seller.name : 'Student',
    seller_email: seller ? seller.email : '',
    seller_hostel: seller ? seller.hostel_room : item.hostel_room
  };
}

function createItem({ seller_id, title, category, price, condition, hostel_room, details, image_url, image_type }) {
  const db = readDB();
  const seller = db.users.find(u => u.user_id === Number(seller_id));
  const newItem = {
    item_id: db.counters.item_id++,
    seller_id: Number(seller_id),
    title,
    category: category || 'Other',
    price: Number(price) || 0,
    condition: condition || 'Good',
    hostel_room: hostel_room || (seller ? seller.hostel_room : 'Hostel Gate'),
    details: details || '',
    status: 'Available',
    image_type: image_type || 'default',
    image_url: image_url || '',
    created_at: new Date().toISOString()
  };
  db.items.unshift(newItem);
  writeDB(db);
  return newItem;
}

function updateItemStatus(id, status) {
  const db = readDB();
  const item = db.items.find(i => i.item_id === Number(id));
  if (item) {
    item.status = status;
    writeDB(db);
    return item;
  }
  return null;
}

// ==================== ORDERS ====================
function createOrder({ buyer_id, item_id, items, pickup_location, payment_method, total, hostel_room }) {
  const db = readDB();
  const buyer = db.users.find(u => u.user_id === Number(buyer_id));

  // If a list of cart items is passed
  const orderList = Array.isArray(items) && items.length > 0 ? items : [{
    item_id: Number(item_id),
    quantity: 1,
    price: total
  }];

  const createdOrders = [];

  orderList.forEach(entry => {
    const targetItem = db.items.find(i => i.item_id === Number(entry.item_id));
    const newOrder = {
      order_id: db.counters.order_id++,
      buyer_id: Number(buyer_id),
      seller_id: targetItem ? targetItem.seller_id : 1,
      item_id: Number(entry.item_id),
      item_title: targetItem ? targetItem.title : (entry.title || 'Campus Item'),
      quantity: Number(entry.quantity) || 1,
      total: Number(entry.price ? entry.price * (entry.quantity || 1) : total),
      pickup_location: pickup_location || 'Hostel Gate',
      hostel_room: hostel_room || (buyer ? buyer.hostel_room : ''),
      payment_method: payment_method || 'Cash',
      status: 'Pending',
      created_at: new Date().toISOString()
    };
    db.orders.unshift(newOrder);
    createdOrders.push(newOrder);

    // If single item, mark item as Pending or Sold if wanted
    if (targetItem) {
      targetItem.status = 'Pending';
    }
  });

  writeDB(db);
  return createdOrders.length === 1 ? createdOrders[0] : createdOrders;
}

function getOrders(userId = null) {
  const db = readDB();
  let orders = db.orders.map(order => {
    const buyer = db.users.find(u => u.user_id === order.buyer_id);
    const seller = db.users.find(u => u.user_id === order.seller_id);
    const item = db.items.find(i => i.item_id === order.item_id);
    return {
      ...order,
      buyer_name: buyer ? buyer.name : 'Student',
      seller_name: seller ? seller.name : 'Student',
      item_condition: item ? item.condition : 'Good'
    };
  });

  if (userId) {
    const uid = Number(userId);
    orders = orders.filter(o => o.buyer_id === uid || o.seller_id === uid);
  }

  return orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function updateOrderStatus(orderId, status) {
  const db = readDB();
  const order = db.orders.find(o => o.order_id === Number(orderId));
  if (order) {
    order.status = status;
    const item = db.items.find(i => i.item_id === order.item_id);
    if (item && status === 'Completed') {
      item.status = 'Sold';
    } else if (item && status === 'Cancelled') {
      item.status = 'Available';
    }
    writeDB(db);
    return order;
  }
  return null;
}

// ==================== MESSAGES / CHAT ====================
function getMessages(itemId, userId1 = null, userId2 = null) {
  const db = readDB();
  let msgs = db.messages.filter(m => m.item_id === Number(itemId));

  if (userId1 && userId2) {
    const u1 = Number(userId1);
    const u2 = Number(userId2);
    msgs = msgs.filter(m =>
      (m.sender_id === u1 && m.receiver_id === u2) ||
      (m.sender_id === u2 && m.receiver_id === u1)
    );
  }

  const enriched = msgs.map(m => {
    const sender = db.users.find(u => u.user_id === m.sender_id);
    const receiver = db.users.find(u => u.user_id === m.receiver_id);
    return {
      ...m,
      sender_name: sender ? sender.name : 'Student',
      receiver_name: receiver ? receiver.name : 'Student'
    };
  });

  return enriched.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function createMessage({ item_id, sender_id, receiver_id, message_text }) {
  const db = readDB();
  const item = db.items.find(i => i.item_id === Number(item_id));

  let finalReceiver = receiver_id;
  if (!finalReceiver && item) {
    finalReceiver = (Number(sender_id) === item.seller_id) ? 2 : item.seller_id;
  }

  const newMsg = {
    message_id: db.counters.message_id++,
    item_id: Number(item_id),
    sender_id: Number(sender_id),
    receiver_id: Number(finalReceiver),
    message_text: message_text.trim(),
    timestamp: new Date().toISOString()
  };

  db.messages.push(newMsg);
  writeDB(db);

  const sender = db.users.find(u => u.user_id === newMsg.sender_id);
  const receiver = db.users.find(u => u.user_id === newMsg.receiver_id);

  return {
    ...newMsg,
    sender_name: sender ? sender.name : 'Student',
    receiver_name: receiver ? receiver.name : 'Student'
  };
}

function getChatThreads(userId) {
  const db = readDB();
  const uid = Number(userId);
  const threadsMap = new Map();

  db.messages.forEach(m => {
    if (m.sender_id === uid || m.receiver_id === uid) {
      const otherId = m.sender_id === uid ? m.receiver_id : m.sender_id;
      const key = `${m.item_id}_${otherId}`;
      const item = db.items.find(i => i.item_id === m.item_id);
      const otherUser = db.users.find(u => u.user_id === otherId);

      threadsMap.set(key, {
        item_id: m.item_id,
        item_title: item ? item.title : 'Item',
        item_price: item ? item.price : 0,
        other_user_id: otherId,
        other_user_name: otherUser ? otherUser.name : 'Student',
        last_message: m.message_text,
        last_timestamp: m.timestamp
      });
    }
  });

  return Array.from(threadsMap.values()).sort(
    (a, b) => new Date(b.last_timestamp) - new Date(a.last_timestamp)
  );
}

module.exports = {
  getUsers,
  getUserById,
  getUserByEmail,
  createUser,
  getItems,
  getItemById,
  createItem,
  updateItemStatus,
  createOrder,
  getOrders,
  updateOrderStatus,
  getMessages,
  createMessage,
  getChatThreads
};
