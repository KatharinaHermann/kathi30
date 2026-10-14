(() => {
  'use strict';

  const cfg = window.KATHI30 || {};
  const $ = (id) => document.getElementById(id);
  const ARRIVAL = new Date(cfg.arrival || '2027-01-15T15:00:00-08:00').getTime();
  const PARTY = new Date(cfg.party || '2027-01-16T20:00:00-08:00').getTime();
  const SHEET = (cfg.sheetUrl || '').trim();
  const POLL_MS = 20000;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PACK = [
    { emoji: '🩱', label: 'Swim suit', why: 'pool + hot desert sun' },
    { emoji: '✨', label: 'Sparkly stargazing dress', why: 'Saturday night, silver & gold' },
    { emoji: '👟', label: 'Running shoes + workout fit', why: 'for the Joshua Tree hike' },
    { emoji: '🔮', label: 'Vibes', why: 'or wibes' }
  ];
  const SLIDES = [
    ['stay-01.jpg', 'Patio opening onto the kitchen, with a pool in front'],
    ['stay-02.jpg', 'Fire pit overlooking the pickleball court at sunset'],
    ['stay-03.jpg', 'Resort-style pool with loungers and cabana'],
    ['stay-04.jpg', 'Patio chairs, cabana and court under a pink sky'],
    ['stay-05.jpg', 'Pool with loungers and a wooden cabana'],
    ['stay-06.jpg', 'Pickleball court with barrel sauna and clear dome'],
    ['stay-07.jpg', 'Aerial view of the whole property in the desert'],
    ['stay-08.jpg', 'Top-down aerial of pool, court and putting green']
  ];
  const FROM = ['SF', 'LAX'];

  // ---------- small utils ----------
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 4);
  const token = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };

  let toastT;
  function toast(msg, err) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, err ? 6000 : 3500);
  }

  // ---------- config-driven links ----------
  document.querySelectorAll('[data-href]').forEach((a) => {
    const url = cfg[a.dataset.href];
    if (url) a.href = url; else a.removeAttribute('href');
  });

  // ---------- data store (Google Sheet, or this browser as a fallback) ----------
  const state = { drivers: [], riders: [], notes: [], bring: [], loaded: !SHEET };
  const mine = load('kathi30-mine', {}); // id → delete token for entries made on this device
  const pending = new Set();

  if (!SHEET) {
    ['drivers', 'riders', 'notes'].forEach((k) => { state[k] = load('kathi30-' + k, []); });
  }
  const persistLocal = () => { if (!SHEET) ['drivers', 'riders', 'notes'].forEach((k) => save('kathi30-' + k, state[k])); };

  async function api(body) {
    const r = await fetch(SHEET, { method: 'POST', body: JSON.stringify(body) }); // text/plain → no CORS preflight
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'something went wrong');
    return d;
  }

  async function refresh() {
    if (!SHEET) return;
    try {
      const d = await (await fetch(SHEET, { cache: 'no-store' })).json();
      for (const k of ['drivers', 'riders', 'notes', 'bring']) {
        const keep = state[k].filter((x) => pending.has(x.id) && !(d[k] || []).some((y) => y.id === x.id));
        state[k] = (d[k] || []).concat(keep);
      }
      state.loaded = true;
      renderData();
    } catch (e) {
      console.warn('Sheet load failed', e);
    }
  }

  async function add(table, row) {
    const t = token();
    row.id = uid();
    mine[row.id] = t; save('kathi30-mine', mine);
    if (table !== 'payments') {
      if (table === 'notes') state.notes.unshift(row); else state[table].push(row);
      if (SHEET) pending.add(row.id);
      persistLocal(); renderData();
    }
    if (!SHEET) return row;
    try {
      const res = await api({ action: 'add', table, row, token: t });
      if ('driver_id' in res && res.driver_id !== row.driver_id) {
        row.driver_id = res.driver_id;
        toast('that car just filled up — you\'re on the "still looking" list');
      }
      if (res.photo) row.photo = res.photo;
      return row;
    } catch (e) {
      if (table !== 'payments') state[table] = state[table].filter((x) => x.id !== row.id);
      toast('couldn\'t save that: ' + e.message, true);
      throw e;
    } finally {
      pending.delete(row.id);
      renderData();
      refresh();
    }
  }

  async function remove(table, id) {
    const before = { drivers: state.drivers.slice(), riders: state.riders.slice(), notes: state.notes.slice() };
    state[table] = state[table].filter((x) => x.id !== id);
    if (table === 'drivers') state.riders = state.riders.map((r) => (r.driver_id === id ? { ...r, driver_id: '' } : r));
    persistLocal(); renderData();
    if (!SHEET) return;
    try {
      await api({ action: 'delete', table, id, token: mine[id] });
      delete mine[id]; save('kathi30-mine', mine);
    } catch (e) {
      Object.assign(state, before); renderData();
      toast('couldn\'t remove that: ' + e.message, true);
    }
  }

  // ---------- hero stickers ----------
  let ringN = 0;
  // metallic ring fills for the stickers
  const METAL = {
    silver: '<stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#c9cdd5"/><stop offset=".5" stop-color="#8e939d"/><stop offset=".66" stop-color="#d3d8df"/><stop offset="1" stop-color="#f7f8fa"/>',
    blue: '<stop offset="0" stop-color="#eef4fb"/><stop offset=".45" stop-color="#c4d6ec"/><stop offset="1" stop-color="#aec5e0"/>',
    gunmetal: '<stop offset="0" stop-color="#5b606b"/><stop offset=".45" stop-color="#1c1d21"/><stop offset=".7" stop-color="#2f3238"/><stop offset="1" stop-color="#4d525d"/>'
  };
  function ringSticker(cls, src, objPos, text, ring, ink, style, delay, dur) {
    const id = 'ring' + (ringN++);
    const anim = (d) => `${d}s linear infinite${dur < 0 ? ' reverse' : ''}`;
    return h(`<div class="${cls}" aria-hidden="true" style="${style};animation-duration:${(5 + Math.abs(delay)) * 1.8}s;animation-delay:${delay}s">
      <svg viewBox="0 0 200 200" style="animation:spin ${anim(Math.abs(dur) * 2.2)}">
        <defs><path id="${id}" d="M100,100 m-88,0 a88,88 0 1,1 176,0 a88,88 0 1,1 -176,0"/>${METAL[ring] ? `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">${METAL[ring]}</linearGradient>` : ''}</defs>
        <circle cx="100" cy="100" r="99" fill="${METAL[ring] ? `url(#${id}g)` : ring}"/>
        <text fill="${ink}"><textPath href="#${id}" textLength="548" lengthAdjust="spacing">${esc(text)}</textPath></text>
      </svg>
      <div class="badge-photo"><img src="${src}" alt="" style="object-position:${objPos}"></div>
    </div>`);
  }
  const heroBadges = $('heroBadges');
  [
    ['assets/kathi.jpg', '50% 45%', 'TAP TO RSVP ✦ RSVP BY OCT 30 ✦ TAP TO RSVP ✦ RSVP BY OCT 30 ✦', '#f02719', '#ffffff', 'right:5%;top:30%;width:clamp(150px,20vw,270px)', 0, 16],
    ['assets/kathi-baby.jpg', '51% 18%', 'EST. 1997 ✦ BABY KATHI ✦ EST. 1997 ✦ BABY KATHI ✦', '#fbf8f4', '#24221f', 'left:4%;top:27%;width:clamp(130px,17vw,240px)', -1.7, -20],
    ['assets/kathi-bw.jpg', '58% 30%', 'CERTIFIED CHAOS ✦ 30 & THRIVING ✦ CERTIFIED CHAOS ✦ 30 & THRIVING ✦', '#24221f', '#f6f2ec', 'right:27%;top:55%;width:clamp(110px,13vw,190px)', -3.2, 12]
  ].forEach((b) => heroBadges.append(ringSticker('badge', ...b)));
  // the red sticker doubles as the RSVP button
  (() => {
    const old = heroBadges.firstElementChild, a = document.createElement('a');
    a.className = 'badge badge-rsvp';
    a.setAttribute('style', old.getAttribute('style'));
    a.href = cfg.partifulUrl || '#rsvp';
    if (cfg.partifulUrl) { a.target = '_blank'; a.rel = 'noopener'; }
    a.setAttribute('aria-label', 'RSVP on Partiful');
    while (old.firstChild) a.appendChild(old.firstChild);
    a.insertAdjacentHTML('beforeend', '<span class="rsvp-pill">RSVP →</span>');
    old.replaceWith(a);
  })();

  // group the 30 + photo stickers so they can stack on scroll on phones (display: contents on desktop)
  (() => {
    const hero = document.querySelector('.hero'), wrap = document.createElement('div');
    wrap.className = 'hero-stack';
    const kicker = hero.querySelector('.hero-kicker');
    hero.insertBefore(wrap, kicker);
    [kicker, hero.querySelector('.hero-30-wrap'), hero.querySelector('.hero-reflect'), $('heroBadges')].forEach((el) => wrap.appendChild(el));
  })();

  // ---------- marquee ----------
  const mq = 'KATHI x JOSHUA (TURNING 30) ✦ JAN 15—18 ✦ JOSHUA TREE ✦ RSVP BY OCT 30 ✦ ';
  $('marquee').innerHTML = `<span>${esc(mq.repeat(3))}</span><span>${esc(mq.repeat(3))}</span>`;

  // ---------- countdowns + guest book lock ----------
  let wasLocked = null;
  function tick() {
    const now = Date.now();
    const left = Math.max(0, ARRIVAL - now);
    $('cdD').textContent = Math.floor(left / 864e5);
    $('cdH').textContent = pad(Math.floor(left / 36e5) % 24);
    $('cdM').textContent = pad(Math.floor(left / 6e4) % 60);
    $('cdS').textContent = pad(Math.floor(left / 1e3) % 60);
    const locked = cfg.lockGuestbook !== false && now < PARTY;
    if (locked) {
      const l = Math.max(0, PARTY - now);
      $('gbCountdown').textContent = `${Math.floor(l / 864e5)}d ${pad(Math.floor(l / 36e5) % 24)}h ${pad(Math.floor(l / 6e4) % 60)}m`;
    }
    if (locked !== wasLocked) {
      wasLocked = locked;
      document.querySelector('.gb-wrap').classList.toggle('locked', locked);
      $('gbLock').hidden = !locked;
      $('gbOpen').hidden = locked;
    }
  }

  // ---------- guest book lock stickers ----------
  const gbBadges = $('gbBadges');
  [
    ['assets/gb-01.jpg', '35% 28%', 'KATHI 30 ✦ JOSHUA TREE ✦ KATHI 30 ✦ JOSHUA TREE ✦', 'gunmetal', '#d4d7de', 'left:3%;top:6%;width:clamp(110px,14vw,180px)', 0, 16],
    ['assets/gb-02.jpg', '55% 35%', 'MAIN CHARACTERS ✦ MAIN CHARACTERS ✦', 'silver', '#f02719', 'left:6%;bottom:8%;width:clamp(100px,13vw,170px)', -1.3, -18],
    ['assets/gb-03.jpg', '40% 30%', 'DESERT CREW ✦ DESERT CREW ✦', '#f02719', '#ffffff', 'left:19%;top:40%;width:clamp(84px,9vw,124px)', -2.1, 14],
    ['assets/gb-04.jpg', '62% 58%', 'JAN 15—18 ✦ 2027 ✦ JAN 15—18 ✦ 2027 ✦', 'blue', '#24221f', 'right:4%;top:5%;width:clamp(110px,14vw,180px)', -0.7, -20],
    ['assets/gb-05.jpg', '45% 25%', 'STARGAZING GLAM ✦ STARGAZING GLAM ✦', 'silver', '#24221f', 'right:18%;top:42%;width:clamp(84px,9vw,124px)', -2.8, 17],
    ['assets/gb-06.jpg', '45% 55%', '30 & THRIVING ✦ 30 & THRIVING ✦', '#f02719', '#ffffff', 'right:5%;bottom:7%;width:clamp(100px,13vw,170px)', -3.5, -15],
    ['assets/gb-07.jpg', '60% 55%', 'NO PEEKING ✦ NO PEEKING ✦ NO PEEKING ✦', 'blue', '#f02719', 'left:30%;bottom:2%;width:clamp(84px,9vw,124px)', -4.4, 13]
  ].forEach(([src, op, text, ring, ink, style, delay, dur]) => gbBadges.append(ringSticker('gb-badge', src, op, text, ring, ink, style, delay, dur)));
  const lock = ringSticker('lock-badge', 'assets/kathi.jpg', '50% 45%', 'NO PEEKING ✦ LOCKED TILL THE PARTY ✦ NO PEEKING ✦ LOCKED ✦', '#f02719', '#ffffff', '', 0, 14);
  lock.firstElementChild.append(h('<span class="lock-icon">🔒</span>'));
  $('lockBadge').replaceWith(lock);

  // ---------- trailer ----------
  function embedUrl(u) {
    let m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + '?rel=0';
    m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return 'https://player.vimeo.com/video/' + m[1];
    return u;
  }
  if (cfg.trailerUrl && $('trailer')) {
    $('trailer').innerHTML = `<iframe src="${esc(embedUrl(cfg.trailerUrl))}" title="Trailer" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
  }

  // ---------- carousel ----------
  let slide = 0, lastNav = 0;
  $('slides').innerHTML = SLIDES.map(([src, alt], i) => `<img src="assets/${src}" alt="${esc(alt)}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} class="${i ? '' : 'on'}">`).join('');
  $('dots').innerHTML = SLIDES.map((_, i) => `<button type="button" aria-label="go to photo ${i + 1}" class="${i ? '' : 'on'}"></button>`).join('');
  const slideImgs = [...$('slides').children], dots = [...$('dots').children];
  function go(i, user) {
    if (user) lastNav = Date.now();
    slide = (i + SLIDES.length) % SLIDES.length;
    slideImgs.forEach((im, k) => im.classList.toggle('on', k === slide));
    dots.forEach((d, k) => d.classList.toggle('on', k === slide));
    $('slideNum').textContent = `${slide + 1} / ${SLIDES.length}`;
  }
  $('prevSlide').onclick = () => go(slide - 1, true);
  $('nextSlide').onclick = () => go(slide + 1, true);
  dots.forEach((d, i) => { d.onclick = () => go(i, true); });
  let tx = null;
  $('carousel').addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  $('carousel').addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 40) go(slide + (dx < 0 ? 1 : -1), true);
  });
  if (!reduceMotion) setInterval(() => { if (Date.now() - lastNav > 8000 && !document.hidden) go(slide + 1); }, 5000);

  // ---------- pay ----------
  function renderPay() {
    const thanks = load('kathi30-paid', '');
    $('payBox').innerHTML = thanks
      ? `<div class="pay-thanks"><span class="form-title" style="font-size:22px">thank you, ${esc(thanks)} 🫶</span><span style="font-size:15px;color:var(--muted)">Kathi will confirm once it lands.</span></div>`
      : `<form class="pay-form" id="payForm"><span class="form-title">sent it? ✓</span>
          <input name="name" class="dinput" placeholder="your name" required maxlength="80" aria-label="your name">
          <button type="submit" class="submit mono btn-red">I paid</button></form>`;
    const f = $('payForm');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const name = f.name.value.trim(); if (!name) return;
      f.querySelector('button').disabled = true;
      try { await add('payments', { name, method: 'Venmo/PayPal' }); save('kathi30-paid', name); renderPay(); }
      catch (err) { f.querySelector('button').disabled = false; }
    };
  }
  renderPay();

  // ---------- carpool ----------
  const choice = { dFrom: 'SF', rFrom: 'LAX' };
  function renderChoices() {
    document.querySelectorAll('[data-choice]').forEach((box) => {
      const key = box.dataset.choice;
      box.innerHTML = FROM.map((f) => `<button type="button" class="choice${choice[key] === f ? ' on' : ''}" data-v="${f}" aria-pressed="${choice[key] === f}">${f}</button>`).join('');
      box.querySelectorAll('button').forEach((b) => { b.onclick = () => { choice[key] = b.dataset.v; renderChoices(); }; });
    });
  }
  renderChoices();
  let seats = 3;
  const setSeats = (n) => { seats = Math.max(1, Math.min(7, n)); $('seatsNum').textContent = seats; };
  $('seatsDown').onclick = () => setSeats(seats - 1);
  $('seatsUp').onclick = () => setSeats(seats + 1);

  $('driverForm').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim(); if (!name) return;
    add('drivers', { name, origin: choice.dFrom, seats, leaving: f.when.value.trim() }).catch(() => {});
    f.reset(); setSeats(3);
  };
  $('riderForm').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim(); if (!name) return;
    add('riders', { name, origin: choice.rFrom, details: f.details.value.trim(), driver_id: f.driver.value }).catch(() => {});
    f.reset();
  };

  const ridersOf = (id) => state.riders.filter((r) => r.driver_id === id);
  const xBtn = (table, id, label) => (mine[id] ? `<button type="button" class="x" data-del="${table}:${esc(id)}" aria-label="${esc(label)}">×</button>` : '');

  function renderCarpool() {
    const drivers = state.drivers;
    const totalOpen = drivers.reduce((a, d) => a + Math.max(0, Number(d.seats) - ridersOf(d.id).length), 0);
    $('seatSummary').textContent = drivers.length
      ? `${drivers.length} car${drivers.length > 1 ? 's' : ''} · ${totalOpen} open seat${totalOpen === 1 ? '' : 's'}`
      : 'drivers + riders, find each other';

    const sel = $('driverSelect'), cur = sel.value;
    const open = drivers.filter((d) => ridersOf(d.id).length < Number(d.seats));
    sel.innerHTML = '<option value="">no preference — match me later</option>' +
      open.map((d) => `<option value="${esc(d.id)}">ride with ${esc(d.name)} (${esc(d.origin)}, ${Number(d.seats) - ridersOf(d.id).length} open)</option>`).join('');
    if (open.some((d) => d.id === cur)) sel.value = cur;

    $('board').innerHTML = !state.loaded
      ? '<div class="board-empty">loading the board…</div>'
      : !drivers.length
        ? '<div class="board-empty">no cars yet — first driver gets aux privileges 🎶</div>'
        : drivers.map((d) => {
          const rs = ridersOf(d.id), n = Number(d.seats) || 0, left = n - rs.length;
          return `<div class="car${pending.has(d.id) ? ' pending' : ''}">
            <div class="car-head"><div class="col" style="gap:2px"><span class="car-name">${esc(d.name)}</span><span class="mono-plain small">from ${esc(d.origin)} → JT${d.leaving ? ' · ' + esc(d.leaving) : ''}</span></div>${xBtn('drivers', d.id, 'remove my car')}</div>
            <div class="seat-dots">${Array.from({ length: n }, (_, i) => `<span class="${i < rs.length ? 'taken' : ''}"></span>`).join('')}</div>
            <span class="mono-plain small">${left > 0 ? `${left} of ${n} seat${n > 1 ? 's' : ''} open` : 'car full 🎉'}</span>
            <span style="font-size:14px;line-height:1.4">${rs.length ? 'riding: ' + rs.map((r) => esc(r.name) + (r.details ? ` (${esc(r.details)})` : '') + xBtn('riders', r.id, 'leave this car')).join(', ') : 'no riders yet'}</span>
          </div>`;
        }).join('');

    const looking = state.riders.filter((r) => !r.driver_id || !drivers.some((d) => d.id === r.driver_id));
    $('looking').hidden = !looking.length;
    $('looking').innerHTML = '<span class="mono-plain small ls08" style="margin-right:6px">STILL LOOKING:</span>' +
      looking.map((r) => `<span class="looking-pill${mine[r.id] ? ' mine' : ''}${pending.has(r.id) ? ' pending' : ''}">${esc(r.name)} · from ${esc(r.origin)}${r.details ? ' · ' + esc(r.details) : ''}${mine[r.id] ? `<button type="button" data-del="riders:${esc(r.id)}" aria-label="remove me">×</button>` : ''}</span>`).join('');
  }

  // ---------- guest book notes ----------
  let photo = '';
  $('photoInput').onchange = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      photo = c.toDataURL('image/jpeg', 0.8); URL.revokeObjectURL(url);
      $('photoLabel').textContent = 'photo added ✓';
    };
    img.onerror = () => toast('that photo didn\'t load — try a JPG or PNG', true);
    img.src = url;
  };
  $('noteForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim(), msg = f.msg.value.trim(); if (!name || !msg) return;
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await add('notes', { name, msg, photo });
      f.reset(); photo = ''; $('photoLabel').textContent = '+ add a photo';
    } catch (err) { /* toast already shown, keep the text */ }
    btn.disabled = false;
  };
  const ROT = [-2, 1.5, -1, 2.5];
  function renderNotes() {
    $('notes').innerHTML = !state.notes.length
      ? '<div class="notes-empty">the guest book is empty. be the main character.</div>'
      : state.notes.map((n, i) => `<div class="note${pending.has(n.id) ? ' pending' : ''}" style="rotate:${ROT[i % 4]}deg">
          ${n.photo ? `<img src="${esc(n.photo)}" alt="" loading="lazy" data-drive>` : ''}
          <span class="note-msg">${esc(n.msg)}</span>
          <div class="note-foot"><span>— ${esc(n.name)}</span>${xBtn('notes', n.id, 'remove my note')}</div>
        </div>`).join('');
    $('notes').querySelectorAll('img[data-drive]').forEach((im) => {
      im.onerror = () => { // Drive thumbnail hiccup → try the direct image host once
        const m = im.src.match(/[?&]id=([\w-]+)/);
        if (m && !im.dataset.retried) { im.dataset.retried = 1; im.src = 'https://lh3.googleusercontent.com/d/' + m[1] + '=w1000'; }
      };
    });
  }

  // ---------- who brings what ----------
  function renderBring() {
    const items = state.bring.filter((b) => b.item);
    const open = items.filter((b) => !String(b.who || '').trim()).length;
    $('bringCount').textContent = items.length ? (open ? `${open} up for grabs` : 'all covered ✓') : '';
    $('bringList').innerHTML = !state.loaded
      ? '<div class="bring-empty">loading…</div>'
      : !items.length
        ? '<div class="bring-empty">Kathi is still putting the list together — check back soon.</div>'
        : items.map((b) => {
          const who = String(b.who || '').trim();
          return `<div class="bring-item"><span class="pack-label">${esc(b.item)}</span>
            <span class="bring-who${who ? '' : ' open'}">${who ? esc(who) : 'up for grabs — tell Kathi'}</span>
            ${b.note ? `<span class="bring-note">${esc(b.note)}</span>` : ''}</div>`;
        }).join('');
  }

  // ---------- pack list (per device) ----------
  let packed = load('kathi30-packed', []);
  function renderPack() {
    $('packList').innerHTML = PACK.map((p, i) => {
      const on = packed.includes(i);
      return `<button type="button" class="pack-item${on ? ' on' : ''}" data-i="${i}" aria-pressed="${on}">
        <span class="pack-box">${on ? '✓' : ''}</span><span style="font-size:22px">${p.emoji}</span>
        <span class="col" style="gap:2px"><span class="pack-label">${esc(p.label)}</span><span style="font-size:14px">${esc(p.why)}</span></span></button>`;
    }).join('');
    $('packCount').textContent = `${packed.length}/${PACK.length} packed`;
  }
  $('packList').onclick = (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const i = Number(b.dataset.i);
    packed = packed.includes(i) ? packed.filter((x) => x !== i) : packed.concat(i);
    save('kathi30-packed', packed); renderPack();
  };
  renderPack();

  // delete buttons (carpool + notes)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const [table, id] = b.dataset.del.split(':');
    remove(table, id);
  });

  function renderData() { renderCarpool(); renderNotes(); renderBring(); if (window.restackLight) window.restackLight(); }

  // ---------- scroll: parallax, setting sun, night, progress ----------
  const bg = $('bg'), sun = $('sun'), sunhot = $('sunhot'), night = $('night'), stars = $('stars'), prog = $('prog');
  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = scrollY, H = document.documentElement.scrollHeight - innerHeight;
    const pp = H > 0 ? Math.min(1, y / H) : 0;
    if (!reduceMotion) bg.style.transform = `translate3d(0,${-Math.min(y * 0.06, innerHeight * 0.08)}px,0) scale(${1.06 + Math.min(y, 4000) * 0.00004})`;
    sun.style.transform = `translate(-50%,${16 + Math.min(1, pp * 1.25) * 78}vh) scale(${1 + pp * 0.4})`;
    sunhot.style.opacity = String(Math.min(1, pp * 1.4));
    const nt = Math.max(0, Math.min(1, (pp - 0.25) / 0.55));
    night.style.opacity = String(nt * 0.9);
    stars.style.opacity = String(Math.max(0, (nt - 0.4) / 0.6));
    prog.style.transform = `scaleX(${pp})`;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // ---------- phones: stacked cards ----------
  // Pure CSS sticky stacking (no scroll handlers, so it stays smooth). JS only measures on load/resize:
  // equal card heights per stack, and where each stack sticks (below the menu, and below the section
  // title when the title sticks too).
  const nav = document.querySelector('.nav');
  // On phones a stack section pins as a whole: whatever sits above the cards (title, labels) is
  // wrapped in .stick-head and sticks under the menu, the cards stick right below it, and a margin
  // trick makes the title let go at exactly the moment the last card does, so they leave together.
  document.querySelectorAll('.stack').forEach((g) => {
    const before = [];
    for (let el = g.previousElementSibling; el; el = el.previousElementSibling) before.unshift(el);
    if (!before.length || before[0].classList.contains('stick-head')) return;
    const head = document.createElement('div');
    head.className = 'stick-head';
    g.parentNode.insertBefore(head, before[0]);
    before.forEach((el) => head.appendChild(el));
  });
  function sizeStacks() {
    const mobile = innerWidth <= 640;
    const navH = nav ? nav.offsetHeight : 90;
    const GAP = 14, STEP = 10, FLOW = 16;
    document.documentElement.style.setProperty('--nav-h', navH + 'px');
    document.querySelectorAll('.stack').forEach((g) => {
      const kids = [...g.children];
      const head = g.previousElementSibling && g.previousElementSibling.classList.contains('stick-head') ? g.previousElementSibling : null;
      kids.forEach((c, i) => { c.style.setProperty('--i', i); c.style.minHeight = ''; ['top', 'margin-top', 'margin-bottom'].forEach((k) => c.style.removeProperty(k)); });
      if (head) { head.style.removeProperty('margin-bottom'); head.classList.remove('is-sticky'); }
      g.style.removeProperty('margin-top');
      if (!mobile) return;
      const n = kids.length, cardH = Math.max(0, ...kids.map((c) => c.offsetHeight));
      kids.forEach((c) => { c.style.minHeight = cardH + 'px'; });
      // every card gets exactly enough bottom margin to stay pinned until the last card lands,
      // and the next card pulls back up by the extra so the resting gap stays FLOW
      kids.forEach((c, i) => {
        const mb = STEP * (n - 1 - i);
        c.style.setProperty('margin-bottom', mb + 'px', 'important');
        if (i) c.style.setProperty('margin-top', FLOW - STEP * (n - i) + 'px', 'important');
      });
      const headTop = navH + 10;
      const fits = head && head.offsetHeight + GAP + cardH + STEP * (n - 1) <= document.documentElement.clientHeight - headTop - 8;
      let stackTop = headTop;
      if (fits) {
        head.classList.add('is-sticky');
        head.style.top = headTop + 'px';
        // space between the stack and the end of the box the title is pinned in
        const par = g.parentNode, pcs = getComputedStyle(par);
        const contentBottom = par.getBoundingClientRect().bottom - (parseFloat(pcs.paddingBottom) || 0) - (parseFloat(pcs.borderBottomWidth) || 0);
        const extra = Math.max(0, contentBottom - g.getBoundingClientRect().bottom);
        const mb = GAP + STEP * (n - 1) + cardH + extra;   // title lets go exactly when the last card lands
        head.style.setProperty('margin-bottom', mb + 'px', 'important');
        g.style.setProperty('margin-top', GAP - mb + 'px', 'important');
        stackTop = headTop + head.offsetHeight + GAP;
      }
      g.style.setProperty('--stack-top', stackTop + 'px');
      kids.forEach((c, i) => c.style.setProperty('top', stackTop + STEP * i + 'px', 'important'));
    });
  }
  // hero on phones: the headline pins, the 30 slides onto it, then the sticker row, the intro text and the countdown;
  // all three release together
  const heroIntro = document.querySelector('.hero-intro'), heroCd = document.querySelector('.hero-bottom .countdown'), heroBottom = document.querySelector('.hero-bottom');
  function sizeHero() {
    const stack = document.querySelector('.hero-stack');
    const w30 = document.querySelector('.hero-stack .hero-30-wrap'), row = $('heroBadges');
    if (!stack || !w30 || !row || !heroIntro) return;
    const mobile = innerWidth <= 640 && !reduceMotion;
    if (mobile && heroIntro.parentNode !== stack) stack.append(heroIntro, heroCd);
    if (!mobile && heroIntro.parentNode !== heroBottom) heroBottom.append(heroIntro, heroCd);
    heroBottom.hidden = mobile;
    // phones: the banner is the last layer of the stack
    const mq = document.querySelector('.marquee'), heroEl = document.querySelector('.hero');
    if (mq && mobile && mq.parentNode !== stack) stack.appendChild(mq);
    if (mq && !mobile && mq.parentNode === stack) heroEl.after(mq);
    const kicker = stack.querySelector('.hero-kicker');
    const layers = [kicker, w30, row, heroIntro, heroCd, document.querySelector('.marquee')];
    layers.forEach((el) => ['top', 'margin-top', 'margin-bottom'].forEach((k) => el.style.removeProperty(k)));
    stack.style.removeProperty('margin-bottom');
    if (!mobile) return;
    const navH = nav ? nav.offsetHeight : 90;
    const t30 = navH + 6;
    const H = layers.map((el) => el.offsetHeight);
    const G = [0, 8, -28, 22, 22, 18];                    // resting gap before each layer (stickers overlap the 30 a bit)
    const tCd = t30 + 34 + H[3] - 44;
    const T = [t30, t30 + 8, t30 + 4, t30 + 34, tCd, tCd + Math.round(H[4] * .45)]; // where each layer pins: headline, 30, stickers at the ceiling, text, countdown over the text's last line, banner over the countdown
    const R = Math.max(...T.map((t, i) => t + H[i]));
    const MB = T.map((t, i) => R - t - H[i]);         // pads every layer so they all let go at the same moment
    layers.forEach((el, i) => {
      el.style.top = T[i] + 'px';
      el.style.setProperty('margin-bottom', MB[i] + 'px', 'important');
      if (i) el.style.setProperty('margin-top', G[i] - MB[i - 1] + 'px', 'important');
    });
    stack.style.marginBottom = -MB[MB.length - 1] + 'px';  // the release padding under the banner stays invisible
  }
  // hero only: each incoming layer carries a frosted veil (CSS backdrop blur) that frosts whatever it slides over.
  // No per-frame work: JS only switches the veils on once the page has been scrolled.
  function coverFx() {
    const st = document.querySelector('.hero-stack');
    if (st) st.classList.toggle('is-stacking', innerWidth <= 640 && !reduceMotion && scrollY > 6);
  }
  addEventListener('scroll', coverFx, { passive: true });
  window.restackLight = () => { sizeStacks(); sizeHero(); coverFx(); };
  // iPhone fires resize whenever the toolbar slides in/out while scrolling; only re-measure on a real width change
  let lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; sizeHero(); sizeStacks(); coverFx(); });
  addEventListener('load', sizeHero);
  sizeHero();
  addEventListener('load', sizeStacks);
  sizeStacks();

  // ---------- reveal on scroll ----------
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach((el) => { el.classList.add('pre'); io.observe(el); });
  }

  // ---------- go ----------
  tick(); setInterval(tick, 1000);
  renderData();
  if (SHEET) {
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  } else {
    console.info('KATHI30: no sheetUrl in config.js — carpool + guest book save in this browser only.');
  }
})();

