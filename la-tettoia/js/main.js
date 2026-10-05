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
    bookAheadDays: 90,
    // Floor-plan booking: the public configuration is shared with the manager page.
    booking: {
      durationMin: 120,
      maxOnlineGuests: 6,
      supabaseUrl: (window.LT_CONFIG || {}).supabaseUrl || "",
      supabaseKey: (window.LT_CONFIG || {}).supabaseKey || ""
    },
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
    renderSpecials();
    updateStatus();
    document.dispatchEvent(new CustomEvent("lt:lang", { detail: lang }));
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
  var M = window.MENU, board = $("[data-board]"), categoryEl = $("[data-category]"), moreEl = $("[data-more]");
  var state = { book: "food", cat: "", q: "", tags: {} };
  var TAGS = { v: ["V", "tag--v", "Vegetarisch", "Vegetarian"], f: ["F", "tag--f", "Fisch", "Fish"], s: ["P", "tag--s", "Pikant", "Spicy"], h: ["★", "tag--h", "Empfehlung", "House favourite"] };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  // Featured cards use the published menu for their text and prices.
  function renderSpecials() {
    var section = $("#specialita"), target = $(".dishes", section);
    var images = {
      "119": "photo-1528137871618-79d2761e3fd5", "77": "photo-1595295333158-4742f28fbd85",
      "83": "photo-1621996346565-e3dbc646d9a9", "155": "photo-1600891964092-4316c288032e",
      "168": "photo-1467003909585-2f8a72700288", "202": "photo-1571877227200-a0d98ea607e9"
    };
    var featured = [];
    if (M) M.food.forEach(function (category) { (category.items || []).forEach(function (item) {
      if (images[item[0]]) featured.push(item);
    }); });
    section.hidden = !featured.length;
    target.innerHTML = featured.map(function (item) {
      return '<article class="dish"><div class="dish__img"><img src="https://images.unsplash.com/' + images[item[0]] +
        '?w=800&q=80&auto=format&fit=crop" alt="" loading="lazy"></div><div class="dish__body"><h3>' + esc(item[1]) +
        '</h3><p>' + esc(lang === "de" ? item[2] : item[3]) + '</p><span class="price">' + esc(item[4]) + ' €</span></div></article>';
    }).join("");
  }

  function renderCategories() {
    var cats = M[state.book];
    if (!cats.some(function (c) { return c.id === state.cat; })) state.cat = cats.length ? cats[0].id : "";
    var html = "";
    cats.forEach(function (c) {
      html += '<option value="' + esc(c.id) + '">' + esc(c.it) + " · " + esc(c[lang]) + "</option>";
    });
    categoryEl.innerHTML = html;
    categoryEl.value = state.cat;
    var index = cats.findIndex(function (c) { return c.id === state.cat; });
    $("[data-category-prev]").disabled = index <= 0;
    $("[data-category-next]").disabled = index < 0 || index >= cats.length - 1;
  }

  function renderMenu() {
    if (!board) return;
    if (!M) {
      categoryEl.replaceChildren(); moreEl.hidden = true;
      $("[data-menu-summary]").textContent = "";
      board.innerHTML = '<p class="empty">' + (lang === "de" ?
        "Speisekarte derzeit nicht verfügbar. Bitte fragen Sie im Restaurant nach." :
        "The menu is currently unavailable. Please ask our team.") + '</p>';
      return;
    }
    renderCategories();
    moreEl.hidden = state.book !== "food";
    var cats = M[state.book];
    var anyTag = Object.keys(state.tags).filter(function (k) { return state.tags[k]; });
    var searching = !!state.q;
    var html = "";
    var count = 0;

    cats.forEach(function (c) {
      if (!searching && state.cat !== c.id) return;
      var head = '<div class="cat__head"><h3>' + esc(c.it) + "</h3><span>" + esc(c[lang]) + "</span></div>" +
        (c.note ? '<p class="cat__note">' + esc(c.note[lang]) + "</p>" : "");

      if (state.book === "drinks") {
        var matched = c;
        if (state.q) {
          var q = norm(state.q), categoryMatches = norm(c.it + " " + c[lang]).indexOf(q) > -1;
          if (c.wine) {
            matched = Object.assign({}, c, { groups: c.groups.map(function (g) {
              return Object.assign({}, g, { items: categoryMatches || norm(g[lang]).indexOf(q) > -1 ? g.items : g.items.filter(function (w) { return norm(w.join(" ")).indexOf(q) > -1; }) });
            }).filter(function (g) { return g.items.length; }) });
          } else {
            matched = Object.assign({}, c, { items: categoryMatches ? c.items : c.items.filter(function (d) { return norm(d.join(" ")).indexOf(q) > -1; }) });
          }
        }
        var drinkItems = c.wine ? matched.groups.reduce(function (n, g) { return n + g.items.length; }, 0) : matched.items.length;
        if (!drinkItems) return;
        count += drinkItems;
        html += '<section class="cat">' + head + (c.wine ? wineTable(matched) : drinkList(matched)) + "</section>";
        return;
      }
      var items = c.items.filter(function (it) {
        var tags = it[5].split(" ");
        for (var i = 0; i < anyTag.length; i++) if (tags.indexOf(anyTag[i]) < 0) return false;
        if (state.q) return norm(it[1] + " " + it[2] + " " + it[3] + " " + it[0]).indexOf(norm(state.q)) > -1;
        return true;
      });
      if (!items.length) return;
      count += items.length;
      html += '<section class="cat">' + head + '<div class="items">' + items.map(itemHTML).join("") + "</div></section>";
    });

    $("[data-menu-summary]").textContent = state.q ?
      (lang === "de" ? count + " Treffer in der Speisekarte" : count + " results in the menu") :
      (lang === "de" ? count + " Einträge in dieser Kategorie" : count + " items in this category");
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
        state.cat = ""; state.q = ""; $("[data-search]").value = "";
        state.tags = {}; $$("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        $$("[data-book]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        renderMenu();
      });
    });
    function selectCategory(id) {
      state.cat = id;
      state.q = ""; $("[data-search]").value = "";
      state.tags = {}; $$("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      renderMenu();
    }
    categoryEl.addEventListener("change", function () { selectCategory(this.value); });
    ["prev", "next"].forEach(function (direction) {
      $("[data-category-" + direction + "]").addEventListener("click", function () {
        var cats = M[state.book], index = cats.findIndex(function (c) { return c.id === state.cat; });
        if (cats[index + (direction === "next" ? 1 : -1)]) selectCategory(cats[index + (direction === "next" ? 1 : -1)].id);
      });
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

  function addDays(iso, n) {
    var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function weekday(iso) { return new Date(iso + "T12:00:00Z").getUTCDay(); }
  function fmtDate(iso, opts) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "de" ? "de-DE" : "en-GB",
      Object.assign({ weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }, opts || {}));
  }

  /* Shared helpers for booking.js */
  window.LT = {
    CONFIG: CONFIG, lang: function () { return lang; }, esc: esc,
    berlinNow: berlinNow, hhmm: hhmm, addDays: addDays, weekday: weekday, fmtDate: fmtDate,
    replaceMenu: function (menu) {
      M = menu && Array.isArray(menu.food) && Array.isArray(menu.drinks) ? menu : null;
      state.cat = "";
      renderMenu();
      renderSpecials();
    }
  };

  applyLang();
})();
