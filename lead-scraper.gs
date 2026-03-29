// ============================================================
// ANJANI LEAD SCRAPER — Google Apps Script
// ============================================================
// Two jobs run every hour (8 AM – 10 PM IST):
//
//  1. runAllScrapers()       — scrapes email sources (IndiaMART etc.),
//                              saves each mobile as a Firestore lead AND
//                              as a Google Contact named "Facebook Lead"
//
//  2. syncContactsToLeads()  — reads ALL contacts named "Facebook Lead"
//                              (including ones added manually on your phone)
//                              and pushes them into Firestore as leads
//
// SETUP (one time):
//   1. script.google.com → New project → paste this file
//   2. Run setupTriggers() once → authorize when Google prompts
//   3. Run runAllScrapers() and syncContactsToLeads() manually to test
//   4. Check View → Logs
// ============================================================

var CONFIG = {
  PROJECT_ID : 'anjaniappnew',
  SA_EMAIL   : 'lead-scraper@anjaniappnew.iam.gserviceaccount.com',
  SA_KEY     : '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCnSksE9TAZ9BHH\nV2nnSNVfTkt5t8o2QsFnc8AdcyGJCAOGBbVQ9AZiXlSjiUGl4bAyLufjocqpWQHP\nSuC9K7sRWzd5FrmyLdR+ttOuJzGvaIc9wxLIrmxhdIn1a8Ru3XzkDV4SREyrmGWV\nSqjBBmBHbSWUTFneW9FCOpqMoURNUBqecKX+AyYFcm6iaFSibNv3V+wUBottpuVn\nNg8GkvruuudtK+OBZBgyfWR9VkvGFU/m25PE5+egh2cHu3vqjqQT95ZGiuBpecy1\nZN2g1I99U4oMXIsvllCCrdwT6Tvy4uC13PAIRYdVmdzqmh+UxEPuGLA9gEFBchDm\nd7taip6DAgMBAAECggEACLC60fCcxZRgwg6/8SRe9Tr/f7y08/mmy2V/cugys0gn\nyrQMNb7fgAevdOlh8CiXuxulrzUN7psxlV+p6hnV93JaIN+12NQ5qDV+LJtboOWY\ntPQnyyYIek2QByBIjYvS+5PYMbG7m+RoToeY2aInqT45yAjpWDxD1CFwOuL7xdpQ\nYjN/IrSKWmHp2dt2P1TGay5yl47oCi8YmrF7zXLHR+a+RembrWo696aMfv6QPnTo\nOtIlcR83+PeAq3HWSl0Js59XUbrToBip0ycVp6igye0CFt1g7C966bDX2RTdB1VU\nui4pdbj2h30eM3v8Dk1s4J6CcTCMRM4S8fnLOBAbGQKBgQDdzI++ccp0ndTUuPZo\n2EnOPHao8AsoamrpMOktBIWaU5UOk/pUc/Gm0hiWcaEr7/oR5TVpRg7IZMGSkSzV\nKxHKJS0MDXRwOnA+52W1MqlOXX/JOgYJDjqxRhtFeUAd4v2pEp3wyD6Yf/qn4WaM\nd8oNm1uMdZ8SevgXykKoGn3qOQKBgQDBFgOLOy+grgPsaugU3IUzjl/x0TFefoFx\nfnFj38uG+rfmQkl2w0/mWcaCW++IWvbCQa/Fae6VPMouUxo7gWPOfbueQcybpunT\n5l3Xpy7K4HQRI5aNcTjMrcviN80qOpQwy0uoJVa7qwz6HQBTlvtm26ObSaDum5b6\nuR7XLjQ+mwKBgEbtyfIfNZ1Bc/RrCfHRaRjY4SF5Ujgkf/f+ujK5RXhqzjoRPHaR\ndW/htBc4U1BXt+LNJ914l/Whsv2KC4pH8bJxXQyDqP7S0V5sZWwivV3gLKNPOOrg\ncAiM4N/AvK5SDshoubVsdAgUtTXGsSKulCDx078BRlOEm54QAmz7u9SRAoGAL1Jz\n3+XLkHfVolW5N5OsWaxlO2Dn1p7unqA8rhulSBmehKJuWtsXc/9AtaZOmH6ix41N\nxPZncNALRTs8zKSzj2IlX24E9Yj8+eAV08q3nyVPjPvJ5DSBlThrJbBDajwdIbBR\nhI5SKYCMl6gP8myohNcDzAVJmfEsGZrRQi+iwk0CgYBRQDiWCoULhFTlnH3Yd+po\nUvdG+bVZYVoWiV5hSdC+L7iVNU4teaYOYXsZJelyPS8qBiI2Pj3gPkLvdxBKg2to\nSIUlP16vLS3pPBMbZBaWl7Rp9SjUOPIkj63udP6Ge91IPq39vifedGNz5/aIgIUy\n0k0ryIP+sCpxeBNxa76Zxg==\n-----END PRIVATE KEY-----\n',
  CONTACT_NAME : 'Facebook Lead',   // fixed name used in Google Contacts
};

