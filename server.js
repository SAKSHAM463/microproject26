/**
 * server.js — MitShop Campus Marketplace
 * College-Email-Only Passwordless Authentication Architecture
 */

'use strict';

require('dotenv').config();

// ─── Startup guard ────────────────────────────────────────────────────────────
// Require SESSION_SECRET at minimum; warn if optional services are not set.
const REQUIRED_ENV = ['SESSION_SECRET'];
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
const jwt          = require('jsonwebtoken');

const db              = require('./db');
const domainValidator = require('./services/domain-validator');
const authService     = require('./services/auth-service');
const emailService    = require('./services/email-service');

// Optional Google OAuth client (kept for backward compatibility if configured)
let googleClient = null;
if (process.env.GOOGLE_CLIENT_ID) {
  try {
    const { OAuth2Client } = require('google-auth-library');
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  } catch {
    googleClient = null;
  }
}

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT               = Number(process.env.PORT) || 3000;
const IS_PROD            = process.env.NODE_ENV === 'production';
const SESSION_SECRET     = process.env.SESSION_SECRET;
const GOOGLE_CLIENT_ID   = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_DOMAIN     = (process.env.ALLOWED_EMAIL_DOMAIN || 'mitsgwl.ac.in').toLowerCase();
const ADMIN_EMAILS       = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
const SITE_ORIGIN        = IS_PROD
  ? (process.env.SITE_ORIGIN || 'https://mitstore.netlify.app')
  : `http://localhost:${PORT}`;
const JWT_COOKIE         = 'mitshop_token';

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();

if (IS_PROD) app.set('trust proxy', 1);

// Helmet CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     [
        "'self'",
        "'unsafe-inline'",
        'https://accounts.google.com',
        'https://fonts.googleapis.com'
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcAttr:  ["'unsafe-inline'"],
      fontSrc:       ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:        ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
      connectSrc:    ["'self'", 'https://accounts.google.com'],
      frameSrc:      ['https://accounts.google.com'],
      objectSrc:     ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null
    }
  },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// Request logger for development
if (!IS_PROD) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[HTTP] ${req.method} ${req.originalUrl || req.url} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });
}

const ALLOWED_ORIGINS = [
  SITE_ORIGIN,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  `http://localhost:3001`,
  `http://127.0.0.1:3001`
];

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-CSRF-Token');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Upload directory ─────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Multer (image upload) ────────────────────────────────────────────────────
const ALLOWED_MIME  = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_MAGIC = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png':  [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46]
};

function checkMagicBytes(filePath, mime) {
  let fd;
  try {
    const magic = ALLOWED_MAGIC[mime];
    if (!magic) return false;
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(magic.length);
    fs.readSync(fd, buf, 0, magic.length, 0);
    return magic.every((byte, i) => buf[i] === byte);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) {}
    }
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

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many authentication attempts — please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(['/auth', '/api/auth'], authLimiter);
app.use('/api/items',           apiLimiter);
app.use('/api/orders',          apiLimiter);
app.use(['/api/chat', '/api/chat-threads'], apiLimiter);

// ─── Helpers: Cookie, Token, CSRF, Redirect ───────────────────────────────────

function setSessionCookie(res, token) {
  res.cookie(JWT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure:   IS_PROD,
    path:     '/',
    maxAge:   authService.SESSION_IDLE_SECONDS * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(JWT_COOKIE, {
    httpOnly: true,
    sameSite: 'Lax',
    secure:   IS_PROD,
    path:     '/'
  });
}

function checkOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (ALLOWED_ORIGINS.includes(origin)) return next();
  if (!IS_PROD && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return next();
  return res.status(403).json({ error: 'Cross-origin request rejected.' });
}

function validateLocalRedirect(target) {
  if (!target || typeof target !== 'string') return '/';
  const clean = target.trim();
  if (!clean.startsWith('/') || clean.startsWith('//') || clean.includes('\\')) {
    return '/';
  }
  return clean;
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

/**
 * requireAuth — reads session cookie, validates against database sessions table,
 * enforces idle and absolute timeouts, rechecks user suspension and campus status,
 * slides the idle expiration window, and attaches req.user and req.session.
 *
 * Maintains backward compatibility with legacy JWTs during active upgrades.
 */
function requireAuth(req, res, next) {
  const token = req.cookies[JWT_COOKIE];
  if (!token) return res.status(401).json({ error: 'Sign in required.' });

  const nowIso = new Date().toISOString();
  const tokenHash = authService.hashSessionToken(token);
  const session = db.getSessionByHashedToken(tokenHash);

  if (session) {
    if (session.revoked_at) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session has been revoked.' });
    }
    if (nowIso > session.absolute_expires_at) {
      db.revokeSession(session.id);
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session has expired (maximum duration reached). Please sign in again.' });
    }
    if (nowIso > session.idle_expires_at) {
      db.revokeSession(session.id);
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Session expired due to inactivity. Please sign in again.' });
    }

    const user = db.getUserById(session.user_id);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (user.status === 'suspended' || user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been suspended.' });
    }

    const campus = db.getCampusById(user.campus_id);
    if (campus && campus.status === 'disabled') {
      return res.status(403).json({ error: 'Access for this campus has been temporarily disabled.' });
    }

    // Slide idle timeout
    const nextIdle = new Date(Date.now() + authService.SESSION_IDLE_SECONDS * 1000).toISOString();
    db.touchSession(session.id, nextIdle);

    req.user = user;
    req.session = session;
    return next();
  }

  // Fallback: Check if it's a legacy or test JWT
  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    const user = db.getUserById(Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'User not found.' });
    if (user.status === 'suspended' || user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been suspended.' });
    }
    const campus = db.getCampusById(user.campus_id);
    if (campus && campus.status === 'disabled') {
      return res.status(403).json({ error: 'Access for this campus has been temporarily disabled.' });
    }

    req.user = user;
    req.session = null;
    return next();
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Session expired or invalid — please sign in again.' });
  }
}

