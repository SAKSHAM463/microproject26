# MitShop: Peer-to-Peer Campus Marketplace

A lightweight, secure, and responsive web marketplace designed specifically for university college students (MITS Gwalior) to buy, sell, and exchange used textbooks, electronics, drafters, and hostel essentials within a verified campus ecosystem.

---

## 🌟 What's New: Production Authentication & Security Layer

1. **Google Identity Services (College Restricted)**
   - Sign in is restricted strictly to verified college accounts (`@mitsgwl.ac.in` domain).
   - Domain enforcement runs on the server using Google OAuth2 token verification (`verifyIdToken`).
   - Personal `@gmail.com` accounts are rejected with `403 Forbidden: "Please sign in with your college Google account."`.
   - First-party sessions managed via `httpOnly`, `SameSite=Lax`, and cryptographically signed JWT cookies (7-day validity).

2. **Server-Enforced Authorization & Zero-Trust Architecture**
   - The server never trusts client-supplied `buyer_id`, `seller_id`, `sender_id`, item prices, or total calculations.
   - All identities are derived securely from the verified session cookie.
   - Orders strictly compute totals from the database item price multiplied by quantity.
   - Listing lifecycle state machine: `Available` → `Reserved` (when ordered) → `Sold` (when completed) or back to `Available` (if cancelled).
   - Only sellers can mark an order `Completed`; only buyers can mark an order `Cancelled`.
   - Users cannot order their own items.
   - Item edits and deletions are restricted exclusively to the original seller.

3. **Secure Item-Linked Chat**
   - Chat threads are restricted exclusively to the buyer and seller of that item.
   - Message length is enforced at 1,000 characters.
   - Integrated read receipts (`read_at` timestamp) powering unread badges.

4. **Hardened Admin Dashboard (`/admin.html`)**
   - Removed insecure password-in-URL parameters (`?password=...`).
   - Admin access is gated using `requireAdmin` middleware checking `ADMIN_EMAILS` configured in `.env`.
   - Unauthorized users receive `403 Forbidden`.

5. **Storage-Agnostic Database & Automated Backups**
   - Local JSON data store behind a storage-agnostic data access interface (`db.js`).
   - Automated migration script (`npm run migrate`) with safe, timestamped backups.
   - Nightly backup script (`npm run backup`) keeping the last 30 snapshots with automated retention.
   - Disaster recovery restore tool (`scripts/restore-db.js`).

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `.env` contains:
```ini
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
ALLOWED_EMAIL_DOMAIN=mitsgwl.ac.in
SESSION_SECRET=a-very-long-random-string-used-for-jwt-signing
ADMIN_EMAILS=admin@mitsgwl.ac.in,owner@mitsgwl.ac.in
PORT=3000
NODE_ENV=development
```

### 3. Run Automated Acceptance Tests
```bash
npm test
```
All 16 security and data integrity acceptance tests will execute and pass.

### 4. Start the Application
```bash
npm start
```
Open your browser at: **[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Google Cloud OAuth Setup (Owner Manual Steps)

To enable live Google Sign-In with college accounts, complete these steps in Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project (e.g., `MitShop Campus Marketplace`).
3. Navigate to **APIs & Services** → **OAuth consent screen**:
   - User Type: **External** (or **Internal** if your university Google Workspace allows it).
   - App name: `MitShop`.
   - User support email: your college email.
   - Scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`.
4. Navigate to **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**.
   - Name: `MitShop Web Client`.
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (for local development)
     - `https://mitstore.netlify.app` (for production)
   - *Note: Authorized redirect URIs are not required for Google Identity Services One-Tap / Pop-up.*
5. Copy the generated **Client ID** and paste it into your `.env` file as `GOOGLE_CLIENT_ID`.
6. Restart your server.

---

## 🛡️ Security Hardening Overview

| Feature | Implementation |
|---|---|
| **Session Security** | Signed JWT in `httpOnly`, `SameSite=Lax` cookies; `Secure` flag enabled in production. |
| **Origin Verification** | Origin header verified against `SITE_ORIGIN` for all state-changing requests (`POST`, `PATCH`, `DELETE`). |
| **Content Security Policy (CSP)** | Powered by `helmet`, allowing Google Identity Services (`accounts.google.com`) while blocking unauthorized scripts and objects. |
| **Rate Limiting** | `express-rate-limit` on auth endpoints (20 req / 15 min) and API routes (120 req / min). |
| **File Upload Security** | Magic-byte file header verification for images (`image/jpeg`, `image/png`, `image/webp`). Max size capped at 5 MB. EXIF/metadata sanitized. Random UUID filenames. |
| **Payload Size Capping** | JSON body size strictly limited to `512kb`. |
| **Error Shielding** | Internal stack traces hidden from responses in production. |

---

## 💾 Database Management & Disaster Recovery

### Run Migration
```bash
npm run migrate
```
Creates a timestamped snapshot in `backups/` and normalizes all user, item, order, chat, and wishlist records.

### Create Manual Snapshot
```bash
npm run backup
```
Generates a snapshot in `backups/data-snapshot-[timestamp].json`. Retains the 30 most recent snapshots automatically.

### Restore From Snapshot
```bash
# Restore from the most recent backup
node scripts/restore-db.js

# Or specify an exact snapshot file
node scripts/restore-db.js data-snapshot-2026-10-21T12-04-11-589Z.json
```

---

## 📁 Project Structure

```
├── public/                 # Client assets (Vanilla HTML5 / ES6 JS / CSS3)
│   ├── index.html          # Main application shell (Buy, Sell, Chat, Orders, Cart)
│   ├── admin.html          # Administrator portal
│   ├── app.js              # Client state, GIS integration, API calls
│   └── style.css           # Responsive design system & dark/light theme
├── scripts/
│   ├── migrate-json.js     # Safe JSON migration utility
│   ├── backup-db.js        # Automated snapshot backup utility
│   └── restore-db.js       # Snapshot recovery utility
├── tests/
│   └── acceptance.test.js  # 16-point automated test suite
├── .env.example            # Environment variables template
├── .gitignore              # Ignores secrets, database files, and node_modules
├── data.json               # Local normalized database store
├── db.js                   # Storage-agnostic data access layer
├── package.json            # Node project configuration and test scripts
└── server.js               # Production-hardened Express 4 server
```
