import { DB } from './state.js';
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

export async function loadData() {
  // Wrap the entire load process in a Promise so the Data Gate can "await" it
  return new Promise(async (resolve) => {
    const log = document.getElementById('debug-log');
    const CACHE_KEY = 'anjani_db_v2'; 

    window.DB = DB;
    window._loadData = loadData;

    const connText = document.getElementById('conn-text');

    // ======================================================================
    // STEP 1: INSTANT CACHE LOAD (0.0 SECONDS)
    // ======================================================================
    const cached = window.AnjaniCache ? await window.AnjaniCache.get(CACHE_KEY) : null;
    let hasCache = false;
    
    if (cached && Object.keys(cached).length > 0) {
      hasCache = true;
      DB.customers = cached.customers || []; 
      DB.orders    = cached.orders || [];
      DB.payments  = cached.payments || []; 
      DB.stock     = cached.stock || [];
      DB.jobs      = cached.jobs || []; 
      DB.smartMsgs = cached.smartMsgs || {}; 
      DB.leads     = cached.leads || [];
      
      if (typeof window._render === 'function') window._render();
      if (typeof window._renderLeads === 'function') window._renderLeads();
      if (typeof window._renderDashboard === 'function') window._renderDashboard();
      
      if (connText) {
        connText.innerText = 'Syncing in background...';
        connText.classList.add('animate-pulse');
      }

      // If we have cache, unlock the Splash Screen IMMEDIATELY so they can work!
      resolve(true); 
    } else {
      if (connText) connText.innerText = 'First time setup, downloading...';
    }

    if (!navigator.onLine) {
      if (connText) {
        connText.innerText = 'Offline — Using cached data';
        connText.classList.remove('animate-pulse');
      }
      resolve(true); // Unlock screen if offline
      return; 
    }

    // ======================================================================
    // STEP 2: SILENT BACKGROUND SYNC (FIREBASE)
    // ======================================================================
    if (typeof window.setupRealtime === 'function') {
      window.setupRealtime(async function(eventName) {
        if (eventName === '__initial_load_complete__') {
          if (connText) {
            connText.innerText = 'Live — ' + new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
            connText.classList.remove('animate-pulse');
          }
          // If they didn't have cache (Cold Start), unlock the Splash Screen NOW
          if (!hasCache) resolve(true); 
        }

        // Silently update the screen with fresh Firebase data
        if (typeof window._render === 'function') window._render();
        if (typeof window._renderLeads === 'function') window._renderLeads();
        if (typeof window._renderDashboard === 'function') window._renderDashboard();

        // Save fresh data to cache
        if (window.AnjaniCache) {
          await window.AnjaniCache.set(CACHE_KEY, {
            customers: DB.customers, orders: DB.orders, payments: DB.payments,
            stock: DB.stock, jobs: DB.jobs, smartMsgs: DB.smartMsgs, leads: DB.leads,
          });
        }
      });
    } else {
      // Fallback
      resolve(true);
    }
  });
}

// ======================================================================
// NAVIGATION ROUTER
// ======================================================================
export function go(pageId) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById('view-' + pageId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.mob-item').forEach(el => el.classList.remove('active'));
  const mobBtn = document.getElementById('m-btn-' + pageId);
  if (mobBtn) mobBtn.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const deskBtn = document.getElementById('d-btn-' + pageId);
  if (deskBtn) deskBtn.classList.add('active');

  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth < 768) sidebar.classList.add('-translate-x-full');

  window._currentPage = pageId;
}
window.go = go;

// ======================================================================
// LOGIN HANDLER (PIN -> FIREBASE BRIDGE)
// ======================================================================
export async function handleLogin(e) {
  if (e) e.preventDefault();
  
  const pinInput = document.getElementById('pin-input');
  const pin = pinInput ? pinInput.value : '';
  const errorMsg = document.getElementById('pin-error');

  if (pin === "9999") {
    if (errorMsg) {
      errorMsg.innerText = "AUTHENTICATING...";
      errorMsg.style.opacity = '1';
      errorMsg.classList.replace('text-red-500', 'text-blue-500');
    }

    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, "admin@anjaniwater.in", "Anjani@2026");
      localStorage.setItem('anjani_session', 'active'); // Save login state

      // Wait for data to download before removing login screen
      if (typeof window._loadData === 'function') await window._loadData();

      const loginScreen = document.getElementById('login-screen') || document.getElementById('page-login');
      if (loginScreen) loginScreen.classList.add('hidden');
      
      const appLayout = document.getElementById('app-layout') || document.querySelector('.flex.h-screen');
      if (appLayout) appLayout.classList.remove('hidden');

      if (typeof window.go === 'function') window.go('dashboard');

    } catch (error) {
      if (errorMsg) {
        errorMsg.innerText = "⛔ DATABASE ERROR: " + error.message;
        errorMsg.classList.replace('text-blue-500', 'text-red-500');
      }
    }
  } else {
    if (errorMsg) {
      errorMsg.innerText = "⛔ INCORRECT PIN";
      errorMsg.classList.replace('text-blue-500', 'text-red-500');
      errorMsg.style.opacity = '1';
      setTimeout(() => { if(errorMsg) errorMsg.style.opacity = '0'; }, 2000);
    }
  }
}
window.handleLogin = handleLogin;

export function initApp() {} // Keep empty to prevent legacy code breaking
window.initApp = initApp;
