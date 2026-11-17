/* Park Universe: team features
 * Winter storm warnings from the National Weather Service (offer to start a storm log), repeating tasks
 * (monthly playground checks, weekly restroom checks, ...), and resident reports sent from the QR code on park signs.
 *
 * Needs: window.PU, window.PUAssets, window.PUOps; uses window.PUSync for the resident report queue.
 */
(function () {
  "use strict";
  var A = window.PUAssets, PU = window.PU, O = window.PUOps;
  if (!A || !PU || !O || !O.ui) return;
  var U = O.util, UI = O.ui, $ = function (id) { return document.getElementById(id); }, esc = U.esc, plural = U.plural, LS = U.LS;
  var REPORT_URL = "https://bombarules.github.io/ParkUniverse/report.html";
  var DAY = 86400000;
  function home() { var c = PU.PL.filter(function (p) { return p.n === "Central Park"; })[0]; return c ? c.ll : [-104.8885, 39.7745]; }
  function signedIn() { return !!(window.PUSync && PUSync.signedIn && PUSync.signedIn()); }
  function role() { return window.PUSync && PUSync.role ? PUSync.role() : null; }

  var css = '\
.tm-alert{position:fixed;left:10px;right:10px;top:calc(60px + env(safe-area-inset-top,0px));z-index:6;max-width:520px;margin:0 auto;border-radius:14px;padding:10px 10px 10px 14px;display:flex;align-items:center;gap:8px;font-size:13.5px;background:#1e3a8a;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.45)}\
.tm-alert span{flex:1}.tm-alert b{display:block;font-size:14.5px}.tm-alert button{border:0;border-radius:10px;padding:8px 12px;font-weight:800;background:#fff;color:#0b2238}.tm-alert .x2{background:rgba(255,255,255,.18);color:#fff}\
.touring .tm-alert,.placing .tm-alert,.layering .tm-alert,.walking .tm-alert,.gated .tm-alert{display:none}\
.tm-rep{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:8px 0;background:rgba(255,255,255,.04)}\
.tm-rep b{font-size:15px}.tm-rep p{margin:6px 0;font-size:14px;white-space:pre-wrap}.tm-rep img{display:block;width:100%;max-height:240px;object-fit:cover;border-radius:10px;margin:6px 0}\
.tm-rep small{color:var(--mut);display:block}.tm-chip{display:inline-block;font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.1);margin-right:4px}\
.tm-chip.hot{background:#ef4444;color:#fff}\
#puPrint .signpage{background:#fff;width:8.5in;height:11in;box-sizing:border-box;margin:14px auto;box-shadow:0 2px 14px rgba(0,0,0,.18);display:grid;grid-template-rows:1fr 1fr;page-break-after:always;break-after:page;overflow:hidden}\
#puPrint .sign{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:.4in;border-bottom:1px dashed #d1d5db;color:#0b2238}\
#puPrint .sign h3{font-size:28pt;margin:0 0 4pt;letter-spacing:-.01em}#puPrint .sign p{margin:2pt 0;font-size:13pt;color:#374151}#puPrint .sign img{width:2.6in;height:2.6in;image-rendering:pixelated;margin:10pt 0}\
#puPrint .sign small{font-size:9pt;color:#6b7280}@media screen and (max-width:860px){#puPrint .signpage{zoom:var(--tz,.45)}}@media print{#puPrint .signpage{box-shadow:none;margin:0;zoom:1!important}#puPrint .sign{border-bottom:0}}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ======================================================================
   * 1. WINTER STORM WARNINGS (National Weather Service, free, no key)
   * ====================================================================== */
  var WINTER = /winter storm|blizzard|winter weather|ice storm|snow squall|heavy snow|freezing rain|lake effect/i;
  var alertNow = null;
  function checkAlerts(force) {
    if (!window.fetch || navigator.onLine === false) return Promise.resolve(null);
    if (!force && Date.now() - LS.get("pu-nws-at", 0) < 20 * 60000) { showAlert(LS.get("pu-nws-last", null)); return Promise.resolve(null); }
    LS.set("pu-nws-at", Date.now()); var h = home();
    return fetch("https://api.weather.gov/alerts/active?point=" + h[1].toFixed(4) + "," + h[0].toFixed(4), { headers: { Accept: "application/geo+json" } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var a = ((j && j.features) || []).map(function (f) { return f.properties || {}; }).filter(function (p) { return WINTER.test(p.event || "") && p.status !== "Test"; })
          .sort(function (x, y) { return (/warning/i.test(y.event) ? 2 : /watch/i.test(y.event) ? 1 : 0) - (/warning/i.test(x.event) ? 2 : /watch/i.test(x.event) ? 1 : 0); })[0] || null;
        var o = a ? { id: a.id, event: a.event, ends: a.ends || a.expires || "", onset: a.onset || a.effective || "", head: a.headline || "", desc: String(a.description || "").slice(0, 600) } : null;
        LS.set("pu-nws-last", o); showAlert(o); return o; }, function () { return null; }); }
  function when(iso) { if (!iso) return ""; var d = new Date(iso); return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }); }
  function showAlert(o) { alertNow = o; var old = $("tmAlert"); if (old) old.remove(); if (!o) return;
    if (O.activeStormId && O.activeStormId()) return;            /* a storm log is already running */
    if (LS.get("pu-nws-skip", "") === o.id) return;
    if (o.ends && Date.parse(o.ends) < Date.now()) return;
    var d = document.createElement("div"); d.className = "tm-alert"; d.id = "tmAlert";
    d.innerHTML = "<span><b></b><small></small></span>" + (U.ro() ? "" : '<button id="tmGo">Start storm</button>') + '<button class="x2" id="tmX" aria-label="Not now">✕</button>';
    d.querySelector("b").textContent = "❄️ " + o.event; d.querySelector("small").textContent = (o.onset ? "From " + when(o.onset) : "") + (o.ends ? " until " + when(o.ends) : "") + ". Start the storm log now?";
    document.body.appendChild(d);
    if ($("tmGo")) $("tmGo").onclick = function () { O.startStorm(o.event + " " + new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }), { alert: o.id }).then(function () { d.remove(); O.open("storm"); PU.toast("Storm started. Check places off as they’re cleared."); }, function () {}); };
    $("tmX").onclick = function () { LS.set("pu-nws-skip", o.id); d.remove(); };
    if (LS.get("pu-nws-told", "") !== o.id && window.BombaNative && BombaNative.notify) { LS.set("pu-nws-told", o.id); try { BombaNative.notify(o.event + " for Central Park", (o.ends ? "Until " + when(o.ends) + ". " : "") + "Tap to start the storm log.", "storm"); } catch (e) {} } }
  A.onChange(function () { if (alertNow) showAlert(alertNow); });

  /* ======================================================================
   * 2. REPEATING TASKS
   * ====================================================================== */
  var UNIT = { day: "day", week: "week", month: "month", year: "year" };
  function recurs() { return A.all().filter(function (a) { return a.type === "recur"; }); }
  function addPeriod(d, n, unit, k) { var x = new Date(d.getTime()); if (unit === "day") x.setDate(x.getDate() + n * k); else if (unit === "week") x.setDate(x.getDate() + 7 * n * k);
    else { var day = d.getDate(); x.setDate(1); if (unit === "month") x.setMonth(x.getMonth() + n * k); else x.setFullYear(x.getFullYear() + n * k); var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); } return x; }
  function targets(r) { var w = (r.props || {}).where || {};
    if (w.mode === "park") return w.park ? [w.park] : [];
    if (w.mode === "pools") return PU.PL.filter(function (p) { return p.pool; }).map(function (p) { return p.n; });
    if (w.mode === "type") { var m = {}; U.things().forEach(function (a) { if (a.type === w.type) m[a.park] = 1; }); return Object.keys(m).sort(); }
    return []; }
  function occurrences(r, until) { var p = r.props || {}, s = U.parseYmd(p.start), n = Math.max(1, +p.every || 1), out = []; if (!s) return out;
    var today = U.parseYmd(U.ymd()), lo = addPeriod(today, n, p.unit, -1).getTime();
    for (var k = 0; k < 2000; k++) { var d = addPeriod(s, n, p.unit, k); if (d.getTime() > until) break; if (d.getTime() >= lo) out.push(d); } return out; }
  function nextDue(r) { var p = r.props || {}, s = U.parseYmd(p.start), n = Math.max(1, +p.every || 1), t = U.parseYmd(U.ymd()).getTime(); if (!s) return null;
    for (var k = 0; k < 2000; k++) { var d = addPeriod(s, n, p.unit, k); if (d.getTime() >= t) return d; } return null; }
  function genId(r, d, park) { return "t-r-" + r.id.replace(/^recur-/, "") + "-" + U.ymd(d).replace(/-/g, "") + "-" + U.slug(park).slice(0, 24); }
  var genBusy = false;
  function generate() {
    if (genBusy || U.ro()) return Promise.resolve(0); genBusy = true; var made = 0, q = Promise.resolve();
    recurs().forEach(function (r) { var p = r.props || {}; if (p.paused) return; var lead = Math.max(0, +p.lead || 0), until = U.parseYmd(U.ymd()).getTime() + lead * DAY, done = {}; (p.made || []).forEach(function (x) { done[x] = 1; });
      var parks = targets(r), fresh = [];
      occurrences(r, until).forEach(function (d) { parks.forEach(function (pk) { var id = genId(r, d, pk); if (done[id] || A.byId(id)) return; fresh.push({ id: id, d: d, pk: pk }); }); });
      if (!fresh.length) return;
      fresh.forEach(function (f) { q = q.then(function () { return A.save({ id: f.id, type: "task", created: Date.now(), photoCount: 0, park: f.pk, label: String(p.title || "Task").slice(0, 80), notes: p.notes || "", cond: "Open",
        props: { asset: "", assignee: p.assignee || "", due: U.ymd(f.d), pri: p.pri || "Normal", by: "repeat", src: "recur", recur: r.id } }).then(function () { made++; }); }); });
      q = q.then(function () { var cur = A.byId(r.id); if (!cur) return; cur.props.made = (cur.props.made || []).concat(fresh.map(function (f) { return f.id; })).slice(-400); return A.save(cur); }); });
    return q.then(function () { genBusy = false; if (made && O.refreshBadges) O.refreshBadges(); return made; }, function () { genBusy = false; return made; }); }
  function schedText(p) { var n = Math.max(1, +p.every || 1); return n === 1 ? (p.unit === "day" ? "Every day" : p.unit === "week" ? "Every week" : p.unit === "month" ? "Every month" : "Every year") : "Every " + n + " " + UNIT[p.unit] + "s"; }
  function whereText(r) { var w = (r.props || {}).where || {}, n = targets(r).length;
    return w.mode === "park" ? (w.park || "no park chosen") : w.mode === "pools" ? "every pool (" + n + ")" : w.mode === "type" ? "every park with a " + ((A.T[w.type] || {}).name || "?").toLowerCase() + " (" + n + ")" : ""; }
  var PRESETS = [
    { title: "Playground safety check", every: 1, unit: "month", where: { mode: "type", type: "playground" }, notes: "Look for broken or loose parts, sharp edges, missing hardware, worn surfacing and trip hazards. Fix or tape off anything unsafe and log it." },
    { title: "Restroom check", every: 1, unit: "week", where: { mode: "type", type: "bathroom" }, notes: "Supplies, cleanliness, fixtures, lights and locks." },
    { title: "Field prep for the season", every: 1, unit: "year", start: "03-15", where: { mode: "type", type: "ballfield" }, notes: "Drag and level the infield, check bases and fences, edge and line." },
    { title: "Pool safety equipment check", every: 1, unit: "month", where: { mode: "pools" }, notes: "First aid kit, AED pads and battery, rescue tubes, emergency phone, fire extinguisher tag." },
    { title: "Backflow device look-over", every: 3, unit: "month", where: { mode: "type", type: "backflow" }, notes: "Leaks, damage, cover and lock. The yearly test is tracked under What’s due." }];
  var edit = null;
  function screenRecur() {
    UI.title("Repeating tasks"); var b = UI.body(), list = recurs().sort(function (x, y) { return String(x.label).localeCompare(String(y.label)); });
    if (!U.ro()) UI.action("＋ New", function () { edit = { props: { every: 1, unit: "month", start: U.ymd(), where: { mode: "type", type: "playground" }, pri: "Normal", lead: 7 } }; UI.push(screenRecurEdit); });
    b.innerHTML = '<p class="mut" style="margin:0 0 6px">A repeating task makes a new task by itself each time it comes around, a week ahead, for each park it covers. They show up under Tasks and What’s due like any other.</p><div id="rcRows"></div>' +
      (U.ro() ? "" : '<div class="as-sec">Quick start</div><div id="rcPre"></div>');
    if (!list.length) $("rcRows").innerHTML = '<div class="empty">No repeating tasks yet.</div>';
    list.forEach(function (r) { var p = r.props || {}, nx = nextDue(r), row = document.createElement("button"); row.className = "op-row";
      row.innerHTML = '<img alt="" src="' + A.iconURL("recur") + '"><span><b></b><small></small></span><span class="when ' + (p.paused ? "" : "ok") + '">' + (p.paused ? "paused" : nx ? U.niceDay(U.ymd(nx)) : "—") + "</span>";
      row.querySelector("b").textContent = r.label; row.querySelector("small").textContent = schedText(p) + " · " + whereText(r) + (p.assignee ? " · " + p.assignee : "");
      row.onclick = function () { edit = JSON.parse(JSON.stringify(r)); UI.push(screenRecurEdit); }; $("rcRows").appendChild(row); });
    if ($("rcPre")) PRESETS.forEach(function (x) { if (list.some(function (r) { return r.label === x.title; })) return; var row = document.createElement("button"); row.className = "op-mini";
      row.innerHTML = "<span></span><small>＋ add</small>"; row.querySelector("span").textContent = x.title + " · " + schedText(x).toLowerCase();
      row.onclick = function () { var yr = new Date().getFullYear(), start = x.start ? (function () { var s = yr + "-" + x.start; return U.daysUntil(s) < 0 ? (yr + 1) + "-" + x.start : s; })() : U.ymd();
        edit = { props: { title: x.title, every: x.every, unit: x.unit, start: start, where: JSON.parse(JSON.stringify(x.where)), notes: x.notes, pri: "Normal", lead: 7 } }; UI.push(screenRecurEdit); }; $("rcPre").appendChild(row); });
  }
  function screenRecurEdit() {
    var p = edit.props, isNew = !edit.id, b = UI.body(), names = ((A.byId("roster") || {}).props || {}).names || [];
    UI.title(isNew ? "New repeating task" : "Repeating task");
    var typeOpts = A.TYPES.filter(function (t) { return t[2] !== "work" && t[2] !== "places"; }).map(function (t) { return '<option value="' + t[0] + '"' + ((p.where || {}).type === t[0] ? " selected" : "") + ">" + esc(t[1]) + "</option>"; }).join("");
    var parkOpts = PU.PL.map(function (x) { return x.n; }).sort().map(function (n) { return "<option" + ((p.where || {}).park === n ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("");
    b.innerHTML = '<div class="as-f"><label for="reT">What needs doing</label><input id="reT" maxlength="80"></div>' +
      '<div class="as-2"><div class="as-f"><label for="reN">Every</label><input id="reN" type="number" min="1" max="99" inputmode="numeric"></div><div class="as-f"><label for="reU">&nbsp;</label><select id="reU"><option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option></select></div></div>' +
      '<div class="as-2"><div class="as-f"><label for="reS">First one due</label><input id="reS" type="date"></div><div class="as-f"><label for="reL">Make it this many days early</label><input id="reL" type="number" min="0" max="60" inputmode="numeric"></div></div>' +
      '<div class="as-f"><label for="reW">Where</label><select id="reW"><option value="type">Every park that has a…</option><option value="pools">Every pool</option><option value="park">One park</option></select></div>' +
      '<div class="as-f" id="reTyB"><label for="reTy">Item</label><select id="reTy">' + typeOpts + '</select></div><div class="as-f" id="rePkB"><label for="rePk">Park</label><select id="rePk">' + parkOpts + "</select></div>" +
      '<p class="src" id="reCnt"></p>' +
      '<div class="as-2"><div class="as-f"><label for="reA">Assigned to</label><input id="reA" list="reAL" placeholder="Anyone"><datalist id="reAL">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + '</datalist></div>' +
      '<div class="as-f"><label for="reP">Priority</label><select id="reP"><option>Normal</option><option>High</option><option>Safety</option></select></div></div>' +
      '<div class="as-f"><label for="reNo">Notes on every task</label><textarea id="reNo"></textarea></div>' +
      (U.ro() ? "" : '<div class="as-act"><button class="p" id="reSave">' + (isNew ? "Create" : "Save") + "</button>" + (isNew ? "" : '<button id="rePause">' + (p.paused ? "Resume" : "Pause") + '</button><button class="d" id="reDel">Delete</button>') + "</div>") +
      (isNew ? "" : '<p class="src">Deleting stops new tasks. Tasks it already made stay.</p>');
    $("reT").value = p.title || edit.label || ""; $("reN").value = p.every || 1; $("reU").value = p.unit || "month"; $("reS").value = p.start || U.ymd(); $("reL").value = p.lead == null ? 7 : p.lead;
    $("reW").value = (p.where || {}).mode || "type"; $("reA").value = p.assignee || ""; $("reP").value = p.pri || "Normal"; $("reNo").value = p.notes || "";
    function read() { p.title = $("reT").value.trim(); p.every = Math.max(1, +$("reN").value || 1); p.unit = $("reU").value; p.start = $("reS").value || U.ymd(); p.lead = Math.max(0, +$("reL").value || 0);
      p.where = { mode: $("reW").value, type: $("reTy").value, park: $("rePk").value }; p.assignee = $("reA").value.trim(); p.pri = $("reP").value; p.notes = $("reNo").value; }
    function vis() { read(); $("reTyB").hidden = p.where.mode !== "type"; $("rePkB").hidden = p.where.mode !== "park"; var n = targets({ props: p }).length, nx = nextDue({ props: p });
      $("reCnt").textContent = (n ? "Makes " + plural(n, "task") + " each time" : "No park has one mapped yet, so nothing is made until one is") + (nx ? ". Next due " + U.niceDay(U.ymd(nx)) + "." : "."); }
    ["reW", "reTy", "rePk", "reN", "reU", "reS"].forEach(function (k) { $(k).onchange = vis; }); vis();
    if (U.ro()) { [].forEach.call(b.querySelectorAll("input,select,textarea"), function (el) { el.disabled = true; }); return; }
    $("reSave").onclick = function () { read(); if (!p.title) { PU.toast("Say what needs doing."); return; }
      var r = isNew ? { id: "recur-" + A.uid(), type: "recur", created: Date.now(), photoCount: 0, park: p.where.mode === "park" ? p.where.park : "", label: p.title, notes: "", cond: "Open", props: p } : A.byId(edit.id);
      if (!r) return; r.label = p.title; r.park = p.where.mode === "park" ? p.where.park : ""; r.props = Object.assign(r.props || {}, p);
      A.save(r).then(function () { return generate(); }).then(function (n) { PU.toast((isNew ? "Repeating task created" : "Saved") + (n ? " · " + plural(n, "task") + " made now" : "") + ".", 3000); var bk = $("opBack"); if (bk && !bk.hidden) bk.click(); }, function () {}); };
    if ($("rePause")) $("rePause").onclick = function () { var r = A.byId(edit.id); if (!r) return; r.props.paused = !r.props.paused; A.save(r).then(function () { PU.toast(r.props.paused ? "Paused. No new tasks until you resume it." : "Resumed."); edit = JSON.parse(JSON.stringify(r)); UI.redraw(); }); };
    if ($("reDel")) $("reDel").onclick = function () { var r = A.byId(edit.id); if (!r || !confirm("Delete “" + r.label + "”? Tasks it already made stay.")) return; A.remove(r).then(function () { PU.toast("Deleted."); $("opBack").click(); }); };
  }

  /* ======================================================================
   * 3. RESIDENT REPORTS (from the QR code on park signs)
   * ====================================================================== */
  var reps = [], repN = LS.get("pu-rr-new", 0), repShow = "new", repErr = "";
  function sb() { return window.PUSync && PUSync._client ? PUSync._client() : null; }
  function canReview() { var r = role(); return signedIn() && (r === "admin" || r === "editor" || r === "viewer"); }
  function loadReps() { var c = sb(); if (!c || !canReview()) return Promise.resolve([]);
    return c.from("public_reports").select("*").order("created_at", { ascending: false }).limit(200).then(function (r) {
      if (r.error) { repErr = /does not exist|schema cache/i.test(r.error.message) ? "The resident report table isn’t set up on the server yet." : r.error.message; return reps; }
      repErr = ""; reps = r.data || []; var n = reps.filter(function (x) { return x.status === "new"; }).length;
      if (n > repN && LS.get("pu-rr-told", 0) < n && window.BombaNative && BombaNative.notify && !U.ro()) { try { BombaNative.notify(plural(n, "new resident report"), "Tap to review them.", "reports"); } catch (e) {} LS.set("pu-rr-told", n); }
      repN = n; LS.set("pu-rr-new", n); if (O.refreshBadges) O.refreshBadges(); return reps; }, function () { return reps; }); }
  var CATMAP = { "Broken or damaged": ["Parks", "Medium"], "Trash or litter": ["Trash Cans", "Low"], "Graffiti": ["Graffiti", "Medium"], "Water or sprinkler": ["Water irrigation", "Medium"],
    "Snow or ice": ["Snow", "High"], "Safety hazard": ["Security", "Safety hazard"], "Lights out": ["Electrical", "Medium"], "Other": ["Parks", "Medium"] };
  function accept(x) { var c = sb(); if (!c || U.ro()) return; var cm = CATMAP[x.category] || CATMAP.Other, me = U.who() || "Resident report";
    var doc = { created: x.created_at, by: "Resident", cat: cm[0], title: String(x.message).split(/\n/)[0].slice(0, 70), pri: cm[1], loc: x.place, contractor: "", resp: "", cn: "", cc: "", cp: "", ce: "",
      notes: "From a resident (QR code on the park sign)" + (x.contact ? "\nContact: " + x.contact : "") + (x.lat != null ? "\nTheir location: " + (+x.lat).toFixed(6) + ", " + (+x.lng).toFixed(6) : "") + "\n\n" + x.message, photo: x.photo || "" };
    var id = "rr" + String(x.id).replace(/-/g, "").slice(0, 16);
    var rec = { id: "fr_" + id, type: "frrep", created: Date.parse(x.created_at) || Date.now(), photoCount: 0, park: x.place, label: doc.title, notes: "", props: { doc: doc } };
    return A.save(rec).then(function () { return c.from("public_reports").update({ status: "accepted", reviewed_by: me, reviewed_at: new Date().toISOString(), report_id: id }).eq("id", x.id); })
      .then(function (r) { if (r && r.error) throw r.error; PU.toast("Added to Field Reports.", 2500); return loadReps(); }).then(function () { UI.redraw(); }, function (e) { PU.toast("Couldn’t update it: " + (e.message || e)); }); }
  function dismiss(x) { var c = sb(); if (!c || U.ro()) return; c.from("public_reports").update({ status: "dismissed", reviewed_by: U.who() || "", reviewed_at: new Date().toISOString() }).eq("id", x.id)
    .then(function (r) { if (r.error) throw r.error; return loadReps(); }).then(function () { UI.redraw(); }, function (e) { PU.toast("Couldn’t update it: " + (e.message || e)); }); }
  function screenReps() {
    UI.title("Resident reports"); var b = UI.body();
    UI.action("🖨 Signs", function () { UI.push(screenSigns); });
    if (!signedIn()) { b.innerHTML = '<div class="empty">Sign in to see what residents have sent.</div>'; return; }
    var list = reps.filter(function (x) { return repShow === "new" ? x.status === "new" : x.status !== "new"; });
    b.innerHTML = '<div class="as-seg" id="rrK" style="margin-bottom:6px"></div>' + (repErr ? '<div class="op-note warn">' + esc(repErr) + "</div>" : "") + '<div id="rrRows"></div>' +
      '<p class="src">Residents scan the QR code on a park sign and send a short report, with a photo if they like. Nothing reaches Field Reports until someone here adds it.</p>';
    [["new", "New (" + reps.filter(function (x) { return x.status === "new"; }).length + ")"], ["old", "Handled"]].forEach(function (k) { var c = document.createElement("button"); c.textContent = k[1]; c.style.setProperty("--c", "#7cc8ff"); c.setAttribute("aria-pressed", repShow === k[0]); c.onclick = function () { repShow = k[0]; UI.redraw(); }; $("rrK").appendChild(c); });
    if (!list.length) $("rrRows").innerHTML = '<div class="empty">' + (repShow === "new" ? "Nothing new." : "Nothing handled yet.") + "</div>";
    list.forEach(function (x) { var d = document.createElement("div"); d.className = "tm-rep";
      d.innerHTML = '<div><span class="tm-chip' + (x.category === "Safety hazard" ? " hot" : "") + '"></span><b></b></div><small class="w"></small>' + (x.photo ? '<img alt="Photo from the resident">' : "") + "<p></p>" + (x.contact ? '<small class="c"></small>' : "") +
        (x.status === "new" && !U.ro() ? '<div class="as-act"><button class="p" data-a="1">➕ Add to Field Reports</button><button data-d="1">Dismiss</button></div>' : '<small class="s"></small>');
      d.querySelector(".tm-chip").textContent = x.category || "Other"; d.querySelector("b").textContent = x.place; d.querySelector(".w").textContent = new Date(x.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      d.querySelector("p").textContent = x.message; if (x.photo) d.querySelector("img").src = x.photo; if (x.contact) d.querySelector(".c").textContent = "Contact: " + x.contact;
      if (d.querySelector(".s")) d.querySelector(".s").textContent = x.status === "new" ? "New" : (x.status === "accepted" ? "Added to Field Reports" : "Dismissed") + (x.reviewed_by ? " by " + x.reviewed_by : "") + (x.reviewed_at ? " · " + new Date(x.reviewed_at).toLocaleDateString() : "");
      var ac = d.querySelector("[data-a]"), di = d.querySelector("[data-d]"); if (ac) ac.onclick = function () { ac.disabled = true; accept(x); }; if (di) di.onclick = function () { di.disabled = true; dismiss(x); };
      $("rrRows").appendChild(d); });
  }
  /* QR signs: two per page, one per park, pointing at the resident report page with the park filled in */
  var signPark = "";
  function screenSigns() {
    UI.title("Park sign QR codes"); var b = UI.body();
    b.innerHTML = '<p class="mut" style="margin:0 0 6px">Print a sign for each park. Residents scan it with their phone camera and get a short form with the park already filled in. No app or account needed.</p>' +
      '<div class="as-f"><label for="sgP">Which parks</label><select id="sgP"><option value="">All ' + PU.PL.length + " places</option>" + PU.PL.map(function (p) { return p.n; }).sort().map(function (n) { return "<option" + (n === signPark ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>" +
      '<div class="as-act"><button class="p" id="sgGo">🖨 Make the signs</button></div><p class="src">Two signs per letter-size page. The form is at ' + esc(REPORT_URL) + " (it needs GitHub Pages turned on for the repo).</p>";
    $("sgGo").onclick = function () { signPark = $("sgP").value; var parks = signPark ? [signPark] : PU.PL.map(function (p) { return p.n; }).sort();
      U.lib("vendor/qrcode.js", function () { return !!window.qrcode; }).then(function () { var pages = [];
        for (var i = 0; i < parks.length; i += 2) pages.push('<div class="signpage">' + parks.slice(i, i + 2).map(function (n) { var url = REPORT_URL + "?p=" + encodeURIComponent(n);
          return '<div class="sign"><h3>See a problem?</h3><p>Scan to tell the park crew.</p><img alt="" src="' + U.qrURL(url) + '"><p><b>' + esc(n) + "</b></p><small>For emergencies call 911.</small></div>"; }).join("") + "</div>");
        U.printView(plural(parks.length, "sign"), pages.join(""), { file: "Park report signs", back: function () { UI.start(screenReps); UI.push(screenSigns); } }); }); };
  }

  /* ======================================================================
   * tiles, links and timers
   * ====================================================================== */
  O.addTile({ id: "recur", icon: "🔁", title: "Repeating tasks", sub: function () { var n = recurs().filter(function (r) { return !(r.props || {}).paused; }).length; return n ? plural(n, "repeating task") : "Monthly checks, weekly rounds"; }, open: function (openFn) { openFn(screenRecur); } });
  O.addTile({ id: "reports2", icon: "📨", title: "Resident reports", sub: function () { return repN ? repN + " new from park signs" : "From the QR code on park signs"; }, badge: function () { return repN; }, hot: function () { return reps.some(function (x) { return x.status === "new" && x.category === "Safety hazard"; }); },
    open: function (openFn) { openFn(screenReps); loadReps().then(function () { if (UI.isOpen()) UI.redraw(); }); } });
  var oldOpen = window.bombaOpen;
  window.bombaOpen = function (what) { if (what === "reports") { O.ui.start(screenReps); loadReps().then(function () { UI.redraw(); }); return; } if (what === "recur") return O.ui.start(screenRecur); return oldOpen ? oldOpen(what) : O.open(what); };
  if (location.hash === "#reports") setTimeout(function () { window.bombaOpen("reports"); }, 2500);
  var ready = A.ready || Promise.resolve();
  ready.then(function () {
    setTimeout(function () { generate(); }, 6000);
    setTimeout(function () { checkAlerts(false); }, 4000);
    setTimeout(function () { loadReps(); }, 7000);
    setInterval(function () { if (!document.hidden) { checkAlerts(false); generate(); } }, 30 * 60000);
    setInterval(function () { if (!document.hidden) loadReps(); }, 5 * 60000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { generate(); checkAlerts(false); } });
  });
  window.PUTeam = { checkAlerts: checkAlerts, showAlert: showAlert, generate: generate, occurrences: occurrences, nextDue: nextDue, targets: targets, loadReps: loadReps, accept: accept, dismiss: dismiss, REPORT_URL: REPORT_URL, _reps: function (r) { if (r) reps = r; return reps; } };
})();
