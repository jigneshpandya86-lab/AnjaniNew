// ============================================================
// ORDERS MANAGEMENT
// ============================================================
import { DB, STAFF_NUM, CONFIG } from './state.js';
import { esc, showToast } from './utils.js';
import { enqueueAction, showOfflineToast } from './sync.js';

export function render() {
  // Dropdowns
  const sel = document.getElementById('ord-cust');
  const paySel = document.getElementById('pay-customer');
  if (sel) {
    sel.innerHTML = '<option value="">Select Customer</option><option value="NEW" style="font-weight:bold;color:#2563eb;background:#eff6ff;">➕ ADD NEW CUSTOMER</option><option disabled>──────────────</option>';
  }
  if (paySel) paySel.innerHTML = '<option value="">Select Customer</option>';
  (DB.customers || []).forEach(function(c) {
    if (String(c.active) !== 'false') {
      if (sel) sel.add(new Option(c.name, c.id));
      if (paySel) paySel.add(new Option(c.name, c.id));
    }
  });

  // Orders list
  const list = document.getElementById('list-orders');
  if (!list) return;
  const todayStr = new Date().toLocaleDateString('en-CA');
  const tBoxes = (DB.orders || []).filter(o => o.status === 'Pending' && o.deliveryDate === todayStr).reduce((s,o) => s + (Number(o.boxes)||0), 0);
  const tEl = document.getElementById('cnt-today');
  if (tEl) tEl.innerText = tBoxes > 0 ? tBoxes : '';
  const searchEl = document.getElementById('ord-search-input');
  const searchTerm = (searchEl ? searchEl.value : '').toLowerCase();
  if (searchTerm.length > 0 && searchTerm.length < 5 && isNaN(searchTerm)) return;

  // Use timezone-safe dates for India (IST)
  const getLocalISO = (d) => new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  const todayStrISO = getLocalISO(new Date());
  const fiveDaysAgoStr = getLocalISO(new Date(Date.now() - 5 * 86400000)); // 5 days in milliseconds
  const showTodayOnly = window._showTodayOnly || false;

  let rawList = (DB.orders || []).filter(function(o) {
    // 1. Always allow search matches to pass through
    const isSearchMatch = searchTerm && (String(o.id).toLowerCase().includes(searchTerm) || (o.customer||'').toLowerCase().includes(searchTerm));
    if (searchTerm.length >= 5 || (!isNaN(searchTerm) && searchTerm.length > 0)) return isSearchMatch;
    
    const isToday = o.deliveryDate === todayStrISO;
    
    if (showTodayOnly) {
      // 2. "Today" Tab: Show only today's pending and today's delivered orders
      return (o.status === 'Pending' || o.status === 'Delivered') && isToday;
    } else {
      // 3. "All" Tab: Show ALL pending orders + Delivered orders from the last 5 days
      const isRecent = (o.deliveryDate >= fiveDaysAgoStr);
      return o.status === 'Pending' || (o.status === 'Delivered' && isRecent);
    }
  });
  
  const sortMode = window._sortMode || 'TASK';
  let pending;
  if (sortMode === 'TASK') {
    const pList = rawList.filter(o => o.status === 'Pending').sort((a,b) => (a.deliveryDate+a.time).localeCompare(b.deliveryDate+b.time));
    const dList = rawList.filter(o => o.status !== 'Pending').sort((a,b) => (b.deliveryDate+b.time).localeCompare(a.deliveryDate+a.time));
    pending = [...pList, ...dList];
  } else {
    pending = rawList.sort((a,b) => (a.deliveryDate+a.time).localeCompare(b.deliveryDate+b.time));
  }

  if (!pending.length) { list.innerHTML = '<div class="p-10 text-center text-slate-400 text-xs font-bold">No Orders Found</div>'; return; }

  let fullHtml = '';
  pending.forEach(function(o) {
    const prettyDate = o.deliveryDate.split('-').reverse().join('-');
    const cObj = DB.customers.find(x => String(x.id) === String(o.clientId)) || DB.customers.find(x => x.name === o.customer) || {};
    const custMob = cObj.mobile || "No Mobile";
    let cleanLink = (o.mapLink && o.mapLink.toString().includes('http')) ? o.mapLink.toString().trim() : '';
    const mapTxt = cleanLink ? `\n🗺️ Map: ${cleanLink}` : '';
    const staffMsg = `ORDER #${o.id}: ${o.customer}\n📱 Cust: ${custMob}\n📊 Status: ${o.status}\n📅 ${prettyDate} @ ${o.time||'Anytime'}\n📦 ${o.boxes} Boxes\n📍 ${o.address||'No Address'}${mapTxt}`;
    const waLink = "https://wa.me/91" + STAFF_NUM + "?text=" + encodeURIComponent(staffMsg);
    const smsLink = "sms:" + STAFF_NUM + "?body=" + encodeURIComponent(staffMsg);
    const highlightID = window._highlightID || null;
    let bgClass = "bg-white border-slate-200";
    if (String(o.id) === String(highlightID)) bgClass = "bg-yellow-50 border-yellow-400 ring-2 ring-yellow-300 shadow-lg scale-[1.02]";
    let html = `<div id="ord-card-${o.id}" class="${bgClass} p-4 rounded-2xl shadow-sm border mb-3 relative overflow-hidden group transition-all duration-500">`;
    html += '<div class="flex justify-between items-start mb-3">';
    html += '<div class="min-w-0 pr-2">';
    html += `<h4 class="font-bold text-slate-800 text-sm truncate leading-tight flex items-center gap-2"> <span class="bg-blue-100 text-blue-700 text-[10px] px-1 rounded mr-1">#${esc(o.id)}</span><span class="bg-slate-100 text-slate-500 text-[10px] px-1 rounded mr-1">${esc(o.sku || '200ml')}</span> ${esc(o.customer)}<button onclick="startQuickPay('${esc(o.clientId||'')}', ${Number(o.amount)||0})" class="w-6 h-6 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center active:scale-95 transition hover:bg-purple-100"><i data-feather="credit-card" class="w-3 h-3"></i></button></h4>`;
    html += `<div class="flex items-center mt-0.5 text-slate-400"><i data-feather="map-pin" class="w-3 h-3 mr-1 shrink-0"></i><input id="a-${o.id}" type="text" value="${(o.address||'').replace(/"/g,'&quot;')}" class="text-[10px] text-slate-500 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 outline-none w-full truncate" placeholder="Add Address"></div>`;
    html += '</div>';
    html += '<div class="flex items-center gap-1">';
    html += `<button onclick="openLocationEditor('${o.id}', '${String(o.address||'').replace(/'/g,"\\'")}') " class="w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-orange-50 hover:text-orange-600 transition"><i data-feather="map-pin" class="w-3 h-3"></i></button>`;
    html += `<button onclick="copyOrder('${o.id}')" class="w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition"><i data-feather="copy" class="w-3 h-3"></i></button>`;
    html += `<button onclick="printOrder('${o.id}')" class="w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-800 hover:text-white transition"><i data-feather="printer" class="w-3 h-3"></i></button>`;
    html += '</div></div>';
    if (o.status === 'Delivered') {
      html += `<div class="bg-green-50 rounded-xl p-3 border border-green-100 flex items-center justify-between"><div class="flex items-center gap-2"><div class="bg-green-200 text-green-700 p-1.5 rounded-lg"><i data-feather="check" class="w-4 h-4"></i></div><div><div class="text-[10px] font-bold text-green-600 uppercase">DELIVERED</div><div class="font-bold text-slate-700 text-xs">${prettyDate}</div></div></div><div class="text-right"><div class="text-2xl font-black text-slate-800">${o.boxes}</div><div class="text-[8px] font-bold text-slate-400 uppercase">BOXES</div></div></div>`;
      html += `<input id="q-${o.id}" type="hidden" value="${o.boxes}"><input id="d-${o.id}" type="hidden" value="${o.deliveryDate}">`;
      html += '<div class="flex items-center justify-end gap-2 mt-3">';
      html += `<a href="${waLink}" target="_blank" class="w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-md border border-green-100 hover:bg-green-100 transition shadow-sm"><i data-feather="message-circle" class="w-3 h-3"></i></a>`;
      html += `<a href="${smsLink}" class="w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 hover:bg-indigo-100 transition shadow-sm"><i data-feather="message-square" class="w-3 h-3"></i></a>`;
      html += `<a href="tel:${STAFF_NUM}" class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-md border border-blue-100 hover:bg-blue-100 transition shadow-sm"><i data-feather="phone" class="w-3 h-3"></i></a>`;
      html += `<a id="wa-${o.id}" target="_blank" class="w-8 h-8 flex items-center justify-center bg-teal-50 text-teal-600 rounded-md border border-teal-100 hover:bg-teal-100 transition shadow-sm"><i data-feather="send" class="w-3 h-3"></i></a>`;
      html += '</div>';
    } else {
      html += `<div class="bg-slate-50 border border-slate-100 rounded-xl p-2 mb-3 flex items-center gap-3">`;
      html += `<div class="flex flex-col gap-1 min-w-[80px] pl-1"><div class="flex items-center gap-1.5 text-slate-500"><i data-feather="calendar" class="w-3 h-3 text-slate-400"></i><input id="d-${o.id}" type="date" value="${o.deliveryDate}" class="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full p-0 cursor-pointer"></div><div class="flex items-center gap-1.5 text-slate-500"><i data-feather="clock" class="w-3 h-3 text-slate-400"></i><input id="t-${o.id}" type="time" value="${o.time||'09:00'}" class="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full p-0 cursor-pointer"></div></div>`;
      html += '<div class="w-px h-8 bg-slate-200"></div>';
      html += `<div class="flex-1 flex items-center justify-center gap-2"><span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">BOX</span><input id="q-${o.id}" type="number" value="${o.boxes}" class="w-12 text-center bg-white border-2 border-blue-100 rounded-lg text-lg font-black text-blue-600 h-9 focus:border-blue-500 focus:ring-0 outline-none transition"></div>`;
      html += `<button onclick="saveOrderEdit('${o.id}')" class="w-9 h-9 flex items-center justify-center bg-white text-slate-400 rounded-lg border border-slate-200 shadow-sm active:scale-95 hover:text-blue-600 hover:border-blue-200 transition"><i data-feather="save" class="w-4 h-4"></i></button>`;
      html += '</div>';
      html += '<div class="flex items-center gap-2">';
      html += `<a href="${waLink}" target="_blank" class="w-8 h-8 flex items-center justify-center bg-green-50 text-green-600 rounded-md border border-green-100 hover:bg-green-100 transition shadow-sm"><i data-feather="message-circle" class="w-3 h-3"></i></a>`;
      html += `<a href="${smsLink}" class="w-8 h-8 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 hover:bg-indigo-100 transition shadow-sm"><i data-feather="message-square" class="w-3 h-3"></i></a>`;
      html += `<a href="tel:${STAFF_NUM}" class="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-md border border-blue-100 hover:bg-blue-100 transition shadow-sm"><i data-feather="phone" class="w-3 h-3"></i></a>`;
      html += `<button onclick="doDel('${o.id}')" class="flex-1 h-8 bg-slate-900 text-white rounded-md font-bold text-[10px] shadow-sm active:scale-95 hover:bg-slate-800 transition flex items-center justify-center gap-2 tracking-wide">DELIVER <i data-feather="arrow-right" class="w-3 h-3 text-slate-400"></i></button>`;
      html += `<a id="wa-${o.id}" target="_blank" class="w-8 h-8 flex items-center justify-center bg-teal-50 text-teal-600 rounded-md border border-teal-100 hover:bg-teal-100 transition shadow-sm"><i data-feather="send" class="w-3 h-3"></i></a>`;
      html += '</div>';
    }
    html += '</div>';
    fullHtml += html;
  });

  list.innerHTML = fullHtml;
  pending.forEach(function(o) { setTimeout(function() { if (typeof updMsg === 'function' && document.getElementById('wa-'+o.id)) updMsg(o.id); }, 0); });
  if (typeof window._renderLeads === 'function') window._renderLeads();
  if (typeof window._renderRecentPayments === 'function') window._renderRecentPayments();
  const stockView = document.getElementById('view-stock');
  if (stockView && !stockView.classList.contains('hidden')) { if (typeof window._renderStockPage === 'function') window._renderStockPage(); }
  if (typeof window._renderCustomers === 'function') window._renderCustomers('');
  const highlightID = window._highlightID || null;
  if (highlightID) { setTimeout(() => { const el = document.getElementById('ord-card-'+highlightID); if(el) { el.scrollIntoView({behavior:'smooth',block:'center'}); window._highlightID = null; } }, 500); }
  try { feather.replace(); } catch(e){ console.warn('[feather]', e.message); }
}

