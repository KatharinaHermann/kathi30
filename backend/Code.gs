/**
 * Kathi x Josh 30 — Google Sheet backend
 *
 * Paste this whole file into the Google Sheet's Extensions → Apps Script editor,
 * run `setup` once, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). See SETUP.md for the full walkthrough.
 *
 * Tabs (created by `setup`):
 *   dashboard        headcount, money and carpool at a glance (formulas only)
 *   rsvps            the guest list. Fill by hand or via "Sync Partiful import". Tick paid_confirmed yourself.
 *   payments         "I paid" reports from the website. Tick `confirmed` once the money has landed.
 *   drivers, riders  the carpool board (written by the website, you can edit / delete rows)
 *   notes            guest book posts (photos are saved to a Drive folder, the cell holds the link)
 *   bring            who brings what. Filled by you by hand; shown read-only on the website.
 *   partiful_import  paste / import the Partiful CSV export here, then run the sync from the menu
 */

// ---- settings -------------------------------------------------------------
const PRICE_PER_PERSON = 300;
// Guest book opens at the party: Sat Jan 16 2027, 8pm Pacific. Notes posted earlier are refused.
const GUESTBOOK_OPENS = new Date('2027-01-16T20:00:00-08:00');
const PHOTO_FOLDER_NAME = 'Kathi 30 — guest book photos';
const CACHE_SECONDS = 10;

const TABS = {
  dashboard: [],
  rsvps: ['name', 'rsvp', 'plus_ones', 'paid_confirmed', 'amount_due', 'payment_reported', 'carpool', 'host_notes'],
  payments: ['id', 'name', 'method', 'reported_at', 'confirmed', 'host_notes'],
  drivers: ['id', 'name', 'origin', 'seats', 'leaving', 'created_at', 'token'],
  riders: ['id', 'name', 'origin', 'details', 'driver_id', 'created_at', 'token'],
  notes: ['id', 'name', 'msg', 'photo', 'created_at', 'token'],
  bring: ['item', 'who', 'note'],
  partiful_import: []
};
// What the public website may read and write.
const PUBLIC_READ = {
  drivers: ['id', 'name', 'origin', 'seats', 'leaving'],
  riders: ['id', 'name', 'origin', 'details', 'driver_id'],
  notes: ['id', 'name', 'msg', 'photo'],
  bring: ['item', 'who', 'note']
};
const DELETABLE = ['drivers', 'riders', 'notes'];
const ORIGINS = ['SF', 'LAX'];

// ---- menu -----------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kathi 30')
    .addItem('Sync Partiful import → rsvps', 'syncPartiful')
    .addSeparator()
    .addItem('Set up / repair tabs', 'setup')
    .addToUi();
}

// ---- web app --------------------------------------------------------------
function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('list');
  if (hit) return json_(JSON.parse(hit));
  const out = { ok: true, guestbookOpens: GUESTBOOK_OPENS.getTime() };
  Object.keys(PUBLIC_READ).forEach(t => {
    out[t] = rows_(t).map(r => pick_(r, PUBLIC_READ[t])).filter(r => t === 'bring' ? r.item : r.id);
  });
  out.notes.reverse(); // newest first
  try { cache.put('list', JSON.stringify(out), CACHE_SECONDS); } catch (e) { /* too big to cache, fine */ }
  return json_(out);
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const res = handle_(b);
    CacheService.getScriptCache().remove('list');
    return json_(Object.assign({ ok: true }, res));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function handle_(b) {
  const table = String(b.table || '');
  if (b.action === 'add') {
    const r = b.row || {};
    const token = clean_(b.token, 64);
    if (table === 'drivers') {
      const row = { id: id_(r.id, table), name: req_(r.name, 60), origin: origin_(r.origin), seats: clamp_(r.seats, 1, 7), leaving: clean_(r.leaving, 140), token };
      append_(table, row);
      return { id: row.id };
    }
    if (table === 'riders') {
      let driver = clean_(r.driver_id, 32);
      if (driver && !hasSeat_(driver)) driver = ''; // car filled up meanwhile → goes to "still looking"
      const row = { id: id_(r.id, table), name: req_(r.name, 60), origin: origin_(r.origin), details: clean_(r.details, 200), driver_id: driver, token };
      append_(table, row);
      return { id: row.id, driver_id: driver };
    }
    if (table === 'notes') {
      if (Date.now() < GUESTBOOK_OPENS.getTime()) throw new Error('the guest book is still locked');
      const row = { id: id_(r.id, table), name: req_(r.name, 60), msg: req_(r.msg, 2000), photo: savePhoto_(r.photo), token };
      append_(table, row);
      return { id: row.id, photo: row.photo };
    }
    if (table === 'payments') {
      const row = { id: id_(r.id, table), name: req_(r.name, 80), method: clean_(r.method, 20) || 'Venmo/PayPal', reported_at: new Date(), confirmed: false };
      append_(table, row);
      return { id: row.id };
    }
    throw new Error('unknown table');
  }
  if (b.action === 'delete') {
    if (DELETABLE.indexOf(table) < 0) throw new Error('not allowed');
    const s = sheet_(table), h = headers_(s), id = String(b.id || '');
    const ri = findRow_(s, id);
    if (!ri) return { gone: true };
    const stored = String(s.getRange(ri, h.indexOf('token') + 1).getValue() || '');
    if (!stored || stored !== String(b.token || '')) throw new Error('you can only remove your own entries');
    s.deleteRow(ri);
    if (table === 'drivers') { // their riders go back to "still looking"
      const rs = sheet_('riders'), rh = headers_(rs), col = rh.indexOf('driver_id') + 1, n = rs.getLastRow() - 1;
      if (n > 0) {
        const vals = rs.getRange(2, col, n, 1).getValues().map(v => [String(v[0]) === id ? '' : v[0]]);
        rs.getRange(2, col, n, 1).setValues(vals);
      }
    }
    return {};
  }
  throw new Error('unknown action');
}

