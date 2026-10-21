// ===================================================================
// MitShop: Peer-to-Peer Campus Marketplace Frontend Engine
// Phase 1+2: Google Sign-In, server-side identity, real auth flow
// ===================================================================

'use strict';

const API_BASE = '';

// ─── App state ───────────────────────────────────────────────────────────────
let state = {
  currentUser:         null,   // populated from /api/auth/me
  googleClientId:      null,   // loaded from /api/config
  allowedDomain:       null,

  activeTab:           'buy',
  currentCategory:     'All',
  searchQuery:         '',
  items:               [],
  wishlist:            new Set(),
  cart:                [],

  activeChatItemId:    null,
  chatPollingInterval: null,

  // Pending action to run after sign-in completes
  pendingAction:       null,
};

// ─── Initialization ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupViewportHeightFix();
  setupEventListeners();

  // Load config (Google client ID, allowed domain) before rendering
  try {
    const cfg = await fetch(`${API_BASE}/api/config`).then(r => r.json());
    state.googleClientId = cfg.googleClientId;
    state.allowedDomain  = cfg.allowedDomain;
    state.isDev          = cfg.isDev;
    if (cfg.isDev) {
      const devBox = document.getElementById('dev-login-box');
      if (devBox) devBox.style.display = 'block';
    }
  } catch {
    console.warn('Could not load /api/config — Google sign-in will not work.');
  }

  // Try to restore session
  await loadCurrentUser();

  // Fetch catalog (always open)
  fetchCatalog();
  updateCartBadge();

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) dropdown.classList.remove('show');
  });
});

// ─── Session ─────────────────────────────────────────────────────────────────
async function loadCurrentUser() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      setCurrentUser(user);
      // Load server-side wishlist
      await loadServerWishlist();
    } else {
      setCurrentUser(null);
    }
  } catch {
    setCurrentUser(null);
  }
}

function setCurrentUser(user) {
  state.currentUser = user;
  updateHeaderUserDisplay();
  updateAuthGatedButtons();
}

