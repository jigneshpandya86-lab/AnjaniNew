// ============================================================
// PAYMENTS
// ============================================================
import { DB, STAFF_NUM } from './state.js';
import { esc, showToast } from './utils.js';
import { enqueueAction, showOfflineToast } from './sync.js';

export function renderRecentPayments() {
  const list = document.getElementById('list-payments');
  if (!list) return;
const recent = (DB.payments||[]).slice().sort((a, b) => {
    // Strip out any accidental quotes from old Google Sheets data and compare
    const dateA = (a.date || '').replace(/^'/, '');
    const dateB = (b.date || '').replace(/^'/, '');
    return dateB.localeCompare(dateA); // Sorts Newest to Oldest
  }).slice(0, 10);
  if (!recent.length) { list.innerHTML = '<div class="p-4 text-center text-slate-300 text-xs">No recent transactions</div>'; return; }
  let quotes = ["Your trust is our real earning.","Quality is not an act, it is a habit.","Happiness flows like water.","Small steps lead to big results.","Gratitude turns what we have into enough.","Success is the sum of small efforts.","Good water, good life.","Purity you can taste.","Thank you for being our strength.","Every drop counts, just like you.","Health is the greatest wealth.","Kindness is free, sprinkle it everywhere.","Believe you can and you're halfway there.","Excellence is our standard.","Serve with a smile."];
  quotes.sort(() => Math.random() - 0.5);
  list.innerHTML = recent.map((p, index) => {
// FIXED: Parse date parts directly without creating a Date object
  let dateParts = p.date.replace(/^'/, '').split('-');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let shortDate = dateParts[2] + '-' + (monthNames[parseInt(dateParts[1]) - 1] || '?');
    let bal = 0;
    let c = DB.customers.find(x => String(x.id)===String(p.clientId));
    let mob = p.mobile || (c ? c.mobile : '');
    if (c) {
      (DB.orders||[]).forEach(o => { if(String(o.clientId)===String(c.id) && o.status!=='Pending') bal += +o.amount; });
      (DB.payments||[]).forEach(py => { if(String(py.clientId)===String(c.id)) bal -= +py.amount; });
    }
    const quote = quotes[index % quotes.length];
    const msg = `🧾 *PAYMENT RECEIVED*\n\nHello ${p.customer},\nReceived: ₹${p.amount}\nDate: ${shortDate}\n\n💰 *Outstanding Balance: ₹${bal}*\n\n✨ _"${quote}"_\n\n- Anjani Water`;
    let waBtn = mob && mob.length>5 ? `<a href="https://wa.me/91${mob}?text=${encodeURIComponent(msg)}" target="_blank" class="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center border border-green-100 shadow-sm active:scale-95 transition ml-3"><i data-feather="message-circle" class="w-4 h-4"></i></a>` : '';
    return `<div class="p-3 flex justify-between items-center text-sm hover:bg-slate-50 transition border-b border-slate-50"><div><div class="font-bold text-slate-700">${p.customer}</div><div class="text-[10px] text-slate-400 font-mono">${shortDate} • ${p.mode||'Cash'}</div></div><div class="flex items-center"><div class="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 text-xs">+₹${p.amount}</div>${waBtn}</div></div>`;
  }).join('');
  try { feather.replace(); } catch(e){ console.warn('[feather]', e.message); }
}

export function quickPay(custId, custName, bal) {
  if (typeof window.go === 'function') window.go('payments');
  const sel = document.getElementById('pay-customer');
  const amt = document.getElementById('pay-amount');
  const dt  = document.getElementById('pay-date');
  if (sel) sel.value = custId;
  if (amt) amt.value = bal > 0 ? bal : '';
  if (dt)  dt.value  = new Date().toISOString().split('T')[0];
  if (sel) sel.dispatchEvent(new Event('change'));
}

export function startQuickPay(id, amount) {
  if (typeof window.go === 'function') window.go('payments');
  const sel = document.getElementById('pay-customer');
  const inp = document.getElementById('pay-amount');
  if (sel && id) { sel.value = id; sel.classList.add('ring-2','ring-purple-500'); setTimeout(() => sel.classList.remove('ring-2','ring-purple-500'), 1000); }
  if (inp && amount) inp.value = amount;
}

export function submitPayment(e) {
  e.preventDefault();
  const custId = document.getElementById('pay-customer').value;
  const amt    = document.getElementById('pay-amount').value;
  const date   = document.getElementById('pay-date').value;

  if (!custId || !amt) { alert("Please select customer and amount"); return; }

  const c = DB.customers.find(x => x.id == custId);
  if (!c) { alert("Customer not found"); return; }

  document.getElementById('conf-pay-name').innerText = c.name;
  document.getElementById('conf-pay-amt').innerText  = "₹" + amt;

  const offlineNote = document.getElementById('conf-offline-note');
  if (offlineNote) offlineNote.style.display = navigator.onLine ? 'none' : 'block';

  document.getElementById('modal-pay').classList.remove('hidden');
}

export function executePayment() {
  const btn    = document.querySelector('#modal-pay button:last-child');
  const orgTxt = btn ? btn.innerText : 'YES, SAVE';

  const custId = document.getElementById('pay-customer').value;
  const amt    = document.getElementById('pay-amount').value;
  const date   = document.getElementById('pay-date').value || new Date().toISOString().split('T')[0];

  if (!custId || !amt) {
    document.getElementById('modal-pay').classList.add('hidden');
    alert("Missing customer or amount — please try again.");
    return;
  }

  const c = DB.customers.find(x => x.id == custId);
  if (!c) {
    document.getElementById('modal-pay').classList.add('hidden');
    alert("Customer not found.");
    return;
  }

  const payData = {
    clientId: c.id,
    customer: c.name,
    mobile:   c.mobile,
    amount:   amt,
    date:     date,
    mode:     'Cash'
  };

  // ── OFFLINE path ─────────────────────────────────────────
  if (!navigator.onLine) {
    DB.payments.push({ ...payData, _offline: true });
    document.getElementById('pay-amount').value = '';
    document.getElementById('modal-pay').classList.add('hidden');
    enqueueAction('savePayment', payData);
    renderRecentPayments();
    showOfflineToast('💳 Payment ₹' + amt + ' saved offline for ' + c.name);
    return;
  }

  // ── ONLINE path ──────────────────────────────────────────
  if (btn) { btn.innerText = "SAVING..."; btn.disabled = true; }

  google.script.run
    .withSuccessHandler(() => {
      if (typeof window._loadData === 'function') window._loadData();
      document.getElementById('pay-amount').value = '';
      document.getElementById('modal-pay').classList.add('hidden');
      if (btn) { btn.innerText = orgTxt; btn.disabled = false; }
      showToast('✅ Payment of ₹' + amt + ' recorded for ' + c.name);
    })
    .withFailureHandler((err) => {
      if (btn) { btn.innerText = orgTxt; btn.disabled = false; }
      document.getElementById('modal-pay').classList.add('hidden');
      // Fallback to offline queue
      DB.payments.push({ ...payData, _offline: true });
      renderRecentPayments();
      enqueueAction('savePayment', payData);
      showOfflineToast('💳 Payment saved offline — will sync on reconnect');
    })
    .savePayment(payData);
}

export function shareStatement(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  const fromDate = document.getElementById('stmt-from').value;
  const toDate = document.getElementById('stmt-to').value;
  if (!fromDate || !toDate) { alert("Please select dates"); return; }
const isMatch = r => String(r.clientId) === String(c.id);

// ✅ FIX: Use server-computed outstanding as base, then subtract
// transactions that fall WITHIN the statement period to get true opening
const serverOutstanding = Number(c.outstanding) || 0;
let periodDebits = 0, periodCredits = 0;
(DB.orders||[]).forEach(o => { if(isMatch(o) && o.status!=='Pending' && o.deliveryDate>=fromDate && o.deliveryDate<=toDate) periodDebits += +o.amount; });
(DB.payments||[]).forEach(p => { if(isMatch(p) && p.date>=fromDate && p.date<=toDate) periodCredits += +p.amount; });
// Opening = what they owed BEFORE this period
let openingBal = serverOutstanding - periodDebits + periodCredits;
  let txns = [];
  (DB.orders||[]).forEach(o => { if(isMatch(o) && o.status!=='Pending' && o.deliveryDate>=fromDate && o.deliveryDate<=toDate) txns.push({type:'ORD',date:o.deliveryDate,amt:o.amount,qty:o.boxes,desc:o.address?` (${o.address})`:''}); });
  (DB.payments||[]).forEach(p => { if(isMatch(p) && p.date>=fromDate && p.date<=toDate) txns.push({type:'PAY',date:p.date,amt:p.amount}); });
  txns.sort((a,b) => a.date.localeCompare(b.date));
  const fmt = d => d.split('-').reverse().slice(0,2).join('-');
  let msg = `🧾 *ACCOUNT STATEMENT*\n👤 ${c.name}\n📅 ${fromDate.split('-').reverse().join('-')} to ${toDate.split('-').reverse().join('-')}\n\n🟢 *OPENING: ₹${openingBal}*\n-----------------------------------\n`;
  let runningBal = openingBal;
  if (!txns.length) msg += "(No transactions in this period)\n";
  else txns.forEach(t => { if(t.type==='ORD'){runningBal+=+t.amt;msg+=`🔸 *${fmt(t.date)}* | Delivery\n${t.desc?'📍 '+t.desc.replace(/[()]/g,'')+'\n':''}📦 ${t.qty} Boxes | ₹${t.amt}\n\n`;}else{runningBal-=+t.amt;msg+=`💚 *${fmt(t.date)}* | Payment\n💵 Cash | -₹${t.amt}\n\n`;} });
  msg += `-----------------------------------\n🔴 *CLOSING BALANCE: ₹${runningBal}*\n-----------------------------------\n_Generated by Anjani Water App_`;
  window.open("https://wa.me/91"+c.mobile+"?text="+encodeURIComponent(msg), "_blank");
}

export function generatePDF(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return alert("Customer not found!");
  const fromDate = document.getElementById('stmt-from').value;
  const toDate = document.getElementById('stmt-to').value;
  if (!fromDate || !toDate) { alert("Please select dates"); return; }
const isMatch = r => String(r.clientId) === String(c.id);

// ✅ FIX: Derive opening balance from server outstanding (col K)
const serverOutstanding = Number(c.outstanding) || 0;
let periodDebits = 0, periodCredits = 0;
(DB.orders||[]).forEach(o => { if(isMatch(o) && o.status!=='Pending' && o.deliveryDate>=fromDate && o.deliveryDate<=toDate) periodDebits += +o.amount; });
(DB.payments||[]).forEach(p => { if(isMatch(p) && p.date>=fromDate && p.date<=toDate) periodCredits += +p.amount; });
let openingBal = serverOutstanding - periodDebits + periodCredits;
  let txns = [];
  (DB.orders||[]).forEach(o => { if(isMatch(o) && o.status!=='Pending' && o.deliveryDate>=fromDate && o.deliveryDate<=toDate) txns.push({type:'ORD',date:o.deliveryDate,amt:o.amount,desc:`Delivery (${o.boxes} Boxes)${o.address?`<br><span style="color:#666;font-size:11px">(${o.address})</span>`:''}`}); });
  (DB.payments||[]).forEach(p => { if(isMatch(p) && p.date>=fromDate && p.date<=toDate) txns.push({type:'PAY',date:p.date,amt:p.amount,desc:'Payment Received'}); });
  txns.sort((a,b) => a.date.localeCompare(b.date));
  let runningBal = openingBal;
  let rows = '';
  txns.forEach(t => {
    if (t.type==='ORD') runningBal += +t.amt; else runningBal -= +t.amt;
    const color = t.type==='ORD'?'#dc2626':'#16a34a';
    const sign = t.type==='ORD'?'':'-';
    rows += `<tr style="border-bottom:1px solid #eee;"><td style="padding:10px;vertical-align:top;">${t.date.split('-').reverse().join('-')}</td><td style="padding:10px;vertical-align:top;">${t.desc}</td><td style="padding:10px;text-align:right;vertical-align:top;color:${color};">${sign}₹${t.amt}</td></tr>`;
  });
  const content = `<html><head><title>Statement_${c.name}</title></head><body style="font-family:sans-serif;padding:40px;color:#333;max-width:800px;margin:auto;"><div style="text-align:center;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:20px;"><h1 style="margin:0;font-size:24px;letter-spacing:2px;">ANJANI WATER</h1><p style="margin:5px 0;color:#666;font-size:12px;">ACCOUNT STATEMENT</p></div><div style="display:flex;justify-content:space-between;margin-bottom:30px;font-size:14px;"><div><strong>CLIENT:</strong><br>${c.name}<br>${c.mobile}</div><div style="text-align:right;"><strong>PERIOD:</strong><br>${fromDate.split('-').reverse().join('-')} to ${toDate.split('-').reverse().join('-')}</div></div><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f3f4f6;text-align:left;"><th style="padding:12px;">DATE</th><th style="padding:12px;">DESCRIPTION</th><th style="padding:12px;text-align:right;">AMOUNT</th></tr></thead><tbody><tr style="border-bottom:1px solid #ccc;font-weight:bold;"><td style="padding:12px;" colspan="2">OPENING BALANCE</td><td style="padding:12px;text-align:right;">₹${openingBal}</td></tr>${rows}<tr style="border-top:2px solid #333;font-weight:bold;font-size:16px;background:#fafafa;"><td style="padding:15px;" colspan="2">CLOSING BALANCE</td><td style="padding:15px;text-align:right;">₹${runningBal}</td></tr></tbody></table><div style="margin-top:50px;text-align:center;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:10px;">Generated by Anjani Water App</div><script>setTimeout(function(){window.print();},800);<\/script></body></html>`;
  const win = window.open('', '_blank');
  win.document.write(content); win.document.close();
}
