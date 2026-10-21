// ===================================================================
// MitShop: Peer-to-Peer Campus Marketplace Frontend Engine
// Matches Screenshot 1 (Buy Feed), 2 (Chat), 3 (Cart), 4 (Sell Form)
// ===================================================================

const API_BASE = '';

// Pre-defined campus profiles
const CAMPUS_USERS = [
  { user_id: 1, name: 'Karan', email: 'karan@campus.edu', hostel_room: 'H2 · Room 316', role: 'Seller' },
  { user_id: 2, name: 'Neha', email: 'neha@campus.edu', hostel_room: 'H7 · Room 505', role: 'Buyer' },
  { user_id: 3, name: 'Rahul', email: 'rahul@campus.edu', hostel_room: 'H4 · Room 210', role: 'Student' }
];

// App State
let state = {
  currentUser: CAMPUS_USERS[1], // Default: Neha (matches screenshots)
  otherUser: CAMPUS_USERS[0],   // Default chat partner: Karan
  activeTab: 'buy',
  currentCategory: 'All',
  searchQuery: '',
  items: [],
  wishlist: new Set([1]), // Item 1 wishlisted for demo
  cart: [
    // Preloaded with screenshot 3: Bucket and mug set x 4 = ₹240
    { item_id: 3, title: 'Bucket and mug set', price: 60, quantity: 4, condition: 'Good' }
  ],
  activeChatItemId: 1,
  activeChatSpeakerId: 2, // 2 = Neha speaks, 1 = Karan speaks
  chatPollingInterval: null
};