// deal cards start on the middle (RSVP) card on phones
(() => {
  const row = document.getElementById('dealRow');
  if (!row) return;
  const center = () => {
    const mid = row.children[1];
    if (!mid || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = mid.offsetLeft - (row.clientWidth - mid.offsetWidth) / 2;
  };
  center();
  addEventListener('load', center);
})();

// liquid chrome headlines: every title is spelled with the Etsy chrome letter images.
// The real text stays as the heading's accessible name; the images are decoration.
(() => {
  const silverKicker = true; // headline uses the regular silver font
  // ?black previews the headline in solid black (?allblack also turns the x black)
  if (/(^|[?&])(all)?black\b/.test(location.search)) document.documentElement.classList.add('kicker-black');
  if (/(^|[?&])allblack\b/.test(location.search)) document.documentElement.classList.add('kicker-allblack');
  if (silverKicker) document.documentElement.classList.add('kicker-silver');
  const hosts = document.querySelectorAll(silverKicker ? '.h2, .h2-car, .rsvp-big' : '.hero-kicker, .h2, .h2-car, .rsvp-big');
  const GW = {'A':279,'B':195,'C':195,'D':186,'E':196,'F':156,'G':213,'H':211,'I':104,'J':184,'K':210,'L':188,'M':248,'N':217,'O':196,'P':175,'Q':198,'R':207,'S':215,'T':212,'U':206,'V':230,'W':280,'X':228,'Y':178,'Z':215,'0':208,'1':227,'2':253,'3':210,'4':251,'5':222,'6':218,'7':191,'8':231,'9':182}; // letter widths at 280px tall, so the layout is right before the images arrive
  const glyph = (c) => (/[A-Z0-9]/.test(c) ? `<img class="el" src="assets/etsy/${c}.webp" alt="" width="${GW[c]}" height="280">` : `<span class="el-p">${c}</span>`);
  hosts.forEach((h) => {
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    h.classList.add('etsy-type');
    const walk = (el) => [...el.childNodes].forEach((n) => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const words = n.textContent.toUpperCase().split(/(\s+)/);
        const html = words.map((w) => (/^\s+$/.test(w) ? '<span class="el-sp"> </span>' : w ? `<span class="el-w" aria-hidden="true">${[...w].map(glyph).join('')}</span>` : '')).join('');
        const t = document.createElement('template'); t.innerHTML = html; n.replaceWith(t.content);
      } else if (n.nodeType === 1 && !n.classList.contains('kx')) walk(n);
    });
    walk(h);
  });
  // titles grow to fill the width (one line each), up to a cap
  const fitTitles = () => {
    const phone = innerWidth <= 640;
    document.querySelectorAll('.etsy-type.h2, .etsy-type.h2-car, .etsy-type.rsvp-big').forEach((h) => {
      const rsvp = h.classList.contains('rsvp-big');
      if (!phone && !rsvp) { h.style.removeProperty('font-size'); return; }
      const box = h.parentElement, cs = getComputedStyle(box);
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
      h.style.setProperty('font-size', '100px', 'important');
      const w = [...h.querySelectorAll('.el-w, .el-sp, .kx')].reduce((t, e) => t + e.getBoundingClientRect().width, 0);
      const cap = rsvp ? (phone ? 92 : 150) : 64;
      h.style.setProperty('font-size', Math.min(cap, Math.floor(100 * avail / w)) + 'px', 'important');
    });
  };
  fitTitles();
  let fitW = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== fitW) { fitW = innerWidth; fitTitles(); if (window.restackLight) window.restackLight(); } });
  if (window.restackLight) window.restackLight();
  // letters arrive after layout: re-measure the phone stacks once they are in
  let left = document.querySelectorAll('img.el').length;
  const done = () => { if (--left === 0 && window.restackLight) window.restackLight(); };
  document.querySelectorAll('img.el').forEach((im) => (im.complete ? done() : (im.addEventListener('load', done), im.addEventListener('error', done))));
})();
