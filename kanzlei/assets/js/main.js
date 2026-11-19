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
  if (window.Lenis && !reduceMotion) {
    const lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, anchors: { offset: -80 } });
    const loop = (t) => { lenis.raf(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    window.lenis = lenis;
  }

  const header = document.querySelector('[data-header]');
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (!header) return;
    header.classList.toggle('is-scrolled', y > 20);
    const navOpen = document.body.classList.contains('nav-open');
    header.classList.toggle('is-hidden', !navOpen && y > lastY && y > 400);
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
    const copy = sceneEl.querySelector('.hero-copy');
    const side = sceneEl.querySelector('[data-side]');
    const badges = sceneEl.querySelector('[data-badges]');
    const layer = document.querySelector('[data-statue-layer]') || sticky;
    const posterEl = layer.querySelector('[data-poster]');
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

    let vw = innerWidth, vh = sticky.clientHeight, t0 = 0.5;
    const measure = () => {
      vw = innerWidth; vh = sticky.clientHeight;
      const cb = copy.getBoundingClientRect();
      const sb = sticky.getBoundingClientRect();
      t0 = clamp((cb.bottom - sb.top) / vh + 0.04, 0.3, 0.75);
    };

    // Statue: Oberkante t und Höhe h als Anteil der Viewporthöhe
    const layout = (p) => {
      const k = ease(seg(p, 0, 0.5));
      const maxH = (vw * 1.0) / (ASPECT * vh);           // auf schmalen Screens nicht breiter als der Screen
      const h0 = Math.min(Math.max(0.62, 1.06 - t0), maxH * 1.1);
      const h1 = Math.min(vw < 760 ? 0.72 : 0.86, maxH);
      return { t: mix(t0, vw < 760 ? 0.1 : 0.05, k), h: mix(h0, h1, k) };
    };

    const state = { p: 0, q: 0, layout };
    window.sceneState = state;

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
      st.setProperty('--copy-op', String(1 - seg(p, 0.02, 0.24)));
      st.setProperty('--copy-y', (-90 * ease(seg(p, 0, 0.3))).toFixed(1) + 'px');
      st.setProperty('--deco-op', String(1 - seg(p, 0.02, 0.22)));
      ls.setProperty('--bw-op', (0.075 * ease(seg(p, 0.12, 0.5)) * (1 - q)).toFixed(3));
      ls.setProperty('--lines-op', String(1 - q));
      ls.setProperty('--blur', (16 * ease(q)).toFixed(2) + 'px');
      ls.setProperty('--statue-op', (1 - 0.68 * ease(q)).toFixed(3));
      ls.setProperty('--bw-scale', mix(0.9, 1, ease(seg(p, 0.1, 0.6))).toFixed(3));
      ls.setProperty('--fade-a', mix(86, vw < 760 ? 46 : 50, k).toFixed(1) + '%');
      ls.setProperty('--fade-b', mix(100, vw < 760 ? 70 : 76, k).toFixed(1) + '%');
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
        posterEl.style.top = (L.t * vh) + 'px';
        posterEl.style.height = (L.h * vh) + 'px';
      }
      // Text unter der Statue + Wort für Wort einfärben
      if (textEl) {
        textEl.style.top = ((vw < 760 ? 0.6 : 0.62) * vh) + 'px';
        textEl.style.opacity = String(seg(p, 0.38, 0.5));
        const n = Math.round(seg(p, 0.48, 0.9) * words.length);
        words.forEach((w, i) => w.classList.toggle('on', i < n));
      }
    };

    const follow = window.Lenis && !reduceMotion ? 0.35 : 0.16;   // mit Lenis ist das Scrollen schon weich
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
        const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'send');
        form.reset();
        status.classList.add('ok');
        status.textContent = 'Vielen Dank! Ihre Anfrage ist eingegangen. Ich melde mich in Kürze bei Ihnen.';
      } catch (err) {
        status.classList.add('bad');
        status.innerHTML = 'Die Nachricht konnte leider nicht gesendet werden. Bitte schreiben Sie direkt an <a href="mailto:kontakt@kanzlei-mustermann.de">kontakt@kanzlei-mustermann.de</a> oder rufen Sie an.';
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
