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
  function ringSticker(cls, src, objPos, text, ring, ink, style, delay, dur) {
    const id = 'ring' + (ringN++);
    const anim = (d) => `${d}s linear infinite${dur < 0 ? ' reverse' : ''}`;
    return h(`<div class="${cls}" aria-hidden="true" style="${style};animation-duration:${5 + Math.abs(delay)}s;animation-delay:${delay}s">
      <svg viewBox="0 0 200 200" style="animation:spin ${anim(Math.abs(dur))}">
        <defs><path id="${id}" d="M100,100 m-88,0 a88,88 0 1,1 176,0 a88,88 0 1,1 -176,0"/></defs>
        <circle cx="100" cy="100" r="99" fill="${ring}"/>
        <text fill="${ink}"><textPath href="#${id}" textLength="548" lengthAdjust="spacing">${esc(text)}</textPath></text>
      </svg>
      <div class="badge-photo"><img src="${src}" alt="" style="object-position:${objPos}"></div>
    </div>`);
  }
  const heroBadges = $('heroBadges');
  [
    ['assets/kathi.jpg', '50% 45%', 'BIRTHDAY GIRL ✦ TURNING 30 ✦ BIRTHDAY GIRL ✦ TURNING 30 ✦', '#e8764a', '#24221f', 'right:5%;top:30%;width:clamp(150px,20vw,270px)', 0, 16],
    ['assets/kathi-baby.jpg', '51% 18%', 'EST. 1997 ✦ BABY KATHI ✦ EST. 1997 ✦ BABY KATHI ✦', '#fbf8f4', '#24221f', 'left:4%;top:27%;width:clamp(130px,17vw,240px)', -1.7, -20],
    ['assets/kathi-bw.jpg', '58% 30%', 'CERTIFIED CHAOS ✦ 30 & THRIVING ✦ CERTIFIED CHAOS ✦ 30 & THRIVING ✦', '#24221f', '#f6f2ec', 'right:27%;top:55%;width:clamp(110px,13vw,190px)', -3.2, 12]
  ].forEach((b) => heroBadges.append(ringSticker('badge', ...b)));

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
    ['assets/gb-01.jpg', '35% 28%', '#24221f', '#f6f2ec', 'left:3%;top:6%', 'clamp(96px,13vw,170px)', 0, 16],
    ['assets/gb-02.jpg', '55% 35%', '#fbf8f4', '#24221f', 'left:6%;bottom:8%', 'clamp(90px,12vw,160px)', -1.3, -18],
    ['assets/gb-03.jpg', '40% 30%', '#e8764a', '#24221f', 'left:19%;top:40%', 'clamp(70px,8vw,110px)', -2.1, 14],
    ['assets/gb-04.jpg', '62% 58%', '#f6f2ec', '#24221f', 'right:4%;top:5%', 'clamp(96px,13vw,170px)', -0.7, -20],
    ['assets/gb-05.jpg', '45% 25%', '#24221f', '#f6f2ec', 'right:18%;top:42%', 'clamp(70px,8vw,110px)', -2.8, 17],
    ['assets/gb-06.jpg', '45% 55%', '#e8764a', '#24221f', 'right:5%;bottom:7%', 'clamp(90px,12vw,160px)', -3.5, -15],
    ['assets/gb-07.jpg', '60% 55%', '#fbf8f4', '#24221f', 'left:30%;bottom:2%', 'clamp(70px,8vw,110px)', -4.4, 13]
  ].forEach(([src, op, ring, ink, pos, size, delay, dur]) => {
    gbBadges.append(h(`<div class="gb-badge" style="${pos};width:${size};animation-duration:${5 + Math.abs(delay)}s;animation-delay:${delay}s">
      <div class="ring" style="background:repeating-conic-gradient(${ring} 0 8deg, ${ink} 8deg 10deg);animation-duration:${Math.abs(dur)}s;animation-direction:${dur < 0 ? 'reverse' : 'normal'}"></div>
      <div class="ph"><img src="${src}" alt="" loading="lazy" style="object-position:${op}"></div>
    </div>`));
  });
  const lock = ringSticker('lock-badge', 'assets/kathi.jpg', '50% 45%', 'NO PEEKING ✦ LOCKED TILL THE PARTY ✦ NO PEEKING ✦ LOCKED ✦', '#e8764a', '#24221f', '', 0, 14);
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

  function renderData() { renderCarpool(); renderNotes(); renderBring(); }

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
