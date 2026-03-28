/**
 * Anjani Water — Google Sheets → Firestore Migration Script
 * ──────────────────────────────────────────────────────────
 *
 * SETUP (one-time):
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *      → Generate new private key → save as  migrate/serviceAccountKey.json
 *   2. cd migrate && npm install
 *
 * USAGE — run one collection at a time:
 *   node migrate.js customers  customers.csv
 *   node migrate.js orders     orders.csv
 *   node migrate.js payments   payments.csv
 *   node migrate.js stock      stock.csv
 *   node migrate.js leads      leads.csv
 *
 * CSV FORMAT — export each Google Sheet tab as CSV:
 *   File → Download → Comma-separated values (.csv)
 *   First row must be column headers (column names don't need to match exactly —
 *   the COLUMN_MAP below handles the mapping).
 *
 * COLUMN MAPS — edit these to match your actual Google Sheet column headers:
 */

import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import admin from 'firebase-admin';

// ── Firebase init ─────────────────────────────────────────────────────────────
const KEY_FILE = new URL('./serviceAccountKey.json', import.meta.url).pathname;
if (!existsSync(KEY_FILE)) {
  console.error('\n❌  serviceAccountKey.json not found in migrate/');
  console.error('   Go to Firebase Console → Project Settings → Service Accounts → Generate new private key\n');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Column maps — left = your Google Sheet header, right = Firestore field ────
// Edit these to match your actual sheet column names.
const COLUMN_MAP = {
  customers: {
    // Sheet column  →  Firestore field
    'ID':           'id',
    'Name':         'name',
    'Mobile':       'mobile',
    'Rate':         'rate',
    'Address':      'address',
    'Active':       'active',
    'Outstanding':  'outstanding',
    'Notes':        'notes',
    // common aliases
    'Customer Name':'name',
    'Phone':        'mobile',
    'Phone Number': 'mobile',
    'Price':        'rate',
    'Balance':      'outstanding',
  },
  orders: {
    'ID':             'id',
    'Order ID':       'id',
    'Client ID':      'clientId',
    'Customer':       'customer',
    'Mobile':         'mobile',
    'Phone':          'mobile',
    'Address':        'address',
    'Boxes':          'boxes',
    'Qty':            'boxes',
    'SKU':            'sku',
    'Amount':         'amount',
    'Rate':           'rate',
    'Delivery Date':  'deliveryDate',
    'Order Date':     'orderDate',
    'Status':         'status',
    'Time':           'time',
    'Staff':          'staff',
  },
  payments: {
    'Client ID':      'clientId',
    'Customer':       'customer',
    'Mobile':         'mobile',
    'Phone':          'mobile',
    'Amount':         'amount',
    'Date':           'date',
    'Mode':           'mode',
    'Method':         'mode',
    'Note':           'note',
    'Notes':          'note',
  },
  stock: {
    'Date':           'date',
    'Produced':       'produced',
    'Qty':            'produced',
    'Delivered':      'delivered',
    'SKU':            'sku',
    'Customer':       'customer',
    'Client ID':      'clientId',
  },
  leads: {
    'ID':             'id',
    'Mobile':         'mobile',
    'Phone':          'mobile',
    'Name':           'name',
    'Location':       'location',
    'City':           'location',
    'Product':        'product',
    'Status':         'status',
    'Date':           'createdDate',
    'Created Date':   'createdDate',
    'Raw':            'raw',
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayIST() {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
}

function coerceRow(collection, raw) {
  const map = COLUMN_MAP[collection];
  const doc = {};
  for (const [sheetCol, value] of Object.entries(raw)) {
    const firestoreField = map[sheetCol.trim()];
    if (firestoreField && value !== '' && value !== undefined) {
      doc[firestoreField] = value.trim();
    }
  }
  return doc;
}

// Type-cast strings to proper types per collection
function castTypes(collection, doc) {
  const nums = {
    customers: ['rate', 'outstanding'],
    orders:    ['boxes', 'amount', 'rate'],
    payments:  ['amount'],
    stock:     ['produced', 'delivered'],
    leads:     [],
  };
  const bools = {
    customers: ['active'],
    orders:    [],
    payments:  [],
    stock:     [],
    leads:     [],
  };

  for (const field of (nums[collection] || [])) {
    if (doc[field] !== undefined) doc[field] = Number(doc[field]) || 0;
  }
  for (const field of (bools[collection] || [])) {
    if (doc[field] !== undefined) {
      const v = String(doc[field]).toLowerCase();
      doc[field] = v === 'true' || v === '1' || v === 'yes';
    }
  }
  return doc;
}

function applyDefaults(collection, doc) {
  if (collection === 'customers') {
    if (doc.active === undefined) doc.active = true;
    if (doc.outstanding === undefined) doc.outstanding = 0;
  }
  if (collection === 'orders') {
    if (!doc.status) doc.status = 'Pending';
    if (!doc.orderDate) doc.orderDate = todayIST();
  }
  if (collection === 'payments') {
    if (!doc.date) doc.date = todayIST();
    if (!doc.mode) doc.mode = 'Cash';
  }
  if (collection === 'stock') {
    if (!doc.date) doc.date = todayIST();
    if (doc.produced === undefined) doc.produced = 0;
    if (doc.delivered === undefined) doc.delivered = 0;
  }
  if (collection === 'leads') {
    if (!doc.status) doc.status = 'New';
    if (!doc.createdDate) doc.createdDate = todayIST();
  }
  return doc;
}

// Decide the Firestore doc ID for each collection
function getDocId(collection, doc, autoId) {
  if (collection === 'customers') return String(doc.mobile || doc.id || autoId);
  if (collection === 'orders')    return String(doc.id || autoId);
  if (collection === 'leads')     return String(doc.mobile || doc.id || autoId);
  return null; // payments & stock use auto-ID
}

// ── Parse CSV ─────────────────────────────────────────────────────────────────
async function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', row => rows.push(row))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });
}

// ── Batch write (max 500 per Firestore batch) ─────────────────────────────────
async function batchWrite(collection, docs) {
  let batch = db.batch();
  let count = 0, total = 0;

  for (const { id, data } of docs) {
    const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();
    batch.set(ref, data, { merge: true });
    count++;
    total++;

    if (count === 499) {
      await batch.commit();
      process.stdout.write(`  ✓ ${total} written...\r`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) await batch.commit();
  return total;
}

// ── Update meta counter after orders migration ────────────────────────────────
async function updateOrderCounter(docs) {
  const maxId = docs.reduce((max, { id }) => {
    const n = parseInt(id, 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 1000);
  await db.doc('meta/counters').set({ orderId: maxId }, { merge: true });
  console.log(`  ↑ meta/counters.orderId set to ${maxId}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const [,, collectionName, csvFile] = process.argv;

  const validCollections = Object.keys(COLUMN_MAP);
  if (!validCollections.includes(collectionName)) {
    console.error(`\n❌  Unknown collection: ${collectionName}`);
    console.error(`   Valid options: ${validCollections.join(', ')}\n`);
    process.exit(1);
  }

  const csvPath = csvFile || `${collectionName}.csv`;
  if (!existsSync(csvPath)) {
    console.error(`\n❌  CSV file not found: ${csvPath}`);
    console.error(`   Export from Google Sheets: File → Download → CSV`);
    console.error(`   Then place it in the migrate/ folder as ${collectionName}.csv\n`);
    process.exit(1);
  }

  console.log(`\n📋  Migrating [${collectionName}] from ${csvPath}...`);

  const rawRows = await parseCsv(csvPath);
  console.log(`   Found ${rawRows.length} rows in CSV`);

  if (rawRows.length === 0) {
    console.log('   Nothing to import. Exiting.');
    process.exit(0);
  }

  // Show detected columns
  const headers = Object.keys(rawRows[0]);
  const map = COLUMN_MAP[collectionName];
  const mapped = headers.filter(h => map[h.trim()]);
  const unmapped = headers.filter(h => !map[h.trim()]);
  console.log(`   Mapped columns:   ${mapped.join(', ') || '(none)'}`);
  if (unmapped.length) console.log(`   Ignored columns:  ${unmapped.join(', ')}`);

  const docs = [];
  let skipped = 0;

  rawRows.forEach((raw, i) => {
    let doc = coerceRow(collectionName, raw);
    doc = castTypes(collectionName, doc);
    doc = applyDefaults(collectionName, doc);

    // Skip completely empty rows
    if (Object.keys(doc).length === 0) { skipped++; return; }

    const docId = getDocId(collectionName, doc, `migrated-${i}`);
    if (docId && !doc.id) doc.id = docId;

    docs.push({ id: docId, data: doc });
  });

  if (skipped) console.log(`   Skipped ${skipped} empty rows`);
  console.log(`   Writing ${docs.length} documents to Firestore...`);

  const total = await batchWrite(collectionName, docs);

  // After orders — update the ID counter so new orders don't collide
  if (collectionName === 'orders') {
    const withIds = docs.filter(d => d.id);
    if (withIds.length) await updateOrderCounter(withIds);
  }

  console.log(`\n✅  Done! ${total} documents written to Firestore [${collectionName}]\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Migration failed:', err.message);
  process.exit(1);
});