// ---- helpers --------------------------------------------------------------
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// Works both when the script is opened from the sheet (Erweiterungen → Apps Script)
// and when it was created on its own at script.google.com (then setup creates the sheet).
function ss_() {
  const a = SpreadsheetApp.getActive();
  if (a) return a;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('no sheet yet — run setup first');
}
function alert_(m) { try { SpreadsheetApp.getUi().alert(m); } catch (e) { Logger.log(m); } }
function sheet_(n) { const s = ss_().getSheetByName(n); if (!s) throw new Error('missing tab "' + n + '" — run setup'); return s; }
function headers_(s) { return s.getRange(1, 1, 1, Math.max(1, s.getLastColumn())).getValues()[0].map(String); }
function rows_(n) {
  const s = sheet_(n), v = s.getDataRange().getValues(), h = v.shift().map(String);
  return v.map(r => { const o = {}; h.forEach((k, i) => { if (k) o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o; });
}
function pick_(o, keys) { const r = {}; keys.forEach(k => { r[k] = o[k] === undefined ? '' : o[k]; }); return r; }
function append_(n, row) {
  const s = sheet_(n), h = headers_(s);
  row.created_at = row.created_at || new Date();
  s.appendRow(h.map(k => (row[k] === undefined ? '' : row[k])));
}
function findRow_(s, id) {
  const n = s.getLastRow(); if (n < 2) return 0;
  const ids = s.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}
// Strip leading = + - @ so nobody can inject a formula into your sheet.
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, max); }
function req_(v, max) { const s = clean_(v, max); if (!s) throw new Error('missing field'); return s; }
function clamp_(v, lo, hi) { const n = Math.round(Number(v)); return Math.max(lo, Math.min(hi, isFinite(n) ? n : lo)); }
function origin_(v) { return ORIGINS.indexOf(v) >= 0 ? v : ORIGINS[0]; }
function id_(v, table) {
  const s = String(v || '');
  if (/^[a-z0-9]{6,16}$/.test(s) && !findRow_(sheet_(table), s)) return s;
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}
function hasSeat_(driverId) {
  const d = rows_('drivers').find(r => String(r.id) === driverId);
  if (!d) return false;
  const taken = rows_('riders').filter(r => String(r.driver_id) === driverId).length;
  return taken < Number(d.seats || 0);
}
function savePhoto_(dataUrl) {
  if (!dataUrl) return '';
  const m = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('photo must be an image');
  if (m[2].length > 4 * 1024 * 1024) throw new Error('photo too large');
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'guestbook-' + Date.now() + '.jpg');
  const f = folder.createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1000';
}

