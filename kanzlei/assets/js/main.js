/* ==========================================================================
   Kanzlei – Interaktion
   1. Header, Navigation
   2. Einblenden beim Scrollen, Scroll-Szene mit der Justitia
   3. Kontaktformular
   Keine Cookies, kein Tracking, keine externen Bibliotheken.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------
     2. Header, Navigation, Einblendungen
     ------------------------------------------------------------------ */
  requestAnimationFrame(() => root.classList.add('is-loaded'));

  // Weiches Scrollen (Lenis, lokal eingebunden). Bei „Bewegung reduzieren“ aus.
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (window.Lenis && !reduceMotion && finePointer) {
    const lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true });
    // Die Schleife läuft nur, solange gescrollt wird – sonst ruht die Seite komplett
    let looping = false, quiet = 0;
    const loop = (t) => {
      lenis.raf(t);
      quiet = lenis.isScrolling ? 0 : quiet + 1;
      if (quiet > 20) { looping = false; return; }
      requestAnimationFrame(loop);
    };
    const wake = () => { quiet = 0; if (!looping) { looping = true; requestAnimationFrame(loop); } };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    window.lenisWake = wake;
    wake();
    window.lenis = lenis;
  }

  // Sprungmarken (Menü, Buttons): eigener, zuverlässiger Handler – mit und ohne Lenis
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 ? document.querySelector(id) : null;
    if (!target && id !== '#top' && id !== '#') return;
    e.preventDefault();
    const y = target && id !== '#top' ? Math.max(0, target.getBoundingClientRect().top + window.scrollY - 80) : 0;
    if (window.lenis) { if (window.lenisWake) window.lenisWake(); window.lenis.scrollTo(y, { duration: 1.2, force: true }); }
    else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (history.replaceState) history.replaceState(null, '', id);
  });

  const header = document.querySelector('[data-header]');
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (!header) return;
    header.classList.toggle('is-scrolled', y > 20);
    const navOpen = document.body.classList.contains('nav-open');
    // Schon nach wenigen Pixeln nach unten ausblenden, nur beim Hochscrollen wieder zeigen
    if (navOpen || y < 24) header.classList.remove('is-hidden');
    else if (y > lastY + 2) header.classList.add('is-hidden');
    else if (y < lastY - 6) header.classList.remove('is-hidden');
    lastY = y;
  }, { passive: true });

  // Mobile Navigation
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    const setOpen = (open) => {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    };
    toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  // Staffelung: Geschwister-Elemente erscheinen nacheinander (120 ms Abstand, wie bei VANA)
  document.querySelectorAll('.reveal').forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    const i = Math.min(sibs.indexOf(el), 5);
    if (i > 0) el.style.setProperty('--reveal-delay', i * 120 + 'ms');
  });

  // Einblenden + aktiver Menüpunkt
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    document.querySelectorAll('.reveal, .step').forEach((el) => io.observe(el));

    const links = new Map([...document.querySelectorAll('.site-nav a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const a = links.get(e.target.id);
        if (a && e.isIntersecting) { links.forEach((l) => l.classList.remove('is-active')); a.classList.add('is-active'); }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  } else {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in-view'));
  }

  /* ------------------------------------------------------------------
     Scroll-Szene (Justitia): Fortschritt p = 0…1 über die Höhe der Szene.
     Steuert Text, Rahmen, großes Wort, Linien, Wort-Einfärbung und das
     Layout der Statue (das 3D-Modul in statue.js liest window.sceneState).
     ------------------------------------------------------------------ */
  const sceneEl = document.querySelector('[data-scene]');
  if (sceneEl) {
    const sticky = sceneEl.querySelector('[data-scene-sticky]');
    const copy = document.querySelector('[data-hero-copy]');
    const copyBtn = copy && copy.querySelector('.btn');
    const side = sceneEl.querySelector('[data-side]');
    const badges = sceneEl.querySelector('[data-badges]');
    const layer = document.querySelector('[data-statue-layer]') || sticky;
    const posterEl = layer.querySelector('[data-poster]');
    const canvasEl = layer.querySelector('[data-canvas]');
    const blurEl = layer.querySelector('[data-blur]');
    const fadeEl = layer.querySelector('[data-fade]');
    const touch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let textH = 0;
    const textEl = sceneEl.querySelector('[data-scene-text]');
    const lines = [...layer.querySelectorAll('[data-line]')];
    const lineData = lines.map((l) => ({ l, a: l.dataset.from.split(' ').map(Number), b: l.dataset.to.split(' ').map(Number) }));

    // Wörter einzeln einfärbbar machen
    const words = [];
    if (textEl) {
      const wrap = (node, accent) => {
        [...node.childNodes].forEach((c) => {
          if (c.nodeType === 3) {
            const frag = document.createDocumentFragment();
            c.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
              const sp = document.createElement('span'); sp.className = 'w' + (accent ? ' accent' : ''); sp.textContent = part;
              frag.appendChild(sp); words.push(sp);
            });
            c.replaceWith(frag);
          } else if (c.nodeType === 1) wrap(c, accent || c.classList.contains('accent'));
        });
      };
      wrap(textEl, false);
    }

    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const seg = (p, a, b) => clamp((p - a) / (b - a));
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const mix = (a, b, t) => a + (b - a) * t;
    const ASPECT = 0.74; // Breite/Höhe der Statue (ungefähr, inkl. Waage)

    let vw = innerWidth, vh = sticky.clientHeight, t0 = 0.5, copyTop = 0, copyH = 0;
    const measure = () => {
      vw = innerWidth; vh = sticky.clientHeight;
      if (window.sceneState) window.sceneState.vh = vh;
      // offsetTop/-Height sind unabhängig von der laufenden transform-Animation
      copyTop = copy.offsetTop; copyH = copy.offsetHeight;
      if (textEl) textH = textEl.offsetHeight;   // einmal messen statt bei jedem Bild
      t0 = clamp((copyTop + copyH + Math.max(28, 0.04 * vh)) / vh, 0.3, 0.8);   // Mindestabstand zum Button
    };

    // Statue: Oberkante t und Höhe h als Anteil der Viewporthöhe
    const layout = (p) => {
      const k = ease(seg(p, 0, 0.5));
      const maxH = (vw * 1.0) / (ASPECT * vh);           // auf schmalen Screens nicht breiter als der Screen
      const h0 = Math.min(Math.max(0.62, 1.06 - t0), maxH * 1.1);
      const h1 = Math.min(vw < 760 ? 0.72 : 0.86, maxH);
      return { t: mix(t0, vw < 760 ? 0.1 : 0.05, k), h: mix(h0, h1, k) };
    };

    const state = { p: 0, q: 0, layout, vh: 0 };
    window.sceneState = state;
    state.vh = vh;

    // p: Fortschritt innerhalb der Szene, q: Übergang zum unscharfen Hintergrund danach
    let target = 0, cur = 0, targetQ = 0, curQ = 0, raf = 0;
    const readScroll = () => {
      const r = sceneEl.getBoundingClientRect();
      const total = sceneEl.offsetHeight - vh;
      target = clamp(-r.top / Math.max(1, total));
      targetQ = clamp((-r.top - total) / (vh * 0.7));
    };

    const apply = () => {
      const p = cur, q = curQ; state.p = p; state.q = q;
      const st = sticky.style, ls = layer.style;
      const k = ease(seg(p, 0, 0.5));
      // Headline: bleibt mittig, sinkt in die Tiefe (kleiner, unscharf), liegt hinter der Statue
      // und verschwindet, sobald der nächste Text beginnt.
      const kd = ease(seg(p, 0, 0.42));
      const dy = (vh * (vw < 760 ? 0.36 : 0.4) - (copyTop + copyH / 2)) * kd;
      const fadeOut = 1 - ease(seg(p, 0.4, 0.52));
      const cop = (1 - 0.5 * kd) * fadeOut * (1 - q);
      copy.style.transform = 'translate3d(0,' + dy.toFixed(1) + 'px,0) scale(' + (1 - 0.3 * kd).toFixed(4) + ')';
      copy.style.filter = kd > 0.002 ? 'blur(' + ((touch ? 4 : 7) * kd).toFixed(2) + 'px)' : 'none';
      copy.style.opacity = cop.toFixed(3);
      copy.style.visibility = cop < 0.01 ? 'hidden' : 'visible';
      copy.style.setProperty('--sub-op', String(1 - seg(p, 0, 0.12)));
      if (copyBtn) copyBtn.style.visibility = p > 0.12 ? 'hidden' : 'visible';
      st.setProperty('--deco-op', String(1 - seg(p, 0.02, 0.22)));
      // Sobald die Drehung fertig ist, tritt die Statue unscharf in den Hintergrund
      const bk = Math.max(ease(seg(p, 0.45, 0.8)), ease(q));
      ls.setProperty('--lines-op', String(1 - bk));
      // statt Live-Unschärfe: scharfe Statue blendet aus, vorab unscharfes Bild blendet ein (nur Deckkraft = billig)
      const sharpOp = 1 - bk;
      if (canvasEl) { canvasEl.style.opacity = sharpOp.toFixed(3); canvasEl.style.visibility = sharpOp < 0.005 ? 'hidden' : ''; }
      if (blurEl) {
        const L1 = layout(1), P = 0.25;
        if (blurEl.dataset.vh !== String(vh)) { blurEl.style.height = (vh * (1 + 2 * P)) + 'px'; blurEl.dataset.vh = vh; }
        blurEl.style.transform = 'translate3d(-50%,' + ((L1.t - P * L1.h) * vh).toFixed(1) + 'px,0) scale(' + L1.h.toFixed(4) + ')';
        blurEl.style.opacity = (0.42 * bk).toFixed(3);
      }
      // weicher Rand unten: nur verschieben (transform), keine neu berechnete Maske
      if (fadeEl) {
        const fa = mix(0.86, vw < 760 ? 0.46 : 0.5, k);
        fadeEl.style.transform = 'translate3d(0,' + (fa * vh).toFixed(1) + 'px,0)';
      }
      const lp = ease(seg(p, 0.18, 0.62));
      lineData.forEach(({ l, a, b }) => {
        l.setAttribute('x2', (a[0] + (b[0] - a[0]) * lp).toFixed(2) + '%');
        l.setAttribute('y2', (a[1] + (b[1] - a[1]) * lp).toFixed(2) + '%');
      });

      const L = layout(p);
      // Seitentext und Siegel neben der Statue
      const L0 = layout(0);
      if (side) side.style.top = ((L0.t + 0.16) * vh) + 'px';
      if (badges) badges.style.top = ((L0.t + 0.2) * vh) + 'px';
      // Poster (Bild bis das 3D-Modell bereit ist / ohne WebGL)
      if (posterEl && !posterEl.classList.contains('is-hidden')) {
        if (posterEl.dataset.vh !== String(vh)) { posterEl.style.height = vh + 'px'; posterEl.dataset.vh = vh; }
        posterEl.style.transform = 'translate(-50%,' + (L.t * vh).toFixed(1) + 'px) scale(' + L.h.toFixed(4) + ')';
        posterEl.classList.add('is-placed');
        posterEl.style.opacity = sharpOp.toFixed(3);
      }
      // Text unter der Statue + Wort für Wort einfärben
      if (textEl) {
        // Text erscheint unten, wandert mit dem Unscharfwerden der Statue in die Bildmitte
        // und färbt sich erst dort Wort für Wort ein
        const tStart = (vw < 760 ? 0.6 : 0.62) * vh;
        const tMid = (vh - textH) / 2;
        // Bewegung beginnt sofort mit dem Erscheinen und läuft gleichmäßig bis zur Mitte (kein Halt unten)
        const mv = seg(p, 0.42, 0.8);
        textEl.style.transform = 'translate3d(-50%,' + mix(tStart, tMid, 1 - Math.pow(1 - mv, 1.6)).toFixed(1) + 'px,0)';
        textEl.style.opacity = String(seg(p, 0.42, 0.52));
        const n = Math.round(seg(p, 0.8, 0.98) * words.length);
        words.forEach((w, i) => w.classList.toggle('on', i < n));
      }
    };

    const follow = window.lenis ? 0.35 : 0.5;   // ohne Lenis (Handy): eng am Finger, nur leicht geglättet   // mit Lenis ist das Scrollen schon weich
    const tick = () => {
      const d = target - cur, dq = targetQ - curQ;
      cur = Math.abs(d) < 0.0005 ? target : cur + d * follow;
      curQ = Math.abs(dq) < 0.001 ? targetQ : curQ + dq * follow;
      apply();
      raf = cur !== target || curQ !== targetQ ? requestAnimationFrame(tick) : 0;
    };
    const onScroll = () => { readScroll(); if (!raf) raf = requestAnimationFrame(tick); };

    measure(); readScroll(); cur = target; curQ = targetQ; apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { measure(); readScroll(); apply(); });
    document.fonts && document.fonts.ready.then(() => { measure(); apply(); });
  }

  // 3D-Statue erst nachladen, wenn die Seite fertig ist (blockiert den Seitenaufbau nicht)
  if (!window.STATUE_INLINE && document.querySelector('[data-canvas]')) {
    // Sofort nach dem Seitenaufbau im Leerlauf laden – fertig, bevor man zu scrollen beginnt.
    // Bis dahin zeigt das deckungsgleiche Standbild die Statue.
    const loadStatue = () => {
      const go = () => import('./statue.js').catch(() => { /* Standbild bleibt */ });
      'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 600 }) : setTimeout(go, 100);
    };
    document.readyState === 'complete' ? loadStatue() : window.addEventListener('load', loadStatue, { once: true });
  }

  /* ------------------------------------------------------------------
     Textbewegungen beim Scrollen
     - Überschriften steigen Wort für Wort aus einer Maske
     - große Titel der Rechtsgebiete Buchstabe für Buchstabe
     - Listen: Linie zeichnet sich, Text gleitet herein
     - großer Satz in „Über mich" färbt sich beim Scrollen
     - Zeitleiste zeichnet sich in Bronze, Porträt zoomt sanft
     ------------------------------------------------------------------ */
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const seen = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in-view'); seen.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

    // Überschriften
    document.querySelectorAll('main h2').forEach((h) => {
      h.classList.remove('reveal'); h.classList.add('split');
      let i = 0;
      const mask = (node) => {
        const m = document.createElement('span'); m.className = 'wm';
        const inner = document.createElement('span'); inner.className = 'wi'; inner.style.setProperty('--i', i++);
        inner.appendChild(node); m.appendChild(inner); return m;
      };
      [...h.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            frag.appendChild(/^\s+$/.test(part) ? document.createTextNode(' ') : mask(document.createTextNode(part)));
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) {
          const ph = document.createComment(''); c.replaceWith(ph); ph.replaceWith(mask(c));
        }
      });
      seen.observe(h);
    });

    // Titel der Rechtsgebiete: Buchstaben
    document.querySelectorAll('.area-card h3').forEach((h) => {
      const t = h.textContent; h.textContent = ''; h.classList.add('chars'); h.setAttribute('aria-label', t);
      [...t].forEach((ch, i) => {
        const sp = document.createElement('span'); sp.className = 'ch'; sp.setAttribute('aria-hidden', 'true');
        sp.style.setProperty('--i', i); sp.textContent = ch === ' ' ? ' ' : ch; h.appendChild(sp);
      });
      seen.observe(h);
    });

    // Listen mit Linien
    document.querySelectorAll('.topics li, .cv li, .faq details, .office > *').forEach((el) => {
      el.parentElement.classList.remove('reveal');
      if (!el.children.length) { const sp = document.createElement('span'); sp.textContent = el.textContent; el.textContent = ''; el.appendChild(sp); }
      el.classList.add('lr');
      el.style.setProperty('--i', [...el.parentElement.children].indexOf(el) % 8);
      seen.observe(el);
    });

    // großer Satz: Wörter
    const fill = document.querySelector('[data-fill]');
    const fillWords = [];
    if (fill) {
      fill.innerHTML = fill.textContent.trim().split(/\s+/).map((w) => '<span class="fw">' + w + '</span>').join(' ');
      fillWords.push(...fill.querySelectorAll('.fw'));
    }
    const steps = document.querySelector('.steps');
    const pimg = document.querySelector('.portrait-frame img');

    let ticking = false;
    const onScrollText = () => {
      ticking = false;
      const vh = window.innerHeight;
      if (fill) {
        const r = fill.getBoundingClientRect();
        const k = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.5)));
        const n = Math.round(k * fillWords.length);
        fillWords.forEach((w, i) => w.classList.toggle('on', i < n));
      }
      if (steps) {
        const r = steps.getBoundingClientRect();
        const k = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.45 + r.height * 0.4)));
        steps.style.setProperty('--prog', k.toFixed(3));
      }
      if (pimg) {
        const r = pimg.getBoundingClientRect();
        const k = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.8)));
        pimg.style.setProperty('--pz', (1.08 - 0.08 * k).toFixed(4));
      }
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScrollText); } }, { passive: true });
    onScrollText();
  }

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------------
     3. Kontaktformular
     ------------------------------------------------------------------ */
  const form = document.querySelector('[data-form]');
  if (form) {
    const status = form.querySelector('[data-form-status]');
    const setErr = (input, msg) => {
      const field = input.closest('.field');
      field.classList.toggle('invalid', !!msg);
      const err = field.querySelector('.err');
      if (err) err.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    const validate = () => {
      let ok = true, first = null;
      const fail = (el, msg) => { setErr(el, msg); ok = false; first = first || el; };
      const name = form.elements.name, email = form.elements.email, msg = form.elements.message, privacy = form.elements.privacy;
      name.value.trim().length < 2 ? fail(name, 'Bitte geben Sie Ihren Namen an.') : setErr(name);
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) ? setErr(email) : fail(email, 'Bitte geben Sie eine gültige E-Mail-Adresse an.');
      msg.value.trim().length < 10 ? fail(msg, 'Bitte beschreiben Sie Ihr Anliegen kurz.') : setErr(msg);
      privacy.checked ? setErr(privacy) : fail(privacy, 'Bitte bestätigen Sie die Datenschutzhinweise.');
      if (first) first.focus();
      return ok;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status'; status.textContent = '';
      if (!validate()) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        // Netlify: Netlify Forms · Vercel: /api/kontakt · sonst (PHP-Hosting): kontakt.php
        const onNetlify = /\.netlify\.app$/.test(location.hostname) || document.documentElement.dataset.host === 'netlify';
        const fd = new FormData(form);
        let ok = false;
        if (onNetlify) {
          const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fd).toString() });
          ok = res.ok;
        } else {
          let res = await fetch('/api/kontakt', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(fd).toString() }).catch(() => null);
          if (!res || res.status === 404 || res.status === 405 || res.status === 501) {
            res = await fetch(form.action, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
          }
          const data = await res.json().catch(() => ({}));
          ok = res.ok && data.ok;
        }
        if (!ok) throw new Error('send');
        form.reset();
        status.classList.add('ok');
        status.textContent = 'Vielen Dank! Ihre Anfrage ist eingegangen. Ich melde mich in Kürze bei Ihnen.';
      } catch (err) {
        status.classList.add('bad');
        status.innerHTML = 'Die Nachricht konnte leider nicht gesendet werden. Bitte schreiben Sie direkt an <a href="mailto:kontakt@ra-erkan.example">kontakt@ra-erkan.example</a> oder rufen Sie an.';
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
