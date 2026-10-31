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
  campuses:            [],
  authChallengeId:     null,
  authTargetEmail:     null,
  resendInterval:      null,
  resendCountdown:     60,

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

  // Razorpay Dynamic UPI Checkout
  activeUpiOrder:      null,
  upiPollingInterval:  null,
  upiTimerInterval:    null,
};

// ─── Initialization ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupViewportHeightFix();
  setupEventListeners();

  // Load config (allowed domain, campuses) before rendering
  try {
    const cfg = await fetch(`${API_BASE}/api/config`).then(r => r.json());
    state.googleClientId = cfg.googleClientId;
    state.allowedDomain  = cfg.allowedDomain;
    state.isDev          = cfg.isDev;
    state.campuses       = cfg.campuses || [];
    if (state.campuses.length > 0) {
      const hintEl = document.getElementById('current-campus-display');
      if (hintEl) hintEl.textContent = state.campuses[0].name;
    }
  } catch {
    console.warn('Could not load /api/config');
  }

  // Try to restore session
  await loadCurrentUser();

  // Fetch catalog (always open)
  fetchCatalog();
  updateCartBadge();

  // Handle URL params for deep linking and testing
  const params = new URLSearchParams(window.location.search);
  const themeParam = params.get('theme');
  if (themeParam === 'light') {
    document.body.classList.remove('dark-mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = '🌙';
  } else if (themeParam === 'dark') {
    document.body.classList.add('dark-mode');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = '☀️';
  }
  const tabParam = params.get('tab');
  if (tabParam && ['buy', 'sell', 'chat', 'orders'].includes(tabParam)) {
    if (params.get('mock_auth') === '1') {
      state.currentUser = { user_id: 1, name: 'Student Tester', hostel_room: 'H7 · Room 101' };
      setCurrentUser(state.currentUser);
    }
    switchTab(tabParam);
  }
  const catParam = params.get('category');
  if (catParam) {
    filterCategory(catParam);
  }
  const itemParam = params.get('item');
  if (itemParam) {
    setTimeout(() => openItemDetails(Number(itemParam)), 600);
  }

  // Diagnostics check when requested via ?run_diagnostics=1
  if (params.get('run_diagnostics') === '1') {
    setTimeout(() => {
      const grid = document.getElementById('catalog-grid');
      const cols = grid ? window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      const cards = document.querySelectorAll('.product-card');
      const cardWidths = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().width));
      const scrollW = document.documentElement.scrollWidth;
      const clientW = window.innerWidth;
      const overflow = scrollW > clientW + 1;
      const wlBtn = document.querySelector('.wishlist-btn');
      const wlRect = wlBtn ? wlBtn.getBoundingClientRect() : null;
      const wlTouch = wlRect ? Math.round(Math.min(wlRect.width, wlRect.height)) : 0;
      const closeBtn = document.querySelector('.close-modal-btn');
      const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
      const closeTouch = closeRect ? Math.round(Math.min(closeRect.width, closeRect.height)) : 0;

      const diag = {
        innerWidth: clientW,
        innerHeight: window.innerHeight,
        scrollWidth: scrollW,
        hasHorizontalOverflow: overflow,
        gridCols: cols,
        cardCount: cards.length,
        cardWidths,
        wishlistTouchTarget: wlTouch,
        closeBtnTouchTarget: closeTouch,
        isDarkMode: document.body.classList.contains('dark-mode')
      };
      let el = document.getElementById('responsive-diagnostics');
      if (!el) {
        el = document.createElement('div');
        el.id = 'responsive-diagnostics';
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      el.textContent = JSON.stringify(diag);
      document.body.setAttribute('data-diagnostics', JSON.stringify(diag));
    }, 1200);
  }

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
  if (user) {
    const sellHostelInput = document.getElementById('item-hostel');
    if (sellHostelInput && !sellHostelInput.value) {
      sellHostelInput.value = user.hostel_room || '';
    }
    const sellPhoneInput = document.getElementById('item-phone');
    if (sellPhoneInput && !sellPhoneInput.value) {
      sellPhoneInput.value = user.phone || '';
    }
  }
  if (user && user.needs_profile) {
    openOnboardingModal();
  }
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

    // Build authenticated dropdown with campus and email change
    if (dropdownEl) {
      dropdownEl.innerHTML = `
        <div class="dropdown-header">Signed in as</div>
        <div class="dropdown-item no-click" style="flex-direction:column;align-items:flex-start;gap:2px;">
          <strong>${escapeHtml(u.name)}</strong>
          <small style="color:var(--brand-text);font-weight:600;font-size:.78rem">🏛 ${escapeHtml(u.campus_name || 'Campus')}</small>
          <small style="color:var(--muted);font-size:.78rem">${escapeHtml(u.email)}</small>
          ${u.hostel_room ? `<small style="color:var(--muted);font-size:.78rem">📍 ${escapeHtml(u.hostel_room)}</small>` : ''}
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
          🔑 College Email Sign In
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
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
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
  const sellPhoneInput = document.getElementById('item-phone');
  if (sellPhoneInput && state.currentUser) {
    sellPhoneInput.value = state.currentUser.phone || '';
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
    if (sellHostelInput && !sellHostelInput.value) sellHostelInput.value = state.currentUser.hostel_room || '';
    const sellPhoneInput = document.getElementById('item-phone');
    if (sellPhoneInput && !sellPhoneInput.value) sellPhoneInput.value = state.currentUser.phone || '';
  }
}

// ─── CATALOG (BUY FEED) ───────────────────────────────────────────────────────
function renderCatalogLoader() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  grid.innerHTML = `
    <!-- From Uiverse.io by KSAplay -->
    <div class="catalog-loader-container">
      <div class="loader">
        <div class="loading-text">
          Loading<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
        </div>
        <div class="loading-bar-background">
          <div class="loading-bar">
            <div class="white-bars-container">
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
              <div class="white-bar"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
const renderCatalogSkeleton = renderCatalogLoader;

async function fetchCatalog() {
  const grid = document.getElementById('catalog-grid');
  const emptyState = document.getElementById('empty-catalog');
  if (emptyState) emptyState.style.display = 'none';
  if (grid && (!state.items || state.items.length === 0)) {
    renderCatalogLoader();
  }

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
    const isOwner       = Boolean(state.currentUser && item.seller_id === state.currentUser.user_id);
    const publicHostel  = getPublicHostel(item.hostel_room);

    // Deterministic avatar colour from name
    const colours = ['avatar-orange', 'avatar-karan', 'avatar-rahul'];
    const avatarClass = colours[(item.seller_id || 0) % colours.length];

    let imageContent;
    if (item.image_url) {
      imageContent = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="handleImageError(this, '${escapeHtml(item.image_type || 'default')}')">`;
    } else {
      imageContent = getItemGraphic(item.image_type || 'default', item.title);
    }

    return `
      <div class="product-card" data-id="${item.item_id}">
        <div class="card-top-row">
          <div class="card-badges-wrap">
            <span class="status-badge status-${(item.status || 'available').toLowerCase()}"><span class="status-dot"></span>${escapeHtml(item.status || 'Available')}</span>
            <span class="condition-badge">${escapeHtml(item.condition || 'Good')}</span>
          </div>
          <button class="wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist(${item.item_id})" aria-label="Toggle favorite">
            ${isWishlisted ? '♥' : '♡'}
          </button>
        </div>

        <div class="product-visual-box" onclick="openItemDetails(${item.item_id})">
          ${imageContent}
        </div>

        <div class="card-info" onclick="openItemDetails(${item.item_id})" style="cursor:pointer;">
          <h3 class="product-title">${escapeHtml(item.title)}</h3>
          <div class="product-price">₹${item.price}</div>
          <div class="product-seller-row">
            <span class="seller-avatar ${avatarClass}">${sellerInitial}</span>
            <span class="seller-text">${escapeHtml(item.seller_name)} · 📍 ${escapeHtml(publicHostel)}</span>
          </div>
        </div>

        <div class="card-actions-grid">
          <button class="btn btn-primary" onclick="addToCart(${item.item_id})">
            Make Deal
          </button>
          ${isOwner ? `
            <button class="btn btn-outline btn-seller-controls" onclick="openSellerControlsModal(${item.item_id})">
              ⚙️ Seller Controls
            </button>
          ` : `
            <button class="btn btn-outline" onclick="openItemChat(${item.item_id})">
              Chat
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function filterCategory(catName) {
  state.currentCategory = catName;
  document.querySelectorAll('.cat-pill').forEach(pill => {
    const pillCat = pill.getAttribute('data-cat') || pill.textContent.trim();
    const isActive = (catName === 'All' && (pillCat === 'All' || pillCat.toLowerCase() === 'all'))
      || (pillCat.toLowerCase() === catName.toLowerCase());
    pill.classList.toggle('active', isActive);
  });
  fetchCatalog();
}

let searchDebounceTimer = null;
function handleSearch(val) {
  state.searchQuery = val.trim();
  const clearBtn = document.getElementById('clear-search');
  if (clearBtn) clearBtn.style.display = state.searchQuery ? 'block' : 'none';
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchCatalog();
  }, 250);
}

function clearSearch() {
  const input = document.getElementById('catalog-search');
  if (input) input.value = '';
  handleSearch('');
}

function handleImageError(img, type) {
  if (!img) return;
  img.onerror = null;
  const parent = img.parentElement;
  if (!parent) return;
  parent.innerHTML = getItemGraphic(type || 'default', '');
}
window.handleImageError = handleImageError;

function openItemDetails(itemId) {
  const item = state.items.find(i => i.item_id === Number(itemId));
  if (!item) return;

  const modal = document.getElementById('item-details-modal');
  const body = document.getElementById('item-modal-content');
  if (!modal || !body) return;

  const sellerInitial = (item.seller_name || 'S').charAt(0);
  const colours = ['avatar-orange', 'avatar-karan', 'avatar-rahul'];
  const avatarClass = colours[(item.seller_id || 0) % colours.length];
  const isOwner = Boolean(state.currentUser && item.seller_id === state.currentUser.user_id);
  const publicHostel = getPublicHostel(item.hostel_room);

  let visualHtml;
  if (item.image_url) {
    visualHtml = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" onerror="handleImageError(this, '${escapeHtml(item.image_type || 'default')}')" style="max-height:220px; width:100%; object-fit:contain; border-radius:var(--r-md); background:var(--sub); padding:6px;">`;
  } else {
    visualHtml = `<div style="height:150px; display:grid; place-items:center; background:var(--sub); border-radius:var(--r-md);">${getItemGraphic(item.image_type || 'default', item.title)}</div>`;
  }

  body.innerHTML = `
    <div style="margin-bottom:14px; text-align:center;">
      ${visualHtml}
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div style="display:flex; gap:6px; align-items:center;">
        <span class="status-badge status-available"><span class="status-dot"></span>${escapeHtml(item.status || 'Available')}</span>
        <span class="condition-badge">${escapeHtml(item.condition || 'Good')}</span>
      </div>
      <span style="font-size:0.85rem; color:var(--muted); font-weight:600;">📁 ${escapeHtml(item.category || 'General')}</span>
    </div>
    <h2 style="font-size:1.35rem; font-weight:800; margin:0 0 10px; line-height:1.25; color:var(--text);">${escapeHtml(item.title)}</h2>
    <div class="product-price" style="font-size:1.5rem; font-weight:800; color:var(--text); margin-bottom:12px;">₹${item.price}</div>
    
    <div style="background:var(--sub); border:1px solid var(--line); border-radius:var(--r-md); padding:12px; margin-bottom:14px;">
      <div style="font-size:0.78rem; text-transform:uppercase; font-weight:700; color:var(--muted); margin-bottom:4px;">Seller Details</div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="seller-avatar ${avatarClass}" style="width:28px; height:28px; font-size:0.8rem;">${sellerInitial}</span>
        <div>
          <div style="font-weight:700; font-size:0.92rem;">${escapeHtml(item.seller_name)}</div>
          <div style="font-size:0.8rem; color:var(--muted);">📍 ${escapeHtml(publicHostel)} <span style="font-size:0.75rem; color:var(--muted); opacity:0.85;">(Room details shared privately upon deal)</span></div>
        </div>
      </div>
    </div>

    ${item.details ? `
      <div style="margin-bottom:18px;">
        <div style="font-size:0.82rem; font-weight:700; margin-bottom:4px; color:var(--text);">Description & Notes</div>
        <p style="font-size:0.9rem; color:var(--muted); line-height:1.45; white-space:pre-wrap; margin:0; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); padding:10px;">${escapeHtml(item.details)}</p>
      </div>
    ` : ''}

    <div class="modal-actions-grid">
      <button class="btn btn-primary btn-lg" onclick="closeItemDetailsModal(); addToCart(${item.item_id})">
        Make Deal
      </button>
      ${isOwner ? `
        <button class="btn btn-outline btn-lg btn-seller-controls" onclick="closeItemDetailsModal(); openSellerControlsModal(${item.item_id})">
          ⚙️ Seller Controls
        </button>
      ` : `
        <button class="btn btn-outline btn-lg" onclick="closeItemDetailsModal(); openItemChat(${item.item_id})">
          💬 Chat Seller
        </button>
      `}
    </div>
    </div>
  `;

  modal.style.display = 'flex';
}

function closeItemDetailsModal() {
  const modal = document.getElementById('item-details-modal');
  if (modal) modal.style.display = 'none';
}

function handlePhotoSelect(event) {
  const file = event.target.files && event.target.files[0];
  const previewContainer = document.getElementById('photo-preview-container');
  const previewImg = document.getElementById('photo-preview-img');

  if (!file) {
    if (previewContainer) previewContainer.style.display = 'none';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast('Image exceeds 5MB limit. Please select a smaller photo.');
    event.target.value = '';
    if (previewContainer) previewContainer.style.display = 'none';
    return;
  }

  if (previewImg && previewContainer) {
    previewImg.src = URL.createObjectURL(file);
    previewContainer.style.display = 'block';
  }
}

function removeSelectedPhoto() {
  const input = document.getElementById('item-photo');
  const previewContainer = document.getElementById('photo-preview-container');
  const previewImg = document.getElementById('photo-preview-img');
  if (input) input.value = '';
  if (previewImg) previewImg.src = '';
  if (previewContainer) previewContainer.style.display = 'none';
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
    showToast("You can't make a deal on your own listing (can't chat or deal with yourself).");
    return;
  }

  const existing = state.cart.find(c => c.item_id === Number(itemId));
  if (existing) {
    showToast(`"${item.title}" is already in your deal.`);
    openCart();
    return;
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
  showToast(`Added "${item.title}" to deal`);
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
  // Unique listing: quantity cannot exceed 1
  if (delta > 0) return;
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
    const lineTotal = item.price * (item.quantity || 1);
    grandTotal += lineTotal;
    return `
      <div class="cart-item-row">
        <div class="cart-item-name">${escapeHtml(item.title)}</div>
        <div class="cart-qty-control" title="Single unique listing">
          <button class="qty-btn" onclick="changeCartQty(${item.item_id}, -1)" title="Remove from deal" aria-label="Remove ${escapeHtml(item.title)} from deal">−</button>
          <span class="qty-value">${item.quantity || 1}</span>
        </div>
        <div class="cart-item-price">₹${lineTotal}</div>
      </div>
    `;
  }).join('');

  if (totalEl) totalEl.textContent = `₹${grandTotal}`;
  handlePaymentMethodChange();
}