export function fillCust() {
  const val = document.getElementById('ord-cust').value;
  if (val === 'NEW') { if (typeof window.openCustForm === 'function') window.openCustForm(); document.getElementById('ord-cust').value = ''; return; }
  const c = DB.customers.find(x => x.id == val);
  if (c) { document.getElementById('ord-rate').value = c.rate; document.getElementById('ord-mob').value = c.mobile; calc(); }
}

export function calc() {
  const qty = document.getElementById('ord-qty').value || 0;
  const rate = document.getElementById('ord-rate').value || 0;
  document.getElementById('ord-total').innerText = '₹' + (qty * rate);
}

export function updMsg(id) {
  const inputEl = document.getElementById('q-'+id);
  const dateEl = document.getElementById('d-'+id);
  if (!inputEl) return;
  const qty = Number(inputEl.value) || 0;
  let dateStr = dateEl && dateEl.value ? dateEl.value.split('-').reverse().join('-') : new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  const o = DB.orders.find(x => String(x.id) === String(id));
  if (!o) return;
  const c = DB.customers.find(x => String(x.id) === String(o.clientId));
  const mob = c ? c.mobile : '';
  let prevBal = 0;
  (DB.orders||[]).forEach(ord => { if(c && String(ord.clientId)===String(c.id) && ord.status==='Delivered' && String(ord.id)!==String(id)) prevBal += Number(ord.amount||0); });
  (DB.payments||[]).forEach(p => { if(c && String(p.clientId)===String(c.id)) prevBal -= Number(p.amount||0); });
  const currentAmt = qty * Number(o.rate);
  const totalOutstanding = prevBal + currentAmt;
  const msg = `Hello! Delivered: ${qty} Boxes (₹${currentAmt}) on ${dateStr}.\nTotal Outstanding: ₹${totalOutstanding}\nThanks - Anjani Water`;
  const wa = document.getElementById('wa-'+id);
  if (wa) {
    if (mob && mob.length > 5) { wa.href = "https://wa.me/91"+mob+"?text="+encodeURIComponent(msg); wa.classList.remove('opacity-50','pointer-events-none'); }
    else { wa.removeAttribute('href'); wa.classList.add('opacity-50','pointer-events-none'); }
  }
}