/**
 * requireAdmin — caller must be authenticated and have admin status.
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  const isAdmin =
    req.user.is_admin ||
    ADMIN_EMAILS.includes((req.user.email || '').toLowerCase());
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  next();
}

/**
 * requireTermsAccepted — user must accept terms & complete display name before posting or chatting.
 */
function requireTermsAccepted(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  if (!req.user.terms_accepted_at) {
    return res.status(403).json({
      error: 'Please complete your onboarding profile and accept terms of service before posting or messaging.',
      needs_profile: true
    });
  }
  next();
}

// ─── User Serialization ───────────────────────────────────────────────────────

function publicUserShape(user) {
  return {
    user_id:     user.user_id,
    campus_id:   user.campus_id,
    name:        user.name.split(' ')[0],
    picture:     user.picture,
    hostel_room: user.hostel_room
  };
}

function selfUserShape(user) {
  const campus = db.getCampusById(user.campus_id);
  const needsProfile = !user.terms_accepted_at || !user.name || user.name === user.email.split('@')[0];
  return {
    user_id:           user.user_id,
    campus_id:         user.campus_id,
    campus_name:       campus ? campus.name : 'Campus',
    name:              user.name,
    email:             user.email,
    picture:           user.picture,
    hostel_room:       user.hostel_room,
    phone:             user.phone,
    status:            user.status || (user.is_blocked ? 'suspended' : 'active'),
    terms_version:     user.terms_version,
    terms_accepted_at: user.terms_accepted_at,
    is_admin:          Boolean(user.is_admin || ADMIN_EMAILS.includes((user.email || '').toLowerCase())),
    needs_profile:     Boolean(needsProfile)
  };
}

// ─── AUTHENTICATION API (Unified Passwordless Flow) ──────────────────────────

/**
 * Handles Request Code for both /auth/request-code and /api/auth/request-code
 */
async function handleRequestCode(req, res) {
  try {
    const { email, return_url } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'College email is required.' });
    }

    const parsed = domainValidator.normalizeEmail(email);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    const { normalizedEmail, domain } = parsed;

    // Check campus registry
    const campuses = db.getCampuses();
    const campusDomains = db.getCampusDomains();
    const resolution = domainValidator.resolveCampusForDomain(domain, campuses, campusDomains);

    if (!resolution) {
      db.logAuthEvent({
        event_type: 'unapproved_domain_attempt',
        ip_hash: crypto.createHash('sha256').update(req.ip || '').digest('hex').slice(0, 16),
        details: { domain }
      });
      return res.status(400).json({
        error: `The domain "${domain}" is not currently in our approved campus registry. You can submit a request to add your campus.`,
        can_request: true,
        domain
      });
    }

    const { campus } = resolution;
    const emailLookupHash = authService.computeEmailLookupHash(normalizedEmail);

    // Rate Limiting
    const ipCheck = authService.checkIpSendLimit(req.ip);
    if (!ipCheck.allowed) {
      return res.status(429).json({
        error: `Too many requests from this network. Please retry in ${ipCheck.retryAfterSeconds} seconds.`
      });
    }

    const emailCheck = authService.checkEmailSendLimit(emailLookupHash);
    if (!emailCheck.allowed) {
      return res.status(429).json({
        error: `Too many code requests for this email. Please retry in ${emailCheck.retryAfterSeconds} seconds.`
      });
    }

    // Invalidate previous active login challenges for this email (does not reset cumulative abuse counter)
    db.invalidateActiveChallengesForEmail(emailLookupHash, 'login');

    // Create challenge
    const challengeId = `ch_${authService.generateOpaqueToken(16)}`;
    const code = authService.generateSixDigitCode();
    const magicLinkToken = authService.generateOpaqueToken(32);

    const codeDigest = authService.computeCodeDigest(challengeId, 'login', code);
    const linkTokenDigest = authService.computeLinkDigest(challengeId, 'login', magicLinkToken);
    const protectedEmail = authService.encryptDeliveryEmail(normalizedEmail);
    const expiresAt = new Date(Date.now() + authService.CHALLENGE_EXPIRY_SECONDS * 1000).toISOString();

    db.createLoginChallenge({
      id:                challengeId,
      email_lookup_hash: emailLookupHash,
      protected_email:   protectedEmail,
      campus_id:         campus.id,
      purpose:           'login',
      code_digest:       codeDigest,
      link_token_digest: linkTokenDigest,
      expires_at:        expiresAt
    });

    const safeRedirect = validateLocalRedirect(return_url);
    const magicLinkUrl = `${SITE_ORIGIN}/auth/verify-link?challenge_id=${challengeId}&token=${magicLinkToken}&return_url=${encodeURIComponent(safeRedirect)}`;

    // Queue / Send verification email
    await emailService.sendVerificationCode({
      to:           normalizedEmail,
      code,
      challengeId,
      magicLinkUrl,
      campusName:   campus.name
    });

    db.logAuthEvent({
      event_type:        'code_requested',
      campus_id:         campus.id,
      email_lookup_hash: emailLookupHash,
      ip_hash:           crypto.createHash('sha256').update(req.ip || '').digest('hex').slice(0, 16)
    });

    const responsePayload = {
      success:      true,
      message:      'If this address is eligible, a verification email will arrive shortly.',
      challenge_id: challengeId
    };

    // Include debug code in development/test if requested or dev mode
    if (!IS_PROD || process.env.DEBUG_AUTH === 'true') {
      responsePayload.debug_code = code;
      responsePayload.debug_magic_link = magicLinkUrl;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('[auth/request-code]', err.message);
    res.status(500).json({ error: 'Failed to process verification code request.' });
  }
}