function handlePaymentMethodChange() {
  const payMethodEl = document.querySelector('input[name="payment_method"]:checked');
  const method = payMethodEl ? payMethodEl.value : 'Cash';
  const btn = document.getElementById('drawer-action-btn') || document.querySelector('.place-order-btn');
  const pill = document.getElementById('free-delivery-pill');

  if (method === 'UPI') {
    if (btn) {
      btn.innerHTML = `<span>Proceed to UPI Checkout</span> <span style="font-size:1.1rem; margin-left:6px;">➔</span>`;
      btn.style.background = 'linear-gradient(135deg, var(--brand) 0%, #2b1ea8 100%)';
    }
    if (pill) {
      pill.innerHTML = `<span class="pill-dot">⚡</span> Dynamic Razorpay UPI QR • Instant Verification`;
    }
  } else {
    if (btn) {
      btn.textContent = 'Confirm Deal';
      btn.style.background = '';
    }
    if (pill) {
      pill.innerHTML = `<span class="pill-dot">🤝</span> Direct Peer-to-Peer Meetup & Payment`;
    }
  }
}

function handleDrawerAction() {
  const payMethodEl = document.querySelector('input[name="payment_method"]:checked');
  const method = payMethodEl ? payMethodEl.value : 'Cash';
  if (method === 'UPI') {
    openUpiCheckout();
  } else {
    handlePlaceOrder();
  }
}

