// ============================================================
// LEAD MANAGEMENT
// ============================================================
import { DB, CONFIG, STAFF_NUM } from './state.js';
import { showToast } from './utils.js';
import { enqueueAction, showOfflineToast } from './sync.js';

export function renderLeads() {
  const list = document.getElementById('list-leads');
  if (!list) return;
  list.innerHTML = '';
  
  const todayStr = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - (CONFIG?.RECENT_ORDERS_DAYS || 7) * 86400000).toISOString().split('T')[0];
  
  // 1. SMART FILTER: Look for lastContact first, then createdDate, default to today if missing so it doesn't hide
  const leads = (DB.leads || []).filter(l => {
    const d = l.lastContact || l.createdDate || todayStr;
    return d >= sevenDaysAgo;
  }).sort((a,b) => { 
    const dA = a.lastContact || a.createdDate || ''; 
    const dB = b.lastContact || b.createdDate || ''; 
    return dB !== dA ? dB.localeCompare(dA) : String(b.id).localeCompare(String(a.id)); 
  });
  
  const countNew = leads.filter(l => l.status === 'New').length;
  const countSam = leads.filter(l => l.status === 'Sam').length;
  const elNew = document.getElementById('stat-new'); if(elNew) elNew.innerText = countNew;
  const elSam = document.getElementById('stat-sample'); if(elSam) elSam.innerText = countSam;
  const leadFilter = window._leadFilter || 'ALL';
  
  let foundCount = 0;
  leads.forEach(l => {
    if (leadFilter !== 'ALL') {
      if (leadFilter === 'New' && l.status !== 'New') return;
      if (leadFilter === 'Sam' && l.status !== 'Sam') return;
      if (leadFilter === 'Waiting' && l.status !== 'Waiting' && l.status !== 'Con') return;
    }
    foundCount++;
    let stripClass = 'status-strip-New';
    if (l.status === 'Sam') stripClass = 'status-strip-Sample';
    else if (l.status === 'Con') stripClass = 'status-strip-Connected';
    else if (l.status === 'Waiting') stripClass = 'status-strip-Follow-up';
    
    // 2. SMART DATA EXTRACTION: Extract mobile from raw text if the backend didn't save a dedicated 'mobile' field
    const mobileMatch = (l.raw || '').match(/\d{10}/);
    const displayMobile = l.mobile || (mobileMatch ? mobileMatch[0] : l.raw) || 'No Number';
    const displayDate = l.lastContact || l.createdDate || 'No Date';

    const isWaiting = (l.status === 'Waiting' || l.status === 'Con');
    const msgFinal = "🙏 *Jay Shree Krishna!*\n\n*Anjani Water* tরফthI contact kari raha chhe! 💧\n\nAame provide kariye chhe *200mL Packaged Drinking Water Bottles* — BIS Certified, ISI Marked, 100% Shudh!\n\n━━━━━━━━━━━━━━\n🏆 *Aapna Business Maate Perfect:*\n🎪 Events & Functions\n🏢 Corporate Offices\n💒 Weddings & Receptions\n🍽️ Caterers & Banquets\n🏬 Showrooms & Retail\n━━━━━━━━━━━━━━\n\n✅ *Kem Anjani Water?*\n💧 ISI / BIS Certified Quality\n📦 Bulk Orders — Best Price Guaranteed\n🚚 On-Time Delivery, Every Time\n🤝 Trusted by 50+ Businesses Locally\n\n📲 *Aaj j \"YES\" reply karo* — FREE Sample Bottle moksho!\n\n_Aapna guests ne pilaavo sabse shudh pani_ 😊\n\n– *Anjani Water* 💙\n📞 Reply for Bulk Rates & Orders";
    const nileshMsg = `Nilesh, Call, Meet and Give Samples to this new lead: ${displayMobile}`;
    const hasNote = l.notes && l.notes.length > 0;
    const noteBtn = `<button onclick="openNote('${l.id}')" class="w-8 h-8 rounded-lg border flex items-center justify-center transition active:scale-95 ${hasNote?'bg-amber-100 text-amber-700 border-amber-200':'bg-slate-50 text-slate-400 border-slate-200 hover:bg-blue-50 hover:text-blue-500'}"><i data-feather="${hasNote?'file-text':'edit-2'}" class="w-4 h-4"></i></button>`;
    
    let html = `<div class="bg-white p-3 rounded-lg shadow-sm border border-slate-200 relative overflow-hidden ${stripClass} flex flex-wrap items-center justify-between gap-3">`;
    html += `<div class="flex items-center gap-3"><div><div class="font-bold text-slate-800 text-sm flex items-center gap-2">${displayMobile}<span class="text-[9px] font-normal text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">${l.status}</span></div><div class="text-[9px] text-slate-400 font-mono">${displayDate}</div></div></div>`;
    html += '<div class="flex items-center gap-2">' + noteBtn;
    
    if (!isWaiting) {
      html += `<a href="https://wa.me/91${displayMobile}?text=${encodeURIComponent(msgFinal)}" target="_blank" class="w-8 h-8 rounded-lg bg-green-50 text-green-600 border border-green-100 flex items-center justify-center hover:bg-green-100 active:scale-95 transition"><i data-feather="message-circle" class="w-4 h-4"></i></a>`;
      html += `<button onclick="runLeadAction('STATUS:Con','${l.id}')" class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center hover:bg-blue-100 active:scale-95 transition"><i data-feather="phone-call" class="w-4 h-4"></i></button>`;
      html += `<a onclick="runLeadAction('STATUS:Sam','${l.id}')" href="https://wa.me/91${STAFF_NUM}?text=${encodeURIComponent(nileshMsg)}" target="_blank" class="w-8 h-8 rounded-lg bg-purple-600 text-white shadow-sm flex items-center justify-center hover:bg-purple-700 active:scale-95 transition"><i data-feather="box" class="w-4 h-4"></i></a>`;
      html += `<button onclick="runLeadAction('CONVERT','${l.id}')" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition"><i data-feather="user-check" class="w-4 h-4"></i></button>`;
    } else {
      html += `<span class="text-[9px] font-bold text-slate-400 italic mr-2">Cooling Down...</span>`;
      html += `<button onclick="runLeadAction('STATUS:New','${l.id}')" class="w-8 h-8 rounded-lg bg-white border-2 border-dashed border-blue-200 text-blue-400 flex items-center justify-center hover:bg-blue-50 active:scale-95 transition"><i data-feather="zap" class="w-4 h-4"></i></button>`;
    }
    html += `<button onclick="runLeadAction('DELETE','${l.id}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-100 flex items-center justify-center hover:bg-red-100 active:scale-95 transition"><i data-feather="x" class="w-4 h-4"></i></button>`;
    html += '</div></div>';
    list.innerHTML += html;
  });
  
  if (!foundCount) list.innerHTML = '<div class="text-center text-slate-300 text-xs py-10">No Leads Found</div>';
  ['ALL','New','Sam','Waiting'].forEach(f => {
    const btn = document.getElementById('lf-'+f);
    if (btn) btn.className = leadFilter===f ? "px-3 py-1.5 rounded-md text-xs font-bold transition bg-white text-blue-600 shadow-sm border border-slate-200" : "px-3 py-1.5 rounded-md text-xs font-medium transition text-slate-500 hover:bg-slate-200";
  });
  try { feather.replace(); } catch(e){ console.warn('[feather]', e.message); }
}