export function copyOrder(id) {
  const o = DB.orders.find(x => x.id == id);
  if (!o) return;
  const sel = document.getElementById('ord-cust');
  if (sel) { sel.value = o.clientId; fillCust(); }
  if (document.getElementById('ord-qty')) document.getElementById('ord-qty').value = o.boxes;
  if (document.getElementById('ord-rate')) document.getElementById('ord-rate').value = o.rate;
  if (document.getElementById('ord-addr')) document.getElementById('ord-addr').value = o.address || '';
  if (document.getElementById('ord-date')) document.getElementById('ord-date').valueAsDate = new Date();
  calc();
  showToast('📋 Order #'+id+' copied!');
}

export function printOrder(id) {
  const o = DB.orders.find(x => x.id == id);
  if (!o) return;
  const dateStr = o.deliveryDate.split('-').reverse().join('-');
  const total = o.boxes * o.rate;
  const endScript = "<" + "/script>";
  const html = `<html><head><title>Order_#${id}</title></head><body style="font-family:sans-serif;padding:30px;max-width:400px;margin:auto;border:2px dashed #ccc;"><div style="text-align:center;border-bottom:2px solid #333;padding-bottom:15px;margin-bottom:20px;"><h2 style="margin:0;">ANJANI WATER</h2><p style="margin:5px 0;font-size:12px;color:#666;text-transform:uppercase;">ORDER / DELIVERY SLIP</p></div><div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:15px;font-weight:bold;"><div>Order #${o.id}</div><div>${dateStr}</div></div><div style="margin-bottom:20px;font-size:14px;background:#f9fafb;padding:10px;border-radius:8px;"><div style="font-size:12px;color:#666;margin-bottom:4px;">CUSTOMER</div><div style="font-weight:bold;font-size:16px;">${o.customer}</div><div style="font-size:12px;color:#555;">${o.address||''}</div></div><table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;"><tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;">Water Boxes (${o.boxes} x ₹${o.rate})</td><td style="text-align:right;font-weight:bold;">₹${total}</td></tr><tr style="border-top:2px solid #333;font-size:18px;"><td style="padding:15px 0;font-weight:bold;">TOTAL</td><td style="text-align:right;font-weight:900;">₹${total}</td></tr></table><div style="margin-top:50px;border-top:1px solid #ccc;padding-top:10px;display:flex;justify-content:space-between;font-size:11px;"><div style="text-align:center;"><br>Authorized Sign</div><div style="text-align:center;"><br>Receiver Sign</div></div><script>setTimeout(function(){ window.print(); }, 500);${endScript}</body></html>`;
  const win = window.open('', '_blank', 'width=450,height=650');
  win.document.write(html); win.document.close();
}

