# MitShop: Peer-to-Peer Campus Marketplace

A lightweight, fully responsive web marketplace designed specifically for university college students to buy, sell, and exchange used textbooks, electronics, drafters, and hostel essentials within a secure campus ecosystem.

---

## 🌟 Key Features

1. **Buy Feed & Search Engine**
   - Search by item keyword (e.g., "Data Structures", "drafter", "kettle").
   - Filter by campus categories: **Books**, **Electronics**, **Hostel Essentials**, **Stationery & Tools**.
   - Product cards showing condition badges (*"Good"*, *"Like new"*), favorite wishlist toggle, price in ₹, and verified student hostel/room information (*"Karan · H2 · Room 316"*).
   - Instant **[Make Deal]** and **[Chat]** actions.

2. **Sell Listing Portal**
   - "Sell an item" interface allowing students to post listings in seconds.
   - Captures item name, category, price (₹), condition, hostel block/room, and details.
   - Supports preset campus visual badges as well as photo uploads.
   - Listings immediately show up in the Buy feed.

3. **Item-Linked Contextual Chat**
   - Buyer and seller communication anchored directly to specific item context.
   - Clean chat bubbles with timestamp.
   - Quick action prompt chips (*"Is it available?"*, *"Meet at hostel gate?"*, *"What edition?"*, *"Any discount?"*).
   - Built-in **Perspective Switcher** (`⇄ Switch Speaker`) to test conversations between buyer (Neha) and seller (Karan) on a single screen.

4. **Cart Drawer & Gate Logistics Checkout**
   - Slide-up cart drawer (mobile) / side panel (laptop/desktop) with quantity increments and price recalculation.
   - Campus green badge: `Free delivery applied`.
   - Local campus logistics: specifies **Hostel & room** and **Hostel Gate pickup point**.
   - Payment selection: **Cash on Meetup** or **UPI / QR**.

5. **Orders Tracking & Status**
   - Tracks orders from `Pending` → `Completed` (marked by seller upon handoff at the hostel gate) or `Cancelled`.

6. **Campus Profile Switcher & Authentication**
   - College email registration (`@campus.edu`).
   - One-click profile switcher in the top bar.

7. **Dark / Light Mode**
   - Instant toggle with Moon/Sun icon (`🌙` / `☀️`) and clean high-contrast styling.

8. **Admin Dashboard** (at `/admin.html`)
   - Login with admin password (default: `HIDDEN, CONTACT THE DEVELOPER `, set via `ADMIN_PASSWORD` in `.env`).
   - View all orders, mark as fulfilled or paid.
   - Auto-refreshes every 30 seconds.

---

## 📱 Responsive Layout

| Viewport | Layout |
|---|---|
| `< 540px` (mobile portrait) | Single-column app shell, tabs at top |
| `540px – 767px` (tablet portrait) | 2-column product grid |
| `768px – 1023px` (tablet landscape) | Wider header, better spacing, full-width |
| `≥ 1024px` (laptop/desktop) | **Sidebar navigation** + multi-column product grid + side cart panel |
| `≥ 1280px` (wide desktop) | Wider sidebar, 3-4 column product grid |
| `≥ 1600px` (ultra-wide) | Maximum content width 1400px |

---

## 🚀 How to Run the Website

### Step 1: Install Dependencies (if not already installed)
```bash
cd D:\mitshop
npm install
```

### Step 2: Start the Server
```bash
node server.js
```
The server will start on: **`http://localhost:3000`**

### Step 3: Open in Browser
Open your browser and navigate to:
**[http://localhost:3000](http://localhost:3000)**

**Admin panel:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
Password: ( `ADMIN_PASSWORD` in `.env`)

---

## 🏛️ System Architecture

```
+-------------------------------------------------------------+
| CLIENT TIER (Frontend)                                      |
| HTML5 + Vanilla JS + CSS3 (Mobile-First, Fully Responsive)  |
| - Buy Feed, Sell Form, Item Chat, Cart Drawer, Orders       |
+-------------------------------------------------------------+
                            |
                            | HTTP / REST API
                            v
+-------------------------------------------------------------+
| SERVER TIER (Backend)                                       |
| Node.js + Express REST API                                  |
| - /api/auth       (Campus Registration & Login)             |
| - /api/items      (Catalog, Search, Create Listing)         |
| - /api/chat       (Item-Bound Contextual Direct Messages)   |
| - /api/orders     (Cart Checkout & Gate Logistics Tracking) |
| - /api/admin      (Admin dashboard endpoints)               |
+-------------------------------------------------------------+
                            |
                            | JSON / Relational Data Model
                            v
+-------------------------------------------------------------+
| DATABASE TIER (data.json & db.js)                           |
| Tables: Users, Items, Orders, Messages                      |
+-------------------------------------------------------------+
```

---

## 👥 Demo Pre-Seeded Users

| Name | Role | Email | Hostel & Room |
|---|---|---|---|
| **Neha** | Student Buyer | `neha@campus.edu` | H7 · Room 505 |
| **Karan** | Student Seller | `karan@campus.edu` | H2 · Room 316 |
| **Rahul** | Student | `rahul@campus.edu` | H4 · Room 210 |
