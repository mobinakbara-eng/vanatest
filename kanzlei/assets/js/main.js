/* ==========================================================================
   Kanzlei – Interaktion
   1. Header, Navigation
   2. Einblenden beim Scrollen (gestaffelt, wie VANA), Leitsatz-Wörter
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
