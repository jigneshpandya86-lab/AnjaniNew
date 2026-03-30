// ============================================================
// AI CHAT, VOICE, REPORT GENERATION
// Phase 4: Extracted from index.html inline script
// ============================================================
import { DB, CHAT_KEY, STAFF_NUM } from './state.js';
import { showToast } from './utils.js';
import { go, loadData } from './nav.js';
import { fillCust, calc, render } from './orders.js';
import { renderRecentPayments, submitPayment } from './payments.js';
import { openCustForm } from './customers.js';

export function addBubble(text, type, save) {
  if (save === undefined) save = true;
  const chat = document.getElementById('chat-messages');
  if (!chat) return;
  const isAi = type === 'ai';
  const div = document.createElement('div');
  div.className = "flex " + (isAi ? "justify-start" : "justify-end");
  div.innerHTML = `<div class="${isAi ? 'bg-white border border-slate-200 text-slate-800' : 'bg-indigo-600 text-white'} p-3 rounded-xl text-sm shadow-sm max-w-[85%] leading-relaxed whitespace-pre-wrap">${text}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  if (save) {
    const h = JSON.parse(localStorage.getItem(CHAT_KEY)||"[]");
    h.push({text: text, type: type});
    if (h.length > 50) h.shift();
    localStorage.setItem(CHAT_KEY, JSON.stringify(h));
  }
}

export function loadHistory() {
  const h = JSON.parse(localStorage.getItem(CHAT_KEY)||"[]");
  if (h.length > 0) {
    const chat = document.getElementById('chat-messages');
    if (chat) chat.innerHTML = '';
    h.forEach(m => addBubble(m.text, m.type, false));
  }
}

export function clearHistory() {
  localStorage.removeItem(CHAT_KEY);
  const chat = document.getElementById('chat-messages');
  if (chat) chat.innerHTML = '<div class="flex justify-start"><div class="bg-white border border-slate-200 p-3 rounded-xl shadow-sm text-sm text-slate-600 max-w-[85%]">👋 History cleared. I\'m ready. I have read your <b>AI_Brain</b> and <b>Full Database</b>.</div></div>';
  showToast("🧹 Chat History Cleared");
}

// ============================================================
// LOCAL QUERY INTERCEPTOR (Zero Gemini Quota)
// ============================================================
export function localQueryInterceptor(txt) {
  const t = txt.toLowerCase().trim();
// ── COMMA SHORTHAND PARSER ───────────────────────────────
// p: Ramesh, 500        → record payment
// o: Ramesh, 5          → place order
// o: Ramesh, 5, 150     → place order with custom rate
// c: Ramesh, 9876543210, 150  → add new client

if (t.startsWith('p:')) {
  const parts = txt.replace(/^p:\s*/i, '').split(',').map(x => x.trim());
  const name = parts[0] || '';
  const amt  = parts[1] || '';
  if (name && amt) return generateReport('record_payment', null, { name, amt });
  return "⚠️ Format: p: CustomerName, Amount";
}

if (t.startsWith('o:')) {
  const parts = txt.replace(/^o:\s*/i, '').split(',').map(x => x.trim());
  const name = parts[0] || '';
  const qty  = parts[1] || '';
  const rate = parts[2] || '';
  if (name && qty) {
    // If custom rate provided, temporarily override
    if (rate) {
      const c = (DB.customers||[]).find(x => x.name.toLowerCase().includes(name.toLowerCase()));
      if (c) {
        const origRate = c.rate;
        c.rate = rate;
        const result = generateReport('draft_order', null, { name, qty });
        c.rate = origRate;
        return result;
      }
    }
    return generateReport('draft_order', null, { name, qty });
  }
  return "⚠️ Format: o: CustomerName, Qty  or  o: CustomerName, Qty, Rate";
}

if (t.startsWith('c:')) {
  const parts = txt.replace(/^c:\s*/i, '').split(',').map(x => x.trim());
  const name   = parts[0] || '';
  const mobile = parts[1] || '';
  const rate   = parts[2] || '150';
  if (name && mobile) {
    openCustForm();
    setTimeout(() => {
      const n = document.getElementById('new-name');
      const m = document.getElementById('new-mob');
      const r = document.getElementById('new-rate');
      if (n) n.value = name;
      if (m) m.value = mobile;
      if (r) r.value = rate;
    }, 200);
    return `✅ Opening form for *${name}* — ${mobile} @ ₹${rate}\nReview and hit SAVE.`;
  }
  return "⚠️ Format: c: Name, Mobile, Rate";
}
  // ── ORDERS ──────────────────────────────────────────────
  if (t.match(/today|aaj|આજ/) && t.match(/order|delivery|deliver/))
    return generateReport('today_orders');

  if (t.match(/tomorrow|kal|કાલ/) && t.match(/order|delivery/))
    return generateReport('tomorrow_orders');

  if (t.match(/pending|baaki|baki/) && !t.match(/pay|due|amount/))
    return generateReport('pending');

  if (t.match(/all order|total order|kitne order|how many order/))
    return generateReport('all_orders_summary');

  if (t.match(/delivered today|aaj deliver|આજ deliver/))
    return generateReport('delivered_today');

  if (t.match(/this week|is hafte|weekly order/))
    return generateReport('week_orders');

  if (t.match(/schedule|nilesh ko bhejo|send to nilesh/))
    return generateReport('schedule');

  // ── SPECIFIC ORDER LOOKUP ────────────────────────────────
  const orderMatch = t.match(/order\s*#?\s*(\d{3,6})/);
  if (orderMatch)
    return generateReport('order_detail', orderMatch[1]);

  // ── PAYMENTS ────────────────────────────────────────────
  if (t.match(/today|aaj/) && t.match(/pay|payment|collection|jama|received/))
    return generateReport('today_payments');

  if (t.match(/this week|is hafte/) && t.match(/pay|collection/))
    return generateReport('week_payments');

  if (t.match(/this month|is mahine/) && t.match(/pay|collection/))
    return generateReport('month_payments');

  if (t.match(/last payment|aakhri payment|recent payment/))
    return generateReport('recent_payments');

  // ── RECORD PAYMENT (Action) ──────────────────────────────
  // "record payment 500 for Ramesh" / "Ramesh ne 500 diya"
  const payRecord = t.match(/(?:record|save|add|jama|diya|diye|paid|ne)\s+(?:payment\s+)?(?:₹|rs\.?|inr)?\s*(\d+)\s+(?:for|from|ne|by|ko)?\s*([a-zA-Z\u0A80-\u0AFF ]{2,20})|([a-zA-Z\u0A80-\u0AFF ]{2,20})\s+(?:ne|paid|diya)\s+(?:₹|rs\.?|inr)?\s*(\d+)/);
  if (payRecord) {
    const amt   = payRecord[1] || payRecord[4];
    const name  = (payRecord[2] || payRecord[3] || '').trim();
    if (amt && name) return generateReport('record_payment', null, { name, amt });
  }

  // ── DRAFT ORDER (Action) ─────────────────────────────────
  // "order for Ramesh 5 boxes" / "Ramesh ke liye 3 box"
  const draftOrder = t.match(/(?:order|book|draft)\s+(?:for|ke liye)?\s*([a-zA-Z ]{2,20})\s+(\d+)\s*(?:box|boxes|peti)?|([a-zA-Z ]{2,20})\s+(?:ke liye|ka order)\s+(\d+)\s*(?:box|boxes|peti)?/);
  if (draftOrder) {
    const name = (draftOrder[1] || draftOrder[3] || '').trim();
    const qty  = draftOrder[2] || draftOrder[4];
    if (name && qty && name.length > 1) return generateReport('draft_order', null, { name, qty });
  }

  // ── MARK DELIVERED (Action) ──────────────────────────────
  // "deliver order 1045" / "1045 delivered"
  const delMatch = t.match(/(?:deliver|mark|done|complete)\s+(?:order\s*#?)?\s*(\d{3,6})|(\d{3,6})\s+(?:deliver|delivered|done)/);
  if (delMatch) {
    const id = delMatch[1] || delMatch[2];
    return generateReport('mark_delivered', id);
  }

  // ── DUES / OUTSTANDING ───────────────────────────────────
  if (t.match(/due|dues|outstanding|balance|baki amount|ledger|udhaar/))
    return generateReport('dues');

  // SPECIFIC CUSTOMER BALANCE
  // "Ramesh ka balance" / "how much does Ramesh owe"
  const balMatch = t.match(/([a-zA-Z ]{2,20})\s+(?:ka|ki|ke|ko|ne)?\s*(?:balance|due|outstanding|baki|udhaar|owe)/);
  if (balMatch && balMatch[1].trim().length > 1)
    return generateReport('customer_balance', null, { name: balMatch[1].trim() });

  // ── STOCK ────────────────────────────────────────────────
  if (t.match(/stock|inventory|kitna|stok|available/))
    return generateReport('stock');

  if (t.match(/add stock|production|produce|banaya|stock add/)) {
    const stockQty = t.match(/(\d+)/);
    if (stockQty) return generateReport('add_stock', null, { qty: stockQty[1] });
  }

  // ── CUSTOMERS ───────────────────────────────────────────
  if (t.match(/customer list|all customer|kitne customer|how many customer|client list/))
    return generateReport('customers');

  if (t.match(/inactive|band|stopped|no order/))
    return generateReport('inactive_customers');

  if (t.match(/top customer|best customer|sabse zyada/))
    return generateReport('top_customers');

  // ── LEADS ────────────────────────────────────────────────
  if (t.match(/lead|prospect|new enquiry/))
    return generateReport('leads_summary');

  // ── DASHBOARD / SUMMARY ──────────────────────────────────
  if (t.match(/summary|report|dashboard|aaj ka hisab|daily report|overview/))
    return generateReport('daily_summary');

  if (t.match(/revenue|income|earning|kitna kamayi/))
    return generateReport('revenue');

  // ── NAVIGATION (Action) ──────────────────────────────────
  if (t.match(/open order|go to order|order page|order view/))
    { go('orders'); return "📦 Opened Orders page."; }

  if (t.match(/open payment|go to payment|payment page/))
    { go('payments'); return "💳 Opened Payments page."; }

  if (t.match(/open stock|go to stock|stock page/))
    { go('stock'); return "📦 Opened Stock page."; }

  if (t.match(/open lead|go to lead|lead page/))
    { go('leads'); return "🎯 Opened Leads page."; }

  if (t.match(/open dashboard|go to dashboard/))
    { go('dashboard'); return "📊 Opened Dashboard."; }

  // ── HELP ─────────────────────────────────────────────────
  if (t.match(/help|kya kar|what can you|commands|features/))
    return generateReport('help');

  if (t.match(/payment.*pending|pending.*payment|unpaid|collect/))
  return generateReport('dues');

  return null; // Not handled locally → send to Gemini
}

export function generateReport(type, id, params) {
  const todayStr = new Date().toISOString().split('T')[0];
  const fmtDate  = d => (d || '').split('-').reverse().join('-');

  // ── Helper: calculate customer balance ──────────────────
  function custBal(cid) {
  const c = (DB.customers || []).find(x => String(x.id) === String(cid));
  return c ? (Number(c.outstanding) || 0) : 0;
}

  // ── Helper: fuzzy find customer ─────────────────────────
  function findCust(name) {
    if (!name) return null;
    const clean = name.toLowerCase().replace(/(bhai|ben|ji|bhen)/g, '').trim();
    return (DB.customers || []).find(c =>
      c.name.toLowerCase().replace(/(bhai|ben|ji|bhen)/g, '').trim().includes(clean) ||
      clean.includes(c.name.toLowerCase().replace(/(bhai|ben|ji|bhen)/g, '').trim())
    );
  }

  // ── TODAY'S ORDERS ──────────────────────────────────────
  if (type === 'today_orders') {
    const orders = (DB.orders || []).filter(o => o.deliveryDate === todayStr && o.status === 'Pending');
    if (!orders.length) return "✅ No pending orders for today.";
    let totalBoxes = 0;
    let msg = `📦 *Today's Pending Orders (${orders.length})*\n`;
    orders.forEach(o => {
      msg += `\n• #${o.id} *${o.customer}* — ${o.boxes} boxes @ ₹${o.rate}`;
      msg += `\n  📍 ${o.address || 'No address'} | 🕐 ${o.time || 'Anytime'}`;
      totalBoxes += Number(o.boxes) || 0;
    });
    msg += `\n\n📊 Total: *${orders.length} orders | ${totalBoxes} boxes*`;
    return msg;
  }

  // ── TOMORROW'S ORDERS ───────────────────────────────────
  if (type === 'tomorrow_orders') {
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    const tomStr = tom.toISOString().split('T')[0];
    const orders = (DB.orders || []).filter(o => o.deliveryDate === tomStr && o.status === 'Pending');
    if (!orders.length) return "✅ No pending orders for tomorrow.";
    let msg = `📦 *Tomorrow's Pending Orders (${orders.length})*\n`;
    orders.forEach(o => { msg += `\n• #${o.id} *${o.customer}* — ${o.boxes} boxes | 📍 ${o.address || 'No address'}`; });
    return msg;
  }

  // ── ALL PENDING ─────────────────────────────────────────
  if (type === 'pending') {
    const orders = (DB.orders || []).filter(o => o.status === 'Pending');
    if (!orders.length) return "✅ No pending orders right now.";
    let totalBoxes = orders.reduce((s, o) => s + (Number(o.boxes) || 0), 0);
    let msg = `🕐 *All Pending Orders (${orders.length})*\n`;
    orders.forEach(o => { msg += `\n• #${o.id} *${o.customer}* — ${o.boxes} boxes | ${fmtDate(o.deliveryDate)}`; });
    msg += `\n\n📊 Total boxes pending: *${totalBoxes}*`;
    return msg;
  }

  // ── ALL ORDERS SUMMARY ──────────────────────────────────
  if (type === 'all_orders_summary') {
    const total     = (DB.orders || []).length;
    const pending   = (DB.orders || []).filter(o => o.status === 'Pending').length;
    const delivered = total - pending;
    const totalBoxes = (DB.orders || []).filter(o => o.status !== 'Pending').reduce((s, o) => s + (Number(o.boxes) || 0), 0);
    return `📊 *Orders Summary*\n\nTotal Orders: ${total}\nDelivered: ${delivered}\nPending: ${pending}\nTotal Boxes Delivered: ${totalBoxes}`;
  }

  // ── ORDER DETAIL ─────────────────────────────────────────
  if (type === 'order_detail') {
    const o = (DB.orders || []).find(x => String(x.id) === String(id));
    if (!o) return `❌ Order #${id} not found.`;
    return `📋 *Order #${o.id}*\n\nCustomer: ${o.customer}\nStatus: ${o.status}\nDelivery: ${fmtDate(o.deliveryDate)} @ ${o.time || 'Anytime'}\nBoxes: ${o.boxes} @ ₹${o.rate} = ₹${o.amount}\nAddress: ${o.address || 'Not set'}\nStaff: ${o.staff || 'Nilesh'}`;
  }

  // ── DELIVERED TODAY ─────────────────────────────────────
  if (type === 'delivered_today') {
    const orders = (DB.orders || []).filter(o => o.deliveryDate === todayStr && o.status === 'Delivered');
    if (!orders.length) return "📭 No deliveries marked as done today yet.";
    let boxes = orders.reduce((s, o) => s + (Number(o.boxes) || 0), 0);
    let rev   = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    let msg = `✅ *Delivered Today (${orders.length} orders | ${boxes} boxes)*\n`;
    orders.forEach(o => { msg += `\n• *${o.customer}* — ${o.boxes} boxes ₹${o.amount}`; });
    msg += `\n\n💰 Revenue Today: *₹${rev}*`;
    return msg;
  }

  // ── WEEK ORDERS ─────────────────────────────────────────
  if (type === 'week_orders') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const wStr = weekAgo.toISOString().split('T')[0];
    const orders = (DB.orders || []).filter(o => o.deliveryDate >= wStr && o.status !== 'Pending');
    let boxes = orders.reduce((s, o) => s + (Number(o.boxes) || 0), 0);
    let rev   = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    return `📅 *This Week's Delivered Orders*\n\nOrders: ${orders.length}\nBoxes: ${boxes}\nRevenue: ₹${rev}`;
  }

  // ── SCHEDULE (Today + Tomorrow for Nilesh) ──────────────
  if (type === 'schedule') {
    const tom = new Date(); tom.setDate(tom.getDate() + 1);
    const tomStr = tom.toISOString().split('T')[0];
    const orders = (DB.orders || []).filter(o => (o.deliveryDate === todayStr || o.deliveryDate === tomStr) && o.status === 'Pending');
    if (!orders.length) return "✅ No pending deliveries for today or tomorrow.";
    let msg = `🚚 *Delivery Schedule*\n`;
    orders.forEach((o, i) => {
      const tag = o.deliveryDate === todayStr ? 'TODAY' : 'TOMORROW';
      msg += `\n${i+1}. *${o.customer}* (${tag})\n   📦 ${o.boxes} boxes | 🕐 ${o.time || 'Anytime'}\n   📍 ${o.address || 'No address'}`;
    });
    return msg;
  }

  // ── DRAFT ORDER (Action) ─────────────────────────────────
  if (type === 'draft_order') {
    const { name, qty } = params;
    const c = findCust(name);
    if (!c) return `⚠️ Customer "*${name}*" not found. Please check the name and try again.`;
    go('orders');
    const sel = document.getElementById('ord-cust');
    if (sel) {
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value == c.id) { sel.selectedIndex = i; fillCust(); break; }
      }
    }
    if (document.getElementById('ord-qty')) document.getElementById('ord-qty').value = qty;
    calc();
    return `✅ Order drafted for *${c.name}* — ${qty} boxes @ ₹${c.rate}\n💡 Review and hit CONFIRM ORDER.`;
  }

  // ── MARK DELIVERED (Action) ──────────────────────────────
  if (type === 'mark_delivered') {
    const o = (DB.orders || []).find(x => String(x.id) === String(id));
    if (!o) return `❌ Order #${id} not found.`;
    if (o.status === 'Delivered') return `ℹ️ Order #${id} is already marked Delivered.`;
    // Optimistic local update
    o.status = 'Delivered';
    render();
    google.script.run.withSuccessHandler(() => {
      loadData();
      addBubble(`✅ Order #${id} (${o.customer}) marked as Delivered!`, 'ai', false);
    }).updateOrderStatus(id, 'Delivered', o.boxes, o.deliveryDate, o.time, o.address);
    return `⏳ Marking Order #${id} (${o.customer}) as Delivered...`;
  }

  // ── TODAY'S PAYMENTS ────────────────────────────────────
  if (type === 'today_payments') {
    const pays = (DB.payments || []).filter(p => p.date === todayStr);
    if (!pays.length) return "💳 No payments received today yet.";
    let total = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    let msg = `💚 *Today's Collections (${pays.length})*\n`;
    pays.forEach(p => { msg += `\n• *${p.customer}* — ₹${p.amount} (${p.mode || 'Cash'})`; });
    msg += `\n\n💰 Total Collected: *₹${total}*`;
    return msg;
  }

  // ── WEEK PAYMENTS ───────────────────────────────────────
  if (type === 'week_payments') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const wStr = weekAgo.toISOString().split('T')[0];
    const pays = (DB.payments || []).filter(p => p.date >= wStr);
    let total = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return `📅 *This Week's Collections*\n\nPayments: ${pays.length}\nTotal: ₹${total}`;
  }

  // ── MONTH PAYMENTS ──────────────────────────────────────
  if (type === 'month_payments') {
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const pays = (DB.payments || []).filter(p => p.date >= firstDay);
    let total = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return `🗓️ *This Month's Collections*\n\nPayments: ${pays.length}\nTotal: ₹${total}`;
  }

  // ── RECENT PAYMENTS ─────────────────────────────────────
  if (type === 'recent_payments') {
    const pays = (DB.payments || []).slice().reverse().slice(0, 5);
    if (!pays.length) return "💳 No payment records found.";
    let msg = `💳 *Last 5 Payments*\n`;
    pays.forEach(p => { msg += `\n• *${p.customer}* — ₹${p.amount} on ${fmtDate(p.date)}`; });
    return msg;
  }

  // ── RECORD PAYMENT (Action) ──────────────────────────────
  if (type === 'record_payment') {
    const { name, amt } = params;
    const c = findCust(name);
    if (!c) return `⚠️ Customer "*${name}*" not found. Check name and try again.`;
    const bal = custBal(c.id);
    // Optimistic local update
    DB.payments.push({ date: todayStr, customer: c.name, amount: amt, mode: 'Cash', clientId: c.id, mobile: c.mobile });
    renderRecentPayments();
    google.script.run.withSuccessHandler(() => {
      loadData();
      addBubble(`✅ Payment of ₹${amt} recorded for *${c.name}*!\nNew balance: ₹${bal - amt}`, 'ai', false);
    }).savePayment({ clientId: c.id, customer: c.name, mobile: c.mobile, amount: amt });
    return `⏳ Recording ₹${amt} payment for *${c.name}*...\nPrevious balance: ₹${bal}`;
  }

  // ── ALL DUES ────────────────────────────────────────────
  if (type === 'dues') {
    let duesList = [];
    (DB.customers || []).forEach(c => {
      if (String(c.active) === 'false') return;
      const bal = custBal(c.id);
      if (bal > 0) duesList.push({ name: c.name, bal });
    });
    if (!duesList.length) return "✅ No outstanding dues! All accounts clear.";
    duesList.sort((a, b) => b.bal - a.bal);
    let total = duesList.reduce((s, x) => s + x.bal, 0);
    let msg = `🔴 *Outstanding Dues (${duesList.length} customers)*\n`;
    duesList.slice(0, 15).forEach(d => { msg += `\n• ${d.name} — ₹${d.bal}`; });
    if (duesList.length > 15) msg += `\n...and ${duesList.length - 15} more`;
    msg += `\n\n💰 *Total Outstanding: ₹${total}*`;
    return msg;
  }

  // ── SPECIFIC CUSTOMER BALANCE ────────────────────────────
  if (type === 'customer_balance') {
    const c = findCust(params.name);
    if (!c) return `⚠️ Customer "*${params.name}*" not found.`;
    const bal = custBal(c.id);
    const orders = (DB.orders || []).filter(o => String(o.clientId) === String(c.id) && o.status !== 'Pending');
    const pays   = (DB.payments || []).filter(p => String(p.clientId) === String(c.id));
    const lastOrder = orders.length ? orders[orders.length - 1] : null;
    let msg = `👤 *${c.name}*\n\nBalance: *₹${bal}* ${bal > 0 ? '🔴 (Due)' : '🟢 (Clear)'}\nMobile: ${c.mobile}\nRate: ₹${c.rate}/box\nTotal Orders: ${orders.length}\nTotal Payments: ${pays.length}`;
    if (lastOrder) msg += `\nLast Order: ${fmtDate(lastOrder.deliveryDate)} — ${lastOrder.boxes} boxes`;
    return msg;
  }

  // ── STOCK ────────────────────────────────────────────────
