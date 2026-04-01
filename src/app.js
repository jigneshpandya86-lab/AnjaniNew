import { getAuth, onAuthStateChanged } from "firebase/auth";

// ── Boot Sequence: The Master Controller ──────────────
async function startApp() {
  const loader = document.getElementById('loader');
  const loginScreen = document.getElementById('login-screen');

  const session = localStorage.getItem('anjani_session');

  if (session) {
    // 1. Show Splash, Hide Login
    if (loader) loader.classList.remove('hidden');
    if (loginScreen) loginScreen.classList.add('hidden');

    // 2. Wait for Firebase Admin Auth (Max 3 seconds safety net)
    const auth = getAuth();
    await new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          resolve(); 
          unsubscribe();
        }
      });
      setTimeout(() => { resolve(); }, 3000); 
    });

    // 3. Run Data Loader (nav.js handles the timeouts)
    try {
      if (typeof window._loadData === 'function') {
        await window._loadData(); 
      }
    } catch (err) {
      console.warn("⏳ Data Gate error:", err);
    }

    // 4. Render UI & Drop Screen
    if (typeof window._render === 'function') window._render();
    if (typeof window._renderDashboard === 'function') window._renderDashboard();
    
    if (loader) loader.classList.add('hidden');

  } else {
    // 🔴 NOT LOGGED IN
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (loader) loader.classList.add('hidden');
  }
}

window.addEventListener('DOMContentLoaded', startApp);