// ── TRIGGERS ─────────────────────────────────────────────────

function setupTriggers() {
  // Remove old triggers first to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'runAllScrapers' || fn === 'syncContactsToLeads') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Scrape emails every hour
  ScriptApp.newTrigger('runAllScrapers').timeBased().everyHours(1).create();
  // Sync contacts → Firestore every hour (offset by 30 min naturally via trigger)
  ScriptApp.newTrigger('syncContactsToLeads').timeBased().everyHours(1).create();
  Logger.log('✓ Triggers set: runAllScrapers + syncContactsToLeads — hourly, active 8 AM–10 PM IST');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'runAllScrapers' || fn === 'syncContactsToLeads') ScriptApp.deleteTrigger(t);
  });
  Logger.log('All triggers removed.');
}

// ── JOB 1: EMAIL SCRAPERS ─────────────────────────────────────
// Scrapes email sources → saves to Firestore + Google Contacts

function runAllScrapers() {
  if (!isActiveHour_()) return;
  Logger.log('──── Email Scraper started ' + new Date().toISOString() + ' ────');
  scrapeIndiamart();
  // scrapeJustDial();   ← uncomment when ready
  // scrapeFacebook();   ← uncomment when ready
  Logger.log('──── Email Scraper done ────');
}

// ── SOURCE: INDIAMART ─────────────────────────────────────────

