// ============================================================
// NAVIGATION, LOGIN, DATA LOADING
// ============================================================
import { DB, APP_PIN, SESSION_KEY, STAFF_NUM, CONFIG } from './state.js';
import { setText, debounce, showSpinner, hideSpinner } from './utils.js';

export function handleLogin() {
  const input = document.getElementById('pin-input');
  const btn = document.getElementById('btn-login');
  const screen = document.getElementById('login-screen');
  const errorMsg = document.getElementById('pin-error');
  const card = document.getElementById('login-card');
  if (!input || !btn) return;
  const val = input.value;
  btn.disabled = true;
  btn.innerText = "CHECKING...";
  errorMsg.classList.add('opacity-0');
  input.classList.remove('border-red-500', 'text-red-500');
  if (val === APP_PIN) {
    localStorage.setItem(SESSION_KEY, "true");
    btn.innerText = "✅ AUTHORIZED";
    btn.classList.remove('bg-slate-900'); btn.classList.add('bg-green-600');
    card.style.transform = "scale(1.05)";
    screen.style.opacity = "0";
    setTimeout(() => { screen.style.display = 'none'; }, 500);
    if (!window._dataLoaded) { window._dataLoaded = true; loadData(); }
  } else {
    errorMsg.classList.remove('opacity-0');
    input.classList.add('border-red-500', 'text-red-500');
    btn.disabled = false; btn.innerText = "TRY AGAIN 🔒";
    card.classList.add('animate-shake');
    setTimeout(() => card.classList.remove('animate-shake'), 300);
    input.select();
  }
}

export function initApp() {
  const now = new Date();
  setText('date-badge', now.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ' ' + now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}));
  const todayStr = now.toISOString().split('T')[0];
  const dateInput = document.getElementById('ord-date');
  if (dateInput) dateInput.value = todayStr;
  const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const timeInput = document.getElementById('ord-time');
  if (timeInput) timeInput.value = timeStr;
  const payDate = document.getElementById('pay-date');
  if (payDate) payDate.value = todayStr;
  // Search debounce
  const searchBox = document.getElementById('ord-search-input');
  if (searchBox) searchBox.addEventListener('input', debounce(() => { if (typeof window._render === 'function') window._render(); }, 300));
  // Restore last view
  const lastView = localStorage.getItem('ANJANI_LAST_VIEW');
  go(lastView && lastView !== 'cust-detail' ? lastView : 'orders');
  // loadData() is called either by onAuthStateChanged (Google sign-in)
  // or by handleLogin() (PIN). Only call directly if already PIN-authenticated.
  if (localStorage.getItem(SESSION_KEY) === 'true' && !window._dataLoaded) {
    window._dataLoaded = true;
    loadData();
  }
  // Load chat history
  if (typeof window._loadHistory === 'function') window._loadHistory();
  const ph = document.getElementById('sj-ph'); if(ph && !ph.value) ph.value = '91' + STAFF_NUM;
}

