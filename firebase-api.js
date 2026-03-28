// firebase-api.js — Firebase bridge replacing Google Apps Script JSONP polyfill
import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, getDoc, getDocs, doc, updateDoc, deleteDoc,
  query, where, setDoc, runTransaction, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, browserLocalPersistence, setPersistence, signOut
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const MACRO_URL = 'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getNextOrderId() {
  const metaRef = doc(db, 'meta', 'counters');
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(metaRef);
    const lastId = snap.exists() ? (snap.data().orderId || 1000) : 1000;
    const nextId = lastId + 1;
    tx.set(metaRef, { orderId: nextId }, { merge: true });
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
    if (d.data().status === 'Delivered') totalOrders += Number(d.data().amount) || 0;
  });
  paySnap.docs.forEach(d => { totalPaid += Number(d.data().amount) || 0; });
  await updateDoc(doc(db, 'customers', cid), { outstanding: totalOrders - totalPaid });
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
      stock:     stockSnap.docs.map(d => {
        const s = d.data();
        // Normalize old docs that saved 'qty' instead of 'produced'
        if (s.produced === undefined && s.qty !== undefined) s.produced = Number(s.qty);
        return { id: d.id, ...s };
      }),
      jobs:      jobSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      smartMsgs
    });
  },

  async getLeadsData() {
    const snap = await getDocs(collection(db, 'leads'));
    return JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  },

  async getStockData() {
    const snap = await getDocs(collection(db, 'stock'));
    return JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  },

  async getPaymentsData() {
    const snap = await getDocs(collection(db, 'payments'));
    return JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  },

  async getJobsData() {
    const snap = await getDocs(collection(db, 'jobs'));
    return JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
    const isEdit = !!d.isEdit;
    delete d.isEdit;
    const cid = String(d.id || d.mobile || Date.now());
    d.id = cid;
    if (isEdit) {
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
    // Frontend sends { qty, sku } — map to { produced, sku }
    const produced = Number(d.qty || d.produced) || 0;
    await addDoc(collection(db, 'stock'), {
      date:     d.date || todayIST(),
      produced: produced,
      delivered: 0,
      sku:      d.sku || '200ml'
    });
    return JSON.stringify({ success: true });
  },

  async saveLead(data) {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    const mobile = String(d.mobile || d.id || Date.now());
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

  async processIndiaMartEmails(emailsArray) {
    const emails = typeof emailsArray === 'string' ? JSON.parse(emailsArray) : emailsArray;
    let count = 0;
    const sessionNumbers = new Set();

    for (const email of emails) {
      try {
        const plainBody = email.body || '';
        const htmlBody  = email.htmlBody || '';
        const subject   = email.subject || '';
        const massiveBlock = plainBody + ' ' + htmlBody;

        let validMob = null;
        const rawMatches = massiveBlock.match(/\d{10,13}/g) || [];

        for (const raw of rawMatches) {
          const clean = raw.slice(-10);
          if (!['6','7','8','9'].includes(clean[0])) continue;
          if (clean.startsWith('800') || clean.startsWith('1800')) continue;
          if (sessionNumbers.has(clean)) { validMob = null; break; }
          validMob = clean;
          break;
        }

        if (validMob) {
          sessionNumbers.add(validMob);

          const lines = plainBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          let extractedName = 'Unknown';
          let loc = '';

          const regardsIdx = lines.findIndex(l => l.toLowerCase().startsWith('regards'));
          if (regardsIdx !== -1 && regardsIdx + 1 < lines.length) {
            extractedName = lines[regardsIdx + 1];
            for (let i = regardsIdx + 2; i < regardsIdx + 8; i++) {
              if (i >= lines.length) break;
              const line = lines[i];
              const low  = line.toLowerCase();
              if (low.includes('@') || low.includes('mobile') || low.includes('call')) continue;
              if (line.replace(/\D/g, '').includes(validMob)) continue;
              if (low.includes('member since') || low.includes('gst') || low.includes('verified') || line.length < 3) continue;
              loc = line;
              break;
            }
          }

          const prodMatch = subject.match(/Enquiry for\s+(.+?)(\s+from|$)/i);
          const product   = prodMatch ? prodMatch[1].trim() : 'General Enquiry';
          const finalName = extractedName !== 'Unknown' ? `${extractedName} IndiaMART Lead` : 'IndiaMART Lead';

          await GAS.saveLead({
            mobile: validMob,
            name: finalName,
            raw: `${finalName} | ${loc} | ${product} | ${validMob}`,
            notes: `Name: ${finalName}\nAddr: ${loc}\nQty: ${product}`
          });
          count++;
        }
      } catch (e) {
        console.error('[IndiaMART] Email Error:', e.message);
      }
    }

    return JSON.stringify({ success: true, processed: count });
  },

  async processIndiaMartEmail(body, subject) {
    return GAS.processIndiaMartEmails([{ body, htmlBody: '', subject: subject || '' }]);
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
    const orders    = DB.orders    || [];
    const payments  = DB.payments  || [];
    const stock     = DB.stock     || [];

    const todayStr = todayIST();
    const now = new Date();
    const weekAgo  = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);
    const weekStr  = weekAgo.toISOString().split('T')[0];
    const monthStr = monthAgo.toISOString().split('T')[0];

    function periodMetrics(fromStr) {
      const ords = orders.filter(o => o.status === 'Delivered' && (o.deliveryDate || '') >= fromStr);
      const pays = payments.filter(p => (p.date || '') >= fromStr);
      const stk  = stock.filter(s => (s.date || '') >= fromStr);
      return {
        orders: ords.length,
        box:    ords.reduce((s, o) => s + (Number(o.boxes) || 0), 0),
        prod:   stk.reduce((s, r)  => s + (Number(r.produced) || 0), 0),
        rev:    ords.reduce((s, o) => s + (Number(o.amount) || 0), 0),
        col:    pays.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      };
    }

    const netStock = stock.reduce((s, r) => s + (Number(r.produced) || 0) - (Number(r.delivered) || 0), 0);
    const totalOutstanding = customers.reduce((s, c) => s + (Number(c.outstanding) || 0), 0);
    const pendingOrders = orders.filter(o => o.status === 'Pending' || o.status === 'Processing').length;

    const result = {
      TODAY: periodMetrics(todayStr),
      WEEK:  periodMetrics(weekStr),
      MONTH: periodMetrics(monthStr),
      STATUS: {
        pending:     pendingOrders,
        outstanding: totalOutstanding,
        stock:       netStock
      }
    };
    console.log('[Dashboard] metrics:', JSON.stringify(result));
    return JSON.stringify(result);
  },

  async getSmsCandidates() {
    const DB = window.DB || {};
    const customers = DB.customers || [];
    const candidates = customers.filter(c => c.outstanding > 0 && c.active && c.mobile);
    return JSON.stringify({ candidates });
  },

  async sendBackgroundSms(phone, message) {
    // On Android APK: send directly via native SmsPlugin (silent, no app opens)
    // On web/browser: use MacroDroid webhook
    if (isAndroidWebView) {
      try {
        await window.Capacitor.Plugins.SmsPlugin.send({ phone, message });
        return JSON.stringify('SENT');
      } catch (e) {
        console.warn('[SMS] Native failed, falling back to MacroDroid:', e);
      }
    }
    // MacroDroid webhook (web browser OR native fallback)
    try {
      const url = `${MACRO_URL}?phone=${encodeURIComponent(phone)}&msg=${encodeURIComponent(message)}`;
      fetch(url, { mode: 'no-cors' });
    } catch (e) { /* ignore no-cors */ }
    return JSON.stringify('SENT');
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

// ─── Google Sign-In ──────────────────────────────────────────────────────────
// SETUP REQUIRED (one-time, in Firebase Console):
//   1. Authentication → Sign-in methods → Enable "Google"
//   2. Authentication → Settings → Authorized domains → Add "jigneshpandya86-lab.github.io"

const ALLOWED_EMAILS = ['jigneshpandya86@gmail.com'];

function hideLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (!screen || screen.style.display === 'none') return;
  screen.style.transition = 'opacity 0.4s';
  screen.style.opacity = '0';
  setTimeout(() => { screen.style.display = 'none'; }, 420);
}

// Detect Android WebView (Capacitor) vs normal browser
const isAndroidWebView = /wv/.test(navigator.userAgent) || (typeof window.Capacitor !== 'undefined');

// ─── Intercept sms: links on Android — send natively instead of opening SMS app ─
if (isAndroidWebView) {
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('a[href^="sms:"]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href'); // e.g. "sms:7990943652?body=Hello"
    const [rawPhone, rawParams] = href.replace('sms:', '').split('?');
    const phone   = rawPhone.replace(/\D/g, '');
    const message = new URLSearchParams(rawParams || '').get('body') || '';
    if (!phone || !message) return;
    try {
      await window.Capacitor.Plugins.SmsPlugin.send({ phone, message });
      console.log('[SMS] Native sent to', phone);
    } catch (err) {
      console.error('[SMS] Native failed:', err);
      // Fallback: open default SMS app
      window.open(href, '_blank');
    }
  }, true);
}

