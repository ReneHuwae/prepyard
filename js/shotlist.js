/* Shotlist page, Rev. 08: one table, every real column in its real order, each scene
   introduced by a black band. The table is drawn from the project; typing writes straight
   back into it (one undo step per field burst) without redrawing, so focus never jumps. */
(function(){
  "use strict";
  var FP = window.FP;
  FP.pages = FP.pages || {};

  function esc(s){
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(m, ms){ if (FP.toast) FP.toast(m, ms); }
  function lsGet(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e){} }
  function reducedMotion(){ return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  var SELECT_COLS = { sub: 1, special: 1, size: 1, shotType: 1, grip: 1, movement: 1 };
  var TEXTAREA_COLS = { action: 1, copy: 1, notes: 1 };
  var PLACEHOLDER = { action: "Describe the shot…" };
  var THUMB = { key: "thumb", label: "Thumbnail", hideable: true };
  var COL_MINW = { startTc: 112, duration: 132, scene: 56, shot: 56, sub: 64, location: 150, special: 110, size: 86,
    shotType: 120, lens: 96, grip: 112, movement: 124, action: 280, copy: 200, notes: 200, thumb: 88 };

  // which columns are hidden is a habit of this browser, not part of the project
  var HIDDEN_KEY = "filmprep:hiddenShotColumns";
  var hidden = {};
  (function(){
    try { (JSON.parse(lsGet(HIDDEN_KEY) || "[]") || []).forEach(function(k){ hidden[k] = true; }); } catch (e){}
  })();
  function saveHidden(){ lsSet(HIDDEN_KEY, JSON.stringify(Object.keys(hidden).filter(function(k){ return hidden[k]; }))); }
  FP.shotlistColumns = function(){ return columns(); };
  function columns(){ return FP.COLUMNS.concat([THUMB]).filter(function(c){ return !(c.hideable && hidden[c.key]); }); }

  var H = null;              // the mounted page's host element, or null
  var selfTyping = false;    // a keystroke's own change; the table already shows it
  var lastSceneId = null;    // the scene most recently worked in, for "+ Add shot"
  var thumbTarget = null;

  function sceneById(p, id){ for (var i = 0; i < p.scenes.length; i++) if (p.scenes[i].id === id) return p.scenes[i]; return null; }
  function findShot(p, id){
    for (var i = 0; i < p.scenes.length; i++){
      for (var j = 0; j < p.scenes[i].shots.length; j++){
        if (p.scenes[i].shots[j].id === id) return { scene: p.scenes[i], shot: p.scenes[i].shots[j], index: j, sceneIndex: i };
      }
    }
    return null;
  }
  function lensNames(p){
    var seen = {}, out = [];
    p.lensSets.forEach(function(s){ s.lenses.forEach(function(l){ var n = (l.name || "").trim(); if (n && !seen[n]){ seen[n] = 1; out.push(n); } }); });
    return out;
  }
  function scriptHasRef(p, ref){ return !!ref && p.script.html.indexOf('data-script-ref="' + ref + '"') !== -1; }
  function scriptHasScene(p, id){ return p.script.html.indexOf('data-scene-id="' + id + '"') !== -1; }

  // ---------- drawing the table ----------
  function optionsFor(p, col, current){
    var list = FP.visibleOptions(p, col).slice();
    if (list[0] !== "") list.unshift("");
    if (current && list.indexOf(current) === -1) list.push(current);
    return list.map(function(o){
      return '<option value="' + esc(o) + '"' + (o === current ? " selected" : "") + (o ? "" : ' aria-label="None"') + '>' + esc(o) + '</option>';
    }).join("");
  }
  var TC = {};
  function cellHTML(p, scene, shot, col, label){
    var k = col.key, v = shot[k];
    var aria = ' aria-label="' + esc(col.label + ", shot " + label) + '"';
    if (k === "startTc") return '<td class="tc mono" data-tc title="Starts where the shot before ends, at 25 fps">' + FP.tcFormat(TC[shot.id] ? TC[shot.id].start : 0) + '</td>';
    if (k === "duration") v = (function(){ var f = FP.tcParse(v); return f == null ? v : FP.durFormat(f); })();
    if (k === "duration") return '<td class="dur-cell"><div class="dur">' +
      '<button type="button" class="dur-step" data-act="dur-" aria-label="One second shorter, shot ' + esc(label) + '">−</button>' +
      '<input class="cell-in mono" data-f="duration" value="' + esc(v) + '"' + aria + ' placeholder="0 sec" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="dur-step" data-act="dur+" aria-label="One second longer, shot ' + esc(label) + '">+</button></div></td>';
    if (k === "scene") return '<td class="num muted">' + esc(scene.num) + '</td>';
    if (k === "shot") return '<td class="num">' + esc(label) + '</td>';
    if (k === "thumb"){
      var src = shot.storyboard[0] && shot.storyboard[0].src;
      return '<td class="thumb-col"><button type="button" class="thumb' + (src ? " has" : "") + '" data-act="thumb"' +
        ' aria-label="' + (src ? "Storyboard frame, shot " + esc(label) : "Add a storyboard frame to shot " + esc(label)) + '">' +
        (src ? '<img src="' + esc(src) + '" alt="">' + (shot.storyboard.length > 1 ? '<span class="thumb-n">' + shot.storyboard.length + '</span>' : "") : '<span aria-hidden="true">+</span>') +
        '</button></td>';
    }
    if (SELECT_COLS[k]) return '<td><select class="cell-sel" data-f="' + k + '"' + aria + '>' + optionsFor(p, k, v) + '</select></td>';
    if (TEXTAREA_COLS[k]){
      return '<td class="wide"><textarea class="cell-in grow" rows="1" data-f="' + k + '"' + aria + ' placeholder="' + esc(PLACEHOLDER[k] || "") + '">' + esc(v) + '</textarea></td>';
    }
    var list = k === "location" ? ' list="slLocations"' : k === "lens" ? ' list="slLenses"' : "";
    var mono = (k === "startTc" || k === "duration") ? " mono" : "";
    return '<td><input class="cell-in' + mono + '" data-f="' + k + '" value="' + esc(v) + '"' + aria + list +
      ' placeholder="' + esc(PLACEHOLDER[k] || "") + '" autocomplete="off" spellcheck="' + (k === "action" || k === "notes" ? "true" : "false") + '"></td>';
  }
  function sceneBandHTML(p, scene, span){
    var opt = function(list, cur){
      if (cur && list.indexOf(cur) === -1) list = list.concat([cur]);
      return list.map(function(o){ return '<option' + (o === cur ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("");
    };
    var n = scene.shots.length;
    return '<tr class="scenebreak" data-scene="' + esc(scene.id) + '"><td colspan="' + span + '"><div class="sb">' +
      '<span class="sb-num">Sc.<input class="sb-in num" data-sf="num" value="' + esc(scene.num) + '" aria-label="Scene number" size="3" autocomplete="off"></span>' +
      '<input class="sb-in name" data-sf="name" value="' + esc(scene.name) + '" placeholder="Scene name" aria-label="Scene name, scene ' + esc(scene.num) + '" autocomplete="off">' +
      '<select class="sb-sel" data-sf="intext" aria-label="Interior or exterior">' + opt(FP.INTEXT_OPTIONS, scene.intext) + '</select>' +
      '<select class="sb-sel" data-sf="daynight" aria-label="Time of day">' + opt(FP.DAYNIGHT_OPTIONS, scene.daynight) + '</select>' +
      '<span class="sb-count">' + n + (n === 1 ? " shot" : " shots") + '</span>' +
      '<span class="sb-spacer"></span>' +
      '<button type="button" class="sb-btn" data-act="add-shot">+ Shot</button>' +
      '<button type="button" class="sb-btn icon" data-act="scene-menu" aria-label="Scene ' + esc(scene.num) + ' options">⋯</button>' +
    '</div>' +
    '<input class="sb-in sum" data-sf="summary" value="' + esc(scene.summary) + '" placeholder="One-line summary…" aria-label="Summary, scene ' + esc(scene.num) + '" autocomplete="off">' +
    '</td></tr>';
  }
  function tableHTML(p){
    var cols = columns();
    var span = cols.length + 2;
    TC = FP.shotTimecodes(p);
    var head = '<tr><th class="grip-col" aria-label="Drag handle"></th>' + cols.map(function(c){
      return '<th class="' + (c.hideable ? "" : "core") + '" style="min-width:' + (COL_MINW[c.key] || 80) + 'px">' + esc(c.label) + '</th>';
    }).join("") + '<th class="act-col" aria-label="Shot options"></th></tr>';
    var body = p.scenes.map(function(sc){
      var labels = FP.shotNumbers(sc);
      return sceneBandHTML(p, sc, span) + sc.shots.map(function(sh, i){
        var label = labels[i].label;
        return '<tr class="shot-row" data-shot="' + esc(sh.id) + '" data-scene="' + esc(sc.id) + '">' +
          '<td class="grip-col"><span class="grip" title="Drag to move this shot" aria-hidden="true">⋮⋮</span></td>' +
          cols.map(function(c){ return cellHTML(p, sc, sh, c, label); }).join("") +
          '<td class="act-col"><button type="button" class="row-menu" data-act="row-menu" aria-label="Options for shot ' + esc(label) + '">⋯</button></td>' +
        '</tr>';
      }).join("");
    }).join("");
    return '<table class="sl"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function countText(p){
    var shots = FP.countShots(p);
    if (!p.scenes.length) return "No scenes yet";
    return shots + (shots === 1 ? " shot, " : " shots, ") + p.scenes.length + (p.scenes.length === 1 ? " scene" : " scenes");
  }

  function render(host, p){
    H = host;
    host.innerHTML =
      '<div class="workwindow shotlist">' +
        '<div class="pg-toolbar">' +
          '<div class="left"><h3>Shot list</h3><span class="count" data-sl="count">' + esc(countText(p)) + '</span></div>' +
          '<div class="right">' +
            '<button type="button" class="btn ghost" data-act="columns" aria-haspopup="true">Columns</button>' +
            '<button type="button" class="btn ghost" data-act="add-scene">+ Add scene</button>' +
            '<button type="button" class="btn solid" data-act="add-shot-top">+ Add shot</button>' +
          '</div>' +
        '</div>' +
        '<div class="sl-body" data-sl="body"></div>' +
        '<datalist id="slLocations"></datalist><datalist id="slLenses"></datalist>' +
        '<input type="file" accept="image/*,.heic,.heif" multiple hidden data-sl="thumbFile">' +
      '</div>';
    drawBody(p);
    bind(host);
  }
  function drawBody(p){
    var body = H.querySelector('[data-sl="body"]');
    H.querySelector('[data-sl="count"]').textContent = countText(p);
    H.querySelector("#slLocations").innerHTML = p.locations.filter(function(l){ return l.name; })
      .map(function(l){ return '<option value="' + esc(l.name) + '"></option>'; }).join("");
    H.querySelector("#slLenses").innerHTML = lensNames(p).map(function(n){ return '<option value="' + esc(n) + '"></option>'; }).join("");
    if (!p.scenes.length){
      dropHead();
      body.innerHTML = '<div class="sl-empty"><p>No scenes yet. Add one here, or select a line on the Script page and make a shot from it.</p>' +
        '<button type="button" class="btn solid" data-act="add-scene">+ Add scene</button></div>';
      return;
    }
    var wrap = body.querySelector(".sl-table-wrap");
    var left = wrap ? wrap.scrollLeft : 0;
    body.innerHTML = '<div class="sl-table-wrap">' + tableHTML(p) + '</div>';
    wrap = body.querySelector(".sl-table-wrap");
    wrap.scrollLeft = left;
    wrap.addEventListener("scroll", placeHead);
    body.querySelectorAll("textarea.grow").forEach(autoGrow);
    buildHead();
  }

  // The table scrolls sideways inside its wrapper, which stops a sticky thead; a fixed copy
  // of the column labels takes over under the app bar once the real ones scroll out of view.
  var floatHead = null;
  function buildHead(){
    dropHead();
    var table = H && H.querySelector("table.sl");
    if (!table) return;
    floatHead = document.createElement("div");
    floatHead.className = "sl-float-head";
    floatHead.setAttribute("aria-hidden", "true");
    floatHead.innerHTML = '<table class="sl">' + table.tHead.outerHTML + '</table>';
    floatHead.hidden = true;
    H.appendChild(floatHead);
    placeHead();
  }
  function dropHead(){ if (floatHead) floatHead.remove(); floatHead = null; }
  function placeHead(){
    if (!floatHead || !H) return;
    var table = H.querySelector("table.sl"), wrap = H.querySelector(".sl-table-wrap");
    if (!table || !wrap){ floatHead.hidden = true; return; }
    var bar = document.getElementById("appbar");
    var top = bar ? bar.getBoundingClientRect().bottom : 0;
    var head = table.tHead.getBoundingClientRect(), tr = table.getBoundingClientRect();
    var show = head.top < top && tr.bottom > top + head.height;
    floatHead.hidden = !show;
    if (!show) return;
    var w = wrap.getBoundingClientRect();
    floatHead.style.top = top + "px";
    floatHead.style.left = w.left + "px";
    floatHead.style.width = wrap.clientWidth + "px";
    var copy = floatHead.firstChild;
    copy.style.width = tr.width + "px";
    copy.style.transform = "translateX(" + (-wrap.scrollLeft) + "px)";
    var real = table.tHead.rows[0].cells, ths = copy.tHead.rows[0].cells;
    for (var i = 0; i < real.length && i < ths.length; i++){
      var cw = real[i].getBoundingClientRect().width + "px";
      ths[i].style.width = cw; ths[i].style.minWidth = cw; ths[i].style.maxWidth = cw;
    }
  }
  window.addEventListener("scroll", placeHead, { passive: true });
  window.addEventListener("resize", placeHead);
  function autoGrow(ta){ ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }

  // redraw, keeping the field you were in and where you were in it
  function redraw(p){
    var a = document.activeElement, keep = null;
    if (a && H.contains(a)){
      var row = a.closest("tr");
      keep = { shot: row && row.getAttribute("data-shot"), scene: row && row.getAttribute("data-scene"),
        f: a.getAttribute("data-f"), sf: a.getAttribute("data-sf"), act: a.getAttribute("data-act"),
        s: a.selectionStart, e: a.selectionEnd };
    }
    drawBody(p);
    if (!keep) return;
    var sel = keep.f ? 'tr[data-shot="' + keep.shot + '"] [data-f="' + keep.f + '"]'
      : keep.sf ? 'tr.scenebreak[data-scene="' + keep.scene + '"] [data-sf="' + keep.sf + '"]'
      : keep.act && keep.shot ? 'tr[data-shot="' + keep.shot + '"] [data-act="' + keep.act + '"]' : null;
    var el = sel && H.querySelector(sel);
    if (!el) return;
    el.focus({ preventScroll: true });
    try { if (keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch (err){}
  }

  // ---------- changes ----------
  function change(fn, key){ FP.change(fn, key); }
  function refreshTimecodes(){
    if (!H) return;
    var tc = FP.shotTimecodes(FP.project());
    H.querySelectorAll("tr.shot-row").forEach(function(tr){
      var td = tr.querySelector("td[data-tc]"), t = tc[tr.getAttribute("data-shot")];
      if (td && t) td.textContent = FP.tcFormat(t.start);
    });
  }
  function stepDuration(shotId, by){
    change(function(p){
      var h = findShot(p, shotId);
      if (h) h.shot.duration = FP.durFormat(Math.max(0, (FP.tcParse(h.shot.duration) || 0) + by * FP.FPS));
    });
  }
  function typed(fn, key){
    selfTyping = true;
    try { FP.change(fn, key); } finally { selfTyping = false; }
  }
  function addShot(sceneId, atIndex, focus){
    var newId = null;
    change(function(p){
      var sc = sceneById(p, sceneId);
      if (!sc) return;
      var shot = FP.blankShot();
      var loc = "";
      for (var i = 0; i < sc.shots.length; i++) if (sc.shots[i].location){ loc = sc.shots[i].location; break; }
      shot.location = loc;
      if (atIndex == null || atIndex > sc.shots.length) sc.shots.push(shot); else sc.shots.splice(atIndex, 0, shot);
      newId = shot.id;
    });
    lastSceneId = sceneId;
    if (focus !== false && newId){
      var f = H && H.querySelector('tr[data-shot="' + newId + '"] [data-f="action"]');
      if (f){ f.focus(); flashRow(newId); }
    }
    return newId;
  }
  function addScene(){
    var id = null;
    change(function(p){
      var sc = FP.blankScene({ num: String(FP.nextSceneNumber(p)), shots: [FP.blankShot()] });
      p.scenes.push(sc);
      id = sc.id;
    });
    lastSceneId = id;
    var name = H && H.querySelector('tr.scenebreak[data-scene="' + id + '"] [data-sf="name"]');
    if (name){ name.focus(); name.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); }
  }
  function deleteShot(shotId){
    change(function(p){
      var hit = findShot(p, shotId);
      if (!hit) return;
      hit.scene.shots.splice(hit.index, 1);
      FP.unlinkScriptRefs(p, [hit.shot.scriptRef]);
    });
    toast("Shot deleted. Undo brings it back.");
  }
  function deleteScene(sceneId){
    change(function(p){
      var sc = sceneById(p, sceneId);
      if (!sc) return;
      p.scenes = p.scenes.filter(function(s){ return s.id !== sceneId; });
      FP.unlinkScriptRefs(p, sc.shots.map(function(s){ return s.scriptRef; }));
    });
    toast("Scene deleted. Undo brings it back.");
  }
  function duplicateShot(shotId){
    var newId = null;
    change(function(p){
      var hit = findShot(p, shotId);
      if (!hit) return;
      var copy = FP.clone(hit.shot);
      copy.id = FP.uid("s");
      copy.scriptRef = "";
      hit.scene.shots.splice(hit.index + 1, 0, copy);
      newId = copy.id;
    });
    if (newId) flashRow(newId);
  }
  // put a shot at `index` in `sceneId`, measured before it is taken out of its old place
  function moveShot(shotId, sceneId, index){
    change(function(p){
      var hit = findShot(p, shotId), to = sceneById(p, sceneId);
      if (!hit || !to) return;
      hit.scene.shots.splice(hit.index, 1);
      if (hit.scene === to && index > hit.index) index--;
      to.shots.splice(Math.max(0, Math.min(index, to.shots.length)), 0, hit.shot);
    });
    flashRow(shotId);
  }

  function flashRow(shotId){
    var tr = H && H.querySelector('tr[data-shot="' + shotId + '"]');
    if (!tr || reducedMotion()) return;
    tr.classList.remove("row-flash"); void tr.offsetWidth; tr.classList.add("row-flash");
    setTimeout(function(){ tr.classList.remove("row-flash"); }, 1600);
  }

  // ---------- menus ----------
  function openColumnsMenu(anchor){
    var existing = document.querySelector(".cols-menu");
    if (existing){ existing.remove(); return; }
    var m = document.createElement("div");
    m.className = "menu cols-menu";
    m.setAttribute("role", "dialog");
    m.setAttribute("aria-label", "Show columns");
    m.innerHTML = '<div class="menu-label">Show columns</div>' +
      FP.COLUMNS.concat([THUMB]).filter(function(c){ return c.hideable; }).map(function(c){
        return '<label class="menu-check"><input type="checkbox" data-col="' + c.key + '"' + (hidden[c.key] ? "" : " checked") + '> ' + esc(c.label) + '</label>';
      }).join("") +
      '<div class="menu-note">Scene, Shot, Location, Size and Action always show.</div>';
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + "px";
    m.style.top = (r.bottom + 6) + "px";
    m.addEventListener("change", function(e){
      var k = e.target.getAttribute("data-col");
      hidden[k] = !e.target.checked;
      saveHidden();
      redraw(FP.project());
    });
    var first = m.querySelector("input");
    if (first) first.focus();
  }
  function showInScript(fn){
    FP.showPage("script");
    if (FP.pages.script) fn(FP.pages.script);
  }
  function openRowMenu(btn, shotId){
    var p = FP.project();
    var hit = findShot(p, shotId);
    if (!hit) return;
    var linked = scriptHasRef(p, hit.shot.scriptRef);
    FP.openMenu(btn, [
      { label: "Insert shot above", onClick: function(){ addShot(hit.scene.id, hit.index); } },
      { label: "Insert shot below", onClick: function(){ addShot(hit.scene.id, hit.index + 1); } },
      { label: "Duplicate", onClick: function(){ duplicateShot(shotId); } },
      { label: linked ? "Show in script" : "Not made from the script", disabled: !linked,
        onClick: function(){ var ref = hit.shot.scriptRef; showInScript(function(s){ s.revealRef(ref); }); } },
      "sep",
      { label: "Delete shot", danger: true, confirm: "Click again to delete", onClick: function(){ deleteShot(shotId); } }
    ], { alignRight: true });
  }
  function openSceneMenu(btn, sceneId){
    var p = FP.project();
    var sc = sceneById(p, sceneId);
    if (!sc) return;
    var n = sc.shots.length;
    FP.openMenu(btn, [
      { label: "Add shot", onClick: function(){ addShot(sceneId); } },
      { label: scriptHasScene(p, sceneId) ? "Show in script" : "Heading not linked to the script", disabled: !scriptHasScene(p, sceneId),
        onClick: function(){ showInScript(function(s){ s.revealScene(sceneId); }); } },
      "sep",
      { label: "Delete scene" + (n ? " and its " + n + (n === 1 ? " shot" : " shots") : ""), danger: true,
        confirm: "Click again to delete", onClick: function(){ deleteScene(sceneId); } }
    ], { alignRight: true });
  }
  function openThumb(btn, shotId){
    var p = FP.project();
    var hit = findShot(p, shotId);
    if (!hit) return;
    thumbTarget = shotId;
    var file = H.querySelector('[data-sl="thumbFile"]');
    if (!hit.shot.storyboard.length){ file.click(); return; }
    var n = hit.shot.storyboard.length;
    FP.openMenu(btn, [
      { label: "Add another frame", onClick: function(){ thumbTarget = shotId; file.click(); } },
      { label: n > 1 ? "Remove the first frame" : "Remove frame", danger: true, onClick: function(){
        change(function(proj){ var h = findShot(proj, shotId); if (h) h.shot.storyboard.shift(); });
      } }
    ]);
  }

  // ---------- drag a shot to a new place ----------
  var drag = null;
  function startDrag(e, row){
    drag = { id: row.getAttribute("data-shot"), row: row, y: e.clientY, moving: false, target: null, pid: e.pointerId };
    try { e.target.setPointerCapture(e.pointerId); } catch (err){}
  }
  function clearDropMarks(){
    H.querySelectorAll(".drop-before, .drop-after").forEach(function(el){ el.classList.remove("drop-before", "drop-after"); });
  }
  function dragMove(e){
    if (!drag) return;
    if (!drag.moving){
      if (Math.abs(e.clientY - drag.y) < 4) return;
      drag.moving = true;
      drag.row.classList.add("dragging");
      document.body.classList.add("sl-dragging");
      autoScroll();
    }
    drag.lastY = e.clientY;
    clearDropMarks();
    var under = document.elementFromPoint(Math.min(e.clientX, window.innerWidth - 1), e.clientY);
    var tr = under && under.closest && under.closest("tr.shot-row, tr.scenebreak");
    if (!tr || !H.contains(tr)){ drag.target = null; return; }
    var p = FP.project();
    if (tr.classList.contains("scenebreak")){
      drag.target = { scene: tr.getAttribute("data-scene"), index: 0 };
      tr.classList.add("drop-after");
      return;
    }
    var r = tr.getBoundingClientRect();
    var before = e.clientY < r.top + r.height / 2;
    var hit = findShot(p, tr.getAttribute("data-shot"));
    if (!hit) return;
    drag.target = { scene: hit.scene.id, index: before ? hit.index : hit.index + 1 };
    tr.classList.add(before ? "drop-before" : "drop-after");
  }
  function autoScroll(){
    if (!drag || !drag.moving) return;
    var y = drag.lastY, edge = 70, v = 0;
    if (y != null){
      if (y < edge) v = -Math.ceil((edge - y) / 6);
      else if (y > window.innerHeight - edge) v = Math.ceil((y - (window.innerHeight - edge)) / 6);
    }
    if (v) window.scrollBy(0, v);
    requestAnimationFrame(autoScroll);
  }
  function endDrag(cancel){
    if (!drag) return;
    var d = drag;
    drag = null;
    document.body.classList.remove("sl-dragging");
    if (!H) return;
    clearDropMarks();
    d.row.classList.remove("dragging");
    if (!cancel && d.moving && d.target) moveShot(d.id, d.target.scene, d.target.index);
  }

  // ---------- events ----------
  function bind(host){
    host.addEventListener("input", function(e){
      var t = e.target;
      var f = t.getAttribute("data-f");
      if (f){
        var shotId = t.closest("tr").getAttribute("data-shot");
        if (t.tagName === "TEXTAREA") autoGrow(t);
        var v = t.value;
        typed(function(p){ var h = findShot(p, shotId); if (h) h.shot[f] = v; }, "shot:" + shotId + ":" + f);
        lastSceneId = t.closest("tr").getAttribute("data-scene");
        if (f === "duration") refreshTimecodes();
        return;
      }
      var sf = t.getAttribute("data-sf");
      if (sf && t.tagName === "INPUT"){
        var sceneId = t.closest("tr").getAttribute("data-scene");
        var sv = sf === "num" ? t.value.trim() : t.value;
        typed(function(p){ var sc = sceneById(p, sceneId); if (sc) sc[sf] = sv; }, "scene:" + sceneId + ":" + sf);
        if (sf === "num"){
          H.querySelectorAll('tr.shot-row[data-scene="' + sceneId + '"] td.num.muted').forEach(function(td){ td.textContent = sv; });
        }
      }
    });
    host.addEventListener("change", function(e){
      var t = e.target;
      if (t.getAttribute("data-f") === "duration"){
        var fr = FP.tcParse(t.value), did = t.closest("tr").getAttribute("data-shot");
        if (fr != null){ var norm = FP.durFormat(fr); if (norm !== t.value) change(function(p){ var h = findShot(p, did); if (h) h.shot.duration = norm; }); }
        return;
      }
      if (t.tagName !== "SELECT") return;
      var f = t.getAttribute("data-f"), sf = t.getAttribute("data-sf"), v = t.value;
      var row = t.closest("tr");
      if (f){
        var shotId = row.getAttribute("data-shot");
        change(function(p){ var h = findShot(p, shotId); if (h) h.shot[f] = v; });
      } else if (sf){
        var sceneId = row.getAttribute("data-scene");
        change(function(p){ var sc = sceneById(p, sceneId); if (sc) sc[sf] = v; });
      }
    });
    // Enter moves down the column, the way a spreadsheet does; Shift+Enter moves up
    host.addEventListener("keydown", function(e){
      var t = e.target;
      if (e.key !== "Enter" || e.altKey || e.metaKey || e.ctrlKey) return;
      var f = t.getAttribute("data-f");
      if (!f || t.tagName === "SELECT") return;
      e.preventDefault();
      var rows = Array.prototype.slice.call(H.querySelectorAll("tr.shot-row"));
      var i = rows.indexOf(t.closest("tr"));
      var next = rows[e.shiftKey ? i - 1 : i + 1];
      if (next){ var el = next.querySelector('[data-f="' + f + '"]'); if (el){ el.focus(); if (el.select) el.select(); } }
      else if (!e.shiftKey){ addShot(t.closest("tr").getAttribute("data-scene")); }
    });
    host.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var act = b.getAttribute("data-act");
      var row = b.closest("tr");
      if (act === "columns"){ e.stopPropagation(); openColumnsMenu(b); }
      else if (act === "add-scene") addScene();
      else if (act === "add-shot-top"){
        var p = FP.project();
        var target = (lastSceneId && sceneById(p, lastSceneId)) || p.scenes[p.scenes.length - 1];
        if (target) addShot(target.id); else addScene();
      }
      else if (act === "add-shot") addShot(row.getAttribute("data-scene"));
      else if (act === "dur+" || act === "dur-") stepDuration(row.getAttribute("data-shot"), act === "dur+" ? 1 : -1);
      else if (act === "row-menu"){ e.stopPropagation(); openRowMenu(b, row.getAttribute("data-shot")); }
      else if (act === "scene-menu"){ e.stopPropagation(); openSceneMenu(b, row.getAttribute("data-scene")); }
      else if (act === "thumb"){ e.stopPropagation(); openThumb(b, row.getAttribute("data-shot")); }
    });
    // a tall row leaves empty space around its short fields; a click there still lands in the field
    host.addEventListener("mousedown", function(e){
      if (e.button !== 0) return;
      var td = e.target.closest && e.target.closest("tr.shot-row td");
      if (!td || e.target !== td) return;
      var c = td.querySelector("input.cell-in, textarea.cell-in, select.cell-sel");
      if (!c) return;
      e.preventDefault();
      c.focus();
      if (c.tagName === "SELECT") FP.openSelect(c);
      else {
        var n = c.value.length;
        try { c.setSelectionRange(n, n); } catch (err){}
      }
    });
    host.addEventListener("focusin", function(e){
      var row = e.target.closest && e.target.closest("tr[data-scene]");
      if (row) lastSceneId = row.getAttribute("data-scene");
    });
    host.addEventListener("pointerdown", function(e){
      if (e.button !== 0) return;
      var g = e.target.closest(".grip");
      if (!g) return;
      e.preventDefault();
      startDrag(e, g.closest("tr"));
    });
    host.addEventListener("pointermove", dragMove);
    host.addEventListener("pointerup", function(){ endDrag(false); });
    host.addEventListener("pointercancel", function(){ endDrag(true); });
    host.querySelector('[data-sl="thumbFile"]').addEventListener("change", function(){
      var files = Array.prototype.slice.call(this.files || []);
      this.value = "";
      var id = thumbTarget;
      if (!files.length || !id) return;
      Promise.all(files.map(function(f){ return FP.readImageFile(f, 900, 0.72); })).then(function(srcs){
        change(function(p){
          var h = findShot(p, id);
          if (h) srcs.forEach(function(src){ h.shot.storyboard.push({ id: FP.uid("ph"), src: src }); });
        });
      }, function(err){ toast(err.message || "Couldn't add that image.", 5000); });
    });
  }
  document.addEventListener("keydown", function(e){
    if (e.key !== "Escape") return;
    if (drag) endDrag(true);
    var m = document.querySelector(".cols-menu");
    if (m) m.remove();
  });
  document.addEventListener("mousedown", function(e){
    var m = document.querySelector(".cols-menu");
    if (m && !m.contains(e.target) && !(e.target.closest && e.target.closest('[data-act="columns"]'))) m.remove();
  });

  FP.pages.shotlist = {
    render: render,
    update: function(host, p){
      if (!H) return;
      if (selfTyping){
        H.querySelector('[data-sl="count"]').textContent = countText(p);
        return;
      }
      redraw(p);
    },
    leave: function(){ endDrag(true); dropHead(); var m = document.querySelector(".cols-menu"); if (m) m.remove(); H = null; },
    revealShot: function(shotId){
      FP.showPage("shotlist");
      var tr = H && H.querySelector('tr[data-shot="' + shotId + '"]');
      if (!tr) return;
      tr.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      flashRow(shotId);
      var f = tr.querySelector('[data-f="action"]');
      if (f) f.focus({ preventScroll: true });
    }
  };
})();
