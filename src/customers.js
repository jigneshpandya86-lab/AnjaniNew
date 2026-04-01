// ============================================================
// CUSTOMER MANAGEMENT (100% PURE FIREBASE)
// ============================================================
import { DB, CONFIG } from './state.js';
import { esc, showToast } from './utils.js';
import { db } from '../firebase-config.js';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

export function renderCustomers(s) {
  const l = document.getElementById('list-customers');
  if (!l) return;
  l.innerHTML = '';
  const statusEl = document.getElementById('cust-filter-status');
  if (s === 'FLAGGED') { 
      statusEl.classList.remove('hidden'); 
      statusEl.innerHTML = 'Showing Clients with Dues (<span class="text-blue-600 font-bold cursor-pointer underline" onclick="renderCustomers(\'\')">Clear</span>)'; 
  }
  else statusEl.classList.add('hidden');
  
  const lastActiveMap = {};
  const updateDate = (id, name, date) => {
    if (id && (!lastActiveMap[id] || date > lastActiveMap[id])) lastActiveMap[id] = date;
    if (name && (!lastActiveMap[name] || date > lastActiveMap[name])) lastActiveMap[name] = date;
  };
  (DB.orders||[]).forEach(o => { if(o.status!=='Pending') updateDate(o.clientId, o.customer, o.deliveryDate); });
  (DB.payments||[]).forEach(p => { updateDate(p.clientId, p.customer, p.date); });
  
  const sortedList = (DB.customers||[]).slice().sort((a,b) => { 
      const dA=lastActiveMap[a.id]||lastActiveMap[a.name]||'2000-01-01'; 
      const dB=lastActiveMap[b.id]||lastActiveMap[b.name]||'2000-01-01'; 
      return dB.localeCompare(dA); 
  });
  
  const cutoffStr = new Date(Date.now()- (CONFIG?.LEAD_CUTOFF_DAYS || 30) *86400000).toISOString().split('T')[0];
  let foundCount = 0;
  
  sortedList.forEach(function(c) {
    const safeName = String(c.name||"Unknown");
    if (s && s !== 'FLAGGED' && !safeName.toLowerCase().includes(s.toLowerCase())) return;
    const bal = Number(c.outstanding) || 0;
    const recentAmt = (DB.orders||[]).filter(o => String(o.clientId)===String(c.id) && o.status!=='Pending' && o.deliveryDate>=cutoffStr).reduce((s,o)=>s+(+o.amount),0);
    const trueOverdue = bal - recentAmt;
    if (s === 'FLAGGED' && trueOverdue <= 0) return;
    
    foundCount++;
    const msgText = `Hello ${c.name}, your outstanding balance with Anjani Water is ₹${bal}. Please pay at your earliest convenience.`;
    const msgEncoded = encodeURIComponent(msgText);
    const flagIcon = trueOverdue > 0 ? '<span class="mr-1 text-red-500">🚩</span>' : '';
    let fmtBal = bal;
    if (bal >= 100000) fmtBal = (bal/100000).toFixed(1)+'L'; else if (bal >= 1000) fmtBal = (bal/1000).toFixed(1)+'k';
    const balBadge = bal > 0 ? `<span class="ml-2 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-mono">₹${fmtBal}</span>` : '';
    const cleanName = safeName.replace(/'/g,"\\'");
    const orderBtn = `<button onclick="startQuickOrder('${c.id}','${cleanName}');event.stopPropagation();" class="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm active:scale-95 transition hover:bg-orange-200 border border-orange-200 shrink-0"><i data-feather="shopping-cart" class="w-4 h-4"></i></button>`;
    const isActive = String(c.active) !== 'false';
    const rowOpacity = isActive ? '' : 'opacity-50 grayscale bg-slate-50';
    
    let html = `<div onclick="viewCust('${c.id}')" class="p-4 flex justify-between items-center hover:bg-slate-50 border-b border-slate-100 cursor-pointer group ${rowOpacity}">`;
    html += `<div class="flex items-center gap-3 flex-1 overflow-hidden">${orderBtn}<div class="truncate"><div class="font-bold text-slate-800 text-sm truncate flex items-center">${flagIcon}${safeName}${balBadge}</div><div class="text-xs text-slate-400 font-medium">${c.mobile}</div></div></div>`;
    html += `<div class="flex gap-1 pl-2" onclick="event.stopPropagation()"><button onclick="quickPay('${c.id}','${cleanName}',${bal});event.stopPropagation();" class="w-8 h-8 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shadow-sm active:scale-95 transition"><i data-feather="dollar-sign" class="w-4 h-4"></i></button><a href="https://wa.me/91${c.mobile}?text=${msgEncoded}" target="_blank" class="w-8 h-8 rounded-full bg-green-50 text-green-600 border border-green-100 flex items-center justify-center shadow-sm active:scale-95 transition"><i data-feather="message-circle" class="w-4 h-4"></i></a><a href="sms:${c.mobile}?body=${msgEncoded}" class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shadow-sm active:scale-95 transition"><i data-feather="message-square" class="w-4 h-4"></i></a><a href="tel:${c.mobile}" class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shadow-sm active:scale-95 transition"><i data-feather="phone" class="w-4 h-4"></i></a></div></div>`;
    l.innerHTML += html;
  });
  
  if (!foundCount) l.innerHTML = `<div class="text-center p-10 text-slate-300 text-xs">${s==='FLAGGED'?'No pending dues found! 🎉':'No customers found'}</div>`;
  try { feather.replace(); } catch(e){ console.warn('[feather]', e.message); }
}

export function viewCust(id) {
  window._currentCustID = id;
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  const bal = Number(c.outstanding) || 0;
  const msgText = `Hello ${c.name}, your outstanding balance with Anjani Water is ₹${bal}. Please pay at your earliest convenience.`;
  const msgEncoded = encodeURIComponent(msgText);
  const flagState = c.flag ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-300 bg-slate-50 border-slate-200 grayscale';
  const isActive = String(c.active) !== 'false';
  const activeClass = isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200';
  const activeText = isActive ? '' : '<span class="text-[9px] font-bold text-red-500 uppercase tracking-wider mr-2">INACTIVE</span>';
  
  let html = `<div class="flex justify-between items-start"><div><h2 class="text-2xl font-black text-slate-800">${c.name}</h2><div class="text-sm text-slate-500 font-bold mt-1">${c.mobile}</div></div><div class="flex flex-col items-end gap-2"><div class="flex gap-2">${activeText}<button onclick="toggleCustActive('${c.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg border ${activeClass} transition-all shadow-sm"><i data-feather="power" class="w-4 h-4"></i></button><button onclick="toggleCustFlag('${c.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg border ${flagState} transition-all shadow-sm">🚩</button></div><div><div class="text-xs font-bold text-slate-400 uppercase text-right">BALANCE</div><div class="text-3xl font-black ${bal>0?'text-red-500':'text-slate-300'}">₹${bal}</div></div></div></div>`;
  html += `<div class="grid grid-cols-3 gap-3 mt-6"><a href="https://wa.me/91${c.mobile}?text=${msgEncoded}" target="_blank" class="flex items-center justify-center py-3 bg-green-50 text-green-700 rounded-xl font-bold text-xs gap-2 border border-green-100"><i data-feather="message-circle" class="w-4 h-4"></i> WA</a><a href="sms:${c.mobile}?body=${msgEncoded}" class="flex items-center justify-center py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-xs gap-2 border border-indigo-100"><i data-feather="message-square" class="w-4 h-4"></i> SMS</a><a href="tel:${c.mobile}" class="flex items-center justify-center py-3 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs gap-2 border border-blue-100"><i data-feather="phone" class="w-4 h-4"></i> Call</a>`;
  if (c.flag) { const remText = encodeURIComponent(`⚠️ Urgent: ${c.name}, please clear your due balance of ₹${bal} immediately.`); html += `<a href="https://wa.me/91${c.mobile}?text=${remText}" target="_blank" class="col-span-3 mt-1 py-3 bg-amber-100 text-amber-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-amber-200 shadow-sm animate-pulse"><i data-feather="bell" class="w-4 h-4"></i> SEND PAYMENT REMINDER</a>`; }
  html += '</div>';
  
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  html += `<div class="mt-6 bg-slate-50 p-4 rounded-xl border border-slate-100"><div class="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><i data-feather="file-text" class="w-3 h-3"></i> Statement</div><div class="flex gap-2 mb-3"><input id="stmt-from" type="date" value="${firstDay}" class="w-full p-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-600"><input id="stmt-to" type="date" value="${today}" class="w-full p-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-600"></div><div class="flex gap-2"><button onclick="shareStatement('${c.id}')" class="flex-1 py-3 bg-slate-800 text-white rounded-lg text-xs font-bold shadow-md flex items-center justify-center gap-2"><i data-feather="share-2" class="w-3 h-3"></i> WHATSAPP</button><button onclick="generatePDF('${c.id}')" class="flex-1 py-3 bg-white text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center justify-center gap-2"><i data-feather="printer" class="w-3 h-3"></i> SAVE PDF</button></div></div>`;
  html += `<button onclick="openCustForm(true)" class="mt-4 w-full py-2 text-xs font-bold text-slate-400 border-t border-slate-100">EDIT DETAILS</button>`;
  
  const card = document.getElementById('cust-detail-card');
  if (card) card.innerHTML = html;
  const h = document.getElementById('cd-history');
  
  if (h) {
    h.innerHTML = '';
    const allTxns = [];
    (DB.orders||[]).forEach(o => { if(String(o.clientId)===String(c.id) && o.status!=='Pending') allTxns.push({type:'order', date:o.deliveryDate, amount:o.amount, label:'Order'}); });
    (DB.payments||[]).forEach(p => { if(String(p.clientId)===String(c.id)) allTxns.push({type:'pay', date:p.date, amount:p.amount, label:'Payment'}); });
    allTxns.sort((a,b)=>b.date.localeCompare(a.date));
    
    if (!allTxns.length) h.innerHTML = '<div class="p-6 text-center text-slate-300 text-xs">No transaction history</div>';
    else allTxns.forEach(t => { h.innerHTML += `<div class="p-3 border-b flex justify-between items-center"><div><div class="font-bold text-xs">${t.label}</div><div class="text-[10px] text-slate-400">${t.date}</div></div><div class="font-mono font-bold text-sm ${t.type==='order'?'text-red-600':'text-green-600'}">${t.type==='order'?'-':'+'} ₹${t.amount}</div></div>`; });
  }
  if (typeof window.go === 'function') window.go('cust-detail');
  try { feather.replace(); } catch(e){ console.warn('[feather]', e.message); }
}

// ============================================================
// BULLETPROOF FORM OPENER
// ============================================================
export function openCustForm(isEdit) {
  const modal = document.getElementById('modal-cust');
  if (!modal) return;
  
  modal.classList.remove('hidden');
  
  const safeSet = (id, val) => { 
      const el = document.getElementById(id); 
      if (el) el.value = val; 
  };

  const currentID = window._currentCustID || null;

  if (isEdit && currentID) {
    const c = DB.customers.find(x => x.id === currentID) || {};
    safeSet('new-id', c.id || ''); 
    safeSet('new-name', c.name || '');
    safeSet('new-mob', c.mobile || ''); 
    safeSet('new-map', c.map || '');
    safeSet('new-rate', c.rate || '150');
  } else {
    safeSet('new-id', ''); 
    safeSet('new-name', '');
    safeSet('new-mob', ''); 
    safeSet('new-map', '');
    safeSet('new-rate', '150');
  }
}

// ============================================================
// PURE FIREBASE: SAVE NEW & EDIT CLIENT
// ============================================================
export async function saveClient(e) {
  if (e) e.preventDefault();
  
  const safeGet = (id) => { 
      const el = document.getElementById(id); 
      return el ? el.value.trim() : ''; 
  };
  
  const id = safeGet('new-id');
  const name = safeGet('new-name');
  const mobile = safeGet('new-mob');
  const mapLink = safeGet('new-map');
  const rate = safeGet('new-rate') || '150';
  
  if (!name || !mobile) {
    alert("⚠️ Customer Name and Mobile number are required.");
    return;
  }

  const isEdit = !!id;
  const finalId = id || 'C-' + Date.now(); 

  const data = { 
    id: finalId, 
    name: name, 
    mobile: mobile, 
    map: mapLink, 
    rate: rate, 
    active: true 
  };

  const modal = document.getElementById('modal-cust');
  if (modal) modal.classList.add('hidden');
  showToast('⏳ Saving directly to live database...');

  try {
     const custRef = doc(db, 'customers', finalId);
     
     if (isEdit) {
         await updateDoc(custRef, data);
     } else {
         data.outstanding = 0;
         await setDoc(custRef, data, { merge: true });
     }
     
     showToast('✅ Customer saved successfully!');
     if (isEdit && typeof viewCust === 'function') viewCust(finalId);
  } catch (error) {
     console.error("Save Error:", error);
     alert("❌ Failed to save client: " + error.message);
  }
}

// ============================================================
// PURE FIREBASE: TOGGLE ACTIVE STATUS
// ============================================================
export async function toggleCustActive(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  
  const newStatus = !(String(c.active) === 'true' || c.active === true);
  
  // Snap the UI immediately
  c.active = newStatus;
  viewCust(id); 
  showToast('⏳ Updating status in database...');

  try {
    await updateDoc(doc(db, 'customers', String(id)), { active: newStatus });
    showToast(newStatus ? '✅ Client is now ACTIVE' : '⏸️ Client is now INACTIVE');
  } catch (error) {
    console.error("Status Update Error:", error);
  }
}

// ============================================================
// PURE FIREBASE: TOGGLE FLAG
// ============================================================
export async function toggleCustFlag(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  
  const newFlag = !c.flag;
  
  // Snap the UI immediately
  c.flag = newFlag;
  viewCust(id);

  try {
    await updateDoc(doc(db, 'customers', String(id)), { flag: newFlag });
    showToast(newFlag ? '🚩 Client Flagged!' : '✅ Flag Removed');
  } catch (error) {
    console.error("Flag Update Error:", error);
  }
}

// ============================================================
// LOCATION EDITOR UI
// ============================================================
export function openLocationEditor(id, oldAddr) {
  window._currentEditingOrderId = id;
  const modal = document.getElementById('modal-loc-edit');
  const oldDisplay = document.getElementById('loc-edit-old');
  if (oldDisplay) oldDisplay.innerText = oldAddr || "No address found";
  const input = document.getElementById('loc-edit-input');
  if (input) { input.value = ''; input.classList.remove('border-green-500','border-red-500'); }
  document.getElementById('loc-edit-link').value = '';
  if (modal) modal.classList.remove('hidden');
  setTimeout(initEditMap, 500);
}

let editMapInitialized = false;

export function initEditMap() {
  if (editMapInitialized) return;
  try {
    const input = document.getElementById('loc-edit-input');
    if (!input) return;
    const vadodaraBounds = {north:22.55, south:22.10, east:73.60, west:73.00};
    const options = {bounds:vadodaraBounds, strictBounds:true, componentRestrictions:{country:"in"}, fields:["formatted_address","url","geometry"]};
    const editAutocomplete = new google.maps.places.Autocomplete(input, options);
    editAutocomplete.addListener("place_changed", () => {
      const place = editAutocomplete.getPlace();
      const hiddenUrl = document.getElementById("loc-edit-link");
      if (!place.url) { hiddenUrl.value = ''; input.classList.add("border-red-500"); }
      else { hiddenUrl.value = place.url; input.classList.remove("border-red-500"); input.classList.add("border-green-500","border-2"); }
    });
    input.addEventListener('input', function() {
      const val = input.value.trim();
      const hiddenUrl = document.getElementById("loc-edit-link");
      if (val.toLowerCase().startsWith('http')) { hiddenUrl.value = val; input.classList.remove("border-red-500"); input.classList.add("border-green-500","border-2"); }
      else if (val==='') { input.classList.remove("border-green-500","border-red-500","border-2"); hiddenUrl.value = ''; }
    });
    editMapInitialized = true;
  } catch(e) { console.log("Edit Map Error: "+e.message); }
}

// ============================================================
// PURE FIREBASE: UPDATE ORDER LOCATION
// ============================================================
export async function submitLocationUpdate() {
  const inputVal = document.getElementById('loc-edit-input').value.trim();
  let hiddenLink = document.getElementById('loc-edit-link').value;
  if (inputVal.toLowerCase().startsWith('http')) hiddenLink = inputVal;
  
  if (!hiddenLink) { alert("⚠️ Please select a location or paste a valid link."); return; }
  
  const currentEditingOrderId = window._currentEditingOrderId || null;
  document.getElementById('modal-loc-edit').classList.add('hidden');
  showToast("⏳ Updating Location...");

  try {
    if(currentEditingOrderId) {
        await updateDoc(doc(db, 'orders', String(currentEditingOrderId)), { 
            address: inputVal, 
            mapLink: hiddenLink 
        });
        showToast("✅ Location Updated!");
    }
  } catch (error) {
     console.error("Map Update Error:", error);
     alert("❌ Failed to update location.");
  }
}

// ============================================================
// LEADS NOTE UI
// ============================================================
export function openNote(id) {
  const lead = DB.leads.find(l => l.id === id);
  const currentNote = lead ? (lead.notes||'') : '';
  const noteLeadIdEl = document.getElementById('note-lead-id');
  if (noteLeadIdEl) noteLeadIdEl.value = id;
  document.getElementById('note-input').value = currentNote;
  document.getElementById('note-modal').classList.remove('hidden');
  document.getElementById('note-input').focus();
}

// ============================================================
// PURE FIREBASE: SAVE LEADS NOTE
// ============================================================
export async function saveNote() {
  const id = document.getElementById('note-lead-id').value;
  const text = document.getElementById('note-input').value;
  document.getElementById('note-modal').classList.add('hidden');
  showToast('⏳ Saving note...');
  
  try {
     await updateDoc(doc(db, 'leads', String(id)), { notes: text });
     showToast('✅ Note saved directly to database!');
  } catch(error) {
     console.error("Note Save Error:", error);
     alert("❌ Failed to save note.");
  }
}