export function startQuickOrder(id, name) {
  if (typeof window.go === 'function') window.go('orders');
  const input = document.getElementById('ord-cust');
  if (input && input.tagName === 'SELECT') {
    for (let i = 0; i < input.options.length; i++) {
      if (input.options[i].value == id) { input.selectedIndex = i; fillCust(); break; }
    }
  }
}

export function shareSchedule() {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  const tStr = today.toISOString().split('T')[0];
  const tmStr = tomorrow.toISOString().split('T')[0];
  const list = (DB.orders||[]).filter(o => (o.deliveryDate===tStr || o.deliveryDate===tmStr) && o.status==='Pending' && Number(o.boxes)>0);
  list.sort((a,b) => (a.deliveryDate+a.time).localeCompare(b.deliveryDate+b.time));
  if (!list.length) { alert("No PENDING orders for Today or Tomorrow!"); return; }
  let msg = `*🚚 PENDING DELIVERIES (${list.length})*\n📅 For: ${tStr.split('-').reverse().join('-')} & ${tmStr.split('-').reverse().join('-')}\n\n`;
  list.forEach((o, i) => {
    const dateIcon = (o.deliveryDate===tStr) ? "TODAY" : "TOMORROW";
    const custObj = DB.customers.find(x => String(x.id) === String(o.clientId)) || {};
    const custMobile = custObj.mobile || o.mobile || 'No Mobile';
    msg += `*${i+1}. ${o.customer}* (${dateIcon})\n📱 ${custMobile}\n📅 ${o.deliveryDate.split('-').reverse().join('-')}\n⏰ ${o.time||'Anytime'} | 📦 *${o.boxes} Box*\n📍 ${o.address||'No Address'}\n`;
    if (o.mapLink && o.mapLink.startsWith('http')) msg += `🗺️ Map: ${o.mapLink}\n`;
    msg += "................................................\n";
  });
  window.open("https://wa.me/91"+STAFF_NUM+"?text="+encodeURIComponent(msg), "_blank");
}

