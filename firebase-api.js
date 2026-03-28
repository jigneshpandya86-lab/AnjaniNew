// firebase-api.js — Firebase bridge replacing Google Apps Script JSONP polyfill
import { db } from './firebase-config.js';
import {
  collection, addDoc, getDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, setDoc, runTransaction, writeBatch, increment
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const MACRO_URL = 'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms';

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

window.google = {
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