async function handlePlaceOrder() {
  if (!state.currentUser) {
    state.pendingAction = () => handlePlaceOrder();
    openLoginModal();
    return;
  }
  if (state.cart.length === 0) {
    showToast('Your deal is empty!');
    return;
  }

  const payMethodEl   = document.querySelector('input[name="payment_method"]:checked');
  const paymentMethod = payMethodEl ? payMethodEl.value : 'Cash';

  if (paymentMethod === 'UPI') {
    openUpiCheckout();
    return;
  }

  const hostelRoom   = document.getElementById('checkout-hostel-room').value.trim()
                     || state.currentUser.hostel_room;
  const pickupGate   = document.getElementById('checkout-pickup-gate').value;

  const btn = document.querySelector('.place-order-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming deal…'; }

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
      showToast(data.error || 'Deal confirmation failed. Please try again.');
      return;
    }

    state.cart = [];
    updateCartBadge();
    closeCart();
    showToast('🎉 Deal placed! Coordinate with seller for meetup.');
    switchTab('orders');
  } catch (err) {
    console.error('Error placing deal:', err);
    showToast('Failed to place deal. Please try again.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Deal'; }
  }
}

// ─── RAZORPAY DYNAMIC UPI CHECKOUT CONTROLLER ────────────────────────────────