function updateHeaderUserDisplay() {
  const avatarEl  = document.getElementById('header-user-avatar');
  const nameEl    = document.getElementById('header-user-name');
  const dropdownEl = document.getElementById('user-dropdown-menu');
  if (!avatarEl || !nameEl) return;

  if (state.currentUser) {
    const u = state.currentUser;

    // Show picture or initial
    if (u.picture) {
      avatarEl.innerHTML = `<img src="${u.picture}" alt="${escapeHtml(u.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      avatarEl.textContent = u.name.charAt(0).toUpperCase();
    }
    nameEl.textContent = u.name.split(' ')[0];

    // Build authenticated dropdown
    if (dropdownEl) {
      dropdownEl.innerHTML = `
        <div class="dropdown-header">Signed in as</div>
        <div class="dropdown-item no-click" style="flex-direction:column;align-items:flex-start;gap:2px;">
          <strong>${escapeHtml(u.name)}</strong>
          <small style="color:var(--muted);font-size:.78rem">${escapeHtml(u.email)}</small>
          ${u.hostel_room ? `<small style="color:var(--muted);font-size:.78rem">${escapeHtml(u.hostel_room)}</small>` : ''}
        </div>
        <div class="dropdown-divider"></div>
        ${u.is_admin ? `<div class="dropdown-item action-item" onclick="window.open('/admin.html','_blank');event.stopPropagation();">🛡 Admin Panel</div>` : ''}
        <div class="dropdown-item action-item" onclick="handleLogout();event.stopPropagation();">
          ↩ Sign out
        </div>
      `;
    }
  } else {
    avatarEl.textContent = '?';
    nameEl.textContent   = 'Sign in';

    // Build sign-in dropdown
    if (dropdownEl) {
      dropdownEl.innerHTML = `
        <div class="dropdown-header">Not signed in</div>
        <div class="dropdown-item action-item" onclick="openLoginModal();event.stopPropagation();">
          🔑 Sign in with Google
        </div>
      `;
    }
  }
}

// Mark buttons that require auth (sell, make deal, checkout, chat send)
function updateAuthGatedButtons() {
  // These are rendered dynamically so we handle them at action time
}

async function handleLogout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  setCurrentUser(null);
  state.wishlist = new Set();
  state.cart     = [];
  updateCartBadge();
  showToast('Signed out successfully.');
}

// ─── Google Identity Services ─────────────────────────────────────────────────
function initGoogleSignIn() {
  if (!state.googleClientId || !window.google) {
    const statusEl = document.getElementById('google-auth-status');
    if (statusEl && !window.google) {
      statusEl.textContent = 'Google sign-in loading...';
    }
    return;
  }

  try {
    window.google.accounts.id.initialize({
      client_id:  state.googleClientId,
      callback:   handleGoogleCredential,
      auto_select: false,
      context:    'signin'
    });

    // Render the Google button into the modal
    const btnContainer = document.getElementById('google-signin-btn');
    if (btnContainer) {
      btnContainer.innerHTML = '';
      window.google.accounts.id.renderButton(btnContainer, {
        theme:  'outline',
        size:   'large',
        text:   'continue_with',
        shape:  'rectangular',
        width:  280
      });
    }
  } catch (err) {
    console.warn('Google sign-in init warning:', err);
  }
}

async function handleDevLogin() {
  const input = document.getElementById('dev-login-email');
  const email = (input ? input.value : '').trim();
  if (!email) {
    showToast('Please enter your college email');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ email })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Login failed');
      return;
    }

    setCurrentUser(data.user);
    await loadServerWishlist();
    closeLoginModal();
    showToast(`Welcome, ${data.user.name.split(' ')[0]}! 👋`);

    if (!data.user.hostel_room) {
      showHostelPrompt();
      return;
    }

    if (state.pendingAction) {
      const action = state.pendingAction;
      state.pendingAction = null;
      action();
    }
  } catch (err) {
    console.error('Dev login error:', err);
    showToast('Login request failed');
  }
}

async function handleGoogleCredential(response) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Sign-in failed. Please try again.');
      return;
    }

    setCurrentUser(data.user);
    await loadServerWishlist();
    closeLoginModal();
    showToast(`Welcome, ${data.user.name.split(' ')[0]}! 👋`);

    // If hostel_room is blank, prompt to fill it in
    if (!data.user.hostel_room) {
      showHostelPrompt();
      return;
    }

    // Resume any action that triggered the sign-in
    if (state.pendingAction) {
      const action = state.pendingAction;
      state.pendingAction = null;
      action();
    }
  } catch (err) {
    console.error('[Google sign-in]', err);
    showToast('Sign-in failed. Please try again.');
  }
}

function showHostelPrompt() {
  const modal = document.getElementById('hostel-prompt-modal');
  if (modal) modal.style.display = 'flex';
}

function closeHostelPrompt() {
  const modal = document.getElementById('hostel-prompt-modal');
  if (modal) modal.style.display = 'none';
}

async function handleHostelSave() {
  const input = document.getElementById('hostel-prompt-input');
  const val   = input ? input.value.trim() : '';
  if (!val) { showToast('Please enter your hostel and room.'); return; }

  try {
    const res  = await fetch(`${API_BASE}/api/me`, {
      method:      'PATCH',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ hostel_room: val })
    });
    const data = await res.json();
    if (res.ok) {
      setCurrentUser(data);
      closeHostelPrompt();
      showToast('Hostel saved ✓');

      // Auto-fill checkout hostel input
      const checkoutEl = document.getElementById('checkout-hostel-room');
      if (checkoutEl) checkoutEl.value = val;

      // Resume pending action
      if (state.pendingAction) {
        const action = state.pendingAction;
        state.pendingAction = null;
        action();
      }
    } else {
      showToast(data.error || 'Could not save hostel.');
    }
  } catch {
    showToast('Could not save hostel.');
  }
}

// Invoked once the GSI script tag has loaded
window.onGoogleLibraryLoad = function() {
  initGoogleSignIn();
};

// ─── Wishlist (server-persisted) ─────────────────────────────────────────────
async function loadServerWishlist() {
  if (!state.currentUser) return;
  try {
    const items = await fetch(`${API_BASE}/api/wishlist`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : []);
    state.wishlist = new Set(items.map(i => i.item_id));
  } catch {}
}

async function toggleWishlist(itemId) {
  if (!state.currentUser) {
    state.pendingAction = () => toggleWishlist(itemId);
    openLoginModal();
    return;
  }

  const id = Number(itemId);
  if (state.wishlist.has(id)) {
    state.wishlist.delete(id);
    showToast('Removed from favorites');
    fetch(`${API_BASE}/api/wishlist/${id}`, {
      method: 'DELETE', credentials: 'include'
    }).catch(() => {});
  } else {
    state.wishlist.add(id);
    showToast('Saved to favorites ♥');
    fetch(`${API_BASE}/api/wishlist/${id}`, {
      method: 'POST', credentials: 'include'
    }).catch(() => {});
  }
  renderCatalog(state.items);
}

// ─── Theme (Dark/Light) ───────────────────────────────────────────────────────
function initTheme() {
  const icon = document.getElementById('theme-icon');
  if (localStorage.getItem('mitshop-theme') === 'light') {
    document.body.classList.remove('dark-mode');
    if (icon) icon.textContent = '🌙';
  } else {
    document.body.classList.add('dark-mode');
    if (icon) icon.textContent = '☀️';
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  const icon   = document.getElementById('theme-icon');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('mitshop-theme', isDark ? 'dark' : 'light');
}

// ─── Mobile 100dvh fix ────────────────────────────────────────────────────────
function setupViewportHeightFix() {
  function setVH() {
    document.documentElement.style.setProperty('--real-vh', `${window.innerHeight * 0.01}px`);
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', () => setTimeout(setVH, 200));
}

function setupEventListeners() {
  const checkoutRoomInput = document.getElementById('checkout-hostel-room');
  if (checkoutRoomInput && state.currentUser) {
    checkoutRoomInput.value = state.currentUser.hostel_room || '';
  }
  const sellHostelInput = document.getElementById('item-hostel');
  if (sellHostelInput && state.currentUser) {
    sellHostelInput.value = state.currentUser.hostel_room || '';
  }
}

// ─── Profile dropdown ─────────────────────────────────────────────────────────
function handleProfilePillClick(e) {
  if (e) e.stopPropagation();
  if (!state.currentUser) {
    openLoginModal();
  } else {
    toggleUserDropdown(e);
  }
}

function toggleUserDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('user-dropdown-menu');
  if (menu) menu.classList.toggle('show');
}

// ─── Tab navigation ───────────────────────────────────────────────────────────
function switchTab(tabName) {
  // Guard auth-gated tabs
  if (['sell', 'orders'].includes(tabName) && !state.currentUser) {
    state.pendingAction = () => switchTab(tabName);
    openLoginModal();
    return;
  }

  state.activeTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

  const activeBtn   = document.getElementById(`tab-${tabName}`);
  const activePanel = document.getElementById(`view-${tabName}`);
  if (activeBtn)   activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  if (tabName === 'chat') {
    loadChatOrPromptSignIn();
    startChatPolling();
  } else {
    stopChatPolling();
  }
  if (tabName === 'orders') loadOrders();
  if (tabName === 'buy')    fetchCatalog();
  if (tabName === 'sell' && state.currentUser) {
    const sellHostelInput = document.getElementById('item-hostel');
    if (sellHostelInput) sellHostelInput.value = state.currentUser.hostel_room || '';
  }
}

// ─── CATALOG (BUY FEED) ───────────────────────────────────────────────────────
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
    renderCatalog(state.items);
  }
}

function renderCatalog(items) {
  const grid       = document.getElementById('catalog-grid');
  const emptyState = document.getElementById('empty-catalog');
  if (!grid) return;

  if (!items || items.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  grid.innerHTML = items.map(item => {
    const isWishlisted  = state.wishlist.has(item.item_id);
    const sellerInitial = (item.seller_name || 'S').charAt(0);

    // Deterministic avatar colour from name
    const colours = ['avatar-orange', 'avatar-karan', 'avatar-rahul'];
    const avatarClass = colours[(item.seller_id || 0) % colours.length];

    let imageContent;
    if (item.image_url) {
      imageContent = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy">`;
    } else {
      imageContent = getItemGraphic(item.image_type || 'default', item.title);
    }

    return `
      <div class="product-card" data-id="${item.item_id}">
        <div class="card-top-row">
          <span class="condition-badge">${escapeHtml(item.condition || 'Good')}</span>
          <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist(${item.item_id})" aria-label="Toggle favorite">
            ${isWishlisted ? '♥' : '♡'}
          </button>
        </div>

        <div class="product-visual-box" onclick="openItemChat(${item.item_id})">
          ${imageContent}
        </div>

        <div class="card-info">
          <h3 class="product-title">${escapeHtml(item.title)}</h3>
          <div class="product-price">₹${item.price}</div>
          <div class="product-seller-row">
            <span class="seller-avatar ${avatarClass}">${sellerInitial}</span>
            <span class="seller-text">${escapeHtml(item.seller_name)} · ${escapeHtml(item.hostel_room)}</span>
          </div>
        </div>

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

// ─── CART DRAWER & CHECKOUT ───────────────────────────────────────────────────
function addToCart(itemId) {
  const item = state.items.find(i => i.item_id === Number(itemId));
  if (!item) return;

  // Prompt sign-in; keep the item in mind but don't block browsing
  if (!state.currentUser) {
    state.pendingAction = () => addToCart(itemId);
    openLoginModal();
    return;
  }

  // Can't add own listing
  if (item.seller_id === state.currentUser.user_id) {
    showToast("You can't add your own listing to cart.");
    return;
  }

  const existing = state.cart.find(c => c.item_id === Number(itemId));
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      item_id:   item.item_id,
      title:     item.title,
      price:     item.price,
      quantity:  1,
      condition: item.condition
    });
  }

  updateCartBadge();
  showToast(`Added "${item.title}" to cart`);
  openCart();
}

function openCart() {
  if (!state.currentUser) {
    state.pendingAction = () => openCart();
    openLoginModal();
    return;
  }
  renderCartItems();
  const drawer   = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (drawer && backdrop) {
    drawer.classList.add('open');
    backdrop.classList.add('show');
  }
}

function closeCart() {
  const drawer   = document.getElementById('cart-drawer');
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
  if (badge) badge.textContent = totalCount;
}

function renderCartItems() {
  const container  = document.getElementById('cart-items-container');
  const summarySec = document.getElementById('cart-summary-section');
  const emptyView  = document.getElementById('empty-cart-view');
  const totalEl    = document.getElementById('cart-total-amount');
  const hostelEl   = document.getElementById('checkout-hostel-room');

  if (!container) return;

  // Keep hostel in sync with current user
  if (hostelEl && state.currentUser && state.currentUser.hostel_room) {
    if (!hostelEl.value) hostelEl.value = state.currentUser.hostel_room;
  }

  if (state.cart.length === 0) {
    container.innerHTML = '';
    if (summarySec) summarySec.style.display = 'none';
    if (emptyView)  emptyView.style.display  = 'flex';
    if (totalEl)    totalEl.textContent      = '₹0';
    return;
  }

  if (summarySec) summarySec.style.display = 'block';
  if (emptyView)  emptyView.style.display  = 'none';

  let grandTotal = 0;
  container.innerHTML = state.cart.map(item => {
    const lineTotal = item.price * item.quantity;
    grandTotal += lineTotal;
    return `
      <div class="cart-item-row">
        <div class="cart-item-name">${escapeHtml(item.title)}</div>
        <div class="cart-qty-control">
          <button class="qty-btn" onclick="changeCartQty(${item.item_id}, -1)">-</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="changeCartQty(${item.item_id}, 1)">+</button>
        </div>
        <div class="cart-item-price">₹${lineTotal}</div>
      </div>
    `;
  }).join('');

  if (totalEl) totalEl.textContent = `₹${grandTotal}`;
}

async function handlePlaceOrder() {
  if (!state.currentUser) {
    state.pendingAction = () => handlePlaceOrder();
    openLoginModal();
    return;
  }
  if (state.cart.length === 0) {
    showToast('Cart is empty!');
    return;
  }

  const hostelRoom   = document.getElementById('checkout-hostel-room').value.trim()
                     || state.currentUser.hostel_room;
  const pickupGate   = document.getElementById('checkout-pickup-gate').value;
  const payMethodEl  = document.querySelector('input[name="payment_method"]:checked');
  const paymentMethod = payMethodEl ? payMethodEl.value : 'Cash';

  const btn = document.querySelector('.place-order-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Placing order…'; }

  try {
    const payload = {
      items:           state.cart.map(c => ({ item_id: c.item_id, quantity: c.quantity })),
      pickup_location: pickupGate,
      hostel_room:     hostelRoom,
      payment_method:  paymentMethod
      // Note: NO buyer_id, NO total — server derives them
    };

    const res  = await fetch(`${API_BASE}/api/orders`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Order failed. Please try again.');
      return;
    }

    state.cart = [];
    updateCartBadge();
    closeCart();
    showToast('🎉 Order placed! Collect from hostel gate.');
    switchTab('orders');
  } catch (err) {
    console.error('Error placing order:', err);
    showToast('Failed to place order. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Place order'; }
  }
}

// ─── SELL ─────────────────────────────────────────────────────────────────────
async function handleSellSubmit(e) {
  e.preventDefault();

  if (!state.currentUser) {
    state.pendingAction = () => document.getElementById('sell-form')?.dispatchEvent(new Event('submit', {cancelable:true}));
    openLoginModal();
    return;
  }

  const title      = document.getElementById('item-name').value.trim();
  const category   = document.getElementById('item-category').value;
  const price      = document.getElementById('item-price').value;
  const condition  = document.getElementById('item-condition').value;
  const hostelRoom = document.getElementById('item-hostel').value.trim();
  const details    = document.getElementById('item-details').value.trim();
  const imgTypeEl  = document.querySelector('input[name="image_type"]:checked');
  const image_type = imgTypeEl ? imgTypeEl.value : 'default';
  const photoInput = document.getElementById('item-photo');

  if (!title || !price) { showToast('Please fill in required fields'); return; }

  const submitBtn = document.getElementById('submit-listing-btn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Listing item…'; }

  try {
    const formData = new FormData();
    // Do NOT send seller_id — server takes it from session cookie
    formData.append('title',      title);
    formData.append('category',   category);
    formData.append('price',      price);
    formData.append('condition',  condition);
    formData.append('hostel_room', hostelRoom || state.currentUser.hostel_room || '');
    formData.append('details',    details);
    formData.append('image_type', image_type);

    if (photoInput && photoInput.files[0]) {
      formData.append('photo', photoInput.files[0]);
    }

    const res  = await fetch(`${API_BASE}/api/items`, {
      method:      'POST',
      credentials: 'include',
      body:        formData
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Could not post listing. Try again.');
      return;
    }

    showToast('✅ Item listed for sale!');
    document.getElementById('sell-form').reset();
    document.getElementById('item-hostel').value = state.currentUser.hostel_room || '';
    switchTab('buy');
    fetchCatalog();
  } catch (err) {
    console.error('Sell error:', err);
    showToast('Could not post listing. Try again.');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post Listing'; }
  }
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function openItemChat(itemId) {
  if (!state.currentUser) {
    state.pendingAction = () => openItemChat(itemId);
    openLoginModal();
    return;
  }
  state.activeChatItemId = Number(itemId);
  switchTab('chat');
}

function loadChatOrPromptSignIn() {
  if (!state.currentUser) {
    // Show a sign-in prompt in the chat container
    const container = document.getElementById('chat-messages-container');
    if (container) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text-muted)">
          <div style="font-size:2rem;margin-bottom:12px">💬</div>
          <p>Sign in to read and send messages.</p>
          <button class="btn btn-primary" style="margin-top:10px" onclick="openLoginModal()">Sign in</button>
        </div>
      `;
    }
    return;
  }
  if (state.activeChatItemId) {
    loadChat(state.activeChatItemId);
  } else {
    // Load threads to pick from
    loadChatThreads();
  }
}

