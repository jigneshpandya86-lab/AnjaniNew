import { DB } from './state.js';
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

export async function loadData() {
  return new Promise(async (resolve) => {
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
    let isCached = false;
    
    if (cached && Object.keys(cached).length > 0) {
      isCached = true;
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
      
      if (connText) {
        connText.innerText = 'Syncing in background...';
        connText.classList.add('animate-pulse'); 
      }
      
      // Since data is loaded from cache, we can resolve the promise immediately to unlock the screen.
      resolve(true);
    } else {
      if (connText) connText.innerText = 'First time setup, downloading...';
    }

    // Stop here if the user's phone is completely disconnected from the internet
    if (!navigator.onLine) {
      if (connText) {
        connText.innerText = 'Offline — Using cached data';
        connText.classList.remove('animate-pulse');
      }
      resolve(true); 
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
          // If the app started WITHOUT cache, we resolve here once Firebase sends the initial payload.
          if (!isCached) resolve(true);
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
        // Fail-safe resolution in case setupRealtime isn't loaded yet.
        console.warn("setupRealtime not found.");
        resolve(true);
    }
  });
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
// LOGIN HANDLER (PIN -> FIREBASE BRIDGE)
// ======================================================================
// ======================================================================
// LOGIN HANDLER (PIN -> FIREBASE BRIDGE)
// ======================================================================
export async function handleLogin(e) {
  if (e) e.preventDefault();
  
  const pinInput = document.getElementById('pin-input');
  const pin = pinInput ? pinInput.value : '';
  const errorMsg = document.getElementById('pin-error');
  const loader = document.getElementById('loader');

  // Change "9999" to whatever secret PIN you want to use!
  if (pin === "9999") {
    if (errorMsg) {
      errorMsg.innerText = "AUTHENTICATING...";
      errorMsg.style.opacity = '1';
      errorMsg.classList.remove('text-red-500');
      errorMsg.classList.add('text-blue-500');
    }

    try {
      // 1. Immediately show the Data Gate Splash Screen over the login box
      if (loader) loader.classList.remove('hidden');

      // 2. Secretly log into Firebase
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, "admin@anjaniwater.in", "Anjani@2026");
      localStorage.setItem('anjani_session', 'active');

      // 3. Give Firebase 0.5 seconds to register the new login token
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. NOW fetch the data AND wait for it to finish!
      if (typeof window._loadData === 'function') {
        await window._loadData();
      } else if (typeof loadData === 'function') {
        await loadData(); 
      }

      // 5. Data is loaded! Hide Login and Loader screens
      const loginScreen = document.getElementById('login-screen') || document.getElementById('page-login');
      if (loginScreen) loginScreen.classList.add('hidden');
      if (loader) loader.classList.add('hidden');
      
      const appLayout = document.getElementById('app-layout') || document.querySelector('.flex.h-screen');
      if (appLayout) appLayout.classList.remove('hidden');

      // 6. Send the user to the fully populated dashboard
      if (typeof window.go === 'function') {
        window.go('dashboard');
      }

    } catch (error) {
      if (loader) loader.classList.add('hidden');
      if (errorMsg) {
        errorMsg.innerText = "⛔ DATABASE ERROR: " + error.message;
        errorMsg.classList.remove('text-blue-500');
        errorMsg.classList.add('text-red-500');
      }
    }
  } else {
    // Wrong PIN
    if (errorMsg) {
      errorMsg.innerText = "⛔ INCORRECT PIN";
      errorMsg.classList.remove('text-blue-500');
      errorMsg.classList.add('text-red-500');
      errorMsg.style.opacity = '1';
      setTimeout(() => { if(errorMsg) errorMsg.style.opacity = '0'; }, 2000);
    }
  }
}
window.handleLogin = handleLogin;
// ======================================================================
// APP INITIALIZATION
// ======================================================================
export function initApp() {
   // Empty because we handle startup logic in app.js now.
}

// Expose it globally just in case HTML buttons or other scripts need it
window.initApp = initApp;