export function toggleFilter(isToday) {
  window._showTodayOnly = isToday;
  document.getElementById('filter-today').className = isToday ? "px-3 py-1 text-xs font-bold rounded-md bg-blue-100 text-blue-700" : "px-3 py-1 text-xs font-bold rounded-md text-slate-500";
  document.getElementById('filter-all').className = !isToday ? "px-3 py-1 text-xs font-bold rounded-md bg-blue-100 text-blue-700" : "px-3 py-1 text-xs font-bold rounded-md text-slate-500";
  render();
}

export function toggleSort() {
  window._sortMode = (window._sortMode === 'TASK') ? 'TIME' : 'TASK';
  const btn = document.getElementById('btn-sort');
  if (btn) {
    btn.innerHTML = window._sortMode === 'TASK' ? '<i data-feather="check-square" class="w-4 h-4 text-blue-600"></i>' : '<i data-feather="clock" class="w-4 h-4 text-slate-500"></i>';
    btn.className = window._sortMode === 'TASK' ? "w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shadow-sm active:scale-95 transition" : "w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm active:scale-95 transition";
  }
  feather.replace(); render();
}

export async function placeOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save');
  if (btn.disabled) return;

  const cid = document.getElementById('ord-cust').value;
  
  // 1. STRICT VALIDATION: Stop immediately if no customer is selected
  if (!cid || cid === "NEW") {
    alert("⚠️ Please select a valid customer first.");
    document.getElementById('ord-cust').focus();
    return;
  }

  const c = DB.customers.find(x => x.id == cid) || {};
  
  // Recalculate safely instead of parsing the text from the UI
  const safeQty = Number(document.getElementById('ord-qty').value) || 0;
  const safeRate = Number(document.getElementById('ord-rate').value) || 0;
  
  // 2. DATA SANITIZATION: Prevent 'undefined' or 'NaN' from crashing Firebase
  const data = {
    id:           'ORD-' + Date.now(),
    clientId:     cid,
    customer:     c.name || 'Unknown',
    mobile:       c.mobile || '',
    map:          c.map || '',
    mapLink:      document.getElementById('maps-link-hidden') ? document.getElementById('maps-link-hidden').value : '',
    address:      document.getElementById('ord-addr').value || '',
    boxes:        safeQty,
    sku:          document.getElementById('ord-sku').value || '200ml',
    rate:         safeRate,
    amount:       (safeQty * safeRate) || 0,
    deliveryDate: document.getElementById('ord-date').value || new Date().toISOString().split('T')[0],
    time:         document.getElementById('ord-time') ? document.getElementById('ord-time').value : '09:00',
    staff:        document.getElementById('ord-staff') ? document.getElementById('ord-staff').value : 'Nilesh',
    status:       'Pending'
  };

  // ── OFFLINE path ──────────────────────────────────────────
  if (!navigator.onLine) {
    data._offline = true;
    DB.orders.push(data);
    if (typeof render === 'function') render();
    e.target.reset();
    document.getElementById('ord-date').value = new Date().toISOString().split('T')[0];
    enqueueAction('saveOrder', data);
    showOfflineToast('📦 Order saved offline for ' + (c.name || 'customer'));
    return;
  }

  // ── ONLINE path (FIREBASE) ────────────────────────────────
  btn.disabled = true;
  btn.innerText = "SAVING...";

  try {
    if (window.FirebaseAPI) {
      await window.FirebaseAPI.saveOrder(data);
    }
    
    window._highlightID = data.id;
    if (typeof window._loadData === 'function') window._loadData();
    
    e.target.reset();
    document.getElementById('ord-date').value = new Date().toISOString().split('T')[0];
    btn.disabled = false;
    btn.innerText = "CONFIRM ORDER";
  } catch (err) {
    console.error("Firebase Save Error:", err); 
    btn.disabled = false;
    btn.innerText = "CONFIRM ORDER";
    showToast('❌ Save failed — saved offline instead', true);
    data._offline = true;
    DB.orders.push(data);
    if (typeof render === 'function') render();
    enqueueAction('saveOrder', data);
  }
}

