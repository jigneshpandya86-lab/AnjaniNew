// ============================================================
// BROADCASTING & SMS
// ============================================================
import { DB, STAFF_NUM, CONFIG } from './state.js';
import { setText, showToast } from './utils.js';

let bcQueue = [], bcIndex = 0, bcTimer = null, bcInterval = null, audioCtx = null;
let smsQueue=[], smsTimerIdx=0, smsDailyCount=0, smsBatchActive=false, smsInterval=null;

export function renderSmartActions() {
  const list = document.getElementById('smart-list');
  if (!list) return;
  list.innerHTML = '';
  setText('smart-date', new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}));
  const today = new Date();
  const oneDay = 24*60*60*1000;
  let actions = [];
  (DB.customers||[]).forEach(c => {
    if (String(c.active)==='false') return;
    const bal = Number(c.outstanding) || 0;
let lastOrderDate = null, lastOrderQty = 0;
(DB.orders||[]).forEach(o => { if(String(o.clientId)===String(c.id) && o.status!=='Pending'){if(!lastOrderDate||o.deliveryDate>lastOrderDate){lastOrderDate=o.deliveryDate;lastOrderQty=o.boxes;}} });
    const lastPayNag = c.lastPayRemind ? new Date(c.lastPayRemind) : new Date('2000-01-01');
    const daysSincePayNag = (today-lastPayNag)/oneDay;
    if (lastOrderDate) {
      const daysSinceOrder = Math.round(Math.abs((today-new Date(lastOrderDate))/oneDay));
      if (bal > 2000 && daysSinceOrder > 5 && daysSincePayNag >= 3) {
        let template = "";
        if (daysSinceOrder > 30) template = (DB.smartMsgs||{})['Pay_Urgent'];
        else if (daysSinceOrder > 10) template = (DB.smartMsgs||{})['Pay_Firm'];
        else template = (DB.smartMsgs||{})['Pay_Polite'];
        if (!template) template = "Hello {name}, pending balance is ₹{amount}. Please pay.";
        const finalMsg = template.replace('{name}',c.name).replace('{amount}','₹'+bal);
        actions.push({type:'PAY', priority:1, client:c, bal:bal, days:daysSinceOrder, msg:finalMsg});
      }
    }
  });
  actions.sort((a,b) => a.priority-b.priority);
  window._latestSmartActions = actions;
  if (!actions.length) { list.innerHTML = '<div class="text-center p-10"><div class="text-4xl mb-2">🎉</div><div class="text-slate-400 font-bold">All caught up!<br>No pending calls for today.</div></div>'; }
  actions.forEach(a => {
    const sub = `• ₹${a.bal} (${a.days}d ago)`;
    const encodedMsg = encodeURIComponent(a.msg);
    const waAction = `window.open('https://wa.me/91${a.client.mobile}?text=${encodedMsg}', '_blank'); recordAction('${a.client.id}', '${a.type}', this)`;
    const callAction = `window.location.href='tel:${a.client.mobile}'; recordAction('${a.client.id}', '${a.type}', this)`;
    list.innerHTML += `<div class="bg-white p-3 rounded-xl shadow-sm border-l-4 border-red-500 bg-red-50 border-y border-r border-slate-200 flex items-center justify-between gap-2 mb-2 transition-all"><div class="overflow-hidden min-w-0"><div class="flex items-baseline gap-1 truncate"><span class="font-bold text-sm text-slate-800">${a.client.name}</span><span class="text-xs text-slate-500 font-medium truncate">${sub}</span></div><div class="text-[9px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1 mt-0.5"><i data-feather="alert-circle" class="w-3 h-3"></i> Payment</div></div><div class="flex gap-2 shrink-0"><button onclick="${waAction}" class="w-9 h-9 rounded-lg bg-green-50 text-green-600 border border-green-100 flex items-center justify-center hover:bg-green-100 transition active:scale-95 shadow-sm"><i data-feather="message-circle" class="w-4 h-4"></i></button><button onclick="${callAction}" class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center hover:bg-blue-100 transition active:scale-95 shadow-sm"><i data-feather="phone" class="w-4 h-4"></i></button></div></div>`;
  });
  feather.replace();
}

