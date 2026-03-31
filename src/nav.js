import { DB } from './state.js';

export async function loadData() {
  const log = document.getElementById('debug-log');
  const CACHE_KEY = 'anjani_db_v2'; 

  window.DB = DB;
  window._loadData = loadData;

  const loader = document.getElementById('loader');
  const connText = document.getElementById('conn-text');

  // ======================================================================
  // STEP 1: INSTANT CACHE LOAD (0.0 SECONDS)
  // ======================================================================
  const cached = window.AnjaniCache ? await window.AnjaniCache.get(CACHE_KEY) : null;
  
  if (cached) {
    // 1A. Instantly inject memory
    DB.customers = cached.customers || []; 
    DB.orders    = cached.orders || [];
    DB.payments  = cached.payments || []; 
    DB.stock     = cached.stock || [];
    DB.jobs      = cached.jobs || []; 
    DB.smartMsgs = cached.smartMsgs || {}; 
    DB.leads     = cached.leads || [];
    
    // 1B. Draw the screen immediately
    if (typeof window._render === 'function') window._render();
    if (typeof window._renderLeads === 'function') window._renderLeads();
    if (typeof window._renderDashboard === 'function') window._renderDashboard();
    
    // 1C. Kill the loading spinner immediately
    if (loader) loader.classList.add('hidden'); 
    if (connText) {
      connText.innerText = 'Syncing in background...';
      connText.classList.add('animate-pulse'); // Add a subtle pulse while syncing
    }
  } else {
    // ONLY show the loading spinner if they have literally never opened the app before
    if (loader) loader.classList.remove('hidden');
    if (connText) connText.innerText = 'First time setup, downloading...';
  }

  // Stop here if the user's phone is completely disconnected from the internet
  if (!navigator.onLine) {
    if (connText) {
      connText.innerText = 'Offline — Using cached data';
      connText.classList.remove('animate-pulse');
    }
    return; 
  }

  // ======================================================================
  // STEP 2: SILENT BACKGROUND SYNC (FIREBASE)
  // ======================================================================
  if (typeof window.setupRealtime === 'function') {
    window.setupRealtime(async function(eventName) {
      if (eventName === '__initial_load_complete__') {
        if (loader) loader.classList.add('hidden'); 
        if (connText) {
          connText.innerText = 'Live — ' + new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
          connText.classList.remove('animate-pulse');
        }
      }

      // Silently update the screen with the fresh Firebase data
      if (typeof window._render === 'function') window._render();
      if (typeof window._renderLeads === 'function') window._renderLeads();
      if (typeof window._renderDashboard === 'function') window._renderDashboard();

      // Save the fresh data to cache so it's ready for the next instant load
      if (window.AnjaniCache) {
        await window.AnjaniCache.set(CACHE_KEY, {
          customers: DB.customers, orders: DB.orders, payments: DB.payments,
          stock: DB.stock, jobs: DB.jobs, smartMsgs: DB.smartMsgs, leads: DB.leads,
        });
      }
    });
  } else {
    // Firebase Bridge Adapter (For getInitialData)
    google.script.run.withSuccessHandler(async function(res) {
      try {
        const parsed = JSON.parse(res);
        if (parsed.error) throw new Error(parsed.error);
        
        DB.customers = parsed.customers || []; DB.orders = parsed.orders || [];
        DB.payments  = parsed.payments || [];  DB.stock = parsed.stock || [];
        DB.jobs      = parsed.jobs || [];      DB.smartMsgs = parsed.smartMsgs || {}; 
        DB.leads     = parsed.leads || [];
        
        if (typeof window._render === 'function') window._render();
        if (typeof window._renderDashboard === 'function') window._renderDashboard();
        if (typeof window._renderLeads === 'function') window._renderLeads();
        
        if (loader) loader.classList.add('hidden');
        if (connText) {
          connText.innerText = 'Live — ' + new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
          connText.classList.remove('animate-pulse');
        }

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
      if (connText) {
        connText.innerText = 'Sync failed — using cached data';
        connText.classList.remove('animate-pulse');
      }
      if (loader) loader.classList.add('hidden');
    }).getInitialData();
  }
}

// ======================================================================
// NAVIGATION ROUTER (FIXED FOR HTML "view-" IDs)
// ======================================================================
export function go(pageId) {
  // 1. Hide all screens (looks for IDs starting with "view-")
  document.querySelectorAll('[id^="view-"]').forEach(el => {
    el.classList.add('hidden');
  });
  
  // 2. Show the target screen
  const target = document.getElementById('view-' + pageId);
  if (target) target.classList.remove('hidden');

  // 3. Highlight the active Mobile button
  document.querySelectorAll('.mob-item').forEach(el => el.classList.remove('active'));
  const mobBtn = document.getElementById('m-btn-' + pageId);
  if (mobBtn) mobBtn.classList.add('active');

  // 4. Highlight the active Desktop button
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const deskBtn = document.getElementById('d-btn-' + pageId);
  if (deskBtn) deskBtn.classList.add('active');

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth < 768) {
    sidebar.classList.add('-translate-x-full');
  }

  // Expose to window for quick links
  window._currentPage = pageId;
}

// Make sure it's attached to the window so HTML buttons can click it
window.go = go;

// ======================================================================
// LOGIN HANDLER
// ======================================================================
export function handleLogin(e) {
  if (e) e.preventDefault();
  
  // 1. Hide the login screen
  const loginScreen = document.getElementById('login-screen') || document.getElementById('page-login');
  if (loginScreen) loginScreen.classList.add('hidden');
  
  // 2. Show the main app layout
  const appLayout = document.getElementById('app-layout') || document.querySelector('.flex.h-screen');
  if (appLayout) appLayout.classList.remove('hidden');

  // 3. Trigger the instant data load we just built
  if (typeof window._loadData === 'function') {
    window._loadData();
  } else {
    loadData(); // Fallback if called directly from this file
  }

  // 4. Send the user to the dashboard
  if (typeof window.go === 'function') {
    window.go('dashboard');
  }
}

// Expose it to the HTML button
window.handleLogin = handleLogin;

// ======================================================================
// APP INITIALIZATION
// ======================================================================
export function initApp() {
  // Trigger the initial data load when the app starts
  if (typeof window._loadData === 'function') {
    window._loadData();
  } else if (typeof loadData === 'function') {
    loadData();
  }
}

// Expose it globally just in case HTML buttons or other scripts need it
window.initApp = initApp;