// SVG Graphic generator for campus items
function getItemGraphic(type, title) {
  switch (type) {
    case 'book':
      // Blue book with yellow bookmark matching Image 1
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="35" y="24" width="75" height="110" rx="8" fill="#1d4ed8" />
          <path d="M42 24H35V134H42C44 134 45 133 45 130V28C45 25 44 24 42 24Z" fill="#1e40af" />
          <rect x="58" y="48" width="38" height="8" rx="4" fill="#ffffff" />
          <rect x="58" y="64" width="26" height="6" rx="3" fill="#ffffff" opacity="0.9" />
          <rect x="96" y="38" width="36" height="92" rx="7" fill="#f59e0b" />
          <rect x="104" y="52" width="20" height="4" rx="2" fill="#d97706" opacity="0.4" />
        </svg>
      `;
    case 'calculator':
      // Blue calculator with orange buttons matching Image 1 (Wired earphones/calculator)
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="42" y="22" width="76" height="116" rx="14" fill="#1d4ed8" />
          <rect x="52" y="34" width="56" height="32" rx="6" fill="#bfdbfe" />
          <!-- 3x3 Button Grid -->
          <circle cx="58" cy="82" r="6" fill="#f59e0b" />
          <circle cx="80" cy="82" r="6" fill="#f59e0b" />
          <circle cx="102" cy="82" r="6" fill="#f59e0b" />
          <circle cx="58" cy="100" r="6" fill="#f59e0b" />
          <circle cx="80" cy="100" r="6" fill="#f59e0b" />
          <circle cx="102" cy="100" r="6" fill="#f59e0b" />
          <circle cx="58" cy="118" r="6" fill="#f59e0b" />
          <circle cx="80" cy="118" r="6" fill="#f59e0b" />
          <circle cx="102" cy="118" r="6" fill="#f59e0b" />
        </svg>
      `;
    case 'bucket':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 50L52 130H108L120 50H40Z" fill="#2563eb" rx="4" />
          <rect x="35" y="44" width="90" height="10" rx="5" fill="#1d4ed8" />
          <path d="M42 46C42 16 118 16 118 46" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" fill="none" />
          <!-- Mug -->
          <rect x="108" y="90" width="30" height="38" rx="4" fill="#60a5fa" />
          <path d="M138 96C146 96 146 118 138 122" stroke="#1e40af" stroke-width="4" fill="none" />
        </svg>
      `;
    case 'drafter':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="80" cy="80" r="28" fill="#1d4ed8" />
          <circle cx="80" cy="80" r="14" fill="#ffffff" />
          <line x1="80" y1="52" x2="80" y2="18" stroke="#64748b" stroke-width="8" stroke-linecap="round" />
          <line x1="80" y1="18" x2="35" y2="40" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" />
          <rect x="25" y="76" width="110" height="8" rx="4" fill="#f59e0b" />
          <rect x="76" y="25" width="8" height="110" rx="4" fill="#f59e0b" />
        </svg>
      `;
    case 'kettle':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 60C50 48 62 44 80 44C98 44 110 48 110 60L114 125H46L50 60Z" fill="#94a3b8" />
          <rect x="65" y="36" width="30" height="10" rx="4" fill="#334155" />
          <path d="M110 70C130 70 135 110 112 118" stroke="#334155" stroke-width="8" stroke-linecap="round" fill="none" />
          <rect x="42" y="125" width="76" height="10" rx="5" fill="#1e293b" />
          <circle cx="80" cy="115" r="4" fill="#ef4444" />
        </svg>
      `;
    case 'labcoat':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 38L80 50L120 38L135 125L108 128L80 75L52 128L25 125L40 38Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="3" />
          <path d="M60 44L80 75L100 44" fill="#1d4ed8" />
          <line x1="80" y1="75" x2="80" y2="128" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
          <rect x="52" y="85" width="18" height="16" rx="2" fill="#e2e8f0" />
          <rect x="90" y="85" width="18" height="16" rx="2" fill="#e2e8f0" />
        </svg>
      `;
    default:
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="45" y="35" width="70" height="90" rx="8" fill="#1d4ed8" />
          <circle cx="80" cy="80" r="18" fill="#f59e0b" />
          <path d="M72 80L88 80M80 72L80 88" stroke="#ffffff" stroke-width="4" stroke-linecap="round" />
        </svg>
      `;
  }
}

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateHeaderUserDisplay();
  fetchCatalog();
  updateCartBadge();
  setupEventListeners();
  setupViewportHeightFix();

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) dropdown.classList.remove('show');
  });
});

// Fix for mobile browsers where 100vh includes browser chrome.
// We use a CSS variable --real-vh to handle this properly.
function setupViewportHeightFix() {
  function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--real-vh', `${vh}px`);
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', () => setTimeout(setVH, 200));
}

function setupEventListeners() {
  // Sync checkout room input with current user
  const checkoutRoomInput = document.getElementById('checkout-hostel-room');
  if (checkoutRoomInput && state.currentUser) {
    checkoutRoomInput.value = state.currentUser.hostel_room;
  }
  const sellHostelInput = document.getElementById('item-hostel');
  if (sellHostelInput && state.currentUser) {
    sellHostelInput.value = state.currentUser.hostel_room;
  }
}

// ================= THEME (DARK / LIGHT) =================
function initTheme() {
  const saved = localStorage.getItem('mitshop-theme');
  if (saved === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('theme-icon').textContent = '☀️';
  } else {
    document.getElementById('theme-icon').textContent = '🌙';
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  document.getElementById('theme-icon').textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('mitshop-theme', isDark ? 'dark' : 'light');
}

// ================= STUDENT PROFILE SWITCHER =================
function toggleUserDropdown() {
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.classList.toggle('show');
}

function setCurrentUser(userId) {
  const user = CAMPUS_USERS.find(u => u.user_id === Number(userId));
  if (!user) return;
  state.currentUser = user;
  state.activeChatSpeakerId = user.user_id;

  updateHeaderUserDisplay();

  const checkoutRoom = document.getElementById('checkout-hostel-room');
  if (checkoutRoom) checkoutRoom.value = user.hostel_room;

  const sellHostel = document.getElementById('item-hostel');
  if (sellHostel) sellHostel.value = user.hostel_room;

  showToast(`Switched active profile to ${user.name}`);

  // If chat is open, refresh chat perspective
  if (state.activeTab === 'chat') {
    loadChat(state.activeChatItemId);
  }
  if (state.activeTab === 'orders') {
    loadOrders();
  }
}

function updateHeaderUserDisplay() {
  const u = state.currentUser;
  const avatarEl = document.getElementById('header-user-avatar');
  const nameEl = document.getElementById('header-user-name');

  if (avatarEl && nameEl) {
    avatarEl.textContent = u.name.charAt(0);
    nameEl.textContent = `${u.name} (${u.hostel_room.split('·')[0].trim()})`;

    avatarEl.className = 'user-avatar-badge';
    if (u.name === 'Karan') avatarEl.classList.add('avatar-karan');
    else if (u.name === 'Rahul') avatarEl.classList.add('avatar-rahul');
    else avatarEl.classList.add('avatar-orange');
  }
}

// ================= TAB NAVIGATION =================
function switchTab(tabName) {
  state.activeTab = tabName;

  document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));

  const activeBtn = document.getElementById(`tab-${tabName}`);
  const activePanel = document.getElementById(`view-${tabName}`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  if (tabName === 'chat') {
    loadChat(state.activeChatItemId);
    startChatPolling();
  } else {
    stopChatPolling();
  }

  if (tabName === 'orders') {
    loadOrders();
  }
  if (tabName === 'buy') {
    fetchCatalog();
  }
}

// ================= CATALOG (BUY FEED) =================
async function fetchCatalog() {
  try {
    let url = `${API_BASE}/api/items?`;
    if (state.currentCategory && state.currentCategory !== 'All') {
      url += `category=${encodeURIComponent(state.currentCategory)}&`;
    }
    if (state.searchQuery) {
      url += `search=${encodeURIComponent(state.searchQuery)}&`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch items');
    const items = await res.json();
    state.items = items;
    renderCatalog(items);
  } catch (err) {
    console.error('Catalog fetch error:', err);
    // If API error, fallback to initial items
    renderCatalog(state.items);
  }
}

function renderCatalog(items) {
  const grid = document.getElementById('catalog-grid');
  const emptyState = document.getElementById('empty-catalog');
  if (!grid) return;

  if (!items || items.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  grid.innerHTML = items.map(item => {
    const isWishlisted = state.wishlist.has(item.item_id);
    const sellerInitial = item.seller_name ? item.seller_name.charAt(0) : 'S';
    const avatarClass = item.seller_name === 'Karan' ? 'avatar-karan' : (item.seller_name === 'Rahul' ? 'avatar-rahul' : 'avatar-orange');

    let imageContent;
    if (item.image_url) {
      imageContent = `<img src="${item.image_url}" alt="${item.title}">`;
    } else {
      imageContent = getItemGraphic(item.image_type || 'default', item.title);
    }

    return `
      <div class="product-card" data-id="${item.item_id}">
        <!-- Top Row: Condition Badge + Wishlist Heart -->
        <div class="card-top-row">
          <span class="condition-badge">${item.condition || 'Good'}</span>
          <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist(${item.item_id})" aria-label="Add to favorites">
            ${isWishlisted ? '♥' : '♡'}
          </button>
        </div>

        <!-- Product Visual Illustration / Photo Container -->
        <div class="product-visual-box" onclick="openItemChat(${item.item_id})">
          ${imageContent}
        </div>

        <!-- Details & Pricing -->
        <div class="card-info">
          <h3 class="product-title">${escapeHtml(item.title)}</h3>
          <div class="product-price">₹${item.price}</div>
          
          <div class="product-seller-row">
            <span class="seller-avatar ${avatarClass}">${sellerInitial}</span>
            <span class="seller-text">${item.seller_name} · ${item.hostel_room}</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="card-actions-grid">
          <button class="btn btn-primary" onclick="addToCart(${item.item_id})">
            Make Deal
          </button>
          <button class="btn btn-outline" onclick="openItemChat(${item.item_id})">
            Chat
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function filterCategory(catName) {
  state.currentCategory = catName;
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.classList.toggle('active', pill.textContent.trim().toLowerCase().includes(catName.toLowerCase()));
  });
  fetchCatalog();
}