async function openUpiCheckout() {
  if (!state.currentUser) {
    state.pendingAction = () => openUpiCheckout();
    openLoginModal();
    return;
  }
  if (!state.cart || state.cart.length === 0) {
    showToast('Your deal is empty!');
    return;
  }

  const hostelRoom = (document.getElementById('checkout-hostel-room')?.value || '').trim()
                     || state.currentUser.hostel_room;
  if (!hostelRoom) {
    showToast('Please enter your hostel and room number');
    document.getElementById('checkout-hostel-room')?.focus();
    return;
  }

  const pickupGate = document.getElementById('checkout-pickup-gate')?.value || 'Hostel Gate 7 (Boys)';

  const drawerBtn = document.getElementById('drawer-action-btn') || document.querySelector('.place-order-btn');
  if (drawerBtn) {
    drawerBtn.disabled = true;
    drawerBtn.textContent = 'Generating Razorpay QR…';
  }

  // Open modal in loading state
  closeCart();
  const modal = document.getElementById('upi-checkout-modal');
  const content = document.getElementById('upi-checkout-content');
  if (modal) modal.style.display = 'flex';
  if (content) {
    content.innerHTML = `
      <div class="checkout-loading-state">
        <div class="checkout-spinner"></div>
        <p class="font-bold" style="margin-top:16px; font-size:1.05rem;">Generating Dynamic UPI QR…</p>
        <p class="text-muted" style="font-size:0.88rem; margin-top:4px;">Connecting to Razorpay Payments Network</p>
      </div>
    `;
  }

  try {
    const payload = {
      items: state.cart.map(c => ({ item_id: c.item_id, quantity: c.quantity })),
      pickup_location: pickupGate,
      hostel_room: hostelRoom
    };

    const res = await fetch(`${API_BASE}/api/payments/razorpay/create-qr`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      if (modal) modal.style.display = 'none';
      openCart();
      showToast(data.error || 'Failed to initialize UPI checkout.');
      return;
    }

    state.activeUpiOrder = data;
    renderUpiCheckoutContent(data);
    startUpiTimer(data.close_by);
    startUpiPolling(data.qr_id);
    fetchCatalog(); // Refresh catalog to reflect 'Reserved' status

  } catch (err) {
    console.error('Error starting UPI checkout:', err);
    if (modal) modal.style.display = 'none';
    openCart();
    showToast('Network error while connecting to Razorpay.');
  } finally {
    if (drawerBtn) {
      drawerBtn.disabled = false;
      handlePaymentMethodChange();
    }
  }
}

function renderUpiCheckoutContent(data) {
  const content = document.getElementById('upi-checkout-content');
  if (!content) return;

  const itemTitle = data.item_title || (state.cart[0] && state.cart[0].title) || 'Campus Listing';
  const amount = data.amount;

  content.innerHTML = `
    <div class="checkout-deal-summary-strip">
      <div class="deal-item-info">
        <div class="deal-item-title">${escapeHtml(itemTitle)}</div>
        <div class="deal-meetup-loc">📍 Meetup: <strong>${escapeHtml(data.pickup_location)}</strong> · Room: ${escapeHtml(data.hostel_room)}</div>
      </div>
      <div class="deal-amount-tag">₹${amount}</div>
    </div>

    <div class="qr-presentation-card">
      <div class="qr-scan-instruction">
        <span class="qr-instruction-tag">Scan & Pay ₹${amount}</span>
      </div>

      <div class="qr-code-frame">
        <div class="qr-corner top-left"></div>
        <div class="qr-corner top-right"></div>
        <div class="qr-corner bottom-left"></div>
        <div class="qr-corner bottom-right"></div>
        <img class="dynamic-qr-image" src="${escapeHtml(data.image_url)}" alt="Razorpay Dynamic UPI QR Code" />
      </div>

      <div class="qr-meta-row">
        <div class="qr-timer-pill" id="qr-countdown-pill">
          <span class="timer-icon">⏱️</span> Expires in <strong id="qr-timer-display">15:00</strong>
        </div>
        <div class="qr-status-pulse">
          <span class="pulse-indicator"></span>
          <span>Awaiting UPI payment…</span>
        </div>
      </div>
      <div class="qr-id-subtext">Single-use dynamic QR: <code>${escapeHtml(data.qr_id)}</code></div>
    </div>

    <!-- Supported UPI apps -->
    <div class="upi-apps-container">
      <div class="upi-apps-label">Pay with any UPI app</div>
      <div class="upi-apps-row">
        <span class="upi-app-badge gpay">Google Pay</span>
        <span class="upi-app-badge phonepe">PhonePe</span>
        <span class="upi-app-badge paytm">Paytm</span>
        <span class="upi-app-badge bhim">BHIM</span>
        <span class="upi-app-badge cred">CRED</span>
      </div>
    </div>

    <!-- Mobile Deep Link / Intent -->
    ${data.upi_intent_url ? `
      <div style="margin-top:14px;">
        <a class="btn btn-outline btn-block upi-intent-link" href="${escapeHtml(data.upi_intent_url)}">
          📱 Tap to Open UPI App on Mobile
        </a>
      </div>
    ` : ''}

    <div class="checkout-footer-actions">
      <button class="btn btn-ghost checkout-cancel-btn" onclick="cancelUpiCheckout()">
        Cancel Payment & Return
      </button>
    </div>
  `;
}

function startUpiTimer(closeByEpoch) {
  if (state.upiTimerInterval) clearInterval(state.upiTimerInterval);

  function update() {
    const now = Math.floor(Date.now() / 1000);
    const remaining = Math.max(0, closeByEpoch - now);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const disp = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    const timerEl = document.getElementById('qr-timer-display');
    if (timerEl) timerEl.textContent = disp;

    if (remaining <= 0) {
      clearInterval(state.upiTimerInterval);
      state.upiTimerInterval = null;
      if (state.upiPollingInterval) {
        clearInterval(state.upiPollingInterval);
        state.upiPollingInterval = null;
      }
      const pill = document.getElementById('qr-countdown-pill');
      if (pill) {
        pill.innerHTML = `⚠️ <span style="color:var(--bad)">QR Code Expired</span>`;
      }
      showToast('QR code has expired. Please create a new checkout.');
    }
  }

  update();
  state.upiTimerInterval = setInterval(update, 1000);
}

