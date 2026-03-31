// ============================================================
// JOBS / TASKS TRACKING
// ============================================================
import { DB, STAFF_NUM } from './state.js';
import { showToast } from './utils.js';
import { dispatch } from './engine.js'; // 🔥 Powered by the Central Sync Engine!

let jobFilter = 'Active';

const DAILY_CHECKPOINTS = [
  {key:'morning',   hour:8,  label:'Morning Brief',        hint:'Deliveries + Tasks + Opening Stock',        icon:'🌅', fn:'sendMorningBrief'},
  {key:'afternoon', hour:14, label:'Stock Report Request', hint:'Asks Nilesh to report stock, cash, leads',  icon:'📦', fn:'sendStockRequest'},
  {key:'evening',   hour:18, label:'Evening Summary',      hint:'Deliveries done, tasks status, collections', icon:'🌙', fn:'sendEveningReport'}
];

export function renderJobs() {
  const list = document.getElementById('job-list');
  if (!list) return;
  list.innerHTML = '';
  
  const todayStr = new Date().toLocaleDateString('en-CA');
  const jobs = (DB.jobs||[]).slice().reverse();
  let count = 0;
  
  jobs.forEach(j => {
    if (jobFilter==='Done' && j.status!=='Done') return;
    if (jobFilter==='Active' && j.status==='Done') return;
    count++;
    
    let statusBadge = '', rowClass = 'bg-white';
    const msg = encodeURIComponent("📋 Job: "+j.task);
    
    if (j.status==='Sent') {
      if (j.followUp > todayStr) { statusBadge = '<span class="text-[9px] text-slate-400 font-normal bg-slate-100 px-1.5 py-0.5 rounded ml-2">🕒 Waiting</span>'; rowClass = 'opacity-60 bg-slate-50 grayscale'; }
      else { statusBadge = '<span class="text-[9px] text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded ml-2 animate-pulse">🔥 DUE</span>'; rowClass = 'bg-white border-l-4 border-orange-400'; }
    }
    
    let buttons = '';
    if (jobFilter==='Active') {
      const jobIsDue = j.status==='Sent' && j.followUp <= todayStr;
      const fuBtn = jobIsDue ? `<button onclick="sendJobFollowUp('${j.id}')" class="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 border border-orange-200 flex items-center justify-center hover:bg-orange-100 transition active:scale-95 shadow-sm" title="Follow Up"><i data-feather="refresh-cw" class="w-4 h-4"></i></button>` : '';
      buttons = `<div class="flex gap-2 shrink-0 ml-2">${fuBtn}<button onclick="runJob('SENT','${j.id}','WA')" class="w-9 h-9 rounded-lg bg-green-50 text-green-600 border border-green-100 flex items-center justify-center hover:bg-green-100 transition active:scale-95 shadow-sm"><i data-feather="message-circle" class="w-4 h-4"></i></button><button onclick="runJob('SENT','${j.id}','SMS')" class="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center hover:bg-indigo-100 transition active:scale-95 shadow-sm"><i data-feather="message-square" class="w-4 h-4"></i></button><button onclick="runJob('DONE','${j.id}')" class="w-9 h-9 rounded-lg bg-slate-800 text-white border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition active:scale-95 shadow-sm"><i data-feather="check" class="w-4 h-4"></i></button></div>`;
    } else {
      buttons = `<div class="flex gap-2 shrink-0 ml-2"><button onclick="runJob('UNDO','${j.id}')" class="px-3 h-8 bg-white border border-slate-200 text-slate-500 rounded-lg text-[10px] font-bold hover:bg-slate-50 transition">↺ UNDO</button></div>`;
      statusBadge = '<span class="text-[9px] text-green-600 font-bold ml-2">✔ DONE</span>';
    }
    
    list.innerHTML += `<div class="p-3 ${rowClass} border-b border-slate-100 flex items-center justify-between transition-all duration-300"><div class="overflow-hidden min-w-0 flex-1"><div class="flex items-center flex-wrap"><span class="text-sm font-bold text-slate-800 truncate mr-1">${j.task}</span>${statusBadge}</div><div class="text-[10px] text-slate-400 font-medium truncate mt-0.5 flex items-center gap-1"><i data-feather="calendar" class="w-3 h-3"></i> ${j.date}</div></div>${buttons}<a id="lnk-wa-${j.id}" href="https://wa.me/91${STAFF_NUM}?text=${msg}" target="_blank" class="hidden"></a><a id="lnk-sms-${j.id}" href="sms:${STAFF_NUM}?body=${msg}" class="hidden"></a></div>`;
  });
  
  if (!count) list.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs italic">No ${jobFilter} jobs found.</div>`;
  try { feather.replace(); } catch(e){ console.warn('[feather]', e.message); }
  if (typeof updateSmartBadge === 'function') updateSmartBadge();
}

