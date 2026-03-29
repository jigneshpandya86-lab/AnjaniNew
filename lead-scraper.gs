// ============================================================
// ANJANI LEAD SCRAPER — Google Apps Script
// Runs every hour (8 AM – 10 PM IST), scrapes inquiry emails,
// saves mobile numbers as leads in Firestore.
//
// SETUP:
//   1. script.google.com → New project → paste this file
//   2. Run setupTriggers() once to start the hourly schedule
//   3. Run runAllScrapers() manually first to test
// ============================================================

var CONFIG = {
  PROJECT_ID : 'anjaniappnew',
  SA_EMAIL   : 'lead-scraper@anjaniappnew.iam.gserviceaccount.com',
  SA_KEY     : '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCnSksE9TAZ9BHH\nV2nnSNVfTkt5t8o2QsFnc8AdcyGJCAOGBbVQ9AZiXlSjiUGl4bAyLufjocqpWQHP\nSuC9K7sRWzd5FrmyLdR+ttOuJzGvaIc9wxLIrmxhdIn1a8Ru3XzkDV4SREyrmGWV\nSqjBBmBHbSWUTFneW9FCOpqMoURNUBqecKX+AyYFcm6iaFSibNv3V+wUBottpuVn\nNg8GkvruuudtK+OBZBgyfWR9VkvGFU/m25PE5+egh2cHu3vqjqQT95ZGiuBpecy1\nZN2g1I99U4oMXIsvllCCrdwT6Tvy4uC13PAIRYdVmdzqmh+UxEPuGLA9gEFBchDm\nd7taip6DAgMBAAECggEACLC60fCcxZRgwg6/8SRe9Tr/f7y08/mmy2V/cugys0gn\nyrQMNb7fgAevdOlh8CiXuxulrzUN7psxlV+p6hnV93JaIN+12NQ5qDV+LJtboOWY\ntPQnyyYIek2QByBIjYvS+5PYMbG7m+RoToeY2aInqT45yAjpWDxD1CFwOuL7xdpQ\nYjN/IrSKWmHp2dt2P1TGay5yl47oCi8YmrF7zXLHR+a+RembrWo696aMfv6QPnTo\nOtIlcR83+PeAq3HWSl0Js59XUbrToBip0ycVp6igye0CFt1g7C966bDX2RTdB1VU\nui4pdbj2h30eM3v8Dk1s4J6CcTCMRM4S8fnLOBAbGQKBgQDdzI++ccp0ndTUuPZo\n2EnOPHao8AsoamrpMOktBIWaU5UOk/pUc/Gm0hiWcaEr7/oR5TVpRg7IZMGSkSzV\nKxHKJS0MDXRwOnA+52W1MqlOXX/JOgYJDjqxRhtFeUAd4v2pEp3wyD6Yf/qn4WaM\nd8oNm1uMdZ8SevgXykKoGn3qOQKBgQDBFgOLOy+grgPsaugU3IUzjl/x0TFefoFx\nfnFj38uG+rfmQkl2w0/mWcaCW++IWvbCQa/Fae6VPMouUxo7gWPOfbueQcybpunT\n5l3Xpy7K4HQRI5aNcTjMrcviN80qOpQwy0uoJVa7qwz6HQBTlvtm26ObSaDum5b6\nuR7XLjQ+mwKBgEbtyfIfNZ1Bc/RrCfHRaRjY4SF5Ujgkf/f+ujK5RXhqzjoRPHaR\ndW/htBc4U1BXt+LNJ914l/Whsv2KC4pH8bJxXQyDqP7S0V5sZWwivV3gLKNPOOrg\ncAiM4N/AvK5SDshoubVsdAgUtTXGsSKulCDx078BRlOEm54QAmz7u9SRAoGAL1Jz\n3+XLkHfVolW5N5OsWaxlO2Dn1p7unqA8rhulSBmehKJuWtsXc/9AtaZOmH6ix41N\nxPZncNALRTs8zKSzj2IlX24E9Yj8+eAV08q3nyVPjPvJ5DSBlThrJbBDajwdIbBR\nhI5SKYCMl6gP8myohNcDzAVJmfEsGZrRQi+iwk0CgYBRQDiWCoULhFTlnH3Yd+po\nUvdG+bVZYVoWiV5hSdC+L7iVNU4teaYOYXsZJelyPS8qBiI2Pj3gPkLvdxBKg2to\nSIUlP16vLS3pPBMbZBaWl7Rp9SjUOPIkj63udP6Ge91IPq39vifedGNz5/aIgIUy\n0k0ryIP+sCpxeBNxa76Zxg==\n-----END PRIVATE KEY-----\n',
};