if (type === 'stock') {
    let net = 0, todayProd = 0, todayDel = 0;
    const skuMap = {};
    const skuNames = { '200ml':'💧 200ml', '500ml':'💧 500ml', '1L':'💧 1L', 'cd':'🥤 Cold Drink' };
    (DB.stock || []).forEach(s => {
      const sku = s.sku || '200ml';
      const prod = Number(s.produced) || 0;
      const del  = Number(s.delivered) || 0;
      net += prod - del;
      if (!skuMap[sku]) skuMap[sku] = { net: 0, todayProd: 0, todayDel: 0 };
      skuMap[sku].net += prod - del;
      if (s.date === todayStr) {
        todayProd += prod; todayDel += del;
        skuMap[sku].todayProd += prod;
        skuMap[sku].todayDel  += del;
      }
    });
    const level = net < 500 ? '🔴 LOW — Produce More!' : net < 1500 ? '🟡 MODERATE' : '🟢 HEALTHY';
    let skuLines = Object.entries(skuMap).map(([k, v]) =>
      `  ${skuNames[k] || k}: *${v.net}* (Today +${v.todayProd} / -${v.todayDel})`
    ).join('\n');
    return `📦 *Stock Report*\n\nNet Stock: *${net} units* ${level}\n\n*SKU Breakdown:*\n${skuLines}\n\nProduced Today: ${todayProd}\nDelivered Today: ${todayDel}`;
  }

  // ── ADD STOCK (Action) ───────────────────────────────────
  if (type === 'add_stock') {
    const qty = Number(params.qty);
    if (!qty || qty <= 0) return "⚠️ Invalid quantity.";
    google.script.run.withSuccessHandler(() => {
      loadData();
      addBubble(`✅ ${qty} units added to stock!`, 'ai', false);
    }).saveProduction({ qty });
    return `⏳ Adding ${qty} units to stock...`;
  }

  // ── CUSTOMERS ───────────────────────────────────────────
  if (type === 'customers') {
    const active   = (DB.customers || []).filter(c => String(c.active) !== 'false').length;
    const inactive = (DB.customers || []).length - active;
    const withDues = (DB.customers || []).filter(c => custBal(c.id) > 0).length;
    return `👥 *Customer Summary*\n\nActive: ${active}\nInactive: ${inactive}\nWith Outstanding Dues: ${withDues}\nTotal: ${(DB.customers||[]).length}`;
  }

  // ── INACTIVE CUSTOMERS ───────────────────────────────────
  if (type === 'inactive_customers') {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const inactive = (DB.customers || []).filter(c => {
      if (String(c.active) === 'false') return true;
      const lastOrd = (DB.orders || []).filter(o => String(o.clientId) === String(c.id) && o.status !== 'Pending').map(o => o.deliveryDate).sort().pop();
      return lastOrd && lastOrd < cutoffStr;
    });
    if (!inactive.length) return "✅ All customers are active!";
    let msg = `😴 *Inactive / No Order in 30+ Days (${inactive.length})*\n`;
    inactive.slice(0, 10).forEach(c => { msg += `\n• ${c.name} — ${c.mobile}`; });
    return msg;
  }

  // ── TOP CUSTOMERS ────────────────────────────────────────
  if (type === 'top_customers') {
    let ranked = (DB.customers || []).map(c => {
      const total = (DB.orders || []).filter(o => String(o.clientId) === String(c.id) && o.status !== 'Pending').reduce((s, o) => s + (Number(o.boxes) || 0), 0);
      return { name: c.name, boxes: total };
    }).filter(x => x.boxes > 0).sort((a, b) => b.boxes - a.boxes).slice(0, 8);
    if (!ranked.length) return "No order data yet.";
    let msg = `🏆 *Top Customers (by boxes delivered)*\n`;
    ranked.forEach((c, i) => { msg += `\n${i + 1}. *${c.name}* — ${c.boxes} boxes`; });
    return msg;
  }

  // ── LEADS SUMMARY ───────────────────────────────────────
  if (type === 'leads_summary') {
    const leads = DB.leads || [];
    const byStatus = {};
    leads.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
    let msg = `🎯 *Leads Summary (${leads.length} total)*\n`;
    Object.entries(byStatus).forEach(([s, n]) => { msg += `\n• ${s}: ${n}`; });
    return msg;
  }

  // ── DAILY SUMMARY ───────────────────────────────────────