export async function saveOrderEdit(id) {
  const qty     = document.getElementById('q-'+id).value;
  const date    = document.getElementById('d-'+id).value;
  const timeEl  = document.getElementById('t-'+id);
  const time    = timeEl ? timeEl.value : '09:00';
  const address = document.getElementById('a-'+id).value;
  const btn     = document.querySelector(`button[onclick="saveOrderEdit('${id}')"]`);
  const o       = DB.orders.find(x => String(x.id) === String(id));

  if (!navigator.onLine) {
    if (o) { o.boxes = qty; o.deliveryDate = date; o.time = time; o.address = address; }
    if (btn) btn.innerHTML = '<i data-feather="check" class="w-4 h-4 text-amber-500"></i>';
    enqueueAction('updateOrderStatus', { id, qty, date, time, address, status: null });
    showOfflineToast('✏️ Order #' + id + ' edit saved offline');
    return;
  }

  if (o) { o.boxes = qty; o.deliveryDate = date; o.time = time; o.address = address; }
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin"></i>'; 
    btn.disabled = true;
    
    try {
      if (window.FirebaseAPI) {
        await window.FirebaseAPI.updateOrderStatus(id, null, qty, date, time, address);
      }
      
      btn.innerHTML = '<i data-feather="check" class="w-4 h-4 text-green-600"></i>';
      setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; feather.replace(); }, 1500);
      updMsg(id);
    } catch (e) {
      btn.innerHTML = '<i data-feather="x" class="w-4 h-4 text-red-500"></i>';
      btn.disabled = false; feather.replace();
      showToast('❌ Save failed: ' + e.message, true);
    }
  }
}