// ---- setup ----------------------------------------------------------------
/** Creates any missing tab + headers, formulas and checkboxes. Safe to run again. */
function setup() {
  let ss = SpreadsheetApp.getActive();
  if (!ss) {
    const props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID');
    ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('Kathi 30 — Host Sheet');
    props.setProperty('SHEET_ID', ss.getId());
  }
  Object.keys(TABS).forEach((name, i) => {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name, i);
    const h = TABS[name];
    if (h.length && !String(s.getRange(1, 1).getValue())) {
      s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#24221f').setFontColor('#f6f2ec');
      s.setFrozenRows(1);
    }
  });
  const sheet1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Tabelle1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);

  // rsvps: checkboxes + live formula columns
  const r = ss.getSheetByName('rsvps');
  r.getRange('D2:D500').insertCheckboxes();
  r.getRange('E2').setFormula('=ARRAYFORMULA(IF(A2:A="","",IF(B2:B="going",' + PRICE_PER_PERSON + '*(1+IF(ISNUMBER(C2:C),C2:C,0)),"")))');
  r.getRange('F2').setFormula('=ARRAYFORMULA(IF(A2:A="","",IF(COUNTIF(payments!B2:B,REGEXEXTRACT(A2:A&" ","^\\S+")&"*")>0,"said they paid","")))');
  r.getRange('G2').setFormula('=ARRAYFORMULA(IF(A2:A="","",IF(COUNTIF(drivers!B2:B,REGEXEXTRACT(A2:A&" ","^\\S+")&"*")>0,"driving",IF(COUNTIF(riders!B2:B,REGEXEXTRACT(A2:A&" ","^\\S+")&"*")>0,"riding",""))))');
  r.getRange('B2:B500').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['going', 'maybe', 'not going', 'invited'], true).setAllowInvalid(true).build());
  r.getRange('E1:G1').setBackground('#5a6170').setNote('Filled automatically — don\'t type in these columns.');
  r.setColumnWidth(1, 200); r.setColumnWidth(8, 260);

  const p = ss.getSheetByName('payments');
  p.getRange('E2:E500').insertCheckboxes();
  p.getRange('D2:D500').setNumberFormat('ddd mmm d, h:mm am/pm');

  ['drivers', 'riders', 'notes'].forEach(n => {
    const s = ss.getSheetByName(n), h = headers_(s), t = h.indexOf('token') + 1;
    if (t) s.hideColumns(t);
    s.getRange('A1').setNote('Rows are added by the website. You can edit or delete rows here.');
  });
  ss.getSheetByName('bring').getRange('A1').setNote('Fill this in yourself. Leave "who" empty and the site shows the item as up for grabs.');
  ss.getSheetByName('partiful_import').getRange('A1').setNote('Partiful → Guest List → Export CSV. Then File → Import → Upload → "Replace current sheet" while on this tab (or paste it here). Then Kathi 30 menu → Sync.');

  buildDashboard_(ss.getSheetByName('dashboard'));
  ss.setActiveSheet(ss.getSheetByName('dashboard'));
  Logger.log('✅ Sheet ready: ' + ss.getUrl());
}

