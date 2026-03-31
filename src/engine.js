import { DB } from './state.js';
import { enqueueAction } from './sync.js';

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

  // STEP 3: INSTANT UI RENDER (Triggers all visible screens to refresh)
  if (typeof window._render === 'function') window._render();
  if (typeof window._renderDashboard === 'function') window._renderDashboard();
  if (typeof window._renderRecentPayments === 'function') window._renderRecentPayments();
  if (typeof window._renderCustomers === 'function') window._renderCustomers('');
  if (typeof window._renderStockPage === 'function') window._renderStockPage();
  if (typeof window._renderLeads === 'function') window._renderLeads();
  
  // STEP 4: BACKGROUND FIREBASE SYNC
  try {
    if (!navigator.onLine) throw new Error("Offline");
    if (!window.FirebaseAPI) throw new Error("Firebase not ready");

    // Route to the correct Firebase API based on the action
    switch (actionType) {
      // ORDERS
      case 'SAVE_ORDER':   
        await window.FirebaseAPI.saveOrder(payload); break;
      case 'UPDATE_ORDER': 
        await window.FirebaseAPI.updateOrderStatus(payload.id, payload.status, payload.qty, payload.date, payload.time, payload.address); break;
      
      // PAYMENTS
      case 'SAVE_PAYMENT': 
        await window.FirebaseAPI.savePayment(payload); break;
      
      // CUSTOMERS
      case 'SAVE_CLIENT':  
        await window.FirebaseAPI.saveClient(payload); break;
      
      // STOCK
      case 'SAVE_STOCK':   
        await window.FirebaseAPI.saveStock(payload); break;
      
      // LEADS
      case 'SAVE_LEAD':    
        await window.FirebaseAPI.saveLead(payload); break;
      case 'UPDATE_LEAD':  
        await window.FirebaseAPI.updateLead(payload.id, payload.updates); break;
      
      // JOBS / SMART ACTIONS
      case 'SAVE_JOB':     
        await window.FirebaseAPI.saveJob(payload); break;
      case 'UPDATE_JOB':   
        await window.FirebaseAPI.updateJob(payload.id, payload.updates); break;

      default:
        console.warn(`[Engine] Unhandled action type: ${actionType}`);
    }
    
    console.log(`✅ [Engine] ${actionType} synced securely to cloud.`);

  } catch (err) {
    // If offline or Firebase fails, quietly push it to the background queue
    console.warn(`⏳ [Engine] ${actionType} queued for background sync. Reason:`, err.message);
    enqueueAction(actionType, payload);
  }
}

// ── LOCAL DATA ROUTER ─────────────────────────────────────────
// This tells the engine exactly how to modify your local arrays instantly
function applyToLocalDB(actionType, payload) {
  
  // Helper to quickly flag items as offline if there's no internet
  const isOffline = !navigator.onLine;

  // Helper to quickly update existing records by ID
  const updateRecord = (table, id, mappedUpdates) => {
    const idx = DB[table].findIndex(x => String(x.id) === String(id));
    if (idx > -1) {
      DB[table][idx] = { ...DB[table][idx], ...mappedUpdates, _offline: isOffline };
    }
  };

  switch (actionType) {
    
    // -- ORDERS --
    case 'SAVE_ORDER':
      payload._offline = isOffline;
      DB.orders.push(payload);
      break;
    case 'UPDATE_ORDER':
      const ordUpdates = {};
      if (payload.status !== null) ordUpdates.status = payload.status;
      if (payload.qty !== null) ordUpdates.boxes = payload.qty;
      if (payload.date !== null) ordUpdates.deliveryDate = payload.date;
      if (payload.time !== null) ordUpdates.time = payload.time;
      if (payload.address !== null) ordUpdates.address = payload.address;
      updateRecord('orders', payload.id, ordUpdates);
      break;

    // -- PAYMENTS --
    case 'SAVE_PAYMENT':
      payload._offline = isOffline;
      DB.payments.push(payload);
      break;

    // -- CUSTOMERS --
    case 'SAVE_CLIENT':
      payload._offline = isOffline;
      const existingCustIdx = DB.customers.findIndex(x => String(x.id) === String(payload.id));
      if (existingCustIdx > -1) {
        DB.customers[existingCustIdx] = payload; // Update existing
      } else {
        DB.customers.push(payload); // Create new
      }
      break;

    // -- STOCK --
    case 'SAVE_STOCK':
      payload._offline = isOffline;
      DB.stock.push(payload);
      break;

    // -- LEADS --
    case 'SAVE_LEAD':
      payload._offline = isOffline;
      DB.leads.push(payload);
      break;
    case 'UPDATE_LEAD':
      updateRecord('leads', payload.id, payload.updates);
      break;

    // -- JOBS --
    case 'SAVE_JOB':
      payload._offline = isOffline;
      DB.jobs.push(payload);
      break;
    case 'UPDATE_JOB':
      updateRecord('jobs', payload.id, payload.updates);
      break;
  }
}