/**
 * Handles Verification Code submission for both /auth/verify-code and /api/auth/verify-code
 */
async function handleVerifyCode(req, res) {
  try {
    const { challenge_id, code } = req.body;
    if (!challenge_id || !code) {
      return res.status(400).json({ error: 'Challenge ID and 6-digit verification code are required.' });
    }

    const cleanCode = String(code).trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Verification code must be exactly 6 digits.' });
    }

    const challenge = db.getLoginChallenge(challenge_id);
    if (!challenge || challenge.purpose !== 'login') {
      return res.status(400).json({ error: 'Invalid or expired verification session.' });
    }

    const nowIso = new Date().toISOString();

    // Check challenge status
    if (challenge.consumed_at) {
      return res.status(400).json({ error: 'This verification code has already been used.' });
    }
    if (challenge.invalidated_at || challenge.failed_attempts >= authService.MAX_CHALLENGE_ATTEMPTS) {
      return res.status(400).json({ error: 'Too many incorrect attempts. This code has been invalidated. Please request a new one.' });
    }
    if (nowIso > challenge.expires_at) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    // Cumulative brute-force protection
    const cumulativeCheck = authService.checkCumulativeVerifyLimit(challenge.email_lookup_hash);
    if (!cumulativeCheck.allowed) {
      db.invalidateChallenge(challenge.id);
      return res.status(429).json({
        error: `Too many failed verification attempts across challenges. Please wait ${cumulativeCheck.retryAfterSeconds} seconds before trying again.`
      });
    }

    // Verify code digest with constant-time comparison
    const expectedDigest = challenge.code_digest;
    const computedDigest = authService.computeCodeDigest(challenge.id, challenge.purpose, cleanCode);
    const isMatch = authService.safeCompareDigests(expectedDigest, computedDigest);

    if (!isMatch) {
      const updated = db.incrementChallengeAttempts(challenge.id);
      authService.recordVerificationFailure(challenge.email_lookup_hash);

      db.logAuthEvent({
        event_type:        'verification_failed',
        campus_id:         challenge.campus_id,
        email_lookup_hash: challenge.email_lookup_hash,
        ip_hash:           crypto.createHash('sha256').update(req.ip || '').digest('hex').slice(0, 16),
        details:           { attempts: updated.failed_attempts }
      });

      const remaining = Math.max(0, authService.MAX_CHALLENGE_ATTEMPTS - updated.failed_attempts);
      if (remaining === 0) {
        return res.status(401).json({
          error: 'Maximum verification attempts exceeded. Code has been invalidated. Please request a new code.'
        });
      }
      return res.status(401).json({
        error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      });
    }

    // Match succeeded: atomically consume challenge
    db.consumeChallenge(challenge.id);

    // Decrypt delivery address
    const email = authService.decryptDeliveryEmail(challenge.protected_email);
    if (!email) {
      return res.status(500).json({ error: 'Failed to decrypt verified email reference.' });
    }

    // Recheck domain eligibility and campus status at verification time
    const parsed = domainValidator.normalizeEmail(email);
    const campuses = db.getCampuses();
    const campusDomains = db.getCampusDomains();
    const resolution = domainValidator.resolveCampusForDomain(parsed.domain, campuses, campusDomains);

    if (!resolution || resolution.campus.status !== 'active') {
      return res.status(403).json({ error: 'Campus access is not active for this domain.' });
    }

    const { campus } = resolution;

    // Retrieve or create account
    let user = db.getUserByEmail(email);
    let isNewUser = false;

    if (!user) {
      // Create user ONLY upon successful verification
      user = db.createUserWithCampus({
        campus_id:         campus.id,
        email,
        name:              parsed.localPart,
        terms_version:     null,
        terms_accepted_at: null
      });
      isNewUser = true;
    } else {
      if (user.status === 'suspended' || user.is_blocked) {
        return res.status(403).json({ error: 'Your account has been suspended.' });
      }
      db.updateUser(user.user_id, { last_login: nowIso });
    }

    // Issue opaque session token
    const sessionToken = authService.generateOpaqueToken(32);
    const hashedToken = authService.hashSessionToken(sessionToken);
    const idleExpiresAt = new Date(Date.now() + authService.SESSION_IDLE_SECONDS * 1000).toISOString();
    const absoluteExpiresAt = new Date(Date.now() + authService.SESSION_ABSOLUTE_SECONDS * 1000).toISOString();

    db.createSession({
      id:                  `sess_${authService.generateOpaqueToken(16)}`,
      user_id:             user.user_id,
      hashed_token:        hashedToken,
      idle_expires_at:     idleExpiresAt,
      absolute_expires_at: absoluteExpiresAt,
      ip_hash:             crypto.createHash('sha256').update(req.ip || '').digest('hex').slice(0, 16),
      user_agent:          (req.headers['user-agent'] || '').slice(0, 200)
    });

    setSessionCookie(res, sessionToken);

    db.logAuthEvent({
      event_type:        'code_verified',
      user_id:           user.user_id,
      campus_id:         campus.id,
      email_lookup_hash: challenge.email_lookup_hash,
      details:           { is_new_user: isNewUser }
    });

    const userProfile = selfUserShape(user);
    res.json({
      success:       true,
      user:          userProfile,
      needs_profile: userProfile.needs_profile
    });
  } catch (err) {
    console.error('[auth/verify-code]', err.message);
    res.status(500).json({ error: 'Failed to verify code.' });
  }
}

