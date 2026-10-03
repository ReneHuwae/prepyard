/* Floor plan page, Rev. 08: a top-down plan per location. Walls, doors, windows and
   shapes belong to the location and every scene shot there shares them; cameras and props
   belong to one scene. Each shot in the scene gets a camera whose cone follows its lens.
   Gestures edit the plan live and land as one undo step when the pointer lifts. */
(function(){
  "use strict";
  var FP = window.FP;
  function esc(s){ return FP.esc(s); }

  var GRID = 20, W = 1200, Hh = 800;
  var SENSOR_W = 24.9;   // Super 35, so the cone matches the lens: 18mm ≈ 69°, 50mm ≈ 28°
  // the toolbar's groups and every object's drawing live in floorplan-props.js
  var TOOLS = FP.floorplanProps.TOOLS, PROP_HIT = FP.floorplanProps.HIT;

  // ---------- page state (not part of the project) ----------
  var H = null, svg = null;
  var locId = "", sceneId = "";
  var tool = "select", propKind = "actor";
  var sel = null;          // { type, i }
  var multi = [];          // [{ type, i }] from a marquee
  var lockSet = false;
  var drag = null;
  var live = null;         // the floor plan as it was when a live edit began
  var textEdit = null;
  var stage = 1;           // the stage being edited; stage 1 is where everything starts
  var playT = null;        // while playing: the stage we're at, fractional between stages
  var playRaf = 0;
  var moveTo = null;
  var lastPathTap = null;
  var pendingSpot = null;
  var view = { z: 1, cx: 600, cy: 400 };   // zoom: how close in, and the plan point in the middle
  var spaceDown = false;  // where "Move to" will put the item, while you pick its stage       // { type, i }: the next click puts this item there in the current stage

  // ---------- reading the project ----------
  function P(){ return FP.project(); }
  function fp(){ return P().floorplan; }
  function key(){ return locId + "::" + sceneId; }
  function list(kind, create){
    var k = (kind === "cams" || kind === "props") ? (locId && sceneId ? key() : "") : locId;
    if (!k) return [];
    var map = fp()[kind];
    if (!map[k]){ if (!create) return []; map[k] = []; }
    return map[k];
  }
  function walls(c){ return list("walls", c); }
  function doors(c){ return list("doors", c); }
  function shapes(c){ return list("shapes", c); }
  function props(c){ return list("props", c); }
  function cams(c){ return list("cams", c); }
  function listFor(type, c){
    return type === "wall" ? walls(c) : type === "door" ? doors(c) : type === "shape" ? shapes(c) : type === "prop" ? props(c) : cams(c);
  }
  function isSet(type){ return type === "wall" || type === "door" || type === "shape"; }
  function selectable(type){ return !(lockSet && isSet(type)); }
  function norm(s){ return String(s || "").trim().toLowerCase(); }
  function namedLocations(){ return P().locations.filter(function(l){ return l.name.trim(); }); }
  function sceneLoc(sc){ for (var i = 0; i < sc.shots.length; i++) if (sc.shots[i].location) return sc.shots[i].location; return ""; }
  function scene(){ return P().scenes.filter(function(s){ return s.id === sceneId; })[0] || null; }
  function shotRows(){
    var sc = scene();
    if (!sc) return [];
    var labels = FP.shotNumbers(sc);
    return sc.shots.map(function(s, i){ return { shot: s, label: labels[i].label }; });
  }
  function lensFov(lens){
    var m = String(lens || "").match(/[\d.]+/), mm = m ? parseFloat(m[0]) : 0;
    return mm > 0 ? Math.max(10, Math.min(140, Math.round(2 * Math.atan(SENSOR_W / (2 * mm)) * 180 / Math.PI))) : null;
  }
  function lensLabel(v){ var s = String(v || "").trim(); return /^[\d.]+$/.test(s) ? s + "mm" : s; }
  function wallById(id){ var l = walls(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function doorGeom(d){
    var w = wallById(d.wall);
    if (!w) return null;
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    var cx = w.x1 + dx * d.t, cy = w.y1 + dy * d.t, half = Math.min(d.width, len) / 2;
    return { cx: cx, cy: cy, ux: ux, uy: uy, half: half, x1: cx - ux * half, y1: cy - uy * half, x2: cx + ux * half, y2: cy + uy * half };
  }
  function projectOnWall(w, px, py){
    var dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
    return l2 ? Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / l2)) : 0;
  }
  // ---------- stages: where cameras and props are, stage by stage ----------
  // Stage 1 is an item's own x, y and rot. A later stage only stores a key when the item
  // is moved in it (item.keys[stage] = { x, y, rot }); otherwise it stays where it was.
  function stageCount(){ var m = fp().stages || {}; return Math.max(1, Math.round(+m[key()] || 1)); }
  function poseAt(it, s){
    var x = it.x, y = it.y, rot = it.rot || 0;
    if (it.keys) for (var k = 2; k <= s; k++){ var kf = it.keys[k]; if (kf){ x = kf.x; y = kf.y; rot = kf.rot || 0; } }
    return { x: x, y: y, rot: rot };
  }
  // the way into stage k can bend: keys[k].c is the curve's control point
  function bendOf(it, k){ return k > 1 && it.keys && it.keys[k] && it.keys[k].c || null; }
  function bendMid(it, k){
    var p0 = poseAt(it, k - 1), p1 = poseAt(it, k), c = bendOf(it, k);
    return c ? { x: (p0.x + 2 * c.x + p1.x) / 4, y: (p0.y + 2 * c.y + p1.y) / 4 } : { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  }
  function ease(f){ return f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; }
  function pose(it){
    if (playT == null) return poseAt(it, stage);
    var a = Math.floor(playT), b = Math.min(a + 1, stageCount()), f = ease(playT - a), p0 = poseAt(it, a), p1 = poseAt(it, b);
    var dr = ((p1.rot - p0.rot) % 360 + 540) % 360 - 180, c = bendOf(it, b), u = 1 - f;
    if (c) return { x: u * u * p0.x + 2 * u * f * c.x + f * f * p1.x, y: u * u * p0.y + 2 * u * f * c.y + f * f * p1.y, rot: p0.rot + dr * f };
    return { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, rot: p0.rot + dr * f };
  }
  function setPose(it, patch){
    if (stage <= 1){ Object.keys(patch).forEach(function(k){ it[k] = patch[k]; }); return; }
    var cur = poseAt(it, stage);
    it.keys = it.keys || {};
    var bend = it.keys[stage] && it.keys[stage].c;
    it.keys[stage] = { x: patch.x != null ? patch.x : cur.x, y: patch.y != null ? patch.y : cur.y, rot: patch.rot != null ? patch.rot : cur.rot };
    if (bend) it.keys[stage].c = bend;
  }
  function moving(){ return props().concat(cams()); }
  function addStage(){
    var n = stageCount() + 1;
    change(function(){ fp().stages = fp().stages || {}; fp().stages[key()] = n; });
    stage = n;
    draw();
  }
  // removing a stage closes the gap: later keys move up one, and removing stage 1 makes
  // stage 2's places the starting ones
  function removeStage(s){
    var n = stageCount();
    if (n < 2) return;
    change(function(){
      moving().forEach(function(it){
        if (s === 1 && it.keys && it.keys[2]){ it.x = it.keys[2].x; it.y = it.keys[2].y; it.rot = it.keys[2].rot; }
        if (!it.keys) return;
        var nk = {};
        Object.keys(it.keys).forEach(function(k){ k = +k; if (k === s || (s === 1 && k === 2)) return; nk[k > s ? k - 1 : k] = it.keys[k]; });
        if (Object.keys(nk).length) it.keys = nk; else delete it.keys;
      });
      if (n - 1 > 1) fp().stages[key()] = n - 1; else delete fp().stages[key()];
    });
    stage = Math.min(stage, n - 1);
    draw();
  }
  function play(){
    if (playRaf){ stopPlay(stageCount()); return; }
    var n = stageCount(), HOLD = 450, MOVE = 1300, t0 = null;
    sel = null; multi = []; moveTo = null;
    function frame(ts){
      if (!H || !svg){ playRaf = 0; playT = null; return; }
      if (t0 == null) t0 = ts;
      var el = ts - t0, seg = HOLD + MOVE, i = Math.floor(el / seg), r = el - i * seg;
      if (i >= n - 1){ stopPlay(n); return; }
      playT = 1 + i + (r < HOLD ? 0 : (r - HOLD) / MOVE);
      svg.innerHTML = svgHTML();
      stageBar();
      playRaf = requestAnimationFrame(frame);
    }
    playT = 1;
    playRaf = requestAnimationFrame(frame);
    stageBar();
  }
  function stopPlay(at){
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = 0; playT = null;
    if (at) stage = at;
    draw();
  }
  function stageBar(){
    var bar = H && H.querySelector("[data-fp-stages]");
    if (!bar) return;
    if (!locId || !sceneId){ bar.hidden = true; return; }
    bar.hidden = false;
    var n = stageCount(), on = playT != null ? Math.min(n, Math.round(playT)) : stage;
    bar.innerHTML = '<span class="fp-stage-l">Stages</span><div class="seg fp-stage-tabs">' +
      Array.from({ length: n }, function(_, k){ var s = k + 1;
        return '<button type="button" data-fpstage="' + s + '"' + (s === on ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + s + '</button>'; }).join("") +
      '</div><button type="button" class="btn ghost fp-stage-btn" data-fpact="add-stage">+ Stage</button>' +
      (n > 1 ? '<button type="button" class="btn ' + (playT != null ? "solid" : "ghost") + ' fp-stage-btn" data-fpact="play">' + (playT != null ? "■ Stop" : "▶ Play") + '</button>' +
        '<button type="button" class="link-btn fp-stage-del" data-fpact="del-stage">Remove stage ' + stage + '</button>' : "") +
      '<span class="fp-stage-hint">' + (moveTo ? "Click where it goes, then choose its stage. Esc cancels." : pendingSpot ? "Choose the stage it's there in." :
        n > 1 ? "Drag cameras and props to place them for this stage. Select one to bend its path; right-click to move it in the next stage." :
        "Add a stage to plan movement: right-click a person, camera or prop and choose where it moves next.") + '</span>';
  }
  function motionHTML(){
    var n = stageCount();
    if (n < 2) return "";
    var s = "", ghosts = "";
    function walk(it, isProp, i){
      var pts = [], moved = false;
      for (var k = 1; k <= n; k++){ var q = poseAt(it, k); pts.push(q); if (k > 1 && (q.x !== pts[k - 2].x || q.y !== pts[k - 2].y || q.rot !== pts[k - 2].rot)) moved = true; }
      if (!moved) return;
      var d = "", marks = "";
      pts.forEach(function(q, k){
        var prev = pts[k - 1];
        if (k === 0 || q.x !== prev.x || q.y !== prev.y){
          var bc = k > 0 && bendOf(it, k + 1);
          d += !d ? "M" + q.x + "," + q.y : bc ? " Q" + bc.x + "," + bc.y + " " + q.x + "," + q.y : " L" + q.x + "," + q.y;
          marks += '<circle class="fp-motion-dot' + (k + 1 === stage && playT == null ? " on" : "") + '" cx="' + q.x + '" cy="' + q.y + '" r="9"/><text class="fp-motion-n" x="' + q.x + '" y="' + (q.y + 3.5) + '" text-anchor="middle">' + (k + 1) + '</text>';
          if (k > 0){ var mm = bendMid(it, k + 1), ang = Math.atan2(q.y - prev.y, q.x - prev.x), mx = mm.x, my = mm.y;
            marks += '<path class="fp-motion-arrow" d="M' + (mx + Math.cos(ang) * 6).toFixed(1) + ',' + (my + Math.sin(ang) * 6).toFixed(1) + ' L' + (mx - Math.cos(ang - .5) * 6).toFixed(1) + ',' + (my - Math.sin(ang - .5) * 6).toFixed(1) + ' L' + (mx - Math.cos(ang + .5) * 6).toFixed(1) + ',' + (my - Math.sin(ang + .5) * 6).toFixed(1) + ' Z"/>'; }
        }
      });
      s += '<path class="fp-motion" d="' + d + '"/>' + marks;
      if (playT == null && stage > 1 && isProp){
        var g = poseAt(it, stage - 1), now = poseAt(it, stage), sc = it.sc == null ? 1 : it.sc;
        if (g.x !== now.x || g.y !== now.y || g.rot !== now.rot)
          ghosts += '<g class="fp-prev" transform="translate(' + g.x + ',' + g.y + ') rotate(' + g.rot + ') scale(' + sc + ')">' + propShape(it) + '</g>';
      }
    }
    props().forEach(function(it, i){ walk(it, true, i); });
    var live = liveShots();
    cams().forEach(function(it, i){ if (live[it.shotId]) walk(it, false, i); });
    return '<g class="fp-motion-layer">' + ghosts + s + '</g>';
  }
  // ---------- zoom: the plan's viewBox closes in on a point; Space-drag or the middle button pans ----------
  function clampView(){
    view.z = Math.max(1, Math.min(6, view.z));
    var hw = W / 2 / view.z, hh = Hh / 2 / view.z;
    view.cx = Math.max(hw, Math.min(W - hw, view.cx));
    view.cy = Math.max(hh, Math.min(Hh - hh, view.cy));
  }
  function applyView(){
    if (!svg) return;
    clampView();
    var w = W / view.z, h = Hh / view.z;
    svg.setAttribute("viewBox", (view.cx - w / 2).toFixed(1) + " " + (view.cy - h / 2).toFixed(1) + " " + w.toFixed(1) + " " + h.toFixed(1));
    var lab = H && H.querySelector("[data-fpzoom=fit]");
    if (lab) lab.textContent = Math.round(view.z * 100) + "%";
  }
  // zoom by a factor, keeping the plan point under (px, py) where it is
  function zoomAt(f, px, py){
    var z0 = view.z, z1 = Math.max(1, Math.min(6, z0 * f));
    if (px == null){ px = view.cx; py = view.cy; }
    view.cx = px - (px - view.cx) * z0 / z1;
    view.cy = py - (py - view.cy) * z0 / z1;
    view.z = z1;
    applyView();
  }
  function chooseStage(mv, spot, cx, cy){
    var n = stageCount(), anchorEl = document.createElement("span");
    anchorEl.style.cssText = "position:fixed;left:" + cx + "px;top:" + cy + "px;width:0;height:0";
    document.body.appendChild(anchorEl);
    var put = function(s, isNew){
      pendingSpot = null;
      change(function(){
        if (isNew){ fp().stages = fp().stages || {}; fp().stages[key()] = s; }
        var t = listFor(mv.type)[mv.i];
        if (!t) return;
        var was = stage; stage = s; setPose(t, spot); stage = was;
      });
      stage = s;
      draw();
    };
    var items = [{ heading: "Put it here in" }];
    for (var s = 1; s <= n; s++) (function(s){ items.push({ label: "Stage " + s, current: s === stage, onClick: function(){ put(s, false); } }); })(s);
    items.push("sep", { label: "A new stage " + (n + 1), onClick: function(){ put(n + 1, true); } });
    FP.openMenu(anchorEl, items);
    anchorEl.remove();
  }
  function snap(v){ return Math.round(v / GRID) * GRID; }
  function point(e){
    var pt = svg.createSVGPoint(), m = svg.getScreenCTM();
    pt.x = e.clientX; pt.y = e.clientY;
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  // every shot in the scene has a camera; new shots get one along the bottom edge
  function syncCams(){
    if (!locId || !sceneId) return false;
    var rows = shotRows(), have = {}, added = false;
    cams().forEach(function(c){ if (c.shotId) have[c.shotId] = true; });
    var missing = rows.filter(function(r){ return !have[r.shot.id]; });
    if (!missing.length) return false;
    FP.quietChange(function(){
      var l = cams(true), n = l.length;
      missing.forEach(function(r){
        l.push({ x: 140 + (n % 8) * 120, y: 700 - Math.floor(n / 8) * 90, rot: 0, shotId: r.shot.id,
          fov: lensFov(r.shot.lens) || 50, range: 170, fovAuto: true });
        n++; added = true;
      });
    });
    return added;
  }
  function liveShots(){ var o = {}; shotRows().forEach(function(r){ o[r.shot.id] = r; }); return o; }

  // ---------- changes ----------
  // instant edits are one FP.change; gestures edit live and are committed on release
  function begin(){ if (!live) live = FP.clone(fp()); }
  function end(){
    if (!live) return;
    var before = live, after = FP.clone(fp());
    live = null;
    if (JSON.stringify(before) === JSON.stringify(after)){ draw(); return; }
    P().floorplan = before;
    FP.change(function(p){ p.floorplan = after; });
  }
  function change(fn){ FP.change(function(){ fn(); }); }

  // ---------- drawing ----------
  function curved(s){ return s && s.cx != null && s.cy != null; }
  function shapePath(s){ return curved(s) ? "M" + s.x1 + "," + s.y1 + " Q" + s.cx + "," + s.cy + " " + s.x2 + "," + s.y2 : "M" + s.x1 + "," + s.y1 + " L" + s.x2 + "," + s.y2; }
  function marked(type, i){
    if (sel && sel.type === type && sel.i === i) return true;
    for (var k = 0; k < multi.length; k++) if (multi[k].type === type && multi[k].i === i) return true;
    return false;
  }
  function seats(l){ return l.map(function(s){ return '<rect class="p-seat" x="' + (s[0] - 11) + '" y="' + (s[1] - 11) + '" width="22" height="22" rx="5"/>'; }).join(""); }
  function propShape(pr){ return FP.floorplanProps.shape(pr.kind, pr); }
  function hitSize(pr){ return FP.floorplanProps.hit(pr); }
  // how far below its centre, on screen, a turned and scaled object ends: its label goes there
  function labelDrop(pr, sc, rot){
    var d = hitSize(pr), r = (rot == null ? pr.rot || 0 : rot) * Math.PI / 180;
    return (Math.abs(d[0] / 2 * Math.sin(r)) + Math.abs(d[1] / 2 * Math.cos(r))) * sc + 14;
  }
  function propHit(pr){ var d = hitSize(pr); return '<rect class="p-hit" x="' + (-d[0] / 2) + '" y="' + (-d[1] / 2) + '" width="' + d[0] + '" height="' + d[1] + '"/>'; }

  function svgHTML(){
    var s = '<rect class="fp-paper" width="' + W + '" height="' + Hh + '"/><g class="fp-grid-minor">', x, y, overlay = "";
    for (x = GRID; x < W; x += GRID) s += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + Hh + '"/>';
    for (y = GRID; y < Hh; y += GRID) s += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '"/>';
    s += '</g><g class="fp-grid-major">';
    for (x = 100; x < W; x += 100) s += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + Hh + '"/>';
    for (y = 100; y < Hh; y += 100) s += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '"/>';
    s += '</g>';

    shapes().forEach(function(sh, i){
      var c = marked("shape", i) ? " sel" : "", hit = "", body = "";
      if (sh.kind === "rect" || sh.kind === "ellipse"){
        var a = sh.kind === "rect"
          ? 'x="' + Math.min(sh.x1, sh.x2) + '" y="' + Math.min(sh.y1, sh.y2) + '" width="' + Math.abs(sh.x2 - sh.x1) + '" height="' + Math.abs(sh.y2 - sh.y1) + '"'
          : 'cx="' + ((sh.x1 + sh.x2) / 2) + '" cy="' + ((sh.y1 + sh.y2) / 2) + '" rx="' + (Math.abs(sh.x2 - sh.x1) / 2) + '" ry="' + (Math.abs(sh.y2 - sh.y1) / 2) + '"';
        body = '<' + sh.kind + ' class="fp-shape' + c + '" ' + a + '/>';
        hit = '<' + sh.kind + ' class="fp-shape-hit" data-type="shape" data-i="' + i + '" ' + a + '/>';
      } else if (sh.kind === "line" || sh.kind === "arrow"){
        body = '<path class="fp-shape' + c + '" d="' + shapePath(sh) + '"/>';
        if (sh.kind === "arrow"){
          var tx = curved(sh) ? sh.cx : sh.x1, ty = curved(sh) ? sh.cy : sh.y1, ang = Math.atan2(sh.y2 - ty, sh.x2 - tx), hl = 18, sp = 0.42;
          body += '<path class="fp-arrowhead' + c + '" d="M' + sh.x2 + ',' + sh.y2 + ' L' + (sh.x2 - hl * Math.cos(ang - sp)).toFixed(1) + ',' + (sh.y2 - hl * Math.sin(ang - sp)).toFixed(1) +
            ' L' + (sh.x2 - hl * Math.cos(ang + sp)).toFixed(1) + ',' + (sh.y2 - hl * Math.sin(ang + sp)).toFixed(1) + ' Z"/>';
        }
        hit = '<path class="fp-shape-hit" data-type="shape" data-i="' + i + '" d="' + shapePath(sh) + '"/>';
        if (marked("shape", i)){
          var cp = curved(sh) ? { x: sh.cx, y: sh.cy } : { x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2 };
          overlay += '<circle class="fp-handle" data-type="shapept" data-i="' + i + '" data-pt="1" cx="' + sh.x1 + '" cy="' + sh.y1 + '" r="7"/>' +
            '<circle class="fp-handle" data-type="shapept" data-i="' + i + '" data-pt="2" cx="' + sh.x2 + '" cy="' + sh.y2 + '" r="7"/>' +
            '<circle class="fp-handle bend' + (curved(sh) ? " on" : "") + '" data-type="shapectrl" data-i="' + i + '" cx="' + cp.x + '" cy="' + cp.y + '" r="7"><title>Drag to bend, double-click to straighten</title></circle>';
        }
      } else if (sh.kind === "text"){
        var label = sh.text || "";
        body = '<text class="fp-text' + c + '" x="' + sh.x1 + '" y="' + sh.y1 + '">' + esc(label) + '</text>';
        hit = '<rect class="fp-text-hit" data-type="shape" data-i="' + i + '" x="' + (sh.x1 - 4) + '" y="' + (sh.y1 - 15) + '" width="' + Math.max(40, label.length * 9.5) + '" height="21"/>';
      } else if (sh.kind === "brush"){
        body = '<path class="fp-shape' + c + '" d="' + sh.d + '" stroke-linecap="round" stroke-linejoin="round"/>';
        hit = '<path class="fp-shape-hit" data-type="shape" data-i="' + i + '" d="' + sh.d + '"/>';
      }
      s += body + hit;
    });

    walls().forEach(function(w, i){
      var a = 'x1="' + w.x1 + '" y1="' + w.y1 + '" x2="' + w.x2 + '" y2="' + w.y2 + '"';
      s += '<line class="fp-wall-hit" data-type="wall" data-i="' + i + '" ' + a + '/><line class="fp-wall' + (marked("wall", i) ? " sel" : "") + '" data-type="wall" data-i="' + i + '" ' + a + '/>';
    });

    doors().forEach(function(d, i){
      var g = doorGeom(d);
      if (!g) return;
      var c = marked("door", i) ? " sel" : "";
      s += '<line class="fp-open" x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 + '"/>';
      if (d.kind === "window"){
        s += '<line class="fp-window' + c + '" x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 + '"/>';
      } else {
        var w2 = g.half * 2, hx = d.hinge ? g.x2 : g.x1, hy = d.hinge ? g.y2 : g.y1, jx = d.hinge ? g.x1 : g.x2, jy = d.hinge ? g.y1 : g.y2;
        var sgn = d.swing ? -1 : 1, lx = hx - g.uy * w2 * sgn, ly = hy + g.ux * w2 * sgn, sweep = (d.hinge ? 1 : 0) ^ (d.swing ? 1 : 0);
        s += '<line class="fp-door-leaf' + c + '" x1="' + hx + '" y1="' + hy + '" x2="' + lx + '" y2="' + ly + '"/>' +
          '<path class="fp-door-arc' + c + '" d="M' + lx + ',' + ly + ' A' + w2 + ',' + w2 + ' 0 0 ' + sweep + ' ' + jx + ',' + jy + '"/>';
      }
      s += '<line class="fp-door-hit" data-type="door" data-i="' + i + '" x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 + '"/>';
    });

    s += motionHTML();
    props().forEach(function(pr, i){
      var c = marked("prop", i) ? " sel" : "", sc = pr.sc == null ? 1 : pr.sc, q = pose(pr);
      s += '<g class="fp-prop' + c + (moveTo && moveTo.type === "prop" && moveTo.i === i ? " moving" : "") + '" data-type="prop" data-i="' + i + '" transform="translate(' + q.x + ',' + q.y + ') rotate(' + q.rot + ') scale(' + sc + ')">' +
        propHit(pr) + propShape(pr) +
        (pr.label ? '<text y="' + labelDrop(pr, sc, q.rot).toFixed(1) + '" text-anchor="middle" transform="rotate(' + (-q.rot) + ') scale(' + (1 / sc).toFixed(3) + ')">' + esc(pr.label) + '</text>' : "") +
        (c ? '<circle class="fp-rot" data-type="proprot" data-i="' + i + '" cy="' + (-(hitSize(pr)[1] / 2) - 18 / sc).toFixed(1) + '" r="' + (7 / sc).toFixed(1) + '"/>' : "") + '</g>';
    });

    var shotsById = liveShots();
    cams().forEach(function(cm, i){
      var r = shotsById[cm.shotId];
      if (!r) return;
      var c = marked("cam", i), fov = cm.fovAuto !== false && lensFov(r.shot.lens) ? lensFov(r.shot.lens) : (cm.fov == null ? 50 : cm.fov);
      var range = cm.range == null ? 170 : cm.range, a = fov * Math.PI / 360;
      var ax = (-Math.sin(a) * range).toFixed(1), ay = (-Math.cos(a) * range).toFixed(1), bx = (Math.sin(a) * range).toFixed(1);
      var meta = [r.shot.size, lensLabel(r.shot.lens)].filter(Boolean).join(" · "), q = pose(cm);
      s += '<g class="fp-cam' + (c ? " sel" : "") + (moveTo && moveTo.type === "cam" && moveTo.i === i ? " moving" : "") + '" data-type="cam" data-i="' + i + '" transform="translate(' + q.x + ',' + q.y + ') rotate(' + q.rot + ')">' +
        '<path class="fp-fov" d="M0,0 L' + ax + ',' + ay + ' A' + range + ',' + range + ' 0 0 1 ' + bx + ',' + ay + ' Z"/>' +
        '<circle class="p-hit" r="24"/><path class="fp-cam-dir" d="M0,-14 L9,-30 L-9,-30 Z"/><circle class="fp-cam-body" r="14"/>' +
        '<g transform="rotate(' + (-q.rot) + ')"><text y="4" text-anchor="middle">' + esc(r.label) + '</text>' +
          (meta ? '<text class="fp-cam-meta" y="30" text-anchor="middle">' + esc(meta) + '</text>' : "") + '</g>' +
        (c ? '<circle class="fp-rot" data-type="rot" data-i="' + i + '" cy="-46" r="7"/>' : "") + '</g>';
    });

    if (sel && (sel.type === "prop" || sel.type === "cam") && playT == null && !moveTo && stageCount() > 1){
      var mvIt = listFor(sel.type)[sel.i];
      if (mvIt) for (var sk = 2; sk <= stageCount(); sk++){
        var a0 = poseAt(mvIt, sk - 1), a1 = poseAt(mvIt, sk);
        if (a0.x === a1.x && a0.y === a1.y) continue;
        var hm = bendMid(mvIt, sk);
        s += '<circle class="fp-handle bend path' + (bendOf(mvIt, sk) ? " on" : "") + '" data-type="pathctrl" data-i="' + sel.i + '" data-k="' + sk + '" cx="' + hm.x.toFixed(1) + '" cy="' + hm.y.toFixed(1) + '" r="7"><title>Drag to bend the way into stage ' + sk + '; double-click to straighten</title></circle>';
      }
    }
    if (pendingSpot) s += '<g class="fp-spot" transform="translate(' + pendingSpot.x + ',' + pendingSpot.y + ')"><circle r="10"/><path d="M-15,0 H15 M0,-15 V15"/></g>';
    if (drag && drag.mode === "newwall") s += '<line class="fp-ghost" x1="' + drag.x1 + '" y1="' + drag.y1 + '" x2="' + drag.x2 + '" y2="' + drag.y2 + '"/>';
    if (drag && drag.mode === "marquee") s += '<rect class="fp-marquee" x="' + Math.min(drag.x1, drag.x2) + '" y="' + Math.min(drag.y1, drag.y2) + '" width="' + Math.abs(drag.x2 - drag.x1) + '" height="' + Math.abs(drag.y2 - drag.y1) + '"/>';
    if (drag && drag.mode === "newshape"){
      var g = drag.shape;
      if (g.kind === "rect") s += '<rect class="fp-ghost" x="' + Math.min(g.x1, g.x2) + '" y="' + Math.min(g.y1, g.y2) + '" width="' + Math.abs(g.x2 - g.x1) + '" height="' + Math.abs(g.y2 - g.y1) + '"/>';
      else if (g.kind === "ellipse") s += '<ellipse class="fp-ghost" cx="' + ((g.x1 + g.x2) / 2) + '" cy="' + ((g.y1 + g.y2) / 2) + '" rx="' + (Math.abs(g.x2 - g.x1) / 2) + '" ry="' + (Math.abs(g.y2 - g.y1) / 2) + '"/>';
      else if (g.kind === "brush") s += '<path class="fp-ghost" d="' + g.d + '"/>';
      else s += '<line class="fp-ghost" x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 + '"/>';
    }
    return s + overlay;
  }
  function draw(){
    if (!H || !svg) return;
    if (stage > stageCount()) stage = stageCount();
    svg.innerHTML = svgHTML();
    drawInspector();
    stageBar();
  }

  // ---------- the inspector: what the selection can do ----------
  function drawInspector(){
    var box = H.querySelector("[data-fp-inspector]");
    if (!box || box.contains(document.activeElement) && document.activeElement.type === "range") return;
    var html = "";
    if (multi.length){
      html = '<div class="fp-insp-h">' + multi.length + ' selected</div><p class="fp-hint">Drag any of them to move the group.</p>' +
        '<button type="button" class="btn ghost danger-btn" data-fpact="delete">Delete</button>';
    } else if (sel){
      var item = listFor(sel.type)[sel.i];
      if (!item){ sel = null; return drawInspector(); }
      if (sel.type === "cam"){
        var r = liveShots()[item.shotId], auto = item.fovAuto !== false && r && lensFov(r.shot.lens);
        var fov = auto ? lensFov(r.shot.lens) : (item.fov == null ? 50 : item.fov);
        html = '<div class="fp-insp-h">Camera, shot ' + esc(r ? r.label : "") + '</div>' +
          (r ? '<p class="fp-insp-sub">' + esc([r.shot.size, lensLabel(r.shot.lens), r.shot.movement].filter(Boolean).join(" · ") || "No size or lens yet") + '</p>' : "") +
          '<label class="fld"><span>Angle of view, ' + fov + '°' + (auto ? " (from the lens)" : "") + '</span><input type="range" min="10" max="140" value="' + fov + '" data-fpr="fov"></label>' +
          '<label class="fld"><span>Throw</span><input type="range" min="60" max="420" step="10" value="' + (item.range == null ? 170 : item.range) + '" data-fpr="range"></label>' +
          (item.fovAuto === false && r && lensFov(r.shot.lens) ? '<button type="button" class="link-btn" data-fpact="fov-auto">Follow the lens again</button>' : "") +
          '<p class="fp-hint">Drag the dot in front of the camera to turn it.</p>';
      } else if (sel.type === "door"){
        html = '<div class="fp-insp-h">' + (item.kind === "window" ? "Window" : "Door") + '</div>' +
          '<label class="fld"><span>Width</span><input type="range" min="20" max="200" step="10" value="' + item.width + '" data-fpr="width"></label>' +
          (item.kind === "window" ? "" : '<div class="fp-insp-row"><button type="button" class="btn ghost" data-fpact="hinge">Flip hinge</button><button type="button" class="btn ghost" data-fpact="swing">Flip swing</button></div>') +
          '<button type="button" class="btn ghost danger-btn" data-fpact="delete">Delete</button>';
      } else if (sel.type === "prop"){
        var names = castNames();
        html = '<div class="fp-insp-h">' + esc(propTip(item.kind)) + '</div>' +
          '<label class="fld"><span>Label</span><input data-fpl value="' + esc(item.label || "") + '" placeholder="' + (item.kind === "actor" || item.kind === "extra" ? "Character" : "e.g. 2K fresnel") + '" autocomplete="off"' +
            (names.length ? ' list="fpCastNames"' : "") + '></label>' +
          (names.length ? '<datalist id="fpCastNames">' + names.map(function(n){ return '<option value="' + esc(n) + '"></option>'; }).join("") + '</datalist>' : "") +
          variantHTML(item) +
          '<label class="fld"><span>Size</span><input type="range" min="30" max="300" step="5" value="' + Math.round((item.sc == null ? 1 : item.sc) * 100) + '" data-fpr="sc"></label>' +
          '<button type="button" class="btn ghost danger-btn" data-fpact="delete">Delete</button>';
      } else if (sel.type === "shape" && item.kind === "text"){
        html = '<div class="fp-insp-h">Text</div><label class="fld"><span>Text</span><input data-fpl value="' + esc(item.text || "") + '" autocomplete="off"></label>' +
          '<button type="button" class="btn ghost danger-btn" data-fpact="delete">Delete</button>';
      } else {
        html = '<div class="fp-insp-h">' + (sel.type === "wall" ? "Wall" : ({ rect: "Rectangle", ellipse: "Ellipse", line: "Line", arrow: "Arrow", brush: "Drawing" }[item.kind] || "Shape")) + '</div>' +
          (item.kind === "line" || item.kind === "arrow" ? '<p class="fp-hint">Drag the middle handle to bend it; double-click it to straighten.</p>' : "") +
          '<button type="button" class="btn ghost danger-btn" data-fpact="delete">Delete</button>';
      }
    } else {
      html = '<div class="fp-insp-h">Nothing selected</div>' +
        '<p class="fp-hint">Walls, doors, windows and shapes belong to the location, so every scene there shares them. Cameras and props belong to this scene.</p>' +
        '<p class="fp-hint">Every shot gets a camera; its cone follows the lens in the shot list.</p>';
    }
    box.innerHTML = html;
  }
  function variantHTML(item){
    var v = FP.floorplanProps.VARIANTS[item.kind];
    if (!v) return "";
    var cur = FP.floorplanProps.variant(item);
    return '<div class="fld"><span>' + esc(v.label) + '</span><div class="seg fp-var">' + v.options.map(function(o){
      return '<button type="button" data-fpvar="' + esc(o[0]) + '" aria-pressed="' + (o[0] === cur) + '"' + (o[0] === cur ? ' class="on"' : "") + '>' + esc(o[1]) + '</button>';
    }).join("") + '</div></div>';
  }
  function setVariant(i, val){
    change(function(){ var x = props()[i], v = x && FP.floorplanProps.VARIANTS[x.kind]; if (v) x[v.key] = val; });
  }
  function propTip(kind){
    for (var g = 0; g < TOOLS.length; g++) for (var i = 0; i < TOOLS[g].items.length; i++) if (TOOLS[g].items[i].p === kind) return TOOLS[g].items[i].tip;
    return "Prop";
  }
  function castNames(){
    var seen = {}, out = [];
    var p = P();
    p.callsheet.cast.forEach(function(c){ [c.character, c.actor].forEach(function(n){ n = (n || "").trim(); if (n && !seen[n.toLowerCase()]){ seen[n.toLowerCase()] = 1; out.push(n); } }); });
    p.cast.forEach(function(n){ n = (n || "").trim(); if (n && !seen[n.toLowerCase()]){ seen[n.toLowerCase()] = 1; out.push(n); } });
    return out;
  }

  // ---------- the page ----------
  function locOptions(){
    var locs = namedLocations();
    return locs.map(function(l){ return '<option value="' + esc(l.id) + '"' + (l.id === locId ? " selected" : "") + '>' + esc(l.name) + '</option>'; }).join("");
  }
  function sceneOptions(){
    var loc = namedLocations().filter(function(l){ return l.id === locId; })[0], n = loc ? norm(loc.name) : "";
    var here = [], other = [];
    P().scenes.forEach(function(sc){ (norm(sceneLoc(sc)) === n ? here : other).push(sc); });
    var o = function(sc){ return '<option value="' + esc(sc.id) + '"' + (sc.id === sceneId ? " selected" : "") + '>Sc ' + esc(sc.num) + ' · ' + esc(sc.name || "Untitled") + '</option>'; };
    return (here.length ? '<optgroup label="At this location">' + here.map(o).join("") + '</optgroup>' : "") +
      (other.length ? '<optgroup label="' + (here.length ? "Other scenes" : "No scene is set here yet") + '">' + other.map(o).join("") + '</optgroup>' : "");
  }
  function pickDefaults(){
    var p = P(), locs = namedLocations();
    if (!locs.some(function(l){ return l.id === locId; })) locId = locs[0] ? locs[0].id : "";
    if (!p.scenes.some(function(s){ return s.id === sceneId; })){
      var loc = locs.filter(function(l){ return l.id === locId; })[0];
      var at = loc && p.scenes.filter(function(s){ return norm(sceneLoc(s)) === norm(loc.name); })[0];
      sceneId = at ? at.id : (p.scenes[0] ? p.scenes[0].id : "");
    }
  }
  // groups fold away; which ones are folded is remembered on this device
  var folded = {};
  try { folded = JSON.parse(localStorage.getItem("fp.fpFolded") || "{}") || {}; } catch (err){ folded = {}; }
  function saveFolded(){ try { localStorage.setItem("fp.fpFolded", JSON.stringify(folded)); } catch (err){} }
  function toolbarHTML(){
    return TOOLS.map(function(g){
      var shut = !!folded[g.group] && !g.items.some(function(it){ return it.p ? (tool === "prop" && propKind === it.p) : tool === it.t; });
      return '<button type="button" class="fp-tlabel" data-fpgroup="' + esc(g.group) + '" aria-expanded="' + !shut + '">' + esc(g.group) +
        '<span class="car" aria-hidden="true">▾</span></button><div class="fp-tgroup' + (shut ? " shut" : "") + '">' + g.items.map(function(it){
        var on = it.p ? (tool === "prop" && propKind === it.p) : tool === it.t;
        return '<button type="button" class="fp-tool' + (on ? " active" : "") + '" ' + (it.p ? 'data-fpprop="' + it.p + '"' : 'data-fptool="' + it.t + '"') +
          ' aria-label="' + esc(it.tip) + '" aria-pressed="' + on + '" data-tip="' + esc(it.tip) + '">' +
          '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + it.svg + '</svg></button>';
      }).join("") + '</div>';
    }).join("");
  }
  function shotTableHTML(){
    var rows = shotRows();
    if (!sceneId) return "";
    if (!rows.length) return '<p class="muted-note pad">No shots in this scene yet. Add them in the shot list and a camera appears on the plan.</p>';
    return '<table class="ftable fp-shots"><thead><tr><th>Shot</th><th>Size</th><th>Lens</th><th>Grip</th><th>Movement</th><th>Action</th></tr></thead><tbody>' +
      rows.map(function(r){
        return '<tr><td class="num-strong">' + esc(r.label) + '</td><td>' + esc(r.shot.size) + '</td><td>' + esc(lensLabel(r.shot.lens)) + '</td><td>' + esc(r.shot.grip) + '</td>' +
          '<td>' + esc(r.shot.movement) + '</td><td class="soft">' + esc(r.shot.action) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }
  function render(host){
    H = host;
    pickDefaults();
    var p = P();
    if (!namedLocations().length){
      host.innerHTML = '<div class="workwindow floorplan"><div class="pg-toolbar"><div class="left"><h3>Floor plan</h3></div></div>' +
        '<div class="sl-empty"><p>A floor plan belongs to a location. Add a location first (or generate them from the script), then draw it here.</p>' +
        '<button type="button" class="btn solid" data-fpact="to-locations">Go to Locations</button></div></div>';
      host.querySelector('[data-fpact="to-locations"]').addEventListener("click", function(){ FP.showPage("locations"); });
      return;
    }
    syncCams();
    host.innerHTML = '<div class="workwindow floorplan">' +
      '<div class="pg-toolbar"><div class="left"><h3>Floor plan</h3>' +
        '<label class="fp-pick"><span>Location</span><select class="cell-sel boxed" data-fpsel="loc">' + locOptions() + '</select></label>' +
        '<label class="fp-pick"><span>Scene</span><select class="cell-sel boxed" data-fpsel="scene">' + (sceneOptions() || '<option value="">No scenes yet</option>') + '</select></label></div>' +
        '<div class="right"><label class="sc-toggle" title="Walls, openings and shapes can\'t be selected while the set is locked"><input type="checkbox" data-fplock' + (lockSet ? " checked" : "") + '> Lock set</label></div></div>' +
      '<div class="fp-stagebar" data-fp-stages hidden></div>' +
      '<div class="fp-workspace">' +
        '<div class="fp-toolbar" role="toolbar" aria-label="Floor plan tools">' + toolbarHTML() + '</div>' +
        '<div class="fp-stage"><svg class="fp-svg tool-' + tool + '" viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="xMidYMid meet" aria-label="Floor plan"></svg>' +
          '<div class="fp-zoom" role="group" aria-label="Zoom"><button type="button" data-fpzoom="out" aria-label="Zoom out" title="Zoom out (−)">−</button>' +
          '<button type="button" data-fpzoom="fit" title="Show the whole plan (0)">100%</button>' +
          '<button type="button" data-fpzoom="in" aria-label="Zoom in" title="Zoom in (+); or pinch, or ⌘/Ctrl-scroll">+</button></div></div>' +
        '<aside class="fp-inspector" data-fp-inspector></aside>' +
      '</div>' +
      '<div class="fp-shotlist">' + shotTableHTML() + '</div>' +
    '</div>';
    svg = host.querySelector(".fp-svg");
    applyView();
    draw();
    bindSvg();
    if (!host.__fpBound){ host.__fpBound = true; bindHost(host); }
    void p;
  }
  function setTool(t, kind){
    closeText();
    tool = t;
    if (kind) propKind = kind;
    if (t !== "select"){ sel = null; multi = []; }
    H.querySelectorAll(".fp-tool").forEach(function(b){
      var on = kind ? b.getAttribute("data-fpprop") === kind : b.getAttribute("data-fptool") === t;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    svg.setAttribute("class", "fp-svg tool-" + t);
    draw();
  }

  // ---------- pointer ----------
  function onDown(e){
    if (e.button === 1 || (spaceDown && e.button === 0)){
      e.preventDefault();
      drag = { mode: "pan", sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button != null && e.button !== 0) return;
    if (playT != null) return;
    closeText();
    var p = point(e), hit = e.target.closest ? e.target.closest("[data-type]") : null;
    if (moveTo){
      // mark the spot, then ask which stage the item is there in (the menu opens once the click
      // is over, so that click doesn't close it again)
      var mv = moveTo, spot = { x: snap(p.x), y: snap(p.y) }, cx = e.clientX, cy = e.clientY;
      moveTo = null; pendingSpot = spot; sel = { type: mv.type, i: mv.i }; multi = [];
      draw();
      window.addEventListener("pointerup", function(){ setTimeout(function(){ chooseStage(mv, spot, cx, cy); }, 0); }, { once: true });
      return;
    }
    pendingSpot = null;
    var type = hit && hit.getAttribute("data-type"), idx = hit ? +hit.getAttribute("data-i") : -1;
    if (tool === "eraser"){
      if (hit && type !== "rot" && type !== "proprot" && type !== "shapept" && type !== "shapectrl" && selectable(type)){
        sel = { type: type, i: idx }; multi = []; deleteSelected();
      }
      return;
    }
    if (tool === "wall"){
      begin();
      drag = { mode: "newwall", x1: snap(p.x), y1: snap(p.y), x2: snap(p.x), y2: snap(p.y) };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "text"){
      e.preventDefault();
      var ti;
      change(function(){ shapes(true).push({ kind: "text", x1: snap(p.x), y1: snap(p.y), text: "" }); ti = shapes().length - 1; });
      sel = { type: "shape", i: ti };
      setTool("select");
      setTimeout(function(){ editText(ti, true); }, 0);
      return;
    }
    if (["rect", "ellipse", "line", "arrow", "brush"].indexOf(tool) !== -1){
      begin();
      var sx = tool === "brush" ? p.x : snap(p.x), sy = tool === "brush" ? p.y : snap(p.y);
      drag = { mode: "newshape", shape: tool === "brush" ? { kind: "brush", d: "M" + sx.toFixed(1) + "," + sy.toFixed(1) } : { kind: tool, x1: sx, y1: sy, x2: sx, y2: sy } };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "prop"){
      if (!sceneId){ FP.toast("Pick a scene to put the prop in."); return; }
      var pi;
      change(function(){ props(true).push({ kind: propKind, x: snap(p.x), y: snap(p.y), rot: 0, label: "" }); pi = props().length - 1; });
      sel = { type: "prop", i: pi };
      setTool("select");
      return;
    }
    if (tool === "door" || tool === "window"){
      var best = null, bestT = 0, bestD = Infinity;
      walls().forEach(function(w){
        var t = projectOnWall(w, p.x, p.y), px = w.x1 + (w.x2 - w.x1) * t, py = w.y1 + (w.y2 - w.y1) * t, d = Math.hypot(p.x - px, p.y - py);
        if (d < bestD){ bestD = d; best = w; bestT = t; }
      });
      if (!best || bestD > 30){ FP.toast("Click on a wall to place a " + tool + "."); return; }
      var kind = tool, di;
      change(function(){ doors(true).push({ wall: best.id, t: bestT, width: 60, kind: kind }); di = doors().length - 1; });
      sel = { type: "door", i: di };
      setTool("select");
      return;
    }
    // the select tool
    if (hit && !selectable(type)) hit = null, type = null;
    if (type === "pathctrl" && sel){
      // the plan redraws between clicks, so a double-click is caught here rather than by the browser
      var pk = +hit.getAttribute("data-k"), now = Date.now();
      if (lastPathTap && lastPathTap.k === pk && lastPathTap.i === sel.i && now - lastPathTap.t < 400){
        lastPathTap = null;
        var st = sel.type, si = sel.i;
        change(function(){ var b = listFor(st)[si]; if (b && b.keys && b.keys[pk]) delete b.keys[pk].c; });
        return;
      }
      lastPathTap = { k: pk, i: sel.i, t: now };
      begin(); drag = { mode: "pathctrl", k: pk }; svg.setPointerCapture(e.pointerId); return;
    }
    if (type === "shapept" || type === "shapectrl"){
      begin(); drag = { mode: type, i: idx, pt: hit.getAttribute("data-pt") }; svg.setPointerCapture(e.pointerId); return;
    }
    if (hit && multi.length && multi.some(function(m){ return m.type === type && m.i === idx; })){
      begin(); drag = { mode: "movemulti", ox: p.x, oy: p.y, last: { x: 0, y: 0 } }; svg.setPointerCapture(e.pointerId); return;
    }
    if (type === "rot" || type === "proprot"){
      begin(); drag = { mode: type, i: idx }; svg.setPointerCapture(e.pointerId); return;
    }
    if (hit){
      sel = { type: type, i: idx }; multi = [];
      var it = listFor(type)[idx];
      begin();
      if (type === "cam" || type === "prop"){ var q0 = pose(it); drag = { mode: "move", dx: p.x - q0.x, dy: p.y - q0.y }; }
      else if (type === "door") drag = { mode: "movedoor" };
      else drag = { mode: "shift", ox: p.x, oy: p.y, orig: FP.clone(it) };
      svg.setPointerCapture(e.pointerId);
      draw();
      return;
    }
    sel = null; multi = [];
    drag = { mode: "marquee", x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    svg.setPointerCapture(e.pointerId);
    draw();
  }
  function shiftItem(type, it, dx, dy){
    if (type === "door") return;   // doors ride along with their wall
    if (type === "cam" || type === "prop"){ var q = pose(it); setPose(it, { x: q.x + dx, y: q.y + dy }); return; }
    if (it.kind === "brush"){
      it.d = it.d.replace(/(-?[\d.]+),(-?[\d.]+)/g, function(_, a, b){ return (parseFloat(a) + dx).toFixed(1) + "," + (parseFloat(b) + dy).toFixed(1); });
      return;
    }
    it.x1 += dx; it.y1 += dy;
    if (it.x2 != null){ it.x2 += dx; it.y2 += dy; }
    if (it.cx != null){ it.cx += dx; it.cy += dy; }
  }
  function onMove(e){
    if (!drag) return;
    if (drag.mode === "pan"){
      var r = svg.getBoundingClientRect(), u = Math.max(W / r.width, Hh / r.height) / view.z;
      view.cx = drag.cx - (e.clientX - drag.sx) * u; view.cy = drag.cy - (e.clientY - drag.sy) * u;
      applyView();
      return;
    }
    var p = point(e), it;
    if (drag.mode === "marquee"){ drag.x2 = p.x; drag.y2 = p.y; }
    else if (drag.mode === "newwall"){ drag.x2 = snap(p.x); drag.y2 = snap(p.y); }
    else if (drag.mode === "newshape"){
      if (drag.shape.kind === "brush") drag.shape.d += " L" + p.x.toFixed(1) + "," + p.y.toFixed(1);
      else { drag.shape.x2 = snap(p.x); drag.shape.y2 = snap(p.y); }
    } else if (drag.mode === "movemulti"){
      var gx = snap(p.x - drag.ox), gy = snap(p.y - drag.oy), ddx = gx - drag.last.x, ddy = gy - drag.last.y;
      if (ddx || ddy){ multi.forEach(function(m){ var x = listFor(m.type)[m.i]; if (x) shiftItem(m.type, x, ddx, ddy); }); drag.last = { x: gx, y: gy }; }
    } else if (drag.mode === "move"){
      it = listFor(sel.type)[sel.i];
      if (it) setPose(it, { x: snap(p.x - drag.dx), y: snap(p.y - drag.dy) });
    } else if (drag.mode === "shift"){
      it = listFor(sel.type)[sel.i];
      var o = drag.orig, mdx = snap(p.x - drag.ox), mdy = snap(p.y - drag.oy);
      if (it){
        var fresh = FP.clone(o);
        shiftItem(sel.type, fresh, mdx, mdy);
        Object.keys(fresh).forEach(function(k){ it[k] = fresh[k]; });
      }
    } else if (drag.mode === "movedoor"){
      it = doors()[sel.i];
      var dw = it && wallById(it.wall);
      if (dw) it.t = projectOnWall(dw, p.x, p.y);
    } else if (drag.mode === "shapept"){
      it = shapes()[drag.i];
      if (it){ if (drag.pt === "1"){ it.x1 = snap(p.x); it.y1 = snap(p.y); } else { it.x2 = snap(p.x); it.y2 = snap(p.y); } }
    } else if (drag.mode === "pathctrl"){
      it = listFor(sel.type)[sel.i];
      if (it && it.keys && it.keys[drag.k]){
        var b0 = poseAt(it, drag.k - 1), b1 = poseAt(it, drag.k);
        it.keys[drag.k].c = { x: Math.round(2 * p.x - (b0.x + b1.x) / 2), y: Math.round(2 * p.y - (b0.y + b1.y) / 2) };
      }
    } else if (drag.mode === "shapectrl"){
      it = shapes()[drag.i];
      if (it){ it.cx = snap(p.x); it.cy = snap(p.y); }
    } else if (drag.mode === "rot" || drag.mode === "proprot"){
      it = (drag.mode === "rot" ? cams() : props())[drag.i];
      if (it){ var qr = pose(it), a = Math.atan2(p.y - qr.y, p.x - qr.x) * 180 / Math.PI + 90; setPose(it, { rot: Math.round(((a % 360) + 360) % 360 / 5) * 5 }); }
    }
    svg.innerHTML = svgHTML();
  }
  function onUp(){
    if (!drag) return;
    var d = drag;
    drag = null;
    if (d.mode === "pan") return;
    if (d.mode === "marquee"){
      var x0 = Math.min(d.x1, d.x2), x1 = Math.max(d.x1, d.x2), y0 = Math.min(d.y1, d.y2), y1 = Math.max(d.y1, d.y2);
      multi = [];
      if (x1 - x0 > 4 && y1 - y0 > 4){
        var ids = liveShots();
        [["wall", walls()], ["door", doors()], ["shape", shapes()], ["prop", props()], ["cam", cams()]].forEach(function(pair){
          if (!selectable(pair[0])) return;
          pair[1].forEach(function(it, i){
            if (pair[0] === "cam" && !ids[it.shotId]) return;
            var a = anchor(pair[0], it);
            if (a && a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) multi.push({ type: pair[0], i: i });
          });
        });
        if (multi.length === 1){ sel = multi[0]; multi = []; }
      }
      draw();
      return;
    }
    if (d.mode === "newwall"){
      if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) >= GRID) walls(true).push({ id: FP.uid("w"), x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 });
    } else if (d.mode === "newshape"){
      var g = d.shape;
      if (g.kind === "brush" ? g.d.indexOf("L") !== -1 : Math.hypot(g.x2 - g.x1, g.y2 - g.y1) >= GRID) shapes(true).push(g);
    }
    end();
  }
  function anchor(type, it){
    if (type === "wall") return { x: (it.x1 + it.x2) / 2, y: (it.y1 + it.y2) / 2 };
    if (type === "door"){ var g = doorGeom(it); return g && { x: g.cx, y: g.cy }; }
    if (type === "prop" || type === "cam"){ var q = pose(it); return { x: q.x, y: q.y }; }
    if (it.kind === "brush"){ var m = /M(-?[\d.]+),(-?[\d.]+)/.exec(it.d); return m && { x: +m[1], y: +m[2] }; }
    if (it.kind === "text") return { x: it.x1, y: it.y1 };
    return { x: (it.x1 + it.x2) / 2, y: (it.y1 + it.y2) / 2 };
  }

  function deleteSelected(){
    var items = multi.length ? multi.slice() : (sel ? [sel] : []);
    if (!items.length) return;
    var order = { shape: 0, prop: 1, cam: 2, door: 3, wall: 4 };
    var shotDel = items.some(function(m){ return m.type === "cam"; });
    change(function(){
      items.sort(function(a, b){ return (order[a.type] - order[b.type]) || (b.i - a.i); }).forEach(function(m){
        var l = listFor(m.type);
        if (m.type === "wall"){
          var gone = l[m.i];
          l.splice(m.i, 1);
          if (gone) fp().doors[locId] = doors().filter(function(dd){ return dd.wall !== gone.id; });
        } else if (m.type === "cam"){
          // a shot always has a camera; deleting it puts it back at the edge
          l.splice(m.i, 1);
        } else l.splice(m.i, 1);
      });
    });
    sel = null; multi = [];
    if (shotDel) FP.toast("The camera goes back to the edge: every shot keeps one.");
    draw();
  }

  // ---------- text typed onto the plan ----------
  function editText(i, fresh){
    var sh = shapes()[i];
    if (!sh || sh.kind !== "text") return;
    var stage = svg.parentNode, ctm = svg.getScreenCTM();
    if (!ctm) return;
    var pt = svg.createSVGPoint();
    pt.x = sh.x1; pt.y = sh.y1;
    var scr = pt.matrixTransform(ctm), sr = stage.getBoundingClientRect(), k = ctm.a;
    var inp = document.createElement("input");
    inp.className = "fp-text-edit";
    inp.value = sh.text || "";
    inp.placeholder = "Type…";
    inp.style.left = (scr.x - sr.left - 5) + "px";
    inp.style.top = (scr.y - sr.top - 16 * k) + "px";
    inp.style.fontSize = (15 * k) + "px";
    stage.appendChild(inp);
    begin();
    textEdit = { el: inp, i: i, fresh: fresh, opened: Date.now() };
    inp.addEventListener("input", function(){ sh.text = inp.value; svg.innerHTML = svgHTML(); });
    inp.addEventListener("keydown", function(ev){
      if (ev.key === "Enter" || ev.key === "Escape"){ ev.preventDefault(); closeText(); }
      ev.stopPropagation();
    });
    inp.addEventListener("blur", function(){
      if (textEdit && textEdit.el === inp && !inp.value && Date.now() - textEdit.opened < 400){
        setTimeout(function(){ if (textEdit && textEdit.el === inp) inp.focus(); }, 0);
        return;
      }
      closeText();
    });
    inp.focus();
    inp.select();
  }
  function closeText(){
    if (!textEdit) return;
    var t = textEdit;
    textEdit = null;
    var sh = shapes()[t.i];
    if (sh && sh.kind === "text" && !String(sh.text || "").trim()){
      shapes().splice(t.i, 1);
      if (sel && sel.type === "shape" && sel.i === t.i) sel = null;
    }
    if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
    end();
  }

  // ---------- events ----------
  function bindSvg(){
    svg.addEventListener("pointerdown", onDown);
    // pinch or Ctrl/⌘-scroll zooms at the pointer; when zoomed in, plain scrolling pans
    svg.addEventListener("wheel", function(e){
      if (e.ctrlKey || e.metaKey){
        e.preventDefault();
        var p = point(e);
        zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)), p.x, p.y);
      } else if (view.z > 1){
        var r = svg.getBoundingClientRect(), u = Math.max(W / r.width, Hh / r.height) / view.z;
        var before = view.cx + "," + view.cy;
        view.cx += e.deltaX * u; view.cy += e.deltaY * u;
        applyView();
        if (before !== view.cx + "," + view.cy) e.preventDefault();
      }
    }, { passive: false });
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", function(){ drag = null; if (live){ P().floorplan = live; live = null; } draw(); });
    svg.addEventListener("dblclick", function(e){
      var t = e.target.closest && e.target.closest("[data-type]");
      if (!t) return;
      var i = +t.getAttribute("data-i"), type = t.getAttribute("data-type");
      if (type === "shapectrl") change(function(){ var b = shapes()[i]; if (b){ delete b.cx; delete b.cy; } });
      else if (type === "pathctrl" && sel){ var kk = +t.getAttribute("data-k"), st = sel.type;
        change(function(){ var b = listFor(st)[i]; if (b && b.keys && b.keys[kk]) delete b.keys[kk].c; }); }
      else if (type === "shape" && shapes()[i] && shapes()[i].kind === "text"){ sel = { type: "shape", i: i }; draw(); editText(i); }
    });
    // right-click a person to name them from the cast
    svg.addEventListener("contextmenu", function(e){
      if (playT != null) return;
      var g = e.target.closest && e.target.closest(".fp-prop, .fp-cam");
      if (!g) return;
      var isCam = g.classList.contains("fp-cam"), type = isCam ? "cam" : "prop";
      var i = +g.getAttribute("data-i"), pr = listFor(type)[i];
      if (!pr) return;
      var v = !isCam && FP.floorplanProps.VARIANTS[pr.kind], human = !isCam && (pr.kind === "actor" || pr.kind === "extra");
      e.preventDefault();
      var anchorEl = document.createElement("span");
      anchorEl.style.cssText = "position:fixed;left:" + e.clientX + "px;top:" + e.clientY + "px;width:0;height:0";
      document.body.appendChild(anchorEl);
      var items = [];
      items.push({ label: "Move to", onClick: function(){
        moveTo = { type: type, i: i }; sel = { type: type, i: i }; multi = [];
        draw();
      } });
      if (stage > 1 && pr.keys && pr.keys[stage]) items.push({ label: "Stay where it was in stage " + (stage - 1), onClick: function(){
        change(function(){ var x = listFor(type)[i]; if (x && x.keys){ delete x.keys[stage]; if (!Object.keys(x.keys).length) delete x.keys; } });
      } });
      if (v){
        var cur = FP.floorplanProps.variant(pr);
        items.push("sep", { heading: v.label });
        v.options.forEach(function(o){ items.push({ label: o[1], current: o[0] === cur, onClick: function(){ setVariant(i, o[0]); } }); });
      }
      if (human){
        var names = castNames();
        items.push("sep");
        items = items.concat(names.length ? [{ heading: "Name this person" }].concat(names.map(function(n){
          return { label: n, onClick: function(){ change(function(){ var x = props()[i]; if (x) x.label = n; }); } };
        })) : [{ label: "No cast yet: add them on the Cast and crew page", disabled: true }]);
        if (pr.label) items.push("sep", { label: "Clear name", onClick: function(){ change(function(){ var x = props()[i]; if (x) x.label = ""; }); } });
      }
      FP.openMenu(anchorEl, items);
      anchorEl.remove();
    });
  }
  function bindHost(host){
    host.addEventListener("click", function(e){
      var b = e.target.closest("button");
      if (!b || !host.contains(b)) return;
      if (b.hasAttribute("data-fpgroup")){
        var gname = b.getAttribute("data-fpgroup"), open = b.getAttribute("aria-expanded") !== "true";
        b.setAttribute("aria-expanded", open ? "true" : "false");
        b.nextElementSibling.classList.toggle("shut", !open);
        if (open) delete folded[gname]; else folded[gname] = true;
        saveFolded();
        return;
      }
      if (b.hasAttribute("data-fptool")) setTool(b.getAttribute("data-fptool"));
      else if (b.hasAttribute("data-fpprop")) setTool("prop", b.getAttribute("data-fpprop"));
      if (b.hasAttribute("data-fpzoom")){
        var zk = b.getAttribute("data-fpzoom");
        if (zk === "fit"){ view = { z: 1, cx: W / 2, cy: Hh / 2 }; applyView(); } else zoomAt(zk === "in" ? 1.4 : 1 / 1.4);
        return;
      }
      if (b.hasAttribute("data-fpstage")){ if (playT != null) stopPlay(); stage = +b.getAttribute("data-fpstage"); moveTo = null; draw(); return; }
      if (b.getAttribute("data-fpact") === "add-stage"){ if (playT != null) stopPlay(); moveTo = null; addStage(); return; }
      if (b.getAttribute("data-fpact") === "del-stage"){ moveTo = null; removeStage(stage); return; }
      if (b.getAttribute("data-fpact") === "play"){ play(); return; }
      if (b.hasAttribute("data-fpvar") && sel && sel.type === "prop"){ setVariant(sel.i, b.getAttribute("data-fpvar")); return; }
      var act = b.getAttribute("data-fpact");
      if (act === "delete") deleteSelected();
      else if (act === "hinge" || act === "swing") change(function(){ var d = doors()[sel.i]; if (d) d[act] = !d[act]; });
      else if (act === "fov-auto") change(function(){ var c = cams()[sel.i]; if (c) c.fovAuto = true; });
    });
    host.addEventListener("change", function(e){
      var t = e.target;
      if (t.getAttribute("data-fpsel") === "loc"){ locId = t.value; sceneId = ""; sel = null; multi = []; stage = 1; moveTo = null; view = { z: 1, cx: W / 2, cy: Hh / 2 }; render(host); }
      else if (t.getAttribute("data-fpsel") === "scene"){ sceneId = t.value; sel = null; multi = []; stage = 1; moveTo = null; render(host); }
      else if (t.hasAttribute("data-fplock")){
        lockSet = t.checked;
        if (lockSet){ multi = multi.filter(function(m){ return !isSet(m.type); }); if (sel && isSet(sel.type)) sel = null; }
        draw();
      } else if (t.hasAttribute("data-fpr") || t.hasAttribute("data-fpl")){
        end();
      }
    });
    // sliders and the label field edit live; leaving them commits one undo step
    host.addEventListener("input", function(e){
      var t = e.target;
      if (!sel || !(t.hasAttribute("data-fpr") || t.hasAttribute("data-fpl"))) return;
      var it = listFor(sel.type)[sel.i];
      if (!it) return;
      begin();
      if (t.hasAttribute("data-fpl")){ if (it.kind === "text") it.text = t.value; else it.label = t.value; }
      else {
        var k = t.getAttribute("data-fpr"), v = +t.value;
        if (k === "sc") it.sc = v / 100;
        else { it[k] = v; if (k === "fov") it.fovAuto = false; }
        var lab = t.closest(".fld").querySelector("span");
        if (k === "fov" && lab) lab.textContent = "Angle of view, " + v + "°";
      }
      svg.innerHTML = svgHTML();
    });
  }
  document.addEventListener("keydown", function(e){
    if (!H || FP.currentPage() !== "floorplan") return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Backspace" || e.key === "Delete"){ if (sel || multi.length){ e.preventDefault(); deleteSelected(); } }
    else if (e.key === "Escape"){ if (playT != null) stopPlay(); moveTo = null; pendingSpot = null; sel = null; multi = []; setTool("select"); }
    else if (e.key === "v" || e.key === "V") setTool("select");
    else if (e.key === "+" || e.key === "="){ zoomAt(1.4); }
    else if (e.key === "-" || e.key === "_"){ zoomAt(1 / 1.4); }
    else if (e.key === "0"){ view = { z: 1, cx: W / 2, cy: Hh / 2 }; applyView(); }
    else if (e.key === " "){ e.preventDefault(); if (!spaceDown){ spaceDown = true; if (svg) svg.classList.add("panning"); } }
    else if (e.key === "e" || e.key === "E") setTool("eraser");
    else if (e.key === "w" || e.key === "W") setTool("wall");
    else if (e.key === "t" || e.key === "T") setTool("text");
  });

  document.addEventListener("keyup", function(e){
    if (e.key === " " && spaceDown){ spaceDown = false; if (svg) svg.classList.remove("panning"); }
  });

  FP.pages.floorplan = {
    render: function(host){ render(host); },
    update: function(host){
      if (!H) return;
      if (live) return;               // a gesture is under way; it redraws itself
      // structural changes elsewhere (a location renamed, a shot added) rebuild the page
      var y = window.scrollY;
      render(host);
      window.scrollTo(0, y);
    },
    leave: function(){ if (playRaf) cancelAnimationFrame(playRaf); playRaf = 0; playT = null; moveTo = null; closeText(); if (live){ P().floorplan = live; live = null; } drag = null; H = null; svg = null; },
    show: function(loc, scn){ if (loc) locId = loc; if (scn) sceneId = scn; FP.showPage("floorplan"); }
  };
})();
