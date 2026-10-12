/* VANA Management: contact form -> Supabase table "anfragen" (REST insert, anon key). */
(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const cfg = window.VANA_CONFIG || {};
  const status = document.getElementById('formStatus');
  const submit = document.getElementById('f-submit');
  const openedAt = Date.now();

  const MESSAGES = {
    name: 'Bitte geben Sie Ihren Namen ein.',
    email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
    projektart: 'Bitte wählen Sie die Art des Projekts.',
    nachricht: 'Bitte beschreiben Sie Ihr Projekt in mindestens 10 Zeichen.',
    datenschutz: 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.'
  };

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
    }
  }

  function validate() {
    let first = null;
    for (const input of form.querySelectorAll('input, select, textarea')) {
      if (input.name === 'website') continue;
      const ok = input.checkValidity() && (input.type === 'checkbox' || !input.required || input.value.trim() !== '');
      const msg = ok ? '' : (MESSAGES[input.name] || 'Bitte prüfen Sie dieses Feld.');
      if (input.type === 'checkbox') input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      else fieldError(input, msg);
      if (!ok && !first) first = input;
    }
    if (first) {
      first.focus();
      setStatus(first.type === 'checkbox' ? MESSAGES.datenschutz : 'Bitte prüfen Sie die markierten Felder.', 'err');
    }
    return !first;
  }

  form.addEventListener('input', e => {
    if (e.target.getAttribute('aria-invalid') === 'true' && e.target.checkValidity()) fieldError(e.target, '');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    setStatus('');
    if (!validate()) return;

    const data = new FormData(form);
    // Spam traps: hidden honeypot field and a minimum time on the page
    if (data.get('website') || Date.now() - openedAt < 3000) {
      showDone();
      return;
    }

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      setStatus(`Das Formular ist noch nicht freigeschaltet. Bitte schreiben Sie uns an ${cfg.contactEmail || 'info@vana-management.de'}.`, 'err');
      return;
    }

    const row = {
      name: data.get('name').trim(),
      email: data.get('email').trim(),
      telefon: (data.get('telefon') || '').trim() || null,
      ort: (data.get('ort') || '').trim() || null,
      projektart: data.get('projektart'),
      nachricht: data.get('nachricht').trim(),
      datenschutz_akzeptiert: data.get('datenschutz') === 'on'
    };

    submit.disabled = true;
    submit.textContent = 'Wird gesendet …';
    try {
      const res = await fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/anfragen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.supabaseAnonKey,
          Authorization: 'Bearer ' + cfg.supabaseAnonKey,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      showDone();
    } catch (err) {
      submit.disabled = false;
      submit.textContent = 'Anfrage senden';
      setStatus(`Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie an ${cfg.contactEmail || 'info@vana-management.de'}.`, 'err');
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
