/* VANA Management: cookie / consent banner (TDDDG § 25, DSGVO).
   The choice is stored in localStorage ("vana-consent"); this storage itself is strictly necessary.
   Optional services must wait for consent:
     window.vanaConsent.has('statistik')                 -> true / false
     document.addEventListener('vana:consent', e => …)    -> e.detail = { statistik, marketing }
*/
(() => {
  const KEY = 'vana-consent';
  const VERSION = 1;
  const CATEGORIES = [
    { id: 'notwendig', title: 'Notwendig', locked: true,
      text: 'Speichern Ihre Auswahl in diesem Banner. Ohne diese Speicherung funktioniert die Website nicht wie vorgesehen.' },
    { id: 'statistik', title: 'Statistik',
      text: 'Helfen uns zu verstehen, wie Besucher die Website nutzen, damit wir sie verbessern können. Nur mit Ihrer Einwilligung.' },
    { id: 'marketing', title: 'Marketing',
      text: 'Ermöglichen eingebettete Inhalte und Angebote von Drittanbietern. Nur mit Ihrer Einwilligung.' }
  ];

  let memory = null; // fallback when localStorage is unavailable
  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (v && v.v === VERSION) return v;
    } catch (e) { /* blocked storage */ }
    return memory;
  }
  function write(choice) {
    const value = { v: VERSION, statistik: !!choice.statistik, marketing: !!choice.marketing, zeit: new Date().toISOString() };
    memory = value;
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (e) { /* keep in memory */ }
    document.dispatchEvent(new CustomEvent('vana:consent', { detail: { statistik: value.statistik, marketing: value.marketing } }));
    return value;
  }

  window.vanaConsent = {
    has: (category) => category === 'notwendig' || !!(read() || {})[category],
    open: () => show(true),
    reset: () => { memory = null; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } show(false); }
  };

  let banner = null, lastFocus = null;

  function el(tag, attrs = {}, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    return n;
  }

  function build() {
    banner = el('section', { class: 'consent-banner', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'consent-title', 'aria-describedby': 'consent-text', hidden: '' });
    const inner = el('div', { class: 'consent-inner' });

    const head = el('div', { class: 'consent-head' });
    head.append(el('p', { class: 'eyebrow', id: 'consent-title' }, 'Cookies & Datenschutz'));
    const p = el('p', { id: 'consent-text' });
    const privacy = document.querySelector('a[href*="datenschutz"]');
    p.append('Wir nutzen nur technisch notwendige Speicherungen. Statistik und Marketing nur mit Ihrer Zustimmung, änderbar jederzeit unter „Cookie-Einstellungen“. Mehr in der ');
    const a = el('a', { href: privacy ? privacy.getAttribute('href') : 'datenschutz.html' }, 'Datenschutzerklärung');
    p.append(a, '.');
    head.append(p);

    const panel = el('div', { class: 'consent-panel', id: 'consent-panel', hidden: '' });
    for (const c of CATEGORIES) {
      const row = el('div', { class: 'consent-cat' });
      const label = el('label', { for: 'consent-' + c.id });
      const input = el('input', { type: 'checkbox', id: 'consent-' + c.id, name: c.id, role: 'switch' });
      if (c.locked) { input.checked = true; input.disabled = true; }
      label.append(input, el('span', { class: 'consent-switch', 'aria-hidden': 'true' }), el('strong', {}, c.title + (c.locked ? ' (immer aktiv)' : '')));
      row.append(label, el('p', {}, c.text));
      panel.append(row);
    }

    const actions = el('div', { class: 'consent-actions' });
    const btnAll = el('button', { type: 'button', class: 'btn', 'data-consent': 'all' }, 'Alle akzeptieren');
    const btnNecessary = el('button', { type: 'button', class: 'btn btn-outline', 'data-consent': 'necessary' }, 'Nur notwendige');
    const btnSettings = el('button', { type: 'button', class: 'consent-link', 'data-consent': 'settings', 'aria-expanded': 'false', 'aria-controls': 'consent-panel' }, 'Einstellungen');
    const btnSave = el('button', { type: 'button', class: 'btn btn-outline', 'data-consent': 'save', hidden: '' }, 'Auswahl speichern');
    actions.append(btnAll, btnNecessary, btnSave, btnSettings);

    inner.append(head, panel, actions);
    banner.append(inner);
    document.body.append(banner);

    banner.addEventListener('click', (e) => {
      const action = e.target.closest('[data-consent]')?.dataset.consent;
      if (!action) return;
      if (action === 'all') close(write({ statistik: true, marketing: true }));
      if (action === 'necessary') close(write({ statistik: false, marketing: false }));
      if (action === 'save') close(write({ statistik: panelValue('statistik'), marketing: panelValue('marketing') }));
      if (action === 'settings') togglePanel();
    });
    banner.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && read()) close();
    });
  }

  const panelValue = (id) => banner.querySelector('#consent-' + id).checked;

  function togglePanel(force) {
    const panel = banner.querySelector('#consent-panel');
    const open = force ?? panel.hidden;
    panel.hidden = !open;
    banner.querySelector('[data-consent="save"]').hidden = !open;
    const settings = banner.querySelector('[data-consent="settings"]');
    settings.setAttribute('aria-expanded', String(open));
    settings.textContent = open ? 'Einstellungen schließen' : 'Einstellungen';
  }

  function show(withSettings) {
    if (!banner) build();
    const current = read() || { statistik: false, marketing: false };
    banner.querySelector('#consent-statistik').checked = !!current.statistik;
    banner.querySelector('#consent-marketing').checked = !!current.marketing;
    togglePanel(!!withSettings);
    lastFocus = document.activeElement;
    banner.hidden = false;
    document.documentElement.classList.add('consent-open');
    if (withSettings) banner.querySelector('#consent-statistik').focus();
  }

  function close() {
    banner.hidden = true;
    document.documentElement.classList.remove('consent-open');
    if (lastFocus && lastFocus !== document.body && document.contains(lastFocus)) lastFocus.focus();
  }

  // Footer link "Cookie-Einstellungen"
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-consent]')) { e.preventDefault(); show(true); }
  });

  if (!read()) show(false);
})();
