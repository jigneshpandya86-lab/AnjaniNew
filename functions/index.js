// functions/index.js — Firebase Cloud Functions for IndiaMART Gmail Auto-Processor
// Runs every 15 minutes, fetches unread IndiaMART emails, writes leads to Firestore.

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();
const db = admin.firestore();

// ─── OAuth2 client (credentials set via: firebase functions:config:set gmail.client_id="..." gmail.client_secret="...") ─
function getOAuth2Client() {
  const cfg = functions.config().gmail || {};
  return new google.auth.OAuth2(
    cfg.client_id,
    cfg.client_secret,
    `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/gmailAuthCallback`
  );
}

// ─── HTTPS: Receive OAuth2 redirect from Google, store refresh token ──────────
exports.gmailAuthCallback = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code.');

  try {
    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return res.status(400).send(
        'No refresh token returned. If you already connected Gmail before, ' +
        'go to myaccount.google.com/permissions, revoke access for this app, then try again.'
      );
    }
    await db.doc('_config/gmail_token').set({
      refresh_token: tokens.refresh_token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:#16a34a">✓ Gmail Connected!</h2>
        <p>IndiaMART emails will now be auto-fetched every hour (8 AM – 9 PM IST).</p>
        <p>You can close this tab.</p>
      </body></html>
    `);
  } catch (e) {
    console.error('[gmailAuthCallback]', e);
    res.status(500).send('Auth failed: ' + e.message);
  }
});

// ─── HTTPS: Return connection status (called by web app on load) ──────────────
exports.gmailConnectStatus = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const snap = await db.doc('_config/gmail_token').get();
    res.json({ connected: snap.exists && !!snap.data().refresh_token });
  } catch (e) {
    res.json({ connected: false });
  }
});

// ─── Firestore trigger: New order → email staff ──────────────────────────────
exports.onNewOrder = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap) => {
    const order = snap.data();
    try {
      const tokenSnap = await db.doc('_config/gmail_token').get();
      if (!tokenSnap.exists || !tokenSnap.data().refresh_token) {
        console.log('[onNewOrder] Gmail not connected — skipping email.');
        return;
      }
      const oauth2 = getOAuth2Client();
      oauth2.setCredentials({ refresh_token: tokenSnap.data().refresh_token });
      const gmail = google.gmail({ version: 'v1', auth: oauth2 });

      const body = [
        `New Order Received!`,
        ``,
        `Customer : ${order.customer || '-'}`,
        `Mobile   : ${order.mobile || '-'}`,
        `Address  : ${order.address || '-'}`,
        `Boxes    : ${order.boxes} x ${order.sku || '200ml'}`,
        `Delivery : ${order.deliveryDate || '-'} ${order.time || ''}`,
        `Amount   : Rs.${order.amount || 0}`,
        `Staff    : ${order.staff || '-'}`,
        `Order ID : ${order.id}`,
      ].join('\n');

      const mime = [
        `To: nileshvaniya@gmail.com`,
        `Subject: New Order - ${order.customer} (${order.deliveryDate || order.orderDate})`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body
      ].join('\r\n');

      const encoded = Buffer.from(mime).toString('base64url');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
      console.log(`[onNewOrder] Email sent for order ${order.id}`);
    } catch (e) {
      console.error('[onNewOrder] Email failed:', e.message);
    }
  });

// ─── Scheduled: Every 60 minutes, 8 AM–9 PM IST — fetch & process IndiaMART emails ──
exports.processIndiaMartEmails = functions.pubsub
  .schedule('every 60 minutes')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    // Skip runs outside 8:00 AM – 9:00 PM IST
    const istHour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
    if (istHour < 8 || istHour >= 21) {
      console.log(`[IndiaMART] Outside active hours (IST ${istHour}:xx) — skipping.`);
      return;
    }

    // Load stored refresh token
    const snap = await db.doc('_config/gmail_token').get();
    if (!snap.exists || !snap.data().refresh_token) {
      console.log('[IndiaMART] Gmail not connected — skipping.');
      return;
    }

    const oauth2 = getOAuth2Client();
    oauth2.setCredentials({ refresh_token: snap.data().refresh_token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // Search for unread IndiaMART enquiry emails
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'subject:("Enquiry for" OR "Requirement" OR "Contact") is:unread',
      maxResults: 50
    });
    const messages = listRes.data.messages || [];
    if (!messages.length) {
      console.log('[IndiaMART] No unread emails found.');
      return;
    }

    let count = 0;
    const sessionNumbers = new Set();

    for (const { id } of messages) {
      try {
        const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        const payload = msg.data.payload;
        const subject   = payload.headers.find(h => h.name === 'Subject')?.value || '';
        const plainBody = extractPart(payload, 'text/plain');
        const htmlBody  = extractPart(payload, 'text/html');

        const lead = parseIndiaMartEmail(plainBody, htmlBody, subject, sessionNumbers);
        if (lead) {
          await db.collection('leads').doc(lead.mobile).set({ ...lead, needsContactSync: true }, { merge: true });
          await gmail.users.messages.modify({
            userId: 'me',
            id,
            requestBody: { removeLabelIds: ['UNREAD'] }
          });
          count++;
        }
      } catch (e) {
        console.error('[IndiaMART] Error processing message', id, ':', e.message);
      }
    }

    console.log(`[IndiaMART] Done. Saved ${count} new leads.`);
  });

// ─── Helper: recursively find a MIME part and decode its base64url body ───────
function extractPart(payload, mimeType) {
  if (payload.mimeType === mimeType && payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractPart(part, mimeType);
      if (result) return result;
    }
  }
  return '';
}

// ─── Helper: parse one IndiaMART email — returns lead object or null ─────────
// Logic mirrors firebase-api.js GAS.processIndiaMartEmails exactly.
function parseIndiaMartEmail(plainBody, htmlBody, subject, sessionNumbers) {
  const massiveBlock = plainBody + ' ' + htmlBody;
  let validMob = null;
  const rawMatches = massiveBlock.match(/\d{10,13}/g) || [];

  for (const raw of rawMatches) {
    const clean = raw.slice(-10);
    if (!['6','7','8','9'].includes(clean[0])) continue;
    if (clean.startsWith('800') || clean.startsWith('1800')) continue;
    if (sessionNumbers.has(clean)) { validMob = null; break; }
    validMob = clean;
    break;
  }

  if (!validMob) return null;
  sessionNumbers.add(validMob);

  const lines = plainBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let extractedName = 'Unknown';
  let loc = '';

  const regardsIdx = lines.findIndex(l => l.toLowerCase().startsWith('regards'));
  if (regardsIdx !== -1 && regardsIdx + 1 < lines.length) {
    extractedName = lines[regardsIdx + 1];
    for (let i = regardsIdx + 2; i < regardsIdx + 8; i++) {
      if (i >= lines.length) break;
      const line = lines[i];
      const low  = line.toLowerCase();
      if (low.includes('@') || low.includes('mobile') || low.includes('call')) continue;
      if (line.replace(/\D/g, '').includes(validMob)) continue;
      if (low.includes('member since') || low.includes('gst') || low.includes('verified') || line.length < 3) continue;
      loc = line;
      break;
    }
  }

  const prodMatch = subject.match(/Enquiry for\s+(.+?)(\s+from|$)/i);
  const product   = prodMatch ? prodMatch[1].trim() : 'General Enquiry';
  const finalName = extractedName !== 'Unknown' ? `${extractedName} IndiaMART Lead` : 'IndiaMART Lead';

  return {
    mobile:      validMob,
    name:        finalName,
    raw:         `${finalName} | ${loc} | ${product} | ${validMob}`,
    notes:       `Name: ${finalName}\nAddr: ${loc}\nQty: ${product}`,
    status:      'New',
    createdDate: todayIST()
  };
}

// ─── Helper: today's date in IST (YYYY-MM-DD) ────────────────────────────────
function todayIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const d = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
