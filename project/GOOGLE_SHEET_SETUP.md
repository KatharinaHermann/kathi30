# Kathi x Josh 30 — connect the site to a Google Sheet

## 1. Make the sheet (2 min)
1. Create a new Google Sheet, e.g. "Kathi 30 — Host Sheet".
2. Add 4 tabs named exactly: **drivers**, **riders**, **notes**, **payments**.
3. Row 1 headers (exactly):
   - drivers: `id | name | origin | seats | leaving | created_at`
   - riders: `id | name | origin | details | driver_id | created_at`
   - notes: `id | name | msg | photo | created_at`
   - payments: `id | name | method | at | created_at`

## 2. Add the script (3 min)
Extensions → **Apps Script** → delete everything → paste:

```js
function sheet_(n){return SpreadsheetApp.getActive().getSheetByName(n);}
function rows_(n){const s=sheet_(n),v=s.getDataRange().getValues(),h=v.shift();return v.filter(r=>r[0]).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));}
function out_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function doGet(e){return out_({drivers:rows_('drivers'),riders:rows_('riders'),notes:rows_('notes'),payments:rows_('payments')});}
function doPost(e){
  const b=JSON.parse(e.postData.contents),s=sheet_(b.table),h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];
  const find=id=>{const ids=s.getRange(1,1,s.getLastRow(),1).getValues().map(r=>String(r[0]));return ids.indexOf(String(id))+1;};
  if(b.action==='add'){b.row.created_at=new Date().toISOString();s.appendRow(h.map(k=>b.row[k]??''));}
  if(b.action==='delete'){const r=find(b.id);if(r>1)s.deleteRow(r);}
  if(b.action==='update'){const r=find(b.row.id);if(r>1)s.getRange(r,1,1,h.length).setValues([h.map((k,i)=>b.row[k]??s.getRange(r,i+1).getValue())]);}
  return out_({ok:true});
}
```

Deploy → **New deployment** → type **Web app** → Execute as **Me** → Who has access **Anyone** → Deploy → authorize → copy the **Web app URL**.

## 3. Connect
Open *Kathi 30 Website v5* → Tweaks → **Backend** → paste the URL into **sheetUrl**. Done — carpool, guest book and "I paid" now land in your Google Sheet and show for everyone (refreshes ~every 12 s). The Google Sheet itself becomes your live host sheet.

## Notes
- Guest-book photos are stored as text in the **photo** column (big cells — that's normal).
- If you edit the script later, redeploy via *Manage deployments → Edit → New version*.
