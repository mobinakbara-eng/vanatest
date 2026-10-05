/* La Tettoia manager dashboard. Authorization is enforced by Supabase RLS. */
(function () {
  "use strict";
  var cfg = window.LT_CONFIG || {};
  var base = (cfg.supabaseUrl || "").replace(/\/$/, "");
  var key = cfg.supabaseKey || "";
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var session = null, menu = null, menuVersion = 0, dirty = false;
  var book = "food", categoryIndex = 0, wineIndex = 0;
  var reservations = [];
  var pendingAction = null;

  function message(s, login) { $(login ? "[data-login-message]" : "[data-app-message]").textContent = s || ""; }
  function menuMessage(s) { $("[data-menu-state]").textContent = s || ""; }
  function node(tag, text, className) {
    var el = document.createElement(tag);
    if (text != null) el.textContent = String(text);
    if (className) el.className = className;
    return el;
  }
  function apiError(response) {
    return response.text().then(function (body) {
      var detail = "";
      try { detail = JSON.parse(body).message || ""; } catch (e) { /* ignore */ }
      throw new Error(detail || "Serverfehler (" + response.status + ")");
    });
  }
  function saveSession(value) {
    session = value;
    if (value) sessionStorage.setItem("lt-manager-session", JSON.stringify(value));
    else sessionStorage.removeItem("lt-manager-session");
  }
  function refreshToken() {
    if (!session || !session.refresh_token) return Promise.reject(new Error("Bitte erneut anmelden."));
    return fetch(base + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (r) { return r.ok ? r.json() : apiError(r); }).then(function (data) {
      saveSession(Object.assign({}, session, data, { expires_at_ms: Date.now() + data.expires_in * 1000 }));
      return session.access_token;
    });
  }
  function token() {
    if (!session) return Promise.reject(new Error("Bitte anmelden."));
    if (Date.now() + 60000 >= session.expires_at_ms) return refreshToken();
    return Promise.resolve(session.access_token);
  }
  function request(path, options) {
    options = options || {};
    return token().then(function (access) {
      return fetch(base + "/rest/v1/" + path, {
        method: options.method || "GET",
        headers: Object.assign({ apikey: key, Authorization: "Bearer " + access,
          "Content-Type": "application/json" }, options.headers || {}),
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    }).then(function (r) { return r.ok ? (r.status === 204 ? [] : r.json()) : apiError(r); });
  }
  function signOut() {
    var access = session && session.access_token;
    saveSession(null);
    $("[data-app]").hidden = true;
    $("[data-login]").hidden = false;
    $("[data-login-form]").reset();
    if (access) fetch(base + "/auth/v1/logout", { method: "POST", headers: { apikey: key, Authorization: "Bearer " + access } }).catch(function () {});
  }
  function enter() {
    if (!session || !session.user || !session.user.id) return Promise.reject(new Error("Sitzung ungültig."));
    return request("manager_accounts?select=user_id&user_id=eq." + encodeURIComponent(session.user.id)).then(function (rows) {
      if (rows.length !== 1) throw new Error("Dieses Konto hat keine Manager-Berechtigung.");
      $("[data-account]").textContent = session.user.email;
      $("[data-login]").hidden = true;
      $("[data-app]").hidden = false;
      return Promise.all([loadReservations(), loadMenu()]);
    });
  }
  $("[data-login-form]").addEventListener("submit", function (event) {
    event.preventDefault();
    if (!base || !key) { message("Supabase ist noch nicht eingerichtet.", true); return; }
    var form = event.currentTarget;
    var button = $("button[type=submit]", form);
    button.disabled = true; message("Anmeldung läuft …", true);
    fetch(base + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.elements.email.value.trim(), password: form.elements.password.value })
    }).then(function (r) { return r.ok ? r.json() : apiError(r); }).then(function (data) {
      saveSession(Object.assign({}, data, { expires_at_ms: Date.now() + data.expires_in * 1000 }));
      return enter();
    }).then(function () { message("", true); }).catch(function (error) {
      signOut(); message(error.message, true);
    }).then(function () { button.disabled = false; });
  });
  $("[data-signout]").addEventListener("click", signOut);
  if (!base || !key) message("Supabase ist noch nicht eingerichtet. Tragen Sie die öffentliche URL und den publishable key in js/config.js ein.", true);
  else {
    try { session = JSON.parse(sessionStorage.getItem("lt-manager-session")); } catch (e) { session = null; }
    if (session) enter().catch(function () { signOut(); message("Bitte erneut anmelden.", true); });
  }

  /* Reservations */
  function today() {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    var p = {}; parts.forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day;
  }
  $("[data-from-date]").value = today();
  function loadReservations() {
    var from = $("[data-from-date]").value || today();
    message("Reservierungen werden geladen …");
    return request("reservations?select=id,date,time,table_id,guests,name,phone,email,occasion,notes,status,manager_note,created_at&date=gte." + encodeURIComponent(from) + "&order=date.asc,time.asc&limit=500").then(function (rows) {
      reservations = rows; renderReservations(); message("");
    }).catch(function (error) { message("Reservierungen konnten nicht geladen werden: " + error.message); });
  }
  function statusLabel(value) { return { pending: "Anfrage", confirmed: "Bestätigt", cancelled: "Storniert" }[value] || value; }
  function guestMail(row) {
    var subject = "La Tettoia · Reservierung " + row.date + " " + String(row.time).slice(0, 5);
    var result = row.status === "confirmed" ? "ist bestätigt" : row.status === "cancelled" ? "wurde storniert" : "ist eingegangen und wird geprüft";
    var body = "Guten Tag " + row.name + ",\n\nIhre Reservierung für " + row.guests + " Personen am " + row.date +
      " um " + String(row.time).slice(0, 5) + " Uhr " + result + ".\n\nViele Grüße\nLa Tettoia";
    return "mailto:" + encodeURIComponent(row.email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }
  function renderReservations() {
    var filter = $("[data-status-filter]").value;
    var list = $("[data-reservations]"); list.replaceChildren();
    var pending = reservations.filter(function (r) { return r.status === "pending"; }).length;
    $("[data-pending-count]").textContent = pending ? String(pending) : "";
    var visible = reservations.filter(function (r) { return filter === "all" ||
      (filter === "active" ? r.status !== "cancelled" : r.status === filter); });
    if (!visible.length) { list.appendChild(node("p", "Keine Reservierungen für diese Auswahl.", "manager-empty")); return; }
    visible.forEach(function (r) {
      var card = node("article", null, "reservation-card");
      var when = node("div", null, "reservation-when");
      when.appendChild(node("strong", String(r.time).slice(0, 5)));
      when.appendChild(node("span", new Date(r.date + "T12:00:00Z").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })));
      var info = node("div");
      info.appendChild(node("h3", r.name + " · " + r.guests + " Pers. · Tisch " + r.table_id));
      info.appendChild(node("span", statusLabel(r.status), "reservation-badge reservation-badge--" + r.status));
      var meta = node("div", null, "reservation-meta");
      var phone = node("a", r.phone); phone.href = "tel:" + String(r.phone).replace(/[^+0-9]/g, "");
      var email = node("a", r.email); email.href = guestMail(r);
      meta.append(phone, document.createTextNode(" · "), email);
      if (r.occasion) meta.appendChild(document.createTextNode(" · " + r.occasion));
      info.appendChild(meta);
      if (r.notes) info.appendChild(node("p", r.notes, "reservation-note"));
      var note = node("textarea"); note.value = r.manager_note || ""; note.placeholder = "Interne Notiz"; note.maxLength = 1000; note.setAttribute("aria-label", "Interne Notiz für " + r.name);
      info.appendChild(note);
      var saveNote = node("button", "Notiz speichern", "manager-quiet"); saveNote.type = "button";
      saveNote.addEventListener("click", function () { updateReservation(r, { manager_note: note.value.trim() || null }); });
      info.appendChild(saveNote);
      var actions = node("div", null, "reservation-actions");
      if (r.status !== "confirmed") actions.appendChild(action("Bestätigen", function () { updateReservation(r, { status: "confirmed" }); }));
      if (r.status !== "cancelled") actions.appendChild(action("Stornieren", function () {
        confirmAction("Reservierung stornieren?", "Die Reservierung von " + r.name + " wird storniert und der Tisch wieder freigegeben.",
          "Reservierung stornieren", function () { updateReservation(r, { status: "cancelled" }); });
      }, "manager-danger"));
      if (r.status !== "pending") {
        var inform = node("a", "Gast informieren ↗", "manager-quiet");
        inform.href = guestMail(r); actions.appendChild(inform);
      }
      card.append(when, info, actions); list.appendChild(card);
    });
  }
  function action(label, handler, extra) {
    var button = node("button", label, "manager-quiet " + (extra || ""));
    button.type = "button"; button.addEventListener("click", handler); return button;
  }
  function confirmAction(title, description, label, handler) {
    pendingAction = handler;
    $("[data-confirm-title]").textContent = title;
    $("[data-confirm-message]").textContent = description;
    $("[data-confirm-approve]").textContent = label;
    $("[data-confirm-dialog]").showModal();
  }
  $("[data-confirm-close]").addEventListener("click", function () { $("[data-confirm-dialog]").close(); });
  $("[data-confirm-approve]").addEventListener("click", function () {
    var handler = pendingAction;
    $("[data-confirm-dialog]").close();
    if (handler) handler();
  });
  $("[data-confirm-dialog]").addEventListener("close", function () { pendingAction = null; });
  function updateReservation(row, change) {
    message("Änderung wird gespeichert …");
    request("reservations?id=eq." + row.id, { method: "PATCH", headers: { Prefer: "return=representation" }, body: change }).then(function (rows) {
      if (rows.length !== 1) throw new Error("Reservierung nicht gefunden.");
      return loadReservations();
    }).catch(function (error) { message("Änderung fehlgeschlagen: " + error.message); });
  }
  $("[data-refresh]").addEventListener("click", loadReservations);
  $("[data-from-date]").addEventListener("change", loadReservations);
  $("[data-status-filter]").addEventListener("change", renderReservations);
  setInterval(function () { if (session && !document.hidden) loadReservations(); }, 45000);

  /* Menu editor: keeps the published JSON shape used by the public site. */
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function loadMenu() {
    menuMessage("Speisekarte wird geladen …");
    return request("site_menu?select=content,version&id=eq.1").then(function (rows) {
      if (rows.length !== 1) throw new Error("Menü fehlt. Bitte seed-menu.sql ausführen.");
      menu = copy(rows[0].content); menuVersion = rows[0].version; dirty = false;
      menuMessage("Veröffentlicht · Version " + menuVersion); renderCategories();
    }).catch(function (error) { menuMessage("Laden fehlgeschlagen: " + error.message); });
  }
  function markDirty() { dirty = true; menuMessage("Nicht veröffentlichte Änderungen"); renderCategories(); }
  function currentCategory() { return menu && menu[book] && menu[book][categoryIndex]; }
  function currentItems() {
    var c = currentCategory();
    return !c ? [] : c.wine ? (c.groups[wineIndex] || { items: [] }).items : c.items;
  }
  function renderCategories() {
    if (!menu) return;
    var categories = menu[book], select = $("[data-menu-category]");
    if (categoryIndex >= categories.length) categoryIndex = Math.max(0, categories.length - 1);
    select.replaceChildren();
    categories.forEach(function (c, i) { var option = node("option", c.it + " · " + c.de); option.value = i; select.appendChild(option); });
    select.value = String(categoryIndex);
    var c = currentCategory();
    $("[data-category-title]").textContent = c ? c.it + " · " + c.de : "Noch keine Kategorie";
    $("[data-edit-category]").disabled = $("[data-remove-category]").disabled = !c;
    $("[data-add-item]").disabled = !c;
    $("[data-wine-controls]").hidden = !c || !c.wine;
    if (c && c.wine) {
      if (wineIndex >= c.groups.length) wineIndex = Math.max(0, c.groups.length - 1);
      var groupSelect = $("[data-wine-group]"); groupSelect.replaceChildren();
      c.groups.forEach(function (g, i) { var o = node("option", g.de + " / " + g.en); o.value = i; groupSelect.appendChild(o); });
      groupSelect.value = String(wineIndex);
      $("[data-add-item]").disabled = !c.groups.length;
      $("[data-remove-wine-group]").disabled = !c.groups.length;
    }
    renderItems();
  }
  function renderItems() {
    var target = $("[data-menu-items]"); target.replaceChildren();
    var c = currentCategory(); if (!c) return;
    var items = currentItems();
    if (!items.length) { target.appendChild(node("p", "Noch keine Einträge.", "manager-empty")); return; }
    items.forEach(function (item, index) {
      var row = node("div", null, "menu-admin-item"); var description = node("div");
      description.appendChild(node("strong", c.wine ? item[0] : book === "food" ? item[1] : item[0]));
      description.appendChild(node("small", c.wine ? item.slice(1).join(" / ") : book === "food" ? item[4] + " € · " + item[2] : item[2] + " € · " + item[1]));
      var buttons = node("div", null, "menu-admin-item-actions");
      buttons.appendChild(action("Bearbeiten", function () { openEditor("item", index); }));
      buttons.appendChild(action("Entfernen", function () {
        confirmAction("Eintrag entfernen?", "Dieser Eintrag wird nach dem Veröffentlichen nicht mehr auf der Website angezeigt.",
          "Eintrag entfernen", function () { items.splice(index, 1); markDirty(); });
      }, "manager-danger"));
      row.append(description, buttons); target.appendChild(row);
    });
  }
  $("[data-menu-book]").addEventListener("change", function (e) { book = e.target.value; categoryIndex = 0; wineIndex = 0; renderCategories(); });
  $("[data-menu-category]").addEventListener("change", function (e) { categoryIndex = +e.target.value; wineIndex = 0; renderCategories(); });
  $("[data-wine-group]").addEventListener("change", function (e) { wineIndex = +e.target.value; renderItems(); });
  $("[data-add-category]").addEventListener("click", function () { openEditor("category", -1); });
  $("[data-edit-category]").addEventListener("click", function () { openEditor("category", categoryIndex); });
  $("[data-remove-category]").addEventListener("click", function () {
    confirmAction("Kategorie entfernen?", "Diese Kategorie und alle ihre Einträge werden nach dem Veröffentlichen entfernt.",
      "Kategorie entfernen", function () { menu[book].splice(categoryIndex, 1); markDirty(); });
  });
  $("[data-add-item]").addEventListener("click", function () { openEditor("item", -1); });
  $("[data-add-wine-group]").addEventListener("click", function () { openEditor("group", -1); });
  $("[data-remove-wine-group]").addEventListener("click", function () {
    confirmAction("Weingruppe entfernen?", "Diese Weingruppe und alle ihre Einträge werden nach dem Veröffentlichen entfernt.",
      "Weingruppe entfernen", function () { currentCategory().groups.splice(wineIndex, 1); markDirty(); });
  });
  function field(name, label, value, required) {
    var wrap = node("label", label), input = node("input");
    input.name = name; input.value = value == null ? "" : value;
    input.maxLength = name === "description" || name === "descriptionEn" ? 500 : 180;
    input.required = !!required; wrap.appendChild(input); return wrap;
  }
  function openEditor(kind, index) {
    var c = currentCategory(), fields = $("[data-editor-fields]"); fields.replaceChildren();
    var original = kind === "category" ? menu[book][index] : kind === "group" ? c.groups[index] : currentItems()[index];
    var creating = index < 0;
    $("[data-editor-title]").textContent = (creating ? "Neuer Eintrag" : "Bearbeiten") + (kind === "category" ? " · Kategorie" : kind === "group" ? " · Weingruppe" : "");
    if (kind === "category") {
      if (creating) {
        fields.appendChild(field("id", "Interne Kennung (z. B. dolci)", "", true));
        if (book === "drinks") { var label = node("label", "Typ"), select = node("select"); select.name = "type";
          [["normal", "Getränke"], ["wine", "Wein nach Glas/Karaffe"]].forEach(function (p) { var o = node("option", p[1]); o.value = p[0]; select.appendChild(o); }); label.appendChild(select); fields.appendChild(label); }
      }
      [["it", "Italienischer Name"], ["de", "Deutscher Name"], ["en", "Englischer Name"]].forEach(function (p) { fields.appendChild(field(p[0], p[1], original && original[p[0]], true)); });
      if (book === "food") { fields.appendChild(field("noteDe", "Hinweis Deutsch (optional)", original && original.note && original.note.de)); fields.appendChild(field("noteEn", "Hinweis Englisch (optional)", original && original.note && original.note.en)); }
    } else if (kind === "group") {
      fields.appendChild(field("de", "Weingruppe Deutsch", original && original.de, true));
      fields.appendChild(field("en", "Weingruppe Englisch", original && original.en, true));
    } else {
      var names = c.wine ? [["name", "Wein"], ["p1", "0,25 l Preis"], ["p2", "0,5 l Preis"], ["p3", "1 l Preis"]] :
        book === "food" ? [["number", "Nummer"], ["name", "Name"], ["description", "Beschreibung Deutsch"], ["descriptionEn", "Beschreibung Englisch"], ["price", "Preis ohne €"], ["tags", "Tags: v f s h"], ["allergens", "Allergene/Zusatzstoffe"]] :
        [["name", "Getränk"], ["size", "Größe"], ["price", "Preis ohne €"]];
      names.forEach(function (p, i) { fields.appendChild(field(p[0], p[1], original && original[i], p[0] === "name" || p[0] === "price")); });
    }
    var form = $("[data-editor-form]");
    form.onsubmit = function (event) {
      event.preventDefault();
      var f = new FormData(form), value;
      if (kind === "category") {
        if (creating) {
          var id = String(f.get("id")).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
          if (!id || menu[book].some(function (x) { return x.id === id; })) { window.alert("Kennung fehlt oder ist bereits vergeben."); return; }
          value = { id: id, it: f.get("it").trim(), de: f.get("de").trim(), en: f.get("en").trim() };
          if (f.get("type") === "wine") { value.wine = true; value.groups = []; }
          else value.items = [];
          menu[book].push(value); categoryIndex = menu[book].length - 1;
        } else {
          original.it = f.get("it").trim(); original.de = f.get("de").trim(); original.en = f.get("en").trim();
          if (book === "food") { var de = f.get("noteDe").trim(), en = f.get("noteEn").trim(); if (de || en) original.note = { de: de, en: en }; else delete original.note; }
        }
      } else if (kind === "group") {
        value = { de: f.get("de").trim(), en: f.get("en").trim(), items: original ? original.items : [] };
        if (creating) { c.groups.push(value); wineIndex = c.groups.length - 1; } else c.groups[index] = value;
      } else {
        value = names.map(function (p) { return String(f.get(p[0]) || "").trim(); });
        if (creating) currentItems().push(value); else currentItems()[index] = value;
      }
      $("[data-editor]").close(); markDirty();
    };
    $("[data-editor]").showModal();
  }
  $("[data-editor-close]").addEventListener("click", function () { $("[data-editor]").close(); });
  $("[data-editor-cancel]").addEventListener("click", function () { $("[data-editor]").close(); });
  $("[data-publish]").addEventListener("click", function () {
    if (!dirty || !menu) return;
    var button = $("[data-publish]"); button.disabled = true; menuMessage("Wird veröffentlicht …");
    request("site_menu?id=eq.1&version=eq." + menuVersion, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: { content: menu, version: menuVersion + 1, updated_at: new Date().toISOString() }
    }).then(function (rows) {
      if (rows.length !== 1) throw new Error("Jemand hat das Menü inzwischen geändert. Bitte neu laden und Änderungen erneut prüfen.");
      menuVersion = rows[0].version; dirty = false; menuMessage("Veröffentlicht · Version " + menuVersion);
    }).catch(function (error) { menuMessage("Veröffentlichung fehlgeschlagen: " + error.message); }).then(function () { button.disabled = false; });
  });
  document.querySelectorAll("[data-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      var panel = button.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach(function (x) { x.removeAttribute("aria-current"); });
      button.setAttribute("aria-current", "page");
      document.querySelectorAll("[data-panel]").forEach(function (x) { x.hidden = x.dataset.panel !== panel; });
    });
  });
  window.addEventListener("beforeunload", function (event) { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
})();