/**
 * Magic Link Landing page (GET)
 * Link scanners / prefetchers must NEVER authenticate users by issuing a GET.
 * This route renders an interactive confirmation page requiring a user click (POST).
 */
app.get(['/auth/verify-link', '/api/auth/verify-link'], (req, res) => {
  const { challenge_id, token, return_url } = req.query;
  const safeReturn = validateLocalRedirect(return_url);

  if (!challenge_id || !token) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Invalid Magic Link</title><style>body{font-family:sans-serif;padding:40px;text-align:center;}</style></head>
      <body>
        <h2>Invalid or Missing Parameters</h2>
        <p>The magic link is incomplete or malformed.</p>
        <a href="/">Return to MitShop</a>
      </body>
      </html>
    `);
  }

  // Render scanner-safe confirmation screen
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirm Sign In - MitShop</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #F4F3FB;
          color: #15133D;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .card {
          background: #ffffff;
          padding: 36px 32px;
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          max-width: 440px;
          width: 100%;
          text-align: center;
        }
        h2 { color: #4B35F5; margin-top: 0; font-size: 22px; }
        p { font-size: 14px; color: #625F85; line-height: 1.5; margin: 16px 0 24px; }
        .btn {
          background: #4B35F5;
          color: #ffffff;
          border: none;
          padding: 14px 24px;
          font-size: 16px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          width: 100%;
        }
        .btn:hover { background: #3B27D8; }
        .notice { font-size: 12px; color: #8F8CAE; margin-top: 18px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Confirm Your Sign In</h2>
        <p>To protect your account against automated email security scanners, please confirm sign-in by clicking the button below.</p>
        <form method="POST" action="/auth/confirm-link">
          <input type="hidden" name="challenge_id" value="${String(challenge_id).replace(/"/g, '&quot;')}" />
          <input type="hidden" name="token" value="${String(token).replace(/"/g, '&quot;')}" />
          <input type="hidden" name="return_url" value="${safeReturn.replace(/"/g, '&quot;')}" />
          <button type="submit" class="btn">Sign In to MitShop</button>
        </form>
        <div class="notice">Email verification confirms institutional inbox access.</div>
      </div>
    </body>
    </html>
  `);
});

/**
 * Magic Link POST Confirmation
 */
async function handleConfirmLink(req, res) {
  try {
    const { challenge_id, token, return_url } = req.body;
    const safeRedirect = validateLocalRedirect(return_url);

    if (!challenge_id || !token) {
      return res.status(400).json({ error: 'Missing challenge ID or token.' });
    }

    const challenge = db.getLoginChallenge(challenge_id);
    if (!challenge || challenge.purpose !== 'login') {
      return res.status(400).json({ error: 'Invalid or expired login challenge.' });
    }

    const nowIso = new Date().toISOString();
    if (challenge.consumed_at) {
      return res.status(400).json({ error: 'This login link has already been used.' });
    }
    if (challenge.invalidated_at) {
      return res.status(400).json({ error: 'This login challenge has been invalidated.' });
    }
    if (nowIso > challenge.expires_at) {
      return res.status(400).json({ error: 'This login link has expired.' });
    }

    // Validate link token digest with constant-time comparison
    const expectedDigest = challenge.link_token_digest;
    const computedDigest = authService.computeLinkDigest(challenge.id, challenge.purpose, token);
    const isMatch = authService.safeCompareDigests(expectedDigest, computedDigest);

    if (!isMatch) {
      db.incrementChallengeAttempts(challenge.id);
      return res.status(401).json({ error: 'Invalid magic link token.' });
    }

    // Mutual invalidation: consuming link consumes the whole challenge
    db.consumeChallenge(challenge.id);

    const email = authService.decryptDeliveryEmail(challenge.protected_email);
    if (!email) return res.status(500).json({ error: 'Failed to decrypt email reference.' });

    const parsed = domainValidator.normalizeEmail(email);
    const resolution = domainValidator.resolveCampusForDomain(parsed.domain, db.getCampuses(), db.getCampusDomains());
    if (!resolution || resolution.campus.status !== 'active') {
      return res.status(403).json({ error: 'Campus access is not active for this domain.' });
    }

    let user = db.getUserByEmail(email);
    if (!user) {
      user = db.createUserWithCampus({
        campus_id:         resolution.campus.id,
        email,
        name:              parsed.localPart,
        terms_version:     null,
        terms_accepted_at: null
      });
    } else {
      if (user.status === 'suspended' || user.is_blocked) {
        return res.status(403).json({ error: 'Your account has been suspended.' });
      }
      db.updateUser(user.user_id, { last_login: nowIso });
    }

    const sessionToken = authService.generateOpaqueToken(32);
    const hashedToken = authService.hashSessionToken(sessionToken);
    const idleExpiresAt = new Date(Date.now() + authService.SESSION_IDLE_SECONDS * 1000).toISOString();
    const absoluteExpiresAt = new Date(Date.now() + authService.SESSION_ABSOLUTE_SECONDS * 1000).toISOString();

    db.createSession({
      id:                  `sess_${authService.generateOpaqueToken(16)}`,
      user_id:             user.user_id,
      hashed_token:        hashedToken,
      idle_expires_at:     idleExpiresAt,
      absolute_expires_at: absoluteExpiresAt,
      ip_hash:             crypto.createHash('sha256').update(req.ip || '').digest('hex').slice(0, 16),
      user_agent:          (req.headers['user-agent'] || '').slice(0, 200)
    });

    setSessionCookie(res, sessionToken);

    db.logAuthEvent({
      event_type: 'link_verified',
      user_id:    user.user_id,
      campus_id:  resolution.campus.id
    });

    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect(safeRedirect);
    }

    res.json({ success: true, user: selfUserShape(user), redirect: safeRedirect });
  } catch (err) {
    console.error('[auth/confirm-link]', err.message);
    res.status(500).json({ error: 'Failed to confirm magic link.' });
  }
}

