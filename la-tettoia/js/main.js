/* La Tettoia – site script */
(function () {
  "use strict";

  /* ---------- Settings: adjust here ---------- */
  var CONFIG = {
    tz: "Europe/Berlin",
    // [open, close] in minutes after midnight; index = weekday (0 = Sunday). null = closed.
    hours: [[960, 1440], null, [960, 1440], [960, 1440], [960, 1440], [960, 1440], [960, 1440]],
    // Reservation time slots (first / last seating, minutes after midnight) and step
    slots: { from: 960, to: 1320, step: 30 },
    maxGuests: 12,
    bookAheadDays: 90,
    email: "latettoia.berlin@gmail.com",
    whatsapp: "491739357099",
    mapSrc: "https://www.google.com/maps?q=La+Tettoia,+Waldstra%C3%9Fe+55,+10551+Berlin&z=16&output=embed"
  };

  var root = document.documentElement;
  root.classList.add("js");
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Storage (may be unavailable) ---------- */
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }

  /* ---------- Language ---------- */
  var lang = store("lt-lang") || ((navigator.language || "de").toLowerCase().indexOf("de") === 0 ? "de" : "en");
  var T = {
    de: {
      all: "Alle", empty: "Keine Gerichte gefunden.", size: "Größe",
      openNow: "Jetzt geöffnet · bis {t} Uhr", opensToday: "Heute geöffnet ab {t} Uhr",
      opensDay: "Geschlossen · wieder geöffnet {d} ab {t} Uhr", tomorrow: "morgen",
      days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
      persons: "Personen", person: "Person", more: "Mehr als {n}",
      errRequired: "Bitte füllen Sie alle Pflichtfelder aus.", errEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      errMonday: "Montags ist Ruhetag – bitte wählen Sie einen anderen Tag.", errConsent: "Bitte bestätigen Sie die Datenschutzhinweise.",
      errPast: "Bitte wählen Sie ein Datum ab heute.", errGroup: "Für Gruppen über {n} Personen rufen Sie uns bitte an: 030 396 31 47.",
      errNoSlot: "Für heute sind online keine Zeiten mehr verfügbar – bitte rufen Sie uns an.",
      subject: "Reservierungsanfrage", intro: "Guten Tag, ich möchte gerne einen Tisch reservieren:",
      fDate: "Datum", fTime: "Uhrzeit", fGuests: "Personen", fName: "Name", fPhone: "Telefon", fEmail: "E-Mail",
      fOcc: "Anlass", fSeat: "Sitzwunsch", fNotes: "Nachricht", outro: "Vielen Dank – ich freue mich auf Ihre Bestätigung.",
      clock: " Uhr"
    },
    en: {
      all: "All", empty: "No dishes found.", size: "Size",
      openNow: "Open now · until {t}", opensToday: "Open today from {t}",
      opensDay: "Closed · open again {d} from {t}", tomorrow: "tomorrow",
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      persons: "guests", person: "guest", more: "More than {n}",
      errRequired: "Please fill in all required fields.", errEmail: "Please enter a valid e-mail address.",
      errMonday: "We are closed on Mondays – please choose another day.", errConsent: "Please accept the privacy notice.",
      errPast: "Please choose a date from today onwards.", errGroup: "For groups of more than {n}, please call us: +49 30 396 31 47.",
      errNoSlot: "No more online times are available today – please give us a call.",
      subject: "Table reservation request", intro: "Hello, I would like to book a table:",
      fDate: "Date", fTime: "Time", fGuests: "Guests", fName: "Name", fPhone: "Phone", fEmail: "E-mail",
      fOcc: "Occasion", fSeat: "Seating", fNotes: "Message", outro: "Thank you – looking forward to your confirmation.",
      clock: ""
    }
  };
  function t(key, vars) {
    var s = T[lang][key];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }

  function applyLang() {
    root.lang = lang;
    $$("[data-en]").forEach(function (el) {
      if (!el.hasAttribute("data-de")) el.setAttribute("data-de", el.innerHTML);
      el.innerHTML = lang === "en" ? el.getAttribute("data-en") : el.getAttribute("data-de");
    });
    $$("[data-en-placeholder]").forEach(function (el) {
      if (!el.hasAttribute("data-de-placeholder")) el.setAttribute("data-de-placeholder", el.placeholder);
      el.placeholder = lang === "en" ? el.getAttribute("data-en-placeholder") : el.getAttribute("data-de-placeholder");
    });
    renderMenu();
    updateStatus();
    fillGuests();
    fillTimes();
  }

  $("[data-lang-toggle]").addEventListener("click", function () {
    lang = lang === "de" ? "en" : "de";
    store("lt-lang", lang);
    applyLang();
  });

  /* ---------- Berlin time helpers ---------- */
  function berlinNow() {
    var parts = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: CONFIG.tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23"
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    return { day: wd, min: (+parts.hour) * 60 + (+parts.minute), iso: parts.year + "-" + parts.month + "-" + parts.day };
  }
  function hhmm(m) { m = m % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function closeLabel(m) { return m >= 1440 ? (lang === "de" ? "24:00" : "midnight") : hhmm(m); }

  /* ---------- Open / closed status ---------- */
  function updateStatus() {
    var el = $("[data-status]"); if (!el) return;
    var now = berlinNow(), h = CONFIG.hours[now.day], txt;
    if (h && now.min >= h[0] && now.min < h[1]) {
      el.classList.add("is-open");
      txt = t("openNow", { t: closeLabel(h[1]) });
    } else {
      el.classList.remove("is-open");
      if (h && now.min < h[0]) txt = t("opensToday", { t: hhmm(h[0]) });
      else {
        for (var i = 1; i <= 7; i++) {
          var d = (now.day + i) % 7;
          if (CONFIG.hours[d]) { txt = t("opensDay", { d: i === 1 ? t("tomorrow") : T[lang].days[d], t: hhmm(CONFIG.hours[d][0]) }); break; }
        }
      }
    }
    $("[data-status-text]", el).textContent = txt;
    $$("[data-hours] tr").forEach(function (tr) { tr.classList.toggle("is-today", +tr.dataset.day === now.day); });
  }
  setInterval(updateStatus, 60000);

  /* ---------- Header, nav, FAB ---------- */
  var header = $("[data-header]"), burger = $("[data-burger]"), nav = $("#nav"), fab = $("[data-fab]");
  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 40);
    var res = $("#reserve").getBoundingClientRect();
    fab.classList.toggle("is-visible", y > window.innerHeight * .8 && (res.top > window.innerHeight || res.bottom < 0));
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setNav(open) {
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  }
  burger.addEventListener("click", function () { setNav(!nav.classList.contains("is-open")); });
  $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { setNav(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setNav(false); });

  /* Highlight current section in nav */
  if ("IntersectionObserver" in window) {
    var links = $$('.nav a[href^="#"]:not(.btn)');
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle("is-current", a.getAttribute("href") === "#" + en.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.forEach(function (a) { var s = $(a.getAttribute("href")); if (s) spy.observe(s); });
  }

  /* ---------- Reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 70 + "ms"; io.observe(el); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- Menu ---------- */
  var M = window.MENU, board = $("[data-board]"), chipsEl = $("[data-chips]"), filtersEl = $("[data-filters]");
  var state = { book: "food", cat: "antipasti", q: "", tags: {} };
  var TAGS = { v: ["V", "tag--v", "Vegetarisch", "Vegetarian"], f: ["F", "tag--f", "Fisch", "Fish"], s: ["P", "tag--s", "Pikant", "Spicy"], h: ["★", "tag--h", "Empfehlung", "House favourite"] };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function renderChips() {
    var cats = M[state.book];
    var html = '<button class="chip" role="tab" data-cat="all" aria-selected="' + (state.cat === "all") + '">' + t("all") + "</button>";
    cats.forEach(function (c) {
      html += '<button class="chip" role="tab" data-cat="' + c.id + '" aria-selected="' + (state.cat === c.id) + '"><i>' + esc(c.it) + "</i>" + esc(c[lang]) + "</button>";
    });
    chipsEl.innerHTML = html;
  }

  function renderMenu() {
    if (!board) return;
    renderChips();
    filtersEl.hidden = state.book !== "food";
    var cats = M[state.book];
    var anyTag = Object.keys(state.tags).filter(function (k) { return state.tags[k]; });
    var searching = state.q || anyTag.length;
    var html = "";

    cats.forEach(function (c) {
      if (!searching && state.cat !== "all" && state.cat !== c.id) return;
      var head = '<div class="cat__head"><h3>' + esc(c.it) + "</h3><span>" + esc(c[lang]) + "</span></div>" +
        (c.note ? '<p class="cat__note">' + esc(c.note[lang]) + "</p>" : "");

      if (state.book === "drinks") {
        html += '<section class="cat">' + head + (c.wine ? wineTable(c) : drinkList(c)) + "</section>";
        return;
      }
      var items = c.items.filter(function (it) {
        var tags = it[5].split(" ");
        for (var i = 0; i < anyTag.length; i++) if (tags.indexOf(anyTag[i]) < 0) return false;
        if (state.q) return norm(it[1] + " " + it[2] + " " + it[3] + " " + it[0]).indexOf(norm(state.q)) > -1;
        return true;
      });
      if (!items.length) return;
      html += '<section class="cat">' + head + '<div class="items">' + items.map(itemHTML).join("") + "</div></section>";
    });

    board.innerHTML = html || '<p class="empty">' + t("empty") + "</p>";
  }

  function itemHTML(it) {
    var tags = it[5] ? it[5].split(" ").map(function (k) {
      var d = TAGS[k]; return d ? '<i class="tag ' + d[1] + '" title="' + (lang === "de" ? d[2] : d[3]) + '">' + d[0] + "</i>" : "";
    }).join("") : "";
    return '<article class="item"><div class="item__top"><span class="item__no">' + esc(it[0]) + '</span><span class="item__name">' + esc(it[1]) +
      "</span>" + (tags ? '<span class="item__tags">' + tags + "</span>" : "") + '<span class="item__dots"></span><span class="item__price">' + esc(it[4]) + " €</span></div>" +
      '<p class="item__desc">' + esc(lang === "de" ? it[2] : it[3]) + "</p>" +
      (it[6] ? '<p class="item__all">' + (lang === "de" ? "Allergene/Zusatzstoffe: " : "Allergens/additives: ") + esc(it[6]) + "</p>" : "") + "</article>";
  }

  function drinkList(c) {
    return '<div class="items">' + c.items.map(function (d) {
      return '<article class="item"><div class="item__top"><span class="item__name">' + esc(d[0]) + '</span><span class="item__dots"></span><span class="item__price">' +
        esc(d[2]) + " €</span></div>" + (d[1] ? '<p class="item__desc" style="margin-left:0">' + esc(d[1]) + "</p>" : "") + "</article>";
    }).join("") + "</div>";
  }

  function wineTable(c) {
    return c.groups.map(function (g) {
      return '<table class="wine-table"><caption>' + esc(g[lang]) + '</caption><thead><tr><th></th><th>0,25 l</th><th>0,5 l</th><th>1 l</th></tr></thead><tbody>' +
        g.items.map(function (w) {
          return "<tr><td>" + esc(w[0]) + "</td>" + w.slice(1).map(function (p) { return "<td>" + (p === "–" ? "–" : esc(p) + " €") + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table>";
    }).join("");
  }

  if (board) {
    $$("[data-book]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.book = b.dataset.book;
        state.cat = state.book === "food" ? "antipasti" : "all";
        $$("[data-book]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        renderMenu();
      });
    });
    chipsEl.addEventListener("click", function (e) {
      var c = e.target.closest("[data-cat]"); if (!c) return;
      state.cat = c.dataset.cat;
      state.q = ""; $("[data-search]").value = "";
      state.tags = {}; $$("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      renderMenu();
      var top = $("#menu .menu__switch").getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > top + 200) window.scrollTo({ top: top, behavior: "smooth" });
    });
    $$("[data-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        var on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        state.tags[b.dataset.filter] = on;
        renderMenu();
      });
    });
    var qTimer;
    $("[data-search]").addEventListener("input", function (e) {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { state.q = e.target.value.trim(); renderMenu(); }, 120);
    });
    $("[data-allergens]").addEventListener("click", function () {
      var on = this.getAttribute("aria-pressed") !== "true";
      this.setAttribute("aria-pressed", String(on));
      board.classList.toggle("show-allergens", on);
    });
  }

  /* ---------- Reviews slider ---------- */
  var slider = $("[data-slider]");
  if (slider) {
    var slides = $$(".slide", slider), dots = $("[data-dots]", slider), cur = 0, timer;
    slides.forEach(function (_, i) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", String(i + 1));
      b.addEventListener("click", function () { go(i); restart(); });
      dots.appendChild(b);
    });
    function go(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === cur); });
      $$("button", dots).forEach(function (b, k) { b.setAttribute("aria-current", String(k === cur)); });
    }
    function restart() { clearInterval(timer); timer = setInterval(function () { go(cur + 1); }, 6500); }
    go(0); restart();
  }

  /* ---------- Reservation ---------- */
  var form = $("[data-form]");
  var dateEl = $("[data-date]"), timeEl = $("[data-time]"), guestsEl = $("[data-guests]");

  function addDays(iso, n) {
    var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function weekday(iso) { return new Date(iso + "T12:00:00Z").getUTCDay(); }

  function fillGuests() {
    if (!guestsEl) return;
    var v = guestsEl.value || "2", html = "";
    for (var i = 1; i <= CONFIG.maxGuests; i++) html += '<option value="' + i + '">' + i + " " + (i === 1 ? t("person") : t("persons")) + "</option>";
    html += '<option value="more">' + t("more", { n: CONFIG.maxGuests }) + "</option>";
    guestsEl.innerHTML = html; guestsEl.value = v;
  }

  function fillTimes() {
    if (!timeEl) return;
    var v = timeEl.value, now = berlinNow(), html = "";
    var today = dateEl.value === now.iso;
    for (var m = CONFIG.slots.from; m <= CONFIG.slots.to; m += CONFIG.slots.step) {
      if (today && m < now.min + 60) continue;
      html += '<option value="' + hhmm(m) + '">' + hhmm(m) + t("clock") + "</option>";
    }
    timeEl.innerHTML = html;
    if (v && $('option[value="' + v + '"]', timeEl)) timeEl.value = v;
    else if ($('option[value="19:00"]', timeEl)) timeEl.value = "19:00";
  }

  function fmtDate(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  if (form) {
    var today = berlinNow().iso;
    dateEl.min = today;
    dateEl.max = addDays(today, CONFIG.bookAheadDays);
    // default: next open day (today if before last seating)
    var start = today, now0 = berlinNow();
    if (now0.min + 60 > CONFIG.slots.to) start = addDays(start, 1);
    while (!CONFIG.hours[weekday(start)]) start = addDays(start, 1);
    dateEl.value = start;
    dateEl.addEventListener("change", function () {
      fillTimes();
      showErr(dateEl.value && !CONFIG.hours[weekday(dateEl.value)] ? t("errMonday") : "");
    });
    guestsEl.addEventListener("change", function () {
      showErr(guestsEl.value === "more" ? t("errGroup", { n: CONFIG.maxGuests }) : "");
    });

    $$("[data-reserve-occasion]").forEach(function (a) {
      a.addEventListener("click", function () { $("[data-occasion]").value = a.dataset.reserveOccasion; });
    });

    var errEl = $("[data-error]");
    function showErr(msg) { errEl.textContent = msg || ""; }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements, bad = [];
      ["date", "time", "guests", "name", "phone", "email"].forEach(function (n) {
        var ok = String(f[n].value).trim() !== "";
        f[n].setAttribute("aria-invalid", String(!ok));
        if (!ok) bad.push(f[n]);
      });
      if (bad.length) { showErr(t("errRequired")); bad[0].focus(); return; }
      if (f.date.value < berlinNow().iso) { showErr(t("errPast")); f.date.focus(); return; }
      if (!CONFIG.hours[weekday(f.date.value)]) { showErr(t("errMonday")); f.date.focus(); return; }
      if (!timeEl.options.length) { showErr(t("errNoSlot")); return; }
      if (f.guests.value === "more") { showErr(t("errGroup", { n: CONFIG.maxGuests })); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) { f.email.setAttribute("aria-invalid", "true"); showErr(t("errEmail")); f.email.focus(); return; }
      if (!f.consent.checked) { showErr(t("errConsent")); return; }
      showErr("");

      var seatSel = form.querySelector('input[name="seating"]:checked');
      var lines = [
        t("intro"), "",
        t("fDate") + ": " + fmtDate(f.date.value),
        t("fTime") + ": " + f.time.value + t("clock"),
        t("fGuests") + ": " + f.guests.value,
        t("fName") + ": " + f.name.value.trim(),
        t("fPhone") + ": " + f.phone.value.trim(),
        t("fEmail") + ": " + f.email.value.trim()
      ];
      if (f.occasion.value) lines.push(t("fOcc") + ": " + f.occasion.options[f.occasion.selectedIndex].text);
      if (seatSel) lines.push(t("fSeat") + ": " + seatSel.nextElementSibling.textContent);
      if (f.notes.value.trim()) lines.push(t("fNotes") + ": " + f.notes.value.trim());
      lines.push("", t("outro"));
      var body = lines.join("\n");
      var subj = t("subject") + " – " + f.date.value + " " + f.time.value + " – " + f.guests.value + " P.";

      $("[data-summary]").textContent = lines.slice(2, -2).join("\n");
      $("[data-send-mail]").href = "mailto:" + CONFIG.email + "?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(body);
      $("[data-send-wa]").href = "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(body);
      var done = $("[data-done]");
      done.hidden = false;
      done.querySelector("h3").focus && done.querySelector("h3").setAttribute("tabindex", "-1");
      done.querySelector("h3").focus();
    });

    $("[data-reset]").addEventListener("click", function () { $("[data-done]").hidden = true; });
  }

  /* ---------- Map (loads only after consent) ---------- */
  var mapBtn = $("[data-map-load]");
  if (mapBtn) mapBtn.addEventListener("click", function () {
    var map = $("[data-map]"), f = document.createElement("iframe");
    f.src = CONFIG.mapSrc; f.title = "Google Maps – La Tettoia"; f.loading = "lazy";
    f.referrerPolicy = "no-referrer-when-downgrade";
    map.innerHTML = ""; map.appendChild(f);
  });

  /* ---------- Misc ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  applyLang();
})();