export function addLead() {
  const input = document.getElementById('lead-input');
  const raw = input.value;
  if (!raw) return alert("Please enter details");
  
  const btn = document.querySelector('button[onclick="addLead()"]');
  if (btn) { btn.disabled = true; btn.innerText = "SAVING..."; }

  const mobileMatch = raw.match(/\d{10}/);
  const tempMobile = mobileMatch ? mobileMatch[0] : raw;
  const newLead = {
    id: 'LD-' + Date.now(),
    mobile: tempMobile,
    status: 'New',
    createdDate: new Date().toISOString().split('T')[0], // 3. Set to createdDate so it matches Firebase
    raw: raw
  };

  // ── OFFLINE path ──────────────────────────────────────────
  if (!navigator.onLine) {
    newLead._offline = true;
    DB.leads.push(newLead);
    renderLeads();
    input.value = '';
    if (btn) { btn.disabled = false; btn.innerText = "SAVE"; }
    enqueueAction('saveLead', {raw: raw});
    showOfflineToast('📦 Lead saved offline');
    return;
  }

  // ── ONLINE path ───────────────────────────────────────────
  google.script.run
    .withSuccessHandler(function() {
      if (typeof window._loadData === 'function') window._loadData(); 
      input.value = '';
      if (btn) { btn.disabled = false; btn.innerText = "SAVE"; }
      showToast('✅ Lead saved successfully!');
    })
    .withFailureHandler(function(err) {
      console.error("Lead Save Error:", err);
      showToast('❌ Save failed — saved offline instead', true);
      
      newLead._offline = true;
      DB.leads.push(newLead);
      renderLeads();
      input.value = '';
      if (btn) { btn.disabled = false; btn.innerText = "SAVE"; }
      enqueueAction('saveLead', {raw: raw});
    })
    .saveLead({raw: raw});
}

