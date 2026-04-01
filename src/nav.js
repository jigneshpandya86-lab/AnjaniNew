import { DB } from './state.js';
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

// ======================================================================
// MAIN DATA LOADER (WITH 5-SECOND ESCAPE HATCH)
// ======================================================================
export async function loadData() {
  return new Promise(async (resolve) => {
    const CACHE_KEY = 'anjani_db_v2'; 

    window.DB = DB;
    window._loadData = loadData;

    const connText = document.getElementById('conn-text');
    let gateUnlocked = false;
    
    // ── Master switch for the Data Gate ──
    const unlockGate = () => {
        if (!gateUnlocked) {
            gateUnlocked = true;
            resolve(true); // Tells the Splash Screen to vanish!
        }
    };

    // ── THE ESCAPE HATCH ──
    // NEVER trap the user for more than 5 seconds, no matter what.
    const escapeHatch = setTimeout(() => {
        if (!gateUnlocked) {
            console.warn("Data load took too long. Forcing app open.");
            if (connText) {
                connText.innerText = 'Network slow. Opening app...';
                connText.classList.remove('animate-pulse');
            }
            unlockGate();
        }
    }, 5000);

    // ======================================================================
    // STEP 1: LOAD CACHE 
    // ======================================================================
    const cached = window.AnjaniCache ? await window.AnjaniCache.get(CACHE_KEY) : null;
    
    if (cached && cached.orders && cached.orders.length > 0) {
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
        connText.innerText = 'Connecting to live database...';
        connText.classList.add('animate-pulse'); 
      }
      
      // If we have cached data, unlock instantly so you can work!
      clearTimeout(escapeHatch);
      unlockGate();
    } else {
      if (connText) connText.innerText = 'First time setup, downloading...';
    }

    // Only unlock instantly if the phone literally has airplane mode turned on
    if (!navigator.onLine) {
      if (connText) {
        connText.innerText = 'Offline — Using cached data';
        connText.classList.remove('animate-pulse');
      }
      clearTimeout(escapeHatch);
      unlockGate(); 
      return; 
    }

    // ======================================================================
    // STEP 2: WAIT FOR FIREBASE LIVE SYNC
    // ======================================================================
    let checkCount = 0;
    
    const checkFirebase = setInterval(() => {
      if (typeof window.setupRealtime === 'function') {
        clearInterval(checkFirebase); 
        
        window.setupRealtime(async function(eventName) {
          
          // Unlock the screen when Firebase confirms data is downloaded!
          if (eventName === '__initial_load_complete__' || (DB.orders && DB.orders.length > 0)) {
              clearTimeout(escapeHatch); // Data arrived! Kill the escape hatch.
              unlockGate();
          }

          if (connText) {
            connText.innerText = 'Live — ' + new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
            connText.classList.remove('animate-pulse');
          }

          if (typeof window._render === 'function') window._render();
          if (typeof window._renderLeads === 'function') window._renderLeads();
          if (typeof window._renderDashboard === 'function') window._renderDashboard();

          // Save the fresh live data to cache
          if (window.AnjaniCache && DB.orders && DB.orders.length > 0) {
            await window.AnjaniCache.set(CACHE_KEY, {
              customers: DB.customers, orders: DB.orders, payments: DB.payments,
              stock: DB.stock, jobs: DB.jobs, smartMsgs: DB.smartMsgs, leads: DB.leads,
            });
          }
        });
        
      } else if (checkCount > 40) {
        // Fail-safe: If Firebase is totally broken after 4 seconds
        clearInterval(checkFirebase);
        // We do nothing here because the 5-second escapeHatch above will fire in 1 second and open the app.
      }
      checkCount++;
    }, 100);

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
// LOGIN HANDLER (PIN -> SILENT FIREBASE AUTH)
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
      errorMsg.classList.remove('text-red-500');
      errorMsg.classList.add('text-blue-500');
      errorMsg.style.opacity = '1';
    }

    try {
      // 1. Show the Loading Splash Screen
      if (loader) loader.classList.remove('hidden');

      // 2. Secretly log into Firebase (This allows you to SAVE data!)
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, "admin@anjaniwater.in", "Anjani@2026");
      
      // 3. Save the session token
      localStorage.setItem('anjani_session', 'active');

      // 4. Reload the app to boot as an authenticated user.
      window.location.reload();

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