// Map both prefixed and non-prefixed routes
app.post(['/auth/request-code', '/api/auth/request-code'], checkOrigin, handleRequestCode);
app.post(['/auth/verify-code',  '/api/auth/verify-code'],  checkOrigin, handleVerifyCode);
app.post(['/auth/confirm-link', '/api/auth/confirm-link'], checkOrigin, handleConfirmLink);

// ─── Current User & Logout ───────────────────────────────────────────────────

app.get(['/auth/me', '/api/auth/me'], requireAuth, (req, res) => {
  res.json(selfUserShape(req.user));
});

app.post(['/auth/logout', '/api/auth/logout'], (req, res) => {
  const token = req.cookies[JWT_COOKIE];
  if (token) {
    const tokenHash = authService.hashSessionToken(token);
    const session = db.getSessionByHashedToken(tokenHash);
    if (session) {
      db.revokeSession(session.id);
      db.logAuthEvent({ event_type: 'logout', user_id: session.user_id });
    }
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

// ─── Email Change Dual-Verification Flow ─────────────────────────────────────

app.post(['/auth/email-change/request', '/api/auth/email-change/request'], requireAuth, checkOrigin, async (req, res) => {
  try {
    const { new_email } = req.body;
    if (!new_email || typeof new_email !== 'string') {
      return res.status(400).json({ error: 'New college email is required.' });
    }

    const parsed = domainValidator.normalizeEmail(new_email);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid new email address format.' });
    }

    const { normalizedEmail: cleanNewEmail, domain: newDomain } = parsed;
    const currentEmail = req.user.email.toLowerCase();

    if (cleanNewEmail === currentEmail) {
      return res.status(400).json({ error: 'New email must be different from your current email.' });
    }

    // Check conflict: new email cannot already belong to any user
    const existing = db.getUserByEmail(cleanNewEmail);
    if (existing) {
      return res.status(409).json({ error: 'This email address is already in use by another account.' });
    }

    // New address must belong to the SAME approved campus
    const campuses = db.getCampuses();
    const campusDomains = db.getCampusDomains();
    const resolution = domainValidator.resolveCampusForDomain(newDomain, campuses, campusDomains);

    if (!resolution || resolution.campus.id !== req.user.campus_id) {
      return res.status(400).json({
        error: 'The new email address must belong to your current approved college campus.'
      });
    }

    const txId = `tx_${authService.generateOpaqueToken(16)}`;
    const oldChallengeId = `ch_old_${authService.generateOpaqueToken(16)}`;
    const newChallengeId = `ch_new_${authService.generateOpaqueToken(16)}`;

    const oldCode = authService.generateSixDigitCode();
    const newCode = authService.generateSixDigitCode();

    const oldDigest = authService.computeCodeDigest(oldChallengeId, 'email_change_old', oldCode);
    const newDigest = authService.computeCodeDigest(newChallengeId, 'email_change_new', newCode);

    const expiresAt = new Date(Date.now() + authService.CHALLENGE_EXPIRY_SECONDS * 1000).toISOString();

    db.createLoginChallenge({
      id:                oldChallengeId,
      email_lookup_hash: authService.computeEmailLookupHash(currentEmail),
      protected_email:   authService.encryptDeliveryEmail(currentEmail),
      campus_id:         req.user.campus_id,
      purpose:           'email_change_old',
      code_digest:       oldDigest,
      expires_at:        expiresAt
    });

    db.createLoginChallenge({
      id:                newChallengeId,
      email_lookup_hash: authService.computeEmailLookupHash(cleanNewEmail),
      protected_email:   authService.encryptDeliveryEmail(cleanNewEmail),
      campus_id:         req.user.campus_id,
      purpose:           'email_change_new',
      code_digest:       newDigest,
      expires_at:        expiresAt
    });

    db.createEmailChangeTransaction({
      id:               txId,
      user_id:          req.user.user_id,
      old_email:        currentEmail,
      new_email:        cleanNewEmail,
      campus_id:        req.user.campus_id,
      old_challenge_id: oldChallengeId,
      new_challenge_id: newChallengeId,
      expires_at:       expiresAt
    });

    // Send dual verification emails
    await emailService.sendEmailChangeCode({
      to:         currentEmail,
      code:       oldCode,
      challengeId: oldChallengeId,
      isNewEmail: false,
      campusName: resolution.campus.name
    });

    await emailService.sendEmailChangeCode({
      to:         cleanNewEmail,
      code:       newCode,
      challengeId: newChallengeId,
      isNewEmail: true,
      campusName: resolution.campus.name
    });

    const responseData = {
      success:          true,
      transaction_id:   txId,
      old_challenge_id: oldChallengeId,
      new_challenge_id: newChallengeId,
      message:          'Verification codes have been dispatched to both your current and new college email addresses.'
    };

    if (!IS_PROD || process.env.DEBUG_AUTH === 'true') {
      responseData.debug_old_code = oldCode;
      responseData.debug_new_code = newCode;
    }

    res.json(responseData);
  } catch (err) {
    console.error('[auth/email-change/request]', err.message);
    res.status(500).json({ error: 'Failed to request email change.' });
  }
});

app.post(['/auth/email-change/verify', '/api/auth/email-change/verify'], requireAuth, checkOrigin, async (req, res) => {
  try {
    const { transaction_id, old_code, new_code } = req.body;
    if (!transaction_id || !old_code || !new_code) {
      return res.status(400).json({ error: 'Transaction ID and verification codes for both emails are required.' });
    }

    const tx = db.getEmailChangeTransaction(transaction_id);
    if (!tx || tx.user_id !== req.user.user_id || tx.completed_at) {
      return res.status(400).json({ error: 'Invalid or already completed email change transaction.' });
    }

    const nowIso = new Date().toISOString();
    if (nowIso > tx.expires_at) {
      return res.status(400).json({ error: 'Email change transaction has expired. Please initiate a new request.' });
    }

    const oldCh = db.getLoginChallenge(tx.old_challenge_id);
    const newCh = db.getLoginChallenge(tx.new_challenge_id);
    if (!oldCh || !newCh || oldCh.consumed_at || newCh.consumed_at) {
      return res.status(400).json({ error: 'Verification challenges are invalid or already consumed.' });
    }

    // Verify old email code
    const oldExpected = oldCh.code_digest;
    const oldComputed = authService.computeCodeDigest(oldCh.id, oldCh.purpose, String(old_code).trim());
    if (!authService.safeCompareDigests(oldExpected, oldComputed)) {
      db.incrementChallengeAttempts(oldCh.id);
      return res.status(401).json({ error: 'Incorrect verification code for current email.' });
    }

    // Verify new email code
    const newExpected = newCh.code_digest;
    const newComputed = authService.computeCodeDigest(newCh.id, newCh.purpose, String(new_code).trim());
    if (!authService.safeCompareDigests(newExpected, newComputed)) {
      db.incrementChallengeAttempts(newCh.id);
      return res.status(401).json({ error: 'Incorrect verification code for new email.' });
    }

    // Recheck conflict atomically before applying update
    const conflict = db.getUserByEmail(tx.new_email);
    if (conflict && conflict.user_id !== req.user.user_id) {
      return res.status(409).json({ error: 'The new email address was registered by another account.' });
    }

    // Consume both challenges
    db.consumeChallenge(oldCh.id);
    db.consumeChallenge(newCh.id);

    // Update transaction
    db.updateEmailChangeTransaction(tx.id, {
      old_verified_at: nowIso,
      new_verified_at: nowIso,
      completed_at:    nowIso
    });

    // Update primary email
    db.updatePrimaryEmail(req.user.user_id, tx.new_email);

    // Rotate session token
    if (req.session) {
      db.revokeSession(req.session.id);
    }
    const newSessionToken = authService.generateOpaqueToken(32);
    const newHashedToken = authService.hashSessionToken(newSessionToken);
    const idleExpiresAt = new Date(Date.now() + authService.SESSION_IDLE_SECONDS * 1000).toISOString();
    const absoluteExpiresAt = new Date(Date.now() + authService.SESSION_ABSOLUTE_SECONDS * 1000).toISOString();

    db.createSession({
      id:                  `sess_${authService.generateOpaqueToken(16)}`,
      user_id:             req.user.user_id,
      hashed_token:        newHashedToken,
      idle_expires_at:     idleExpiresAt,
      absolute_expires_at: absoluteExpiresAt,
      ip_hash:             crypto.createHash('sha256').update(req.ip || '').digest('hex').slice(0, 16),
      user_agent:          (req.headers['user-agent'] || '').slice(0, 200)
    });
    setSessionCookie(res, newSessionToken);

    // Send confirmation alert to the OLD email address
    const campus = db.getCampusById(req.user.campus_id);
    await emailService.sendEmailChangeNotification({
      to:         tx.old_email,
      oldEmail:   tx.old_email,
      newEmail:   tx.new_email,
      campusName: campus ? campus.name : 'Campus'
    });

    db.logAuthEvent({
      event_type: 'email_changed',
      user_id:    req.user.user_id,
      campus_id:  req.user.campus_id,
      details:    { old_email: tx.old_email, new_email: tx.new_email }
    });

    const updatedUser = db.getUserById(req.user.user_id);
    res.json({
      success: true,
      message: 'Email address updated successfully.',
      user:    selfUserShape(updatedUser)
    });
  } catch (err) {
    console.error('[auth/email-change/verify]', err.message);
    res.status(500).json({ error: 'Failed to verify email change.' });
  }
});

// ─── CAMPUS REGISTRY API ─────────────────────────────────────────────────────

app.get(['/campuses', '/api/campuses'], (_req, res) => {
  res.json(db.getActiveCampusesWithDomains());
});

app.post(['/campuses/request', '/api/campuses/request'], checkOrigin, (req, res) => {
  try {
    const { campus_name, domain, contact_email, notes } = req.body;
    if (!campus_name || !domain || !contact_email) {
      return res.status(400).json({ error: 'Campus name, domain, and contact email are required.' });
    }

    const cleanDomain = domainValidator.normalizeDomain(domain);
    const parsedContact = domainValidator.normalizeEmail(contact_email);
    if (!parsedContact) {
      return res.status(400).json({ error: 'Invalid contact email address.' });
    }

    const campusReq = db.createCampusRequest({
      campus_name:   String(campus_name).trim(),
      domain:        cleanDomain,
      contact_email: parsedContact.normalizedEmail,
      notes:         notes || ''
    });

    res.status(201).json({
      success: true,
      message: 'Thank you! Your campus request has been submitted for administrative review.',
      request: campusReq
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── USER PROFILE COMPLETION & ONBOARDING ────────────────────────────────────

app.post('/api/me/complete-profile', requireAuth, checkOrigin, (req, res) => {
  const { name, hostel_room, accept_terms } = req.body;

  if (!accept_terms) {
    return res.status(400).json({ error: 'You must accept the Campus Marketplace terms of service.' });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Display name is required.' });
  }

  const updated = db.updateUserProfile(req.user.user_id, {
    name:           String(name).trim(),
    hostel_room:    hostel_room || req.user.hostel_room,
    terms_accepted: true
  });

  res.json({ success: true, user: selfUserShape(updated) });
});

app.patch('/api/me', requireAuth, checkOrigin, (req, res) => {
  const { hostel_room, phone, name } = req.body;

  if (phone !== undefined && phone !== null) {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Phone must be a 10-digit Indian mobile number.' });
    }
  }

  const updated = db.updateUserProfile(req.user.user_id, { hostel_room, phone, name });
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  res.json(selfUserShape(updated));
});

// ─── PUBLIC CONFIG ────────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    allowedDomain:  ALLOWED_DOMAIN,
    isDev:          !IS_PROD,
    campuses:       db.getActiveCampusesWithDomains()
  });
});

// ─── EMAIL WEBHOOK ────────────────────────────────────────────────────────────

app.post(['/webhooks/email', '/api/webhooks/email'], (req, res) => {
  const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
  const isValid = emailService.verifyWebhookSignature(signature, req.body);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  const processed = emailService.processWebhookEvent(req.body);
  if (!processed.alreadyProcessed && processed.eventType === 'bounce') {
    db.logAuthEvent({
      event_type: 'email_bounced',
      details:    { reason: processed.reason }
    });
  }

  // Idempotent generic acknowledgement — never expose account existence
  res.json({ received: true });
});


// ─── LEGACY GOOGLE LOGIN ──────────────────────────────────────────────────────

app.post('/api/auth/google', checkOrigin, async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(400).json({ error: 'Google OAuth is not configured on this server.' });
    }
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential.' });

    const ticket = await googleClient.verifyIdToken({
      idToken:  credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload.email_verified) {
      return res.status(403).json({ error: 'Please verify your Google email first.' });
    }

    const parsed = domainValidator.normalizeEmail(payload.email);
    if (!parsed) return res.status(400).json({ error: 'Invalid email in Google token.' });

    const resolution = domainValidator.resolveCampusForDomain(parsed.domain, db.getCampuses(), db.getCampusDomains());
    if (!resolution || resolution.campus.status !== 'active') {
      return res.status(403).json({ error: 'Please sign in with your approved college account.' });
    }

    let user = db.getUserByEmail(parsed.normalizedEmail);
    if (!user) {
      user = db.createUserWithCampus({
        campus_id:         resolution.campus.id,
        email:             parsed.normalizedEmail,
        name:              payload.name || parsed.localPart,
        terms_version:     'v1.0',
        terms_accepted_at: new Date().toISOString()
      });
    }

    const sessionToken = authService.generateOpaqueToken(32);
    const hashedToken = authService.hashSessionToken(sessionToken);
    db.createSession({
      id:                  `sess_${authService.generateOpaqueToken(16)}`,
      user_id:             user.user_id,
      hashed_token:        hashedToken,
      idle_expires_at:     new Date(Date.now() + authService.SESSION_IDLE_SECONDS * 1000).toISOString(),
      absolute_expires_at: new Date(Date.now() + authService.SESSION_ABSOLUTE_SECONDS * 1000).toISOString()
    });
    setSessionCookie(res, sessionToken);

    res.json({ success: true, user: selfUserShape(user) });
  } catch (err) {
    console.error('[auth/google] error:', err.message);
    res.status(401).json({ error: 'Invalid or expired Google credential.' });
  }
});

