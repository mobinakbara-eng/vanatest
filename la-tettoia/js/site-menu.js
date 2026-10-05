/* Replace the bundled menu with the manager-published menu. */
(function () {
  "use strict";
  var c = window.LT_CONFIG || {};
  if (!c.supabaseUrl || !c.supabaseKey) return;
  fetch(c.supabaseUrl.replace(/\/$/, "") + "/rest/v1/site_menu?select=content&id=eq.1", {
    headers: { apikey: c.supabaseKey }
  }).then(function (response) {
    if (!response.ok) throw new Error("menu unavailable");
    return response.json();
  }).then(function (rows) {
    if (!rows[0] || !rows[0].content) throw new Error("menu missing");
    window.LT.replaceMenu(rows[0].content);
  }).catch(function () { window.LT.replaceMenu(null); });
})();