const GOOGLE_BTN_HTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg> Sign in with Google';

window.signInWithGoogle = async function() {
  const btn = document.getElementById('btn-google-signin');
  const errEl = document.getElementById('google-signin-error');
  if (btn) { btn.disabled = true; btn.innerHTML = '⟳ Signing in...'; }
  if (errEl) errEl.classList.add('hidden');
  try {
    await setPersistence(auth, browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    if (isAndroidWebView) {
      // Android WebView: redirect flow (opens Chrome tab, returns back)
      await signInWithRedirect(auth, provider);
    } else {
      // Browser: instant popup
      await signInWithPopup(auth, provider);
    }
  } catch (e) {
    console.error('[Auth] Google sign-in failed:', e);
    if (btn) { btn.disabled = false; btn.innerHTML = GOOGLE_BTN_HTML; }
    if (errEl) { errEl.textContent = 'Sign-in failed. Try again.'; errEl.classList.remove('hidden'); }
  }
};

// Handle redirect result on app load (Android WebView flow)
getRedirectResult(auth).catch(e => console.warn('[Auth] Redirect result error:', e));

// Auto-hide login screen if already authenticated (Google) or PIN session active
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (ALLOWED_EMAILS.includes(user.email)) {
      hideLoginScreen();
    } else {
      // Not an allowed user — sign out and show error
      await signOut(auth);
      const errEl = document.getElementById('google-signin-error');
      if (errEl) { errEl.textContent = '⛔ Access denied. This app is private.'; errEl.classList.remove('hidden'); }
      console.warn('[Auth] Blocked sign-in from:', user.email);
    }
  } else if (localStorage.getItem('anjani_app_access') === 'true') {
    hideLoginScreen();
  }
});

console.log('[AnjaniApp] Firebase API bridge loaded ✅');