async function loadChatThreads() {
  try {
    const threads = await fetch(`${API_BASE}/api/chat-threads`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : []);
    renderChatThreadsBar(threads);

    if (threads.length > 0 && !state.activeChatItemId) {
      state.activeChatItemId = threads[0].item_id;
      loadChat(state.activeChatItemId);
    }
  } catch (err) {
    console.error('Thread load error:', err);
  }
}

function renderChatThreadsBar(threads) {
  const bar = document.getElementById('chat-threads-bar');
  if (!bar) return;

  if (!threads || threads.length === 0) {
    bar.innerHTML = `<span style="color:var(--muted);font-size:.8rem;padding:6px 4px">No conversations yet</span>`;
    return;
  }

  bar.innerHTML = threads.map(t => `
    <button class="thread-chip ${t.item_id === state.activeChatItemId ? 'active' : ''}" onclick="loadChat(${t.item_id})">
      📦 ${escapeHtml(t.item_title)}
    </button>
  `).join('');
}

async function loadChat(itemId) {
  state.activeChatItemId = Number(itemId);

  if (!state.currentUser) {
    loadChatOrPromptSignIn();
    return;
  }

  try {
    const res  = await fetch(`${API_BASE}/api/chat/${itemId}`, { credentials: 'include' });

    if (res.status === 401) {
      openLoginModal();
      return;
    }

    if (!res.ok) throw new Error('Failed to load chat');
    const data = await res.json();

    const item     = data.item;
    const messages = data.messages || [];

    // Update item context banner
    const contextEl = document.getElementById('chat-item-title');
    if (contextEl && item) {
      contextEl.textContent = `About: ${item.title} · ₹${item.price}`;
    }

    // Participants
    const me    = state.currentUser;
    const other = {
      user_id:    item ? item.seller_id : 0,
      name:       item ? (item.seller_name || 'Seller') : 'Seller',
      hostel_room: item ? item.seller_hostel : ''
    };

    const buyer  = (me.user_id === item?.seller_id) ? { user_id: 0, name: 'Buyer' } : me;
    const seller = (me.user_id === item?.seller_id) ? me : other;

    updateChatParticipants(buyer, seller, me);
    renderChatMessages(messages, me.user_id);

    // Refresh threads bar (unread dots)
    loadChatThreads();
  } catch (err) {
    console.error('Chat load error:', err);
  }
}