// ── DAILY SUMMARY ───────────────────────────────────────
  if (type === 'daily_summary') {
    const todayOrders   = (DB.orders || []).filter(o => o.deliveryDate === todayStr && o.status === 'Pending');
    const deliveredToday = (DB.orders || []).filter(o => o.deliveryDate === todayStr && o.status === 'Delivered');
    const todayPays     = (DB.payments || []).filter(p => p.date === todayStr);
    const todayRev      = deliveredToday.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const todayCol      = todayPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    
    // ✅ FIX: Calculate "Delivered Today" from Stock sheet (boxes, not order count)
    let deliveredTodayBoxes = 0;
    (DB.stock || []).forEach(s => {
      if (s.date === todayStr) {
        deliveredTodayBoxes += Number(s.delivered) || 0;
      }
    });
    
    let netStock = 0;
    (DB.stock || []).forEach(s => { netStock += (Number(s.produced) || 0) - (Number(s.delivered) || 0); });
    const totalDues = (DB.customers || []).reduce((s, c) => { const b = custBal(c.id); return b > 0 ? s + b : s; }, 0);
    return `📊 *Daily Summary — ${fmtDate(todayStr)}*\n\n📦 Pending Deliveries: ${todayOrders.length}\n✅ Delivered Today: ${deliveredTodayBoxes}\n💰 Revenue Today: ₹${todayRev}\n💚 Collected Today: ₹${todayCol}\n📦 Net Stock: ${netStock}\n🔴 Total Market Dues: ₹${totalDues}`;
  }

  // ── REVENUE ─────────────────────────────────────────────
  if (type === 'revenue') {
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const monthRev  = (DB.orders || []).filter(o => o.deliveryDate >= firstDay && o.status !== 'Pending').reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const monthCol  = (DB.payments || []).filter(p => p.date >= firstDay).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const todayRev  = (DB.orders || []).filter(o => o.deliveryDate === todayStr && o.status !== 'Pending').reduce((s, o) => s + (Number(o.amount) || 0), 0);
    return `💰 *Revenue Report*\n\nToday's Revenue: ₹${todayRev}\nThis Month Revenue: ₹${monthRev}\nThis Month Collected: ₹${monthCol}\nUnpaid This Month: ₹${monthRev - monthCol}`;
  }

  // ── HELP ─────────────────────────────────────────────────
  if (type === 'help') {
    return `🤖 *Anjani AI — What I Can Do*\n\n📦 *Orders*\n• "today's orders"\n• "pending orders"\n• "order #1045"\n• "order for Ramesh 5 boxes"\n• "deliver 1045"\n• "tomorrow's orders"\n\n💳 *Payments*\n• "today's collection"\n• "record payment 500 for Ramesh"\n• "Ramesh ne 500 diya"\n• "this month's payments"\n\n👤 *Customers*\n• "Ramesh ka balance"\n• "top customers"\n• "inactive customers"\n• "total dues"\n\n📦 *Stock*\n• "stock"\n• "add stock 100"\n\n📊 *Reports*\n• "daily summary"\n• "revenue"\n• "leads"\n\n🔗 *Navigation*\n• "open orders / payments / stock / leads"`;
  }

  return null;
}
export function handleSearch(type, q, d) {
  if (type === 'ORDER') {
    const o = (DB.orders||[]).find(x => String(x.id) === String(q));
    if (!o) { addBubble(`❌ Order #${q} not found.`, 'ai', false); return; }
    addBubble(`📋 *Order #${o.id}*\n\nCustomer: ${o.customer}\nStatus: ${o.status}\nDelivery: ${o.deliveryDate} @ ${o.time||'Anytime'}\nBoxes: ${o.boxes} @ ₹${o.rate} = ₹${o.amount}\nAddress: ${o.address||'Not set'}`, 'ai', false);
  }
  else if (type === 'SCHEDULE') {
    const date = d || new Date().toISOString().split('T')[0];
    const orders = (DB.orders||[]).filter(o => o.deliveryDate === date && o.status === 'Pending');
    if (!orders.length) { addBubble(`✅ No pending orders for ${date}.`, 'ai', false); return; }
    let msg = `🚚 *Schedule for ${date} (${orders.length} orders)*\n`;
    orders.forEach(o => { msg += `\n• #${o.id} ${o.customer} — ${o.boxes} boxes | ${o.time||'Anytime'}\n  📍 ${o.address||'No address'}`; });
    addBubble(msg, 'ai', false);
  }
  else if (type === 'CLIENT') {
    const match = (DB.customers||[]).find(c => c.name.toLowerCase().includes(q.toLowerCase()));
    if (!match) { addBubble(`❌ Customer "${q}" not found.`, 'ai', false); return; }
    const bal = Number(match.outstanding) || 0;
    const orders = (DB.orders||[]).filter(o => String(o.clientId)===String(match.id));
    addBubble(`👤 *${match.name}*\n\nMobile: ${match.mobile}\nBalance: ₹${bal}\nRate: ₹${match.rate}/box\nOrders (30d): ${orders.length}`, 'ai', false);
  }
  else {
    // Fallback — search across orders and customers
    const results = (DB.orders||[]).filter(o => o.customer.toLowerCase().includes(q.toLowerCase()) || String(o.id)===String(q));
    if (!results.length) { addBubble(`🔍 No results for "${q}".`, 'ai', false); return; }
    let msg = `🔍 *Search: "${q}" (${results.length} results)*\n`;
    results.slice(0,5).forEach(o => { msg += `\n• #${o.id} ${o.customer} — ${o.status} | ${o.deliveryDate}`; });
    addBubble(msg, 'ai', false);
  }
}
export function sendChat() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const txt = input.value.trim();
if (!txt) return;
  addBubble(txt, 'user');

  // 🚀 Try local first — zero Gemini quota
  const localReply = localQueryInterceptor(txt);
  if (localReply) {
    input.value = ''; input.style.height = '48px';
    addBubble(localReply, 'ai');
    return; // ← stops here, Gemini never called
  }
  input.value = ''; input.style.height = '48px';
  const loadId = 'loader-'+Date.now();
  document.getElementById('chat-messages').insertAdjacentHTML('beforeend', `<div id="${loadId}" class="flex justify-start"><div class="text-xs text-slate-400 ml-4 animate-pulse">Thinking...</div></div>`);
  document.getElementById('chat-messages').scrollTop = 99999;
  const h = JSON.parse(localStorage.getItem(CHAT_KEY)||"[]");
  const historyText = h.slice(-2).map(m => (m.type==='ai'?'AI: ':'User: ')+m.text).join('\n');
  const smartPrompt = "Recent Conversation History:\n"+historyText+"\n\nUser's Current Command: "+txt;
  google.script.run.withSuccessHandler(function(data) {
    const loader = document.getElementById(loadId);
    if (loader) loader.remove();
    if (!data || data.error) { addBubble("⚠️ "+(data?data.error:"AI returned no data"), 'ai'); return; }
    const intent = (data.intent||"ANSWER").toUpperCase();
    if (intent === 'ANSWER') addBubble(data.reply, 'ai');
    else if (intent === 'RUN_SCRIPT') { addBubble("⚠️ Script execution is disabled for security reasons.", 'ai', false); }
    else if (intent === 'ADD_RULE') {
      addBubble("🧠 Writing new rule: **"+data.topic+"**...", 'ai');
      google.script.run.withSuccessHandler(res => addBubble(res==="SUCCESS"?"✅ Learned! Say 'refresh' to reload my brain.":"⚠️ Failed: "+res, 'ai', false)).saveNewRuleToBrain(data.topic, data.instruction, data.actionId);
    }
    else if (intent === 'ORDER' || intent === 'DRAFT_ORDER') {
      addBubble("✅ Drafted Order for "+(data.customer||'?'), 'ai');
      go('orders');
      if (data.customer) { const match = findBestCustomerMatch(data.customer); if(match) { const sel = document.getElementById('ord-cust'); if(sel) { sel.selectedIndex = match.index; fillCust(); } } }
      if (data.boxes) document.getElementById('ord-qty').value = data.boxes;
      if (data.address) document.getElementById('ord-addr').value = data.address;
      calc();
    }
    else if (intent === 'PAYMENT' || intent === 'DRAFT_PAYMENT') {
      const match = findBestCustomerMatch(data.customer);
      if (match) { go('payments'); const paySel = document.getElementById('pay-customer'); const payAmt = document.getElementById('pay-amount'); if(paySel) paySel.value = match.id; if(payAmt) payAmt.value = data.amount||0; if(typeof submitPayment==='function') submitPayment({preventDefault:function(){}}); }
      else addBubble(`⚠️ Payment for '${data.customer}' detected, but customer not found.`, 'ai');
    }
    else if (intent === 'CLIENT') { openCustForm(); document.getElementById('new-name').value = data.customer||''; document.getElementById('new-mob').value = data.mobile||''; document.getElementById('new-rate').value = data.amount||''; document.getElementById('new-map').value = data.address||''; }
  }).parseTextWithGemini(smartPrompt);
}

