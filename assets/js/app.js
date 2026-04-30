(function () {
  const qs = (sel, parent = document) => parent.querySelector(sel);
  const qsa = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));
  const venues = window.primeSpaceVenues || [];
  const __apiBaseFromWindow = window.PRIMESPACE_API_BASE;
  const __apiBaseFromStorage = localStorage.getItem('PRIMESPACE_API_BASE');
  const API_BASE = (__apiBaseFromWindow || __apiBaseFromStorage || 'http://127.0.0.1:8000').replace(/\/+$/, '');

  // ─── Toast notifications ─────────────────────────────────────────────────────
  function toast(message, type = 'info', duration = 4000) {
    let container = qs('#ps-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ps-toast-container';
      container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(container);
    }
    const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#2563eb' };
    const icons  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.style.cssText = `background:#0d1b2e;border:1px solid ${colors[type]};color:#e2e8f0;padding:12px 18px;border-radius:10px;font-size:0.95rem;display:flex;align-items:center;gap:10px;min-width:260px;max-width:380px;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:ps-toast-in .2s ease;`;
    t.innerHTML = `<span style="color:${colors[type]};font-weight:700;font-size:1.1rem;">${icons[type]}</span><span style="flex:1;">${message}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#7eb3e8;cursor:pointer;font-size:1rem;padding:0 0 0 8px;">✕</button>`;
    if (!qs('#ps-toast-style')) {
      const s = document.createElement('style');
      s.id = 'ps-toast-style';
      s.textContent = '@keyframes ps-toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
      document.head.appendChild(s);
    }
    container.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  // ─── Offline detection ───────────────────────────────────────────────────────
  function setupOfflineDetection() {
    function showOffline() {
      if (qs('#ps-offline-banner')) return;
      const b = document.createElement('div');
      b.id = 'ps-offline-banner';
      b.style.cssText = 'background:#7c2d12;color:white;text-align:center;padding:10px;font-size:0.9rem;position:relative;z-index:9998;';
      b.textContent = '⚠ You appear to be offline — some features may not work';
      document.body.insertBefore(b, document.body.firstChild);
    }
    function hideOffline() { qs('#ps-offline-banner')?.remove(); }
    if (!navigator.onLine) showOffline();
    window.addEventListener('offline', showOffline);
    window.addEventListener('online', () => { hideOffline(); toast('Back online', 'success'); });
  }

  // ─── Backend health check ────────────────────────────────────────────────────
  async function checkBackendOnline() {
    try {
      await fetch(`${API_BASE}/`, { method: 'GET', signal: AbortSignal.timeout(3000) });
    } catch {
      if (qs('#ps-backend-banner')) return;
      const b = document.createElement('div');
      b.id = 'ps-backend-banner';
      b.style.cssText = 'background:#7c2d12;color:white;text-align:center;padding:10px;font-size:0.9rem;position:relative;z-index:9997;';
      b.textContent = '⚠ Cannot connect to server — booking features are unavailable. Make sure the backend is running.';
      document.body.insertBefore(b, document.body.firstChild);
    }
  }

  // ─── Auth helpers ────────────────────────────────────────────────────────────

  function getToken() { return localStorage.getItem('PRIMESPACE_TOKEN'); }
  function getUser()  { try { return JSON.parse(localStorage.getItem('PRIMESPACE_USER')); } catch { return null; } }

  function saveSession(tokenResponse) {
    if (!tokenResponse || !tokenResponse.access_token) return;
    localStorage.setItem('PRIMESPACE_TOKEN', tokenResponse.access_token);
    localStorage.setItem('PRIMESPACE_TOKEN_TYPE', tokenResponse.token_type || 'bearer');
    if (tokenResponse.user) localStorage.setItem('PRIMESPACE_USER', JSON.stringify(tokenResponse.user));
  }

  function logout() {
    localStorage.removeItem('PRIMESPACE_TOKEN');
    localStorage.removeItem('PRIMESPACE_USER');
    localStorage.removeItem('PRIMESPACE_TOKEN_TYPE');
    window.location.href = 'index.html';
  }

  // ─── API ─────────────────────────────────────────────────────────────────────

  async function apiRequest(path, { method = 'GET', headers = {}, body, form } = {}) {
    const url = `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
    const init = { method, headers: { ...headers } };
    if (form) {
      init.body = new URLSearchParams(form);
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
    let res;
    try { res = await fetch(url, init); } catch (err) {
      throw new Error('Cannot reach server. Please check your connection.');
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    if (!res.ok) {
      // Token expired — log out and redirect
      if (res.status === 401) {
        localStorage.removeItem('PRIMESPACE_TOKEN');
        localStorage.removeItem('PRIMESPACE_USER');
        localStorage.removeItem('PRIMESPACE_TOKEN_TYPE');
        sessionStorage.setItem('ps_session_expired', '1');
        window.location.href = 'login.html';
        return;
      }
      let message = (typeof data === 'string' && data) ? data : `Request failed (${res.status})`;
      if (data && typeof data === 'object') {
        const detail = data.detail ?? data.message;
        if (typeof detail === 'string' && detail) message = detail;
        else if (Array.isArray(detail)) {
          const msgs = detail.map(d => d?.msg).filter(Boolean);
          message = msgs.length ? msgs.join('\n') : 'Validation failed.';
        } else if (detail && typeof detail === 'object') {
          message = detail.msg || detail.detail || 'Request failed.';
        }
      }
      throw new Error(message);
    }
    return data;
  }

  // ─── Nav ─────────────────────────────────────────────────────────────────────

  // Highlight active nav link based on current page
  function highlightActiveNav() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    qsa('.nav-link').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (href === page || (page === '' && href === 'index.html')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Redirect logged-in users away from login pages
  function redirectIfLoggedIn() {
    const page = window.location.pathname.split('/').pop();
    const publicOnly = ['login.html', 'provider-login.html'];

    // Show session expired toast if redirected here due to expiry
    if (publicOnly.includes(page) && sessionStorage.getItem('ps_session_expired')) {
      sessionStorage.removeItem('ps_session_expired');
      setTimeout(() => toast('Your session has expired — please sign in again', 'warning', 5000), 500);
    }

    if (publicOnly.includes(page) && getToken() && getUser()) {
      const user = getUser();
      window.location.href = user.role === 'provider' ? 'provider-dashboard.html' : 'index.html';
    }
  }

  // Redirect to login if my-bookings accessed without auth
  function guardMyBookingsPage() {
    const page = window.location.pathname.split('/').pop();
    if (page === 'my-bookings.html') {
      if (!getToken() || !getUser()) {
        window.location.href = 'login.html';
        return;
      }
      const u = getUser();
      if (u?.role === 'provider') {
        window.location.href = 'provider-dashboard.html';
      }
    }
  }

  async function updateNav() {
    const navActions = qs('.nav-actions');
    if (!navActions) return;
    const token = getToken();
    const user = getUser();
    if (!token || !user) return;

    const dashLink = user.role === 'provider' ? 'provider-dashboard.html' : 'my-bookings.html';
    const dashLabel = user.role === 'provider' ? 'Dashboard' : 'My Bookings';

    // Fetch booking count for badge (customers only)
    let badge = '';
    if (user.role === 'customer') {
      try {
        const bookings = await apiRequest('/bookings/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (bookings.length > 0) {
          badge = `<span style="background:#2563eb;color:white;border-radius:99px;font-size:0.7rem;padding:1px 7px;font-weight:700;margin-left:4px;">${bookings.length}</span>`;
        }
      } catch { badge = ''; }
    }

    navActions.innerHTML = `
      <svg class="user-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>
      </svg>
      <a href="profile.html" style="font-weight:600; color:var(--text);">${user.name}</a>
      ${user.role === 'provider'
        ? `<a class="btn btn-sm btn-secondary" href="provider-dashboard.html">Dashboard</a>`
        : `<a class="btn btn-sm btn-secondary" href="my-bookings.html">My Bookings${badge}</a>`
      }
      <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;cursor:pointer;" onclick="window.__psLogout()">Sign Out</button>
    `;
  }

  // Expose logout globally so inline onclick works
  window.__psLogout = logout;

  // ─── Icons ───────────────────────────────────────────────────────────────────

  function icon(name) {
    const icons = {
      location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
      search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
      list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m20 6-11 11-5-5"/></svg>',
      star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 3.09 6.26 6.91 1-5 4.87 1.18 6.87L12 18.27l-6.18 3.23L7 14.63l-5-4.87 6.91-1L12 2.5Z"/></svg>',
      mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
      lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 19 7-7-7-7"/><path d="M5 12h14"/></svg>',
      podium: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 22h10"/><path d="M9 22V12h6v10"/><path d="M5 12h14"/><path d="M12 12V8"/><path d="M12 8h4l2-3"/></svg>'
    };
    return icons[name] || '';
  }

  // ─── Venue cards ─────────────────────────────────────────────────────────────

  function makeVenueCard(v) {
    return `
      <article class="venue-card">
        <img class="venue-media" src="${v.images[0]}" alt="${v.name}">
        <div class="venue-body">
          <div class="venue-topline">
            <h3 style="margin:0;font-size:2rem;letter-spacing:-.03em;">${v.name}</h3>
            <span class="rating-badge"><span class="star">★</span>${v.rating.toFixed(1)}</span>
          </div>
          <div class="meta-line">${icon('location')}<span>${v.location}</span></div>
          <div class="meta-line">${icon('users')}<span>Capacity: ${v.capacity} people</span></div>
          <div class="venue-bottom">
            <div class="price"><big>£${v.price}</big>/day</div>
            <a class="btn btn-primary btn-sm" href="venue.html?id=${v.id}">View Details</a>
          </div>
        </div>
      </article>`;
  }

  // ─── Home page ───────────────────────────────────────────────────────────────

  function renderFeatured() {
    const featured = qs('[data-featured-venues]');
    if (!featured) return;
    featured.innerHTML = venues.slice(0, 3).map(makeVenueCard).join('');
  }

  function setupHomeSearch() {
    const form = qs('[data-home-search]');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const location = encodeURIComponent(qs('#home-location').value.trim());
      const guests   = encodeURIComponent(qs('#home-guests').value.trim());
      const date     = encodeURIComponent(qs('#home-date').value.trim());
      window.location.href = `venues.html?location=${location}&guests=${guests}&date=${date}`;
    });
  }

  // ─── Venues list page ────────────────────────────────────────────────────────

  let currentFiltered = venues; // track filtered set for map view

  function renderAllVenues(filtered = venues) {
    currentFiltered = filtered;
    const list = qs('[data-venues-list]');
    if (!list) return;
    const count = qs('[data-results-count]');
    if (count) count.textContent = `${filtered.length} venue${filtered.length === 1 ? '' : 's'} found`;
    list.innerHTML = filtered.length
      ? filtered.map(makeVenueCard).join('')
      : `<div class="info-card" style="text-align:center; padding:60px 30px;">
          <div style="font-size:3rem; margin-bottom:16px;">🔍</div>
          <h3>No venues found</h3>
          <p class="muted">Try adjusting your filters or reset to see all venues.</p>
          <button class="btn btn-primary" style="margin-top:16px;" onclick="document.querySelector('[data-reset-filters]')?.click()">Reset Filters</button>
        </div>`;
  }

  function getFilteredVenues() {
    const city     = (qs('#filter-location')?.value || '').trim().toLowerCase();
    const type     = qs('#filter-type')?.value || '';
    const minCap   = Number(qs('#filter-capacity')?.value || 0);
    const minRating= Number(qs('#filter-rating')?.value || 0);
    const maxPrice = Number(qs('#filter-price')?.value || 10000);

    let filtered = venues.filter(v =>
      (!city || v.location.toLowerCase().includes(city) || v.city.toLowerCase().includes(city))
      && (!type || v.type === type)
      && (!minCap || v.capacity >= minCap)
      && (!minRating || v.rating >= minRating)
      && v.price <= maxPrice
    );

    const sort = qs('#sort-select')?.value || 'recommended';
    if (sort === 'price-low')  filtered.sort((a, b) => a.price - b.price);
    if (sort === 'price-high') filtered.sort((a, b) => b.price - a.price);
    if (sort === 'rating')     filtered.sort((a, b) => b.rating - a.rating);
    return filtered;
  }

  function applyVenueFilters() {
    const filtered = getFilteredVenues();
    const list = qs('[data-venues-list]');
    const isMapView = list && qs('#venues-map', list.parentElement || document);
    if (isMapView) {
      renderMapView(filtered);
    } else {
      renderAllVenues(filtered);
    }
  }

  function saveFilters() {
    const filters = {
      location: qs('#filter-location')?.value || '',
      type: qs('#filter-type')?.value || '',
      capacity: qs('#filter-capacity')?.value || '',
      rating: qs('#filter-rating')?.value || '0',
      price: qs('#filter-price')?.value || '10000',
      date: qs('#filter-date')?.value || '',
      sort: qs('#sort-select')?.value || 'recommended'
    };
    sessionStorage.setItem('ps_filters', JSON.stringify(filters));
  }

  function restoreFilters() {
    const saved = sessionStorage.getItem('ps_filters');
    if (!saved) return;
    try {
      const f = JSON.parse(saved);
      if (qs('#filter-location')) qs('#filter-location').value = f.location || '';
      if (qs('#filter-type')) qs('#filter-type').value = f.type || '';
      if (qs('#filter-capacity')) qs('#filter-capacity').value = f.capacity || '';
      if (qs('#filter-rating')) qs('#filter-rating').value = f.rating || '0';
      if (qs('#filter-price')) qs('#filter-price').value = f.price || '10000';
      if (qs('#filter-date')) qs('#filter-date').value = f.date || '';
      if (qs('#sort-select')) qs('#sort-select').value = f.sort || 'recommended';
      const out = qs('[data-price-output]');
      if (out) out.textContent = `£${Number(f.price || 10000).toLocaleString()}`;
    } catch {}
  }

  function renderMapView(venuesArr) {
    const list = qs('[data-venues-list]');
    if (!list) return;
    const count = qs('[data-results-count]');
    if (count) count.textContent = `${venuesArr.length} venue${venuesArr.length === 1 ? '' : 's'} found`;
    list.className = '';
    list.innerHTML = '<div id="venues-map" style="height:560px; border-radius:12px; overflow:hidden; z-index:0;"></div>';
    if (typeof L === 'undefined') return;
    setTimeout(() => {
      // Centred on UK
      const map = L.map('venues-map').setView([54.5, -3.5], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      venuesArr.forEach(v => {
        if (!v.lat || !v.lng) return;
        L.marker([v.lat, v.lng]).addTo(map).bindPopup(`
          <strong>${v.name}</strong><br>
          ${v.location}<br>
          ⭐ ${v.rating} &nbsp;|&nbsp; £${v.price}/day<br>
          <a href="venue.html?id=${v.id}" style="color:#2563eb;">View details →</a>
        `);
      });
      if (venuesArr.length === 0) {
        list.innerHTML = `<div class="info-card" style="text-align:center; padding:60px 30px;">
          <h3>No venues match your filters</h3>
          <button class="btn btn-primary" style="margin-top:16px;" onclick="document.querySelector('[data-reset-filters]')?.click()">Reset Filters</button>
        </div>`;
      }
    }, 100);
  }

  function setupVenuesPage() {
    if (!qs('[data-venues-page]')) return;

    // Restore saved filters from session
    restoreFilters();
    renderAllVenues();

    qs('#filter-price')?.addEventListener('input', e => {
      const out = qs('[data-price-output]');
      if (out) out.textContent = `£${Number(e.target.value).toLocaleString()}`;
    });

    qsa('#filter-location,#filter-type,#filter-capacity,#filter-rating,#sort-select,#filter-date,#filter-price').forEach(el => {
      el.addEventListener('input', () => { saveFilters(); applyVenueFilters(); });
      el.addEventListener('change', () => { saveFilters(); applyVenueFilters(); });
    });

    qs('[data-apply-filters]')?.addEventListener('click', () => { saveFilters(); applyVenueFilters(); });

    qs('[data-reset-filters]')?.addEventListener('click', () => {
      qsa('#filter-location,#filter-type,#filter-capacity,#filter-date').forEach(el => el.value = '');
      if (qs('#filter-rating')) qs('#filter-rating').value = '0';
      if (qs('#sort-select'))   qs('#sort-select').value = 'recommended';
      if (qs('#filter-price'))  qs('#filter-price').value = '10000';
      const out = qs('[data-price-output]');
      if (out) out.textContent = '£10,000';
      sessionStorage.removeItem('ps_filters');
      applyVenueFilters();
    });

    qsa('[data-view-toggle]').forEach(btn => btn.addEventListener('click', () => {
      qsa('[data-view-toggle]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const list = qs('[data-venues-list]');
      const filtered = getFilteredVenues();

      if (btn.dataset.viewToggle === 'list') {
        list.className = 'venue-list';
        renderAllVenues(filtered);
      } else if (btn.dataset.viewToggle === 'grid') {
        list.className = 'cards-grid';
        renderAllVenues(filtered);
      } else if (btn.dataset.viewToggle === 'map') {
        renderMapView(filtered);
      }
    }));
  }

  function applyHomeParamsToVenuePage() {
    if (!qs('[data-venues-page]')) return;
    const params = new URLSearchParams(window.location.search);
    const location = params.get('location');
    const guests   = params.get('guests');
    const date     = params.get('date');
    if (location && qs('#filter-location')) qs('#filter-location').value = location;
    if (guests && qs('#filter-capacity'))   qs('#filter-capacity').value = guests;
    if (date && qs('#filter-date'))         qs('#filter-date').value = date;
    if (location || guests || date) applyVenueFilters();
  }

  // ─── Venue detail page ───────────────────────────────────────────────────────

  function stars(n) {
    const full = Math.round(n);
    return '<span class="star">' + '★'.repeat(full) + '</span>'
         + '<span style="color:#cbd5e1">' + '★'.repeat(5 - full) + '</span>';
  }

  function setupVenuePage() {
    if (!qs('[data-venue-page]')) return;
    const params = new URLSearchParams(window.location.search);
    const venue = venues.find(v => v.id === params.get('id')) || venues[0];

    qs('[data-venue-name]').textContent      = venue.name;
    qs('[data-venue-location]').textContent  = venue.location;
    qs('[data-venue-capacity]').textContent  = venue.capacity;
    qs('[data-venue-rating]').innerHTML      = `<span class="star">★</span> ${venue.rating.toFixed(1)} (${venue.reviewsCount} reviews)`;
    qs('[data-venue-description]').textContent = venue.description;
    qs('[data-main-image]').src              = venue.images[0];
    qs('[data-main-image]').alt              = venue.name;
    qs('[data-price]').textContent           = `£${venue.price}`;
    qs('[data-subtotal]').textContent        = `£${venue.price}`;
    qs('[data-service-fee]').textContent     = `£${Math.round(venue.price * 0.1)}`;
    qs('[data-total]').textContent           = `£${venue.price + Math.round(venue.price * 0.1)}`;
    qs('[data-max-capacity]').textContent    = venue.capacity;
    qs('[data-map-address]').textContent     = venue.location;

    // Update browser tab title with venue name
    document.title = `${venue.name} | PrimeSpace`;

    // Check if fully booked (all dates in past)
    const todayStr = new Date().toISOString().split('T')[0];
    const allPast = venue.availability.every(d => {
      const [day, month, year] = d.split('/');
      return `${year}-${month}-${day}` < todayStr;
    });
    if (allPast) {
      const ratingBadge = qs('[data-venue-rating]');
      if (ratingBadge) {
        const badge = document.createElement('span');
        badge.style.cssText = 'background:#ef4444;color:white;font-size:0.8rem;padding:4px 10px;border-radius:99px;font-weight:700;margin-left:12px;';
        badge.textContent = 'Fully Booked';
        ratingBadge.parentElement?.appendChild(badge);
      }
    }

    // Share venue button
    const detailsHeader = qs('.details-header');
    if (detailsHeader) {
      const shareBtn = document.createElement('button');
      shareBtn.innerHTML = '🔗 Share';
      shareBtn.style.cssText = 'background:transparent;border:1px solid rgba(125,211,252,.2);color:#93c5fd;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.9rem;margin-top:8px;';
      shareBtn.onclick = () => {
        navigator.clipboard.writeText(window.location.href);
        shareBtn.innerHTML = '✓ Link copied!';
        setTimeout(() => shareBtn.innerHTML = '🔗 Share', 2000);
      };
      detailsHeader.appendChild(shareBtn);
    }

    // Back to results button
    const breadcrumb = qs('.breadcrumb');
    if (breadcrumb) {
      breadcrumb.href = 'venues.html';
      breadcrumb.textContent = '← Back to results';
    }

    // Thumbnails
    const thumbs = qs('[data-thumbs]');
    thumbs.innerHTML = venue.images.map((src, i) => `
      <button class="thumb ${i === 0 ? 'active' : ''}" data-thumb="${src}" aria-label="View image ${i + 1}">
        <img src="${src}" alt="${venue.name} image ${i + 1}">
      </button>`).join('');
    qsa('[data-thumb]').forEach(btn => btn.addEventListener('click', () => {
      qs('[data-main-image]').src = btn.dataset.thumb;
      qsa('.thumb', thumbs).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }));

    // Amenities
    qs('[data-amenities]').innerHTML = venue.amenities.map(item =>
      `<div class="amenity"><span class="amenity-dot">✓</span><span>${item}</span></div>`
    ).join('');

    // Reviews
    qs('[data-reviews]').innerHTML = venue.reviews.length
      ? venue.reviews.map(r => `
          <article class="review-card">
            <div class="review-top">
              <div class="avatar-row" style="margin-top:0;">
                <img class="avatar" src="${r.avatar}" alt="${r.name}">
                <div>
                  <strong style="display:block;font-size:1.35rem;">${r.name}</strong>
                  <span class="muted">${r.date}</span>
                </div>
              </div>
              <div>${stars(r.rating)}</div>
            </div>
            <p style="margin:16px 0 0; color:#334155; line-height:1.6;">${r.text}</p>
          </article>`).join('')
      : '<p class="muted">No reviews yet.</p>';

    qs('[data-review-count]').textContent = venue.reviews.length;

    // Availability
    // Availability list — fetch live from API
    const availEl = qs('[data-availability]');
    if (availEl) {
      availEl.innerHTML = '<p class="muted" style="font-size:0.9rem;">Loading...</p>';
      fetch(`${API_BASE}/venues/${venue.id}/availability`)
        .then(r => r.json())
        .then(data => {
          const today = new Date().toISOString().split('T')[0];
          const dates = (data.available_dates || []).filter(d => {
            const [dd, mm, yy] = d.split('/');
            return `${yy}-${mm}-${dd}` >= today;
          });
          availEl.innerHTML = dates.length
            ? dates.map(d => `<div class="availability-row"><span>${d}</span><span class="status-ok">Available</span></div>`).join('')
            : '<p class="muted" style="font-size:0.9rem;">No dates currently available — all booked.</p>';
        })
        .catch(() => {
          availEl.innerHTML = venue.availability.map(d =>
            `<div class="availability-row"><span>${d}</span><span class="status-ok">Available</span></div>`
          ).join('');
        });
    }

    // Leaflet map
    const mapEl = qs('#venue-map');
    if (mapEl && venue.lat && venue.lng && typeof L !== 'undefined') {
      const map = L.map('venue-map').setView([venue.lat, venue.lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      L.marker([venue.lat, venue.lng])
        .addTo(map)
        .bindPopup(`<strong>${venue.name}</strong><br>${venue.location}`)
        .openPopup();
    }

    // Similar venues
    const similar = venues.filter(v => v.id !== venue.id && (v.city === venue.city || v.type === venue.type)).slice(0, 3);
    const reviewsCard = qs('[data-reviews]')?.closest('article');
    if (similar.length && reviewsCard) {
      const simSection = document.createElement('article');
      simSection.className = 'details-card';
      simSection.innerHTML = `
        <h2>Similar Venues</h2>
        <div class="cards-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px;">
          ${similar.map(v => `
            <a href="venue.html?id=${v.id}" style="text-decoration:none;">
              <div style="background:#0f1f38;border-radius:12px;overflow:hidden;border:1px solid rgba(125,211,252,.1);">
                <img src="${v.images[0]}" alt="${v.name}" style="width:100%;height:120px;object-fit:cover;">
                <div style="padding:12px;">
                  <strong style="color:#f1f5f9;display:block;margin-bottom:4px;">${v.name}</strong>
                  <span style="color:#7eb3e8;font-size:0.85rem;">📍 ${v.city} &nbsp;|&nbsp; £${v.price}/day</span>
                </div>
              </div>
            </a>`).join('')}
        </div>`;
      reviewsCard.after(simSection);
    }

    // ── Booking section ──────────────────────────────────────────────────────
    const guestsInput = qs('#booking-guests');
    const today = new Date().toISOString().split('T')[0];

    // Clear the default value so user picks their own number
    if (guestsInput) {
      guestsInput.value = '';
      guestsInput.placeholder = 'Enter number of guests';
      guestsInput.min = 1;
    }

    // Replace date input with dropdown of live available dates from API
    const rawDateEl = qs('#booking-date');
    if (rawDateEl) {
      const sel = document.createElement('select');
      sel.id = 'booking-date';
      sel.style.cssText = 'width:100%; background:#0f1f38; border:1px solid rgba(125,211,252,.15); border-radius:8px; padding:12px 14px; color:#e2e8f0; font-size:1rem; cursor:pointer;';
      sel.innerHTML = `<option value="">Loading available dates...</option>`;
      rawDateEl.replaceWith(sel);

      // Fetch live availability from backend
      fetch(`${API_BASE}/venues/${venue.id}/availability`)
        .then(r => r.json())
        .then(data => {
          const dates = data.available_dates || [];
          const today = new Date().toISOString().split('T')[0];
          const futureDates = dates.filter(d => {
            const [dd, mm, yy] = d.split('/');
            return `${yy}-${mm}-${dd}` >= today;
          });
          sel.innerHTML = futureDates.length
            ? `<option value="">Select an available date</option>` + futureDates.map(d => {
                const [dd, mm, yy] = d.split('/');
                return `<option value="${yy}-${mm}-${dd}">${d}</option>`;
              }).join('')
            : `<option value="">No dates available — all booked</option>`;
          refreshBookBtn();
        })
        .catch(() => {
          // Fallback to data.js dates if API fails
          const today = new Date().toISOString().split('T')[0];
          const futureDates = (venue.availability || []).filter(d => {
            const [dd, mm, yy] = d.split('/');
            return `${yy}-${mm}-${dd}` >= today;
          });
          sel.innerHTML = futureDates.length
            ? `<option value="">Select an available date</option>` + futureDates.map(d => {
                const [dd, mm, yy] = d.split('/');
                return `<option value="${yy}-${mm}-${dd}">${d}</option>`;
              }).join('')
            : `<option value="">No dates available</option>`;
          refreshBookBtn();
        });
    }

    const dateInput = qs('#booking-date');

    // Inject guest warning element
    const warnDiv = document.createElement('div');
    warnDiv.id = 'guest-warning';
    warnDiv.style.cssText = 'display:none; font-size:0.85rem; margin-top:6px;';
    guestsInput?.closest('.form-group')?.appendChild(warnDiv);

    // Booking calculator
    function updateBooking() {
      const g = Number(guestsInput?.value || 0);
      if (!g) return;
      const multiplier = g > Math.ceil(venue.capacity * 0.75) ? 1.12 : 1;
      const sub     = Math.round(venue.price * multiplier);
      const service = Math.round(sub * 0.1);
      qs('[data-subtotal]').textContent    = `£${sub}`;
      qs('[data-service-fee]').textContent = `£${service}`;
      qs('[data-total]').textContent       = `£${sub + service}`;
    }

    function refreshBookBtn() {
      const bookBtn = qs('[data-book-now]');
      if (!bookBtn) return;
      const g = Number(guestsInput?.value || 0);
      const hasDate = !!dateInput?.value;

      if (!hasDate) {
        bookBtn.disabled = true;
        bookBtn.textContent = 'Select an available date';
      } else if (!g) {
        bookBtn.disabled = true;
        bookBtn.textContent = 'Enter number of guests';
      } else if (g > venue.capacity) {
        bookBtn.disabled = true;
        bookBtn.textContent = `Limit reached — max ${venue.capacity}`;
      } else {
        bookBtn.disabled = false;
        bookBtn.textContent = 'Book Now';
      }
    }

    // Date select change
    dateInput?.addEventListener('change', () => {
      refreshBookBtn();
      updateBooking();
    });

    // Guests input
    guestsInput?.addEventListener('input', () => {
      const g = Number(guestsInput.value);
      const warnEl = qs('#guest-warning');

      if (g > venue.capacity) {
        guestsInput.style.borderColor = '#ef4444';
        if (warnEl) { warnEl.style.display = 'block'; warnEl.style.color = '#ef4444'; warnEl.textContent = `⚠ Limit reached — this venue holds max ${venue.capacity} people.`; }
      } else if (g > 0 && g < Math.ceil(venue.capacity * 0.1)) {
        guestsInput.style.borderColor = '#f59e0b';
        if (warnEl) { warnEl.style.display = 'block'; warnEl.style.color = '#f59e0b'; warnEl.textContent = `💡 This venue fits up to ${venue.capacity} people — you can add more guests.`; }
      } else {
        guestsInput.style.borderColor = '';
        if (warnEl) warnEl.style.display = 'none';
      }

      refreshBookBtn();
      if (g > 0 && g <= venue.capacity) updateBooking();
    });

    // Initial button state
    refreshBookBtn();

    // Book Now click
    qs('[data-book-now]')?.addEventListener('click', () => {
      const token = getToken();
      if (!token) {
        sessionStorage.setItem('ps_return_url', window.location.href);
        toast('You need to be signed in to book a venue', 'warning');
        setTimeout(() => window.location.href = 'login.html', 1200);
        return;
      }
      const user = getUser();
      if (user?.role === 'provider') {
        toast('Provider accounts cannot make bookings — please use a customer account', 'error', 5000);
        return;
      }
      const g = Number(guestsInput?.value || 0);
      if (!g || g < 1) { toast('Please enter the number of guests', 'warning'); return; }
      if (g > venue.capacity) { toast(`Guest count cannot exceed venue capacity of ${venue.capacity}`, 'error'); return; }
      if (!dateInput?.value) { toast('Please select an available date', 'warning'); return; }
      const date  = dateInput.value;
      const total = (qs('[data-total]')?.textContent || '').replace(/[^0-9]/g, '') || String(venue.price + Math.round(venue.price * 0.1));
      window.location.href = `payment.html?${new URLSearchParams({ id: venue.id, date, guests: g, total })}`;
    });
  }

  // ─── Payment page ────────────────────────────────────────────────────────────

  function setupPaymentPage() {
    if (!qs('[data-payment-page]')) return;
    const params  = new URLSearchParams(window.location.search);
    if (!params.get('id')) { window.location.href = 'venues.html'; return; }
    const venue   = venues.find(v => v.id === params.get('id'));
    if (!venue) { toast('Venue not found — redirecting to venues', 'error'); setTimeout(() => window.location.href = 'venues.html', 1500); return; }
    const guests  = Number(params.get('guests') || 50);
    const date    = params.get('date') || 'Not selected';
    const subtotal= guests > Math.ceil(venue.capacity * 0.75) ? Math.round(venue.price * 1.12) : venue.price;
    const fee     = Math.round(subtotal * 0.1);
    const total   = subtotal + fee;
    const ref     = `PS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;

    // Pre-fill billing email
    const loggedUser = getUser();
    const billingEmailEl = qs('#billing-email');
    if (billingEmailEl && loggedUser?.email) billingEmailEl.value = loggedUser.email;

    const sets = {
      '[data-payment-venue]':        venue.name,
      '[data-payment-venue-inline]': venue.name,
      '[data-payment-date]':         date,
      '[data-payment-guests]':       `${guests} guests`,
      '[data-payment-subtotal]':     `£${subtotal}`,
      '[data-payment-fee]':          `£${fee}`,
      '[data-payment-total]':        `£${total}`,
      '[data-payment-reference]':    ref
    };
    Object.entries(sets).forEach(([sel, val]) => { const el = qs(sel); if (el) el.textContent = val; });

    // Card formatting — works on type AND paste
    const cardEl = qs('#card-number');
    if (cardEl) {
      const fmtCard = () => { const d = cardEl.value.replace(/\D/g,'').slice(0,16); cardEl.value = d.replace(/(.{4})/g,'$1 ').trim(); };
      cardEl.addEventListener('input', fmtCard);
      cardEl.addEventListener('paste', () => setTimeout(fmtCard, 0));
    }
    const expiryEl = qs('#expiry-date');
    if (expiryEl) {
      const fmtExp = () => {
        let d = expiryEl.value.replace(/\D/g, '').slice(0, 4);
        if (d.length >= 2) {
          let month = parseInt(d.slice(0, 2));
          // Clamp month between 01 and 12
          if (month < 1) month = 1;
          if (month > 12) month = 12;
          d = String(month).padStart(2, '0') + d.slice(2);
          expiryEl.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
        } else {
          expiryEl.value = d;
        }

        // Validate expiry is not in the past
        const errId = 'expiry-error';
        document.getElementById(errId)?.remove();
        if (expiryEl.value.length === 5) {
          const [mm, yy] = expiryEl.value.split('/');
          const now = new Date();
          const cardYear = 2000 + parseInt(yy);
          const cardMonth = parseInt(mm);
          if (cardYear < now.getFullYear() || (cardYear === now.getFullYear() && cardMonth < now.getMonth() + 1)) {
            expiryEl.style.borderColor = '#ef4444';
            const err = document.createElement('div');
            err.id = errId;
            err.style.cssText = 'color:#ef4444;font-size:0.82rem;margin-top:5px;';
            err.textContent = '⚠ Card has expired';
            expiryEl.closest('.form-group')?.appendChild(err);
          } else {
            expiryEl.style.borderColor = '';
          }
        }
      };
      expiryEl.addEventListener('input', fmtExp);
      expiryEl.addEventListener('paste', () => setTimeout(fmtExp, 0));
    }

    // Warn before leaving payment page mid-booking
    let bookingCompleted = false;
    window.addEventListener('beforeunload', e => {
      if (!bookingCompleted && qs('[data-payment-form]')) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Validate booking date is still in future
    const bookingDateStr = date;
    if (bookingDateStr && bookingDateStr !== 'Not selected') {
      const [day, month, year] = bookingDateStr.split('-');
      const bookingDate = new Date(`${bookingDateStr}`);
      if (bookingDate < new Date()) {
        toast('The selected date has passed — please go back and choose a new date', 'error', 6000);
      }
    }

    const form = qs('[data-payment-form]');
    form?.addEventListener('submit', async e => {
      e.preventDefault();

      // Inline field validation
      let hasError = false;
      qsa('input[required]', form).forEach(input => {
        if (input.type === 'checkbox') return;
        if (!input.value.trim()) {
          showFieldError(input, 'This field is required');
          hasError = true;
        }
      });

      // Validate expiry date
      const expiryVal = qs('#expiry-date', form)?.value || '';
      if (expiryVal.length === 5) {
        const [mm, yy] = expiryVal.split('/');
        const now = new Date();
        const cardYear = 2000 + parseInt(yy);
        const cardMonth = parseInt(mm);
        if (cardMonth < 1 || cardMonth > 12 || cardYear < now.getFullYear() || (cardYear === now.getFullYear() && cardMonth < now.getMonth() + 1)) {
          showFieldError(qs('#expiry-date', form), 'Please enter a valid expiry date');
          hasError = true;
        }
      }
      const agree = qs('input[type="checkbox"][required]', form);
      if (agree && !agree.checked) {
        toast('Please agree to the booking terms before confirming', 'warning');
        hasError = true;
      }
      if (hasError) return;

      const token = getToken();
      if (!token) {
        sessionStorage.setItem('ps_return_url', window.location.href);
        toast('Please sign in to complete your booking', 'warning');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
      }

      // Check if provider trying to book
      const user = getUser();
      if (user?.role === 'provider') {
        toast('Provider accounts cannot make bookings. Please use a customer account.', 'error', 6000);
        return;
      }

      const submitBtn = qs('button[type="submit"]', form);
      const defaultBtnText = submitBtn?.textContent || 'Confirm Booking';

      // Processing overlay
      const overlay = document.createElement('div');
      overlay.id = 'ps-processing-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(6,15,30,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
      overlay.innerHTML = `<div style="width:50px;height:50px;border:4px solid rgba(37,99,235,.3);border-top-color:#2563eb;border-radius:50%;animation:ps-spin 0.8s linear infinite;"></div><p style="color:#e2e8f0;font-size:1.1rem;font-weight:600;">Processing your booking...</p>`;
      document.body.appendChild(overlay);
      if (submitBtn) setFormLoading(submitBtn, true, defaultBtnText);

      try {
        await apiRequest('/bookings', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: { venue_id: venue.id, date, guests, total }
        });

        bookingCompleted = true;
        overlay.remove();

        const shell = qs('.payment-shell');
        if (shell) {
          const user = getUser();
          shell.innerHTML = `
            <div class="payment-card" style="text-align:center; max-width:640px; margin:0 auto; padding:48px 40px;">
              <div style="font-size:4rem; margin-bottom:16px;">✅</div>
              <h1 style="margin-top:0; font-size:2.5rem; letter-spacing:-.03em;">Booking Confirmed!</h1>
              <p class="muted" style="font-size:1.1rem; margin-bottom:32px;">
                Your booking for <strong style="color:#93c5fd;">${venue.name}</strong> has been confirmed and saved.
              </p>
              <div class="soft-panel" style="text-align:left; margin-bottom:24px;">
                <strong>Booking summary</strong>
                <div class="summary-list" style="margin-top:14px;">
                  <div class="summary-item"><span>Reference</span><strong>${ref}</strong></div>
                  <div class="summary-item"><span>Venue</span><strong>${venue.name}</strong></div>
                  <div class="summary-item"><span>Date</span><strong>${date}</strong></div>
                  <div class="summary-item"><span>Guests</span><strong>${guests}</strong></div>
                  <div class="summary-item"><span>Subtotal</span><strong>£${subtotal}</strong></div>
                  <div class="summary-item"><span>Service fee</span><strong>£${fee}</strong></div>
                  <div class="summary-item"><span>Total paid</span><strong>£${total}</strong></div>
                </div>
              </div>
              <div style="background:#0a1628;border:1px solid rgba(125,211,252,.15);border-radius:12px;padding:20px;text-align:left;margin-bottom:28px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(125,211,252,.1);">
                  <span style="font-size:1.5rem;">📧</span>
                  <div>
                    <div style="color:#f1f5f9;font-weight:700;font-size:0.95rem;">Confirmation email sent to</div>
                    <div style="color:#7eb3e8;font-size:0.85rem;">${user?.email || 'your registered email'}</div>
                  </div>
                </div>
                <div style="color:#93c5fd;font-size:0.85rem;line-height:1.8;">
                  <strong style="color:#f1f5f9;display:block;margin-bottom:6px;">PrimeSpace Booking Confirmation — ${ref}</strong>
                  Dear <strong style="color:#f1f5f9;">${user?.name || 'Valued Customer'}</strong>,<br><br>
                  Thank you for booking <strong style="color:#f1f5f9;">${venue.name}</strong> through PrimeSpace.<br>
                  Your event is confirmed for <strong style="color:#f1f5f9;">${date}</strong> with <strong style="color:#f1f5f9;">${guests} guests</strong>.<br>
                  Total charged: <strong style="color:#f1f5f9;">£${total}</strong><br><br>
                  The venue team will be in touch within 24 hours to confirm arrangements.<br><br>
                  Kind regards,<br>The PrimeSpace Team
                </div>
              </div>
              <div style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
                <a class="btn btn-primary" href="my-bookings.html">View My Bookings</a>
                <a class="btn btn-secondary" href="venues.html">Browse more venues</a>
              </div>
            </div>`;
        }
      } catch (err) {
        overlay?.remove();
        if (submitBtn) setFormLoading(submitBtn, false, defaultBtnText);
        // Show specific errors
        let msg = err?.message || 'Booking failed. Please try again.';
        if (msg.toLowerCase().includes('capacity')) msg = `Too many guests — this venue holds a maximum of ${venue.capacity} people.`;
        if (msg.toLowerCase().includes('role') || msg.toLowerCase().includes('access')) msg = 'Provider accounts cannot make bookings. Please use a customer account.';
        if (msg.toLowerCase().includes('token') || msg.toLowerCase().includes('expired')) msg = 'Your session has expired. Please sign in again.';
        toast(msg, 'error', 6000);
      }
    });
  }

  // ─── Cancel booking (global so inline onclick works) ─────────────────────────
  window.cancelBooking = async function(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking? This cannot be undone.')) return;
    const token = getToken();
    if (!token) return;
    try {
      await apiRequest(`/bookings/${bookingId}/cancel`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast('Booking cancelled — the date is now available again', 'success', 5000);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast(err?.message || 'Failed to cancel booking', 'error');
    }
  };

  // ─── My Bookings page ────────────────────────────────────────────────────────

  async function setupMyBookingsPage() {
    if (!qs('[data-my-bookings-page]')) return;
    const token = getToken();
    const user  = getUser();
    const container = qs('[data-bookings-list]');

    if (!token || !user) {
      container.innerHTML = `
        <div class="info-card" style="text-align:center; padding:60px 30px;">
          <div style="font-size:3rem; margin-bottom:16px;">🔒</div>
          <h3>Please sign in to view your bookings</h3>
          <a class="btn btn-primary" href="login.html" style="margin-top:16px;">Sign In</a>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div style="text-align:center; padding:60px 30px;">
        <div style="display:inline-block; width:40px; height:40px; border:4px solid rgba(37,99,235,.2); border-top-color:#2563eb; border-radius:50%; animation:ps-spin 0.8s linear infinite;"></div>
        <p class="muted" style="margin-top:16px;">Loading your bookings...</p>
      </div>
      <style>@keyframes ps-spin { to { transform: rotate(360deg); } }</style>`;

    try {
      const bookings = await apiRequest('/bookings/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!bookings.length) {
        container.innerHTML = `
          <div class="info-card" style="text-align:center; padding:60px 30px;">
            <div style="font-size:3rem; margin-bottom:16px;">📋</div>
            <h3>No bookings yet</h3>
            <p class="muted">When you book a venue it will appear here.</p>
            <a class="btn btn-primary" href="venues.html" style="margin-top:16px;">Browse Venues</a>
          </div>`;
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Sort by most recent first
      const sorted = [...bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const upcoming = sorted.filter(b => {
        if (!b.date) return true;
        const [d, m, y] = b.date.split('/');
        return `${y}-${m}-${d}` >= today;
      });
      const past = sorted.filter(b => {
        if (!b.date) return false;
        const [d, m, y] = b.date.split('/');
        return `${y}-${m}-${d}` < today;
      });

      function bookingCard(b) {
        const venue = venues.find(v => v.id === b.venue_id);
        const venueName = venue ? venue.name : b.venue_id;
        const venueImg  = (venue && venue.images && venue.images[0]) ? venue.images[0] : 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop';
        const created   = new Date(b.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
        const isCancelled = b.status === 'cancelled';
        let status = isCancelled ? 'Cancelled' : 'Confirmed';
        let statusColor = isCancelled ? '#6b7280' : '#22c55e';
        if (!isCancelled && b.date) {
          const [d, m, y] = b.date.split('/');
          const bookingDate = b.date.includes('-') ? b.date : `${y}-${m}-${d}`;
          if (bookingDate < today) { status = 'Completed'; statusColor = '#7eb3e8'; }
          else { status = 'Upcoming'; statusColor = '#f59e0b'; }
        }
        return `
          <div class="details-card" style="display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:16px; ${isCancelled ? 'opacity:0.6;' : ''}">
            <img src="${venueImg}" alt="${venueName}" style="width:120px; height:90px; object-fit:cover; border-radius:10px; flex-shrink:0;">
            <div style="flex:1; min-width:200px;">
              <h3 style="margin:0 0 6px; font-size:1.4rem;">${venueName}</h3>
              <div class="muted" style="font-size:0.9rem; margin-bottom:10px;">Booked on ${created}</div>
              <div style="display:flex; gap:24px; flex-wrap:wrap;">
                <span>📅 <strong>${b.date || 'No date selected'}</strong></span>
                <span>👥 <strong>${b.guests} guests</strong></span>
                <span>💰 <strong>£${b.total}</strong></span>
              </div>
            </div>
            <div style="text-align:right; flex-shrink:0;">
              <span style="display:block; margin-bottom:8px; font-weight:700; color:${statusColor};">● ${status}</span>
              <span class="muted" style="font-size:0.85rem;">Ref: PS-${b.id}</span>
              ${venue ? `<br><a class="btn btn-sm btn-secondary" href="venue.html?id=${venue.id}" style="margin-top:8px;">View venue</a>` : ''}
              ${!isCancelled && status !== 'Completed' ? `<br><button onclick="cancelBooking(${b.id})" class="btn btn-sm" style="margin-top:8px;background:#7c2d12;color:white;border:none;cursor:pointer;">Cancel</button>` : ''}
            </div>
          </div>`;
      }

      container.innerHTML = `
        ${upcoming.length ? `
          <h2 style="color:#f1f5f9; margin:0 0 16px;">Upcoming Bookings <span style="font-size:1rem;color:#7eb3e8;">(${upcoming.length})</span></h2>
          ${upcoming.map(bookingCard).join('')}
        ` : `<div class="info-card" style="margin-bottom:24px; text-align:center; padding:32px;">
          <p class="muted" style="margin:0;">No upcoming bookings. <a href="venues.html" style="color:#2563eb;">Browse venues →</a></p>
        </div>`}
        ${past.length ? `
          <h2 style="color:#f1f5f9; margin:24px 0 16px;">Past Bookings <span style="font-size:1rem;color:#7eb3e8;">(${past.length})</span></h2>
          ${past.map(bookingCard).join('')}
        ` : ''}
      `;

    } catch (err) {
      container.innerHTML = `<div class="info-card"><p class="muted">Failed to load bookings: ${err.message}</p></div>`;
    }
  }



  // ─── Auth forms ──────────────────────────────────────────────────────────────

  function showFieldError(input, message) {
    clearFieldError(input);
    input.style.borderColor = '#ef4444';
    const err = document.createElement('div');
    err.className = 'ps-field-error';
    err.style.cssText = 'color:#ef4444;font-size:0.82rem;margin-top:5px;';
    err.textContent = '⚠ ' + message;
    input.closest('.form-group')?.appendChild(err);
  }

  function clearFieldError(input) {
    input.style.borderColor = '';
    input.closest('.form-group')?.querySelector('.ps-field-error')?.remove();
  }

  function setFormLoading(btn, loading, defaultText) {
    btn.disabled = loading;
    btn.innerHTML = loading
      ? `<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:ps-spin 0.7s linear infinite;vertical-align:middle;margin-right:8px;"></span>Please wait...`
      : defaultText;
  }

  function setupAuthForms() {
    qsa('[data-auth-form]').forEach(form => {
      // Clear errors on input
      qsa('input', form).forEach(input => {
        input.addEventListener('input', () => clearFieldError(input));
      });

      form.addEventListener('submit', e => {
        e.preventDefault();
        const submitBtn = qs('button[type="submit"]', form) || qs('button:last-of-type', form);
        const defaultBtnText = submitBtn?.textContent || 'Submit';

        const emailInput = qs('input[type="email"]', form);
        const email = emailInput?.value.trim() || '';
        const password = (qs('#customer-password', form) || qs('#provider-password', form) || qs('input[type="password"]', form))?.value.trim() || '';

        const isCustomerRegister = !!qs('#first-name', form) && !!qs('#last-name', form) && !!qs('#confirm-password', form);
        const isProviderRegister = !!qs('#business-name', form) && !!qs('#business-email', form) && !!qs('#provider-confirm-password', form);
        const isLogin = !isCustomerRegister && !isProviderRegister;

        // Validate email format
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showFieldError(emailInput, 'Please enter a valid email address');
          return;
        }

        if (submitBtn) setFormLoading(submitBtn, true, defaultBtnText);

        (async () => {
          if (isLogin) {
            if (!email) { showFieldError(emailInput, 'Email is required'); if (submitBtn) setFormLoading(submitBtn, false, defaultBtnText); return; }
            const pwInput = qs('#customer-password', form) || qs('#provider-password', form) || qs('input[type="password"]', form);
            if (!password) { showFieldError(pwInput, 'Password is required'); if (submitBtn) setFormLoading(submitBtn, false, defaultBtnText); return; }

            const token = await apiRequest('/auth/login', { method: 'POST', form: { username: email, password } });
            saveSession(token);
            toast(`Welcome back, ${token.user?.name || email.split('@')[0]}!`, 'success');
            setTimeout(() => {
              // Return to venue if saved
              const returnUrl = sessionStorage.getItem('ps_return_url');
              sessionStorage.removeItem('ps_return_url');
              window.location.href = returnUrl || (token.user?.role === 'provider' ? 'provider-dashboard.html' : 'index.html');
            }, 800);
            return;
          }

          if (isCustomerRegister) {
            const firstInput = qs('#first-name', form);
            const lastInput  = qs('#last-name', form);
            const emailReg   = qs('#email', form);
            const passInput  = qs('#password', form);
            const confirmInput = qs('#confirm-password', form);
            const first = firstInput?.value.trim() || '';
            const last  = lastInput?.value.trim() || '';
            const pass  = passInput?.value.trim() || '';
            const confirm = confirmInput?.value.trim() || '';
            const regEmail = emailReg?.value.trim() || '';
            let hasError = false;
            if (!first) { showFieldError(firstInput, 'First name is required'); hasError = true; }
            if (!last)  { showFieldError(lastInput, 'Last name is required'); hasError = true; }
            if (!regEmail) { showFieldError(emailReg, 'Email is required'); hasError = true; }
            if (pass.length < 8) { showFieldError(passInput, 'Password must be at least 8 characters'); hasError = true; }
            if (pass !== confirm) { showFieldError(confirmInput, 'Passwords do not match'); hasError = true; }
            if (hasError) { if (submitBtn) setFormLoading(submitBtn, false, defaultBtnText); return; }
            await apiRequest('/auth/register', { method: 'POST', body: { name: `${first} ${last}`.trim(), email: regEmail, password: pass, role: 'customer' } });
            toast('Account created — please sign in', 'success');
            setTimeout(() => window.location.href = 'login.html', 1000);
            return;
          }

          if (isProviderRegister) {
            const bizInput   = qs('#business-name', form);
            const contactInput = qs('#contact-name', form);
            const emailInput  = qs('#business-email', form);
            const passInput   = qs('#provider-password', form);
            const confirmInput = qs('#provider-confirm-password', form);
            const biz     = bizInput?.value.trim() || '';
            const contact = contactInput?.value.trim() || '';
            const regEmail = emailInput?.value.trim() || '';
            const pass    = passInput?.value.trim() || '';
            const confirm = confirmInput?.value.trim() || '';
            let hasError = false;
            if (!biz) { showFieldError(bizInput, 'Business name is required'); hasError = true; }
            if (!regEmail) { showFieldError(emailInput, 'Business email is required'); hasError = true; }
            if (pass.length < 8) { showFieldError(passInput, 'Password must be at least 8 characters'); hasError = true; }
            if (pass !== confirm) { showFieldError(confirmInput, 'Passwords do not match'); hasError = true; }
            if (hasError) { if (submitBtn) setFormLoading(submitBtn, false, defaultBtnText); return; }
            const name = contact ? `${contact} (${biz})` : biz;
            await apiRequest('/auth/register', { method: 'POST', body: { name, email: regEmail, password: pass, role: 'provider' } });
            toast('Provider account created — please sign in', 'success');
            setTimeout(() => window.location.href = 'provider-login.html', 1000);
            return;
          }
        })().catch(err => {
          if (submitBtn) setFormLoading(submitBtn, false, defaultBtnText);
          toast(err?.message || 'Something went wrong. Please try again.', 'error');
        });
      });
    });
  }



  // ─── Demo banner ─────────────────────────────────────────────────────────────
  function addDemoBanner() {
    if (qs('#ps-demo-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'ps-demo-banner';
    banner.style.cssText = 'background:#1e40af;color:white;text-align:center;padding:10px 16px;font-size:0.9rem;position:relative;z-index:999;';
    banner.innerHTML = `🎓 Demo mode — use any card details to test bookings &nbsp;<button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,.2);border:none;color:white;border-radius:6px;padding:2px 10px;cursor:pointer;margin-left:8px;">✕</button>`;
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // ─── Back to top ─────────────────────────────────────────────────────────────
  function addBackToTop() {
    if (qs('#ps-back-top')) return;
    const btn = document.createElement('button');
    btn.id = 'ps-back-top';
    btn.innerHTML = '↑';
    btn.style.cssText = 'position:fixed;bottom:80px;right:24px;width:44px;height:44px;border-radius:50%;background:#2563eb;color:white;border:none;font-size:1.2rem;cursor:pointer;box-shadow:0 4px 14px rgba(37,99,235,.4);opacity:0;transition:opacity .3s;z-index:998;';
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => {
      btn.style.opacity = window.scrollY > 300 ? '1' : '0';
    });
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  redirectIfLoggedIn();
  guardMyBookingsPage();
  highlightActiveNav();
  setupOfflineDetection();
  checkBackendOnline();
  addDemoBanner();
  addBackToTop();
  updateNav();
  renderFeatured();
  setupHomeSearch();
  setupVenuesPage();
  applyHomeParamsToVenuePage();
  setupVenuePage();
  setupPaymentPage();
  setupMyBookingsPage();
  setupAuthForms();
  setupChatbot();

})();

  // ─── PrimeSpace Booking Assistant Chatbot ─────────────────────────────────────
  function setupChatbot() {
    const style = document.createElement('style');
    style.textContent = `
      #ps-chat-bubble { position:fixed; bottom:28px; right:28px; width:56px; height:56px; background:linear-gradient(135deg,#2563eb,#1e40af); border-radius:50%; cursor:pointer; z-index:9990; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(37,99,235,.5); transition:transform .2s; }
      #ps-chat-bubble:hover { transform:scale(1.08); }
      #ps-chat-bubble svg { width:26px; height:26px; fill:white; }
      #ps-chat-window { position:fixed; bottom:96px; right:28px; width:360px; max-height:520px; background:#0d1b2e; border:1px solid rgba(125,211,252,.15); border-radius:16px; z-index:9989; display:none; flex-direction:column; box-shadow:0 8px 40px rgba(0,0,0,.5); overflow:hidden; }
      #ps-chat-header { background:linear-gradient(135deg,#2563eb,#1e40af); padding:14px 18px; display:flex; align-items:center; gap:10px; }
      #ps-chat-header strong { color:white; font-size:1rem; }
      #ps-chat-header span { color:rgba(255,255,255,.7); font-size:0.8rem; }
      #ps-chat-messages { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; max-height:360px; }
      .ps-msg { max-width:80%; padding:10px 14px; border-radius:12px; font-size:0.9rem; line-height:1.5; }
      .ps-msg.bot { background:#0f1f38; color:#e2e8f0; border-bottom-left-radius:4px; align-self:flex-start; }
      .ps-msg.user { background:#2563eb; color:white; border-bottom-right-radius:4px; align-self:flex-end; }
      .ps-typing { background:#0f1f38; color:#7eb3e8; padding:10px 14px; border-radius:12px; border-bottom-left-radius:4px; align-self:flex-start; font-size:0.9rem; }
      #ps-chat-options { padding:8px 16px; display:flex; flex-wrap:wrap; gap:8px; }
      .ps-opt { background:#0f1f38; color:#93c5fd; border:1px solid rgba(125,211,252,.2); border-radius:20px; padding:6px 14px; font-size:0.85rem; cursor:pointer; transition:all .15s; white-space:nowrap; }
      .ps-opt:hover { background:#2563eb; color:white; border-color:#2563eb; }
      .ps-venue-card { background:#0f1f38; border:1px solid rgba(125,211,252,.15); border-radius:10px; overflow:hidden; cursor:pointer; transition:border-color .15s; width:100%; }
      .ps-venue-card:hover { border-color:#2563eb; }
      .ps-venue-card img { width:100%; height:80px; object-fit:cover; }
      .ps-venue-card-body { padding:8px 12px; }
      .ps-venue-card-body strong { color:#f1f5f9; font-size:0.9rem; display:block; }
      .ps-venue-card-body span { color:#7eb3e8; font-size:0.8rem; }
      #ps-chat-input-row { padding:10px 12px; border-top:1px solid rgba(125,211,252,.1); display:flex; gap:8px; }
      #ps-chat-input { flex:1; background:#0f1f38; border:1px solid rgba(125,211,252,.15); border-radius:8px; padding:8px 12px; color:#e2e8f0; font-size:0.9rem; outline:none; }
      #ps-chat-send { background:#2563eb; color:white; border:none; border-radius:8px; padding:8px 14px; cursor:pointer; font-size:0.9rem; }
      @media(max-width:420px) { #ps-chat-window { width:calc(100vw - 24px); right:12px; } }
    `;
    document.head.appendChild(style);

    // Chat bubble
    const bubble = document.createElement('div');
    bubble.id = 'ps-chat-bubble';
    bubble.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>`;
    document.body.appendChild(bubble);

    // Chat window
    const win = document.createElement('div');
    win.id = 'ps-chat-window';
    win.innerHTML = `
      <div id="ps-chat-header">
        <svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:white;flex-shrink:0;"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
        <div><strong>PrimeSpace Assistant</strong><br><span>Venue booking guide</span></div>
        <button onclick="document.getElementById('ps-chat-window').style.display='none'" style="margin-left:auto;background:rgba(255,255,255,.15);border:none;color:white;border-radius:6px;padding:4px 10px;cursor:pointer;">✕</button>
      </div>
      <div id="ps-chat-messages"></div>
      <div id="ps-chat-options"></div>
      <div id="ps-chat-input-row">
        <input id="ps-chat-input" placeholder="Type a message..." />
        <button id="ps-chat-send">Send</button>
      </div>`;
    document.body.appendChild(win);

    bubble.addEventListener('click', () => {
      const isOpen = win.style.display === 'flex';
      win.style.display = isOpen ? 'none' : 'flex';
      if (!isOpen && messages.length === 0) startConversation();
    });

    // Store element references directly after appending to DOM
    const msgBox = win.querySelector('#ps-chat-messages');
    const optBox = win.querySelector('#ps-chat-options');
    const messages = [];

    // Safe wrappers
    const messagesEl = () => msgBox;
    const optionsEl  = () => optBox;

    // State
    let state = { step: 0, city: null, type: null, guests: null, budget: null, date: null };

    function addMsg(text, who) {
      if (!msgBox) return;
      const div = document.createElement('div');
      div.className = `ps-msg ${who}`;
      div.innerHTML = text;
      messagesEl().appendChild(div);
      messagesEl().scrollTop = messagesEl().scrollHeight;
      messages.push({ who, text });
    }

    function showTyping() {
      if (!msgBox) return;
      const t = document.createElement('div');
      t.className = 'ps-typing';
      t.id = 'ps-typing-indicator';
      t.textContent = '● ● ●';
      msgBox.appendChild(t);
      msgBox.scrollTop = msgBox.scrollHeight;
    }

    function removeTyping() {
      msgBox?.querySelector('#ps-typing-indicator')?.remove();
    }

    function botSay(text, delay = 600) {
      showTyping();
      return new Promise(resolve => setTimeout(() => {
        removeTyping();
        addMsg(text, 'bot');
        resolve();
      }, delay));
    }

    function showOptions(opts) {
      if (!optBox) return;
      optBox.innerHTML = '';
      opts.forEach(o => {
        const btn = document.createElement('button');
        btn.className = 'ps-opt';
        btn.textContent = o.label;
        btn.addEventListener('click', () => {
          // Use setTimeout to avoid freezing from DOM mutation mid-click
          setTimeout(() => {
            optBox.innerHTML = '';
            addMsg(o.label, 'user');
            o.action();
          }, 0);
        });
        optBox.appendChild(btn);
      });
    }

    function getAvailableDatesForMonth(venue, month) {
      const monthMap = { april: '04', may: '05', june: '06' };
      const today = new Date().toISOString().split('T')[0];
      const avail = venue.availability || [];
      return avail.filter(d => {
        try {
          const parts = d.split('/');
          if (parts.length !== 3) return false;
          const [day, mm, year] = parts;
          const iso = `${year}-${mm}-${day}`;
          if (iso < today) return false;
          if (month === 'any') return true;
          return mm === monthMap[month];
        } catch { return false; }
      });
    }

    function showVenueResults(filtered) {
      if (optBox) optBox.innerHTML = '';
      if (!filtered || !filtered.length) {
        botSay("I couldn't find any venues matching those criteria. Try a different city, type or budget.").then(() => {
          showOptions([
            { label: '🔄 Start over', action: () => { state = { step:0, city:null, type:null, guests:null, budget:null, date:null }; askCity(); } },
            { label: '👀 Browse all venues', action: () => window.location.href = 'venues.html' }
          ]);
        });
        return;
      }

      const display = filtered.slice(0, 3);
      botSay(`Great news! I found <strong>${filtered.length} venue${filtered.length === 1 ? '' : 's'}</strong> matching your requirements:`).then(() => {
        display.forEach(v => {
          try {
            const availDates = getAvailableDatesForMonth(v, state.date || 'any');
            const datesHtml = availDates.length
              ? `<span style="color:#22c55e;font-size:0.78rem;">✓ Available: ${availDates.slice(0,3).join(', ')}</span>`
              : `<span style="color:#f59e0b;font-size:0.78rem;">Check venue for dates</span>`;
            const img = (v.images && v.images[0]) ? v.images[0] : 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&auto=format&fit=crop';
            const card = document.createElement('div');
            card.className = 'ps-venue-card';
            card.style.marginBottom = '8px';
            card.innerHTML = `
              <img src="${img}" alt="${v.name}" onerror="this.src='https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&auto=format&fit=crop'">
              <div class="ps-venue-card-body">
                <strong>${v.name}</strong>
                <span>📍 ${v.city} &nbsp;|&nbsp; 👥 Up to ${v.capacity} &nbsp;|&nbsp; £${v.price}/day &nbsp;|&nbsp; ⭐ ${v.rating}</span>
                <br>${datesHtml}
              </div>`;
            card.addEventListener('click', () => { window.location.href = `venue.html?id=${v.id}`; });
            if (msgBox) { msgBox.appendChild(card); msgBox.scrollTop = msgBox.scrollHeight; }
          } catch(err) {
            console.warn('Card render error:', err);
          }
        });

        if (filtered.length > 3) {
          setTimeout(() => botSay(`...and ${filtered.length - 3} more. <a href="venues.html" style="color:#93c5fd;text-decoration:underline;">View all →</a>`), 500);
        }

        setTimeout(() => showOptions([
          { label: '🔍 Search again', action: () => { state = { step:0,city:null,type:null,guests:null,budget:null,date:null }; askCity(); } },
          { label: '👀 Browse all venues', action: () => window.location.href = 'venues.html' }
        ]), filtered.length > 3 ? 1200 : 700);
      });
    }

    function filterVenues() {
      const today = new Date().toISOString().split('T')[0];
      const budgetMap = { 'under-1000': 1000, 'under-2000': 2000, 'under-3500': 3500, 'under-5000': 5000, 'any': 999999 };
      const maxPrice = budgetMap[state.budget] || 999999;

      return (venues || []).filter(v => {
        try {
          // City filter
          if (state.city && state.city !== 'any') {
            if (v.city.toLowerCase() !== state.city.toLowerCase()) return false;
          }
          // Type filter
          if (state.type && state.type !== 'any') {
            if ((v.type || '').toLowerCase() !== state.type.toLowerCase()) return false;
          }
          // Capacity filter
          if (state.guests && Number(state.guests) > 0) {
            if (v.capacity < Number(state.guests)) return false;
          }
          // Budget filter
          if (v.price > maxPrice) return false;

          // Date filter — check v.availability exists
          const avail = v.availability || [];
          if (state.date && state.date !== 'any') {
            const datesInMonth = getAvailableDatesForMonth(v, state.date);
            if (datesInMonth.length === 0) return false;
          } else {
            const hasFuture = avail.some(d => {
              const parts = d.split('/');
              if (parts.length !== 3) return false;
              const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
              return iso >= today;
            });
            if (!hasFuture) return false;
          }
          return true;
        } catch { return false; }
      });
    }

    function findVenues() {
      botSay('Let me search for the best venues for you... 🔍', 800).then(() => {
        try {
          const filtered = filterVenues();
          showVenueResults(filtered);
        } catch(err) {
          console.error('Chatbot findVenues error:', err);
          botSay('Sorry, something went wrong. Let me try again!').then(() => {
            state = { step:0, city:null, type:null, guests:null, budget:null, date:null };
            askCity();
          });
        }
      });
    }

    // Conversation steps
    function askCity() {
      const cities = [...new Set(venues.map(v => v.city))];
      botSay("Which city are you looking for a venue in? 📍").then(() => {
        showOptions([
          ...cities.map(c => ({ label: c, action: () => { state.city = c; askType(); } })),
          { label: 'Any city', action: () => { state.city = 'any'; askType(); } }
        ]);
      });
    }

    function askType() {
      botSay("What type of venue do you need? 🏢").then(() => {
        showOptions([
          { label: '🎤 Conference', action: () => { state.type = 'Conference'; askGuests(); } },
          { label: '🤝 Meeting room', action: () => { state.type = 'Meeting'; askGuests(); } },
          { label: '💡 Workshop space', action: () => { state.type = 'Workshop'; askGuests(); } },
          { label: '🎩 Ballroom', action: () => { state.type = 'Ballroom'; askGuests(); } },
          { label: '💼 Boardroom', action: () => { state.type = 'Boardroom'; askGuests(); } },
          { label: 'Any type', action: () => { state.type = 'any'; askGuests(); } }
        ]);
      });
    }

    function askGuests() {
      botSay("How many guests are you expecting? 👥").then(() => {
        showOptions([
          { label: 'Up to 30', action: () => { state.guests = 1; askBudget(); } },
          { label: '30 — 100', action: () => { state.guests = 30; askBudget(); } },
          { label: '100 — 200', action: () => { state.guests = 100; askBudget(); } },
          { label: '200 — 350', action: () => { state.guests = 200; askBudget(); } },
          { label: '350+', action: () => { state.guests = 350; askBudget(); } }
        ]);
      });
    }

    function askBudget() {
      botSay("What's your budget per day? 💷").then(() => {
        showOptions([
          { label: 'Under £1,000', action: () => { state.budget = 'under-1000'; askDate(); } },
          { label: 'Under £2,000', action: () => { state.budget = 'under-2000'; askDate(); } },
          { label: 'Under £3,500', action: () => { state.budget = 'under-3500'; askDate(); } },
          { label: 'Under £5,000', action: () => { state.budget = 'under-5000'; askDate(); } },
          { label: 'No limit', action: () => { state.budget = 'any'; askDate(); } }
        ]);
      });
    }

    function askDate() {
      botSay("When is your event? 📅").then(() => {
        showOptions([
          { label: 'April 2026', action: () => { state.date = 'april'; findVenues(); } },
          { label: 'May 2026', action: () => { state.date = 'may'; findVenues(); } },
          { label: 'June 2026', action: () => { state.date = 'june'; findVenues(); } },
          { label: 'Flexible', action: () => { state.date = 'any'; findVenues(); } }
        ]);
      });
    }

    async function startConversation() {
      await botSay("👋 Hi there! I'm the PrimeSpace booking assistant. I'll help you find the perfect corporate venue in seconds.", 500);
      await botSay("Just answer a few quick questions and I'll match you with the best options. Let's get started! 🚀", 900);
      askCity();
    }

    // Handle free text input
    const sendBtn = document.getElementById('ps-chat-send');
    const inputEl = document.getElementById('ps-chat-input');

    function handleInput() {
      const val = inputEl.value.trim();
      if (!val) return;
      inputEl.value = '';
      addMsg(val, 'user');
      const lower = val.toLowerCase();

      // ── Greetings ──
      if (/^(hi|hello|hey|hiya|good morning|good afternoon|good evening|howdy|sup|yo)/.test(lower)) {
        botSay("Hey there! 👋 I'm the PrimeSpace booking assistant. I can help you find the perfect corporate venue across the UK. Want to get started?").then(() => {
          showOptions([
            { label: '🔍 Find a venue', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } },
            { label: '❓ What can you do?', action: () => { addMsg('What can you do?', 'user'); botSay("I can help you find corporate venues across 12 UK cities based on your location, venue type, guest count, budget and preferred date. I'll show you matching venues with available dates so you can book instantly! 🏢"); } }
          ]);
        });
        return;
      }

      // ── What can you do / capabilities ──
      if (lower.includes('what can you') || lower.includes('what do you') || lower.includes('capabilities') || lower.includes('how do you work') || lower.includes('how does this work')) {
        botSay("I'm your PrimeSpace venue finder! Here's what I can do 🤖<br><br>• Find venues by city, type, guest count and budget<br>• Show available booking dates for each venue<br>• Filter out fully booked venues automatically<br>• Show you venue photos and pricing<br>• Link you directly to the booking page<br><br>Just answer a few questions and I'll find the best options for you!").then(() => {
          showOptions([{ label: '🔍 Find me a venue', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]);
        });
        return;
      }

      // ── Pricing questions ──
      if (lower.includes('price') || lower.includes('cost') || lower.includes('how much') || lower.includes('expensive') || lower.includes('cheap') || lower.includes('budget') || lower.includes('afford')) {
        const min = Math.min(...venues.map(v => v.price));
        const max = Math.max(...venues.map(v => v.price));
        botSay(`Our venues range from <strong>£${min}/day</strong> to <strong>£${max}/day</strong> depending on the city and venue type. Smaller boardrooms and workshops are at the lower end, while large conference suites and ballrooms are at the higher end. Want me to filter by your budget?`).then(() => {
          showOptions([
            { label: '💷 Under £1,000', action: () => { state.budget = 'under-1000'; askCity(); } },
            { label: '💷 Under £2,000', action: () => { state.budget = 'under-2000'; askCity(); } },
            { label: '💷 Under £3,500', action: () => { state.budget = 'under-3500'; askCity(); } },
            { label: '💷 No limit', action: () => { state.budget = 'any'; askCity(); } }
          ]);
        });
        return;
      }

      // ── Availability / dates ──
      if (lower.includes('available') || lower.includes('availability') || lower.includes('when') || lower.includes('date') || lower.includes('book') && lower.includes('when')) {
        botSay("All our venues have availability in <strong>April, May and June 2026</strong>. Each venue has specific available dates — once you select a venue the date picker only shows the dates you can actually book. Want me to find venues available in a specific month?").then(() => {
          showOptions([
            { label: '📅 April 2026', action: () => { state.date = 'april'; state.city = state.city || 'any'; state.type = state.type || 'any'; state.guests = state.guests || 1; state.budget = state.budget || 'any'; findVenues(); } },
            { label: '📅 May 2026', action: () => { state.date = 'may'; state.city = state.city || 'any'; state.type = state.type || 'any'; state.guests = state.guests || 1; state.budget = state.budget || 'any'; findVenues(); } },
            { label: '📅 June 2026', action: () => { state.date = 'june'; state.city = state.city || 'any'; state.type = state.type || 'any'; state.guests = state.guests || 1; state.budget = state.budget || 'any'; findVenues(); } }
          ]);
        });
        return;
      }

      // ── Capacity / how many people ──
      if (lower.includes('capacity') || lower.includes('how many people') || lower.includes('guests') || lower.includes('people') || lower.includes('attendees') || lower.includes('delegates')) {
        const min = Math.min(...venues.map(v => v.capacity));
        const max = Math.max(...venues.map(v => v.capacity));
        botSay(`Our venues range from <strong>${min} people</strong> (intimate boardrooms) up to <strong>${max} people</strong> (large conference suites and ballrooms). How many guests are you expecting?`).then(() => askGuests());
        return;
      }

      // ── Location / cities ──
      if (lower.includes('cities') || lower.includes('locations') || lower.includes('where') || lower.includes('which city') || lower.includes('what cities')) {
        const cityList = [...new Set(venues.map(v => v.city))].join(', ');
        botSay(`We have venues in <strong>12 UK cities</strong>: ${cityList}. Which city works best for you?`).then(() => askCity());
        return;
      }

      // ── Specific city named ──
      const cityNames = ['London','Manchester','Birmingham','Edinburgh','Cardiff','Bristol','Leeds','Glasgow','Liverpool','Nottingham','Newcastle','Sheffield'];
      const matchedCity = cityNames.find(c => lower.includes(c.toLowerCase()));
      if (matchedCity) {
        state.city = matchedCity;
        botSay(`Great choice — ${matchedCity} has some excellent corporate venues! 📍`).then(() => askType());
        return;
      }

      // ── Venue type ──
      if (lower.includes('conference')) { state.type = 'Conference'; botSay('Perfect — looking for conference venues! 🎤').then(() => askGuests()); return; }
      if (lower.includes('meeting')) { state.type = 'Meeting'; botSay('Got it — meeting rooms it is! 🤝').then(() => askGuests()); return; }
      if (lower.includes('workshop')) { state.type = 'Workshop'; botSay('Workshop spaces — great choice! 💡').then(() => askGuests()); return; }
      if (lower.includes('boardroom')) { state.type = 'Boardroom'; botSay('Boardroom it is — very professional! 💼').then(() => askGuests()); return; }
      if (lower.includes('ballroom') || lower.includes('gala') || lower.includes('banquet')) { state.type = 'Ballroom'; botSay('A grand ballroom — excellent for large events! 🎩').then(() => askGuests()); return; }

      // ── Number typed ──
      const num = parseInt(lower.match(/\d+/)?.[0]);
      if (num && num > 0 && num <= 1000) {
        state.guests = num;
        botSay(`${num} guests — noted! 👥`).then(() => askBudget());
        return;
      }

      // ── Start / find / search ──
      if (lower.includes('start') || lower.includes('find') || lower.includes('search') || lower.includes('help') || lower.includes('look') || lower.includes('show me') || lower.includes('recommend')) {
        state = { step:0, city:null, type:null, guests:null, budget:null, date:null };
        botSay("Sure! Let me help you find a venue. 😊").then(() => askCity());
        return;
      }

      // ── Amenities questions ──
      if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet')) {
        botSay("Most of our venues include WiFi as standard. When browsing venue details you'll see the full amenities list including WiFi, projectors, catering, parking and more. Want me to find venues for you?").then(() => showOptions([{ label: '🔍 Find venues', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]));
        return;
      }
      if (lower.includes('parking') || lower.includes('park')) {
        botSay("Several of our venues include parking — you can check the amenities list on each venue's detail page. Want me to help you find a venue and you can check the parking situation there?").then(() => showOptions([{ label: '🔍 Find venues', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]));
        return;
      }
      if (lower.includes('catering') || lower.includes('food') || lower.includes('lunch') || lower.includes('drink') || lower.includes('refreshment')) {
        botSay("Some of our venues include catering as part of their offering. You can check the amenities list on each venue's detail page to confirm. Want me to find venues for you?").then(() => showOptions([{ label: '🔍 Find venues', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]));
        return;
      }
      if (lower.includes('projector') || lower.includes('screen') || lower.includes('av') || lower.includes('audio') || lower.includes('equipment') || lower.includes('tech')) {
        botSay("Many of our conference and meeting venues include full AV equipment — projectors, audio systems and video conferencing. Check the amenities on each venue page for exact details. Shall I find options for you?").then(() => showOptions([{ label: '🔍 Find venues', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]));
        return;
      }

      // ── Booking process ──
      if (lower.includes('how to book') || lower.includes('how do i book') || lower.includes('booking process') || lower.includes('how to reserve')) {
        botSay("Booking is simple! Here's how it works 📋<br><br>1️⃣ Find a venue using my search or browse all venues<br>2️⃣ Select your event date from the available dates<br>3️⃣ Enter your guest count<br>4️⃣ Click Book Now and complete payment<br>5️⃣ You'll get an instant booking confirmation<br><br>Want me to find a venue for you right now?").then(() => {
          showOptions([{ label: '🔍 Find me a venue', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]);
        });
        return;
      }

      // ── Payment / security ──
      if (lower.includes('payment') || lower.includes('pay') || lower.includes('card') || lower.includes('secure') || lower.includes('safe') || lower.includes('refund') || lower.includes('cancel')) {
        botSay("PrimeSpace uses secure checkout for all bookings 🔒 We accept Visa, Mastercard and American Express. For this demo, any card details will work. Refund and cancellation policies are set by each venue — contact them directly for details. Any other questions?");
        return;
      }

      // ── Account / login ──
      if (lower.includes('account') || lower.includes('register') || lower.includes('sign up') || lower.includes('sign in') || lower.includes('login') || lower.includes('log in')) {
        botSay("You'll need a <strong>customer account</strong> to make bookings. You can <a href='customer-register.html' style='color:#93c5fd;'>register here</a> — it only takes a minute. Already have an account? <a href='login.html' style='color:#93c5fd;'>Sign in here</a>. 😊");
        return;
      }

      // ── Thanks ──
      if (lower.includes('thank') || lower.includes('cheers') || lower.includes('brilliant') || lower.includes('great') || lower.includes('awesome') || lower.includes('perfect') || lower.includes('nice')) {
        botSay("You're welcome! Happy to help anytime. Good luck with your event! 🎉");
        return;
      }

      // ── Goodbye ──
      if (lower.includes('bye') || lower.includes('exit') || lower.includes('close') || lower.includes('quit') || lower.includes('goodbye') || lower.includes('cya')) {
        botSay("Goodbye! Feel free to come back whenever you need help finding a venue. 👋");
        setTimeout(() => { win.style.display = 'none'; }, 2000);
        return;
      }

      // ── About PrimeSpace ──
      if (lower.includes('primespace') || lower.includes('about') || lower.includes('who are you') || lower.includes('what is this') || lower.includes('what are you')) {
        botSay("PrimeSpace is a premium corporate venue booking platform connecting businesses with top event spaces across the UK 🇬🇧 We have <strong>12 venues</strong> in <strong>12 cities</strong> covering everything from intimate boardrooms to grand conference suites. Want to find a venue?").then(() => {
          showOptions([{ label: '🔍 Find venues', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]);
        });
        return;
      }

      // ── Ratings / reviews ──
      if (lower.includes('rating') || lower.includes('review') || lower.includes('best venue') || lower.includes('top rated') || lower.includes('highest rated')) {
        const sorted = [...venues].sort((a,b) => b.rating - a.rating).slice(0,3);
        botSay(`Our top rated venues are:<br><br>${sorted.map(v => `⭐ <strong>${v.name}</strong> — ${v.rating} (${v.reviewsCount} reviews) — ${v.city}`).join('<br>')}<br><br>Want me to search for venues by your other requirements?`).then(() => {
          showOptions([{ label: '🔍 Search venues', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } }]);
        });
        return;
      }

      // ── Fallback ──
      botSay("I'm not sure I understood that — I'm best at helping you find corporate venues! Here's what I can help with 👇").then(() => {
        showOptions([
          { label: '🔍 Find a venue', action: () => { state = {step:0,city:null,type:null,guests:null,budget:null,date:null}; askCity(); } },
          { label: '💷 Pricing info', action: () => { addMsg('Pricing info', 'user'); const min = Math.min(...venues.map(v=>v.price)); const max = Math.max(...venues.map(v=>v.price)); botSay(`Venues range from £${min} to £${max} per day.`); } },
          { label: '📍 Which cities?', action: () => { addMsg('Which cities?', 'user'); botSay([...new Set(venues.map(v=>v.city))].join(', ')); } },
          { label: '📋 How to book', action: () => { addMsg('How to book', 'user'); botSay('Select a venue, pick an available date, enter guests, click Book Now and confirm payment. Done! ✅'); } }
        ]);
      });
    }

    sendBtn.addEventListener('click', handleInput);
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') handleInput(); });
  }