function scrapeIndiamart() {
  var threads = GmailApp.search('from:indiamart is:unread subject:Enquiry', 0, 20);
  Logger.log('IndiaMART: ' + threads.length + ' unread thread(s)');
  var saved = 0, skipped = 0;

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (!msg.isUnread()) return;
      var body    = msg.getPlainBody();
      var subject = msg.getSubject();
      var match   = body.match(/Mobile[:\s]+\+?\(?\s*91\s*\)?[-\s]*(\d{10})/i);
      if (match) {
        var mobile = match[1];
        saveLead(mobile, CONFIG.CONTACT_NAME, 'IndiaMART', subject);
        saveContact(mobile, subject);   // ← also add to Google Contacts
        saved++;
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
//     if (match) {
//       saveLead(match[1], CONFIG.CONTACT_NAME, 'JustDial', msg.getSubject());
//       saveContact(match[1], msg.getSubject());
//     }
//     msg.markRead();
//   });
// }

// ── SOURCE: FACEBOOK (template) ──────────────────────────────

// function scrapeFacebook() {
//   var threads = GmailApp.search('from:facebookmail is:unread', 0, 20);
//   threads.forEach(function(thread) {
//     var msg   = thread.getMessages()[0];
//     var match = msg.getPlainBody().match(/(\d{10})/);
//     if (match) {
//       saveLead(match[1], CONFIG.CONTACT_NAME, 'Facebook', msg.getSubject());
//       saveContact(match[1], msg.getSubject());
//     }
//     msg.markRead();
//   });
// }

// ── JOB 2: CONTACTS → FIRESTORE SYNC ─────────────────────────
// Reads all Google Contacts named "Facebook Lead" (including ones
// added manually on your phone) and pushes them into Firestore.

function syncContactsToLeads() {
  if (!isActiveHour_()) return;
  Logger.log('──── Contact Sync started ' + new Date().toISOString() + ' ────');

  var contacts = ContactsApp.getContactsByName(CONFIG.CONTACT_NAME, true);
  Logger.log('Found ' + contacts.length + ' "' + CONFIG.CONTACT_NAME + '" contact(s)');

  var synced = 0, skipped = 0;
  contacts.forEach(function(contact) {
    var phones = contact.getPhones(ContactsApp.Field.MOBILE_PHONE);
    if (!phones.length) phones = contact.getPhones(); // fallback: any phone field

    phones.forEach(function(phone) {
      var digits = phone.getPhoneNumber().replace(/\D/g, '');
      var mobile = digits.slice(-10);   // last 10 digits
      if (mobile.length !== 10) { skipped++; return; }

      var notes = contact.getNotes() || 'Contact Sync';
      saveLead(mobile, CONFIG.CONTACT_NAME, 'Contact', notes) ? synced++ : skipped++;
    });
  });

  Logger.log('Contact Sync: synced=' + synced + '  skipped=' + skipped);
  Logger.log('──── Contact Sync done ────');
}

// ── GOOGLE CONTACTS WRITER ────────────────────────────────────
// Saves mobile as a Google Contact named "Facebook Lead".
// Skips if a contact with that exact mobile already exists.

function saveContact(mobile, notes) {
  if (!mobile || mobile.length !== 10) return;

  // Check for duplicates — search existing "Facebook Lead" contacts
  var existing = ContactsApp.getContactsByName(CONFIG.CONTACT_NAME, true);
  for (var i = 0; i < existing.length; i++) {
    var phones = existing[i].getPhones();
    for (var j = 0; j < phones.length; j++) {
      if (phones[j].getPhoneNumber().replace(/\D/g, '').slice(-10) === mobile) {
        Logger.log('Contact already exists: ' + mobile);
        return;
      }
    }
  }

  // Create new contact
  var contact = ContactsApp.createContact('Facebook', 'Lead', '');
  contact.addPhone(ContactsApp.Field.MOBILE_PHONE, '+91' + mobile);
  contact.setNotes(notes || 'Added by Anjani Lead Scraper');
  Logger.log('✓ Contact saved: ' + mobile + ' as "' + CONFIG.CONTACT_NAME + '"');
}

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
    lastContact : { stringValue: today  },
  };

  var mask = Object.keys(fields).map(function(k) {
    return 'updateMask.fieldPaths=' + k;
  }).join('&');

  var url = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID
          + '/databases/(default)/documents/leads/' + mobile + '?' + mask;

  try {
    var res = UrlFetchApp.fetch(url, {
      method             : 'patch',
      headers            : { Authorization: 'Bearer ' + getToken_() },
      contentType        : 'application/json',
      payload            : JSON.stringify({ fields: fields }),
      muteHttpExceptions : true,
    });
    var ok = res.getResponseCode() === 200;
    Logger.log((ok ? '✓' : '✗') + ' Firestore lead ' + mobile + ' (' + source + ')  HTTP ' + res.getResponseCode());
    return ok;
  } catch (e) {
    Logger.log('saveLead error ' + mobile + ': ' + e.message);
    return false;
  }
}

// ── AUTH: SERVICE ACCOUNT JWT ─────────────────────────────────

function getToken_() {
  var now   = Math.floor(Date.now() / 1000);
  var claim = {
    iss  : CONFIG.SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud  : 'https://oauth2.googleapis.com/token',
    exp  : now + 3600,
    iat  : now,
  };

  var header  = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify(claim));
  var sig     = Utilities.base64EncodeWebSafe(
                  Utilities.computeRsaSha256Signature(header + '.' + payload, CONFIG.SA_KEY));
  var jwt     = header + '.' + payload + '.' + sig;

  var res  = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method : 'post',
    payload: { grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true,
  });
  var data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('Token failed: ' + res.getContentText());
  return data.access_token;
}

// ── HELPER ───────────────────────────────────────────────────

function isActiveHour_() {
  var hour = Number(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'H'));
  if (hour < 8 || hour > 22) {
    Logger.log('Outside 8 AM–10 PM IST (' + hour + 'h). Skipping.');
    return false;
  }
  return true;
}
