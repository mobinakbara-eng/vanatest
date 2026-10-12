/* VANA Management: contact form -> Supabase Edge Function "kontakt". */
(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const cfg = window.VANA_CONFIG || {};
  const email = cfg.contactEmail || 'info@vana-management.com';
  const status = document.getElementById('formStatus');
  const submit = document.getElementById('f-submit');
  const openedAt = Date.now();
  let turnstileWidget = null;

  const MESSAGES = {
    name: 'Bitte geben Sie Ihren Namen ein.',
    email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
    telefon: 'Bitte geben Sie eine gültige Telefonnummer ein.',
    projektart: 'Bitte wählen Sie die Art des Projekts.',
    nachricht: 'Bitte beschreiben Sie Ihr Projekt in mindestens 10 Zeichen.',
    datenschutz: 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.'
  };
  // Server field names -> form field names
  const SERVER_FIELDS = { datenschutz_akzeptiert: 'datenschutz' };

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  function fieldError(input, message) {
    const err = document.getElementById(input.id + '-err');
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (err) {
      err.textContent = message || '';
      if (message) input.setAttribute('aria-describedby', err.id);
      else input.removeAttribute('aria-describedby');
    }
  }

  function inputValid(input) {
    if (input.type === 'checkbox') return input.checked || !input.required;
    if (input.required && input.value.trim() === '') return false;
    if (input.name === 'telefon' && !/^[0-9+()/.\s-]*$/.test(input.value)) return false;
    if (input.name === 'nachricht' && input.value.trim().length < 10) return false;
    return input.checkValidity();
  }

  function showErrors(map) {
    let first = null;
    for (const input of form.querySelectorAll('input, select, textarea')) {
      if (input.name === 'website') continue;
      const msg = map[input.name] || '';
      fieldError(input, msg);
      if (msg && !first) first = input;
    }
    if (first) {
      first.focus();
      setStatus(Object.keys(map).length === 1 && map.datenschutz ? MESSAGES.datenschutz : 'Bitte prüfen Sie die markierten Felder.', 'err');
    }
    return !first;
  }

  function validate() {
    const map = {};
    for (const input of form.querySelectorAll('input, select, textarea')) {
      if (input.name === 'website') continue;
      if (!inputValid(input)) map[input.name] = MESSAGES[input.name] || 'Bitte prüfen Sie dieses Feld.';
    }
    return showErrors(map);
  }

  // Clear an error as soon as the field becomes valid
  form.addEventListener('input', e => {
    const t = e.target;
    if (t.getAttribute('aria-invalid') === 'true' && inputValid(t)) fieldError(t, '');
  });
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.getAttribute('aria-invalid') === 'true' && inputValid(t)) fieldError(t, '');
  });

  // Optional Cloudflare Turnstile
  if (cfg.turnstileSiteKey) {
    const box = document.createElement('div');
    box.className = 'turnstile';
    form.querySelector('.form-actions').before(box);
    window.vanaTurnstileReady = () => {
      turnstileWidget = window.turnstile.render(box, { sitekey: cfg.turnstileSiteKey, language: 'de', appearance: 'interaction-only' });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=vanaTurnstileReady&render=explicit';
    s.async = true;
    document.head.append(s);
  }

  function setBusy(busy) {
    submit.disabled = busy;
    submit.textContent = busy ? 'Wird gesendet …' : 'Anfrage senden';
    form.setAttribute('aria-busy', String(busy));
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    setStatus('');
    if (!validate()) return;

    if (!cfg.apiUrl) {
      setStatus(`Das Formular ist noch nicht freigeschaltet. Bitte schreiben Sie uns an ${email}.`, 'err');
      return;
    }

    const data = new FormData(form);
    const payload = {
      name: data.get('name'),
      email: data.get('email'),
      telefon: data.get('telefon') || '',
      ort: data.get('ort') || '',
      projektart: data.get('projektart'),
      nachricht: data.get('nachricht'),
      datenschutz_akzeptiert: data.get('datenschutz') === 'on',
      website: data.get('website') || '',
      elapsed_ms: Date.now() - openedAt
    };
    if (turnstileWidget !== null && window.turnstile) payload.turnstile_token = window.turnstile.getResponse(turnstileWidget) || '';

    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (res.ok) { showDone(); return; }

      const body = await res.json().catch(() => ({}));
      if (res.status === 422 && body.fields) {
        const map = {};
        for (const [k, v] of Object.entries(body.fields)) map[SERVER_FIELDS[k] || k] = v;
        showErrors(map);
      } else if (res.status === 429) {
        setStatus(`Sie haben uns in kurzer Zeit mehrere Anfragen geschickt. Bitte versuchen Sie es später erneut oder schreiben Sie an ${email}.`, 'err');
      } else if (res.status === 403 && body.error === 'captcha_failed') {
        setStatus('Die Sicherheitsprüfung ist fehlgeschlagen. Bitte laden Sie die Seite neu und versuchen Sie es erneut.', 'err');
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (err) {
      setStatus(`Die Anfrage konnte nicht gesendet werden. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut, oder schreiben Sie an ${email}.`, 'err');
    } finally {
      clearTimeout(timer);
      if (form.isConnected && submit.isConnected) setBusy(false);
      if (turnstileWidget !== null && window.turnstile) window.turnstile.reset(turnstileWidget);
    }
  });

  function showDone() {
    const done = document.createElement('div');
    done.className = 'form-done';
    done.setAttribute('role', 'status');
    done.tabIndex = -1;
    const h = document.createElement('h3');
    h.textContent = 'Vielen Dank, Ihre Anfrage ist angekommen.';
    const p = document.createElement('p');
    p.textContent = 'Wir melden uns per E-Mail bei Ihnen, um einen Besichtigungstermin abzustimmen.';
    done.append(h, p);
    form.replaceChildren(done);
    done.focus();
  }
})();
