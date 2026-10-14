# Kathi x Josh 30 — going live

About 15 minutes. You need a Google account and (for hosting) a free Netlify account.

## 1. Create the Google Sheet + backend (~8 min)

1. Go to <https://sheets.new> and name the sheet e.g. **Kathi 30 — Host Sheet**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs`, paste the full contents of
   [`backend/Code.gs`](backend/Code.gs), and click 💾 **Save**.
3. In the function dropdown at the top pick **`setup`** → **Run**. Google will ask for permission
   (it needs your Sheets, plus Drive so it can store guest-book photos). Click through
   *Advanced → Go to project (unsafe)*. That's normal for your own scripts.
   → All tabs are created with headers, checkboxes and formulas.
4. **Deploy → New deployment** → ⚙️ type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   → **Deploy** → copy the **Web app URL** (ends in `/exec`).

> Changed the script later? **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
> The URL stays the same.

## 2. Connect the website (1 min)

Open [`site/config.js`](site/config.js) and paste the URL:

```js
sheetUrl: 'https://script.google.com/macros/s/AKfy.../exec',
```

All other links (Partiful, WhatsApp, Venmo, PayPal, Spotify) are already in that file. Add the
trailer there too once it exists (`trailerUrl`, YouTube or Vimeo link).

## 3. Put it online (2 min)

**Netlify Drop:** go to <https://app.netlify.com/drop> and drag the **`site`** folder onto the page.
You get a link like `kathi30.netlify.app` (rename it under *Site configuration → Change site name*).
To update the site later, open the site in Netlify → *Deploys* → drag the folder again.

(Or connect this GitHub repo in Netlify: `netlify.toml` already says to publish `site/`.)

## What lives where in the Sheet

| Tab | Who fills it | What it's for |
|---|---|---|
| **dashboard** | formulas | headcount, $ expected / confirmed / outstanding, who still owes, carpool gaps, unassigned "bring" items |
| **rsvps** | you / Partiful sync | the guest list. Tick **paid_confirmed** when money lands. `amount_due`, `payment_reported`, `carpool` fill in by themselves (grey headers — don't type there) |
| **payments** | website | every "I paid" click. Tick **confirmed** after checking Venmo/PayPal |
| **drivers / riders** | website | the carpool board. Edit or delete rows freely; the site updates within ~20 s |
| **notes** | website | guest book (opens Sat Jan 16, 8pm PT). Photos go to a Drive folder *Kathi 30 — guest book photos* |
| **bring** | **you, by hand** | `item` · `who` · `note`. Shown on the site under "who's bringing what". Leave `who` empty → shows as *up for grabs* |
| **partiful_import** | you | landing spot for the Partiful CSV (see below) |

### Pulling RSVPs from Partiful
Partiful has no API, so it's a 3-click import whenever you want fresh numbers:
1. Partiful → your event → **Guest List → Export CSV**.
2. In the Sheet, open the **partiful_import** tab → **File → Import → Upload** → pick the CSV →
   *Import location:* **Replace current sheet**.
3. Menu **Kathi 30 → Sync Partiful import → rsvps**. New guests are added, status and +1s are
   updated, your paid ticks and notes are never touched.

Statuses are normalised to `going / maybe / not going / invited`. If Partiful's columns are named
differently than expected, the sync tells you which headers it saw.

## Good to know
- **Nobody can delete other people's entries.** Each browser gets a secret key for the entries
  it created, so the × only appears on your own car / ride / note. You can always delete anything
  directly in the Sheet.
- **Payments are private.** The website only *writes* to `payments` and `rsvps` is never sent
  to the browser; only carpool, guest book and the bring list are public.
- If a car fills up while someone is signing up, they land on the "still looking" list instead.
- Guest-book lock: change `party` / `lockGuestbook` in `site/config.js` **and**
  `GUESTBOOK_OPENS` in `Code.gs` if the party time moves.
- Nice WhatsApp link preview: once you have the final URL, change `content="assets/og.jpg"` in
  `site/index.html` to the full address, e.g. `https://kathi30.netlify.app/assets/og.jpg`.
- Without a `sheetUrl` the site still works, but carpool / guest book only save in each visitor's own browser.