function startUpiPolling(qrId) {
  if (state.upiPollingInterval) clearInterval(state.upiPollingInterval);

  state.upiPollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/payments/razorpay/qr-status/${qrId}`, {
        credentials: 'include'
      });
      if (!res.ok) return;

      const data = await res.json();
      if (data.paid === true) {
        if (state.upiPollingInterval) {
          clearInterval(state.upiPollingInterval);
          state.upiPollingInterval = null;
        }
        if (state.upiTimerInterval) {
          clearInterval(state.upiTimerInterval);
          state.upiTimerInterval = null;
        }
        handleUpiSuccess(data);
      }
    } catch (err) {
      console.warn('[UPI Poll error]', err);
    }
  }, 2500);
}

function handleUpiSuccess(data) {
  const content = document.getElementById('upi-checkout-content');
  if (content) {
    content.innerHTML = `
      <div class="checkout-success-view">
        <div class="success-checkmark-circle">✓</div>
        <h3 class="success-title">Payment Received & Verified!</h3>
        <p class="success-subtitle">Your dynamic UPI deal is confirmed via Razorpay.</p>

        <div class="success-receipt-card">
          <div class="receipt-row">
            <span>Order Number</span>
            <strong>#${data.order_id}</strong>
          </div>
          <div class="receipt-row">
            <span>Payment Method</span>
            <strong>Razorpay UPI</strong>
          </div>
          <div class="receipt-row">
            <span>Payment ID</span>
            <code class="payment-id-code">${escapeHtml(data.payment_id || 'rzp_verified')}</code>
          </div>
          <div class="receipt-row">
            <span>Status</span>
            <span class="order-status-pill status-completed">Paid · Meetup Pending</span>
          </div>
        </div>

        <button class="btn btn-primary btn-block btn-lg" style="margin-top:20px;" onclick="finishUpiSuccess()">
          View in My Orders ➔
        </button>
      </div>
    `;
  }

  // Clear cart
  state.cart = [];
  updateCartBadge();
  showToast('🎉 Payment verified! Deal confirmed with seller.');

  setTimeout(() => {
    const modal = document.getElementById('upi-checkout-modal');
    if (modal && modal.style.display !== 'none') {
      finishUpiSuccess();
    }
  }, 3200);
}

function finishUpiSuccess() {
  const modal = document.getElementById('upi-checkout-modal');
  if (modal) modal.style.display = 'none';
  state.activeUpiOrder = null;
  switchTab('orders');
  loadOrders();
  fetchCatalog();
}

async function cancelUpiCheckout() {
  if (!state.activeUpiOrder) {
    closeUpiCheckoutModal();
    return;
  }

  const qrId = state.activeUpiOrder.qr_id;
  if (state.upiPollingInterval) { clearInterval(state.upiPollingInterval); state.upiPollingInterval = null; }
  if (state.upiTimerInterval) { clearInterval(state.upiTimerInterval); state.upiTimerInterval = null; }

  const modal = document.getElementById('upi-checkout-modal');
  if (modal) modal.style.display = 'none';
  state.activeUpiOrder = null;

  try {
    await fetch(`${API_BASE}/api/payments/razorpay/cancel-qr`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_id: qrId })
    });
    showToast('UPI checkout cancelled. Listing released.');
    fetchCatalog();
  } catch (err) {
    console.warn('[Cancel QR Error]', err);
  }
}

function closeUpiCheckoutModal() {
  if (state.activeUpiOrder) {
    if (confirm('Cancel this pending UPI checkout? The listing will be released.')) {
      cancelUpiCheckout();
    }
  } else {
    const modal = document.getElementById('upi-checkout-modal');
    if (modal) modal.style.display = 'none';
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
  const phoneEl    = document.getElementById('item-phone');
  const phone      = phoneEl ? phoneEl.value.trim() : '';
  const details    = document.getElementById('item-details').value.trim();
  const imgTypeEl  = document.querySelector('input[name="image_type"]:checked');
  const image_type = imgTypeEl ? imgTypeEl.value : 'default';
  const photoInput = document.getElementById('item-photo');

  if (!title || !price) { showToast('Please fill in required fields'); return; }

  if (!category) {
    showToast('Please select a category.');
    const catEl = document.getElementById('item-category');
    if (catEl) catEl.focus();
    return;
  }

  if (!photoInput || !photoInput.files || !photoInput.files[0]) {
    showToast('Please attach a photo of the item.');
    if (photoInput) photoInput.focus();
    return;
  }

  if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    showToast('Please enter a valid 10-digit Indian mobile number.');
    if (phoneEl) phoneEl.focus();
    return;
  }

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
    if (phone) {
      formData.append('phone', phone);
    }
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

    if (phone && state.currentUser) {
      state.currentUser.phone = phone;
    }

    showToast('✅ Item listed for sale!');
    document.getElementById('sell-form').reset();
    document.getElementById('item-category').value = '';
    removeSelectedPhoto();
    document.getElementById('item-hostel').value = state.currentUser.hostel_room || '';
    if (document.getElementById('item-phone')) {
      document.getElementById('item-phone').value = state.currentUser.phone || '';
    }
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

  const wasScrolledToBottom = (stream.scrollHeight - stream.clientHeight) <= (stream.scrollTop + 60);

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

  if (wasScrolledToBottom) {
    stream.scrollTop = stream.scrollHeight;
  }
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
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to load orders');
    }

    const orders = await res.json();

    if (!Array.isArray(orders) || orders.length === 0) {
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
            <span class="order-status-pill ${statusCls}"><span class="status-dot"></span>${o.status}</span>
          </div>
          <div class="order-title">${escapeHtml(o.item_title)}</div>
          <div class="order-details-grid">
            <div>Total: <strong>₹${o.total}</strong></div>
            <div>Payment: <strong>${escapeHtml(o.payment_method)}</strong> ${o.payment_status === 'Paid' ? '<span class="order-status-pill status-completed" style="font-size:0.72rem; padding:2px 7px; margin-left:4px;"><span class="status-dot"></span>Paid</span>' : ''}</div>
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
    container.innerHTML = `
      <div class="empty-state">
        <p style="color:var(--bad); font-weight:600; margin-bottom:10px;">Failed to load orders.</p>
        <button class="btn btn-outline btn-sm" onclick="loadOrders()">Retry</button>
      </div>
    `;
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

// ─── AUTH MODAL & COLLEGE PASSWORDLESS FLOW ──────────────────────────────────
function openLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
  backToEmailStep();
  initGoogleSignIn();
  const input = document.getElementById('auth-email-input');
  if (input) setTimeout(() => input.focus(), 100);
}

function closeLoginModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
  if (state.resendInterval) {
    clearInterval(state.resendInterval);
    state.resendInterval = null;
  }
  state.pendingAction = null;
}

function backToEmailStep() {
  const stepEmail = document.getElementById('auth-step-email');
  const stepCode = document.getElementById('auth-step-code');
  const errEmail = document.getElementById('auth-request-error');
  const errCode = document.getElementById('auth-verify-error');
  if (stepEmail) stepEmail.style.display = 'block';
  if (stepCode) stepCode.style.display = 'none';
  if (errEmail) errEmail.style.display = 'none';
  if (errCode) errCode.style.display = 'none';
  if (state.resendInterval) {
    clearInterval(state.resendInterval);
    state.resendInterval = null;
  }
}

async function handleRequestCodeSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('auth-email-input');
  const errorEl = document.getElementById('auth-request-error');
  const btn = document.getElementById('btn-request-code');
  const email = (input ? input.value : '').trim();

  if (!email) return;
  if (errorEl) errorEl.style.display = 'none';

  // Strict College Email Only Validation: Only @mitsgwl.ac.in
  const emailLower = email.toLowerCase();
  const atIndex = emailLower.lastIndexOf('@');
  const domainPart = atIndex !== -1 ? emailLower.slice(atIndex + 1) : '';
  if (!domainPart || (domainPart !== 'mitsgwl.ac.in' && !domainPart.endsWith('.mitsgwl.ac.in'))) {
    if (errorEl) {
      errorEl.textContent = 'Only official MITS Gwalior college emails (@mitsgwl.ac.in) are permitted. Personal email accounts (Gmail, Yahoo, etc.) and unauthorized addresses cannot receive verification codes.';
      errorEl.style.display = 'block';
    }
    if (input) input.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending Code...';
  }

  try {
    const res = await fetch(`${API_BASE}/auth/request-code`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.error || 'Failed to send code.';
        errorEl.style.display = 'block';
      }
      return;
    }

    state.authChallengeId = data.challenge_id;
    state.authTargetEmail = email;

    // Switch to Step 2 (Code Entry)
    const stepEmail = document.getElementById('auth-step-email');
    const stepCode = document.getElementById('auth-step-code');
    const targetEmailEl = document.getElementById('auth-target-email');
    const codeInput = document.getElementById('auth-code-input');

    if (stepEmail) stepEmail.style.display = 'none';
    if (stepCode) stepCode.style.display = 'block';
    if (targetEmailEl) targetEmailEl.textContent = email;
    if (codeInput) {
      codeInput.value = '';
      setTimeout(() => codeInput.focus(), 100);
    }

    startResendTimer();
    showToast('Verification code dispatched to your inbox ✉️');
  } catch (err) {
    console.error('Request code error:', err);
    if (errorEl) {
      errorEl.textContent = 'Network error while requesting verification code.';
      errorEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send 6-Digit Code';
    }
  }
}

async function handleVerifyCodeSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('auth-code-input');
  const errorEl = document.getElementById('auth-verify-error');
  const btn = document.getElementById('btn-verify-code');
  const code = (input ? input.value : '').trim();

  if (!code || !state.authChallengeId) return;
  if (errorEl) errorEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
  }

  try {
    const res = await fetch(`${API_BASE}/auth/verify-code`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_id: state.authChallengeId,
        code
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.error || 'Verification failed.';
        errorEl.style.display = 'block';
      }
      return;
    }

    closeLoginModal();
    setCurrentUser(data.user);
    await loadServerWishlist();
    showToast(`Welcome, ${data.user.name.split(' ')[0]}! 👋`);

    if (data.needs_profile) {
      openOnboardingModal();
      return;
    }

    if (state.pendingAction) {
      const action = state.pendingAction;
      state.pendingAction = null;
      action();
    }
  } catch (err) {
    console.error('Verify code error:', err);
    if (errorEl) {
      errorEl.textContent = 'Network error while verifying code.';
      errorEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify & Sign In';
    }
  }
}

function startResendTimer() {
  if (state.resendInterval) clearInterval(state.resendInterval);
  state.resendCountdown = 60;

  const timerText = document.getElementById('resend-cooldown-text');
  const countdownEl = document.getElementById('resend-countdown');
  const resendBtn = document.getElementById('resend-btn');

  if (timerText) timerText.style.display = 'inline';
  if (resendBtn) resendBtn.style.display = 'none';
  if (countdownEl) countdownEl.textContent = '60';

  state.resendInterval = setInterval(() => {
    state.resendCountdown--;
    if (countdownEl) countdownEl.textContent = String(state.resendCountdown);
    if (state.resendCountdown <= 0) {
      clearInterval(state.resendInterval);
      state.resendInterval = null;
      if (timerText) timerText.style.display = 'none';
      if (resendBtn) resendBtn.style.display = 'inline';
    }
  }, 1000);
}

async function handleResendCode() {
  if (!state.authTargetEmail) return;
  const resendBtn = document.getElementById('resend-btn');
  if (resendBtn) resendBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/request-code`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.authTargetEmail })
    });
    const data = await res.json();
    if (res.ok) {
      state.authChallengeId = data.challenge_id;
      startResendTimer();
      showToast('New verification code sent ✉️');
    } else {
      showToast(data.error || 'Failed to resend code');
    }
  } catch {
    showToast('Network error during resend');
  } finally {
    if (resendBtn) resendBtn.disabled = false;
  }
}