function handleSearch(val) {
  state.searchQuery = val.trim();
  const clearBtn = document.getElementById('clear-search');
  if (clearBtn) clearBtn.style.display = state.searchQuery ? 'block' : 'none';
  fetchCatalog();
}

function clearSearch() {
  const input = document.getElementById('catalog-search');
  if (input) input.value = '';
  handleSearch('');
}

function toggleWishlist(itemId) {
  if (state.wishlist.has(itemId)) {
    state.wishlist.delete(itemId);
    showToast('Removed from favorites');
  } else {
    state.wishlist.add(itemId);
    showToast('Saved to favorites ♥');
  }
  renderCatalog(state.items);
}

// ================= CART DRAWER & CHECKOUT =================
function addToCart(itemId) {
  const item = state.items.find(i => i.item_id === Number(itemId));
  if (!item) return;

  const existing = state.cart.find(c => c.item_id === Number(itemId));
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      item_id: item.item_id,
      title: item.title,
      price: item.price,
      quantity: 1,
      condition: item.condition
    });
  }

  updateCartBadge();
  showToast(`Added "${item.title}" to cart`);
  openCart();
}

function openCart() {
  renderCartItems();
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (drawer && backdrop) {
    drawer.classList.add('open');
    backdrop.classList.add('show');
  }
}

