require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const Razorpay = require('razorpay');
const db = require('./db');

const app = express();
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname)
});

const fileFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword', 'image/jpeg', 'image/png', 'image/jpg'];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { name, phone, room, location, items, total, payment_method } = req.body;
    if (payment_method === 'upi') {
      const order = await razorpay.orders.create({
        amount: Math.round(total * 100), currency: 'INR', receipt: `receipt_${Date.now()}`
      });
      const result = db.createOrder({
        name, phone, room, location, items: typeof items === 'string' ? items : JSON.stringify(items),
        total, payment_method, razorpay_order_id: order.id
      });
      res.json({ orderId: result.lastInsertRowid, razorpayOrderId: order.id, razorpayKeyId: process.env.RAZORPAY_KEY_ID });
    } else {
      const result = db.createOrder({
        name, phone, room, location, items: typeof items === 'string' ? items : JSON.stringify(items),
        total, payment_method, razorpay_order_id: null
      });
      res.json({ orderId: result.lastInsertRowid, status: 'confirmed' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify Razorpay payment
app.post('/api/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
  if (expected === razorpay_signature) {
    db.updatePaymentStatus(razorpay_order_id, 'paid', razorpay_payment_id);
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Invalid signature' });
  }
});

// File upload for printouts
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid type' });
  res.json({ filename: req.file.filename, originalname: req.file.originalname, path: req.file.path });
});

// Get order by ID
app.get('/api/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  order ? res.json(order) : res.status(404).json({ error: 'Order not found' });
});

// Admin auth middleware
const adminAuth = (req, res, next) => {
  req.query.password === process.env.ADMIN_PASSWORD ? next() : res.status(401).json({ error: 'Unauthorized' });
};

// Admin: get all orders
app.get('/api/admin/orders', adminAuth, (req, res) => res.json(db.getAllOrders()));

// Admin: fulfill order
app.post('/api/admin/orders/:id/fulfill', adminAuth, (req, res) => {
  db.fulfillOrder(req.params.id);
  res.json({ success: true });
});

// Serve uploaded files to admin
app.use('/uploads', express.static(uploadDir));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MitShop server running on http://localhost:${PORT}`));
