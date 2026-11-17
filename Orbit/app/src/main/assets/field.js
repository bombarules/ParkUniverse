/* Park Universe: filling the map
 * Walk mode (one tap drops an item where you stand), photos with GPS become items, CSV / GeoJSON / KML import,
 * tracing lines on the satellite photo, and sidewalks from OpenStreetMap for the snow layer.
 * Everything is saved as ordinary items, so it syncs, backs up and exports like anything added by hand.
 *
 * Needs: window.PU (index.html), window.PUAssets (assets.js), window.PUOps (ops.js).
 */
(function () {
  "use strict";
  var A = window.PUAssets, PU = window.PU, O = window.PUOps;
  if (!A || !PU || !O || !O.ui) return;
  var U = O.util, UI = O.ui, $ = function (id) { return document.getElementById(id); }, esc = U.esc, plural = U.plural;
  function ro() { if (U.ro()) { PU.toast("View only — ask an admin for editor access."); return true; } return false; }
  function pointTypes(layer) { return A.TYPES.filter(function (t) { return t[2] === layer && t[3] === "point"; }); }
  function parkByName(n) { return PU.PL.filter(function (p) { return p.n === n; })[0] || null; }
  function nextLabel(type, park) { var n = A.all().filter(function (a) { return a.type === type && a.park === park; }).length + 1; return A.T[type].name + " " + n; }
  function newItem(type, lng, lat, o) { o = o || {};
    var park = o.park || A.nearestPark([lng, lat]);
    return { id: A.uid(), type: type, lng: +(+lng).toFixed(7), lat: +(+lat).toFixed(7), acc: o.acc == null ? null : o.acc, park: park, cond: o.cond || A.condList({ type: type })[0],
      label: o.label != null ? o.label : "", notes: o.notes || "", created: Date.now(), photoCount: 0, props: o.props || {}, coords: o.coords || undefined }; }
  function parkOptions(sel) { return U.nearSort(PU.PL.map(function (p) { return p.n; }), function (n) { return n; }).map(function (n) { return "<option" + (n === sel ? " selected" : "") + ">" + esc(n) + "</option>"; }).join(""); }
  function typeOptions(geom, sel, extra) {
    return (extra || "") + A.LAYERS.map(function (l) { var ts = A.TYPES.filter(function (t) { return t[2] === l.id && (geom === "any" || t[3] === geom); }); if (!ts.length) return "";
      return '<optgroup label="' + esc(l.name) + '">' + ts.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === sel ? " selected" : "") + ">" + esc(t[1]) + "</option>"; }).join("") + "</optgroup>"; }).join(""); }

  var css = '\
.fl-row{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:11px 2px;border:0;border-bottom:1px solid var(--line);background:none}\
.fl-row i{font-style:normal;font-size:24px;width:34px;text-align:center;flex:none}.fl-row span{flex:1;min-width:0}.fl-row b{display:block;font-size:15px}.fl-row small{display:block;color:var(--mut);font-size:12.5px;line-height:1.3}\
.fl-ph{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}.fl-ph img{width:58px;height:58px;object-fit:cover;border-radius:10px;flex:none;background:#000}\
.fl-ph span{flex:1;min-width:0;font-size:13px}.fl-ph b{display:block;font-size:13.5px}.fl-ph small{color:var(--mut)}.fl-ph select{max-width:46%;padding:7px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.07);color:var(--ink)}\
.fl-ok{color:#7ff0c2}.fl-no{color:#ffb4ab}\
.fl-bar{z-index:9}.fl-bar .fl-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:0 0 6px}\
.fl-bar .fl-chips button{flex:none;border:1px solid var(--line);background:rgba(255,255,255,.05);border-radius:99px;padding:5px 11px;font-weight:700;font-size:12.5px}\
.fl-bar .fl-chips button[aria-pressed=true]{background:#7cc8ff;color:#06223a;border-color:transparent}\
.fl-bar .ly-types button{min-width:78px;padding:9px 6px}.fl-bar .ly-types button:active{transform:scale(.94);background:rgba(52,211,153,.25)}\
.fl-gps{font-size:12px;font-weight:800;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.1)}.fl-gps.good{background:rgba(52,211,153,.25);color:#7ff0c2}.fl-gps.rough{background:rgba(234,179,8,.25);color:#ffe08a}.fl-gps.bad{background:rgba(239,68,68,.3);color:#ffb4ab}\
body.walking .dock,body.walking .card,body.walking .ly-bar:not(.fl-bar),body.osmpick .dock,body.osmpick .card,body.osmpick .ly-bar:not(.fl-bar){display:none!important}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ======================================================================
   * The "Add to the map" screen (a tile on the Work sheet)
   * ====================================================================== */
  function counts() { var c = {}; U.things().forEach(function (a) { var l = A.layerOf(a); c[l] = (c[l] || 0) + 1; }); return c; }
  function screenFill() {
    UI.title("Add to the map"); var b = UI.body(), c = counts();
    var tools = [
      ["walk", "🚶", "Walk a park", "Tap a button as you reach each bench, tree, valve or ramp. It lands where you’re standing."],
      ["photos", "🖼️", "Photos → items", "Pick photos you already took. Each one becomes an item at the spot it was taken."],
      ["trace", "🛰️", "Trace on the satellite photo", "Draw sidewalks, plow routes, lots and pipe runs from the office."],
      ["osm", "🗺️", "Sidewalks from OpenStreetMap", "Pull in the paths already on the public map, then keep the ones you clear."],
      ["import", "📂", "Import a file", "CSV, GeoJSON or KML (Google Earth) from records, a contractor or another app."]];
    b.innerHTML = '<div id="flTools"></div><div class="op-box"><h4>On the map now</h4><div id="flCounts" class="op-mini" style="border:0;flex-wrap:wrap;white-space:normal"></div></div>';
    tools.forEach(function (t) { var r = document.createElement("button"); r.className = "fl-row"; r.innerHTML = "<i>" + t[1] + "</i><span><b></b><small></small></span>"; r.querySelector("b").textContent = t[2]; r.querySelector("small").textContent = t[3];
      r.onclick = function () { open(t[0]); }; $("flTools").appendChild(r); });
    $("flCounts").textContent = A.LAYERS.map(function (l) { return l.e + " " + (c[l.id] || 0) + " " + l.name.toLowerCase(); }).join("   ");
  }
  function open(what, park) {
    if (what === "walk") { if (ro()) return; return walkStart(park); }
    if (what === "photos") { if (ro()) return; return photosPick(); }
    if (what === "import") { if (ro()) return; return importPick(); }
    if (what === "trace") { if (ro()) return; return UI.push(screenTrace(park)); }
    if (what === "osm") { if (ro()) return; return UI.push(screenOsm(park)); }
  }
  O.addTile({ id: "fill", icon: "➕", title: "Add to the map", sub: function () { var n = U.things().length; return n ? plural(n, "item") + " mapped · walk, photos, import" : "Walk a park, photos, import"; }, at: 0,
    open: function (openFn) { openFn(screenFill); } });

  /* ======================================================================
   * 1. WALK MODE
   * ====================================================================== */
  var walk = null;
  var bar = document.createElement("div"); bar.className = "ly-bar glass fl-bar"; bar.id = "flWalk"; bar.hidden = true;
  bar.innerHTML = '<div class="ly-top"><b id="fwT">Walk</b><span class="fl-gps" id="fwGps">GPS…</span><button id="fwCam" aria-pressed="false" title="Take a photo after each">📷</button><button id="fwUndo" disabled>Undo</button><button class="ok" id="fwDone">Done</button></div>' +
    '<div class="fl-chips" id="fwLayers"></div><div class="ly-types" id="fwTypes"></div>';
  document.body.appendChild(bar);
  function walkStart(layer) {
    UI.close(); if (A.close) A.close(); if (A.closeLayer && A.focus && A.focus()) A.closeLayer();
    walk = { layer: (layer && A.LAYERS.some(function (l) { return l.id === layer; })) ? layer : "assets", added: [], cam: !!U.LS.get("pu-walk-cam", false), tick: 0 };
    document.body.classList.add("walking"); bar.hidden = false; A.startGPS(); A.locateMe();
    walkDraw(); walk.tick = setInterval(walkGps, 1000); walkGps();
    PU.toast("Walk mode: tap a button when you reach each thing. It’s placed where you stand.", 4500);
  }
  function walkDraw() {
    var ch = $("fwLayers"); ch.innerHTML = "";
    A.LAYERS.forEach(function (l) { if (!pointTypes(l.id).length) return; var b = document.createElement("button"); b.textContent = l.e + " " + l.name; b.setAttribute("aria-pressed", walk.layer === l.id);
      b.onclick = function () { walk.layer = l.id; walkDraw(); }; ch.appendChild(b); });
    var box = $("fwTypes"); box.innerHTML = "";
    pointTypes(walk.layer).forEach(function (t) { var b = document.createElement("button"); b.innerHTML = '<img alt="" src="' + A.iconURL(t[0]) + '"><span></span>'; b.querySelector("span").textContent = t[1];
      b.onclick = function () { walkDrop(t[0]); }; box.appendChild(b); });
    $("fwCam").setAttribute("aria-pressed", walk.cam); $("fwCam").style.background = walk.cam ? "rgba(124,200,255,.35)" : "";
    $("fwUndo").disabled = !walk.added.length;
  }
  function walkGps() { if (!walk) return; var m = A.me(), g = $("fwGps");
    if (!m) { g.textContent = "Finding GPS…"; g.className = "fl-gps"; $("fwT").textContent = "🚶 Walk"; return; }
    var acc = m.acc == null ? 99 : m.acc; g.textContent = "±" + Math.round(acc) + " m"; g.className = "fl-gps " + (acc <= 8 ? "good" : acc <= 20 ? "rough" : "bad");
    $("fwT").textContent = "🚶 " + A.nearestPark([m.lng, m.lat]) + (walk.added.length ? " · " + walk.added.length + " added" : ""); }
  function walkDrop(type) {
    var m = A.me(); if (!m) { PU.toast("Still finding your location. Give it a few seconds outside."); return; }
    if (m.acc != null && m.acc > 50) { PU.toast("GPS is too rough right now (±" + Math.round(m.acc) + " m). Step away from buildings or wait a few seconds."); return; }
    var park = A.nearestPark([m.lng, m.lat]), a = newItem(type, m.lng, m.lat, { acc: m.acc, park: park, label: nextLabel(type, park), props: type === "head" ? { size: A.SIZES[0] } : {} });
    if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) {}
    A.save(a).then(function () { walk.added.push(a); walkDraw(); walkGps();
      PU.toast(a.label + " added" + (m.acc != null ? " · ±" + Math.round(m.acc) + " m" : "") + (m.acc > 20 ? " (GPS rough; fix it on the map later)" : ""), 1800);
      if (walk.cam) A.pickPhoto(true, function (f) { A.addPhoto(a, f).then(function () { PU.toast("Photo saved to " + a.label + ".", 1400); }, function () {}); });
    }, function () {}); }
  $("fwCam").onclick = function () { walk.cam = !walk.cam; U.LS.set("pu-walk-cam", walk.cam); walkDraw(); PU.toast(walk.cam ? "The camera opens after each one." : "No photos while walking.", 1600); };
  $("fwUndo").onclick = function () { var a = walk.added.pop(); if (!a) return; A.remove(a).then(function () { PU.toast(a.label + " removed.", 1400); walkDraw(); walkGps(); }, function () {}); };
  $("fwDone").onclick = function () { walkEnd(); };
  function walkEnd() { if (!walk) return; clearInterval(walk.tick); var n = walk.added.length, parks = {}; walk.added.forEach(function (a) { parks[a.park] = 1; });
    walk = null; bar.hidden = true; document.body.classList.remove("walking");
    PU.toast(n ? plural(n, "item") + " added at " + Object.keys(parks).join(", ") + ". Tap any of them to add details." : "Walk ended.", 4000); }
  /* a Walk button in each layer's workspace bar */
  (function () { var top = document.querySelector("#lyBar .ly-top"), list = $("lyList"); if (!top || !list || $("lyWalk")) return;
    var w = document.createElement("button"); w.id = "lyWalk"; w.textContent = "🚶 Walk"; w.onclick = function () { if (ro()) return; var l = A.focus ? A.focus() : "assets"; walkStart(l); }; top.insertBefore(w, list); })();

  /* ======================================================================
   * 2. PHOTOS -> ITEMS
   * ====================================================================== */
  /* reads the GPS position and the time a JPEG was taken from its EXIF block */
  function readExif(buf) {
    try {
      var v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null; var off = 2, len = v.byteLength;
      while (off + 4 < len) { var mk = v.getUint16(off); if ((mk & 0xFF00) !== 0xFF00) return null; var sz = v.getUint16(off + 2);
        if (mk === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return tiff(v, off + 10); off += 2 + sz; }
    } catch (e) {} return null;
    function tiff(v, t) {
      var le = v.getUint16(t) === 0x4949, u16 = function (o) { return v.getUint16(t + o, le); }, u32 = function (o) { return v.getUint32(t + o, le); };
      function ifd(o) { var n = u16(o), out = {}; for (var i = 0; i < n; i++) { var e = o + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; } return out; }
      function str(e) { var o = e.count > 4 ? u32(e.at) : e.at, s = ""; for (var i = 0; i < e.count - 1; i++) s += String.fromCharCode(v.getUint8(t + o + i)); return s; }
      function rats(e) { var o = u32(e.at), r = []; for (var i = 0; i < e.count; i++) { var d = u32(o + i * 8 + 4); r.push(d ? u32(o + i * 8) / d : 0); } return r; }
      var res = {}, i0 = ifd(u32(4));
      if (i0[0x8769]) { var ex = ifd(u32(i0[0x8769].at)); var dt = ex[0x9003] || ex[0x9004]; if (dt) { var m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(str(dt)); if (m) res.t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); } }
      if (i0[0x8825]) { var g = ifd(u32(i0[0x8825].at));
        if (g[2] && g[4]) { var la = rats(g[2]), lo = rats(g[4]), lat = la[0] + la[1] / 60 + la[2] / 3600, lng = lo[0] + lo[1] / 60 + lo[2] / 3600;
          if (g[1] && /S/i.test(str(g[1]))) lat = -lat; if (g[3] && /W/i.test(str(g[3]))) lng = -lng;
          if (lat || lng) { res.lat = lat; res.lng = lng; } } }
      return res; }
  }
  var batch = null;
  function photosPick() {
    /* the phone app has a picker that keeps the photo's location (Android hides it from ordinary file pickers) */
    if (window.BombaNative && BombaNative.pickGeoPhotos) {
      batch = { list: [], type: "", noGps: "skip" }; window.bombaGeoPhoto = function (o) { geoPhoto(o); }; window.bombaGeoPhotosDone = function (r) { geoDone(r); };
      try { BombaNative.pickGeoPhotos(); PU.toast("Pick the photos, then tap Select.", 3000); return; } catch (e) {}
    }
    var i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.multiple = true; i.style.display = "none"; document.body.appendChild(i);
    i.onchange = function () { var files = [].slice.call(i.files || []); i.remove(); if (!files.length) return; batch = { list: [], type: "", noGps: "skip" };
      PU.toast("Reading " + plural(files.length, "photo") + "…");
      Promise.all(files.map(function (f) { return f.slice(0, 262144).arrayBuffer().then(function (b) { var x = readExif(b) || {}; return { file: f, lat: x.lat, lng: x.lng, t: x.t || f.lastModified, url: URL.createObjectURL(f) }; }); }))
        .then(function (rows) { batch.list = rows; photosReview(); }); };
    i.click(); }
  function b64Blob(b64) { var bin = atob(b64), u8 = new Uint8Array(bin.length); for (var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k); return new Blob([u8], { type: "image/jpeg" }); }
  function geoPhoto(o) { if (!batch) return; var bl = b64Blob(o.b64); batch.list.push({ file: bl, lat: o.lat == null ? undefined : o.lat, lng: o.lng == null ? undefined : o.lng, t: o.t || Date.now(), url: URL.createObjectURL(bl) }); }
  function geoDone(r) { if (!batch) return; if (r && r.error) { PU.toast(r.error, 5000); return; } if (!batch.list.length) return; photosReview(); }
  function photosReview() {
    batch.list.sort(function (x, y) { return x.t - y.t; });
    UI.start(function () {
      var L = batch.list, withGps = L.filter(function (p) { return p.lat != null; }).length, b = UI.body(); UI.title("Photos → items (" + L.length + ")");
      b.innerHTML = '<p class="mut" style="margin:0 0 6px">' + (withGps ? plural(withGps, "photo") + " " + (withGps === 1 ? "has" : "have") + " a location. " : "") + (L.length - withGps ? plural(L.length - withGps, "photo") + " " + (L.length - withGps === 1 ? "has" : "have") + " no location saved in it." : "") + "</p>" +
        '<div class="as-f"><label for="flPT">What are they?</label><select id="flPT">' + typeOptions("point", batch.type, '<option value="">Choose…</option>') + "</select></div>" +
        (L.length - withGps ? '<div class="as-f"><label for="flNG">Photos with no location</label><select id="flNG"><option value="skip">Leave them out</option><option value="here">Put them where I’m standing now</option></select></div>' : "") +
        '<div id="flPL"></div><div class="as-act"><button class="p" id="flPGo">Create items</button></div>' +
        '<p class="src">Each photo is attached to its new item. You can change any item afterwards, or move it on the map.</p>' +
        (window.BombaNative && !BombaNative.pickGeoPhotos ? '<p class="src">Update the Park Universe app to keep photo locations when picking from the gallery.</p>' : "");
      if ($("flNG")) { $("flNG").value = batch.noGps; $("flNG").onchange = function () { batch.noGps = this.value; }; }
      $("flPT").onchange = function () { batch.type = this.value; };
      L.forEach(function (p, i) { var r = document.createElement("div"); r.className = "fl-ph";
        r.innerHTML = '<img alt=""><span><b></b><small></small></span><select aria-label="Type for this photo">' + typeOptions("point", p.type || "", '<option value="">Same as above</option><option value="-">Leave out</option>') + "</select>";
        r.querySelector("img").src = p.url; r.querySelector("b").textContent = p.lat != null ? A.nearestPark([p.lng, p.lat]) : "No location";
        r.querySelector("b").className = p.lat != null ? "fl-ok" : "fl-no"; r.querySelector("small").textContent = new Date(p.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        r.querySelector("select").onchange = function () { p.type = this.value; }; $("flPL").appendChild(r); });
      $("flPGo").onclick = photosCreate;
    }); }
  function photosCreate() {
    var me = A.me(), todo = batch.list.filter(function (p) { var ty = p.type === "-" ? "" : p.type || batch.type; if (!ty) return false; return p.lat != null || (batch.noGps === "here" && me); });
    var missingType = batch.list.some(function (p) { return p.type !== "-" && !p.type && !batch.type; });
    if (missingType) { PU.toast("Choose what they are first."); return; }
    if (!todo.length) { PU.toast("Nothing to create. Photos with no location are left out unless you choose “where I’m standing”."); return; }
    $("flPGo").disabled = true; var made = [], q = Promise.resolve();
    todo.forEach(function (p, i) { q = q.then(function () { $("flPGo").textContent = "Creating " + (i + 1) + " of " + todo.length + "…";
      var ty = p.type && p.type !== "-" ? p.type : batch.type, here = p.lat == null, lng = here ? me.lng : p.lng, lat = here ? me.lat : p.lat, park = A.nearestPark([lng, lat]);
      var a = newItem(ty, lng, lat, { park: park, acc: here ? me.acc : null, label: nextLabel(ty, park), props: ty === "head" ? { size: A.SIZES[0] } : {}, notes: here ? "" : "Placed from a photo taken " + new Date(p.t).toLocaleDateString() + "." });
      return A.save(a).then(function () { return A.addPhoto(a, p.file); }).then(function (ph) {
        if (ph && p.t && A._sync && A._sync.putPhoto) { ph.date = p.t; if (!here) { ph.lat = p.lat; ph.lng = p.lng; ph.acc = null; } return A._sync.putPhoto(ph); } })
        .then(function () { made.push(a); }, function () {}); }); });
    q.then(function () { var parks = {}; made.forEach(function (a) { parks[a.park] = 1; });
      batch.list.forEach(function (p) { try { URL.revokeObjectURL(p.url); } catch (e) {} }); batch = null; UI.close();
      PU.toast(plural(made.length, "item") + " created at " + Object.keys(parks).join(", ") + ".", 4500);
      var map = PU.map(); if (map && made.length) { var b = new mapboxgl.LngLatBounds(); made.forEach(function (a) { b.extend([a.lng, a.lat]); }); map.fitBounds(b, { padding: 80, maxZoom: 18.5, duration: 1200 }); } }); }

  /* ======================================================================
   * 3. IMPORT  (CSV, GeoJSON, KML)
   * ====================================================================== */
  function parseCSV(text) {
    var rows = [], row = [], f = "", q = false; text = text.replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) { var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c; }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); }); }
  /* field labels -> keys, so a CSV exported from this app (or one with the same column names) comes back with its details */
  function labelMap() { var m = {}; Object.keys(A.F).forEach(function (t) { A.F[t].forEach(function (f) { m[f[0].toLowerCase()] = f[0]; m[f[1].toLowerCase()] = f[0]; }); });
    Object.assign(m, { "replacement date": "replace", "make / model": "make", "quantity": "qty", "stored at": "stored", "priority": "priority", "method": "method", "ice melt": "melt", "zone": "zone", "species": "species" }); return m; }
  var SYN = [[/backflow|rpz|\bbfp\b/, "backflow"], [/sprinkler|rotor|spray head|\bhead\b|nozzle/, "head"], [/valve/, "valve"], [/quick ?coupler|\bqc\b/, "coupler"], [/timer|controller|clock/, "timer"],
    [/stump/, "stump"], [/planting site|plant site|vacant/, "site"], [/tree/, "tree"], [/bench/, "bench"], [/trash|garbage|litter|waste|receptacle/, "trash"], [/dog|pet waste|mutt/, "dog"],
    [/grill|bbq|barbecue/, "grill"], [/restroom|bathroom|toilet/, "bathroom"], [/fire ?pit/, "firepit"], [/fountain|drinking|bottle fill/, "fountain"], [/light|lamp|pole|luminaire/, "light"],
    [/mail ?box|cbu/, "mailbox"], [/newspaper/, "newspaper"], [/picnic|table/, "table"], [/playground|play structure|tot lot/, "playground"], [/sign/, "sign"], [/pot|planter/, "flowerpot"],
    [/shelter|pavilion|structure|gazebo/, "structure"], [/ramp|curb cut|ada/, "ramp"], [/stair|steps/, "steps"],
    [/lateral/, "lateral"], [/main ?line|mainline|\bmain\b/, "mainline"], [/plow|route/, "route"], [/sidewalk|walk|path|trail/, "walk"],
    [/batting cage|cage/, "cage"], [/ball ?field|diamond|infield|softball|baseball/, "ballfield"], [/parking|lot/, "parking"], [/snow storage|storage/, "storage"], [/no ?plow|do not plow/, "noplow"]];
  function matchType(hint, geom) {
    var h = String(hint || "").toLowerCase().trim(); if (!h) return "";
    var ok = function (id) { var t = A.T[id]; return t && t.geom === geom && t.layer !== "work" && t.layer !== "places" ? id : ""; };
    if (ok(h)) return h;
    var byName = A.TYPES.filter(function (t) { return t[1].toLowerCase() === h && t[3] === geom; })[0]; if (byName) return byName[0];
    for (var i = 0; i < SYN.length; i++) if (SYN[i][0].test(h) && ok(SYN[i][1])) return SYN[i][1];
    return ""; }
  function near(ll) { return PU.PL.some(function (p) { return A.meters(ll, p.ll) < 60000; }); }
  function fixLL(c) { var x = +c[0], y = +c[1]; if (!isFinite(x) || !isFinite(y)) return null; if (Math.abs(y) > 90 && Math.abs(x) <= 90) { var t = x; x = y; y = t; } return [x, y]; }
  function parseFile(name, text) {
    var out = [], lm = labelMap(), lower = name.toLowerCase();
    function add(geom, coords, props, hintExtra) { props = props || {}; var p = {}; Object.keys(props).forEach(function (k) { p[String(k).toLowerCase().trim()] = props[k]; });
      var pick = function (re) { var k = Object.keys(p).filter(function (x) { return re.test(x); })[0]; return k ? p[k] : ""; };
      var f = { geom: geom, coords: coords, name: String(pick(/^(name|name\/id|label|id tag|title|asset name|asset id)$/) || ""), type: String(pick(/^(type|asset type|kind|category|feature|class)$/) || ""),
        cond: String(pick(/^(condition|cond|health|state)$/) || ""), notes: String(pick(/^(notes|note|comments?|description|desc|remarks)$/) || ""), park: String(pick(/^(park|property|site|location)$/) || ""),
        id: String(pick(/^id$/) || ""), props: {} };
      Object.keys(p).forEach(function (k) { var key = lm[k]; if (key && p[k] !== "" && p[k] != null) f.props[key] = String(p[k]); });
      f.hint = [f.type, hintExtra || "", f.name].join(" "); out.push(f); }
    if (/\.(geo)?json$/.test(lower)) {
      var j = JSON.parse(text), feats = j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : [];
      feats.forEach(function (ft) { var g = ft.geometry, pr = ft.properties || {}; if (!g) return;
        var each = function (type, c) { if (type === "Point") { var ll = fixLL(c); if (ll) add("point", [ll], pr); }
          else if (type === "LineString") { var l = c.map(fixLL).filter(Boolean); if (l.length > 1) add("line", l, pr); }
          else if (type === "Polygon") { var r = (c[0] || []).map(fixLL).filter(Boolean); if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); if (r.length > 2) add("polygon", r, pr); } };
        if (/^Multi/.test(g.type)) g.coordinates.forEach(function (c) { each(g.type.slice(5), c); }); else if (g.type === "GeometryCollection") (g.geometries || []).forEach(function (x) { each(x.type, x.coordinates); }); else each(g.type, g.coordinates); });
    } else if (/\.kml$/.test(lower)) {
      var x = new DOMParser().parseFromString(text, "text/xml"), cs = function (el) { return String(el.textContent || "").trim().split(/\s+/).map(function (t) { return fixLL(t.split(",")); }).filter(Boolean); };
      [].forEach.call(x.getElementsByTagName("Placemark"), function (pm) { var pr = {}, nm = pm.getElementsByTagName("name")[0], ds = pm.getElementsByTagName("description")[0];
        if (nm) pr.name = nm.textContent.trim(); if (ds) pr.notes = ds.textContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        [].forEach.call(pm.getElementsByTagName("Data"), function (d) { var v = d.getElementsByTagName("value")[0]; if (v) pr[d.getAttribute("name")] = v.textContent.trim(); });
        [].forEach.call(pm.getElementsByTagName("SimpleData"), function (d) { pr[d.getAttribute("name")] = d.textContent.trim(); });
        var folder = pm.parentNode && pm.parentNode.getElementsByTagName ? (function () { var n = pm.parentNode; while (n && n.nodeName !== "Folder" && n.nodeName !== "Document") n = n.parentNode; var f = n && [].filter.call(n.childNodes, function (c) { return c.nodeName === "name"; })[0]; return f ? f.textContent.trim() : ""; })() : "";
        [].forEach.call(pm.getElementsByTagName("Point"), function (g) { var c = cs(g.getElementsByTagName("coordinates")[0] || g); if (c.length) add("point", [c[0]], pr, folder); });
        [].forEach.call(pm.getElementsByTagName("LineString"), function (g) { var c = cs(g.getElementsByTagName("coordinates")[0] || g); if (c.length > 1) add("line", c, pr, folder); });
        [].forEach.call(pm.getElementsByTagName("Polygon"), function (g) { var ob = g.getElementsByTagName("outerBoundaryIs")[0] || g, c = cs(ob.getElementsByTagName("coordinates")[0] || ob); if (c.length > 3) c.pop(); if (c.length > 2) add("polygon", c, pr, folder); }); });
    } else {
      var rows = parseCSV(text); if (rows.length < 2) return out; var hd = rows[0].map(function (h) { return String(h).trim(); }), lc = hd.map(function (h) { return h.toLowerCase(); });
      var li = lc.findIndex(function (h) { return /^(lat|latitude|y|point_y)$/.test(h); }), gi = lc.findIndex(function (h) { return /^(lng|lon|long|longitude|x|point_x)$/.test(h); });
      if (li < 0 || gi < 0) throw new Error("This CSV needs Latitude and Longitude columns.");
      rows.slice(1).forEach(function (r) { var ll = fixLL([r[gi], r[li]]); if (!ll) return; var pr = {}; hd.forEach(function (h, k) { pr[h] = r[k]; }); add("point", [ll], pr); });
    }
    return out; }
  var imp = null;
  function importPick() {
    var i = document.createElement("input"); i.type = "file"; i.accept = ".csv,.geojson,.json,.kml,text/csv,application/json,application/geo+json,application/vnd.google-earth.kml+xml"; i.style.display = "none"; document.body.appendChild(i);
    i.onchange = function () { var f = i.files && i.files[0]; i.remove(); if (!f) return;
      if (/\.kmz$/i.test(f.name)) { PU.toast("KMZ files are zipped. In Google Earth use Save Place As → KML, then import that.", 6000); return; }
      f.text().then(function (t) { var feats; try { feats = parseFile(f.name, t); } catch (e) { PU.toast("Couldn’t read " + f.name + ": " + (e.message || e), 6000); return; }
        if (!feats.length) { PU.toast("No points, lines or outlines found in " + f.name + ".", 5000); return; }
        var far = feats.filter(function (x) { return !near(x.coords[0]); }).length; feats = feats.filter(function (x) { return near(x.coords[0]); });
        feats.forEach(function (x) { x.match = matchType(x.hint, x.geom); });
        imp = { name: f.name, feats: feats, far: far, fall: { point: "", line: "", polygon: "" }, dedupe: true }; UI.start(screenImport); }); };
    i.click(); }
  function screenImport() {
    UI.title("Import · " + imp.name); var b = UI.body(), by = {}, un = { point: 0, line: 0, polygon: 0 };
    imp.feats.forEach(function (f) { if (f.match) by[f.match] = (by[f.match] || 0) + 1; else un[f.geom]++; });
    var h = '<p class="mut" style="margin:0 0 6px">Found ' + plural(imp.feats.length, "thing") + " in this file" + (imp.far ? ", plus " + imp.far + " far from Central Park that will be left out (the file may use a different coordinate system; export it as latitude / longitude, WGS84)" : "") + ".</p>";
    h += '<div class="op-box"><h4>Recognised</h4>' + (Object.keys(by).length ? Object.keys(by).sort(function (x, y) { return by[y] - by[x]; }).map(function (k) { return '<div class="op-mini"><span><img alt="" src="' + A.iconURL(k) + '" style="width:18px;height:18px;vertical-align:-4px"> ' + esc(A.T[k].name) + "</span><small>" + by[k] + "</small></div>"; }).join("") : '<div class="op-mini"><span class="mut">Nothing matched a type by name.</span></div>') + "</div>";
    ["point", "line", "polygon"].forEach(function (g) { if (!un[g]) return; h += '<div class="as-f"><label for="flU_' + g + '">' + un[g] + " other " + (g === "point" ? "points" : g === "line" ? "lines" : "outlines") + ' become</label><select id="flU_' + g + '">' + typeOptions(g, imp.fall[g], '<option value="">Leave them out</option>') + "</select></div>"; });
    h += '<label style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:14px"><input type="checkbox" id="flDd"' + (imp.dedupe ? " checked" : "") + "> Skip ones already on the map (same type within 2 m)</label>" +
      '<div class="as-act"><button class="p" id="flIGo">Import</button></div><p class="src">Names, condition, notes and columns that match an item’s details (Species, Serial #, Zone, Next test due…) are carried over. Each item lands in the nearest park.</p>';
    b.innerHTML = h;
    ["point", "line", "polygon"].forEach(function (g) { var s = $("flU_" + g); if (s) s.onchange = function () { imp.fall[g] = this.value; }; });
    $("flDd").onchange = function () { imp.dedupe = this.checked; };
    $("flIGo").onclick = importRun; }
  function importRun() {
    var condOk = function (type, c) { var l = A.condList({ type: type }); var m = l.filter(function (x) { return x.toLowerCase() === String(c).toLowerCase(); })[0]; return m || l[0]; };
    var have = A.all(), mine = {}; have.forEach(function (a) { mine[a.id] = 1; });
    var todo = imp.feats.map(function (f) { return { f: f, type: f.match || imp.fall[f.geom] }; }).filter(function (x) { return x.type; });
    var skipped = 0, list = [];
    todo.forEach(function (x) { var f = x.f, c = f.coords, rep = f.geom === "point" ? c[0] : f.geom === "line" ? c[Math.floor(c.length / 2)] : [c.reduce(function (s, p) { return s + p[0]; }, 0) / c.length, c.reduce(function (s, p) { return s + p[1]; }, 0) / c.length];
      if (f.id && mine[f.id]) { skipped++; return; }
      if (imp.dedupe && have.some(function (a) { return a.type === x.type && a.lng != null && A.meters([a.lng, a.lat], rep) < 2; })) { skipped++; return; }
      var park = f.park && parkByName(f.park) ? f.park : A.nearestPark(rep);
      list.push(newItem(x.type, rep[0], rep[1], { park: park, label: f.name.slice(0, 60), cond: condOk(x.type, f.cond), notes: f.notes.slice(0, 2000), props: f.props, coords: f.geom === "point" ? undefined : c.map(function (p) { return [+p[0].toFixed(7), +p[1].toFixed(7)]; }) })); });
    if (!list.length) { PU.toast(skipped ? "Everything in this file is already on the map." : "Nothing to import. Choose what the other things become."); return; }
    $("flIGo").disabled = true; var q = Promise.resolve(), n = 0;
    list.forEach(function (a) { q = q.then(function () { return A.save(a); }).then(function () { n++; if (n % 20 === 0) $("flIGo").textContent = "Imported " + n + " of " + list.length + "…"; }, function () {}); });
    q.then(function () { UI.close(); PU.toast("Imported " + plural(n, "item") + (skipped ? ", skipped " + skipped + " already on the map" : "") + ".", 5000);
      var map = PU.map(); if (map && list.length) { var bd = new mapboxgl.LngLatBounds(); list.forEach(function (a) { bd.extend([a.lng, a.lat]); }); map.fitBounds(bd, { padding: 70, maxZoom: 18, duration: 1200 }); } }); }

  /* ======================================================================
   * 4. TRACE ON THE SATELLITE PHOTO
   * ====================================================================== */
  var trCtx = { park: "", type: "walk" };
  function screenTrace(park) { return function () {
    UI.title("Trace on the satellite photo"); var b = UI.body(); if (park) trCtx.park = park; if (!trCtx.park) trCtx.park = (U.nearSort(PU.PL.map(function (p) { return p.n; }), function (n) { return n; })[0]) || "";
    var opts = A.TYPES.filter(function (t) { return (t[3] === "line" || t[3] === "polygon") && t[2] !== "work"; });
    b.innerHTML = '<p class="mut" style="margin:0 0 6px">The map switches to the satellite photo. Tap along a sidewalk or route to trace it, then ✓. The next one starts right away; ✕ stops.</p>' +
      '<div class="as-f"><label for="trP">Park</label><select id="trP">' + parkOptions(trCtx.park) + '</select></div>' +
      '<div class="as-f"><label for="trT">What to trace</label><select id="trT">' + opts.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === trCtx.type ? " selected" : "") + ">" + esc(t[1]) + " (" + esc(A.LAYERS.filter(function (l) { return l.id === t[2]; })[0].name) + ")</option>"; }).join("") + "</select></div>" +
      '<div class="as-f" id="trPriBox"><label for="trPri">Snow priority for these</label><select id="trPri"><option value="1 – first">1 – first</option><option value="2" selected>2</option><option value="3 – last">3 – last</option></select></div>' +
      '<div class="as-act"><button class="p" id="trGo">🛰️ Start tracing</button></div>';
    var sync = function () { trCtx.park = $("trP").value; trCtx.type = $("trT").value; $("trPriBox").hidden = A.T[trCtx.type].layer !== "snow"; };
    $("trP").onchange = sync; $("trT").onchange = sync; sync();
    $("trGo").onclick = function () { sync(); var t = A.T[trCtx.type], props = t.layer === "snow" && A.F[trCtx.type] ? { priority: $("trPri").value, method: trCtx.type === "route" ? "Plow" : "Shovel" } : null;
      UI.close(); A.openLayer(t.layer, trCtx.park);
      setTimeout(function () { A.startDraw(trCtx.type, { park: trCtx.park, sat: true, chain: t.geom === "line", props: props }); }, 1300); };
  }; }

  /* ======================================================================
   * 5. SIDEWALKS FROM OPENSTREETMAP
   * ====================================================================== */
  var osm = null;
  function screenOsm(park) { return function () {
    UI.title("Sidewalks from OpenStreetMap"); var b = UI.body(); var p0 = park || (osm && osm.park) || (U.nearSort(PU.PL.map(function (p) { return p.n; }), function (n) { return n; })[0]) || "";
    b.innerHTML = '<p class="mut" style="margin:0 0 6px">Looks up the footpaths, sidewalks and steps already drawn on OpenStreetMap around a park. You pick which ones your crew clears; they become <b>Sidewalk to shovel</b> items in that park’s Snow tab.</p>' +
      '<div class="as-f"><label for="osP">Park</label><select id="osP">' + parkOptions(p0) + '</select></div>' +
      '<div class="as-f"><label for="osR">How far around it</label><select id="osR"><option value="75">75 m (small park)</option><option value="150" selected>150 m</option><option value="300">300 m</option><option value="600">600 m (Central Park)</option></select></div>' +
      '<div class="sy-err" id="osErr" hidden></div><div class="as-act"><button class="p" id="osGo">Look for paths</button></div>' +
      '<p class="src">Map data © OpenStreetMap contributors (ODbL). Paths come in as drawn on the public map; check them on the ground.</p>';
    $("osP").onchange = function () { $("osR").value = this.value === "Central Park" ? "600" : "150"; }; $("osP").onchange();
    if (p0) { $("osP").value = p0; $("osR").value = p0 === "Central Park" ? "600" : "150"; }
    $("osGo").onclick = function () { var pk = parkByName($("osP").value), r = +$("osR").value, btn = this; if (!pk) return; btn.disabled = true; btn.textContent = "Looking…";
      var q = '[out:json][timeout:25];way["highway"~"^(footway|path|pedestrian|steps|cycleway)$"](around:' + r + "," + pk.ll[1] + "," + pk.ll[0] + ");out geom;";
      fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) })
        .then(function (res) { if (!res.ok) throw new Error("The OpenStreetMap server is busy (" + res.status + "). Try again in a minute."); return res.json(); })
        .then(function (j) { osmPreview(pk.n, j.elements || []); }, function (e) { btn.disabled = false; btn.textContent = "Look for paths"; var el = $("osErr"); el.hidden = false; el.textContent = /fetch|network/i.test(String(e.message)) ? "Couldn’t reach OpenStreetMap. Check your connection." : e.message; }); };
  }; }
  var obar = document.createElement("div"); obar.className = "ly-bar glass fl-bar"; obar.id = "flOsm"; obar.hidden = true;
  obar.innerHTML = '<div class="ly-top"><b id="foT"></b><button id="foAll">All</button><button id="foX">Cancel</button><button class="ok" id="foOk">Add</button></div><div class="mut" style="font-size:12.5px;padding:0 4px 4px" id="foS"></div>';
  document.body.appendChild(obar);
  function osmGJ() { return { type: "FeatureCollection", features: osm.ways.map(function (w, i) { return { type: "Feature", id: i, geometry: { type: "LineString", coordinates: w.coords }, properties: { i: i, on: w.on ? 1 : 0 } }; }) }; }
  function osmPreview(park, els) {
    var known = {}; A.all().forEach(function (a) { if (a.props && a.props.osm) known[a.props.osm] = 1; });
    var ways = els.filter(function (e) { return e.type === "way" && e.geometry && e.geometry.length > 1 && !known["way/" + e.id]; }).map(function (e) {
      var c = e.geometry.map(function (g) { return [+g.lon.toFixed(7), +g.lat.toFixed(7)]; }), len = 0; for (var k = 1; k < c.length; k++) len += A.meters(c[k - 1], c[k]);
      var tg = e.tags || {}; return { id: "way/" + e.id, coords: c, len: len, on: true, name: tg.name || (tg.highway === "steps" ? "Steps" : tg.footway === "sidewalk" ? "Sidewalk" : tg.highway === "cycleway" ? "Bike path" : "Path"), steps: tg.highway === "steps" }; })
      .filter(function (w) { return w.len >= 10; });
    if (!ways.length) { UI.redraw(); PU.toast(Object.keys(known).length ? "Every path found is already on the map." : "No paths found on OpenStreetMap around " + park + ". Trace them on the satellite photo instead.", 5000); return; }
    osm = { park: park, ways: ways }; UI.close(); A.openLayer("snow", park); document.body.classList.add("osmpick");
    var map = PU.map(); var addL = function () { if (!map || !osm) return; if (map.getSource("osm-prev")) map.getSource("osm-prev").setData(osmGJ()); else map.addSource("osm-prev", { type: "geojson", data: osmGJ() });
      if (!map.getLayer("osm-prev")) { map.addLayer({ id: "osm-prev", type: "line", source: "osm-prev", paint: { "line-width": ["case", ["==", ["get", "on"], 1], 6, 3], "line-color": ["case", ["==", ["get", "on"], 1], "#22d3ee", "#94a3b8"], "line-opacity": ["case", ["==", ["get", "on"], 1], .95, .55] } });
        map.addLayer({ id: "osm-hit", type: "line", source: "osm-prev", paint: { "line-width": 22, "line-opacity": 0 } }); } };
    addL(); osm.onStyle = function () { setTimeout(addL, 50); }; if (map) map.on("style.load", osm.onStyle);
    osm.onClick = function (e) { var f = e.features && e.features[0]; if (!f || !osm) return; var w = osm.ways[f.properties.i]; w.on = !w.on; addL(); osmInfo(); };
    if (map) { map.on("click", "osm-hit", osm.onClick); var bd = new mapboxgl.LngLatBounds(); ways.forEach(function (w) { w.coords.forEach(function (c) { bd.extend(c); }); }); map.fitBounds(bd, { padding: { top: 60, bottom: 170, left: 30, right: 30 }, maxZoom: 18.2, duration: 1200 }); }
    obar.hidden = false; osmInfo(); }
  function osmInfo() { var on = osm.ways.filter(function (w) { return w.on; }), len = on.reduce(function (s, w) { return s + w.len; }, 0) * 3.28084;
    $("foT").textContent = "🗺️ " + osm.park + ": " + on.length + " of " + osm.ways.length + " paths";
    $("foS").textContent = (len < 5280 ? Math.round(len) + " ft" : (len / 5280).toFixed(2) + " mi") + " selected. Tap a line to leave it out (grey) or put it back. © OpenStreetMap contributors";
    $("foOk").disabled = !on.length; $("foAll").textContent = on.length === osm.ways.length ? "None" : "All"; }
  function osmEnd() { var map = PU.map(); if (map && osm) { map.off("click", "osm-hit", osm.onClick); map.off("style.load", osm.onStyle); ["osm-hit", "osm-prev"].forEach(function (id) { if (map.getLayer(id)) map.removeLayer(id); }); if (map.getSource("osm-prev")) map.removeSource("osm-prev"); }
    osm = null; obar.hidden = true; document.body.classList.remove("osmpick"); }
  $("foAll").onclick = function () { var all = osm.ways.every(function (w) { return w.on; }); osm.ways.forEach(function (w) { w.on = !all; }); var map = PU.map(); if (map && map.getSource("osm-prev")) map.getSource("osm-prev").setData(osmGJ()); osmInfo(); };
  $("foX").onclick = osmEnd;
  $("foOk").onclick = function () { if (U.ro()) return; var park = osm.park, on = osm.ways.filter(function (w) { return w.on; }), q = Promise.resolve(), n = 0; this.disabled = true;
    on.forEach(function (w) { var mid = w.coords[Math.floor(w.coords.length / 2)];
      var a = newItem("walk", mid[0], mid[1], { park: park, label: w.name, coords: w.coords, props: { method: "Shovel", priority: w.steps ? "1 – first" : "2", osm: w.id, src: "OpenStreetMap" },
        notes: "From OpenStreetMap (© OpenStreetMap contributors). Check it on the ground and delete it if your crew doesn’t clear it." });
      q = q.then(function () { return A.save(a); }).then(function () { n++; }, function () {}); });
    q.then(function () { osmEnd(); PU.toast(plural(n, "sidewalk") + " added to " + park + "’s Snow tab. They’re in the next storm’s check-offs.", 5000); }); };

  window.PUField = { open: function (w, park) { if (w === "hub") UI.start(screenFill); else open(w, park); }, walkStart: walkStart, walkEnd: walkEnd, readExif: readExif, parseFile: parseFile, parseCSV: parseCSV, matchType: matchType,
    _osmPreview: osmPreview, _batch: function () { return batch; }, _geoPhoto: geoPhoto, _geoDone: geoDone };
})();