export async function doDel(id) {
  const qty     = document.getElementById('q-' + id).value;
  const date    = document.getElementById('d-' + id).value;
  const timeEl  = document.getElementById('t-' + id);
  const time    = timeEl ? timeEl.value : '09:00';
  const address = document.getElementById('a-' + id).value;
  const btn     = document.querySelector(`button[onclick="doDel('${id}')"]`);

  // ── OFFLINE path ──────────────────────────────────────────
  if (!navigator.onLine) {
    const o = DB.orders.find(x => String(x.id) === String(id));
    if (o) { o.status = 'Delivered'; o.boxes = qty; o.deliveryDate = date; o._offline = true; }
    if (typeof render === 'function') render();
    enqueueAction('updateOrderStatus', { id, status: 'Delivered', qty, date, time, address });
    showOfflineToast('✅ Order #' + id + ' marked delivered offline');
    return;
  }

  // ── ONLINE path (FIREBASE) ────────────────────────────────
  if (btn) btn.innerText = "SAVING...";
  
  try {
    if (window.FirebaseAPI) {
      await window.FirebaseAPI.updateOrderStatus(id, "Delivered", qty, date, time, address);
    }
    if (typeof window._loadData === 'function') window._loadData();
  } catch (err) {
    if (btn) btn.innerText = "DELIVER →";
    const o = DB.orders.find(x => String(x.id) === String(id));
    if (o) { o.status = 'Delivered'; o._offline = true; }
    if (typeof render === 'function') render();
    enqueueAction('updateOrderStatus', { id, status: 'Delivered', qty, date, time, address });
    showOfflineToast('✅ Saved offline — will sync on reconnect');
  }
}