function closeCart() {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
  }
}

function changeCartQty(itemId, delta) {
  const entry = state.cart.find(c => c.item_id === Number(itemId));
  if (!entry) return;

  entry.quantity += delta;
  if (entry.quantity <= 0) {
    state.cart = state.cart.filter(c => c.item_id !== Number(itemId));
  }
  updateCartBadge();
  renderCartItems();
}

function updateCartBadge() {
  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const badge = document.getElementById('cart-count');
  if (badge) {
    badge.textContent = totalCount;
  }
}

function renderCartItems() {
  const container = document.getElementById('cart-items-container');
  const summarySec = document.getElementById('cart-summary-section');
  const emptyView = document.getElementById('empty-cart-view');
  const totalEl = document.getElementById('cart-total-amount');

  if (!container) return;

  if (state.cart.length === 0) {
    container.innerHTML = '';
    if (summarySec) summarySec.style.display = 'none';
    if (emptyView) emptyView.style.display = 'flex';
    if (totalEl) totalEl.textContent = '₹0';
    return;
  }

  if (summarySec) summarySec.style.display = 'block';
  if (emptyView) emptyView.style.display = 'none';

  let grandTotal = 0;

  container.innerHTML = state.cart.map(item => {
    const itemTotal = item.price * item.quantity;
    grandTotal += itemTotal;

    return `
      <div class="cart-item-row">
        <div class="cart-item-name">${escapeHtml(item.title)}</div>
        <div class="cart-qty-control">
          <button class="qty-btn" onclick="changeCartQty(${item.item_id}, -1)">-</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="changeCartQty(${item.item_id}, 1)">+</button>
        </div>
        <div class="cart-item-price">₹${itemTotal}</div>
      </div>
    `;
  }).join('');

  if (totalEl) totalEl.textContent = `₹${grandTotal}`;
}

async function handlePlaceOrder() {
  if (state.cart.length === 0) {
    showToast('Cart is empty!');
    return;
  }

  const hostelRoom = document.getElementById('checkout-hostel-room').value.trim() || state.currentUser.hostel_room;
  const pickupGate = document.getElementById('checkout-pickup-gate').value;
  const payMethodInput = document.querySelector('input[name="payment_method"]:checked');
  const paymentMethod = payMethodInput ? payMethodInput.value : 'Cash';

  const grandTotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  try {
    const payload = {
      buyer_id: state.currentUser.user_id,
      items: state.cart,
      pickup_location: pickupGate,
      hostel_room: hostelRoom,
      payment_method: paymentMethod,
      total: grandTotal
    };

    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Order creation failed');

    // Clear cart
    state.cart = [];
    updateCartBadge();
    closeCart();

    showToast('🎉 Order placed successfully! Collect from hostel gate.');
    switchTab('orders');
  } catch (err) {
    console.error('Error placing order:', err);
    showToast('Failed to place order. Please try again.');
  }
}

// ================= 2. SELL AN ITEM =================
async function handleSellSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('item-name').value.trim();
  const category = document.getElementById('item-category').value;
  const price = document.getElementById('item-price').value;
  const condition = document.getElementById('item-condition').value;
  const hostel_room = document.getElementById('item-hostel').value.trim();
  const details = document.getElementById('item-details').value.trim();
  const image_type = document.querySelector('input[name="image_type"]:checked').value;
  const photoInput = document.getElementById('item-photo');

  if (!title || !price) {
    showToast('Please fill in required fields');
    return;
  }

  const submitBtn = document.getElementById('submit-listing-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Listing item...';
  }

  try {
    const formData = new FormData();
    formData.append('seller_id', state.currentUser.user_id);
    formData.append('title', title);
    formData.append('category', category);
    formData.append('price', price);
    formData.append('condition', condition);
    formData.append('hostel_room', hostel_room || state.currentUser.hostel_room);
    formData.append('details', details);
    formData.append('image_type', image_type);

    if (photoInput && photoInput.files[0]) {
      formData.append('photo', photoInput.files[0]);
    }

    const res = await fetch(`${API_BASE}/api/items`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Failed to create listing');
    const data = await res.json();

    showToast('✅ Item listed for sale successfully!');
    document.getElementById('sell-form').reset();
    document.getElementById('item-hostel').value = state.currentUser.hostel_room;

    // Switch to buy tab and show new item
    switchTab('buy');
    fetchCatalog();
  } catch (err) {
    console.error('Sell error:', err);
    showToast('Could not post listing. Try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Listing';
    }
  }
}

