// ============================================================
// OFFLINE SYNC QUEUE
// ============================================================
import { DB } from './state.js';
import { showToast, showSpinner, hideSpinner } from './utils.js';

const ACTION_QUEUE_KEY = 'anjani_action_queue';

export function getActionQueue() {
  try { return JSON.parse(localStorage.getItem(ACTION_QUEUE_KEY) || '[]'); }
  catch(e) { return []; }
}

export function saveActionQueue(q) {
  try { localStorage.setItem(ACTION_QUEUE_KEY, JSON.stringify(q)); }
  catch(e) { console.log('[Queue] Save failed:', e); }
}

export function enqueueAction(fn, params) {
  const q = getActionQueue();
  q.push({ id: Date.now(), fn: fn, params: params, timestamp: new Date().toISOString() });
  saveActionQueue(q);
  updateSyncBadge();
  showOfflineToast('📥 Saved offline — will sync when online');
  console.log('[Queue] Enqueued:', fn, '— Queue size:', q.length);
}

export function updateSyncBadge() {
  const q = getActionQueue();
  const badge = document.getElementById('sync-badge');
  const count = document.getElementById('sync-count');
  if (!badge || !count) return;
  if (q.length > 0) { badge.style.display = 'block'; count.innerText = q.length; }
  else { badge.style.display = 'none'; }
}

export function showOfflineToast(msg) {
  let t = document.getElementById('offline-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'offline-toast';
    t.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);background:#f59e0b;color:white;padding:8px 20px;border-radius:999px;font-size:12px;font-weight:bold;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.3s';
    document.body.appendChild(t);
  }
  t.innerText = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

export function drainActionQueue() {
  const q = getActionQueue();
  if (!q.length) return;
  console.log('[Queue] Draining', q.length, 'queued actions...');
  showToast('🔄 Syncing ' + q.length + ' offline action(s)...');
  let processed = 0;
  const processNext = () => {
    if (processed >= q.length) {
      saveActionQueue([]);
      updateSyncBadge();
      // loadData is called from nav.js — import lazily to avoid circular dep
      if (typeof window._loadData === 'function') window._loadData();
      showToast('✅ All offline actions synced!');
      return;
    }
    const item = q[processed++];
    try {
      google.script.run
        .withSuccessHandler(() => { console.log('[Queue] ✅ Synced:', item.fn); processNext(); })
        .withFailureHandler((e) => { console.log('[Queue] ❌ Failed:', item.fn, e); processNext(); })
        [item.fn](item.params);
    } catch(e) { console.log('[Queue] Error calling:', item.fn, e); processNext(); }
  };
  processNext();
}

export function updateOnlineStatus() {
  const dot   = document.getElementById('conn-dot');
  const text  = document.getElementById('conn-text');
  const badge = document.getElementById('sync-badge');

  if (navigator.onLine) {
    document.body.classList.remove('is-offline');
    if (dot)  dot.className  = 'w-2 h-2 rounded-full bg-green-400';
    if (text) text.innerText = 'Connected';
    // Try Background Sync via Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        if (reg.sync) reg.sync.register('anjani-sync');
      });
    }
    // Drain offline queue
    drainActionQueue();
  } else {
    document.body.classList.add('is-offline');
    if (dot)  dot.className  = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
    if (text) text.innerText = 'Offline — changes queued';
  }
  updateSyncBadge();
}

export function forceRefresh() {
  const currentView = localStorage.getItem('ANJANI_LAST_VIEW') || 'orders';
  showSpinner("Syncing Data...");
  if (currentView==='leads') { google.script.run.withSuccessHandler(res => { DB.leads=JSON.parse(res); if (typeof window._renderLeads === 'function') window._renderLeads(); hideSpinner(); showToast("✅ Leads Synced"); }).getLeadsData(); }
  else if (currentView==='stock') { google.script.run.withSuccessHandler(res => { DB.stock=JSON.parse(res); if (typeof window._renderStockPage === 'function') window._renderStockPage(); hideSpinner(); showToast("✅ Stock Synced"); }).getStockData(); }
  else { google.script.run.withSuccessHandler(res => { const d=JSON.parse(res); DB.customers=d.customers; DB.orders=d.orders; DB.jobs=d.jobs; DB.stock=d.stock||[]; DB.smartMsgs=d.smartMsgs||{}; DB.payments=d.payments||[]; if(currentView==='dashboard') { if (typeof window._renderDashboard === 'function') window._renderDashboard(); } else if(currentView==='smart') { if (typeof window._renderSmartActions === 'function') window._renderSmartActions(); } else { if (typeof window._render === 'function') window._render(); } hideSpinner(); showToast("✅ System Synced"); }).getInitialData(); }
}

export function recordAction(id, type, btn) {
  const card = btn.closest('div.shadow-sm');
  if (card) { card.style.opacity = '0.5'; card.style.pointerEvents = 'none'; }
  google.script.run.withSuccessHandler(() => { if(card) card.remove(); if(document.getElementById('smart-list').children.length===0 && typeof window._renderSmartActions === 'function') window._renderSmartActions(); }).logSmartAction(id, type);
}