export function setLeadFilter(f) {
  window._leadFilter = f;
  renderLeads();
}

export function runLeadAction(action, id) {
  if (action === 'DELETE' && !confirm("Delete this lead permanently?")) return;
  const row = document.querySelector(`[onclick*="${id}"]`)?.closest('div');
  if (row) row.style.opacity = '0.5';

  // ── OFFLINE path ──────────────────────────────────────────
  if (!navigator.onLine) {
    if (action === 'DELETE') DB.leads = DB.leads.filter(l => String(l.id) !== String(id));
    else {
      const l = DB.leads.find(x => String(x.id) === String(id));
      if (l && action.startsWith('STATUS:')) l.status = action.split(':')[1];
    }
    renderLeads();
    enqueueAction('handleLeadAction', {action, id});
    showOfflineToast('✅ Action queued for offline sync');
    return;
  }

  // ── ONLINE path ───────────────────────────────────────────
  google.script.run
    .withSuccessHandler(() => { 
      if (typeof window._loadData === 'function') window._loadData(); 
    })
    .withFailureHandler((err) => {
      console.error("Action error", err);
      if (action === 'DELETE') DB.leads = DB.leads.filter(l => String(l.id) !== String(id));
      else {
        const l = DB.leads.find(x => String(x.id) === String(id));
        if (l && action.startsWith('STATUS:')) l.status = action.split(':')[1];
      }
      renderLeads();
      enqueueAction('handleLeadAction', {action, id});
      showOfflineToast('❌ Failed online — queued for sync');
    })
    .handleLeadAction(action, id);
}

export function runArchive() {
  if (!confirm(`Archive all 'New' leads older than ${CONFIG?.LEAD_ARCHIVE_DAYS || 30} days?`)) return;
  google.script.run.withSuccessHandler((res) => { 
    alert("Archived "+JSON.parse(res).count+" leads."); 
    if (typeof window._loadData === 'function') window._loadData(); 
  }).archiveOldLeads();
}

export function runCombo() {
  const btn = document.querySelector('button[onclick="runCombo()"]');
  const orgHtml = btn.innerHTML;
  btn.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin"></i> RUNNING...'; btn.disabled = true;
  google.script.run.withSuccessHandler((res) => {
    btn.innerHTML = '<i data-feather="check" class="w-4 h-4"></i> COMPLETED!';
    btn.classList.replace('bg-indigo-600', 'bg-green-600'); 
    if (typeof window._loadData === 'function') window._loadData();
    setTimeout(() => { btn.innerHTML = orgHtml; btn.classList.replace('bg-green-600','bg-indigo-600'); btn.disabled = false; feather.replace(); }, 3000);
  }).runComboActions();
}

// ── Fallback stub for HTML button to prevent ReferenceErrors ──
export function triggerGmailScan() {
  showToast('Gmail scanning is handled separately on the backend.', false);
}