export function quickSend(msg) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = msg;
    if (typeof window.sendChat === 'function') window.sendChat();
  }
}

export function sjSendWA() {
  const m = sjBuildMsg(); if(!m) return;
  const ph=(document.getElementById('sj-ph').value||'').replace(/\D/g,'');
  window.open(ph?'https://wa.me/'+ph+'?text='+encodeURIComponent(m):'https://wa.me/?text='+encodeURIComponent(m),'_blank');
}

export function sjSendSMS() {
  const m = sjBuildMsg(); if(!m) return;
  const ph=(document.getElementById('sj-ph').value||'').replace(/\D/g,'');
  window.open('sms:'+(ph?'+'+ph:'')+'?body='+encodeURIComponent(m),'_blank');
}

function sjBuildMsg() {
  const p=(DB.jobs||[]).filter(j => j.status!=='Done');
  if(!p.length){alert('No active jobs!');return null;}
  return '📋 *Pending Work*\n\n'+p.map((j,i) => (i+1)+'. '+j.task+' ('+j.status+')').join('\n')+'\n\nPlease complete and confirm.\n– Anjani Water';
}

// 🔥 Engine-Powered Follow Ups
export function sendAllDueFollowUps() {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const dueJobs = (DB.jobs||[]).filter(j => j.status==='Sent' && j.followUp<=todayStr);
  
  if (!dueJobs.length) { showToast('No overdue tasks!'); return; }
  
  let msg = '🔁 *Follow Up — ' + dueJobs.length + ' Pending Tasks*\n\n';
  dueJobs.forEach((j,i) => { msg += (i+1)+'. '+j.task+'\n'; });
  msg += '\nNilesh, inn sab ka status batao.\n– Anjani Water';
  nileshWA(msg);
  
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA');
  
  dueJobs.forEach(j => { 
    dispatch('UPDATE_JOB', { id: j.id, updates: { followUp: tomorrowStr } });
  });
  
  renderJobs();
  if (typeof window._updateSmartBadge === 'function') window._updateSmartBadge();
}

export function updateSmartBadge() {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const dueCount = (DB.jobs||[]).filter(j => j.status==='Sent' && j.followUp<=todayStr).length;
  ['smart-badge-desk','smart-badge-mob'].forEach(elId => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (dueCount > 0) { el.textContent = dueCount; el.classList.remove('hidden'); }
    else { el.classList.add('hidden'); }
  });
  const bar = document.getElementById('due-followup-bar');
  if (bar) bar.classList.toggle('hidden', dueCount===0);
}

export function renderDailyStatus() {
  const list = document.getElementById('daily-status-list');
  if (!list) return;
  const now = new Date();
  const currentHour = now.getHours();
  let html = '';
  DAILY_CHECKPOINTS.forEach(cp => {
    const sent = isDailySent(cp.key);
    const isDue = currentHour >= cp.hour;
    const nextTime = new Date(); nextTime.setHours(cp.hour,0,0,0);
    if (nextTime <= now) nextTime.setDate(nextTime.getDate()+1);
    const diffMs = nextTime - now;
    const diffH = Math.floor(diffMs/3600000);
    const diffM = Math.floor((diffMs%3600000)/60000);
    const countdown = diffH>0 ? diffH+'h '+diffM+'m' : diffM+'m';
    
    let badge, rowClass, btnCls;
    if (sent) {
      badge = '<span class="text-[9px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-100">✅ Sent</span>';
      rowClass = 'opacity-70';
      btnCls = 'bg-slate-100 text-slate-400 hover:bg-slate-200';
    } else if (isDue) {
      badge = '<span class="text-[9px] text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100 animate-pulse">🔥 Due Now</span>';
      rowClass = 'border-l-4 border-orange-400 bg-orange-50/30';
      btnCls = 'bg-orange-500 text-white hover:bg-orange-600';
    } else {
      badge = '<span class="text-[9px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">⏳ in '+countdown+'</span>';
      rowClass = '';
      btnCls = 'bg-slate-800 text-white hover:bg-slate-700';
    }
    html += '<div class="p-3 '+rowClass+' flex items-center justify-between">'
          + '<div class="min-w-0 flex-1">'
          +   '<div class="flex items-center gap-2 flex-wrap"><span class="text-sm font-bold text-slate-800">'+cp.icon+' '+cp.label+'</span>'+badge+'</div>'
          +   '<div class="text-[10px] text-slate-400 mt-0.5">'+cp.hint+'</div>'
          + '</div>'
          + '<button onclick="triggerDailyCheckpoint(\''+cp.key+'\')" class="ml-3 px-3 py-1.5 '+btnCls+' rounded-lg text-[10px] font-bold transition shrink-0 active:scale-95">'+(sent?'Resend':'Send Now')+'</button>'
          + '</div>';
  });
  list.innerHTML = html;
  try { feather.replace(); } catch(e){ console.warn('[feather]', e.message); }
}

