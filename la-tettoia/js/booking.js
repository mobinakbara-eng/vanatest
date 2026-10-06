/* La Tettoia – floor-plan table booking */
(function () {
  "use strict";
  var LT = window.LT, C = LT.CONFIG, B = C.booking;
  var root = document.querySelector("[data-booking]");
  if (!root) return;
  var $ = function (s, c) { return (c || root).querySelector(s); };
  var esc = LT.esc;

  /* ---------- Floor plan (SVG units, viewBox 600 × 850) ----------
     Drawn from the owner's sketch: entrance at the bottom, four 6-seat tables
     along the left wall, bar across the top, the WC behind the dividing wall and
     a small room with four 4-seat tables on the right. Adjust positions / seats
     here – and keep the seat limits in supabase/schema.sql in sync. */
  var TABLES = [
    { id: "1", seats: 6, x: 55, y: 168, w: 180, h: 64, zone: "sala" },
    { id: "2", seats: 6, x: 55, y: 318, w: 180, h: 64, zone: "sala" },
    { id: "3", seats: 6, x: 55, y: 468, w: 180, h: 64, zone: "sala" },
    { id: "4", seats: 6, x: 55, y: 618, w: 180, h: 64, zone: "sala" },
    { id: "5", seats: 4, x: 358, y: 528, w: 92, h: 60, zone: "saletta" },
    { id: "6", seats: 4, x: 470, y: 528, w: 92, h: 60, zone: "saletta" },
    { id: "7", seats: 4, x: 358, y: 662, w: 92, h: 60, zone: "saletta" },
    { id: "8", seats: 4, x: 470, y: 662, w: 92, h: 60, zone: "saletta" }
  ];

  var S = {
    de: {
      table: "Tisch", seats: "Plätze", free: "frei", busy: "reserviert", small: "zu klein",
      persons: "Personen", person: "Person", more: "{n}+ Personen",
      bar: "Bar", sala: "Sala", saletta: "Saletta", entrance: "Eingang", wc: "Toiletten",
      pickTime: "Wählen Sie eine Uhrzeit.", pickTable: "Tippen Sie auf einen freien Tisch im Plan.",
      pickBoth: "Wählen Sie eine Uhrzeit und einen freien Tisch.",
      closed: "Montags ist Ruhetag – bitte wählen Sie einen anderen Tag.",
      none: "Für diesen Tag sind online keine passenden Tische mehr frei – rufen Sie uns gern an.",
      group: "Für Gruppen über {n} Personen stellen wir Tische zusammen – bitte rufen Sie uns an: 030 396 31 47.",
      tableTimes: "Freie Zeiten an Tisch {t}:", noTimes: "An diesem Tag keine freien Zeiten.",
      errRequired: "Bitte füllen Sie alle Pflichtfelder aus.", errEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      errConsent: "Bitte bestätigen Sie die Datenschutzhinweise.",
      taken: "Dieser Tisch wurde gerade vergeben – bitte wählen Sie einen anderen.",
      failed: "Die Reservierung konnte nicht gespeichert werden. Bitte rufen Sie uns an: 030 396 31 47.",
      sending: "Wird gesendet …",
      doneTitle: "Grazie – Ihre Anfrage ist eingegangen!",
      doneText: "Der Tisch ist für Sie vorgemerkt. Die Reservierung ist erst nach Bestätigung durch das Restaurant verbindlich.",
      unavailable: "Online-Reservierungen sind derzeit nicht verfügbar. Bitte rufen Sie uns an: 030 396 31 47.",
      subject: "Reservierung", intro: "Guten Tag, ich möchte gerne einen Tisch reservieren:",
      fDate: "Datum", fTime: "Uhrzeit", fGuests: "Personen", fTable: "Tisch", fName: "Name", fPhone: "Telefon",
      fEmail: "E-Mail", fOcc: "Anlass", fNotes: "Nachricht", outro: "Vielen Dank – ich freue mich auf Ihre Bestätigung.",
      clock: " Uhr", until: "bis"
    },
    en: {
      table: "Table", seats: "seats", free: "free", busy: "booked", small: "too small",
      persons: "guests", person: "guest", more: "{n}+ guests",
      bar: "Bar", sala: "Sala", saletta: "Saletta", entrance: "Entrance", wc: "Restrooms",
      pickTime: "Choose a time.", pickTable: "Tap a free table on the plan.",
      pickBoth: "Choose a time and a free table.",
      closed: "We are closed on Mondays – please choose another day.",
      none: "No suitable tables are left online for this day – please give us a call.",
      group: "For groups of more than {n}, we put tables together – please call us: +49 30 396 31 47.",
      tableTimes: "Free times at table {t}:", noTimes: "No free times on this day.",
      errRequired: "Please fill in all required fields.", errEmail: "Please enter a valid e-mail address.",
      errConsent: "Please accept the privacy notice.",
      taken: "This table was just booked – please choose another one.",
      failed: "Your reservation could not be saved. Please call us: +49 30 396 31 47.",
      sending: "Sending …",
      doneTitle: "Grazie – we received your request!",
      doneText: "The table is held for you. Your booking is confirmed only after the restaurant approves it.",
      unavailable: "Online booking is currently unavailable. Please call us: +49 30 396 31 47.",
      subject: "Reservation", intro: "Hello, I would like to book a table:",
      fDate: "Date", fTime: "Time", fGuests: "Guests", fTable: "Table", fName: "Name", fPhone: "Phone",
      fEmail: "E-mail", fOcc: "Occasion", fNotes: "Message", outro: "Thank you – looking forward to your confirmation.",
      clock: "", until: "until"
    }
  };
  function t(k, vars) {
    var s = S[LT.lang()][k];
    if (vars) Object.keys(vars).forEach(function (v) { s = s.replace("{" + v + "}", vars[v]); });
    return s;
  }

  /* ---------- Storage ---------- */
  var remote = !!(B.supabaseUrl && B.supabaseKey);

  var headers = function () {
    return { apikey: B.supabaseKey, "Content-Type": "application/json" };
  };

  var Store = {
    list: function (date) {
      if (!remote) return Promise.reject(new Error("unavailable"));
      return fetch(B.supabaseUrl + "/rest/v1/booked_slots?select=table_id,time&date=eq." + date, { headers: headers() })
        .then(function (r) { if (!r.ok) throw new Error("list"); return r.json(); })
        .then(function (rows) { return rows.map(function (r) { return { table: String(r.table_id), time: String(r.time).slice(0, 5) }; }); });
    },
    create: function (b) {
      if (!remote) return Promise.reject(new Error("unavailable"));
      return fetch(B.supabaseUrl + "/rest/v1/rpc/book_table", {
        method: "POST", headers: headers(),
        body: JSON.stringify({
          p_date: b.date, p_time: b.time, p_table: b.table, p_guests: b.guests, p_name: b.name,
          p_phone: b.phone, p_email: b.email, p_occasion: b.occasion, p_notes: b.notes
        })
      }).then(function (r) {
        if (r.ok) return r.json();
        return r.text().then(function (txt) { throw new Error(/taken|conflict|23P01/i.test(txt) ? "taken" : "failed"); });
      });
    }
  };

  /* ---------- Time helpers ---------- */
  function toMin(hm) { var p = hm.split(":"); return (+p[0]) * 60 + (+p[1]); }
  function allSlots() {
    var out = [];
    for (var m = C.slots.from; m <= C.slots.to; m += C.slots.step) out.push(LT.hhmm(m));
    return out;
  }
  function isPast(date, time) {
    var now = LT.berlinNow();
    return date < now.iso || (date === now.iso && toMin(time) < now.min + 60);
  }
  function tableFree(id, time) {
    var s = toMin(time);
    return !state.bookings.some(function (b) { return b.table === id && Math.abs(toMin(b.time) - s) < B.durationMin; });
  }
  function fits(tb) { return tb.seats >= state.guests; }
  function tableById(id) { return TABLES.filter(function (x) { return x.id === id; })[0]; }
  function slotOpen(time) {
    if (isPast(state.date, time)) return false;
    if (state.table) return tableFree(state.table, time);
    return TABLES.some(function (tb) { return fits(tb) && tableFree(tb.id, time); });
  }

  /* ---------- State & elements ---------- */
  var state = { date: "", guests: 2, time: "", table: "", bookings: [], loading: false, available: false, step: 1 };
  var dateEl = $("[data-b-date]"), guestsEl = $("[data-b-guests]"), slotsEl = $("[data-b-slots]"), planEl = $("[data-b-plan]");
  var nextBtn = $("[data-b-next]"), err1 = $("[data-b-err1]"), err2 = $("[data-b-err2]"), form = $("[data-b-form]");

  /* ---------- Render: plan ---------- */
  function chairs(tb) {
    var out = [], per = Math.ceil(tb.seats / 2), r = 11;
    for (var i = 0; i < per; i++) {
      var cx = tb.x + tb.w * (i + 1) / (per + 1);
      out.push([cx, tb.y - r - 6]);
      if (out.length < tb.seats) out.push([cx, tb.y + tb.h + r + 6]);
    }
    return out.map(function (c) { return '<circle class="chair" cx="' + c[0] + '" cy="' + c[1] + '" r="' + r + '"/>'; }).join("");
  }

  function tableState(tb) {
    if (!fits(tb)) return "small";
    if (state.table === tb.id) return "sel";
    if (state.time) return tableFree(tb.id, state.time) ? "free" : "busy";
    var any = allSlots().some(function (s) { return !isPast(state.date, s) && tableFree(tb.id, s); });
    return any ? "free" : "busy";
  }

  function renderPlan() {
    var closed = !C.hours[LT.weekday(state.date)];
    var tables = TABLES.map(function (tb) {
      var st = !remote || !state.available || state.loading ? "offline" : closed ? "busy" : tableState(tb);
      // starts with the visible text ("1 6 P.") so voice-control users can say what they see
      var label = tb.id + " " + tb.seats + " P. – " + t("table") + " " + tb.id + ", " + tb.seats + " " + t("seats") + ", " +
        (!remote || !state.available ? t("unavailable") : t(st === "sel" ? "free" : st));
      var dis = st === "small" || st === "busy" || st === "offline";
      return '<g class="tbl tbl--' + st + '" data-table="' + tb.id + '" role="button" tabindex="' + (dis ? -1 : 0) + '" aria-disabled="' + dis + '" aria-pressed="' + (st === "sel") + '" aria-label="' + esc(label) + '">' +
        chairs(tb) +
        '<rect class="top" x="' + tb.x + '" y="' + tb.y + '" width="' + tb.w + '" height="' + tb.h + '" rx="6"/>' +
        '<text class="no" x="' + (tb.x + tb.w / 2) + '" y="' + (tb.y + tb.h / 2 - 5) + '">' + tb.id + "</text> " +
        '<text class="cap" x="' + (tb.x + tb.w / 2) + '" y="' + (tb.y + tb.h / 2 + 20) + '">' + tb.seats + " P.</text></g>";
    }).join("");

    planEl.innerHTML =
      '<svg viewBox="0 0 600 850" role="group" aria-label="' + esc(t("table")) + '">' +
      '<defs><pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="14" class="hatch"/></pattern></defs>' +
      '<rect class="floor" x="20" y="20" width="560" height="780"/>' +
      '<rect class="floor floor--alt" x="330" y="470" width="250" height="330"/>' +
      '<rect class="floor floor--wc" x="330" y="122" width="250" height="208"/>' +
      // bar counter
      '<path class="bar" d="M160 20 V96 Q160 122 186 122 H580 V20 Z"/>' +
      '<text class="zone zone--bar" x="380" y="78">' + t("bar") + "</text>" +
      // walls: outer with entrance gap; divider with WC door (240–300) and open passage (380–460);
      // WC wall; small-room wall with opening on the left
      '<path class="wall" d="M250 800 H20 V20 H580 V800 H330"/>' +
      '<path class="wall wall--in" d="M330 122 V240 M330 300 V380 M330 460 V800 M330 330 H580 M400 470 H580"/>' +
      '<path class="door" d="M330 300 H390 M390 300 A60 60 0 0 0 330 240"/>' +
      // WC
      '<g class="wc" aria-label="WC"><text class="zone zone--wc" x="455" y="238">WC</text>' +
      '<text class="wc__sub" x="455" y="266">' + t("wc") + "</text></g>" +
      // labels
      '<text class="zone" x="145" y="772">' + t("sala") + "</text>" +
      '<text class="zone" x="455" y="784">' + t("saletta") + "</text>" +
      '<path class="arrow" d="M290 842 V808 M280 820 l10 -12 l10 12"/>' +
      '<text class="zone zone--entry" x="370" y="836">' + t("entrance") + "</text>" +
      tables + "</svg>";
    $("[data-b-demo]").hidden = remote;
  }

  /* ---------- Render: time slots ---------- */
  function renderSlots() {
    if (!remote || (!state.available && !state.loading)) { slotsEl.innerHTML = '<p class="slots__msg">' + t("unavailable") + "</p>"; return; }
    var closed = !C.hours[LT.weekday(state.date)];
    if (closed) { slotsEl.innerHTML = '<p class="slots__msg">' + t("closed") + "</p>"; return; }
    var any = false;
    slotsEl.innerHTML = allSlots().map(function (s) {
      var open = !state.loading && slotOpen(s); if (open) any = true;
      return '<button type="button" class="slot" role="option" data-slot="' + s + '" aria-selected="' + (state.time === s) + '"' + (open ? "" : " disabled") + ">" + s + "</button>";
    }).join("");
    if (!any && !state.loading) slotsEl.insertAdjacentHTML("beforeend", '<p class="slots__msg">' + (state.table ? t("noTimes") : t("none")) + "</p>");
  }

  /* ---------- Render: selection summary ---------- */
  function pickHTML() {
    var tb = tableById(state.table);
    var rows = [
      ["fDate", LT.fmtDate(state.date, { year: undefined })],
      ["fTime", state.time ? state.time + t("clock") + " · " + t("until") + " " + LT.hhmm(toMin(state.time) + B.durationMin) : "—"],
      ["fGuests", state.guests],
      ["fTable", tb ? tb.id + " · " + tb.seats + " " + t("seats") + " · " + t(tb.zone) : "—"]
    ];
    return "<dl>" + rows.map(function (r) { return "<dt>" + t(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>";
  }

  function renderPanel() {
    $("[data-b-pick]").innerHTML = pickHTML();
    $("[data-b-pick2]").innerHTML = pickHTML();
    var ok = remote && state.available && !state.loading && state.time && state.table && !isPast(state.date, state.time) && tableFree(state.table, state.time);
    nextBtn.disabled = !ok;
    var hint = "";
    if (!remote || (!state.available && !state.loading)) hint = t("unavailable");
    else if (!C.hours[LT.weekday(state.date)]) hint = t("closed");
    else if (state.guests > B.maxOnlineGuests) hint = t("group", { n: B.maxOnlineGuests });
    else if (!state.time && !state.table) hint = t("pickBoth");
    else if (!state.time) hint = t("pickTime");
    else if (!state.table) hint = t("pickTable");
    err1.textContent = hint;
    err1.classList.toggle("is-hint", !!hint && hint !== t("closed"));

    var tt = $("[data-b-tabletimes]");
    if (state.table) {
      var free = allSlots().filter(function (s) { return !isPast(state.date, s) && tableFree(state.table, s); });
      tt.hidden = false;
      tt.innerHTML = "<p>" + t("tableTimes", { t: state.table }) + "</p><div>" +
        (free.length ? free.map(function (s) { return '<button type="button" class="slot slot--sm" data-slot="' + s + '" aria-selected="' + (state.time === s) + '">' + s + "</button>"; }).join("") : "<em>" + t("noTimes") + "</em>") + "</div>";
    } else tt.hidden = true;
  }

  function renderSteps() {
    [1, 2, 3].forEach(function (n) {
      $('[data-b-step="' + n + '"]').hidden = state.step !== n;
      var ind = $('[data-b-step-ind="' + n + '"]');
      ind.classList.toggle("is-active", state.step === n);
      ind.classList.toggle("is-done", state.step > n);
    });
  }

  function render() { renderSlots(); renderPlan(); renderPanel(); renderSteps(); }

  function fillGuests() {
    var html = "";
    for (var i = 1; i <= B.maxOnlineGuests; i++) html += '<option value="' + i + '">' + i + " " + (i === 1 ? t("person") : t("persons")) + "</option>";
    html += '<option value="' + (B.maxOnlineGuests + 1) + '">' + t("more", { n: B.maxOnlineGuests + 1 }) + "</option>";
    guestsEl.innerHTML = html;
    guestsEl.value = String(state.guests);
  }

  /* ---------- Load bookings for the selected day ---------- */
  var loadToken = 0;
  function load() {
    if (!remote) { state.bookings = []; state.loading = false; render(); return Promise.resolve(); }
    var my = ++loadToken;
    state.loading = true; state.available = false; render();
    return Store.list(state.date).then(function (list) {
      if (my !== loadToken) return;
      state.bookings = list; state.loading = false; state.available = true;
      if (state.time && !slotOpen(state.time)) state.time = "";
      if (state.table && state.time && !tableFree(state.table, state.time)) state.table = "";
      render();
    }).catch(function () {
      if (my !== loadToken) return;
      state.loading = false; state.available = false; state.bookings = []; render();
      err1.textContent = t("failed");
    });
  }

  /* ---------- Events ---------- */
  dateEl.addEventListener("change", function () {
    if (!dateEl.value) return;
    state.date = dateEl.value; state.time = ""; state.table = "";
    load();
  });
  guestsEl.addEventListener("change", function () {
    state.guests = +guestsEl.value;
    var tb = tableById(state.table);
    if (tb && !fits(tb)) state.table = "";
    render();
  });
  root.addEventListener("click", function (e) {
    var s = e.target.closest("[data-slot]");
    if (s && !s.disabled) {
      state.time = state.time === s.dataset.slot ? "" : s.dataset.slot;
      if (state.time && state.table && !tableFree(state.table, state.time)) state.table = "";
      render(); return;
    }
    var g = e.target.closest("[data-table]");
    if (g) pickTable(g.dataset.table);
  });
  planEl.addEventListener("keydown", function (e) {
    var g = e.target.closest("[data-table]");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickTable(g.dataset.table); }
  });
  function pickTable(id) {
    var tb = tableById(id);
    if (!remote || !state.available || state.loading || !tb || !fits(tb) || state.guests > B.maxOnlineGuests || !C.hours[LT.weekday(state.date)]) return;
    if (state.time && !tableFree(id, state.time)) return;
    state.table = state.table === id ? "" : id;
    render();
    var el = planEl.querySelector('[data-table="' + id + '"]'); if (el) el.focus({ preventScroll: true });
    // On small screens the summary sits below the plan – bring it into view once a table is chosen
    if (state.table && state.time && window.matchMedia("(max-width: 960px)").matches) {
      $(".book-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  nextBtn.addEventListener("click", function () {
    if (nextBtn.disabled) return;
    state.step = 2; render();
    form.elements.name.focus();
  });
  $("[data-b-back]").addEventListener("click", function () { state.step = 1; err2.textContent = ""; render(); });
  $("[data-b-again]").addEventListener("click", function () {
    form.reset(); state.step = 1; state.time = ""; state.table = ""; load();
  });

  // "Request an event" button elsewhere on the page pre-selects the occasion
  document.querySelectorAll("[data-reserve-occasion]").forEach(function (a) {
    a.addEventListener("click", function () { form.elements.occasion.value = a.dataset.reserveOccasion; });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements, bad = [];
    ["name", "phone", "email"].forEach(function (n) {
      var ok = f[n].value.trim() !== "";
      f[n].setAttribute("aria-invalid", String(!ok)); if (!ok) bad.push(f[n]);
    });
    if (bad.length) { err2.textContent = t("errRequired"); bad[0].focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) { f.email.setAttribute("aria-invalid", "true"); err2.textContent = t("errEmail"); f.email.focus(); return; }
    if (!f.consent.checked) { err2.textContent = t("errConsent"); return; }
    err2.textContent = "";

    var booking = {
      date: state.date, time: state.time, table: state.table, guests: state.guests,
      name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(),
      occasion: f.occasion.value, notes: f.notes.value.trim()
    };
    var btn = $("[data-b-submit]"), label = btn.innerHTML;
    btn.disabled = true; btn.textContent = t("sending");

    // Re-check against the latest bookings before saving
    Store.list(state.date).then(function (list) {
      state.bookings = list;
      if (!tableFree(booking.table, booking.time)) throw new Error("taken");
      return Store.create(booking);
    }).then(function () {
      done(booking);
    }).catch(function (err) {
      if (err.message === "taken") {
        state.table = ""; state.step = 1; render(); err1.textContent = t("taken"); err1.classList.remove("is-hint");
      } else err2.textContent = t("failed");
    }).then(function () { btn.disabled = false; btn.innerHTML = label; });
  });

  function done(b) {
    var occ = form.elements.occasion;
    var lines = [
      t("intro"), "",
      t("fDate") + ": " + LT.fmtDate(b.date),
      t("fTime") + ": " + b.time + t("clock"),
      t("fGuests") + ": " + b.guests,
      t("fTable") + ": " + b.table + " (" + tableById(b.table).seats + " " + t("seats") + ")",
      t("fName") + ": " + b.name,
      t("fPhone") + ": " + b.phone,
      t("fEmail") + ": " + b.email
    ];
    if (b.occasion) lines.push(t("fOcc") + ": " + occ.options[occ.selectedIndex].text);
    if (b.notes) lines.push(t("fNotes") + ": " + b.notes);
    lines.push("", t("outro"));
    var body = lines.join("\n");
    var subj = t("subject") + " – " + b.date + " " + b.time + " – " + t("fTable") + " " + b.table + " – " + b.guests + " P.";

    $("[data-b-done-title]").textContent = t("doneTitle");
    $("[data-b-done-text]").textContent = t("doneText");
    $("[data-b-summary]").textContent = lines.slice(2, -2).join("\n");
    $("[data-b-send]").hidden = true;
    $("[data-b-mail]").href = "mailto:" + C.email + "?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(body);
    $("[data-b-wa]").href = "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(body);

    state.bookings.push({ table: b.table, time: b.time });
    state.step = 3; render();
    $("[data-b-done-title]").focus();
  }

  document.addEventListener("lt:lang", function () { fillGuests(); render(); });

  /* ---------- Init ---------- */
  var now = LT.berlinNow(), start = now.iso;
  if (now.min + 60 > C.slots.to) start = LT.addDays(start, 1);
  while (!C.hours[LT.weekday(start)]) start = LT.addDays(start, 1);
  dateEl.min = now.iso;
  dateEl.max = LT.addDays(now.iso, C.bookAheadDays);
  dateEl.value = state.date = start;
  fillGuests();
  load();
})();