// ─── ITEMS CATALOG API ────────────────────────────────────────────────────────

app.get('/api/items', (req, res) => {
  try {
    const { category, search, status, campus_id } = req.query;
    const items = db.getItems({ category, search, status, campus_id });
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

app.post('/api/items', requireAuth, requireTermsAccepted, checkOrigin, upload.single('photo'), (req, res) => {
  const uploadedFilePath = req.file ? req.file.path : null;
  try {
    const { title, category, price, condition, hostel_room, details, image_type } = req.body;

    if (!title || !price) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        try { fs.unlinkSync(uploadedFilePath); } catch (_) {}
      }
      return res.status(400).json({ error: 'Title and price are required.' });
    }
    if (Number(price) < 0 || Number(price) > 100000) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        try { fs.unlinkSync(uploadedFilePath); } catch (_) {}
      }
      return res.status(400).json({ error: 'Price must be between ₹0 and ₹1,00,000.' });
    }

    let image_url = '';
    if (req.file) {
      if (!checkMagicBytes(req.file.path, req.file.mimetype)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ error: 'File content does not match an image type.' });
      }
      image_url = '/uploads/' + req.file.filename;
    }

    const newItem = db.createItem({
      seller_id:  req.user.user_id,
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
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try { fs.unlinkSync(uploadedFilePath); } catch (_) {}
    }
    console.error('[POST /api/items]', err.message);
    res.status(500).json({ error: 'Failed to create listing.' });
  }
});

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

