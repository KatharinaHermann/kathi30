// Renders each phone hero layer (headline, 30, stickers, intro, countdown) to a transparent PNG.
// blur-layers.py then blurs them into site/assets/blur/*.webp.
//   node tools/blur-layers.js http://localhost:8799 out/ [fontsource-dir]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [,, base, out, fontDir] = process.argv;
const LAYERS = { kicker: '.hero-stack .hero-kicker', thirty: '.hero-stack .hero-30-wrap', badges: '#heroBadges', intro: '.hero-stack .hero-intro', countdown: '.hero-stack .countdown' };
const PAD = 40;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  if (fontDir) {
    // offline: serve the Google fonts from @fontsource packages
    const f = (pkg, file) => path.join(fontDir, pkg, 'files', file);
    const faces = [['Unbounded', 400, 'normal', f('unbounded', 'unbounded-latin-400-normal.woff2')], ['Unbounded', 700, 'normal', f('unbounded', 'unbounded-latin-700-normal.woff2')], ['Unbounded', 900, 'normal', f('unbounded', 'unbounded-latin-900-normal.woff2')],
      ['Instrument Sans', 400, 'normal', f('instrument-sans', 'instrument-sans-latin-400-normal.woff2')], ['Instrument Sans', 500, 'normal', f('instrument-sans', 'instrument-sans-latin-500-normal.woff2')], ['Instrument Sans', 600, 'normal', f('instrument-sans', 'instrument-sans-latin-600-normal.woff2')],
      ['Instrument Serif', 400, 'normal', f('instrument-serif', 'instrument-serif-latin-400-normal.woff2')], ['Instrument Serif', 400, 'italic', f('instrument-serif', 'instrument-serif-latin-400-italic.woff2')],
      ['JetBrains Mono', 400, 'normal', f('jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff2')], ['JetBrains Mono', 600, 'normal', f('jetbrains-mono', 'jetbrains-mono-latin-600-normal.woff2')]];
    const css = faces.map(([fam, w, st, file], i) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url(${base}/__font/${i}.woff2)}`).join('');
    await p.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: css }));
    await p.route(`${base}/__font/*`, (r) => r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(faces[Number(path.basename(r.request().url()).split('.')[0])][3]) }));
  }
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await p.addStyleTag({ content: `html.shoot, html.shoot body, html.shoot .hero { background: transparent !important; }
    html.shoot .nav, html.shoot #bg, html.shoot .sun, html.shoot .night, html.shoot .prog, html.shoot .hero-glow, html.shoot .hero > :not(.hero-stack), html.shoot .hero-stack > * { visibility: hidden !important; }
    html.shoot .hero-stack > .shoot-target { visibility: visible !important; }
    html.shoot .lyr-blur { display: none !important; }
    html.shoot *, html.shoot *::before, html.shoot *::after { animation-play-state: paused !important; transition: none !important; }` });
  await p.evaluate(() => { document.documentElement.classList.add('shoot'); scrollTo(0, 0); });
  fs.mkdirSync(out, { recursive: true });
  for (const [name, sel] of Object.entries(LAYERS)) {
    const r = await p.evaluate((sel) => { document.querySelectorAll('.shoot-target').forEach((e) => e.classList.remove('shoot-target'));
      const e = document.querySelector(sel); e.classList.add('shoot-target'); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, sel);
    await p.waitForTimeout(80);
    await p.screenshot({ path: path.join(out, name + '.png'), omitBackground: true, clip: { x: 0, y: Math.max(0, r.y - PAD), width: 390, height: r.h + 2 * PAD } });
    console.log(name, Math.round(r.w) + 'x' + Math.round(r.h));
  }
  await b.close();
})();
