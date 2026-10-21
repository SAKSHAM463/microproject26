/**
 * server.js — MitShop Campus Marketplace  (Phase 1 + 2)
 * Node + Express 4, CommonJS.
 *
 * Startup guard: refuses to start without GOOGLE_CLIENT_ID, SESSION_SECRET
 * and ALLOWED_EMAIL_DOMAIN set in the environment.
 */

'use strict';

require('dotenv').config();

// ─── Startup guard ────────────────────────────────────────────────────────────
const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'SESSION_SECRET', 'ALLOWED_EMAIL_DOMAIN'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(
    '\n[MitShop] ❌  Missing required environment variables:\n  ' +
    missing.join('\n  ') +
    '\n\nCopy .env.example to .env and fill in the values. The server cannot start without them.\n'
  );
  process.exit(1);
}

const express      = require('express');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');

const { OAuth2Client } = require('google-auth-library');
const jwt             = require('jsonwebtoken');

const db = require('./db');

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT               = Number(process.env.PORT) || 3000;
const IS_PROD            = process.env.NODE_ENV === 'production';
const GOOGLE_CLIENT_ID   = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_DOMAIN     = process.env.ALLOWED_EMAIL_DOMAIN.toLowerCase();
const SESSION_SECRET     = process.env.SESSION_SECRET;
const ADMIN_EMAILS       = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
const SITE_ORIGIN        = IS_PROD
  ? 'https://mitstore.netlify.app'
  : `http://localhost:${PORT}`;
const JWT_COOKIE         = 'mitshop_token';
const JWT_EXPIRY_SECONDS = 7 * 24 * 3600; // 7 days

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

if (IS_PROD) app.set('trust proxy', 1);

// Helmet with a CSP that allows Google Identity Services
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   [
        "'self'",
        "'unsafe-inline'",   // needed for inline theme-flash script in index.html
        'https://accounts.google.com',
        'https://fonts.googleapis.com'
      ],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
      connectSrc:  ["'self'", 'https://accounts.google.com'],
      frameSrc:    ['https://accounts.google.com'],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null
    }
  }
}));

// CORS — only own origin may call the API
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === SITE_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', SITE_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Upload directory ─────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Multer — image-only with magic-byte verification ─────────────────────────
const ALLOWED_MIME  = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_MAGIC = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png':  [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46]   // RIFF....WEBP
};

function checkMagicBytes(filePath, mime) {
  try {
    const buf    = fs.readFileSync(filePath);
    const magic  = ALLOWED_MAGIC[mime];
    if (!magic) return false;
    return magic.every((byte, i) => buf[i] === byte);
  } catch {
    return false;
  }
}

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, _file, cb) => {
    const ext = _file.mimetype === 'image/jpeg' ? '.jpg'
              : _file.mimetype === 'image/png'  ? '.png' : '.webp';
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage: multerStorage,
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG and WebP images are accepted'));
  }
});

// ─── Rate limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many auth attempts — please wait 15 minutes.' },
  standardHeaders: true, legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  message: { error: 'Too many requests.' },
  standardHeaders: true, legacyHeaders: false
});

app.use('/api/auth/google',       authLimiter);
app.use('/api/items',             apiLimiter);
app.use('/api/orders',            apiLimiter);
app.use(['/api/chat', '/api/chat-threads'], apiLimiter);

// ─── JWT helpers ──────────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, SESSION_SECRET, {
    expiresIn: JWT_EXPIRY_SECONDS
  });
}

function setTokenCookie(res, token) {
  res.cookie(JWT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure:   IS_PROD,
    maxAge:   JWT_EXPIRY_SECONDS * 1000
  });
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

/**
 * requireAuth — reads the JWT cookie, loads the user, attaches req.user.
 * Rejects blocked users with 403.
 */
