/* Converts a project saved by the classic app (format version 2, where scenes,
   locations and the schedule were stored as the page's own HTML) into the
   structured format. The markup is parsed inside a <template>, which is inert:
   no scripts run and no images load while it is read. */
(function(){
  "use strict";
  var FP = window.FP;

  function parse(html){
    var t = document.createElement("template");
    t.innerHTML = html || "";
    return t.content;
  }
  function all(root, sel){ return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : []; }

  // textContent, but keeping the line breaks a contenteditable cell shows
  function readText(el){
    if (!el) return "";
    var out = "";
    (function walk(n){
      if (n.nodeType === 3){ out += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "SCRIPT" || tag === "STYLE") return;
      if (tag === "BR"){ out += "\n"; return; }
      var block = tag === "DIV" || tag === "P" || tag === "LI";
      if (block && out && out.charAt(out.length - 1) !== "\n") out += "\n";
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (block && out && out.charAt(out.length - 1) !== "\n") out += "\n";
    })(el);
    return out.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function attr(el, name){ return el ? (el.getAttribute(name) || "") : ""; }
  function inputVal(root, sel){ return attr(root ? root.querySelector(sel) : null, "value"); }

  function photosIn(root, kind){
    return all(root, '.media-slot[data-kind="' + kind + '"] img')
      .map(function(img){ return attr(img, "src"); })
      .filter(Boolean)
      .map(function(src){ return { id: FP.uid("ph"), src: src }; });
  }
  function noteLines(block){
    return all(block, ".tag-text").map(readText).filter(Boolean);
  }

  var LEGACY_SIZE_TO_TYPE = { "2S": "2-shot", "2-SHOT": "2-shot", "OTS": "OTS" };
  var OPTION_KEYS = { "SIZE": "size", "SHOT TYPE": "shotType", "GRIP": "grip", "MOVEMENT": "movement",
    "SPECIAL": "special", "SUB-SHOT": "sub" };

  function convertShot(tr){
    function cell(legacyCol){
      var td = tr.querySelector('td[data-col="' + legacyCol + '"]');
      if (!td) return null;
      return readText(td.querySelector(".cell-text") || td);
    }
    var fields = {
      id: attr(tr, "data-shot-uid") || FP.uid("s"),
      scriptRef: attr(tr, "data-script-ref"),
      storyboard: photosIn(tr, "shot-storyboard"),
      floorplan: photosIn(tr, "shot-floorplan"),
      crewNotes: noteLines(tr.querySelector(".shot-notes-block"))
    };
    FP.COLUMNS.forEach(function(c){
      if (c.derived) return;
      var v = cell(c.legacy);
      fields[c.key] = v === null ? "" : v;
    });
    // tables saved before the Shot type column existed kept some framings under Size
    if (tr.querySelector('td[data-col="SHOT TYPE"]') === null){
      var mapped = LEGACY_SIZE_TO_TYPE[(fields.size || "").toUpperCase()];
      if (mapped){ fields.shotType = mapped; fields.size = ""; }
    }
    return FP.blankShot(fields);
  }

  function convertScene(g, index){
    var numRaw = readText(g.querySelector(".scene-badge .num")) || attr(g, "data-scene") || String(index + 1);
    var grid = g.querySelector(".tag-grid");
    var mediaRow = g.querySelector(".media-row") || g;
    var dd = function(kind){ return readText(g.querySelector('.scene-dd[data-kind="' + kind + '"] .cell-text')); };
    return FP.blankScene({
      num: numRaw.replace(/^0+(?=\d)/, ""),
      name: readText(g.querySelector(".scene-name")),
      intext: dd("intext") || "INT",
      daynight: dd("daynight") || "DAY",
      summary: readText(g.querySelector(".scene-summary")),
      camera: noteLines(grid && grid.querySelector(".tag-camera")),
      light: noteLines(grid && grid.querySelector(".tag-licht")),
      notes: noteLines(grid && grid.querySelector(".tag-notes")),
      locationPhotos: photosIn(mediaRow, "location"),
      floorplan: photosIn(mediaRow, "floorplan"),
      shots: all(g, ".shot-table tbody tr")
        .filter(function(tr){ return tr.querySelector("td[data-col]"); })
        .map(convertShot)
    });
  }

  function convertSchedule(html){
    var root = parse(html);
    return Array.prototype.slice.call(root.children).filter(function(d){ return d.tagName === "DIV"; }).map(function(day){
      var rows = [];
      all(day, "tbody tr").forEach(function(tr){
        var mins = all(tr, "input.mins-input").map(function(i){ return parseInt(attr(i, "value"), 10); });
        if (tr.classList.contains("break-row")){
          rows.push({ id: FP.uid("r"), type: "break",
            label: readText(tr.querySelector(".sched-label")).replace(/×\s*$/, "").trim() || "BREAK",
            mins: isNaN(mins[0]) ? 30 : mins[0] });
        } else if (tr.classList.contains("sched-scene-row")){
          var box = tr.querySelector(".scene-done-box");
          rows.push({ id: FP.uid("r"), type: "scene", scene: attr(tr, "data-scene"),
            done: tr.hasAttribute("data-done") || !!(box && box.hasAttribute("checked")) });
        } else if (tr.getAttribute("data-sched-key")){
          var key = tr.getAttribute("data-sched-key");
          rows.push({ id: FP.uid("r"), type: "shot", shotId: key.slice(key.indexOf("::") + 2),
            prep: isNaN(mins[0]) ? 10 : mins[0], shoot: isNaN(mins[1]) ? 20 : mins[1] });
        }
      });
      return { id: FP.uid("d"), date: inputVal(day, 'input[type="date"]'),
        call: inputVal(day, 'input[type="time"]') || "06:00", rows: rows };
    });
  }

  function convertCallsheet(cs){
    if (!cs || typeof cs !== "object") return undefined;
    return {
      crew: (Array.isArray(cs.crew) ? cs.crew : []).map(function(p){
        return { id: p.id, name: p.name || "", role: p.role || "", phone: p.phone || "",
                 email: p.email || "", call: p.call || "", dept: p.dept || "Other", key: !!p.key };
      }),
      cast: (Array.isArray(cs.cast) ? cs.cast : []).map(function(c){
        return { id: c.id, character: c.character || "", actor: c.actor || "",
                 pickup: c.pickup || "", pickedUpBy: c.pickedUpBy || "", toAddress: c.toAddress || "",
                 wardrobe: c.wardrobe || "", makeup: c.makeup || "", onSet: c.onSet || "" };
      }),
      transport: (Array.isArray(cs.transport) ? cs.transport : []).map(function(t){
        return { id: t.id, who: t.who || "", passengers: t.passengers || "",
                 from: t.from || "", to: t.to || "", call: t.call || "", note: t.note || "" };
      }),
      production: (cs.production && typeof cs.production === "object") ? cs.production : {},
      days: (cs.days && typeof cs.days === "object") ? cs.days : {}
    };
  }

  function convert(d){
    var p = FP.blankProject(d.projectName || "Untitled project");
    p.savedAt = d.savedAt || "";

    p.scenes = all(parse(d.scenesHTML), ".scene-group").map(convertScene);

    p.locations = all(parse(d.locationsHTML), ".location-entry").map(function(el){
      return { id: attr(el, "data-loc") || FP.uid("l"), name: readText(el.querySelector(".loc-name")),
        coords: inputVal(el, ".loc-coords"), sunpath: photosIn(el, "sunpath") };
    });

    p.script = { mode: d.scriptMode === "treatment" ? "treatment" : "screenplay",
      html: d.scriptHTML || "", drawHTML: d.scriptDrawHTML || "", paper: d.paper || null };

    p.schedule = { days: d.scheduleHTML ? convertSchedule(d.scheduleHTML) : [] };

    if (d.camerasHTML !== undefined || d.lensSetsHTML !== undefined){
      p.cameras = all(parse(d.camerasHTML), ".cam-box").map(function(b){
        return { id: attr(b, "data-cam") || FP.uid("c"), brand: inputVal(b, ".cam-brand"), model: inputVal(b, ".cam-name") };
      });
      p.lensSets = all(parse(d.lensSetsHTML), ".lens-box").map(function(b){
        return { id: attr(b, "data-set") || FP.uid("ls"), brand: inputVal(b, ".lens-brand"), series: inputVal(b, ".lens-series"),
          lenses: all(b, ".lens-entry").map(function(e){
            return { id: attr(e, "data-lens") || FP.uid("ln"), name: readText(e.querySelector(".lens-name")),
              note: readText(e.querySelector(".lens-note")) };
          }) };
      });
    } else {
      // saved before a project could hold more than one camera and lens set
      p.cameras = [{ id: "1", brand: d.cameraBrand || "", model: d.cameraName || "" }];
      p.lensSets = [{ id: "1", brand: d.lensBrand || "", series: d.lensSeries || "",
        lenses: all(parse(d.lensesHTML), ".lens-entry").map(function(e){
          return { id: attr(e, "data-lens") || FP.uid("ln"), name: readText(e.querySelector(".lens-name")),
            note: readText(e.querySelector(".lens-note")) };
        }) }];
    }
    // the classic app always showed one empty box of each; an empty one carries nothing
    p.cameras = p.cameras.filter(function(c){ return c.brand || c.model; });
    p.lensSets = p.lensSets.filter(function(s){ return s.brand || s.series || s.lenses.length; });

    p.floorplan = { walls: d.floorWalls || {}, doors: d.floorDoors || {}, shapes: d.floorShapes || {},
      cams: d.floorCams || {}, props: d.floorProps || {} };
    p.cast = all(parse(d.castHTML), ".cast-entry .cast-name").map(readText).filter(Boolean);
    if (d.sun && typeof d.sun === "object") p.sun = Object.assign({}, p.sun, d.sun);
    var cs = convertCallsheet(d.callsheet);
    if (cs) p.callsheet = cs;

    var prefs = {};
    if (d.optionPrefs && typeof d.optionPrefs === "object"){
      Object.keys(d.optionPrefs).forEach(function(k){ if (OPTION_KEYS[k]) prefs[OPTION_KEYS[k]] = d.optionPrefs[k]; });
    }
    p.optionPrefs = prefs;
    p.exportVersions = (d.exportVersions && typeof d.exportVersions === "object") ? d.exportVersions : {};

    return FP.normalizeProject(p);
  }

  FP.legacy = { convert: convert };
})();
