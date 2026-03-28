// firebase-api.js — Firebase bridge replacing Google Apps Script JSONP polyfill
// Uses npm package imports (bundled by Vite) instead of CDN URLs.
import { db, auth, googleProvider } from './firebase-config.js';
import {
  collection, addDoc, getDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, setDoc, runTransaction, writeBatch, increment, onSnapshot,
  orderBy, limit,
} from 'firebase/firestore';
import {
  signInWithPopup, signOut, onAuthStateChanged,
} from 'firebase/auth';

const MACRO_URL = 'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms';

// ─── Google Auth helpers ──────────────────────────────────────────────────────

// Called by the "Sign in with Google" button in the login screen
window.handleGoogleLogin = async function() {
  const btn = document.getElementById('btn-google-login');
  const errEl = document.getElementById('google-error');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }
  if (errEl) errEl.classList.add('opacity-0');
  try {
    await signInWithPopup(auth, googleProvider);
    // onAuthStateChanged below will handle showing the app
  } catch (e) {
    console.error('[Auth] Google sign-in failed:', e.message);
    if (errEl) errEl.classList.remove('opacity-0');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Sign in with Google`; }
  }
};

// Called by a sign-out button (optional — can add to UI later)
window.handleGoogleSignOut = async function() {
  await signOut(auth);
  localStorage.removeItem('anjani_app_access');
  location.reload();
};

// Watch auth state — show/hide login screen automatically
onAuthStateChanged(auth, (user) => {
  const screen = document.getElementById('login-screen');
  if (!screen) return;
  if (user) {
    // Authenticated via Google — hide login screen and start the app
    localStorage.setItem('anjani_app_access', 'true');
    screen.style.opacity = '0';
    setTimeout(() => { screen.style.display = 'none'; }, 400);
    // Trigger data load if not already started
    if (typeof loadData === 'function' && !window._dataLoaded) {
      window._dataLoaded = true;
      loadData();
    }
  }
});

// ─── Input Validators ─────────────────────────────────────────────────────────

function validatePhone(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 12) throw new Error('Invalid mobile number: must be 10–12 digits');
  return digits.slice(-10); // normalise to last 10 digits
}

function validateAmount(amount) {
  const n = parseFloat(amount);
  if (isNaN(n) || n < 0) throw new Error('Invalid amount: must be a non-negative number');
  return Math.round(n * 100) / 100; // round to 2 decimal places
}

function validateRequiredString(value, fieldName) {
  const s = String(value || '').trim();
  if (!s) throw new Error(`${fieldName} is required`);
  return s;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getNextOrderId() {
  const metaRef = doc(db, 'meta', 'counters');
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(metaRef);
    // Initialise counter to 1000 if it doesn't exist yet, then atomically increment
    const currentId = snap.exists() ? (snap.data().orderId || 1000) : 1000;
    const nextId = currentId + 1;
    tx.set(metaRef, { orderId: increment(1) }, { merge: true });
    // Return nextId derived from the value we read inside the transaction —
    // Firestore guarantees this transaction retries on contention, so IDs are unique.
    return nextId;
  });
}

async function updateOutstandingBalance(clientId) {
  const cid = String(clientId);
  const [ordSnap, paySnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('clientId', '==', cid))),
    getDocs(query(collection(db, 'payments'), where('clientId', '==', cid)))
  ]);
  let totalOrders = 0, totalPaid = 0;
  ordSnap.docs.forEach(d => {
    if (d.data().status === 'Delivered') totalOrders += Math.round((parseFloat(d.data().amount) || 0) * 100);
  });
  paySnap.docs.forEach(d => { totalPaid += Math.round((parseFloat(d.data().amount) || 0) * 100); });
  // Divide by 100 to restore rupee precision after integer arithmetic
  await updateDoc(doc(db, 'customers', cid), { outstanding: (totalOrders - totalPaid) / 100 });
}

function todayIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const d = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Simple debounce (used by real-time listener) ─────────────────────────────

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ─── Real-time Firestore listeners ────────────────────────────────────────────
//
// subscribeToChanges(onUpdate) sets up onSnapshot listeners on every
// collection. Each listener:
//   • Automatically receives the initial data snapshot when first attached
//   • Fires again whenever a document is added / updated / deleted
//   • Updates window.DB in-place so the existing app code sees fresh data
//   • Calls the debounced onUpdate callback so the UI re-renders efficiently
//
// Returns an unsubscribe function to clean up all listeners.

let _unsubscribers = [];

function subscribeToChanges(onUpdate) {
  // Tear down any existing listeners first
  _unsubscribers.forEach(u => u());
  _unsubscribers = [];

  if (!window.DB) window.DB = {};

  // Debounce renders: batch rapid-fire updates (e.g. initial load of 7 collections)
  // into a single render call ~200 ms after the last snapshot.
  const debouncedRender = debounce(onUpdate, 200);

  // Track how many collections have delivered their first snapshot so we can
  // signal "initial load complete" to loadData().
  const COLLECTIONS = ['customers', 'orders', 'payments', 'stock', 'jobs', 'leads'];
  const loadedSet = new Set();
  let initialLoadFired = false;

  function markLoaded(name) {
    loadedSet.add(name);
    if (!initialLoadFired && loadedSet.size >= COLLECTIONS.length) {
      initialLoadFired = true;
      // Signal that all collections are ready (hides loader, saves cache)
      onUpdate('__initial_load_complete__');
    } else {
      debouncedRender(name);
    }
  }

  // ── Orders ───────────────────────────────────────────────────────────────────
  // No orderBy — avoids requiring a Firestore composite index.
  // The app sorts client-side so server ordering is not needed.
  _unsubscribers.push(
    onSnapshot(
      query(collection(db, 'orders'), limit(200)),
      snap => {
        window.DB.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        markLoaded('orders');
      },
      e => { console.error('[Realtime] orders error:', e); markLoaded('orders'); }
    )
  );

  // ── Customers ────────────────────────────────────────────────────────────────
  _unsubscribers.push(
    onSnapshot(
      query(collection(db, 'customers'), limit(500)),
      snap => {
        window.DB.customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        markLoaded('customers');
      },
      e => { console.error('[Realtime] customers error:', e); markLoaded('customers'); }
    )
  );

  // ── Payments ─────────────────────────────────────────────────────────────────
  _unsubscribers.push(
    onSnapshot(
      query(collection(db, 'payments'), limit(300)),
      snap => {
        window.DB.payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        markLoaded('payments');
      },
      e => { console.error('[Realtime] payments error:', e); markLoaded('payments'); }
    )
  );

  // ── Stock ────────────────────────────────────────────────────────────────────
  _unsubscribers.push(
    onSnapshot(
      query(collection(db, 'stock'), limit(300)),
      snap => {
        window.DB.stock = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        markLoaded('stock');
      },
      e => { console.error('[Realtime] stock error:', e); markLoaded('stock'); }
    )
  );

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  _unsubscribers.push(
    onSnapshot(
      collection(db, 'jobs'),
      snap => {
        window.DB.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        markLoaded('jobs');
      },
      e => { console.error('[Realtime] jobs error:', e); markLoaded('jobs'); }
    )
  );

  // ── Leads ────────────────────────────────────────────────────────────────────
  _unsubscribers.push(
    onSnapshot(
      collection(db, 'leads'),
      snap => {
        window.DB.leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        markLoaded('leads');
      },
      e => { console.error('[Realtime] leads error:', e); markLoaded('leads'); }
    )
  );

  // ── SmartMsgs (no pagination — small collection) ─────────────────────────────
  _unsubscribers.push(
    onSnapshot(
      collection(db, 'smartMsgs'),
      snap => {
        const smartMsgs = {};
        snap.docs.forEach(d => {
          smartMsgs[d.id] = d.data().message !== undefined ? d.data().message : d.data();
        });
        window.DB.smartMsgs = smartMsgs;
        // smartMsgs is not in COLLECTIONS, trigger render independently
        debouncedRender('smartMsgs');
      },
      e => console.error('[Realtime] smartMsgs error:', e)
    )
  );

  const unsubscribeAll = () => {
    _unsubscribers.forEach(u => u());
    _unsubscribers = [];
  };

  // Expose globally so non-module scripts can call it
  window._realtimeUnsubscribe = unsubscribeAll;
  return unsubscribeAll;
}

// Expose for use by the non-module main app script in index.html
window.setupRealtime = subscribeToChanges;

// ─── GAS Function Implementations ────────────────────────────────────────────

const GAS = {

  async getInitialData() {
    const [custSnap, ordSnap, paySnap, stockSnap, jobSnap, msgSnap] = await Promise.all([
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'payments')),
      getDocs(collection(db, 'stock')),
      getDocs(collection(db, 'jobs')),
      getDocs(collection(db, 'smartMsgs'))
    ]);
    const smartMsgs = {};
    msgSnap.docs.forEach(d => { smartMsgs[d.id] = d.data().message !== undefined ? d.data().message : d.data(); });
    return JSON.stringify({
      customers: custSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      orders:    ordSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      payments:  paySnap.docs.map(d => ({ id: d.id, ...d.data() })),
      stock:     stockSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      jobs:      jobSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      smartMsgs
    });
  },

  async getLeadsData() {
    const snap = await getDocs(collection(db, 'leads'));
    return JSON.stringify({ leads: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  },

  async getStockData() {
    const snap = await getDocs(collection(db, 'stock'));
    return JSON.stringify({ stock: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  },

  async getPaymentsData() {
    const snap = await getDocs(collection(db, 'payments'));
    return JSON.stringify({ payments: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  },

  async getJobsData() {
    const snap = await getDocs(collection(db, 'jobs'));
    return JSON.stringify({ jobs: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  },

  async saveOrder(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    const orderId = await getNextOrderId();
    d.id = String(orderId);
    d.status = d.status || 'Pending';
    d.orderDate = d.orderDate || todayIST();
    await setDoc(doc(db, 'orders', String(orderId)), d);
    return JSON.stringify({ success: true, orderId });
  },

  async updateOrderStatus(id, newStatus, qty, date, time, address) {
    const docRef = doc(db, 'orders', String(id));
    const updates = { status: newStatus };
    if (qty !== undefined && qty !== null && qty !== '') updates.boxes = qty;
    if (date) updates.deliveryDate = date;
    if (time) updates.time = time;
    if (address) updates.address = address;
    await updateDoc(docRef, updates);
    if (newStatus === 'Delivered') {
      const ordSnap = await getDoc(docRef);
      const ord = ordSnap.data();
      await Promise.all([
        addDoc(collection(db, 'stock'), {
          date: date || todayIST(),
          delivered: Number(qty) || Number(ord.boxes) || 0,
          produced: 0,
          customer: ord.customer || '',
          sku: ord.sku || 'Standard',
          clientId: String(ord.clientId || '')
        }),
        updateOutstandingBalance(ord.clientId)
      ]);
    }
    return JSON.stringify({ success: true });
  },

  async updateOrderLocation(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    await updateDoc(doc(db, 'orders', String(d.id)), {
      address: d.address || '',
      mapLink: d.mapLink || ''
    });
    return JSON.stringify({ success: true });
  },

  async saveCustomer(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    if (d.mobile) d.mobile = validatePhone(d.mobile);
    if (d.name) d.name = validateRequiredString(d.name, 'Customer name');
    if (d.rate !== undefined) d.rate = validateAmount(d.rate);
    const cid = String(d.id || d.mobile || Date.now());
    d.id = cid;
    if (d.isEdit) {
      delete d.isEdit;
      await updateDoc(doc(db, 'customers', cid), d);
    } else {
      d.outstanding = d.outstanding !== undefined ? d.outstanding : 0;
      d.active = d.active !== undefined ? d.active : true;
      await setDoc(doc(db, 'customers', cid), d, { merge: true });
    }
    return JSON.stringify({ success: true, id: cid });
  },

  async savePayment(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    d.amount = validateAmount(d.amount);
    if (!d.clientId) throw new Error('clientId is required for payment');
    d.date = d.date || todayIST();
    await addDoc(collection(db, 'payments'), d);
    if (d.clientId) await updateOutstandingBalance(d.clientId);
    return JSON.stringify({ success: true });
  },

  async recordDirectPayment(data) {
    return GAS.savePayment(data);
  },

  async saveProduction(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    d.date = d.date || todayIST();
    d.delivered = d.delivered !== undefined ? d.delivered : 0;
    await addDoc(collection(db, 'stock'), d);
    return JSON.stringify({ success: true });
  },

  async saveLead(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    if (d.mobile) d.mobile = validatePhone(d.mobile);
    const mobile = d.mobile || String(d.id || Date.now());
    d.id = mobile;
    d.createdDate = d.createdDate || todayIST();
    d.status = d.status || 'New';
    await setDoc(doc(db, 'leads', mobile), d, { merge: true });
    return JSON.stringify({ success: true, id: mobile });
  },

  async handleLeadAction(action, id) {
    const leadRef = doc(db, 'leads', String(id));
    if (action === 'DELETE') {
      await deleteDoc(leadRef);
    } else if (action === 'CONVERT') {
      const snap = await getDoc(leadRef);
      if (snap.exists()) {
        const lead = snap.data();
        await GAS.saveCustomer({
          id: String(id),
          name: lead.name || lead.raw || 'New Customer',
          mobile: lead.mobile || String(id),
          rate: 0,
          active: true,
          outstanding: 0
        });
        await updateDoc(leadRef, { status: 'Converted' });
      }
    } else {
      await updateDoc(leadRef, { status: action });
    }
    return JSON.stringify({ success: true });
  },

  async archiveOldLeads() {
    const snap = await getDocs(collection(db, 'leads'));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const batch = writeBatch(db);
    let count = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.status !== 'Converted' && data.status !== 'Archived') {
        const created = new Date(data.createdDate || 0);
        if (created < cutoff) {
          batch.update(d.ref, { status: 'Archived' });
          count++;
        }
      }
    });
    if (count > 0) await batch.commit();
    return JSON.stringify({ success: true, archived: count });
  },

  async updateLeadStatus(id) {
    const next = new Date();
    next.setDate(next.getDate() + 10);
    await updateDoc(doc(db, 'leads', String(id)), {
      status: 'Con',
      nextContact: next.toISOString().split('T')[0]
    });
    return JSON.stringify({ success: true });
  },

  async saveLeadNote(id, text) {
    await updateDoc(doc(db, 'leads', String(id)), { notes: text });
    return JSON.stringify({ success: true });
  },

  async logLeadBroadcast(id) {
    await updateDoc(doc(db, 'leads', String(id)), { lastContact: todayIST() });
    return JSON.stringify({ success: true });
  },

  async saveJob(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    const action = d.action || 'CREATE';
    if (action === 'CREATE') {
      const jid = String(Date.now());
      d.id = jid;
      d.status = d.status || 'Pending';
      d.date = d.date || todayIST();
      delete d.action;
      await setDoc(doc(db, 'jobs', jid), d);
    } else if (action === 'SENT' || action === 'DONE' || action === 'UNDO') {
      const statusMap = { SENT: 'Sent', DONE: 'Done', UNDO: 'Pending' };
      await updateDoc(doc(db, 'jobs', String(d.id)), { status: statusMap[action] });
    } else if (action === 'DELETE') {
      await deleteDoc(doc(db, 'jobs', String(d.id)));
    } else if (action === 'UPDATE') {
      const upd = { ...d };
      delete upd.action;
      await updateDoc(doc(db, 'jobs', String(d.id)), upd);
    }
    const snap = await getDocs(collection(db, 'jobs'));
    const jobs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return JSON.stringify({ jobs });
  },

  async logSmartAction(id, type) {
    const field = type === 'pay' ? 'lastPayRemind' : 'lastOrdRemind';
    await updateDoc(doc(db, 'customers', String(id)), { [field]: todayIST() });
    return JSON.stringify({ success: true });
  },

  async runComboActions() {
    return '✅ Local mode: skipped';
  },

  async parseTextWithGemini(text) {
    return JSON.stringify({ intent: 'ANSWER', reply: '🤖 AI is disabled in this version. Please use manual entry.' });
  },

  async parseImageWithGemini(base64) {
    return JSON.stringify({ error: '🤖 AI image parsing is disabled in this version.' });
  },

  async saveNewRuleToBrain(topic, instruction, actionId) {
    await addDoc(collection(db, 'ai_brain'), {
      topic,
      instruction,
      actionId,
      createdAt: new Date().toISOString()
    });
    return JSON.stringify({ success: true });
  },

  async getDashboardMetrics() {
    const DB = window.DB || {};
    const customers = DB.customers || [];
    const orders = DB.orders || [];
    const stock = DB.stock || [];
    const todayStr = todayIST();

    const totalOutstanding = customers.reduce((s, c) => s + (Number(c.outstanding) || 0), 0);
    const todayOrders = orders.filter(o => o.deliveryDate === todayStr);
    const todayStock = stock.filter(s => s.date === todayStr);
    const totalProduced = todayStock.reduce((s, r) => s + (Number(r.produced) || 0), 0);
    const totalDelivered = todayStock.reduce((s, r) => s + (Number(r.delivered) || 0), 0);

    return JSON.stringify({
      totalOutstanding,
      todayOrderCount: todayOrders.length,
      todayProduced: totalProduced,
      todayDelivered: totalDelivered,
      activeCustomers: customers.filter(c => c.active).length
    });
  },

  async getSmsCandidates() {
    const DB = window.DB || {};
    const customers = DB.customers || [];
    const candidates = customers.filter(c => c.outstanding > 0 && c.active && c.mobile);
    return JSON.stringify({ candidates });
  },

  async sendBackgroundSms(phone, message) {
    try {
      const url = `${MACRO_URL}?phone=${encodeURIComponent(phone)}&msg=${encodeURIComponent(message)}`;
      fetch(url, { mode: 'no-cors' }).catch(e => console.error('[SMS] fetch failed:', e.message));
    } catch (e) {
      console.error('[SMS] sendBackgroundSms error:', e.message);
    }
    return JSON.stringify({ success: true });
  },

  async logSmsSuccess(id, type) {
    const collName = type === 'lead' ? 'leads' : 'customers';
    await updateDoc(doc(db, collName, String(id)), { lastSmsSent: todayIST() });
    return JSON.stringify({ success: true });
  }
};

// ─── Proxy Bridge (mimics google.script.run API) ──────────────────────────────

function buildHandler(okFn, errFn) {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === 'withSuccessHandler') return (f) => buildHandler(f, errFn);
      if (prop === 'withFailureHandler') return (f) => buildHandler(okFn, f);
      return (...args) => {
        const fn = GAS[prop];
        if (!fn) {
          console.warn('[GAS] Unknown function:', prop);
          if (errFn) errFn(new Error('Unknown GAS function: ' + prop));
          return;
        }
        fn(...args)
          .then(r => { if (okFn) okFn(r); })
          .catch(e => { console.error('[GAS]', prop, e); if (errFn) errFn(e); });
      };
    }
  });
}

// Merge into window.google so that the GIS library's google.accounts is preserved
window.google = Object.assign(window.google || {}, {
  script: {
    run: new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return (f) => buildHandler(f, null);
        if (prop === 'withFailureHandler') return (f) => buildHandler(null, f);
        return (...args) => {
          const fn = GAS[prop];
          if (!fn) { console.warn('[GAS] Unknown function:', prop); return; }
          fn(...args).catch(e => console.error('[GAS]', prop, e));
        };
      }
    })
  }
};

console.log('[AnjaniApp] Firebase API bridge loaded ✅');