// ================= 3. ITEM-LINKED CHAT =================
function openItemChat(itemId) {
  state.activeChatItemId = Number(itemId);
  switchTab('chat');
}

async function loadChat(itemId) {
  state.activeChatItemId = Number(itemId);
  renderChatThreadsBar();

  try {
    const res = await fetch(`${API_BASE}/api/chat/${itemId}`);
    if (!res.ok) throw new Error('Failed to load chat');
    const data = await res.json();

    const item = data.item;
    const messages = data.messages || [];

    // Update Header Context
    const contextEl = document.getElementById('chat-item-title');
    if (contextEl && item) {
      contextEl.textContent = `About: ${item.title} · ₹${item.price}`;
    }

    // Determine buyer & seller
    const seller = CAMPUS_USERS.find(u => u.user_id === (item ? item.seller_id : 1)) || CAMPUS_USERS[0];
    const buyer = state.currentUser.user_id === seller.user_id ? CAMPUS_USERS[1] : state.currentUser;

    updateChatParticipants(buyer, seller);
    renderChatMessages(messages, buyer, seller);

  } catch (err) {
    console.error('Chat load error:', err);
  }
}

function updateChatParticipants(buyer, seller) {
  const buyerAvatar = document.getElementById('chat-buyer-avatar');
  const buyerName = document.getElementById('chat-buyer-name');
  const sellerAvatar = document.getElementById('chat-seller-avatar');
  const sellerName = document.getElementById('chat-seller-name');

  if (buyerAvatar) buyerAvatar.textContent = buyer.name.charAt(0);
  if (buyerName) buyerName.textContent = buyer.name;
  if (sellerAvatar) sellerAvatar.textContent = seller.name.charAt(0);
  if (sellerName) sellerName.textContent = seller.name;
}

function renderChatThreadsBar() {
  const bar = document.getElementById('chat-threads-bar');
  if (!bar) return;

  // Render quick chips for items
  const items = state.items.length > 0 ? state.items : [
    { item_id: 1, title: 'Data Structures in C' },
    { item_id: 2, title: 'Wired earphones' },
    { item_id: 3, title: 'Bucket & mug set' }
  ];

  bar.innerHTML = items.slice(0, 5).map(item => `
    <button class="thread-chip ${item.item_id === state.activeChatItemId ? 'active' : ''}" onclick="loadChat(${item.item_id})">
      📦 ${escapeHtml(item.title)}
    </button>
  `).join('');
}

function renderChatMessages(messages, buyer, seller) {
  const stream = document.getElementById('chat-messages-container');
  if (!stream) return;

  if (messages.length === 0) {
    stream.innerHTML = `
      <div style="text-align:center; padding: 30px; color: var(--text-muted); font-size: 0.88rem;">
        No messages yet. Send a message to ask about availability or meet at the gate!
      </div>
    `;
    return;
  }

  // Active perspective:
  const activeSpeakerId = state.activeChatSpeakerId;

  stream.innerHTML = messages.map(msg => {
    // If sent by current speaker -> right bubble (blue), else -> left bubble
    const isOutgoing = (msg.sender_id === activeSpeakerId);
    const bubbleClass = isOutgoing ? 'bubble-outgoing' : 'bubble-incoming';

    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    return `
      <div class="chat-bubble ${bubbleClass}">
        ${escapeHtml(msg.message_text)}
        <span class="bubble-time">${timeStr}</span>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  stream.scrollTop = stream.scrollHeight;
}

function switchChatPerspective() {
  // Toggle between buyer (2) and seller (1)
  const item = state.items.find(i => i.item_id === state.activeChatItemId);
  const sellerId = item ? item.seller_id : 1;
  const buyerId = 2;

  if (state.activeChatSpeakerId === buyerId) {
    state.activeChatSpeakerId = sellerId;
    showToast('Now speaking as: Karan (Seller)');
  } else {
    state.activeChatSpeakerId = buyerId;
    showToast('Now speaking as: Neha (Buyer)');
  }

  loadChat(state.activeChatItemId);
}

async function handleSendChat(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('chat-input');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  const item = state.items.find(i => i.item_id === state.activeChatItemId);
  const sellerId = item ? item.seller_id : 1;
  const buyerId = 2;

  const senderId = state.activeChatSpeakerId;
  const receiverId = (senderId === sellerId) ? buyerId : sellerId;

  try {
    const res = await fetch(`${API_BASE}/api/chat/${state.activeChatItemId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: senderId,
        receiver_id: receiverId,
        message_text: text
      })
    });

    if (!res.ok) throw new Error('Send message failed');
    await loadChat(state.activeChatItemId);
  } catch (err) {
    console.error('Chat send error:', err);
    showToast('Failed to send message');
  }
}