function updateChatParticipants(buyer, seller, me) {
  const buyerAv  = document.getElementById('chat-buyer-avatar');
  const buyerNm  = document.getElementById('chat-buyer-name');
  const sellerAv = document.getElementById('chat-seller-avatar');
  const sellerNm = document.getElementById('chat-seller-name');

  if (buyerAv) buyerAv.textContent = (buyer.name || 'B').charAt(0);
  if (buyerNm) buyerNm.textContent  = buyer.name || 'Buyer';
  if (sellerAv) sellerAv.textContent = (seller.name || 'S').charAt(0);
  if (sellerNm) sellerNm.textContent  = seller.name || 'Seller';

  // Hide the "Switch Speaker" button (no longer needed)
  const switchBtn = document.querySelector('.chat-switch-party-btn');
  if (switchBtn) switchBtn.style.display = 'none';
}

function renderChatMessages(messages, myUserId) {
  const stream = document.getElementById('chat-messages-container');
  if (!stream) return;

  if (messages.length === 0) {
    stream.innerHTML = `
      <div style="text-align:center;padding:30px;color:var(--text-muted);font-size:.88rem">
        No messages yet. Ask about availability or arrange a meetup!
      </div>
    `;
    return;
  }

  stream.innerHTML = messages.map(msg => {
    const isOutgoing = (msg.sender_id === myUserId);
    const bubbleClass = isOutgoing ? 'bubble-outgoing' : 'bubble-incoming';
    const timeStr = msg.timestamp
      ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return `
      <div class="chat-bubble ${bubbleClass}">
        ${escapeHtml(msg.message_text)}
        <span class="bubble-time">${timeStr}</span>
      </div>
    `;
  }).join('');

  stream.scrollTop = stream.scrollHeight;
}

