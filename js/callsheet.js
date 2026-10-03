/* Callsheet page, Rev. 08: one sheet per shooting day, built from what the project
   already knows (the schedule's day, its scenes and times; the location and its sun;
   the crew and cast) plus the few things only a callsheet holds: production details,
   transport, and the day's logistics. The sheet on the right redraws as you type. */
(function(){
  "use strict";
  var FP = window.FP;
  function esc(s){ return FP.esc(s); }
  function norm(s){ return String(s || "").trim().toLowerCase(); }
  var DAY_FIELDS = ["unitBase", "hospital", "weather", "notes", "breakfast", "lunch", "wrap", "diet"];
  var dayId = "";

  function days(p){ return p.schedule.days; }
  function curDay(p){
    var d = days(p).filter(function(x){ return x.id === dayId; })[0] || days(p)[0] || null;
    dayId = d ? d.id : "";
    return d;
  }
  // a day's own record; projects from the classic app filed these by position ("d0")
  function record(p, d, create){
    var all = p.callsheet.days, i = days(p).indexOf(d);
    var r = all[d.id] || all["d" + i];
    if (create && !all[d.id]){ r = all[d.id] = Object.assign({}, r || {}); }
    r = r || {};
    DAY_FIELDS.forEach(function(k){ if (r[k] === undefined && create) r[k] = ""; });
    return r;
  }
  function production(p){
    var x = p.callsheet.production;
    if (!x || typeof x !== "object") x = p.callsheet.production = {};
    return x;
  }
  function fmtDate(iso){
    if (!iso) return "Date not set";
    var d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function sceneLoc(sc){ for (var i = 0; i < sc.shots.length; i++) if (sc.shots[i].location) return sc.shots[i].location; return ""; }

  // the day as the sheet reads it: scenes and breaks in order, with start times
  function dayPlan(p, d){
    var t = FP.pages.schedule && FP.pages.schedule.timing ? FP.pages.schedule.timing(p, d.id) : null;
    var byId = {};
    p.scenes.forEach(function(s){ byId[s.id] = s; });
    var rows = [];
    d.rows.forEach(function(r){
      if (r.type === "scene" && byId[r.sceneId]){
        var sc = byId[r.sceneId];
        rows.push({ time: t ? t.at[r.id] : null, mins: t ? t.sceneMins[r.id] : 0, scene: sc, loc: sceneLoc(sc), done: r.done });
      } else if (r.type === "break"){
        rows.push({ time: t ? t.at[r.id] : null, brk: r.label || "Break", mins: r.mins });
      }
    });
    return { rows: rows, total: t ? t.total : 0, wrap: t ? t.wrap : null };
  }
  function clock(m){
    if (m == null) return "";
    var x = ((Math.round(m) % 1440) + 1440) % 1440, h = Math.floor(x / 60), mm = x % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }
  function dayLocation(p, plan){
    var name = "";
    for (var i = 0; i < plan.rows.length; i++) if (plan.rows[i].loc){ name = plan.rows[i].loc; break; }
    var l = p.locations.filter(function(x){ return name && norm(x.name) === norm(name); })[0];
    return { name: name, coords: l ? l.coords : "" };
  }
  function sunFor(p, loc, date){
    var c = FP.parseCoords(loc.coords);
    if (!c || !date || !FP.sun) return null;
    try { return FP.sun.facts(c.lat, c.lon, date, p.sun.tz); } catch (e){ return null; }
  }
  FP.callsheetData = function(p, d){
    var plan = dayPlan(p, d), loc = dayLocation(p, plan);
    return { plan: plan, loc: loc, sun: sunFor(p, loc, d.date), rec: record(p, d, false), prod: production(p) };
  };

  function tzLabel(p){
    var tz = p.sun.tz === "" || p.sun.tz == null || isNaN(parseFloat(p.sun.tz)) ? FP.sun.localTz() : parseFloat(p.sun.tz);
    var h = Math.floor(Math.abs(tz)), m = Math.round((Math.abs(tz) - h) * 60);
    return "UTC" + (tz < 0 ? "−" : "+") + h + (m ? ":" + (m < 10 ? "0" : "") + m : "");
  }

  // ---------- the sheet ----------
  function sheetHTML(p){
    var d = curDay(p);
    if (!d) return '<p class="muted-note pad">Add a shooting day on the Schedule page and its callsheet appears here.</p>';
    var all = FP.callsheetData(p, d), plan = all.plan, loc = all.loc, sun = all.sun, rec = all.rec, prod = all.prod;
    var n = days(p).indexOf(d) + 1, cs = p.callsheet;
    var stat = function(k, v){ return '<div><div class="k">' + esc(k) + '</div><div class="v">' + esc(v || "—") + '</div></div>'; };
    var block = function(title, body, extra){ return '<section class="cs-block"><div class="cs-block-title">' + esc(title) + (extra || "") + '</div>' + body + '</section>'; };
    var dash = function(v){ return esc(v || "—"); };
    var scenes = plan.rows.filter(function(r){ return !r.brk; });

    var keys = cs.crew.filter(function(c){ return c.key && String(c.name || "").trim(); });
    var crew = cs.crew.filter(function(c){ return String(c.name || "").trim(); });
    var byDept = {};
    crew.forEach(function(c){ var k = FP.crewDept(c); (byDept[k] = byDept[k] || []).push(c); });
    var depts = (FP.CREW_DEPTS || []).filter(function(x){ return byDept[x]; }).concat(Object.keys(byDept).filter(function(x){ return (FP.CREW_DEPTS || []).indexOf(x) === -1; }));
    var cast = cs.cast.filter(function(c){ return c.character || c.actor; });
    var rides = cs.transport.filter(function(t){ return t.who || t.passengers; });
    var prodLines = [prod.company ? "<b>" + esc(prod.company) + "</b>" : "", esc(prod.address || ""),
      prod.invoiceTo ? "Invoices: " + esc(prod.invoiceTo) + (prod.invoiceCc ? " (cc " + esc(prod.invoiceCc) + ")" : "") : ""].filter(Boolean);

    return '<article class="cs-sheet">' +
      '<header class="cs-head"><div class="cs-head-top">' +
        '<div><div class="cs-eyebrow">Callsheet</div><h2 class="cs-title">' + esc(p.name) + '</h2></div>' +
        '<div class="cs-daybox"><b>Day ' + n + ' of ' + days(p).length + '</b><span>' + esc(fmtDate(d.date)) + '</span></div></div>' +
        '<div class="cs-stats">' + stat("General call", d.call) + stat("Est. wrap", clock(plan.wrap)) +
          stat("Sunrise", sun && sun.sunrise) + stat("Sunset", sun && sun.sunset) + stat("Golden hour, evening", sun && sun.goldenPm) + '</div>' +
        (sun ? '<p class="cs-tz">Sun times at ' + esc(tzLabel(p)) + ', from the location\'s coordinates.</p>' : "") +
      '</header>' +
      (keys.length ? block("Key contacts", '<table class="cs-table"><tbody>' + keys.map(function(c){
        return '<tr><td><b>' + dash(c.role) + '</b></td><td>' + dash(c.name) + '</td><td class="tn">' + esc(c.phone) + '</td><td>' + esc(c.email) + '</td></tr>';
      }).join("") + '</tbody></table>') : "") +
      (prodLines.length ? block("Production", '<p class="cs-notes">' + prodLines.join("<br>") + '</p>') : "") +
      block("Location", '<div class="cs-locline"><b>' + esc(loc.name || "Not set") + '</b>' + (loc.coords ? '<span class="tn">' + esc(loc.coords) + '</span>' : "") + '</div>' +
        '<div class="cs-kv"><div><b>Unit base</b><span>' + dash(rec.unitBase) + '</span></div><div><b>Nearest hospital</b><span>' + dash(rec.hospital) + '</span></div>' +
        '<div><b>Weather</b><span>' + dash(rec.weather) + '</span></div></div>') +
      block("Scenes", plan.rows.length ? '<table class="cs-table"><thead><tr><th>Time</th><th>Sc</th><th>Scene</th><th>Int/Ext</th><th>Day/Night</th><th>Location</th></tr></thead><tbody>' +
        plan.rows.map(function(r){
          if (r.brk) return '<tr class="cs-break"><td class="tn">' + clock(r.time) + '</td><td colspan="5">' + esc(r.brk) + ' · ' + r.mins + ' min</td></tr>';
          return '<tr' + (r.done ? ' class="cs-done"' : "") + '><td class="tn">' + clock(r.time) + '</td><td class="tn"><b>' + esc(r.scene.num) + '</b></td><td>' + dash(r.scene.name) +
            (r.scene.summary ? '<div class="cs-sum">' + esc(r.scene.summary) + '</div>' : "") + '</td><td>' + dash(r.scene.intext) + '</td><td>' + dash(r.scene.daynight) + '</td><td>' + dash(r.loc) + '</td></tr>';
        }).join("") + '</tbody></table>' : '<p class="cs-none">This day has no scenes scheduled yet.</p>',
        (scenes.length ? ' <span class="cs-count">' + scenes.length + (scenes.length === 1 ? " scene" : " scenes") + ' · ' + (plan.total / 60).toFixed(1) + ' hrs</span>' : "")) +
      block("Cast", cast.length ? '<table class="cs-table"><thead><tr><th>#</th><th>Character</th><th>Actor</th><th>Pickup</th><th>By</th><th>To</th><th>Wardrobe</th><th>Make-up</th><th>On set</th></tr></thead><tbody>' +
        cast.map(function(c, i){
          return '<tr><td class="tn">' + (i + 1) + '</td><td><b>' + dash(c.character) + '</b></td><td>' + dash(c.actor) + '</td><td class="tn">' + dash(c.pickup) + '</td><td>' + dash(c.pickedUpBy) +
            '</td><td>' + dash(c.toAddress) + '</td><td class="tn">' + dash(c.wardrobe) + '</td><td class="tn">' + dash(c.makeup) + '</td><td class="tn">' + dash(c.onSet) + '</td></tr>';
        }).join("") + '</tbody></table>' : '<p class="cs-none">No cast yet. Add them on the Crew page.</p>') +
      block("Crew", crew.length ? depts.map(function(dep){
        return '<table class="cs-table cs-crew"><thead><tr><th colspan="5">' + esc(dep) + '</th></tr></thead><tbody>' + byDept[dep].map(function(c){
          return '<tr><td>' + dash(c.role) + '</td><td><b>' + dash(c.name) + '</b></td><td class="tn">' + esc(c.phone) + '</td><td>' + esc(c.email) + '</td>' +
            '<td class="tn cs-call' + (c.call ? " own" : "") + '">' + esc(c.call || d.call) + '</td></tr>';
        }).join("") + '</tbody></table>';
      }).join("") : '<p class="cs-none">No crew yet. Add them on the Crew page.</p>') +
      (rides.length ? block("Transport", '<table class="cs-table"><thead><tr><th>Driver</th><th>Passengers</th><th>From</th><th>To</th><th>Call</th><th>Note</th></tr></thead><tbody>' +
        rides.map(function(t){
          return '<tr><td><b>' + dash(t.who) + '</b></td><td>' + dash(t.passengers) + '</td><td>' + dash(t.from) + '</td><td>' + dash(t.to) + '</td><td class="tn">' + dash(t.call) + '</td><td>' + esc(t.note) + '</td></tr>';
        }).join("") + '</tbody></table>') : "") +
      (rec.breakfast || rec.lunch || rec.wrap || rec.diet ? block("Catering", '<div class="cs-kv"><div><b>Breakfast</b><span>' + dash(rec.breakfast) + '</span></div>' +
        '<div><b>Lunch</b><span>' + dash(rec.lunch) + '</span></div><div><b>Wrap</b><span>' + dash(rec.wrap) + '</span></div></div>' +
        (rec.diet ? '<p class="cs-notes">' + esc(rec.diet) + '</p>' : "")) : "") +
      (rec.notes ? block("Notes", '<p class="cs-notes">' + esc(rec.notes).replace(/\n/g, "<br>") + '</p>') : "") +
    '</article>';
  }

  // ---------- A4 pages ----------
  // The sheet is laid out on real A4 pages (794 x 1123 at 96 dpi). Sections flow onto
  // the next page when they don't fit; a table splits between rows and repeats its head.
  var A4W = 794;
  function paginate(wrap, p){
    var html = sheetHTML(p);
    if (html.indexOf("cs-sheet") === -1){ wrap.innerHTML = html; return; }
    var src = document.createElement("div");
    src.innerHTML = html;
    var blocks = Array.prototype.slice.call(src.firstElementChild.children);
    wrap.innerHTML = '<div class="cs-pages"></div>';
    var box = wrap.firstChild, body = null, pages = [];
    function newPage(){
      var pg = document.createElement("div");
      pg.className = "cs-page";
      pg.innerHTML = '<div class="cs-page-body"></div><div class="cs-page-foot"><span>' + esc(p.name) + ' · Callsheet</span><span class="pn"></span></div>';
      box.appendChild(pg);
      pages.push(pg);
      body = pg.firstChild;
    }
    function over(){ return body.scrollHeight > body.clientHeight + 1; }
    function shell(block, title){
      var s = block.cloneNode(false);
      if (title){ var tt = title.cloneNode(true); tt.insertAdjacentHTML("beforeend", ' <span class="cs-count">continued</span>'); s.appendChild(tt); }
      return s;
    }
    // a part is worth keeping once it holds a row or anything besides its title
    function hasContent(part){
      if (part.querySelector("tbody tr")) return true;
      return Array.prototype.some.call(part.children, function(c){ return !c.classList.contains("cs-block-title") && c.tagName !== "TABLE"; });
    }
    function tableShell(t){
      var c = t.cloneNode(false);
      if (t.tHead) c.appendChild(t.tHead.cloneNode(true));
      c.appendChild(document.createElement("tbody"));
      return c;
    }
    function place(block){
      body.appendChild(block);
      if (!over()) return;
      body.removeChild(block);
      var tables = block.querySelectorAll("table");
      if (!tables.length || !block.classList.contains("cs-block")){
        if (body.children.length) newPage();
        body.appendChild(block);
        return;
      }
      // fill what's left of this page row by row, then carry on overleaf
      var title = block.querySelector(".cs-block-title"), part = block.cloneNode(false), kids = Array.prototype.slice.call(block.children);
      body.appendChild(part);
      function fresh(){
        // a title left alone at the foot of a page goes over with its content
        if (!hasContent(part)){
          body.removeChild(part);
          if (title && title.parentNode === part){ newPage(); part = block.cloneNode(false); part.appendChild(title); body.appendChild(part); return; }
        }
        newPage();
        part = shell(block, title);
        body.appendChild(part);
      }
      kids.forEach(function(kid){
        if (kid.tagName !== "TABLE"){
          part.appendChild(kid);
          if (over() && hasContent(part) && part.children.length > 1){ part.removeChild(kid); fresh(); part.appendChild(kid); }
          return;
        }
        var t = tableShell(kid);
        part.appendChild(t);
        Array.prototype.slice.call(kid.tBodies[0] ? kid.tBodies[0].rows : []).forEach(function(row){
          t.tBodies[0].appendChild(row);
          if (!over()) return;
          t.tBodies[0].removeChild(row);
          if (!t.tBodies[0].rows.length) part.removeChild(t);
          // a row too tall for an empty page stays where it is rather than paging forever
          if (!hasContent(part) && body.children.length === 1){ part.appendChild(t); t.tBodies[0].appendChild(row); return; }
          fresh();
          t = tableShell(kid);
          part.appendChild(t);
          t.tBodies[0].appendChild(row);
        });
      });
    }
    newPage();
    blocks.forEach(place);
    pages.forEach(function(pg, i){ pg.querySelector(".pn").textContent = "Page " + (i + 1) + " of " + pages.length; });
    fit(wrap);
  }
  // narrower windows see the pages scaled down, never cut off
  function fit(wrap){
    var box = wrap.querySelector(".cs-pages");
    if (!box) return;
    var room = wrap.clientWidth - 32;
    box.style.zoom = room > 0 && room < A4W ? (room / A4W).toFixed(3) : "";
  }
  window.addEventListener("resize", function(){
    var w = document.querySelector("[data-cs-sheet]");
    if (w) fit(w);
  });

  // ---------- the side panels ----------
  function railHTML(p){
    var d = curDay(p), rec = d ? record(p, d, false) : {}, prod = production(p);
    var f = function(k, label, v, attrs){ return FP.field(label, FP.input(k, v, attrs)); };
    var dayPanel = d ? '<div class="cs-panel" data-coll="day" data-rec="' + esc(d.id) + '"><div class="tr-h">This day</div><div class="rail-fields">' +
        f("unitBase", "Unit base / parking", rec.unitBase, 'placeholder="Where the trucks go"') +
        f("hospital", "Nearest hospital", rec.hospital, 'placeholder="Name, address, distance"') +
        f("weather", "Weather", rec.weather, 'placeholder="e.g. 14°C, light rain, wind 20 km/h"') +
        '<div class="fld-row three">' + f("breakfast", "Breakfast", rec.breakfast, 'placeholder="Heads"') + f("lunch", "Lunch", rec.lunch, 'placeholder="Heads"') +
          f("wrap", "Wrap", rec.wrap, 'placeholder="Heads"') + '</div>' +
        f("diet", "Diets and allergies", rec.diet, 'placeholder="See the catering list"') +
        FP.field("Notes", '<textarea data-k="notes" class="grow" rows="3" placeholder="Anything the crew needs to know">' + esc(rec.notes || "") + '</textarea>') +
      '</div></div>' : "";
    return '<aside class="toolrail cs-rail">' +
      '<div class="cs-panel"><div class="tr-h">Shooting day</div><div class="rail-fields">' +
        (days(p).length ? '<select class="cell-sel boxed" data-cs-day aria-label="Shooting day">' + days(p).map(function(x, i){
          return '<option value="' + esc(x.id) + '"' + (x === d ? " selected" : "") + '>Day ' + (i + 1) + ' · ' + esc(x.date ? fmtDate(x.date) : "no date") + '</option>';
        }).join("") + '</select>' : '<p class="fp-hint">No shooting days yet.</p>') +
        '<p class="fp-hint">Date, call time and scenes come from the Schedule; crew and cast from the Crew page.</p>' +
        '<div class="rail-btns"><button type="button" class="btn ghost" data-act="go" data-page="schedule">Schedule</button>' +
          '<button type="button" class="btn ghost" data-act="go" data-page="crew">Crew and cast</button></div>' +
      '</div></div>' +
      dayPanel +
      '<div class="cs-panel" data-coll="prod"><div class="tr-h">Production</div><div class="rail-fields">' +
        '<p class="fp-hint">Entered once; on every day\'s sheet.</p>' +
        f("company", "Production company", prod.company, 'placeholder="Company name"') +
        f("address", "Address / registration", prod.address, 'placeholder="Address, registration no."') +
        f("invoiceTo", "Invoices to", prod.invoiceTo, 'type="email" placeholder="invoices@…"') +
        f("invoiceCc", "Cc", prod.invoiceCc, 'type="email" placeholder="Optional"') +
      '</div></div>' +
      '<div class="cs-panel" data-coll="transport"><div class="tr-h">Transport</div><div class="rail-fields">' +
        p.callsheet.transport.map(function(t){
          return '<div class="cs-ride" data-rec="' + esc(t.id) + '"><div class="cs-ride-head"><span>Ride</span>' +
            '<button type="button" class="x-btn" data-act="del-ride" aria-label="Remove ride">×</button></div>' +
            '<div class="fld-row two">' + f("who", "Driver", t.who) + f("passengers", "Passengers", t.passengers) +
            f("from", "From", t.from) + f("to", "To", t.to) + f("call", "Call", t.call, 'type="time"') + f("note", "Note", t.note) + '</div></div>';
        }).join("") +
        '<button type="button" class="btn ghost" data-act="add-ride">+ Add ride</button>' +
      '</div></div>' +
    '</aside>';
  }

  var page = FP.formPage("callsheet", {
    html: function(p){
      return '<div class="shell-body callsheet">' + railHTML(p) +
        '<div class="workwindow"><div class="pg-toolbar"><div class="left"><h3>Callsheet</h3><span class="count">' +
          (days(p).length ? days(p).length + (days(p).length === 1 ? " shooting day" : " shooting days") : "No shooting days yet") + '</span></div>' +
          '<div class="right"><button type="button" class="btn ghost" data-act="export"' + (days(p).length ? "" : " disabled") + '>Export callsheet PDF</button></div></div>' +
          '<div class="cs-wrap" data-cs-sheet></div></div>' +
      '</div>';
    },
    resolve: function(p, coll, rec){
      if (coll === "prod") return production(p);
      if (coll === "transport") return p.callsheet.transport.filter(function(t){ return t.id === rec; })[0] || null;
      if (coll === "day"){ var d = days(p).filter(function(x){ return x.id === rec; })[0]; return d ? record(p, d, true) : null; }
      return null;
    },
    drawn: function(H, p){ paginate(H.querySelector("[data-cs-sheet]"), p); },
    typed: function(H, p){ paginate(H.querySelector("[data-cs-sheet]"), p); },
    actions: {
      go: function(b){ FP.showPage(b.getAttribute("data-page")); },
      "add-ride": function(){
        var id = FP.uid("tr");
        FP.change(function(p){ p.callsheet.transport.push({ id: id, who: "", passengers: "", from: "", to: "", call: "", note: "" }); });
        var f = page.host().querySelector('.cs-ride[data-rec="' + id + '"] [data-k="who"]');
        if (f) f.focus();
      },
      "del-ride": function(b, c){
        FP.change(function(p){ p.callsheet.transport = p.callsheet.transport.filter(function(t){ return t.id !== c.rec; }); });
      },
      export: function(){
        if (FP.exports && FP.exports.callsheet) FP.exports.callsheet(dayId);
      }
    },
    bind: function(host){
      host.addEventListener("change", function(e){
        if (e.target.hasAttribute("data-cs-day")){ dayId = e.target.value; page.redraw(); }
      });
    },
    api: { dayId: function(){ return dayId; } }
  });
})();