export function triggerDailyCheckpoint(key) {
  const cp = DAILY_CHECKPOINTS.find(c => c.key===key);
  if (!cp) return;
  const fnMap = { sendMorningBrief, sendStockRequest, sendEveningReport };
  if (fnMap[cp.fn]) fnMap[cp.fn]();
  markDailySent(key);
  renderDailyStatus();
}

export function filterJobs(status) {
  jobFilter = status;
  const btnActive = document.getElementById('tab-job-active');
  const btnDone = document.getElementById('tab-job-done');
  if (btnActive && btnDone) {
    btnActive.className = status==='Active' ? "px-3 py-1 text-[10px] font-bold rounded-md bg-blue-100 text-blue-700 transition" : "px-3 py-1 text-[10px] font-bold rounded-md text-slate-400 hover:bg-slate-50 transition";
    btnDone.className = status==='Done' ? "px-3 py-1 text-[10px] font-bold rounded-md bg-green-100 text-green-700 transition" : "px-3 py-1 text-[10px] font-bold rounded-md text-slate-400 hover:bg-slate-50 transition";
  }
  const inputArea = document.getElementById('job-input-area');
  if (inputArea) inputArea.style.display = status==='Active' ? 'flex' : 'none';
  renderJobs();
}

// 🔥 Engine-Powered Job Execution (Create, Sent, Done, Undo)
export function runJob(action, id, method) {
  if (action==='CREATE') {
    const input = document.getElementById('job-input');
    const text = input.value.trim();
    if (!text) return;
    
    const newJob = {
      id: "JOB-"+Date.now(), 
      task: text, 
      status: 'Pending', 
      date: new Date().toISOString().split('T')[0], 
      followUp: new Date().toISOString().split('T')[0]
    };
    
    input.value = '';
    dispatch('SAVE_JOB', newJob);
    renderJobs();
    return;
  }
  
  const job = DB.jobs && DB.jobs.find(x => String(x.id) === String(id));
  if (job) {
    let newStatus = job.status;
    
    if (action==='SENT') { 
      if(method==='WA') document.getElementById('lnk-wa-'+id).click(); 
      if(method==='SMS') document.getElementById('lnk-sms-'+id).click(); 
      newStatus = 'Sent'; 
    }
    else if (action==='DONE') newStatus = 'Done';
    else if (action==='UNDO') newStatus = 'Pending';
    
    dispatch('UPDATE_JOB', { id: id, updates: { status: newStatus } });
    renderJobs();
  }
}

// 🔥 Engine-Powered Individual Follow Up
export function sendJobFollowUp(id) {
  const job = (DB.jobs||[]).find(j => String(j.id) === String(id));
  if (!job) return;
  
  const msg = '🔁 *Follow Up — ' + job.task + '*\n\nNilesh, is kaam ka status kya hai? Kab tak hoga?\n– Anjani Water';
  nileshWA(msg);
  
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA');
  
  dispatch('UPDATE_JOB', { id: id, updates: { followUp: tomorrowStr, status: 'Sent' } });
  
  renderJobs();
  updateSmartBadge();
}

function nileshWA(msg) {
  window.open('https://wa.me/91'+STAFF_NUM+'?text='+encodeURIComponent(msg),'_blank');
}