function requireAuth(req, res, next) {
  const token = req.cookies[JWT_COOKIE];
  if (!token) return res.status(401).json({ error: 'Sign in required.' });

  let payload;
  try {
    payload = jwt.verify(token, SESSION_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired — please sign in again.' });
  }

  const user = db.getUserById(Number(payload.sub));
  if (!user)             return res.status(401).json({ error: 'User not found.' });
  if (user.is_blocked)   return res.status(403).json({ error: 'Your account has been suspended.' });

  req.user = user;
  next();
}

/**
 * requireAdmin — must be used after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  const isAdmin =
    req.user.is_admin ||
    ADMIN_EMAILS.includes(req.user.email.toLowerCase());
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  next();
}

const ALLOWED_ORIGINS = [
  SITE_ORIGIN,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];

/**
 * checkOrigin — for state-changing requests, verify Origin header matches
 * the site origin to mitigate CSRF from other sites.
 */
function checkOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (ALLOWED_ORIGINS.includes(origin)) return next();
  if (!IS_PROD && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return next();
  return res.status(403).json({ error: 'Cross-origin request rejected.' });
}

// ─── User response shape — never expose google_sub or phone to other users ───
function publicUserShape(user) {
  return {
    user_id:    user.user_id,
    name:       user.name.split(' ')[0],  // first name only
    picture:    user.picture,
    hostel_room: user.hostel_room
  };
}

function selfUserShape(user) {
  return {
    user_id:    user.user_id,
    name:       user.name,
    email:      user.email,
    picture:    user.picture,
    hostel_room: user.hostel_room,
    phone:      user.phone,
    is_admin:   user.is_admin || ADMIN_EMAILS.includes(user.email.toLowerCase())
  };
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

// Provide only the public config the front-end needs
app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    allowedDomain: ALLOWED_DOMAIN,
    isDev: !IS_PROD
  });
});

// Development test login (active in development only)
if (!IS_PROD) {
  app.post('/api/auth/dev-login', checkOrigin, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'College email is required.' });
    const emailLower = email.toLowerCase().trim();
    if (!emailLower.endsWith('@' + ALLOWED_DOMAIN)) {
      return res.status(403).json({
        error: 'Please sign in with your college Google account.'
      });
    }
    const defaultName = emailLower.split('@')[0];
    const user = db.upsertUserBySub({
      google_sub: 'dev-' + emailLower,
      email: emailLower,
      name: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
      picture: ''
    });
    const token = signToken(user.user_id);
    setTokenCookie(res, token);
    res.json({ success: true, user: selfUserShape(user) });
  });
}

// Google Sign-In — verifies the credential token, enforces college domain
app.post('/api/auth/google', checkOrigin, async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential.' });

    // Verify with Google
    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    // Must be a verified email
    if (!payload.email_verified) {
      return res.status(403).json({ error: 'Please verify your Google email first.' });
    }

    const emailLower = payload.email.toLowerCase();

    // Domain check — only college accounts
    if (!emailLower.endsWith('@' + ALLOWED_DOMAIN)) {
      return res.status(403).json({
        error: 'Please sign in with your college Google account.'
      });
    }

    // If college uses Google Workspace, also check hd claim
    if (payload.hd && payload.hd.toLowerCase() !== ALLOWED_DOMAIN) {
      return res.status(403).json({
        error: 'Please sign in with your college Google account.'
      });
    }

    // Upsert user
    const user = db.upsertUserBySub({
      google_sub: payload.sub,
      email:      payload.email,
      name:       payload.name,
      picture:    payload.picture || ''
    });

    const token = signToken(user.user_id);
    setTokenCookie(res, token);

    res.json({ success: true, user: selfUserShape(user) });
  } catch (err) {
    // Do not leak internal error details
    console.error('[auth/google] error:', err.message);
    res.status(401).json({ error: 'Invalid or expired Google credential.' });
  }
});

// Return current user from cookie
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(selfUserShape(req.user));
});

// Logout — clear cookie
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(JWT_COOKIE, { httpOnly: true, sameSite: 'Lax', secure: IS_PROD });
  res.json({ success: true });
});

// Update own profile (hostel_room, phone)
app.patch('/api/me', requireAuth, checkOrigin, (req, res) => {
  const { hostel_room, phone } = req.body;

  if (phone !== undefined) {
    if (phone !== null && !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Phone must be a 10-digit Indian mobile number.' });
    }
  }

  const updated = db.updateUserProfile(req.user.user_id, { hostel_room, phone });
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  res.json(selfUserShape(updated));
});

// ─── ITEMS CATALOG API ────────────────────────────────────────────────────────