// ── TRIGGERS ─────────────────────────────────────────────────

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runAllScrapers') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAllScrapers').timeBased().everyHours(1).create();
  Logger.log('Hourly trigger created. Active 8 AM – 10 PM IST.');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'runAllScrapers') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Triggers removed.');
}

// ── MAIN ─────────────────────────────────────────────────────

function runAllScrapers() {
  var hour = Number(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'H'));
  if (hour < 8 || hour > 22) { Logger.log('Outside 8 AM–10 PM IST. Skipping.'); return; }

  Logger.log('──── Scraper started ' + new Date().toISOString() + ' ────');
  scrapeIndiamart();
  // scrapeJustDial();   ← uncomment when ready
  // scrapeFacebook();   ← uncomment when ready
  Logger.log('──── Scraper done ────');
}

// ── SOURCE: INDIAMART ─────────────────────────────────────────

function scrapeIndiamart() {
  var threads = GmailApp.search('from:indiamart is:unread subject:Enquiry', 0, 20);
  Logger.log('IndiaMART: ' + threads.length + ' unread threads');
  var saved = 0, skipped = 0;

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (!msg.isUnread()) return;
      var body    = msg.getPlainBody();
      var subject = msg.getSubject();
      var match   = body.match(/Mobile[:\s]+\+?\(?\s*91\s*\)?[-\s]*(\d{10})/i);
      if (match) {
        saveLead(match[1], 'IndiaMART Lead', 'IndiaMART', subject) ? saved++ : skipped++;
      } else {
        skipped++;
      }
      msg.markRead();
    });
  });
  Logger.log('IndiaMART: saved=' + saved + '  skipped=' + skipped);
}

// ── SOURCE: JUSTDIAL (template) ───────────────────────────────

// function scrapeJustDial() {
//   var threads = GmailApp.search('from:justdial is:unread', 0, 20);
//   threads.forEach(function(thread) {
//     var msg   = thread.getMessages()[0];
//     var match = msg.getPlainBody().match(/(\d{10})/);
//     if (match) saveLead(match[1], 'JustDial Lead', 'JustDial', msg.getSubject());
//     msg.markRead();
//   });
// }

// ── SOURCE: FACEBOOK (template) ──────────────────────────────

// function scrapeFacebook() {
//   var threads = GmailApp.search('from:facebookmail is:unread', 0, 20);
//   threads.forEach(function(thread) {
//     var msg   = thread.getMessages()[0];
//     var match = msg.getPlainBody().match(/(\d{10})/);
//     if (match) saveLead(match[1], 'Facebook Lead', 'Facebook', msg.getSubject());
//     msg.markRead();
//   });
// }

// ── FIRESTORE WRITER ─────────────────────────────────────────

function saveLead(mobile, name, source, raw) {
  if (!mobile || mobile.length !== 10) { Logger.log('Bad mobile: ' + mobile); return false; }

  var today  = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var fields = {
    mobile      : { stringValue: mobile },
    name        : { stringValue: name   },
    source      : { stringValue: source },
    raw         : { stringValue: raw || '' },
    status      : { stringValue: 'New'  },
    createdDate : { stringValue: today  },
    lastContact : { stringValue: today  }
  };

  var mask = Object.keys(fields).map(function(k) {
    return 'updateMask.fieldPaths=' + k;
  }).join('&');

  var url = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID
          + '/databases/(default)/documents/leads/' + mobile + '?' + mask;

  try {
    var res = UrlFetchApp.fetch(url, {
      method          : 'patch',
      headers         : { Authorization: 'Bearer ' + getToken_() },
      contentType     : 'application/json',
      payload         : JSON.stringify({ fields: fields }),
      muteHttpExceptions: true
    });
    var ok = res.getResponseCode() === 200;
    Logger.log((ok ? '✓' : '✗') + ' lead ' + mobile + ' (' + source + ')  HTTP ' + res.getResponseCode());
    return ok;
  } catch (e) {
    Logger.log('Error saving ' + mobile + ': ' + e.message);
    return false;
  }
}

// ── AUTH: SERVICE ACCOUNT JWT ─────────────────────────────────

function getToken_() {
  var now   = Math.floor(Date.now() / 1000);
  var claim = {
    iss : CONFIG.SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud : 'https://oauth2.googleapis.com/token',
    exp : now + 3600,
    iat : now
  };

  var header  = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify(claim));
  var sig     = Utilities.base64EncodeWebSafe(
                  Utilities.computeRsaSha256Signature(header + '.' + payload, CONFIG.SA_KEY));
  var jwt     = header + '.' + payload + '.' + sig;

  var res  = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('Token failed: ' + res.getContentText());
  return data.access_token;
}
