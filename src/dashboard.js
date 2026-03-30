// ============================================================
// DASHBOARD
// ============================================================
import { DB } from './state.js';

function computeDashboardData() {
  const { customers=[], orders=[], payments=[], stock=[] } = DB;
  const today      = new Date().toISOString().split('T')[0];
  const weekAgo    = new Date(Date.now()-7*864e5).toISOString().split('T')[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const pm = from => {
    const o = orders.filter(o => o.status!=='Pending' && o.deliveryDate>=from);
    const p = payments.filter(p => p.date>=from);
    return { orders:o.length, box:o.reduce((s,x)=>s+(+x.boxes||0),0), rev:o.reduce((s,x)=>s+(+x.amount||0),0), col:p.reduce((s,x)=>s+(+x.amount||0),0) };
  };

  return {
    TODAY:  { ...pm(today), prod: stock.filter(s=>s.date===today).reduce((s,r)=>s+(+r.produced||0),0) },
    WEEK:   pm(weekAgo),
    MONTH:  pm(monthStart),
    STATUS: { pending:orders.filter(o=>o.status==='Pending').length, outstanding:customers.reduce((s,c)=>s+(+c.outstanding||0),0), stock:stock.reduce((s,r)=>s+(+r.produced||0)-(+r.delivered||0),0) },
    DUES:   customers.filter(c=>String(c.active)!=='false' && +c.outstanding>0).map(c=>({id:c.id,name:c.name,bal:+c.outstanding,mobile:c.mobile})).sort((a,b)=>b.bal-a.bal),
  };
}

export function setDashPeriod(p) {
  window._dashPeriod = p;
  ['TODAY','WEEK','MONTH'].forEach(x => {
    const btn = document.getElementById('db-'+x);
    if (btn) btn.className = (x===p) ? "px-4 py-2 text-[10px] font-black rounded-lg bg-slate-900 text-white transition-all shadow-md" : "px-4 py-2 text-[10px] font-black rounded-lg text-slate-500 hover:bg-slate-50 transition-all";
  });
  renderDashboard();
}

export function renderDashboard() {
  renderDashboardFromData(computeDashboardData());
}

export function renderDashboardFromData(data) {
  const el = document.getElementById('kpi-grid');
  if (!el) return;

  const period = (window._dashPeriod || 'MONTH');
  const pData = data[period];
  const sData = data.STATUS;
  if (!pData) return;

  const periodLabel = { TODAY: 'Today', WEEK: 'This Week', MONTH: 'This Month' }[period] || period;

  el.innerHTML = '';
  const cards = [
    { label: `Total Orders (${periodLabel})`,    val: pData.orders,                                         color: 'text-slate-900' },
    { label: `Boxes Delivered (${periodLabel})`, val: pData.box,                                            color: 'text-blue-600' },
    { label: 'Pending Orders',                   val: sData.pending,                                        color: 'text-orange-500' },
    { label: `Revenue (${periodLabel})`,         val: '₹' + Number(pData.rev).toLocaleString(),             color: 'text-slate-900' },
    { label: `Collection (${periodLabel})`,      val: '₹' + Number(pData.col).toLocaleString(),             color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
    { label: 'Total Market Outstanding',         val: '₹' + Math.round(sData.outstanding).toLocaleString(), color: 'text-red-600',    bg: 'bg-red-50 border-red-100' },
  ];
  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = "kpi-card p-5 rounded-2xl border shadow-sm " + (c.bg || 'bg-white border-slate-200');
    div.innerHTML = `<div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">${c.label}</div><div class="text-2xl font-black ${c.color}">${c.val}</div>`;
    el.appendChild(div);
  });

  // Stock alert banner
  const netStock = sData.stock - sData.pending;
  const alertBox = document.getElementById('stock-alert-container');
  if (alertBox) alertBox.classList.toggle('hidden', netStock >= 1000);

  // Stock flow panel
  const stkOpen = document.getElementById('dash-stk-open');
  if (stkOpen) {
    stkOpen.innerText = sData.stock;
    document.getElementById('dash-stk-prod').innerText = data.TODAY.prod || 0;
    document.getElementById('dash-stk-del').innerText  = data.TODAY.box  || 0;

    const skuNames = { '200ml':'💧 200ml', '500ml':'💧 500ml', '1L':'💧 1L', 'cd':'🥤 Cold Drink' };
    const skuTotals = {};
    (DB.stock||[]).forEach(s => { const k=s.sku||'200ml'; skuTotals[k]=(skuTotals[k]||0)+(+s.produced||0)-(+s.delivered||0); });
    const skuContainer = document.getElementById('dash-sku-breakdown');
    if (skuContainer) skuContainer.innerHTML = Object.entries(skuTotals).map(([k,v]) =>
      `<div class="flex justify-between text-xs py-1 border-t border-slate-100"><span class="text-slate-500">${skuNames[k]||k}</span><span class="font-bold ${v<100?'text-red-500':'text-slate-700'}">${v} units</span></div>`
    ).join('');

    const badge = document.getElementById('dash-stk-status');
    if (badge) {
      badge.innerText  = netStock < 1000 ? 'LOW STOCK' : 'HEALTHY';
      badge.className  = netStock < 1000
        ? 'px-3 py-1 bg-red-100 text-red-600 rounded-full text-[10px] font-bold border border-red-200'
        : 'px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-200';
    }
  }

  feather.replace();
  renderExecutiveDues(data.DUES);
}

