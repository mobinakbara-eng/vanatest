/* ==========================================================================
   Kanzlei – Interaktion
   1. Der rote Faden (scrollgebundene SVG-Linie mit §-Marker)
   2. Header, Navigation, Einblendungen, Leitsatz-Wörter
   3. Kontaktformular
   Keine Cookies, kein Tracking, keine externen Bibliotheken.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOBILE = 820;

  /* ------------------------------------------------------------------
     1. Der rote Faden
     ------------------------------------------------------------------ */
  const main = document.querySelector('[data-main]');
  const svg = document.querySelector('[data-thread-svg]');

  if (main && svg) {
    const ghost = svg.querySelector('[data-thread-ghost]');
    const path = svg.querySelector('[data-thread-path]');
    const nodesG = svg.querySelector('[data-thread-nodes]');
    const head = svg.querySelector('[data-thread-head]');
    const NS = 'http://www.w3.org/2000/svg';

    let total = 0;          // Gesamtlänge des Pfads
    let samples = [];       // [{l, y}] – monoton steigend in y
    let nodes = [];         // [{l, el}] – Knotenpunkte an den Abschnitten
    let current = 0;        // aktuell gezeichnete Länge (geglättet)
    let target = 0;         // Ziel-Länge laut Scrollposition
    let running = false;

    const rel = (el) => {
      const r = el.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      return { left: r.left - m.left, top: r.top - m.top, width: r.width, height: r.height, right: r.right - m.left, bottom: r.bottom - m.top };
    };

    /* Ankerpunkte aus dem DOM lesen */
    function collectPoints() {
      const mobile = window.innerWidth < MOBILE;
      const W = main.clientWidth;
      const els = [...main.querySelectorAll('[data-thread]')];
      const endEl = main.querySelector('[data-thread="end"]');
      const pts = [];

      for (const el of els) {
        const kind = el.dataset.thread;
        const only = el.dataset.only;                 // "desktop" | "mobile"
        const mobileRole = el.dataset.threadMobile;   // "skip" | "end"
        if (mobile && mobileRole === 'skip') continue;
        if (!mobile && mobileRole === 'end') continue;
        if (only === 'desktop' && mobile) continue;
        if (only === 'mobile' && !mobile) continue;

        const r = rel(el);
        let p;
        if (kind === 'start') {
          p = { x: r.left + Math.min(r.width / 2, 60), y: r.bottom + 18, type: 'start' };
        } else if (kind === 'end') {
          p = { x: r.left + r.width / 2, y: r.top + r.height / 2, type: 'end' };
        } else if (kind === 'node') {
          p = { x: Math.max(10, r.left - 26), y: r.top + r.height / 2, type: 'node', el, end: mobile && mobileRole === 'end' };
        } else { // gap
          let x;
          if (el.dataset.align === 'end' && endEl) x = rel(endEl).left + rel(endEl).width / 2;
          else x = W * parseFloat(el.dataset[mobile ? 'xm' : 'x'] || el.dataset.x || '.5');
          p = { x, y: r.top + parseFloat(el.dataset.dy || 0), type: 'gap' };
        }
        pts.push(p);
        if (p.end) break;
      }
      return pts;
    }

    /* Pfad bauen: senkrechte Läufe im Rand, Schwünge nur in den Leerräumen */
    function buildPath(pts) {
      if (pts.length < 2) return '';
      const mobile = window.innerWidth < MOBILE;
      const swing = mobile ? 70 : 120;   // Höhe, in der ein seitlicher Schwung stattfindet
      const full = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = full[full.length - 1], b = pts[i];
        // langer Abstand → erst senkrecht laufen, dann schwingen
        if (b.y - a.y > swing * 2.4 && Math.abs(b.x - a.x) > 4) {
          full.push({ x: a.x, y: b.y - swing, type: 'aux' });
        }
        full.push(b);
      }
      let d = `M ${full[0].x.toFixed(1)} ${full[0].y.toFixed(1)}`;
      for (let i = 1; i < full.length; i++) {
        const a = full[i - 1], b = full[i];
        const dy = Math.max(b.y - a.y, 1);
        const k = 0.55;
        d += ` C ${a.x.toFixed(1)} ${(a.y + dy * k).toFixed(1)}, ${b.x.toFixed(1)} ${(b.y - dy * k).toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      }
      return d;
    }

    function layout() {
      svg.setAttribute('viewBox', `0 0 ${main.clientWidth} ${main.scrollHeight}`);
      svg.style.height = main.scrollHeight + 'px';

      const pts = collectPoints();
      const d = buildPath(pts);
      ghost.setAttribute('d', d);
      path.setAttribute('d', d);
      total = path.getTotalLength();
      path.style.strokeDasharray = `${total} ${total}`;

      // Stützstellen für die Zuordnung y → Länge
      const N = Math.max(300, Math.round(total / 6));
      samples = [];
      let maxY = -Infinity;
      for (let i = 0; i <= N; i++) {
        const l = (i / N) * total;
        const p = path.getPointAtLength(l);
        maxY = Math.max(maxY, p.y);   // erzwingt Monotonie
        samples.push({ l, y: maxY });
      }

      // Knoten zeichnen
      nodesG.textContent = '';
      nodes = [];
      for (const p of pts) {
        if (p.type === 'gap') continue;
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'thread-node');
        g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        const ring = document.createElementNS(NS, 'circle');
        ring.setAttribute('class', 'ring'); ring.setAttribute('r', p.type === 'node' ? 6.5 : 4.5);
        const core = document.createElementNS(NS, 'circle');
        core.setAttribute('class', 'core'); core.setAttribute('r', p.type === 'node' ? 3 : 2.5);
        g.append(ring, core);
        if (p.type === 'end') g.style.display = 'none'; // Pin der Karte übernimmt
        nodesG.appendChild(g);
        nodes.push({ l: lengthAtY(p.y), g, el: p.el });
      }

      target = computeTarget();
      if (reduceMotion) current = total;
      render(true);
    }

    function lengthAtY(y) {
      if (!samples.length) return 0;
      if (y <= samples[0].y) return 0;
      let lo = 0, hi = samples.length - 1;
      if (y >= samples[hi].y) return total;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].y < y) lo = mid; else hi = mid;
      }
      const a = samples[lo], b = samples[hi];
      const t = (y - a.y) / Math.max(b.y - a.y, 0.0001);
      return a.l + (b.l - a.l) * t;
    }

    function computeTarget() {
      const mTop = main.getBoundingClientRect().top + window.scrollY;
      const vh = window.innerHeight;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
      const f = Math.min(1, window.scrollY / maxScroll);
      // Lesepunkt bei ~60 % der Viewporthöhe; am Seitenende bis ganz unten
      const anchor = 0.6 + 0.4 * Math.pow(f, 8);
      return lengthAtY(window.scrollY + vh * anchor - mTop);
    }

    function render(force) {
      if (!total) return;
      path.style.strokeDashoffset = (total - current).toFixed(1);

      const p = path.getPointAtLength(Math.max(0.01, current));
      head.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      head.style.opacity = current < 2 || current > total - 2 ? 0 : 1;

      for (const n of nodes) {
        const reached = current >= n.l - 1;
        if (reached !== n.g.classList.contains('is-reached') || force) {
          n.g.classList.toggle('is-reached', reached);
          if (n.el) n.el.classList.toggle('is-reached', reached);
        }
      }
    }

    function tick() {
      const diff = target - current;
      current += diff * 0.12;                // weiches Nachziehen
      if (Math.abs(diff) < 0.4) current = target;
      render(false);
      if (current !== target) requestAnimationFrame(tick);
      else running = false;
    }

    function onScroll() {
      if (reduceMotion) return;
      target = computeTarget();
      if (!running) { running = true; requestAnimationFrame(tick); }
    }

    let resizeTimer;
    const relayout = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', relayout);
    // Höhe ändert sich z. B. beim Aufklappen eines Rechtsgebiets oder wenn Fotos/Schriften laden
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(main);
    document.fonts && document.fonts.ready.then(layout);
    window.addEventListener('load', layout);
    layout();
  }

  /* ------------------------------------------------------------------
     2. Header, Navigation, Einblendungen
     ------------------------------------------------------------------ */
  requestAnimationFrame(() => root.classList.add('is-loaded'));

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

  // Leitsatz: Wörter leuchten beim Lesen auf
  const words = document.querySelector('[data-words]');
  if (words && !reduceMotion) {
    const wrap = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) wrap(child);
      });
    };
    wrap(words);
    const ws = [...words.querySelectorAll('.w')];
    const light = () => {
      const r = words.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      const n = Math.round(p * ws.length);
      ws.forEach((w, i) => w.classList.toggle('on', i < n));
    };
    window.addEventListener('scroll', light, { passive: true });
    light();
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
