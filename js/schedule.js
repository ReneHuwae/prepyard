/* Schedule page, Rev. 08: one block per shooting day. Each day runs from its call time
   through scene bands, shot rows (prep + shoot minutes) and breaks, so every row knows
   when it starts and the day knows when it wraps. New scenes and shots arrive on day 1
   by themselves; from there you drag them, or send them to another day from their menu. */
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

  var DEFAULT_PREP = 10, DEFAULT_SHOOT = 20, STEP = 5;
  var BREAKS = [
    { label: "LUNCH", mins: 30, text: "Lunch" },
    { label: "TRAVEL", mins: 30, text: "Travel" },
    { label: "BREAK", mins: 15, text: "Break" },
    { label: "PREP", mins: 30, text: "Prep" },
    { label: "BREAKFAST CALL", mins: 15, text: "Breakfast call" }
  ];
  var SCENES_ONLY_KEY = "filmprep:schedScenesOnly";
  var scenesOnly = lsGet(SCENES_ONLY_KEY) === "1";

  var H = null;
  var selfTyping = false;

  // ---------- reading the project ----------
  function index(p){
    var scenes = {}, shots = {};
    p.scenes.forEach(function(sc){
      var labels = FP.shotNumbers(sc);
      scenes[sc.id] = sc;
      sc.shots.forEach(function(sh, i){ shots[sh.id] = { shot: sh, scene: sc, label: labels[i].label }; });
    });
    return { scenes: scenes, shots: shots };
  }
  // A row for a scene or shot that's been deleted stays in the model, so undoing the
  // delete brings its minutes back; it just isn't shown or counted.
  function live(ix, r){
    if (r.type === "scene") return !!ix.scenes[r.sceneId];
    if (r.type === "shot") return !!ix.shots[r.shotId];
    return true;
  }
  function pruneStale(p){
    var ix = index(p);
    p.schedule.days.forEach(function(d){ d.rows = d.rows.filter(function(r){ return live(ix, r); }); });
  }

  // Every scene and shot gets a row: new scenes go to day 1 ahead of its first break,
  // new shots go under their own scene. Returns true when anything was added.
  function sync(p){
    var days = p.schedule.days;
    if (!days.length) return false;
    var ix = index(p), changed = false;
    var haveScene = {}, haveShot = {};
    days.forEach(function(d){
      d.rows.forEach(function(r){
        if (r.type === "scene" && !r.sceneId && r.scene){
          var hit = p.scenes.filter(function(s){ return s.num.trim() === r.scene.trim(); })[0];
          if (hit && !haveScene[hit.id]){ r.sceneId = hit.id; changed = true; }
        }
        if (r.type === "scene" && r.sceneId) haveScene[r.sceneId] = true;
        if (r.type === "shot") haveShot[r.shotId] = true;
      });
    });
    p.scenes.forEach(function(sc){
      if (!haveScene[sc.id]){
        var d1 = days[0].rows, at = d1.findIndex(function(r){ return r.type === "break"; });
        var row = { id: FP.uid("r"), type: "scene", sceneId: sc.id, scene: sc.num, done: false };
        if (at === -1) d1.push(row); else d1.splice(at, 0, row);
        haveScene[sc.id] = true;
        changed = true;
      }
      sc.shots.forEach(function(sh){
        if (haveShot[sh.id]) return;
        // after the last row of this scene's block, in the day that holds its band
        var day = null, pos = -1;
        days.forEach(function(d){
          d.rows.forEach(function(r, i){ if (r.type === "scene" && r.sceneId === sc.id){ day = d; pos = i; } });
        });
        var j = pos + 1;
        while (j < day.rows.length && day.rows[j].type === "shot" && (!ix.shots[day.rows[j].shotId] || ix.shots[day.rows[j].shotId].scene.id === sc.id)) j++;
        day.rows.splice(j, 0, { id: FP.uid("r"), type: "shot", shotId: sh.id, prep: DEFAULT_PREP, shoot: DEFAULT_SHOOT });
        haveShot[sh.id] = true;
        changed = true;
      });
    });
    return changed;
  }

  function minsOf(hhmm){
    var m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
    return m ? (+m[1]) * 60 + (+m[2]) : 6 * 60;
  }
  function clock(mins){
    var t = ((Math.round(mins) % 1440) + 1440) % 1440;
    var h = Math.floor(t / 60), m = t % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  function hrs(mins){ return (mins / 60).toFixed(1); }
  function rowMins(r){ return r.type === "shot" ? (r.prep || 0) + (r.shoot || 0) : r.type === "break" ? (r.mins || 0) : 0; }

  // start time of every live row, the minutes in each scene's block, and the day's wrap
  function timing(day, ix){
    var start = minsOf(day.call), cur = start, at = {}, sceneMins = {}, curScene = null;
    day.rows.forEach(function(r){
      if (!live(ix, r)) return;
      at[r.id] = cur;
      if (r.type === "scene"){ curScene = r.id; sceneMins[r.id] = 0; }
      else if (r.type === "break") curScene = null;
      else if (curScene) sceneMins[curScene] += rowMins(r);
      cur += rowMins(r);
    });
    return { at: at, sceneMins: sceneMins, total: cur - start, wrap: cur };
  }

  // ---------- drawing ----------
  function stepper(rowId, field, v, label){
    return '<span class="mins-stepper"><button type="button" tabindex="-1" data-step="-1" aria-label="Less">−</button>' +
      '<input type="number" min="0" step="' + STEP + '" inputmode="numeric" value="' + esc(v) + '" data-mf="' + field + '" aria-label="' + esc(label) + '">' +
      '<button type="button" tabindex="-1" data-step="1" aria-label="More">+</button></span>';
  }
  function slug(sc){
    var loc = "";
    for (var i = 0; i < sc.shots.length; i++) if (sc.shots[i].location){ loc = sc.shots[i].location; break; }
    return [sc.intext, loc, sc.daynight].filter(Boolean).join(" · ");
  }
  function rowHTML(r, ix, t){
    var time = '<td class="sc-time" data-time>' + clock(t.at[r.id]) + '</td>';
    var grip = '<td class="sc-grip-col"><span class="sc-grip" title="Drag to move" aria-hidden="true">⋮⋮</span></td>';
    var menu = '<td class="sc-act"><button type="button" class="row-menu" data-act="row-menu" aria-label="Row options">⋯</button></td>';
    if (r.type === "scene"){
      var sc = ix.scenes[r.sceneId];
      return '<tr class="sc-scene' + (r.done ? " done" : "") + '" data-row="' + esc(r.id) + '" data-scene-id="' + esc(sc.id) + '">' + grip + time +
        '<td colspan="5" class="sc-head"><label class="sc-done" title="Mark the scene as shot"><input type="checkbox" data-act="done"' + (r.done ? " checked" : "") +
          ' aria-label="Scene ' + esc(sc.num) + ' shot"></label>' +
          '<span class="sc-num">Sc ' + esc(sc.num) + '</span>' +
          '<span class="sc-name">' + esc(sc.name || "Untitled scene") + '</span>' +
          '<span class="sc-meta">' + esc(slug(sc)) + '</span>' +
          (sc.summary ? '<span class="sc-sum">' + esc(sc.summary) + '</span>' : "") +
        '</td>' +
        '<td class="sc-total" data-scene-total>' + hrs(t.sceneMins[r.id] || 0) + '</td>' + menu + '</tr>';
    }
    if (r.type === "shot"){
      var h = ix.shots[r.shotId];
      return '<tr class="sc-shot" data-row="' + esc(r.id) + '" data-scene-id="' + esc(h.scene.id) + '">' + grip + time +
        '<td class="sc-n muted">' + esc(h.scene.num) + '</td>' +
        '<td class="sc-n">' + esc(h.label) + '</td>' +
        '<td class="sc-action">' + (h.shot.action ? esc(h.shot.action) : '<span class="muted">No action yet</span>') + '</td>' +
        '<td>' + stepper(r.id, "prep", r.prep, "Prep minutes, shot " + h.scene.num + "/" + h.label) + '</td>' +
        '<td>' + stepper(r.id, "shoot", r.shoot, "Shoot minutes, shot " + h.scene.num + "/" + h.label) + '</td>' +
        '<td class="sc-total" data-row-total>' + hrs(rowMins(r)) + '</td>' + menu + '</tr>';
    }
    return '<tr class="sc-break" data-row="' + esc(r.id) + '">' + grip + time +
      '<td colspan="3"><input class="sc-label" data-bf="label" value="' + esc(r.label) + '" aria-label="Break name" autocomplete="off"></td>' +
      '<td>' + stepper(r.id, "mins", r.mins, (r.label || "Break") + " minutes") + '</td><td></td>' +
      '<td class="sc-total" data-row-total>' + hrs(rowMins(r)) + '</td>' +
      '<td class="sc-act"><button type="button" class="del-break" data-act="del-break" aria-label="Remove ' + esc(r.label || "break") + '">×</button></td></tr>';
  }
  function dayHTML(p, ix, day, n){
    var t = timing(day, ix);
    var rows = day.rows.filter(function(r){ return live(ix, r); });
    return '<section class="sc-day" data-day="' + esc(day.id) + '">' +
      '<div class="sc-daybar">' +
        '<span class="sc-dayname">Day ' + n + '</span>' +
        '<input type="date" data-df="date" value="' + esc(day.date) + '" aria-label="Day ' + n + ' date">' +
        '<input type="time" data-df="call" value="' + esc(day.call) + '" aria-label="Day ' + n + ' call time">' +
        '<span class="lbl">Call time</span>' +
        '<span class="sc-spacer"></span>' +
        '<button type="button" class="row-menu" data-act="day-menu" aria-label="Day ' + n + ' options">⋯</button>' +
      '</div>' +
      '<div class="sc-table-wrap"><table class="sc">' +
        '<thead><tr><th class="sc-grip-col" aria-label="Drag handle"></th><th>Time</th><th>Scene</th><th>Shot</th><th>Action</th>' +
          '<th class="sc-mins">Prep (min)</th><th class="sc-mins">Shoot (min)</th><th>Hrs</th><th class="sc-act" aria-label="Options"></th></tr></thead>' +
        '<tbody>' + rows.map(function(r){ return rowHTML(r, ix, t); }).join("") +
          (rows.length ? "" : '<tr class="sc-emptyrow"><td colspan="9">Nothing on this day yet. Drag scenes here, or send them from another day\'s row menu.</td></tr>') +
        '</tbody></table></div>' +
      '<div class="sc-adds"><span>Add row:</span>' + BREAKS.map(function(b){
        return '<button type="button" data-act="add-break" data-label="' + esc(b.label) + '" data-mins="' + b.mins + '">' + esc(b.text) + '</button>';
      }).join("") + '</div>' +
      '<div class="sc-totals"><div><div class="k">Day total</div><div class="v" data-day-total>' + hrs(t.total) + ' hrs</div></div>' +
        '<div><div class="k">Est. wrap</div><div class="v" data-day-wrap>' + clock(t.wrap) + '</div></div></div>' +
    '</section>';
  }
  function countText(p){
    var n = p.schedule.days.length;
    return n ? n + (n === 1 ? " shooting day" : " shooting days") : "No shooting days yet";
  }

  function render(host, p){
    H = host;
    host.innerHTML =
      '<div class="workwindow schedule">' +
        '<div class="pg-toolbar">' +
          '<div class="left"><h3>Schedule</h3><span class="count" data-sc="count"></span></div>' +
          '<div class="right">' +
            '<label class="sc-toggle"><input type="checkbox" data-act="scenes-only"' + (scenesOnly ? " checked" : "") + '> Scenes only</label>' +
          '</div>' +
        '</div>' +
        '<div class="sc-body' + (scenesOnly ? " scenes-only" : "") + '" data-sc="body"></div>' +
      '</div>';
    if (sync(p)) FP.quietChange(function(){});
    drawBody(p);
    bind(host);
  }
  function drawBody(p){
    H.querySelector('[data-sc="count"]').textContent = countText(p);
    var body = H.querySelector('[data-sc="body"]');
    if (!p.schedule.days.length){
      body.innerHTML = '<div class="sc-empty"><p>No shooting days yet. Add the first one and every scene and shot lands on it, ' +
        'ready to be timed and split across more days.</p><button type="button" class="btn solid" data-act="add-day">+ Add shooting day</button></div>';
      return;
    }
    var ix = index(p);
    body.innerHTML = p.schedule.days.map(function(d, i){ return dayHTML(p, ix, d, i + 1); }).join("") +
      '<div class="sc-adddays"><button type="button" class="btn ghost" data-act="add-day">+ Add shooting day</button></div>';
  }
  // the times and totals only, so a stepper or a call time can change without a redraw
  function refreshTimes(p){
    var ix = index(p);
    p.schedule.days.forEach(function(day){
      var sec = H.querySelector('.sc-day[data-day="' + day.id + '"]');
      if (!sec) return;
      var t = timing(day, ix);
      day.rows.forEach(function(r){
        var tr = sec.querySelector('tr[data-row="' + r.id + '"]');
        if (!tr) return;
        var tm = tr.querySelector("[data-time]");
        if (tm) tm.textContent = clock(t.at[r.id]);
        var rt = tr.querySelector("[data-row-total]");
        if (rt) rt.textContent = hrs(rowMins(r));
        var st = tr.querySelector("[data-scene-total]");
        if (st) st.textContent = hrs(t.sceneMins[r.id] || 0);
      });
      sec.querySelector("[data-day-total]").textContent = hrs(t.total) + " hrs";
      sec.querySelector("[data-day-wrap]").textContent = clock(t.wrap);
    });
  }
  function redraw(p){
    var a = document.activeElement, keep = null;
    if (a && H.contains(a)){
      var tr = a.closest("tr"), sec = a.closest(".sc-day");
      keep = { row: tr && tr.getAttribute("data-row"), day: sec && sec.getAttribute("data-day"),
        sel: a.hasAttribute("data-mf") ? '[data-mf="' + a.getAttribute("data-mf") + '"]'
          : a.hasAttribute("data-bf") ? '[data-bf="label"]'
          : a.hasAttribute("data-df") ? '[data-df="' + a.getAttribute("data-df") + '"]'
          : a.hasAttribute("data-act") ? '[data-act="' + a.getAttribute("data-act") + '"]' : null };
    }
    drawBody(p);
    if (!keep || !keep.sel) return;
    var scope = keep.row ? H.querySelector('tr[data-row="' + keep.row + '"]') : keep.day ? H.querySelector('.sc-day[data-day="' + keep.day + '"]') : H;
    var el = scope && scope.querySelector(keep.sel);
    if (el) el.focus({ preventScroll: true });
  }

  // ---------- changes ----------
  function change(fn, key){ FP.change(function(p){ pruneStale(p); fn(p); }, key); }
  function typed(fn, key){
    selfTyping = true;
    try { FP.change(fn, key); } finally { selfTyping = false; }
  }
  function findRow(p, rowId){
    for (var i = 0; i < p.schedule.days.length; i++){
      var d = p.schedule.days[i];
      for (var j = 0; j < d.rows.length; j++) if (d.rows[j].id === rowId) return { day: d, row: d.rows[j], index: j, dayIndex: i };
    }
    return null;
  }
  function dayById(p, id){ for (var i = 0; i < p.schedule.days.length; i++) if (p.schedule.days[i].id === id) return p.schedule.days[i]; return null; }
  // a scene band and the shot rows of that scene right under it
  function blockLength(day, at, ix){
    var r = day.rows[at];
    if (r.type !== "scene") return 1;
    var n = 1;
    while (at + n < day.rows.length){
      var x = day.rows[at + n];
      if (x.type !== "shot") break;
      var h = ix.shots[x.shotId];
      if (h && h.scene.id !== r.sceneId) break;
      n++;
    }
    return n;
  }
  function nextDate(iso){
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return "";
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  function addDay(){
    change(function(p){
      var days = p.schedule.days, last = days[days.length - 1];
      days.push({ id: FP.uid("d"), date: last ? nextDate(last.date) : "", call: last ? last.call : "06:00",
        rows: [{ id: FP.uid("r"), type: "break", label: "LUNCH", mins: 30 }] });
      if (days.length === 1) sync(p);
    });
    var secs = H.querySelectorAll(".sc-day");
    var sec = secs[secs.length - 1];
    if (sec && secs.length > 1){
      sec.scrollIntoView({ block: "start", behavior: "smooth" });
      var d = sec.querySelector('[data-df="date"]');
      if (d) d.focus({ preventScroll: true });
    }
  }
  function deleteDay(dayId){
    var moved = 0;
    change(function(p){
      var days = p.schedule.days, i = days.findIndex(function(d){ return d.id === dayId; });
      if (i === -1) return;
      var gone = days.splice(i, 1)[0];
      var keep = gone.rows.filter(function(r){ return r.type !== "break"; });
      moved = keep.filter(function(r){ return r.type === "scene"; }).length;
      if (!days.length) return;
      // its scenes don't vanish from the shoot: they go to the day before (or after)
      var to = days[Math.max(0, i - 1)];
      var trail = to.rows.length;
      while (trail > 0 && to.rows[trail - 1].type === "break") trail--;
      Array.prototype.splice.apply(to.rows, [trail, 0].concat(keep));
    });
    toast(moved ? "Day removed; its scenes moved to the day before. Undo brings it back." : "Day removed. Undo brings it back.");
  }
  // send a row (a scene takes its shots) to the end of another day, above its closing breaks
  function moveToDay(rowId, dayId){
    change(function(p){
      var ix = index(p), hit = findRow(p, rowId), to = dayById(p, dayId);
      if (!hit || !to) return;
      var block = hit.day.rows.splice(hit.index, blockLength(hit.day, hit.index, ix));
      var at = to.rows.length;
      while (at > 0 && to.rows[at - 1].type === "break") at--;
      Array.prototype.splice.apply(to.rows, [at, 0].concat(block));
    });
  }
  function addBreak(dayId, label, mins){
    var id = FP.uid("r");
    change(function(p){
      var d = dayById(p, dayId);
      if (d) d.rows.push({ id: id, type: "break", label: label, mins: mins });
    });
    var inp = H.querySelector('tr[data-row="' + id + '"] [data-bf="label"]');
    if (inp) inp.focus();
  }

  function rowMenu(btn, rowId){
    var p = FP.project(), hit = findRow(p, rowId);
    if (!hit) return;
    var ix = index(p), r = hit.row;
    var items = [{ heading: r.type === "scene" ? "Move scene and its shots to" : "Move shot to" }];
    p.schedule.days.forEach(function(d, i){
      items.push({ label: "Day " + (i + 1), hint: d.date || "", disabled: d === hit.day, onClick: function(){ moveToDay(rowId, d.id); } });
    });
    items.push("sep");
    if (r.type === "shot"){
      items.push({ label: "Show in shot list", onClick: function(){ if (FP.pages.shotlist.revealShot) FP.pages.shotlist.revealShot(r.shotId); } });
      items.push({ label: "Reset to " + DEFAULT_PREP + " + " + DEFAULT_SHOOT + " min", onClick: function(){
        change(function(p){ var h = findRow(p, rowId); if (h){ h.row.prep = DEFAULT_PREP; h.row.shoot = DEFAULT_SHOOT; } });
      } });
    } else {
      items.push({ label: "Show in breakdown", onClick: function(){ if (FP.pages.breakdown.revealScene) FP.pages.breakdown.revealScene(r.sceneId); } });
      items.push({ label: "Set every shot to " + DEFAULT_PREP + " + " + DEFAULT_SHOOT + " min", onClick: function(){
        change(function(p){
          var h = findRow(p, rowId);
          if (!h) return;
          var n = blockLength(h.day, h.index, index(p));
          for (var k = 1; k < n; k++){ h.day.rows[h.index + k].prep = DEFAULT_PREP; h.day.rows[h.index + k].shoot = DEFAULT_SHOOT; }
        });
      } });
    }
    void ix;
    FP.openMenu(btn, items, { alignRight: true });
  }
  function dayMenu(btn, dayId){
    var p = FP.project(), i = p.schedule.days.findIndex(function(d){ return d.id === dayId; });
    FP.openMenu(btn, [
      { label: "Move day earlier", disabled: i <= 0, onClick: function(){ swapDays(i, i - 1); } },
      { label: "Move day later", disabled: i >= p.schedule.days.length - 1, onClick: function(){ swapDays(i, i + 1); } },
      "sep",
      { label: "Delete day", danger: true, confirm: "Click again to delete", onClick: function(){ deleteDay(dayId); } }
    ], { alignRight: true });
  }
  function swapDays(a, b){
    change(function(p){
      var d = p.schedule.days, x = d[a];
      // the rows trade places; each day keeps its date and call time
      var rows = x.rows; x.rows = d[b].rows; d[b].rows = rows;
    });
  }

  // ---------- input ----------
  function onInput(e){
    var el = e.target, tr = el.closest("tr"), sec = el.closest(".sc-day");
    var rowId = tr && tr.getAttribute("data-row"), dayId = sec && sec.getAttribute("data-day");
    if (el.hasAttribute("data-mf")){
      var f = el.getAttribute("data-mf"), v = Math.max(0, parseInt(el.value, 10) || 0);
      typed(function(p){ var h = findRow(p, rowId); if (h) h.row[f] = v; }, "sc:" + rowId + ":" + f);
      refreshTimes(FP.project());
    } else if (el.hasAttribute("data-bf")){
      var lv = el.value;
      typed(function(p){ var h = findRow(p, rowId); if (h) h.row.label = lv; }, "sc:" + rowId + ":label");
    } else if (el.hasAttribute("data-df")){
      var df = el.getAttribute("data-df"), dv = el.value;
      typed(function(p){ var d = dayById(p, dayId); if (d) d[df] = dv || (df === "call" ? "06:00" : ""); }, "sc:" + dayId + ":" + df);
      refreshTimes(FP.project());
    }
  }

  // ---------- dragging rows ----------
  // a scene takes its shots and lands between scene blocks; a shot or a break goes anywhere
  var drag = null;
  function startDrag(e, tr){
    var p = FP.project(), hit = findRow(p, tr.getAttribute("data-row"));
    if (!hit) return;
    var n = blockLength(hit.day, hit.index, index(p));
    var rows = [tr], x = tr;
    for (var k = 1; k < n; k++){ x = x.nextElementSibling; if (x) rows.push(x); }
    drag = { id: hit.row.id, isScene: hit.row.type === "scene", rows: rows, y0: e.clientY, moved: false, target: null, pid: e.pointerId };
    try { tr.setPointerCapture(e.pointerId); } catch (err){}
  }
  function clearMarks(){
    H.querySelectorAll(".drop-before, .drop-after").forEach(function(r){ r.classList.remove("drop-before", "drop-after"); });
    H.querySelectorAll(".sc-day.day-drop").forEach(function(d){ d.classList.remove("day-drop"); });
  }
  function sceneHeadOf(tr){
    for (var n = tr; n; n = n.previousElementSibling){
      if (n.classList.contains("sc-break")) return null;
      if (n.classList.contains("sc-scene")) return n;
    }
    return null;
  }
  function dragMove(e){
    if (!drag) return;
    if (!drag.moved){
      if (Math.abs(e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      document.body.classList.add("sc-dragging");
      drag.rows.forEach(function(r){ r.classList.add("dragging"); });
    }
    clearMarks();
    drag.target = null;
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var tr = under && under.closest && under.closest(".sc-day tbody tr");
    var sec = under && under.closest && under.closest(".sc-day");
    if (!tr && sec){
      // over a day but not a row: the end of that day's list
      var last = sec.querySelector("tbody tr:last-child");
      if (last && !last.classList.contains("sc-emptyrow") && drag.rows.indexOf(last) === -1){ tr = last; }
      else if (last && last.classList.contains("sc-emptyrow")){
        sec.classList.add("day-drop");
        drag.target = { dayId: sec.getAttribute("data-day"), beforeRow: null };
        return;
      }
      if (!tr) return;
    }
    if (!tr || drag.rows.indexOf(tr) !== -1) return;
    if (tr.classList.contains("sc-emptyrow")){
      tr.closest(".sc-day").classList.add("day-drop");
      drag.target = { dayId: tr.closest(".sc-day").getAttribute("data-day"), beforeRow: null };
      return;
    }
    var rect = tr.getBoundingClientRect(), before = e.clientY < rect.top + rect.height / 2;
    var mark = tr, markBefore = before;
    if (drag.isScene && !tr.classList.contains("sc-break")){
      var head = sceneHeadOf(tr);
      if (head && drag.rows.indexOf(head) === -1){
        if (before && tr === head){ mark = head; markBefore = true; }
        else {
          // snap past the end of that scene's block
          var end = head;
          while (end.nextElementSibling && end.nextElementSibling.classList.contains("sc-shot") &&
                 end.nextElementSibling.getAttribute("data-scene-id") === head.getAttribute("data-scene-id")) end = end.nextElementSibling;
          if (before && tr !== head){ mark = end; markBefore = false; }
          else { mark = end; markBefore = false; }
        }
      }
    }
    if (drag.rows.indexOf(mark) !== -1) return;
    mark.classList.add(markBefore ? "drop-before" : "drop-after");
    var nxt = markBefore ? mark : mark.nextElementSibling;
    while (nxt && drag.rows.indexOf(nxt) !== -1) nxt = nxt.nextElementSibling;
    drag.target = { dayId: mark.closest(".sc-day").getAttribute("data-day"), beforeRow: nxt ? nxt.getAttribute("data-row") : null };
    mark.closest(".sc-day").classList.add("day-drop");
  }
  function endDrag(cancel){
    if (!drag) return;
    var d = drag;
    drag = null;
    document.body.classList.remove("sc-dragging");
    d.rows.forEach(function(r){ r.classList.remove("dragging"); });
    if (!H) return;
    clearMarks();
    if (cancel || !d.moved || !d.target) return;
    var t = d.target;
    change(function(p){
      var ix = index(p), hit = findRow(p, d.id), to = dayById(p, t.dayId);
      if (!hit || !to) return;
      var block = hit.day.rows.splice(hit.index, blockLength(hit.day, hit.index, ix));
      var at = t.beforeRow ? to.rows.findIndex(function(r){ return r.id === t.beforeRow; }) : -1;
      if (at === -1) at = to.rows.length;
      Array.prototype.splice.apply(to.rows, [at, 0].concat(block));
    });
  }

  function bind(host){
    host.addEventListener("input", onInput);
    host.addEventListener("change", function(e){
      var el = e.target;
      if (el.getAttribute("data-act") === "scenes-only"){
        scenesOnly = el.checked;
        lsSet(SCENES_ONLY_KEY, scenesOnly ? "1" : "0");
        H.querySelector('[data-sc="body"]').classList.toggle("scenes-only", scenesOnly);
      } else if (el.getAttribute("data-act") === "done"){
        var rowId = el.closest("tr").getAttribute("data-row"), on = el.checked;
        change(function(p){ var h = findRow(p, rowId); if (h) h.row.done = on; });
      } else if (el.hasAttribute("data-mf")){
        // tidy what was typed (blank becomes 0) once the field is left
        var h = findRow(FP.project(), el.closest("tr").getAttribute("data-row"));
        if (h) el.value = h.row[el.getAttribute("data-mf")];
      }
    });
    host.addEventListener("click", function(e){
      var b = e.target.closest("button");
      if (!b) return;
      var tr = b.closest("tr"), sec = b.closest(".sc-day");
      var rowId = tr && tr.getAttribute("data-row"), dayId = sec && sec.getAttribute("data-day");
      if (b.hasAttribute("data-step")){
        var inp = b.parentNode.querySelector("input"), f = inp.getAttribute("data-mf");
        var dir = +b.getAttribute("data-step");
        change(function(p){
          var h = findRow(p, rowId);
          if (h) h.row[f] = Math.max(0, Math.round(((h.row[f] || 0) + dir * STEP) / STEP) * STEP);
        }, "sc:" + rowId + ":" + f);
        return;
      }
      var act = b.getAttribute("data-act");
      if (act === "add-day") addDay();
      else if (act === "add-break") addBreak(dayId, b.getAttribute("data-label"), +b.getAttribute("data-mins"));
      else if (act === "del-break"){ change(function(p){ var h = findRow(p, rowId); if (h) h.day.rows.splice(h.index, 1); }); }
      else if (act === "row-menu"){ e.stopPropagation(); rowMenu(b, rowId); }
      else if (act === "day-menu"){ e.stopPropagation(); dayMenu(b, dayId); }
    });
    host.addEventListener("pointerdown", function(e){
      if (e.button !== 0) return;
      var g = e.target.closest(".sc-grip");
      if (!g) return;
      e.preventDefault();
      startDrag(e, g.closest("tr"));
    });
    host.addEventListener("pointermove", dragMove);
    host.addEventListener("pointerup", function(){ endDrag(false); });
    host.addEventListener("pointercancel", function(){ endDrag(true); });
  }
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && drag) endDrag(true); });

  FP.pages.schedule = {
    render: render,
    update: function(host, p){
      if (!H) return;
      if (selfTyping){ refreshTimes(p); return; }
      if (sync(p)) FP.quietChange(function(){});
      redraw(p);
    },
    leave: function(){ endDrag(true); H = null; },
    // exposed for the callsheet and tests: the day's rows with their start times
    timing: function(p, dayId){ var d = dayById(p, dayId); return d ? timing(d, index(p)) : null; }
  };
})();
