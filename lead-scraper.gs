// =============================================================
// ANJANI LEAD SCRAPER — Google Apps Script
// =============================================================
// Reads emails from multiple sources, extracts mobile numbers,
// and saves them as leads directly into Firestore.
//
// SETUP (one time):
//   1. Go to script.google.com → New project → paste this file
//   2. Run setupServiceAccount() and follow the prompt to paste your
//      service account JSON (from Google Cloud Console → IAM → Service Accounts)
//      The service account needs role: Firebase Admin (or Cloud Datastore User)
//   3. Run setupTriggers() to start the hourly schedule (8 AM – 10 PM IST)
//   4. Authorize the script when Google prompts you
// =============================================================

var FIREBASE_PROJECT_ID = 'anjaniappnew';

// ── SERVICE ACCOUNT SETUP ─────────────────────────────────────
// Run this once to store your service account credentials securely
function setupServiceAccount() {
  var ui = SpreadsheetApp.getUi ? SpreadsheetApp.getUi() : null;
  var json = ui
    ? ui.prompt('Paste your service account JSON key:').getResponseText()
    : PropertiesService.getScriptProperties().getProperty('SA_JSON'); // fallback for testing

  if (!json) { Logger.log('No JSON provided.'); return; }
  PropertiesService.getScriptProperties().setProperty('SA_JSON', json);
  Logger.log('Service account saved successfully.');
}

// ── TRIGGER SETUP ─────────────────────────────────────────────
// Run once to register hourly trigger. Script checks time internally
// to only process between 8 AM and 10 PM IST.
function setupTriggers() {
  // Remove existing triggers for this function to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runAllScrapers') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAllScrapers')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Hourly trigger set. Scraper runs every hour, active 8 AM–10 PM IST.');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runAllScrapers') ScriptApp.deleteTrigger(t);
  });
  Logger.log('All scraper triggers removed.');
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────
// Called by the hourly trigger. Add more scrapers here as needed.
function runAllScrapers() {
  var hour = Number(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'H'));
  if (hour < 8 || hour > 22) {
    Logger.log('Outside active hours (8 AM–10 PM IST). Skipping.');
    return;
  }
  Logger.log('=== Scraper run started at ' + new Date().toISOString() + ' ===');
  scrapeIndiamart();
  // scrapeJustDial();   // ← add more sources here when ready
  // scrapeFacebook();
  Logger.log('=== Scraper run complete ===');
}

// ── SOURCE: INDIAMART ─────────────────────────────────────────
function scrapeIndiamart() {
  // Search unread IndiaMART enquiry emails (sent to this Gmail account)
  var threads = GmailApp.search('from:indiamart is:unread subject:Enquiry', 0, 20);
  Logger.log('IndiaMART: found ' + threads.length + ' unread threads');

  var saved = 0, skipped = 0;
  threads.forEach(function(thread) {
    var messages = thread.getMessages();
    messages.forEach(function(msg) {
      if (msg.isUnread()) {
        var body = msg.getPlainBody();
        var subject = msg.getSubject();

        // Extract 10-digit Indian mobile — handles formats like:
        // +(91)-9978340847 | +91-9978340847 | 9978340847
        var match = body.match(/Mobile[:\s]+\+?\(?\s*91\s*\)?[-\s]*(\d{10})/i);
        if (!match) { skipped++; msg.markRead(); return; }

        var mobile = match[1];
        var result = saveLead_(mobile, 'IndiaMART Lead', 'IndiaMART', subject);
        if (result) saved++;
        msg.markRead(); // mark processed so it won't be picked up again
      }
    });
  });
  Logger.log('IndiaMART: saved=' + saved + ', skipped=' + skipped);
}

// ── SOURCE: JUST DIAL (template — fill in when needed) ────────
// function scrapeJustDial() {
//   var threads = GmailApp.search('from:justdial is:unread', 0, 20);
//   threads.forEach(function(thread) {
//     var body = thread.getMessages()[0].getPlainBody();
//     var match = body.match(/(\d{10})/);  // adjust regex for JustDial format
//     if (match) saveLead_(match[1], 'JustDial Lead', 'JustDial', '');
//     thread.getMessages()[0].markRead();
//   });
// }

// ── SAVE LEAD TO FIRESTORE ────────────────────────────────────
// Returns true if saved, false if skipped (e.g. duplicate or error)
function saveLead_(mobile, name, source, raw) {
  if (!mobile || mobile.length !== 10) {
    Logger.log('Invalid mobile: ' + mobile);
    return false;
  }
  try {
    var token = getAccessToken_();
    var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
              '/databases/(default)/documents/leads/' + mobile;

    // PATCH with updateMask only sets these fields — won't overwrite status/notes
    // if the lead already exists with a different status
    var fields = {
      mobile:      { stringValue: mobile },
      name:        { stringValue: name },
      source:      { stringValue: source },
      raw:         { stringValue: raw || '' },
      status:      { stringValue: 'New' },
      createdDate: { stringValue: today },
      lastContact: { stringValue: today }
    };

    // Use ?updateMask so we only create/update these fields, not overwrite everything
    var maskParams = Object.keys(fields).map(function(k) {
      return 'updateMask.fieldPaths=' + k;
    }).join('&');

    var response = UrlFetchApp.fetch(url + '?' + maskParams, {
      method: 'patch',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ fields: fields }),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code === 200) {
      Logger.log('Saved lead: ' + mobile + ' (' + source + ')');
      return true;
    } else {
      Logger.log('Firestore error ' + code + ': ' + response.getContentText());
      return false;
    }
  } catch (e) {
    Logger.log('saveLead_ error: ' + e.message);
    return false;
  }
}

// ── FIRESTORE AUTH — Service Account JWT ─────────────────────
function getAccessToken_() {
  var saJson = PropertiesService.getScriptProperties().getProperty('SA_JSON');
  if (!saJson) throw new Error('Service account not configured. Run setupServiceAccount() first.');
  var sa = JSON.parse(saJson);

  var now = Math.floor(Date.now() / 1000);
  var claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  var header  = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify(claim));
  var toSign  = header + '.' + payload;

  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(toSign, sa.private_key)
  );
  var jwt = toSign + '.' + signature;

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  if (!data.access_token) throw new Error('Token error: ' + resp.getContentText());
  return data.access_token;
}
