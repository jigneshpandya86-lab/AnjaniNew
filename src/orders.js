export function placeOrder(e) {
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
    mapLink:      document.getElementById('maps-link-hidden').value || '',
    address:      document.getElementById('ord-addr').value || '',
    boxes:        safeQty,
    sku:          document.getElementById('ord-sku').value || '200ml',
    rate:         safeRate,
    amount:       (safeQty * safeRate) || 0,
    deliveryDate: document.getElementById('ord-date').value || new Date().toISOString().split('T')[0],
    time:         document.getElementById('ord-time').value || '09:00',
    staff:        document.getElementById('ord-staff').value || 'Nilesh',
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

  // ── ONLINE path ───────────────────────────────────────────
  btn.disabled = true;
  btn.innerText = "SAVING...";

  google.script.run
    .withSuccessHandler((res) => {
      // Handle Firebase returning a string or an object safely
      const r = typeof res === 'string' ? JSON.parse(res) : res; 
      window._highlightID = r && r.id ? r.id : data.id;
      
      if (typeof window._loadData === 'function') window._loadData();
      e.target.reset();
      document.getElementById('ord-date').value = new Date().toISOString().split('T')[0];
      btn.disabled = false;
      btn.innerText = "CONFIRM ORDER";
    })
    .withFailureHandler((err) => {
      console.error("Firebase Save Error:", err); 
      btn.disabled = false;
      btn.innerText = "CONFIRM ORDER";
      showToast('❌ Save failed — saved offline instead', true);
      data._offline = true;
      DB.orders.push(data);
      if (typeof render === 'function') render();
      enqueueAction('saveOrder', data);
    })
    .saveOrder(data);
}

export function doDel(id) {
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

  // ── ONLINE path ───────────────────────────────────────────
  if (btn) btn.innerText = "SAVING...";
  google.script.run
    .withSuccessHandler(() => { if (typeof window._loadData === 'function') window._loadData(); })
    .withFailureHandler((err) => {
      if (btn) btn.innerText = "DELIVER →";
      // Fallback to offline
      const o = DB.orders.find(x => String(x.id) === String(id));
      if (o) { o.status = 'Delivered'; o._offline = true; }
      if (typeof render === 'function') render();
      enqueueAction('updateOrderStatus', { id, status: 'Delivered', qty, date, time, address });
      showOfflineToast('✅ Saved offline — will sync on reconnect');
    })
    .updateOrderStatus(id, "Delivered", qty, date, time, address);
}
