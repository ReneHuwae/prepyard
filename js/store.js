/* FilmPrep data layer: the project model, storage, undo/redo and autosave.
   Every page draws itself from FP.project() and changes it through FP.change(),
   so saving, undo and the page markup all work from the same data. */
(function(){
  "use strict";
  var FP = window.FP = window.FP || {};

  FP.uid = function(prefix){
    return (prefix || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  // ---------- events ----------
  var listeners = {};
  FP.on = function(evt, fn){ (listeners[evt] = listeners[evt] || []).push(fn); };
  FP.emit = function(evt, data){ (listeners[evt] || []).slice().forEach(function(fn){ fn(data); }); };

  // ---------- shotlist vocabulary ----------
  // `legacy` is the column name the classic app used in its saved markup.
  FP.COLUMNS = [
    { key: "startTc",  legacy: "START TIMECODE", label: "Start TC", hideable: true },
    { key: "duration", legacy: "DURATION",       label: "Duration", hideable: true },
    { key: "scene",    legacy: "SCENE",          label: "Scene",    derived: true },
    { key: "shot",     legacy: "SHOT",           label: "Shot",     derived: true },
    { key: "sub",      legacy: "SUB-SHOT",       label: "Sub",      hideable: true },
    { key: "location", legacy: "LOCATION",       label: "Location" },
    { key: "special",  legacy: "SPECIAL",        label: "Special",  hideable: true },
    { key: "size",     legacy: "SIZE",           label: "Size" },
    { key: "shotType", legacy: "SHOT TYPE",      label: "Shot type", hideable: true },
    { key: "lens",     legacy: "LENS",           label: "Lens",     hideable: true },
    { key: "grip",     legacy: "GRIP",           label: "Grip",     hideable: true },
    { key: "movement", legacy: "MOVEMENT",       label: "Movement", hideable: true },
    { key: "action",   legacy: "ACTION",         label: "Action" },
    { key: "copy",     legacy: "COPY",           label: "Copy",     hideable: true },
    { key: "notes",    legacy: "NOTES",          label: "Notes",    hideable: true }
  ];
  FP.SHOT_FIELDS = FP.COLUMNS.filter(function(c){ return !c.derived; }).map(function(c){ return c.key; });

  FP.OPTIONS = {
    sub: ["", "A", "B", "C", "D", "E", "F", "G"],
    size: ["EWS", "WS", "FS", "MWS", "MS", "MCU", "CU", "ECU", "Various"],
    shotType: ["", "Single", "Clean single", "Dirty single", "2-shot", "3-shot", "Group", "OTS", "POV",
               "Insert", "Cutaway", "Establish", "Master"],
    grip: ["Tripod", "Handheld", "Gimbal", "Steadicam", "Dolly", "Slider", "Jib", "Drone", "Robot", "Cinesaddle"],
    movement: ["Static", "Pan left", "Pan right", "Tilt up", "Tilt down", "Push in", "Pull out",
               "Track left", "Track right", "Arc left", "Arc right", "Boom up", "Boom down",
               "Pedestal up", "Pedestal down", "Follow", "Whip pan", "Zoom in", "Zoom out",
               "Rack focus", "Reveal", "Tracking"],
    special: ["", "VFX", "SFX", "Stunt", "Drone permit", "Minor", "Animal", "Picture car",
              "Process trailer", "Crowd", "Special equipment"]
  };
  FP.INTEXT_OPTIONS = ["INT", "EXT", "INT/EXT"];
  FP.DAYNIGHT_OPTIONS = ["DAY", "NIGHT", "SUNRISE", "SUNSET", "DAWN", "DUSK"];

  // ---------- model ----------
  FP.blankShot = function(fields){
    var s = { id: FP.uid("s"), scriptRef: "", storyboard: [], floorplan: [], crewNotes: [] };
    FP.SHOT_FIELDS.forEach(function(k){ s[k] = ""; });
    return Object.assign(s, fields || {});
  };
  FP.blankScene = function(fields){
    return Object.assign({
      id: FP.uid("sc"), num: "", name: "", intext: "INT", daynight: "DAY", summary: "",
      camera: [], light: [], notes: [], locationPhotos: [], floorplan: [], shots: []
    }, fields || {});
  };
  FP.blankProject = function(name){
    return {
      app: "filmprep", version: 3, name: name || "Untitled project", savedAt: "",
      scenes: [], locations: [],
      script: { mode: "screenplay", html: "", drawHTML: "", paper: null },
      schedule: { days: [] },
      cameras: [], lensSets: [],
      floorplan: { walls: {}, doors: {}, shapes: {}, cams: {}, props: {} },
      cast: [],
      sun: { lat: "", lon: "", date: "", tz: "", zoom: "", rotate: "" },
      callsheet: { crew: [], cast: [], transport: [], production: {}, days: {} },
      optionPrefs: {}, exportVersions: {}
    };
  };

  function arr(v){ return Array.isArray(v) ? v : []; }
  function obj(v){ return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
  function str(v){ return v === undefined || v === null ? "" : String(v); }
  function photos(v){
    return arr(v).filter(function(p){ return p && p.src; })
      .map(function(p){ return { id: p.id || FP.uid("ph"), src: String(p.src) }; });
  }
  function lines(v){ return arr(v).map(str); }

  // Fills in anything a project file is missing, so every page can rely on the shape.
  FP.normalizeProject = function(p){
    var b = FP.blankProject(p && p.name);
    p = obj(p);
    var out = {
      app: "filmprep", version: 3, name: str(p.name) || b.name, savedAt: str(p.savedAt),
      scenes: arr(p.scenes).map(function(sc){
        sc = obj(sc);
        return FP.blankScene({
          id: sc.id || FP.uid("sc"), num: str(sc.num), name: str(sc.name),
          intext: str(sc.intext) || "INT", daynight: str(sc.daynight) || "DAY", summary: str(sc.summary),
          camera: lines(sc.camera), light: lines(sc.light), notes: lines(sc.notes),
          locationPhotos: photos(sc.locationPhotos), floorplan: photos(sc.floorplan),
          shots: arr(sc.shots).map(function(sh){
            sh = obj(sh);
            var fields = { id: sh.id || FP.uid("s"), scriptRef: str(sh.scriptRef),
              storyboard: photos(sh.storyboard), floorplan: photos(sh.floorplan), crewNotes: lines(sh.crewNotes) };
            FP.SHOT_FIELDS.forEach(function(k){ fields[k] = str(sh[k]); });
            return FP.blankShot(fields);
          })
        });
      }),
      locations: arr(p.locations).map(function(l){
        l = obj(l);
        return { id: str(l.id) || FP.uid("l"), name: str(l.name), coords: str(l.coords), sunpath: photos(l.sunpath) };
      }),
      script: Object.assign({}, b.script, obj(p.script)),
      schedule: { days: arr(obj(p.schedule).days).map(function(d){
        d = obj(d);
        return { id: d.id || FP.uid("d"), date: str(d.date), call: str(d.call) || "06:00",
          rows: arr(d.rows).filter(function(r){ return r && r.type; }).map(function(r){
            if (r.type === "break") return { id: r.id || FP.uid("r"), type: "break", label: str(r.label), mins: +r.mins || 0 };
            if (r.type === "scene") return { id: r.id || FP.uid("r"), type: "scene", sceneId: str(r.sceneId), scene: str(r.scene), done: !!r.done };
            return { id: r.id || FP.uid("r"), type: "shot", shotId: str(r.shotId), prep: +r.prep || 0, shoot: +r.shoot || 0 };
          }) };
      }) },
      cameras: arr(p.cameras).map(function(c){
        c = obj(c); return { id: str(c.id) || FP.uid("c"), brand: str(c.brand), model: str(c.model) };
      }),
      lensSets: arr(p.lensSets).map(function(s){
        s = obj(s);
        return { id: str(s.id) || FP.uid("ls"), brand: str(s.brand), series: str(s.series),
          lenses: arr(s.lenses).map(function(l){ l = obj(l); return { id: str(l.id) || FP.uid("ln"), name: str(l.name), note: str(l.note) }; }) };
      }),
      floorplan: Object.assign({}, b.floorplan, obj(p.floorplan)),
      cast: lines(p.cast),
      sun: Object.assign({}, b.sun, obj(p.sun)),
      callsheet: Object.assign({}, b.callsheet, obj(p.callsheet)),
      optionPrefs: obj(p.optionPrefs), exportVersions: obj(p.exportVersions)
    };
    return out;
  };

  FP.isV3Project = function(d){
    return !!(d && (d.app === "filmprep") && d.version === 3 && Array.isArray(d.scenes));
  };
  FP.isLegacyProject = function(d){
    return !!(d && (d.app === "prepyard" || d.app === "filmprep" || d.app === "decoupage") && typeof d.scenesHTML === "string");
  };
  // Reads anything FilmPrep has ever saved. Returns null when it isn't a project file.
  FP.projectFromFile = function(data){
    if (FP.isV3Project(data)) return FP.normalizeProject(data);
    if (FP.isLegacyProject(data) && FP.legacy) return FP.legacy.convert(data);
    return null;
  };

  // Shot numbers come from order plus the Sub column: a lettered sub-shot after A
  // keeps the number of the shot before it (1, 1B, 1C, 2 …).
  FP.shotNumbers = function(scene){
    var n = 0;
    return scene.shots.map(function(s){
      var sub = (s.sub || "").trim().toUpperCase();
      if (!sub || sub === "A" || n === 0) n++;
      return { num: n, sub: sub, label: n + sub };
    });
  };
  // When shots are deleted, the script text they were made from stops being highlighted.
  // Works on the saved script, so it applies whichever page is showing.
  FP.unlinkScriptRefs = function(project, refs){
    refs = (refs || []).filter(Boolean);
    if (!refs.length || !project.script.html) return;
    var t = document.createElement("template");
    t.innerHTML = project.script.html;
    var hit = false;
    refs.forEach(function(ref){
      var sel = '.script-shot-ref[data-script-ref="' + (window.CSS && CSS.escape ? CSS.escape(ref) : ref) + '"]';
      t.content.querySelectorAll(sel).forEach(function(sp){
        var parent = sp.parentNode;
        while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
        parent.removeChild(sp);
        hit = true;
      });
    });
    if (hit) project.script.html = t.innerHTML;
  };
  FP.nextSceneNumber = function(project){
    return project.scenes.reduce(function(max, s){ return Math.max(max, parseFloat(s.num) || 0); }, 0) + 1;
  };
  FP.countShots = function(project){
    return project.scenes.reduce(function(n, s){ return n + s.shots.length; }, 0);
  };

  // A copy where objects and arrays are new but strings are shared, so keeping
  // forty undo steps of a project full of photos costs almost nothing extra.
  function clone(v){
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === "object"){
      var o = {};
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]);
      return o;
    }
    return v;
  }
  FP.clone = clone;

  // ---------- storage (IndexedDB) ----------
  var DB_NAME = "filmprep", DB_VERSION = 1;
  var dbPromise = null;
  function openDB(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve, reject){
      if (!window.indexedDB){ reject(new Error("IndexedDB unavailable")); return; }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e){ reject(e); return; }
      req.onupgradeneeded = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains("index")) db.createObjectStore("index", { keyPath: "id" });
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
    return dbPromise;
  }
  function run(stores, mode, fn){
    return openDB().then(function(db){
      return new Promise(function(resolve, reject){
        var t = db.transaction(stores, mode);
        var result;
        t.oncomplete = function(){ resolve(result); };
        t.onerror = function(){ reject(t.error); };
        t.onabort = function(){ reject(t.error || new Error("aborted")); };
        var r = fn(t);
        if (r && "onsuccess" in r) r.onsuccess = function(){ result = r.result; };
      });
    });
  }

  // Used when the browser refuses IndexedDB (some private windows): work still
  // happens, it just lasts as long as the tab, and the app says so.
  var memory = { index: {}, projects: {}, meta: {} };
  FP.storageAvailable = true;

  FP.storage = {
    init: function(){
      return openDB().then(function(){ return true; }, function(){ FP.storageAvailable = false; return false; });
    },
    list: function(){
      if (!FP.storageAvailable){
        return Promise.resolve(Object.keys(memory.index).map(function(k){ return memory.index[k]; }));
      }
      return run(["index"], "readonly", function(t){ return t.objectStore("index").getAll(); })
        .then(function(list){
          return (list || []).sort(function(a, b){ return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
        });
    },
    load: function(id){
      if (!FP.storageAvailable) return Promise.resolve(memory.projects[id] ? clone(memory.projects[id]) : null);
      return run(["projects"], "readonly", function(t){ return t.objectStore("projects").get(id); })
        .then(function(rec){ return rec ? FP.normalizeProject(rec.data) : null; });
    },
    // `meta` may carry createdAt/updatedAt (used when importing); otherwise now.
    save: function(id, project, meta){
      meta = meta || {};
      var now = new Date().toISOString();
      if (!FP.storageAvailable){
        var prevM = memory.index[id];
        memory.index[id] = { id: id, name: project.name, createdAt: meta.createdAt || (prevM && prevM.createdAt) || now,
          updatedAt: meta.updatedAt || now };
        memory.projects[id] = clone(project);
        return Promise.resolve();
      }
      return run(["index", "projects"], "readwrite", function(t){
        var idx = t.objectStore("index");
        var g = idx.get(id);
        g.onsuccess = function(){
          var prev = g.result;
          idx.put({ id: id, name: project.name,
            createdAt: meta.createdAt || (prev && prev.createdAt) || now,
            updatedAt: meta.updatedAt || (meta.keepUpdated && prev ? prev.updatedAt : now) });
        };
        t.objectStore("projects").put({ id: id, data: project });
      });
    },
    rename: function(id, name){
      return this.load(id).then(function(p){
        if (!p) return;
        p.name = name;
        return FP.storage.save(id, p, { keepUpdated: true });
      });
    },
    remove: function(id){
      if (!FP.storageAvailable){ delete memory.index[id]; delete memory.projects[id]; return Promise.resolve(); }
      return run(["index", "projects"], "readwrite", function(t){
        t.objectStore("index").delete(id);
        t.objectStore("projects").delete(id);
      });
    },
    has: function(id){
      if (!FP.storageAvailable) return Promise.resolve(!!memory.index[id]);
      return run(["index"], "readonly", function(t){ return t.objectStore("index").getKey(id); })
        .then(function(k){ return k !== undefined; });
    },
    getMeta: function(key){
      if (!FP.storageAvailable) return Promise.resolve(memory.meta[key]);
      return run(["meta"], "readonly", function(t){ return t.objectStore("meta").get(key); })
        .then(function(r){ return r ? r.value : undefined; });
    },
    setMeta: function(key, value){
      if (!FP.storageAvailable){ memory.meta[key] = value; return Promise.resolve(); }
      return run(["meta"], "readwrite", function(t){ t.objectStore("meta").put({ key: key, value: value }); });
    }
  };

  FP.newProjectId = function(){ return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };

  // Projects the classic app kept in localStorage come across once each, keeping their
  // ids, names and dates. The originals are left in place, so the classic app still has
  // them. A project made later in the classic app is picked up on the next load.
  FP.importClassicProjects = function(){
    var list = [];
    try { list = JSON.parse(localStorage.getItem("filmprep:projects") || "[]"); } catch (e){ list = []; }
    if (!Array.isArray(list)) list = [];
    if (!list.length){
      try {
        var raw = localStorage.getItem("filmprep:autosave");
        if (raw){
          var d = JSON.parse(raw);
          if (FP.isLegacyProject(d)) list = [{ id: "classic-autosave", name: d.projectName, updatedAt: d.savedAt, _data: d }];
        }
      } catch (e){}
    }
    var imported = 0;
    return list.reduce(function(chain, entry){
      return chain.then(function(){
        if (!entry || !entry.id) return;
        return FP.storage.has(entry.id).then(function(exists){
          if (exists) return;
          var data = entry._data;
          if (!data){
            try { data = JSON.parse(localStorage.getItem("filmprep:project:" + entry.id) || "null"); } catch (e){ data = null; }
          }
          if (!FP.isLegacyProject(data)) return;
          var project;
          try { project = FP.legacy.convert(data); } catch (e){
            if (window.console) console.warn("FilmPrep: couldn't convert classic project", entry.id, e);
            return;
          }
          if (entry.name) project.name = entry.name;
          imported++;
          var stamp = entry.updatedAt || data.savedAt || new Date().toISOString();
          return FP.storage.save(entry.id, project, { createdAt: entry.createdAt || stamp, updatedAt: stamp });
        });
      });
    }, Promise.resolve()).then(function(){ return imported; });
  };

  // ---------- the open project, undo/redo, autosave ----------
  var HISTORY_LIMIT = 60;
  var COALESCE_MS = 1200;
  var session = null;

  FP.project = function(){ return session ? session.project : null; };
  FP.projectId = function(){ return session ? session.id : null; };

  FP.openSession = function(id, project){
    session = { id: id, project: FP.normalizeProject(project), past: [], future: [],
      lastKey: null, lastTime: 0, saveTimer: null, saving: null, dirty: false };
    FP.emit("history");
    FP.emit("open", session.project);
  };
  FP.closeSession = function(){
    var done = FP.flushSave();
    session = null;
    return done;
  };

  // Make a change to the project. `key` groups a burst of edits to the same field
  // (typing a sentence) into one undo step.
  FP.change = function(fn, key){
    if (!session) return;
    var now = Date.now();
    var coalesce = key && key === session.lastKey && (now - session.lastTime) < COALESCE_MS;
    var before = coalesce ? null : clone(session.project);
    fn(session.project);
    if (!coalesce){
      session.past.push(before);
      if (session.past.length > HISTORY_LIMIT) session.past.shift();
    }
    session.future = [];
    session.lastKey = key || null;
    session.lastTime = now;
    afterChange({ key: key });
  };
  // Bookkeeping that follows from the project itself (a new shot getting its schedule row),
  // saved but not an undo step of its own: undoing past it simply makes it happen again.
  FP.quietChange = function(fn){
    if (!session) return;
    fn(session.project);
    session.dirty = true;
    scheduleSave();
  };
  FP.canUndo = function(){ return !!(session && session.past.length); };
  FP.canRedo = function(){ return !!(session && session.future.length); };
  FP.undo = function(){
    if (!FP.canUndo()) return;
    session.future.push(clone(session.project));
    session.project = session.past.pop();
    session.lastKey = null;
    afterChange({ undo: true });
  };
  FP.redo = function(){
    if (!FP.canRedo()) return;
    session.past.push(clone(session.project));
    session.project = session.future.pop();
    session.lastKey = null;
    afterChange({ redo: true });
  };
  function afterChange(info){
    session.dirty = true;
    FP.emit("history");
    FP.emit("change", info);
    scheduleSave();
  }

  // ---------- autosave ----------
  FP.saveState = { status: "saved", at: null, error: null };
  function setSaveState(status, error){
    FP.saveState = { status: status, at: status === "saved" ? new Date() : FP.saveState.at, error: error || null };
    FP.emit("save", FP.saveState);
  }
  function scheduleSave(){
    clearTimeout(session.saveTimer);
    setSaveState("pending");
    session.saveTimer = setTimeout(FP.flushSave, 700);
  }
  FP.flushSave = function(){
    if (!session || !session.dirty) return Promise.resolve();
    clearTimeout(session.saveTimer);
    var s = session;
    s.dirty = false;
    s.project.savedAt = new Date().toISOString();
    var snapshot = clone(s.project);
    setSaveState("saving");
    s.saving = FP.storage.save(s.id, snapshot).then(function(){
      if (session === s && !s.dirty) setSaveState("saved");
    }, function(err){
      s.dirty = true;
      setSaveState("error", err);
    });
    return s.saving;
  };
  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") FP.flushSave(); });
  window.addEventListener("pagehide", function(){ FP.flushSave(); });

  // ---------- project files ----------
  FP.projectFileJSON = function(project){
    var p = clone(project);
    p.app = "filmprep"; p.version = 3; p.savedAt = new Date().toISOString();
    return JSON.stringify(p);
  };
})();