// The "Switch Speaker" button is kept in HTML but hidden after auth is wired
function switchChatPerspective() {
  // No-op in Phase 1+ — speaker is always the signed-in user
}

async function handleSendChat(e) {
  if (e) e.preventDefault();

  if (!state.currentUser) {
    openLoginModal();
    return;
  }

  const input = document.getElementById('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  try {
    const res  = await fetch(`${API_BASE}/api/chat/${state.activeChatItemId}`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ message_text: text })
      // Note: NO sender_id, NO receiver_id — server takes from session
    });

    const data = await res.json();

    if (res.status === 401) { openLoginModal(); return; }
    if (!res.ok) { showToast(data.error || 'Send failed.'); return; }

    await loadChat(state.activeChatItemId);
  } catch (err) {
    console.error('Chat send error:', err);
    showToast('Failed to send message');
  }
}

function sendQuickChip(text) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = text; handleSendChat(); }
}

function viewChatProduct() {
  switchTab('buy');
  const card = document.querySelector(`.product-card[data-id="${state.activeChatItemId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.outline = '2px solid var(--brand)';
    setTimeout(() => { card.style.outline = 'none'; }, 2000);
  }
}

function startChatPolling() {
  stopChatPolling();
  state.chatPollingInterval = setInterval(() => {
    if (state.activeTab === 'chat' && state.currentUser && state.activeChatItemId) {
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

// ─── ORDERS VIEW ──────────────────────────────────────────────────────────────
async function loadOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  if (!state.currentUser) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>Sign in to see orders</h3>
        <button class="btn btn-primary" onclick="openLoginModal()">Sign in</button>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/orders`, { credentials: 'include' });

    if (res.status === 401) { openLoginModal(); return; }
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
      const isSeller  = (o.seller_id === state.currentUser.user_id);
      const statusCls = `status-${o.status.toLowerCase()}`;

      let actionsHtml = '';
      if (o.status === 'Pending') {
        if (isSeller) {
          actionsHtml = `
            <div class="order-actions">
              <button class="btn btn-primary btn-block" onclick="updateOrderStatus(${o.order_id}, 'Completed')">
                ✓ Mark Handed Over (Complete)
              </button>
            </div>`;
        } else {
          actionsHtml = `
            <div class="order-actions">
              <button class="btn btn-outline btn-block" onclick="updateOrderStatus(${o.order_id}, 'Cancelled')">
                Cancel Order
              </button>
            </div>`;
        }
      }

      return `
        <div class="order-card">
          <div class="order-top">
            <span class="order-id">Order #${o.order_id}</span>
            <span class="order-status-pill ${statusCls}">${o.status}</span>
          </div>
          <div class="order-title">${escapeHtml(o.item_title)}</div>
          <div class="order-details-grid">
            <div>Total: <strong>₹${o.total}</strong></div>
            <div>Payment: <strong>${escapeHtml(o.payment_method)}</strong></div>
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
    container.innerHTML = `<p style="color:var(--bad)">Failed to load orders.</p>`;
  }
}

async function updateOrderStatus(orderId, status) {
  const btn = event && event.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }

  try {
    const res  = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
      method:      'PATCH',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ status })
    });
    const data = await res.json();

    if (res.status === 401) { openLoginModal(); return; }
    if (!res.ok) {
      showToast(data.error || 'Status update failed.');
      return;
    }

    showToast(`Order #${orderId} marked as ${status}`);
    loadOrders();
    fetchCatalog();
  } catch (err) {
    console.error('Update status error:', err);
    showToast('Failed to update status');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = status === 'Completed' ? '✓ Mark Handed Over (Complete)' : 'Cancel Order'; }
  }
}