// GET — open to all (browsing stays open when signed out)
app.get('/api/items', (req, res) => {
  try {
    const { category, search, status } = req.query;
    const items = db.getItems({ category, search, status });
    res.json(items);
  } catch (err) {
    console.error('[GET /api/items]', err.message);
    res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

app.get('/api/items/:id', (req, res) => {
  try {
    const item = db.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item.' });
  }
});

// POST — requires auth; seller taken from session
app.post('/api/items', requireAuth, checkOrigin, upload.single('photo'), (req, res) => {
  try {
    const { title, category, price, condition, hostel_room, details, image_type } = req.body;

    if (!title || !price) {
      return res.status(400).json({ error: 'Title and price are required.' });
    }
    if (Number(price) < 0 || Number(price) > 100000) {
      return res.status(400).json({ error: 'Price must be between ₹0 and ₹1,00,000.' });
    }

    let image_url = '';
    if (req.file) {
      // Magic-byte verification
      if (!checkMagicBytes(req.file.path, req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'File content does not match an image type.' });
      }
      image_url = '/uploads/' + req.file.filename;
    }

    const newItem = db.createItem({
      seller_id:  req.user.user_id,   // ← from session, never from body
      title,
      category,
      price:      Number(price),
      condition,
      hostel_room: hostel_room || req.user.hostel_room,
      details,
      image_type: image_type || 'default',
      image_url
    });

    res.status(201).json({ success: true, item: newItem });
  } catch (err) {
    console.error('[POST /api/items]', err.message);
    res.status(500).json({ error: 'Failed to create listing.' });
  }
});

// PATCH — owner only
app.patch('/api/items/:id', requireAuth, checkOrigin, (req, res) => {
  try {
    const updated = db.updateItem(
      req.params.id,
      req.user.user_id,
      req.body
    );
    if (!updated) return res.status(404).json({ error: 'Item not found or not yours.' });
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item.' });
  }
});

// DELETE — owner only
app.delete('/api/items/:id', requireAuth, checkOrigin, (req, res) => {
  try {
    const ok = db.deleteItem(req.params.id, req.user.user_id);
    if (!ok) return res.status(404).json({ error: 'Item not found or not yours.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});

// PATCH status (admin or owner)
app.patch('/api/items/:id/status', requireAuth, checkOrigin, (req, res) => {
  try {
    const item = db.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const isAdmin = req.user.is_admin || ADMIN_EMAILS.includes(req.user.email.toLowerCase());
    if (item.seller_id !== req.user.user_id && !isAdmin) {
      return res.status(403).json({ error: 'Not your listing.' });
    }

    const updated = db.updateItemStatus(req.params.id, req.body.status);
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

// ─── ORDERS API ───────────────────────────────────────────────────────────────

// POST — requires auth; all IDs and prices from server
app.post('/api/orders', requireAuth, checkOrigin, (req, res) => {
  try {
    const { items: cartItems, pickup_location, payment_method, hostel_room } = req.body;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    // Validate each cart entry
    for (const entry of cartItems) {
      const item = db.getItemById(entry.item_id);
      if (!item) {
        return res.status(400).json({ error: `Item #${entry.item_id} not found.` });
      }
      if (item.seller_id === req.user.user_id) {
        return res.status(400).json({ error: `You cannot buy your own listing "${item.title}".` });
      }
      if (item.status !== 'Available') {
        return res.status(409).json({ error: `"${item.title}" is no longer available.` });
      }
    }

    const order = db.createOrder({
      buyer_id:        req.user.user_id,   // ← from session
      items:           cartItems,          // server reloads prices
      pickup_location,
      payment_method,
      hostel_room:     hostel_room || req.user.hostel_room
    });

    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('[POST /api/orders]', err.message);
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

// GET — only caller's orders
app.get('/api/orders', requireAuth, (req, res) => {
  try {
    const orders = db.getOrders(req.user.user_id);  // ← always caller's userId
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// GET single order — caller must be buyer or seller
app.get('/api/orders/:id', requireAuth, (req, res) => {
  try {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.buyer_id !== req.user.user_id && order.seller_id !== req.user.user_id) {
      return res.status(404).json({ error: 'Order not found.' });  // 404, not 403
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
});

// PATCH status — state-machine enforced in db.updateOrderStatus
app.patch('/api/orders/:id/status', requireAuth, checkOrigin, (req, res) => {
  try {
    const { status } = req.body;
    if (!['Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Completed or Cancelled.' });
    }
    const updated = db.updateOrderStatus(req.params.id, status, req.user.user_id);
    if (!updated) {
      return res.status(403).json({
        error: 'Cannot update this order — check that it is Pending and that you are the correct party.'
      });
    }
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

// ─── CHAT API ─────────────────────────────────────────────────────────────────

// GET messages — only buyer or seller of that listing
app.get('/api/chat/:itemId', requireAuth, (req, res) => {
  try {
    const { itemId } = req.params;
    const item = db.getItemById(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const uid = req.user.user_id;
    // Determine the other party
    const isSeller = item.seller_id === uid;
    const isBuyer  = !isSeller; // simplified — any non-seller can initiate

    const messages = db.getMessages(itemId, uid, item.seller_id === uid ? undefined : item.seller_id);

    // Mark incoming messages as read
    db.markMessagesRead(itemId, uid);

    res.json({ item, messages });
  } catch (err) {
    console.error('[GET /api/chat]', err.message);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// POST message — sender from session; receiver is the other party
app.post('/api/chat/:itemId', requireAuth, checkOrigin, (req, res) => {
  try {
    const { itemId } = req.params;
    const { message_text } = req.body;

    if (!message_text || !String(message_text).trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }
    if (String(message_text).length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters).' });
    }

    const item = db.getItemById(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const senderId   = req.user.user_id;             // ← from session
    const receiverId = (senderId === item.seller_id)
      ? null                                          // buyer not known yet; db resolves it
      : item.seller_id;

    const message = db.createMessage({
      item_id:      itemId,
      sender_id:    senderId,
      receiver_id:  receiverId,
      message_text: message_text.trim()
    });

    res.status(201).json({ success: true, message });
  } catch (err) {
    console.error('[POST /api/chat]', err.message);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// Chat threads for the signed-in user
app.get('/api/chat-threads', requireAuth, (req, res) => {
  try {
    const threads = db.getChatThreads(req.user.user_id);
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch threads.' });
  }
});

// Unread message count (for dot indicator)
app.get('/api/chat/unread', requireAuth, (req, res) => {
  try {
    res.json({ count: db.countUnread(req.user.user_id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count unread.' });
  }
});

// ─── WISHLIST API ──────────────────────────────────────────────────────────────

app.get('/api/wishlist', requireAuth, (req, res) => {
  res.json(db.getWishlist(req.user.user_id));
});

app.post('/api/wishlist/:itemId', requireAuth, checkOrigin, (req, res) => {
  db.addToWishlist(req.user.user_id, req.params.itemId);
  res.json({ success: true });
});

app.delete('/api/wishlist/:itemId', requireAuth, checkOrigin, (req, res) => {
  db.removeFromWishlist(req.user.user_id, req.params.itemId);
  res.json({ success: true });
});

// ─── ADMIN API ────────────────────────────────────────────────────────────────
// All admin routes require both requireAuth and requireAdmin

app.get('/api/admin/orders', requireAuth, requireAdmin, (_req, res) => {
  try {
    res.json(db.getOrders());   // all orders
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin orders.' });
  }
});

app.post('/api/admin/orders/:id/fulfill', requireAuth, requireAdmin, (req, res) => {
  try {
    // Admin can force-complete any order
    const store = require('./db');
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    db.updateItemStatus(order.item_id, 'Sold');
    // Directly patch status bypassing state-machine (admin override)
    const updated = db.updateOrderStatus(req.params.id, 'Completed', order.seller_id);
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fulfill order.' });
  }
});

app.post('/api/admin/orders/:id/cancel', requireAuth, requireAdmin, (req, res) => {
  try {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const updated = db.updateOrderStatus(req.params.id, 'Cancelled', order.buyer_id);
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel order.' });
  }
});

// ─── Error handler ─────────────────────────────────────────────────────────────
// Must be last middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large — maximum 5 MB.' });
  }
  if (err.message && err.message.includes('Only JPEG')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[server error]', err.message);
  // Never expose stack traces in production
  res.status(500).json({ error: IS_PROD ? 'Internal server error.' : err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nMitShop server running on http://localhost:${PORT}`);
    console.log(`  Domain:  ${ALLOWED_DOMAIN}`);
    console.log(`  Admins:  ${ADMIN_EMAILS.length ? ADMIN_EMAILS.join(', ') : '(none configured)'}`);
    console.log(`  Mode:    ${IS_PROD ? 'production' : 'development'}\n`);
  });
}

module.exports = app;