function buildDashboard_(d) {
  d.clear();
  const going = 'rsvps!B2:B="going"';
  const rows = [
    ['KATHI x JOSH 30 — host dashboard', ''],
    ['', ''],
    ['RSVPs', ''],
    ['going (guests)', '=COUNTIF(rsvps!B2:B,"going")'],
    ['+ plus-ones', '=SUMPRODUCT((' + going + ')*IFERROR(VALUE(rsvps!C2:C),0))'],
    ['headcount', '=B4+B5'],
    ['maybe', '=COUNTIF(rsvps!B2:B,"maybe")'],
    ['not going', '=COUNTIF(rsvps!B2:B,"not going")'],
    ['', ''],
    ['MONEY', ''],
    ['expected', '=SUM(rsvps!E2:E)'],
    ['confirmed paid', '=SUMPRODUCT((rsvps!D2:D=TRUE)*IFERROR(VALUE(rsvps!E2:E),0))'],
    ['outstanding', '=B11-B12'],
    ['going, not yet confirmed paid', '=IFERROR(TEXTJOIN(", ",TRUE,FILTER(rsvps!A2:A,' + going + ',rsvps!D2:D<>TRUE)),"—")'],
    ['"I paid" reports to check', '=IFERROR(TEXTJOIN(", ",TRUE,FILTER(payments!B2:B,payments!B2:B<>"",payments!E2:E<>TRUE)),"—")'],
    ['', ''],
    ['CARPOOL', ''],
    ['cars', '=COUNTA(drivers!A2:A)'],
    ['seats offered', '=SUM(drivers!D2:D)'],
    ['riders matched to a car', '=COUNTIF(riders!E2:E,"?*")'],
    ['riders still looking', '=IFERROR(TEXTJOIN(", ",TRUE,FILTER(riders!B2:B,riders!B2:B<>"",riders!E2:E="")),"—")'],
    ['going, no carpool entry yet', '=IFERROR(TEXTJOIN(", ",TRUE,FILTER(rsvps!A2:A,' + going + ',rsvps!G2:G="")),"—")'],
    ['', ''],
    ['WHO BRINGS WHAT', ''],
    ['items on the list', '=COUNTA(bring!A2:A)'],
    ['nobody assigned yet', '=IFERROR(TEXTJOIN(", ",TRUE,FILTER(bring!A2:A,bring!A2:A<>"",bring!B2:B="")),"—")'],
    ['', ''],
    ['GUEST BOOK', ''],
    ['notes posted', '=COUNTA(notes!A2:A)']
  ];
  d.getRange(1, 1, rows.length, 2).setValues(rows);
  d.getRange('A1').setFontSize(16).setFontWeight('bold');
  ['A3', 'A10', 'A17', 'A24', 'A28'].forEach(a => d.getRange(a).setFontWeight('bold').setFontColor('#e8764a'));
  d.getRange('B11:B13').setNumberFormat('$#,##0');
  d.getRange('B4:B29').setHorizontalAlignment('left').setWrap(true);
  d.setColumnWidth(1, 260); d.setColumnWidth(2, 520);
}

// ---- Partiful -------------------------------------------------------------
/**
 * Reads the partiful_import tab (a Partiful guest-list CSV export) and merges it into rsvps
 * by name: updates rsvp + plus_ones, adds new guests, never touches paid / notes columns.
 */
function syncPartiful() {
  const ss = ss_(), src = ss.getSheetByName('partiful_import'), dst = ss.getSheetByName('rsvps');
  const v = src.getDataRange().getValues();
  if (v.length < 2) { alert_('partiful_import is empty — import the Partiful CSV there first.'); return; }
  const h = v.shift().map(x => String(x).toLowerCase().trim());
  const find = re => h.findIndex(x => re.test(x));
  const iName = find(/^(full )?name$|guest name|^name/), iFirst = find(/first/), iLast = find(/last/);
  const iStatus = find(/status|rsvp|response|going|attending/);
  const iPlus = find(/plus|\+1|additional|guest count|party size|guests/);
  if (iName < 0 && iFirst < 0) { alert_('Could not find a name column. Headers: ' + h.join(', ')); return; }

  const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const mapStatus = s => {
    s = norm(s);
    if (/can'?t|cannot|not going|decline|^no$/.test(s)) return 'not going';
    if (/maybe|tentative/.test(s)) return 'maybe';
    if (/going|yes|accept|attend/.test(s)) return 'going';
    return s ? 'invited' : '';
  };
  const n = Math.max(0, dst.getLastRow() - 1);
  const cur = n ? dst.getRange(2, 1, n, 3).getValues() : [];
  const index = {}; cur.forEach((r, i) => { if (r[0]) index[norm(r[0])] = i; });
  let added = 0, updated = 0;
  v.forEach(r => {
    const name = iName >= 0 ? String(r[iName]).trim() : [r[iFirst], iLast >= 0 ? r[iLast] : ''].join(' ').trim();
    if (!name) return;
    const rsvp = iStatus >= 0 ? mapStatus(r[iStatus]) : 'invited';
    const pv = iPlus >= 0 ? Number(r[iPlus]) : NaN;
    const plus = isFinite(pv) && pv > 0 ? pv : '';
    const k = norm(name);
    if (k in index) { const row = cur[index[k]]; row[1] = rsvp || row[1]; row[2] = plus !== '' ? plus : row[2]; updated++; }
    else { index[k] = cur.length; cur.push([name, rsvp, plus]); added++; }
  });
  if (cur.length) dst.getRange(2, 1, cur.length, 3).setValues(cur);
  ss.toast(added + ' added, ' + updated + ' updated', 'Partiful sync', 6);
}