// ─── Onboarding Modal ─────────────────────────────────────────────────────────

function openOnboardingModal() {
  const modal = document.getElementById('onboarding-modal');
  if (modal) modal.style.display = 'flex';
  if (state.currentUser) {
    const nameInput = document.getElementById('onboarding-name');
    const hostelInput = document.getElementById('onboarding-hostel');
    if (nameInput && state.currentUser.name && !nameInput.value) {
      nameInput.value = state.currentUser.name;
    }
    if (hostelInput && state.currentUser.hostel_room && !hostelInput.value) {
      hostelInput.value = state.currentUser.hostel_room;
    }
  }
}

function closeOnboardingModal() {
  const modal = document.getElementById('onboarding-modal');
  if (modal) modal.style.display = 'none';
}

async function handleOnboardingSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('onboarding-name').value.trim();
  const hostel_room = document.getElementById('onboarding-hostel').value.trim();
  const accept_terms = document.getElementById('onboarding-terms').checked;

  if (!accept_terms) {
    showToast('Please accept the Terms of Service to continue.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/me/complete-profile`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, hostel_room, accept_terms })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Could not complete profile.');
      return;
    }

    setCurrentUser(data.user);
    closeOnboardingModal();
    showToast('Profile completed! Welcome to MitShop 🎉');

    if (state.pendingAction) {
      const action = state.pendingAction;
      state.pendingAction = null;
      action();
    }
  } catch (err) {
    showToast('Failed to save profile.');
  }
}

// ─── Campus Request Modal ─────────────────────────────────────────────────────

function openCampusRequestModal(e) {
  if (e && e.preventDefault) e.preventDefault();
  const authModal = document.getElementById('auth-modal');
  if (authModal) authModal.style.display = 'none';
  const modal = document.getElementById('campus-request-modal');
  if (modal) modal.style.display = 'flex';
}

function closeCampusRequestModal() {
  const modal = document.getElementById('campus-request-modal');
  if (modal) modal.style.display = 'none';
}