export async function loadData() {
  const log = document.getElementById('debug-log');
  const CACHE_KEY = 'anjani_db_v2'; 

  window.DB = DB;
  window._loadData = loadData;

  // 1. SHOW LOADER: Block the screen until we know the data is ready
  const loader = document.getElementById('loader');
  if (loader) loader.classList.remove('hidden');

  const cached = window.AnjaniCache ? await window.AnjaniCache.get(CACHE_KEY) : null;

  // 2. OFFLINE MODE: If no internet, use cache immediately
  if (!navigator.onLine) {
    if (cached) {
      DB.customers = cached.customers || []; DB.orders = cached.orders || [];
      DB.payments = cached.payments || []; DB.stock = cached.stock || [];
      DB.jobs = cached.jobs || []; DB.smartMsgs = cached.smartMsgs || {}; DB.leads = cached.leads || [];
      
      if (typeof window._render === 'function') window._render();
      if (typeof window._renderLeads === 'function') window._renderLeads();
      if (typeof window._renderDashboard === 'function') window._renderDashboard();
      
      if (loader) loader.classList.add('hidden'); // Hide loader
      const connText = document.getElementById('conn-text');
      if (connText) connText.innerText = 'Offline — Using cached data';
    } else {
      if (log) { log.innerText = 'No internet & no cached data. Please connect once to load data.'; log.classList.remove('hidden'); }
    }
    return; 
  }

  // Safety timeout (12 seconds max wait)
  setTimeout(() => {
    if (loader && !loader.classList.contains('hidden')) {
      loader.classList.add('hidden');
    }
  }, 12000);

  // 3. ONLINE MODE: Download everything from Firebase, then start
  if (typeof window.setupRealtime === 'function') {
    window.setupRealtime(async function(eventName) {
      if (eventName === '__initial_load_complete__') {
        if (loader) loader.classList.add('hidden'); // Hide loader ONLY when live data arrives
        const connText = document.getElementById('conn-text');
        if (connText) connText.innerText = 'Live — ' + new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
      }

      if (typeof window._render === 'function') window._render();
      if (typeof window._renderLeads === 'function') window._renderLeads();
      if (typeof window._renderDashboard === 'function') window._renderDashboard();

      // Save fresh data to local cache
      if (window.AnjaniCache) {
        await window.AnjaniCache.set(CACHE_KEY, {
          customers: DB.customers, orders: DB.orders, payments: DB.payments,
          stock: DB.stock, jobs: DB.jobs, smartMsgs: DB.smartMsgs, leads: DB.leads,
        });
      }
    });
  } else {
    // Firebase Bridge Adapter
    google.script.run.withSuccessHandler(async function(res) {
      try {
        const parsed = JSON.parse(res);
        if (parsed.error) throw new Error(parsed.error);
        DB.customers = parsed.customers || []; DB.orders = parsed.orders || [];
        DB.payments = parsed.payments || []; DB.stock = parsed.stock || [];
        DB.jobs = parsed.jobs || []; DB.smartMsgs = parsed.smartMsgs || {}; DB.leads = parsed.leads || [];
        
        if (typeof window._render === 'function') window._render();
        if (typeof window._renderDashboard === 'function') window._renderDashboard();
        if (typeof window._renderLeads === 'function') window._renderLeads();
        
        if (loader) loader.classList.add('hidden'); // Hide loader ONLY when live data arrives

        if (window.AnjaniCache) {
          await window.AnjaniCache.set(CACHE_KEY, {
            customers: DB.customers, orders: DB.orders, payments: DB.payments,
            stock: DB.stock, jobs: DB.jobs, smartMsgs: DB.smartMsgs, leads: DB.leads,
          });
        }
      } catch(e) {
        if (log) { log.innerText = 'DATA: ' + e.message; log.classList.remove('hidden'); }
      }
    }).withFailureHandler(function(e) {
      console.error('[Firebase] Load failed:', e.message);
      
      // If Firebase crashes, safely fallback to cache so the app doesn't break
      if (cached) {
        DB.customers = cached.customers || []; DB.orders = cached.orders || [];
        DB.payments = cached.payments || []; DB.stock = cached.stock || [];
        DB.jobs = cached.jobs || []; DB.smartMsgs = cached.smartMsgs || {}; DB.leads = cached.leads || [];
        
        if (typeof window._render === 'function') window._render();
        if (typeof window._renderDashboard === 'function') window._renderDashboard();
        if (typeof window._renderLeads === 'function') window._renderLeads();
        
        if (loader) loader.classList.add('hidden');
        const connText = document.getElementById('conn-text');
        if (connText) connText.innerText = 'Sync failed — using cached data';
      }
    }).getInitialData();
  }
}
export function go(p) {
  localStorage.setItem('ANJANI_LAST_VIEW', p);
  ['dashboard','orders','customers','stock','payments','leads','cust-detail','smart'].forEach(function(x) {
    const el = document.getElementById('view-' + x);
    if (el) el.classList.add('hidden');
    const dBtn = document.getElementById('d-btn-' + x);
    if (dBtn) dBtn.classList.remove('active');
    const mBtn = document.getElementById('m-btn-' + x);
    if (mBtn) mBtn.classList.remove('active');
  });
  const target = document.getElementById('view-' + p);
  if (target) target.classList.remove('hidden');
  if (p !== 'cust-detail') {
    const dBtnActive = document.getElementById('d-btn-' + p);
    if (dBtnActive) dBtnActive.classList.add('active');
    const mBtnActive = document.getElementById('m-btn-' + p);
    if (mBtnActive) mBtnActive.classList.add('active');
  }
  // Lazy loads
  if (p === 'leads') {
    if (typeof window._renderLeads === 'function') window._renderLeads();
  }
  if (p === 'stock') { if (typeof window._renderStockPage === 'function') window._renderStockPage(); }
  if (p === 'payments') { if (typeof window._renderRecentPayments === 'function') window._renderRecentPayments(); }
  if (p === 'dashboard') { if (typeof window._renderDashboard === 'function') window._renderDashboard(); }
  if (p === 'smart') { if (typeof window._renderSmartActions === 'function') window._renderSmartActions(); if (typeof window._renderJobs === 'function') window._renderJobs(); if (typeof window._renderDailyStatus === 'function') window._renderDailyStatus(); if (typeof window._updateSmartBadge === 'function') window._updateSmartBadge(); }
  window.scrollTo(0,0);
}