app.delete('/api/items/:id', requireAuth, checkOrigin, (req, res) => {
  try {
    const ok = db.deleteItem(req.params.id, req.user.user_id);
    if (!ok) return res.status(404).json({ error: 'Item not found or not yours.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});

app.patch('/api/items/:id/status', requireAuth, checkOrigin, (req, res) => {
  try {
    const item = db.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const isAdmin = req.user.is_admin || ADMIN_EMAILS.includes((req.user.email || '').toLowerCase());
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

app.post('/api/orders', requireAuth, checkOrigin, (req, res) => {
  try {
    const { items: cartItems, pickup_location, payment_method, hostel_room } = req.body;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

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
      // Cross-campus check: buyer must be in the same campus
      if (item.campus_id && item.campus_id !== req.user.campus_id) {
        return res.status(403).json({ error: `Cannot purchase item from a different campus.` });
      }
    }

    const order = db.createOrder({
      buyer_id:        req.user.user_id,
      items:           cartItems,
      pickup_location,
      payment_method,
      hostel_room:     hostel_room || req.user.hostel_room
    });

    if (!order) {
      return res.status(409).json({ error: 'One or more items in your cart are no longer available.' });
    }

    res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('[POST /api/orders]', err.message);
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

app.get('/api/orders', requireAuth, (req, res) => {
  try {
    const orders = db.getOrders(req.user.user_id);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

app.get('/api/orders/:id', requireAuth, (req, res) => {
  try {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.buyer_id !== req.user.user_id && order.seller_id !== req.user.user_id) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
});

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

app.get('/api/chat/:itemId', requireAuth, (req, res) => {
  try {
    const { itemId } = req.params;
    const item = db.getItemById(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found.' });

    const uid = req.user.user_id;
    const messages = db.getMessages(itemId, uid, item.seller_id === uid ? undefined : item.seller_id);
    db.markMessagesRead(itemId, uid);

    res.json({ item, messages });
  } catch (err) {
    console.error('[GET /api/chat]', err.message);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

app.post('/api/chat/:itemId', requireAuth, requireTermsAccepted, checkOrigin, (req, res) => {
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

    const senderId   = req.user.user_id;
    const receiverId = (senderId === item.seller_id) ? null : item.seller_id;

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

app.get('/api/chat-threads', requireAuth, (req, res) => {
  try {
    const threads = db.getChatThreads(req.user.user_id);
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch threads.' });
  }
});

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

app.get('/api/admin/orders', requireAuth, requireAdmin, (_req, res) => {
  try {
    res.json(db.getOrders());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin orders.' });
  }
});

app.post('/api/admin/orders/:id/fulfill', requireAuth, requireAdmin, (req, res) => {
  try {
    const order = db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    db.updateItemStatus(order.item_id, 'Sold');
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

// Admin Campus Management
app.get('/api/admin/campuses', requireAuth, requireAdmin, (_req, res) => {
  res.json(db.getCampuses());
});

app.patch('/api/admin/campuses/:id/status', requireAuth, requireAdmin, checkOrigin, (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or disabled.' });
  }
  const updated = db.updateCampusStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'Campus not found.' });
  res.json({ success: true, campus: updated });
});

app.get('/api/admin/campus-requests', requireAuth, requireAdmin, (_req, res) => {
  res.json(db.getCampusRequests());
});

app.post('/api/admin/campus-requests/:id/approve', requireAuth, requireAdmin, checkOrigin, (req, res) => {
  const requests = db.getCampusRequests();
  const targetReq = requests.find(r => r.id === Number(req.params.id));
  if (!targetReq) return res.status(404).json({ error: 'Request not found.' });

  // Create new campus and domain
  const newCampus = db.createCampus({ name: targetReq.campus_name });
  db.createCampusDomain({
    campus_id:        newCampus.id,
    domain:           targetReq.domain,
    match_subdomains: true,
    is_active:        true
  });

  const updatedReq = db.updateCampusRequestStatus(targetReq.id, 'approved');
  res.json({ success: true, request: updatedReq, campus: newCampus });
});

app.post('/api/admin/campus-requests/:id/reject', requireAuth, requireAdmin, checkOrigin, (req, res) => {
  const updatedReq = db.updateCampusRequestStatus(req.params.id, 'rejected');
  if (!updatedReq) return res.status(404).json({ error: 'Request not found.' });
  res.json({ success: true, request: updatedReq });
});

// Admin User Status Control (Suspend / Reactivate)
app.patch('/api/admin/users/:id/status', requireAuth, requireAdmin, checkOrigin, (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or suspended.' });
  }
  const updated = db.setUserStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  if (status === 'suspended') {
    // Revoke all sessions for suspended user immediately
    db.revokeUserSessions(req.params.id);
  }
  res.json({ success: true, user: selfUserShape(updated) });
});

// Admin Auth Events Audit Log
app.get('/api/admin/auth-events', requireAuth, requireAdmin, (req, res) => {
  const { event_type, user_id, campus_id } = req.query;
  res.json(db.getAuthEvents({ event_type, user_id, campus_id }));
});

// ─── Error Handler ────────────────────────────────────────────────────────────
// Must be last middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large — maximum 5 MB.' });
  }
  if (err.message && err.message.includes('Only JPEG')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[server error]', err.message);
  res.status(500).json({ error: IS_PROD ? 'Internal server error.' : err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nMitShop server running on http://localhost:${PORT}`);
    console.log(`  Allowed Domain: ${ALLOWED_DOMAIN}`);
    console.log(`  Mode:           ${IS_PROD ? 'production' : 'development'}\n`);
  });
}

module.exports = app;
