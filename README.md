# Kathi x Josh — turning 30 🏜️

Party website for Joshua Tree, Jan 15–18 2027, built from the Claude Design "v5" mock-up
(`project/Kathi 30 Website v5.dc.html`), with a Google Sheet as the backend.

**→ To go live, follow [SETUP.md](SETUP.md).**

```
site/              the website — static, no build step (drag this folder onto Netlify Drop)
  config.js        all links + the Google Sheet URL live here
  index.html       markup
  styles.css       the v5 look (chrome, glass panels, setting-sun → night background)
  app.js           countdown, carousel, carpool board, guest book, pay form, pack + bring lists
  assets/          web-optimised photos (2.4 MB total; the dance GIF is now a 370 KB mp4)
backend/Code.gs    Google Apps Script: web API + host dashboard + Partiful CSV sync
project/, chats/   the original Claude Design handoff (reference only)
```

What's shared through the Sheet:

- **RSVP list**: Partiful CSV → `partiful_import` tab → menu *Kathi 30 → Sync*. Private.
- **Payments**: the "I paid" form writes to `payments`; Kathi ticks `paid_confirmed`. Private.
- **Carpool**: drivers + riders, live for everyone, seat limits enforced server-side.
- **Who brings what**: Kathi types it into the `bring` tab; shown read-only on the site.
- **Guest book**: locked until Sat Jan 16, 8pm PT; photos stored in Drive.

Preview locally: `cd site && python3 -m http.server` → <http://localhost:8000>.