export function startSmartBroadcast() {
  bcQueue = [];
  const today = new Date(), oneDay = 24*60*60*1000;
  const latestSmartActions = window._latestSmartActions || [];
  if (latestSmartActions.length > 0) {
    latestSmartActions.forEach(a => bcQueue.push({id:a.client.id, name:a.client.name, mobile:a.client.mobile, customMsg:a.msg, type:'SMART_ACTION'}));
  }
  (DB.jobs||[]).forEach(j => { if(j.status==='Pending') bcQueue.push({id:j.id, name:"Task: "+j.task, mobile:STAFF_NUM, customMsg:`Nilesh, ${j.task} karje.`, type:'STAFF_JOB'}); });
  const sortedLeads = (DB.leads||[]).slice().reverse();
  sortedLeads.forEach(l => {
    const lastDate = l.lastContact ? new Date(l.lastContact) : new Date('2000-01-01');
    const diff = Math.round((today-lastDate)/oneDay);
    if (l.status!=='New' && diff<2) return;
    let msg = "";
    if (l.status==='New') msg = "🙏 Jay Shree Krishna!\n\n*Anjani Water* tরফthI contact kari raha chhe 💧\n\nAame provide kariye chhe *200mL Packaged Drinking Water Bottles* — ISI Certified, Bulk Supply!\n\n🎪 Events | 🏢 Offices | 💒 Weddings | 🍽️ Caterers | 🏬 Showrooms\n\n📦 Bulk Orders — Best Price\n🚚 On-Time Delivery Guaranteed\n\n*\"YES\"* reply karo — FREE Sample mokalshu!\n\n– Anjani Water 💙";
    else if (l.status==='Sam' && diff>=2) msg = "🙏 Jay Shree Krishna!\n\nAnjani Water — *200mL Bottle* no bulk order ready chhe?\n\n🎪 Events / 🏢 Offices / 💒 Weddings maate best rates!\n\nRate list maate reply karo. – Anjani Water 💧";
    else if ((l.status==='Waiting'||l.status==='Con') && diff>=5) msg = "🙏 Jay Shree Krishna!\n\nAnjani Water thi yaad kariye chhe 💧\n\n*200mL Packaged Water* — aapna next event / function maate order ready chhe?\n\nAaj j confirm karo — on-time delivery guaranteed! – Anjani Water";
    if (msg) bcQueue.push({id:l.id, name:"Lead: "+l.mobile, mobile:l.mobile, customMsg:msg, type:'LEAD_NUDGE'});
  });
  if (!bcQueue.length) return alert("✅ No pending tasks!");
  initBroadcast();
}

export function startBroadcast() {
  bcQueue = [];
  (DB.customers||[]).forEach(c => {
    let bal = 0;
    (DB.orders||[]).forEach(o => { if(String(o.clientId)===String(c.id) && o.status!=='Pending') bal += +o.amount; });
    (DB.payments||[]).forEach(p => { if(String(p.clientId)===String(c.id)) bal -= +p.amount; });
    if (bal > 0) bcQueue.push({id:c.id, name:c.name, mobile:c.mobile, balance:bal, type:'DUES'});
  });
  if (!bcQueue.length) return alert("✅ No customers with pending dues found!");
  initBroadcast();
}

export function startLeadOnlyBroadcast() {
  bcQueue = [];
  const todayStr = new Date().toISOString().split('T')[0];
  (DB.leads||[]).slice().sort((a,b)=>{const dA=a.lastContact||'2000-01-01';const dB=b.lastContact||'2000-01-01';return dB!==dA?dB.localeCompare(dA):(parseInt(String(b.id).replace(/\D/g,''))||0)-(parseInt(String(a.id).replace(/\D/g,''))||0);}).forEach(l => {
    if (l.status==='Archived'||l.status==='Converted') return;
    const nextContactStr = String(l.nextContact||'');
    if (nextContactStr.startsWith("Done:")) return;
    if (nextContactStr.length > 5) {
      let finalMsg = nextContactStr;
      if (finalMsg.includes(":")) finalMsg = finalMsg.split(":")[1].trim();
      bcQueue.push({id:l.id, name:"Lead: "+l.mobile, mobile:l.mobile, customMsg:finalMsg, type:'LEAD_NUDGE'});
    }
  });
  if (!bcQueue.length) return alert("✅ No pending leads found!\n(Check 'Next Followup' column)");
  initBroadcast();
}

export function initBroadcast() { setText('bc-modal-count', bcQueue.length); document.getElementById('modal-broadcast-confirm').classList.remove('hidden'); }

export function confirmBroadcastStart() {
  if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if (audioCtx.state==='suspended') audioCtx.resume();
  document.getElementById('modal-broadcast-confirm').classList.add('hidden');
  bcIndex = 0;
  document.getElementById('broadcast-overlay').classList.remove('hidden');
  processBroadcastStep();
}