function getDailyStorageKey(key) {
  const today = new Date().toLocaleDateString('en-CA');
  return 'anjani_daily_'+key+'_'+today;
}
function markDailySent(key) { localStorage.setItem(getDailyStorageKey(key), new Date().toISOString()); }
function isDailySent(key)   { return !!localStorage.getItem(getDailyStorageKey(key)); }

export function sendMorningBrief() {
  const today=new Date().toISOString().split('T')[0];
  const fmtDate=today.split('-').reverse().join('-');
  const deliveries=(DB.orders||[]).filter(o => o.deliveryDate===today && o.status==='Pending');
  const jobs=(DB.jobs||[]).filter(j => j.status!=='Done');
  let stock=0; (DB.stock||[]).forEach(s => { stock+=(Number(s.produced)||0)-(Number(s.delivered)||0); });
  
  let msg='🌅 *GOOD MORNING NILESH*\n📅 '+fmtDate+'\n\n';
  msg+='🚚 *DELIVERIES TODAY ('+deliveries.length+')*\n';
  deliveries.forEach((o,i) => { msg+=(i+1)+'. '+o.customer+' — '+o.boxes+' boxes\n   📍 '+(o.address||'No address')+'\n   🕐 '+(o.time||'Anytime')+'\n'; });
  if(!deliveries.length) msg+='No deliveries today\n';
  
  msg+='\n📋 *PENDING TASKS ('+jobs.length+')*\n';
  jobs.forEach((j,i) => { msg+=(i+1)+'. '+j.task+'\n'; });
  if(!jobs.length) msg+='No pending tasks\n';
  
  msg+='\n📦 *OPENING STOCK: '+stock+' units*\n\n✅ Reply when each delivery is done.\n– Anjani Water';
  nileshWA(msg);
}

export function sendStockRequest() {
  const today=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  const msg='📦 *STOCK REPORT REQUEST*\n📅 '+today+'\n\nNilesh, please reply with:\n\n1️⃣ Stock produced today: ___\n2️⃣ Boxes delivered today: ___\n3️⃣ Cash collected today: ₹___\n4️⃣ New leads met today: ___\n\nExample:\n_Produced: 200, Delivered: 150, Cash: 3500, Leads: 2_\n\n– Anjani Water App';
  nileshWA(msg);
}

export function sendEveningReport() {
  const today=new Date().toISOString().split('T')[0];
  const fmtDate=today.split('-').reverse().join('-');
  const delivered=(DB.orders||[]).filter(o => o.deliveryDate===today && o.status==='Delivered');
  const pending=(DB.orders||[]).filter(o => o.deliveryDate===today && o.status==='Pending');
  
  const boxes=delivered.reduce((s,o) => s+(Number(o.boxes)||0), 0);
  const revenue=delivered.reduce((s,o) => s+(Number(o.amount)||0), 0);
  const collected=(DB.payments||[]).filter(p => p.date===today).reduce((s,p) => s+(Number(p.amount)||0), 0);
  
  const doneJobs=(DB.jobs||[]).filter(j => j.status==='Done');
  const pendingJobs=(DB.jobs||[]).filter(j => j.status!=='Done');
  
  let msg='🌙 *EVENING REPORT — '+fmtDate+'*\n\n';
  msg+='✅ *DELIVERED: '+delivered.length+' orders | '+boxes+' boxes*\n';
  delivered.forEach(o => { msg+='  • '+o.customer+' — '+o.boxes+' boxes\n'; });
  if(pending.length){msg+='\n⚠️ *STILL PENDING: '+pending.length+'*\n'; pending.forEach(o => { msg+='  • '+o.customer+' — '+o.boxes+' boxes\n'; });}
  
  msg+='\n💰 *REVENUE TODAY: ₹'+revenue+'*\n💚 *CASH COLLECTED: ₹'+collected+'*\n\n📋 Tasks Done: '+doneJobs.length+' | Pending: '+pendingJobs.length+'\n';
  pendingJobs.forEach(j => { msg+='  • '+j.task+'\n'; });
  
  msg+='\nPlease reply with closing stock count.\n– Anjani Water';
  nileshWA(msg);
}

export function sendSmartBrief() {
  const hour=new Date().getHours();
  if(hour<12) sendMorningBrief();
  else if(hour<17) sendStockRequest();
  else sendEveningReport();
}