function sendQuickChip(text) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text;
    handleSendChat();
  }
}

function viewChatProduct() {
  switchTab('buy');
  const card = document.querySelector(`.product-card[data-id="${state.activeChatItemId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.outline = '2px solid var(--primary)';
    setTimeout(() => { card.style.outline = 'none'; }, 2000);
  }
}

function startChatPolling() {
  stopChatPolling();
  state.chatPollingInterval = setInterval(() => {
    if (state.activeTab === 'chat') {
      loadChat(state.activeChatItemId);
    }
  }, 4000);
}

function stopChatPolling() {
  if (state.chatPollingInterval) {
    clearInterval(state.chatPollingInterval);
    state.chatPollingInterval = null;
  }
}

// ================= 4. ORDERS VIEW =================
async function loadOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/api/orders?userId=${state.currentUser.user_id}`);
    if (!res.ok) throw new Error('Failed to load orders');
    const orders = await res.json();

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>No Orders Yet</h3>
          <p>Orders you place or receive from other students will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(o => {
      const isSeller = (o.seller_id === state.currentUser.user_id);
      const statusClass = `status-${o.status.toLowerCase()}`;

      let actionsHtml = '';
      if (o.status === 'Pending') {
        if (isSeller) {
          actionsHtml = `
            <div class="order-actions">
              <button class="btn btn-primary btn-block" onclick="updateOrderStatus(${o.order_id}, 'Completed')">
                ✓ Mark Handed Over (Complete)
              </button>
            </div>
          `;
        } else {
          actionsHtml = `
            <div class="order-actions">
              <button class="btn btn-outline btn-block" onclick="updateOrderStatus(${o.order_id}, 'Cancelled')">
                Cancel Order
              </button>
            </div>
          `;
        }
      }

      return `
        <div class="order-card">
          <div class="order-top">
            <span class="order-id">Order #${o.order_id}</span>
            <span class="order-status-pill ${statusClass}">${o.status}</span>
          </div>

          <div class="order-title">${escapeHtml(o.item_title)}</div>

          <div class="order-details-grid">
            <div>Total: <strong>₹${o.total}</strong></div>
            <div>Payment: <strong>${o.payment_method}</strong></div>
            <div>Meetup: <strong>${escapeHtml(o.pickup_location)}</strong></div>
            <div>Hostel/Room: <strong>${escapeHtml(o.hostel_room)}</strong></div>
            <div>Buyer: <strong>${escapeHtml(o.buyer_name)}</strong></div>
            <div>Seller: <strong>${escapeHtml(o.seller_name)}</strong></div>
          </div>

          ${actionsHtml}
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading orders:', err);
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (!res.ok) throw new Error('Status update failed');
    showToast(`Order #${orderId} marked as ${status}`);
    loadOrders();
    fetchCatalog();
  } catch (err) {
    console.error('Update status error:', err);
    showToast('Failed to update status');
  }
}

// ================= AUTH MODAL =================
function openLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
}

function closeLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value.trim();
  const hostel_room = document.getElementById('auth-hostel').value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, hostel_room })
    });

    if (!res.ok) throw new Error('Registration failed');
    const data = await res.json();
    const newUser = data.user;

    CAMPUS_USERS.push(newUser);
    setCurrentUser(newUser.user_id);
    closeLoginModal();
    showToast(`Welcome to MitShop, ${newUser.name}!`);
  } catch (err) {
    console.error('Auth error:', err);
    showToast('Could not sign in');
  }
}

// ================= UTILITIES =================
function showToast(message) {
  const toast = document.getElementById('toast-popup');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