export function processBroadcastStep() {
  if (bcIndex >= bcQueue.length) { stopBroadcast(); alert("✅ Broadcast Complete!"); return; }
  playBeep();
  const c = bcQueue[bcIndex];
  setText('bc-name', c.name);
  setText('bc-count', (bcIndex+1)+"/"+bcQueue.length);
  let msg = c.customMsg || "";
  if (!msg && c.type==='DUES') { const hour = new Date().getHours(); const greet = hour<12?'Good Morning':hour<17?'Good Afternoon':'Good Evening'; msg = `${greet} ${c.name}, your total outstanding is ₹${c.balance}. Please pay at your earliest convenience.`; }
  if (c.mobile && c.mobile.length > 9) {
    if (c.type==='LEAD_NUDGE') { google.script.run.logLeadBroadcast(c.id); const ll=DB.leads.find(x=>x.id===c.id); if(ll) ll.lastContact=new Date().toISOString().split('T')[0]; }
    if (c.type==='STAFF_JOB') { google.script.run.saveJob({action:'SENT', id:c.id}); const lj=(DB.jobs||[]).find(j=>j.id===c.id); if(lj) lj.status='Sent'; }
    if (c.type==='SMART_ACTION') google.script.run.logSmartAction(c.id, 'BROADCAST', null);
    window.open("https://wa.me/91"+c.mobile+"?text="+encodeURIComponent(msg), "_blank");
  }
  bcIndex++;
  if (bcIndex < bcQueue.length) startCountdown(30);
  else stopBroadcast();
}

export function startCountdown(seconds) {
  let timeLeft = seconds;
  const timerEl = document.getElementById('bc-timer');
  const barEl = document.getElementById('bc-bar');
  if (timerEl) timerEl.innerText = timeLeft;
  if (barEl) barEl.style.width = '100%';
  if (bcTimer) clearTimeout(bcTimer);
  if (bcInterval) clearInterval(bcInterval);
  bcTimer = setTimeout(processBroadcastStep, seconds*1000);
  bcInterval = setInterval(() => { timeLeft--; if(timerEl) timerEl.innerText = timeLeft; if(barEl) barEl.style.width = ((timeLeft/seconds)*100)+'%'; if(timeLeft<=0) clearInterval(bcInterval); }, 1000);
}

export function stopBroadcast() { if(bcTimer) clearTimeout(bcTimer); if(bcInterval) clearInterval(bcInterval); document.getElementById('broadcast-overlay').classList.add('hidden'); }

export function playBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'triangle'; osc.frequency.value = 880;
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.5);
    osc.start(now); osc.stop(now+0.5);
  } catch(e){ console.debug('[audio]', e.message); }
}

export function renderSmsCandidates() {
  const list = document.getElementById('sms-candidate-list');
  list.classList.remove('hidden');
  list.innerHTML = '<div class="text-center p-6 text-xs text-slate-500">Analyzing...</div>';
  google.script.run.withSuccessHandler((res) => {
    const data = JSON.parse(res);
    const candidates = data.candidates;
    list.innerHTML = '';
    if (!candidates || !candidates.length) { list.innerHTML = '<div class="text-center p-4 text-xs text-slate-500">✅ All Clear!</div>'; return; }
    candidates.sort((a,b) => b.age-a.age);
    smsQueue = candidates;
    candidates.forEach(c => {
      let badgeClass = "text-gray-400 border-gray-600", typeName = c.type;
      if (c.type==='DUE') { badgeClass="text-red-400 border-red-900"; if(c.age>30) typeName="URGENT"; else typeName="Payment"; }
      else if (c.type==='WAKE') { badgeClass="text-blue-400 border-blue-900"; typeName="Wake Up"; }
      else if (c.type==='LEAD') { badgeClass="text-green-400 border-green-900"; typeName="Lead"; }
      list.innerHTML += `<div class="p-2.5 flex justify-between items-center hover:bg-slate-700/50 transition group border-b border-slate-700/50"><div class="min-w-0"><div class="font-bold text-xs truncate text-slate-200 flex items-center gap-2">${c.name}<span class="text-[9px] font-mono text-slate-500 bg-black/20 px-1 rounded">₹${c.bal}</span></div><div class="text-[9px] text-slate-500 font-mono flex items-center gap-1"><i data-feather="clock" class="w-2 h-2"></i> ${c.age} days</div></div><div class="text-[9px] font-bold ${badgeClass} bg-slate-900/50 px-2 py-1 rounded border">${typeName}</div></div>`;
    });
    feather.replace();
  }).getSmsCandidates();
}

export function startSmsBatch() {
  if (!smsQueue.length) return alert("⚠️ Please Load Candidates First!");
  if (!confirm(`⚠️ Start sending to ${smsQueue.length} customers?\n• Speed: 1 msg every ${CONFIG.SMS_INTERVAL_SECONDS}s\n• Limit: Stops at ${CONFIG.SMS_DAILY_LIMIT}`)) return;
  document.getElementById('sms-status-bar').classList.remove('hidden');
  const btn = document.getElementById('btn-sms-run');
  btn.onclick = stopSmsBatch; btn.classList.remove('bg-blue-600','hover:bg-blue-500'); btn.classList.add('bg-red-600','hover:bg-red-500','animate-pulse');
  btn.innerHTML = '<i data-feather="square" class="w-3 h-3 fill-current"></i> STOP BATCH'; feather.replace();
  smsBatchActive = true; smsTimerIdx = 0; processSmsQueue();
}

