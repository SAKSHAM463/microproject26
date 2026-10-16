require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Multer storage for item photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, 'item-' + unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ==================== AUTH API ====================
// Register new student with campus email
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, hostel_room } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    const user = db.createUser({ name, email, hostel_room });
    res.status(201).json({
      success: true,
      user,
      token: 'jwt-token-campus-' + user.user_id
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login student
app.post('/api/auth/login', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Campus email is required' });
    }
    let user = db.getUserByEmail(email);
    if (!user) {
      // Auto-register convenience for testing
      const defaultName = email.split('@')[0];
      user = db.createUser({
        name: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
        email,
        hostel_room: 'Campus Hostel'
      });
    }
    res.json({
      success: true,
      user,
      token: 'jwt-token-campus-' + user.user_id
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get all campus users for quick demo profile switcher
app.get('/api/auth/users', (req, res) => {
  try {
    res.json(db.getUsers());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// ==================== ITEMS CATALOG API ====================
// Get all items with optional filters
app.get('/api/items', (req, res) => {
  try {
    const { category, search, status } = req.query;
    const items = db.getItems({ category, search, status });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Get specific item by ID
app.get('/api/items/:id', (req, res) => {
  try {
    const item = db.getItemById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Create new item listing (supports multipart with photo upload or json)
app.post('/api/items', upload.single('photo'), (req, res) => {
  try {
    const { seller_id, title, category, price, condition, hostel_room, details, image_type } = req.body;

    if (!title || !price) {
      return res.status(400).json({ error: 'Title and price are required' });
    }

    let image_url = '';
    if (req.file) {
      image_url = '/uploads/' + req.file.filename;
    }

    const newItem = db.createItem({
      seller_id: seller_id || 1,
      title,
      category,
      price,
      condition,
      hostel_room,
      details,
      image_type: image_type || 'default',
      image_url
    });

    res.status(201).json({ success: true, item: newItem });
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update item status
app.patch('/api/items/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const updated = db.updateItemStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item status' });
  }
});

// ==================== CART & ORDERS API ====================
// Place a new purchase order
app.post('/api/orders', (req, res) => {
  try {
    const { buyer_id, item_id, items, pickup_location, payment_method, total, hostel_room } = req.body;

    const order = db.createOrder({
      buyer_id: buyer_id || 2,
      item_id,
      items,
      pickup_location: pickup_location || 'Hostel Gate',
      payment_method: payment_method || 'Cash',
      total: total || 0,
      hostel_room: hostel_room || 'H7 · Room 505'
    });

    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Fetch user orders
app.get('/api/orders', (req, res) => {
  try {
    const { userId } = req.query;
    const orders = db.getOrders(userId);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update order status (Pending -> Completed / Cancelled)
app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const updated = db.updateOrderStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ==================== ITEM-BOUND CHAT API ====================
// Retrieve chat message history for an item
app.get('/api/chat/:itemId', (req, res) => {
  try {
    const { itemId } = req.params;
    const { user1, user2 } = req.query;
    const messages = db.getMessages(itemId, user1, user2);
    const item = db.getItemById(itemId);
    res.json({ item, messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a new message regarding an item
app.post('/api/chat/:itemId', (req, res) => {
  try {
    const { itemId } = req.params;
    const { sender_id, receiver_id, message_text } = req.body;

    if (!message_text || !message_text.trim()) {
      return res.status(400).json({ error: 'Message text cannot be empty' });
    }

    const message = db.createMessage({
      item_id: itemId,
      sender_id: sender_id || 2,
      receiver_id: receiver_id || 1,
      message_text
    });

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get user chat threads
app.get('/api/chat-threads/:userId', (req, res) => {
  try {
    const threads = db.getChatThreads(req.params.userId);
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chat threads' });
  }
});

// ==================== ADMIN API ====================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// List all orders (admin)
app.get('/api/admin/orders', (req, res) => {
  try {
    const { password } = req.query;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const orders = db.getOrders(); // all orders
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin orders' });
  }
});

// Mark order as fulfilled (admin)
app.post('/api/admin/orders/:id/fulfill', (req, res) => {
  try {
    const { password } = req.query;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const updated = db.updateOrderStatus(req.params.id, 'Completed');
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fulfill order' });
  }
});

// Mark order payment as paid (admin) - simplified implementation
app.post('/api/admin/orders/:id/pay', (req, res) => {
  try {
    const { password } = req.query;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // For now, mark as completed when payment confirmed
    const updated = db.updateOrderStatus(req.params.id, 'Completed');
    if (!updated) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark order as paid' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`MitShop server running on http://localhost:${PORT}`);
});