async function handleCampusRequestSubmit(event) {
  event.preventDefault();
  const campus_name = document.getElementById('req-campus-name').value.trim();
  const domain = document.getElementById('req-campus-domain').value.trim();
  const contact_email = document.getElementById('req-contact-email').value.trim();
  const notes = document.getElementById('req-notes').value.trim();

  try {
    const res = await fetch(`${API_BASE}/campuses/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campus_name, domain, contact_email, notes })
    });
    const data = await res.json();
    if (res.ok) {
      closeCampusRequestModal();
      showToast(data.message || 'Campus request submitted! 🏫');
    } else {
      showToast(data.error || 'Submission failed');
    }
  } catch {
    showToast('Network error submitting request');
  }
}

// ─── Email Change Modal ───────────────────────────────────────────────────────

let emailChangeTxId = null;

function openEmailChangeModal() {
  const modal = document.getElementById('email-change-modal');
  if (modal) modal.style.display = 'flex';
  const step1 = document.getElementById('email-change-step-1');
  const step2 = document.getElementById('email-change-step-2');
  if (step1) step1.style.display = 'block';
  if (step2) step2.style.display = 'none';
  const err1 = document.getElementById('email-change-req-error');
  const err2 = document.getElementById('email-change-verify-error');
  if (err1) err1.style.display = 'none';
  if (err2) err2.style.display = 'none';
}

function closeEmailChangeModal() {
  const modal = document.getElementById('email-change-modal');
  if (modal) modal.style.display = 'none';
}

async function handleEmailChangeRequest(event) {
  event.preventDefault();
  const input = document.getElementById('email-change-new-input');
  const errorEl = document.getElementById('email-change-req-error');
  const new_email = (input ? input.value : '').trim();

  if (!new_email) return;
  if (errorEl) errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/auth/email-change/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_email })
    });
    const data = await res.json();

    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.error || 'Failed to request email change.';
        errorEl.style.display = 'block';
      }
      return;
    }

    emailChangeTxId = data.transaction_id;
    const step1 = document.getElementById('email-change-step-1');
    const step2 = document.getElementById('email-change-step-2');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
    showToast('Codes sent to your current and new email addresses ✉️');
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = 'Network error requesting change.';
      errorEl.style.display = 'block';
    }
  }
}

async function handleEmailChangeVerify(event) {
  event.preventDefault();
  const oldCode = document.getElementById('email-change-old-code').value.trim();
  const newCode = document.getElementById('email-change-new-code').value.trim();
  const errorEl = document.getElementById('email-change-verify-error');

  if (!oldCode || !newCode || !emailChangeTxId) return;
  if (errorEl) errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/auth/email-change/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: emailChangeTxId,
        old_code: oldCode,
        new_code: newCode
      })
    });
    const data = await res.json();

    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.error || 'Email change verification failed.';
        errorEl.style.display = 'block';
      }
      return;
    }

    setCurrentUser(data.user);
    closeEmailChangeModal();
    showToast('College email updated successfully! ✓');
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = 'Network error confirming email change.';
      errorEl.style.display = 'block';
    }
  }
}

// ─── SVG Graphic Generator ───────────────────────────────────────────────────
function getItemGraphic(type, title) {
  switch (type) {
    case 'book':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="35" y="24" width="75" height="110" rx="8" fill="#245B3C" />
          <path d="M42 24H35V134H42C44 134 45 133 45 130V28C45 25 44 24 42 24Z" fill="#1C482F" />
          <rect x="58" y="48" width="38" height="8" rx="4" fill="#ffffff" />
          <rect x="58" y="64" width="26" height="6" rx="3" fill="#ffffff" opacity="0.9" />
          <rect x="96" y="38" width="36" height="92" rx="7" fill="#A67618" />
          <rect x="104" y="52" width="20" height="4" rx="2" fill="#8D6312" opacity="0.5" />
        </svg>
      `;
    case 'calculator':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="42" y="22" width="76" height="116" rx="14" fill="#245B3C" />
          <rect x="52" y="34" width="56" height="32" rx="6" fill="#E4EEE2" />
          <circle cx="58" cy="82" r="6" fill="#A67618" /><circle cx="80" cy="82" r="6" fill="#A67618" />
          <circle cx="102" cy="82" r="6" fill="#A67618" /><circle cx="58" cy="100" r="6" fill="#A67618" />
          <circle cx="80" cy="100" r="6" fill="#A67618" /><circle cx="102" cy="100" r="6" fill="#A67618" />
          <circle cx="58" cy="118" r="6" fill="#A67618" /><circle cx="80" cy="118" r="6" fill="#A67618" />
          <circle cx="102" cy="118" r="6" fill="#A67618" />
        </svg>
      `;
    case 'bucket':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 50L52 130H108L120 50H40Z" fill="#2F6D4A" />
          <rect x="35" y="44" width="90" height="10" rx="5" fill="#245B3C" />
          <path d="M42 46C42 16 118 16 118 46" stroke="#A67618" stroke-width="6" stroke-linecap="round" fill="none" />
          <rect x="108" y="90" width="30" height="38" rx="4" fill="#A3C9A8" />
          <path d="M138 96C146 96 146 118 138 122" stroke="#1C482F" stroke-width="4" fill="none" />
        </svg>
      `;
    case 'drafter':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="80" cy="80" r="28" fill="#245B3C" /><circle cx="80" cy="80" r="14" fill="#ffffff" />
          <line x1="80" y1="52" x2="80" y2="18" stroke="#59665E" stroke-width="8" stroke-linecap="round" />
          <line x1="80" y1="18" x2="35" y2="40" stroke="#8A9990" stroke-width="6" stroke-linecap="round" />
          <rect x="25" y="76" width="110" height="8" rx="4" fill="#A67618" />
          <rect x="76" y="25" width="8" height="110" rx="4" fill="#A67618" />
        </svg>
      `;
    case 'kettle':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 60C50 48 62 44 80 44C98 44 110 48 110 60L114 125H46L50 60Z" fill="#ABB9AF" />
          <rect x="65" y="36" width="30" height="10" rx="4" fill="#28342D" />
          <path d="M110 70C130 70 135 110 112 118" stroke="#28342D" stroke-width="8" stroke-linecap="round" fill="none" />
          <rect x="42" y="125" width="76" height="10" rx="5" fill="#1B2921" />
          <circle cx="80" cy="115" r="4" fill="#A67618" />
        </svg>
      `;
    case 'labcoat':
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M40 38L80 50L120 38L135 125L108 128L80 75L52 128L25 125L40 38Z" fill="#F7F7F2" stroke="#D8E0D6" stroke-width="3" />
          <path d="M60 44L80 75L100 44" fill="#245B3C" />
          <line x1="80" y1="75" x2="80" y2="128" stroke="#ABB9AF" stroke-width="2" stroke-dasharray="4 4" />
          <rect x="52" y="85" width="18" height="16" rx="2" fill="#EEF1EB" />
          <rect x="90" y="85" width="18" height="16" rx="2" fill="#EEF1EB" />
        </svg>
      `;
    default:
      return `
        <svg class="vector-art-svg" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="45" y="35" width="70" height="90" rx="8" fill="#245B3C" />
          <circle cx="80" cy="80" r="18" fill="#A67618" />
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

function getPublicHostel(str) {
  if (!str || typeof str !== 'string') return 'Campus Hostel';
  const trimmed = str.trim();
  if (!trimmed) return 'Campus Hostel';

  // If separated by · or — or – or , or / or | or space-hyphen-space
  const parts = trimmed.split(/\s*(?:·|—|–|\/|\||,|\s-\s)\s*/);
  if (parts.length > 1) {
    const first = parts[0].trim();
    if (first && !/^(room|rm|flat|flt|no\.?)\b/i.test(first)) {
      return first;
    }
  }

  // If it contains "Room" or "Rm" preceded by hostel name e.g. "H3 Room 204"
  const roomMatch = trimmed.match(/^(.*?)(?:\s+(?:room|rm|flat|flt|no\.?)\b.*)$/i);
  if (roomMatch && roomMatch[1].trim()) {
    return roomMatch[1].trim();
  }

  // If the whole string is just "Room 101"
  if (/^(?:room|rm|flat|flt|no\.?)\b/i.test(trimmed)) {
    return 'Campus Hostel';
  }

  return trimmed;
}

// ─── SELLER CONTROLS ──────────────────────────────────────────────────────────
let currentSellerItemId = null;
let currentSellerItemStatus = 'Available';

function openSellerControlsModal(itemId) {
  const item = state.items.find(i => i.item_id === Number(itemId));
  if (!item) return;

  currentSellerItemId = item.item_id;
  currentSellerItemStatus = item.status || 'Available';

  const modal = document.getElementById('seller-controls-modal');
  const preview = document.getElementById('seller-controls-preview');
  const priceInput = document.getElementById('seller-edit-price');
  const detailsInput = document.getElementById('seller-edit-details');

  if (!modal) return;

  if (preview) {
    preview.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span class="status-badge status-${(item.status || 'available').toLowerCase()}"><span class="status-dot"></span>${escapeHtml(item.status || 'Available')}</span>
        <span style="font-size:0.8rem; font-weight:700; color:var(--muted);">${escapeHtml(item.category || 'General')}</span>
      </div>
      <div style="font-weight:800; font-size:1.05rem; color:var(--text); margin-bottom:4px;">${escapeHtml(item.title)}</div>
      <div style="font-size:0.85rem; color:var(--muted);">Current Price: <strong>₹${item.price}</strong> · 📍 ${escapeHtml(item.hostel_room)}</div>
    `;
  }

  if (priceInput) priceInput.value = item.price;
  if (detailsInput) detailsInput.value = item.details || '';

  highlightStatusButton(currentSellerItemStatus);

  modal.style.display = 'flex';
}

function closeSellerControlsModal() {
  const modal = document.getElementById('seller-controls-modal');
  if (modal) modal.style.display = 'none';
  currentSellerItemId = null;
}

function highlightStatusButton(status) {
  currentSellerItemStatus = status;
  ['available', 'reserved', 'sold'].forEach(s => {
    const btn = document.getElementById(`status-btn-${s}`);
    if (btn) {
      btn.classList.toggle('active-status', s.toLowerCase() === status.toLowerCase());
    }
  });
}

async function setSellerItemStatus(status) {
  highlightStatusButton(status);
  if (!currentSellerItemId) return;

  try {
    const res = await fetch(`${API_BASE}/api/items/${currentSellerItemId}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Status update failed.');

    showToast(`Status updated to ${status}!`);
    const item = state.items.find(i => i.item_id === currentSellerItemId);
    if (item) item.status = status;
    renderCatalog(state.items);
    openSellerControlsModal(currentSellerItemId);
  } catch (err) {
    console.error('Seller status update error:', err);
    showToast(err.message || 'Failed to update status');
  }
}

async function saveSellerItemChanges() {
  if (!currentSellerItemId) return;
  const priceInput = document.getElementById('seller-edit-price');
  const detailsInput = document.getElementById('seller-edit-details');
  const saveBtn = document.getElementById('seller-save-btn');

  const price = Number(priceInput?.value);
  if (isNaN(price) || price < 0) {
    showToast('Please enter a valid price.');
    return;
  }
  const details = detailsInput?.value.trim() || '';

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    const res = await fetch(`${API_BASE}/api/items/${currentSellerItemId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price, details })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed.');

    showToast('Listing updated successfully! ✓');
    closeSellerControlsModal();
    fetchCatalog();
  } catch (err) {
    console.error('Seller save error:', err);
    showToast(err.message || 'Failed to update listing');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
  }
}

async function deleteSellerItem() {
  if (!currentSellerItemId) return;
  if (!confirm('Are you sure you want to delete this listing permanently?')) return;

  try {
    const res = await fetch(`${API_BASE}/api/items/${currentSellerItemId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed.');

    showToast('Listing deleted successfully.');
    closeSellerControlsModal();
    fetchCatalog();
  } catch (err) {
    console.error('Seller delete error:', err);
    showToast(err.message || 'Failed to delete listing');
  }
}

window.getPublicHostel = getPublicHostel;
window.openSellerControlsModal = openSellerControlsModal;
window.closeSellerControlsModal = closeSellerControlsModal;
window.setSellerItemStatus = setSellerItemStatus;
window.saveSellerItemChanges = saveSellerItemChanges;
window.deleteSellerItem = deleteSellerItem;

// Global keyboard accessibility listener (Escape key dismiss)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLoginModal();
    closeOnboardingModal();
    closeCampusRequestModal();
    closeEmailChangeModal();
    closeCart();
    closeItemDetailsModal();
    closeSellerControlsModal();
  }
});