export function stopSmsBatch() {
  smsBatchActive = false;
  if (smsInterval) clearInterval(smsInterval);
  const bar = document.getElementById('sms-progress');
  if (bar) { bar.style.transition='none'; bar.style.width='0%'; }
  setText('sms-timer', "Stopped");
  logSms("🛑 Batch Stopped by User."); resetSmsButton();
}

export function resetSmsButton() {
  const btn = document.getElementById('btn-sms-run');
  btn.disabled = false; btn.onclick = startSmsBatch;
  btn.classList.remove('bg-red-600','hover:bg-red-500','animate-pulse'); btn.classList.add('bg-blue-600','hover:bg-blue-500');
  btn.innerHTML = '<i data-feather="play" class="w-3 h-3"></i> RESUME BATCH'; feather.replace();
}

export function processSmsQueue() {
  if (!smsBatchActive) return;
  if (smsTimerIdx >= smsQueue.length) { finishSmsBatch("✅ Queue Finished."); return; }
  if (smsDailyCount >= CONFIG.SMS_DAILY_LIMIT) { finishSmsBatch(`🛑 Daily Limit (${CONFIG.SMS_DAILY_LIMIT}) Reached.`); return; }
  const c = smsQueue[smsTimerIdx];
  let msgType = c.type==='DUE' ? (c.age>30?'Pay_Urgent':c.age>10?'Pay_Firm':'Pay_Polite') : c.type==='WAKE' ? 'Wake_Up' : (c.stage||'Lead_Day3');
  logSms(`Sending to ${c.name}...`);
  let rawMsg = (DB.smartMsgs&&DB.smartMsgs[msgType]) ? DB.smartMsgs[msgType] : "Hello {name}, checking in from Anjani Water.";
  const finalMsg = rawMsg.replace('{name}',c.name).replace('{amount}',c.bal).replace('{days}',c.days||'');
  google.script.run.withSuccessHandler((res) => {
    if (res==='SENT') { logSms(`✅ Sent: ${c.name}`); smsDailyCount++; setText('sms-quota', smsDailyCount+"/"+CONFIG.SMS_DAILY_LIMIT); google.script.run.logSmsSuccess(c.id, c.type); }
    else logSms(`❌ Fail: ${res}`);
  }).sendBackgroundSms(c.mobile, finalMsg);
  smsTimerIdx++;
  if (smsTimerIdx < smsQueue.length) startSmsTimer(CONFIG.SMS_INTERVAL_SECONDS);
  else finishSmsBatch("🏁 All Done.");
}

export function startSmsTimer(seconds) {
  if (!smsBatchActive) return;
  let timeLeft = seconds;
  const bar = document.getElementById('sms-progress'); const txt = document.getElementById('sms-timer');
  if (bar) { bar.style.transition='none'; bar.style.width='0%'; }
  setTimeout(() => { if(!smsBatchActive) return; if(bar){bar.style.transition=`width ${seconds}s linear`; bar.style.width='100%';} }, 100);
  if (smsInterval) clearInterval(smsInterval);
  smsInterval = setInterval(() => {
    if (!smsBatchActive) { clearInterval(smsInterval); return; }
    timeLeft--; if(txt) txt.innerText = `Next: ${timeLeft}s`;
    if (timeLeft <= 0) { clearInterval(smsInterval); processSmsQueue(); }
  }, 1000);
}

function finishSmsBatch(status) { smsBatchActive = false; logSms(status); resetSmsButton(); const btn=document.getElementById('btn-sms-run'); btn.innerHTML='<i data-feather="check"></i> DONE'; feather.replace(); alert(status); }
function logSms(msg) { const el=document.getElementById('sms-console'); if(el){const time=new Date().toLocaleTimeString().split(' ')[0]; const row=document.createElement('div'); row.className='border-l-2 border-slate-600 pl-2 mb-1'; const ts=document.createElement('span'); ts.className='text-slate-500'; ts.textContent='['+time+'] '; row.appendChild(ts); row.appendChild(document.createTextNode(msg)); el.appendChild(row); el.scrollTop=el.scrollHeight;} }

export function recordAction(id, type, btn) {
  const card = btn.closest('div.shadow-sm');
  if (card) { card.style.opacity = '0.5'; card.style.pointerEvents = 'none'; }
  google.script.run.withSuccessHandler(() => { if(card) card.remove(); if(document.getElementById('smart-list').children.length===0) renderSmartActions(); }).logSmartAction(id, type);
}