export function renderExecutiveDues(duesList) {
  const listDiv = document.getElementById('dash-drilldown');
  if (!listDiv) return;
  if (!duesList || !duesList.length) { listDiv.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm">No Outstanding Dues! 🎉</div>'; return; }
  listDiv.innerHTML = '';
  duesList.forEach(c => {
    const isHigh = c.bal > 50000, isMed = c.bal > 20000;
    const msg = `Hello ${c.name}, your outstanding is ₹${c.bal}. Please clear it.`;
    const div = document.createElement('div');
    div.className = "p-4 flex justify-between items-center hover:bg-slate-50 transition-colors " + (isHigh ? 'border-critical' : isMed ? 'border-warning' : 'border-l-4 border-transparent');
    div.innerHTML = `<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">${c.name.charAt(0)}</div><div><div class="font-bold text-sm text-slate-800">${c.name}</div><div class="text-[10px] text-slate-400 font-mono">ID: ${c.id}</div></div></div><div class="flex items-center gap-4"><div class="text-right"><div class="font-black text-sm text-slate-800">₹${Number(c.bal).toLocaleString()}</div><div class="text-[9px] font-bold ${isHigh?'text-red-500':'text-slate-400'}">${isHigh?'CRITICAL':'Due'}</div></div><a href="https://wa.me/91${c.mobile}?text=${encodeURIComponent(msg)}" target="_blank" class="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-green-50 hover:text-green-600 flex items-center justify-center transition-all shadow-sm border border-slate-100"><i data-feather="message-circle" class="w-4 h-4"></i></a></div>`;
    listDiv.appendChild(div);
  });
  feather.replace();
}

export function toggleFilter(isToday) {
  window._showTodayOnly = isToday;
  const filterToday = document.getElementById('filter-today');
  const filterAll = document.getElementById('filter-all');
  if (filterToday) filterToday.className = isToday ? "px-3 py-1 text-xs font-bold rounded-md bg-blue-100 text-blue-700" : "px-3 py-1 text-xs font-bold rounded-md text-slate-500";
  if (filterAll) filterAll.className = !isToday ? "px-3 py-1 text-xs font-bold rounded-md bg-blue-100 text-blue-700" : "px-3 py-1 text-xs font-bold rounded-md text-slate-500";
  if (typeof window._render === 'function') window._render();
}

export function toggleSort() {
  window._sortMode = (window._sortMode === 'TASK') ? 'TIME' : 'TASK';
  const btn = document.getElementById('btn-sort');
  if (btn) {
    btn.innerHTML = window._sortMode === 'TASK' ? '<i data-feather="check-square" class="w-4 h-4 text-blue-600"></i>' : '<i data-feather="clock" class="w-4 h-4 text-slate-500"></i>';
    btn.className = window._sortMode === 'TASK' ? "w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shadow-sm active:scale-95 transition" : "w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm active:scale-95 transition";
  }
  feather.replace();
  if (typeof window._render === 'function') window._render();
}
