import { DB } from './state.js';
import { enqueueAction } from './sync.js'; // Your existing queue

// ── THE MASTER ENGINE ─────────────────────────────────────────
export async function dispatch(actionType, payload) {
  
  // STEP 1: INSTANT LOCAL MEMORY UPDATE
  applyToLocalDB(actionType, payload);

  // STEP 2: INSTANT CACHE LOCK
  if (window.AnjaniCache) {
    window.AnjaniCache.set('anjani_db_v2', {
      customers: DB.customers, orders: DB.orders, payments: DB.payments,
      stock: DB.stock, jobs: DB.jobs, smartMsgs: DB.smartMsgs, leads: DB.leads
    });
  }

  // STEP 3: INSTANT UI RENDER
  if (typeof window._render === 'function') window._render();
  if (typeof window._renderDashboard === 'function') window._renderDashboard();
  
  // STEP 4: BACKGROUND FIREBASE SYNC
  try {
    if (!navigator.onLine) throw new Error("Offline");
    if (!window.FirebaseAPI) throw new Error("Firebase not ready");

    // Route to the correct Firebase function based on the action
    switch (actionType) {
      case 'SAVE_ORDER': 
        await window.FirebaseAPI.saveOrder(payload); 
        break;
      case 'UPDATE_ORDER': 
        await window.FirebaseAPI.updateOrderStatus(payload.id, payload.status, payload.qty, payload.date, payload.time, payload.address); 
        break;
      // Add 'SAVE_CLIENT', 'SAVE_PAYMENT', etc. here later!
    }
    
    console.log(`✅ [Engine] ${actionType} synced securely to cloud.`);

  } catch (err) {
    // If offline or Firebase fails, quietly push it to the background queue
    console.warn(`⏳ [Engine] ${actionType} queued for background sync. Reason:`, err.message);
    enqueueAction(actionType, payload); // Your sync.js will handle this when the internet returns
  }
}

// ── LOCAL DATA ROUTER ─────────────────────────────────────────
// This tells the engine exactly how to modify your local arrays
function applyToLocalDB(actionType, payload) {
  switch (actionType) {
    
    case 'SAVE_ORDER':
      // Give it an offline flag just in case
      payload._offline = !navigator.onLine;
      DB.orders.push(payload);
      break;

    case 'UPDATE_ORDER':
      const order = DB.orders.find(o => String(o.id) === String(payload.id));
      if (order) {
        if (payload.status !== null) order.status = payload.status;
        if (payload.qty !== null) order.boxes = payload.qty;
        if (payload.date !== null) order.deliveryDate = payload.date;
        if (payload.time !== null) order.time = payload.time;
        if (payload.address !== null) order.address = payload.address;
        order._offline = !navigator.onLine;
      }
      break;
  }
}