// ─── AUTH MODAL (Google) ─────────────────────────────────────────────────────
function openLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';

  // Ensure Google button is rendered
  if (window.google && state.googleClientId) {
    initGoogleSignIn();
  }
}

function closeLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
  state.pendingAction = null;
}

// ─── SVG Graphic Generator ───────────────────────────────────────────────────
function getItemGraphic(type, title) {
  switch (type) {
    case 'book':
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
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="42" y="22" width="76" height="116" rx="14" fill="#1d4ed8" />
          <rect x="52" y="34" width="56" height="32" rx="6" fill="#bfdbfe" />
          <circle cx="58" cy="82" r="6" fill="#f59e0b" /><circle cx="80" cy="82" r="6" fill="#f59e0b" />
          <circle cx="102" cy="82" r="6" fill="#f59e0b" /><circle cx="58" cy="100" r="6" fill="#f59e0b" />
          <circle cx="80" cy="100" r="6" fill="#f59e0b" /><circle cx="102" cy="100" r="6" fill="#f59e0b" />
          <circle cx="58" cy="118" r="6" fill="#f59e0b" /><circle cx="80" cy="118" r="6" fill="#f59e0b" />
          <circle cx="102" cy="118" r="6" fill="#f59e0b" />
        </svg>
      `;
    case 'bucket':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 50L52 130H108L120 50H40Z" fill="#2563eb" />
          <rect x="35" y="44" width="90" height="10" rx="5" fill="#1d4ed8" />
          <path d="M42 46C42 16 118 16 118 46" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" fill="none" />
          <rect x="108" y="90" width="30" height="38" rx="4" fill="#60a5fa" />
          <path d="M138 96C146 96 146 118 138 122" stroke="#1e40af" stroke-width="4" fill="none" />
        </svg>
      `;
    case 'drafter':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="80" cy="80" r="28" fill="#1d4ed8" /><circle cx="80" cy="80" r="14" fill="#ffffff" />
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

// ─── Utilities ────────────────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.getElementById('toast-popup');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
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