export function runAiText() { const text = document.getElementById('ai-text').value; if(!text){alert("Please enter text.");return;} setAiLoading(true); google.script.run.withSuccessHandler(processAiResponse).parseTextWithGemini(text); }
export function runAiImage(input) { if(!input.files||!input.files[0])return; setAiLoading(true); const reader = new FileReader(); reader.onload = e => { google.script.run.withSuccessHandler(processAiResponse).parseImageWithGemini(e.target.result.split(',')[1]); }; reader.readAsDataURL(input.files[0]); }
export function setAiLoading(isLoading) { const s = document.getElementById('ai-status'); if(s) isLoading?s.classList.remove('hidden'):s.classList.add('hidden'); }
// ── TASK TYPE DROPDOWN HANDLER ─────────────────────────────
export function applyTaskType() {
  const sel = document.getElementById('ai-task-type');
  const input = document.getElementById('chat-input');
  const val = sel.value;
  if (!val) return;

  const prompts = {
  // Reports
  'summarize':         "daily summary",
  'dues':              "show all dues",
  'stock':             "check stock",
  'pending':           "pending orders",
  'revenue':           "revenue report",
  // Explain
  'explain_order':     "explain order #",
  'explain_customer':  "explain customer: ",
  'top_customers':     "top customers",
  // Actions
  'place_order':       "place order for [Customer Name] [Qty] boxes",
  'record_payment':    "record payment Rs[Amount] for [Customer Name]",
  'add_stock':         "[Qty] stock add",
  'add_client':        "__OPEN_CLIENT_FORM__",
};

  const text = prompts[val] || "";
  input.value = text;
  input.style.height = '';
  input.style.height = input.scrollHeight + 'px';
  input.focus();

  // Add New Client opens the form directly — no chat needed
if (val === 'add_client') {
  sel.value = "";
  openCustForm();
  return;
}

const autoSend = ['summarize','dues','stock','pending','revenue','top_customers'];
if (autoSend.includes(val)) {
  setTimeout(() => { sendChat(); }, 100);
}

  // Reset dropdown
  sel.value = "";
}

