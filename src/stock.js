// ============================================================
// STOCK MANAGEMENT
// ============================================================
import { DB } from './state.js';
import { setText, showToast } from './utils.js';
import { enqueueAction, showOfflineToast } from './sync.js';

export function renderStockPage() {
  const todayStr = new Date().toISOString().split('T')[0];
const skuTotals = { '200ml':0, '500ml':0, '1L':0, 'cd':0 };
let netStock = 0, allTimeProd = 0, todayProd = 0, todayDel = 0;

// Step 1: Add all production per SKU (ignore old 'delivered' field on stock rows)
// Single source of truth: DB.stock produced & delivered columns only
(DB.stock || []).forEach(function(s) {
  const prod = Number(s.produced) || 0;
  const del  = Number(s.delivered) || 0;
  const sku  = s.sku || '200ml';
  skuTotals[sku] = (skuTotals[sku] || 0) + prod - del;
  allTimeProd += prod;
  if (s.date === todayStr) { todayProd += prod; todayDel += del; }
});

// Net stock = sum of all SKU balances
netStock = Object.values(skuTotals).reduce((a, b) => a + b, 0);

  // Update KPIs
  setText('stat-stock', netStock);
  const skuNames = { '200ml':'💧 200ml', '500ml':'💧 500ml', '1L':'💧 1L', 'cd':'🥤 Cold Drink' };
const skuEl = document.getElementById('sku-stock-breakdown');
if (skuEl) {
  skuEl.innerHTML = Object.entries(skuTotals).map(([k,v]) =>
    `<div class="flex justify-between text-xs font-bold py-1 border-b border-slate-100">
       <span class="text-slate-500">${skuNames[k]}</span>
       <span class="${v < 100 ? 'text-red-500' : 'text-slate-700'}">${v} units</span>
     </div>`
  ).join('');
}
  setText('stat-today-prod', todayProd);
  setText('stat-today-del', todayDel);

  // Stock Level Bar
  const maxStock = Math.max(allTimeProd * 0.1, 1000); // 10% of all-time as "full"
  const pct = Math.min((netStock / maxStock) * 100, 100);
  const bar = document.getElementById('stock-bar');
  const label = document.getElementById('stock-level-label');
  const barMax = document.getElementById('stock-bar-max');
  if (bar) {
    bar.style.width = pct + '%';
    if (netStock < 500) {
      bar.className = 'stock-bar-fill h-full rounded-full bg-red-500 pulse-red';
      if (label) { label.innerText = '🔴 LOW STOCK'; label.className = 'text-xs font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full'; }
    } else if (netStock < 1500) {
      bar.className = 'stock-bar-fill h-full rounded-full bg-orange-400';
      if (label) { label.innerText = '🟡 MODERATE'; label.className = 'text-xs font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full'; }
    } else {
      bar.className = 'stock-bar-fill h-full rounded-full bg-emerald-500';
      if (label) { label.innerText = '🟢 HEALTHY'; label.className = 'text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full'; }
    }
  }
  if (barMax) barMax.innerText = Math.round(maxStock);

  // History list (last 15)
  const slist = document.getElementById('list-stock');
  if (slist) {
    const recent = (DB.stock || []).slice().sort((a, b) => {
      // Helper: If date is DD-MM-YYYY, flip it to YYYY-MM-DD so it sorts correctly
      const format = (d) => (d && d.indexOf('-') === 2) ? d.split('-').reverse().join('-') : (d || '');
      
      // Sort descending (Newest first)
      return format(b.date).localeCompare(format(a.date));
    }).slice(0, 15);
    
    if (recent.length === 0) {
      slist.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs">No stock records yet</div>';
      return;
    }
    slist.innerHTML = recent.map(function(s) {
      const isProd = Number(s.produced) > 0;
      const val = isProd ? '+' + s.produced : '-' + s.delivered;
      const color = isProd ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50';
      const icon = isProd ? '🏭' : '🚚';
      const desc = s.customer ? esc(s.customer) : (isProd ? 'Production' : 'Delivery');
      const isToday = s.date === todayStr;
      return `<div class="p-3 flex justify-between items-center hover:bg-slate-50 ${isToday ? 'bg-blue-50/30' : ''}">
        <div class="flex items-center gap-2">
          <span class="text-base">${icon}</span>
          <div>
            <div class="text-xs font-bold text-slate-700">${esc(s.date)} ${isToday ? '<span class="text-[9px] text-blue-500 font-bold">TODAY</span>' : ''}</div>
            <div class="text-[10px] text-slate-400 font-medium">${desc}</div>
          </div>
        </div>
        <span class="font-black text-sm px-2 py-1 rounded-lg ${color}">${esc(val)}</span>
      </div>`;
    }).join('');
  }
}

// 🆕 Quick stock preset buttons
export function setStockQty(n) {
  const inp = document.getElementById('prod-val');
  if (inp) inp.value = n;
}

export function saveStock() {
  const qty = document.getElementById('prod-val').value;
  if (!qty || qty <= 0) return;
  const sku     = document.getElementById('prod-sku').value || '200ml';
  const prodData = { qty: qty, sku: sku };

  // ── OFFLINE path ──────────────────────────────────────────
  if (!navigator.onLine) {
    DB.stock.push({
      date:     new Date().toISOString().split('T')[0],
      produced: qty, delivered: 0, sku: sku, _offline: true
    });
    renderStockPage();
    document.getElementById('prod-val').value = '';
    enqueueAction('saveProduction', prodData);
    showOfflineToast('📦 Stock +' + qty + ' (' + sku + ') saved offline');
    return;
  }

  // ── ONLINE path ───────────────────────────────────────────
  google.script.run
    .withSuccessHandler(() => {
      if (typeof window._loadData === 'function') window._loadData();
      document.getElementById('prod-val').value = '';
      showToast('✅ ' + qty + ' units added to stock!');
    })
    .withFailureHandler(() => {
      // Fallback offline
      DB.stock.push({ date: new Date().toISOString().split('T')[0], produced: qty, delivered: 0, sku, _offline: true });
      renderStockPage();
      document.getElementById('prod-val').value = '';
      enqueueAction('saveProduction', prodData);
      showOfflineToast('📦 Stock saved offline — will sync later');
    })
    .saveProduction(prodData);
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