export function quickFill(type) {
  const input = document.getElementById('chat-input');
  if (!input) return;

  if (type === 'payment') {
    input.value = 'p: ';
    input.style.height = ''; 
    input.style.height = input.scrollHeight + 'px';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  else if (type === 'order') {
    input.value = 'o: ';
    input.style.height = ''; 
    input.style.height = input.scrollHeight + 'px';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  else if (type === 'client') {
    input.value = 'c: ';
    input.style.height = ''; 
    input.style.height = input.scrollHeight + 'px';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}
export function processAiResponse(data) {
  setAiLoading(false);
  if (!data) { alert("⚠️ Connection Failed. Try again."); return; }
  if (data.error) { alert("AI Error: "+data.error); return; }
  const intent = (data.intent||"ORDER").toUpperCase();
  if (intent === 'CLIENT') { openCustForm(); document.getElementById('new-name').value = data.customer||''; document.getElementById('new-mob').value = data.mobile||''; document.getElementById('new-rate').value = data.amount||''; document.getElementById('new-map').value = data.address||''; return; }
  if (intent === 'PAYMENT') { const match = findBestCustomerMatch(data.customer); if(match){const paySel=document.getElementById('pay-customer');const payAmt=document.getElementById('pay-amount');if(paySel)paySel.value=match.id;if(payAmt)payAmt.value=data.amount||0;go('payments');if(typeof submitPayment==='function')submitPayment({preventDefault:function(){}});}else{alert(`⚠️ Payment for '${data.customer}' detected, but customer not found.`);} return; }
  if (intent === 'ORDER') {
    if (data.boxes) document.getElementById('ord-qty').value = data.boxes;
    if (data.address) document.getElementById('ord-addr').value = data.address;
    if (data.date) document.getElementById('ord-date').value = data.date;
    if (data.time) document.getElementById('ord-time').value = data.time;
    if (typeof calc==='function') calc();
    document.getElementById('ai-text').value = '';
    const match = findBestCustomerMatch(data.customer);
    if (match) { const sel=document.getElementById('ord-cust'); if(sel){sel.selectedIndex=match.index;fillCust();} showToast(`✅ Order Drafted for ${match.text.split('-')[0]}`); }
    else { showToast(`⚠️ '${data.customer||'Client'}' not found. Please select manually.`, true); const sel=document.getElementById('ord-cust'); if(sel){sel.focus();sel.classList.add('ring-4','ring-red-400','bg-red-50');setTimeout(()=>sel.classList.remove('ring-4','ring-red-400','bg-red-50'),2000);} }
  }
}

export function findBestCustomerMatch(aiName) {
  if (!aiName) return null;
  const cleanAiName = String(aiName).toLowerCase().replace(/(bhai|ben|ji|kumar|joshi|patel)/g,'').trim();
  const sel = document.getElementById('ord-cust');
  if (!sel) return null;
  let matches = [];
  for (let i=0; i<sel.options.length; i++) {
    const optId = sel.options[i].value;
    if (optId===''||optId==='NEW') continue;
    const cleanOptName = sel.options[i].text.toLowerCase().replace(/(bhai|ben|ji|kumar|joshi|patel)/g,'').trim();
    if (cleanOptName.includes(cleanAiName) || cleanAiName.includes(cleanOptName)) matches.push({index:i, text:sel.options[i].text, id:optId});
  }
  if (matches.length > 0) { matches.sort((a,b)=>(DB.orders||[]).filter(o=>o.clientId==b.id).length-(DB.orders||[]).filter(o=>o.clientId==a.id).length); return matches[0]; }
  return null;
}

export function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { alert("⚠️ Voice not supported in this browser. Use Chrome."); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = document.getElementById('voice-lang').value;
  recognition.continuous = false; recognition.interimResults = false;
  const btn = document.getElementById('btn-mic');
  const input = document.getElementById('ai-text');
  if (btn) { btn.classList.remove('bg-indigo-50','text-indigo-600'); btn.classList.add('animate-pulse','bg-red-500','text-white','shadow-lg'); }
  input.placeholder = "🔴 Listening... Speak now!";
  recognition.onresult = e => { input.value = e.results[0][0].transcript; setTimeout(runAiText, 800); };
  recognition.onend = () => { if(btn){btn.classList.add('bg-indigo-50','text-indigo-600');btn.classList.remove('animate-pulse','bg-red-500','text-white','shadow-lg');} input.placeholder = "Tap Mic or type..."; };
  recognition.onerror = e => { if(btn){btn.classList.add('bg-indigo-50','text-indigo-600');btn.classList.remove('animate-pulse','bg-red-500','text-white','shadow-lg');}  alert("🎤 Mic Error: "+e.error); };
  recognition.start();
}

export function initMap() {
  try {
    const input = document.getElementById('location-picker');
    if (!input) return;
    const options = {bounds:{north:22.55,south:22.10,east:73.60,west:73.00}, strictBounds:true, componentRestrictions:{country:"in"}, fields:["formatted_address","url","geometry"]};
    const autocomplete = new google.maps.places.Autocomplete(input, options);
    autocomplete.addListener("place_changed", () => { const place=autocomplete.getPlace(); const hiddenInput=document.getElementById("maps-link-hidden"); if(place.url) { hiddenInput.value=place.url; input.style.borderColor="green"; } });
  } catch(e) { console.log("Main Map Error: "+e.message); }
}
