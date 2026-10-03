/* Camera page, Rev. 08: the camera bodies and lens sets on this job. Every lens named
   here becomes an option in the Lens column of the shot list and a field of view on the
   floor plan. */
(function(){
  "use strict";
  var FP = window.FP;

  var CAMERA_MODELS = {
    "ARRI": ["Alexa 35","Alexa Mini LF","Alexa Mini","Alexa LF","Alexa SXT W","Alexa Classic","Alexa 65","Amira","Alexa Plus"],
    "RED": ["V-Raptor 8K VV","V-Raptor XL 8K VV","Komodo-X","Komodo 6K","Monstro 8K VV","Helium 8K S35","Gemini 5K S35","Ranger Monstro"],
    "Sony": ["Venice 2","Venice","Burano","FX9","FX6","FX3","FX30","A7S III"],
    "Panasonic": ["Varicam LT","Varicam 35","EVA1","Lumix S1H","Lumix GH7","Lumix GH6","Lumix S5 II"],
    "FreeFly": ["Ember S5K","Ember S2.5K","Wave"],
    "Blackmagic": ["URSA Cine 12K","URSA Mini Pro 12K","URSA Broadcast G2","Pyxis 6K","Pocket 6K Pro","Pocket 6K G2","Pocket 4K"],
    "Canon": ["C400","C500 Mk II","C300 Mk III","C80","C70","R5 C"],
    "Nikon": ["Z9","Z8","Z6 III"],
    "Phantom": ["Flex4K","VEO 4K","TMX 7510"],
    "Z CAM": ["E2-F8","E2-S6","E2-M4"],
    "Kinefinity": ["MAVO Edge 8K","MAVO Edge 6K","MAVO LF"],
    "Fujifilm": ["GFX100 II","X-H2S"]
  };
  var LENS_SERIES = {
    "Zeiss": ["Supreme Prime","Supreme Prime Radiance","Master Prime","Ultra Prime","Compact Prime CP.3","Compact Prime CP.2","Super Speed","Standard Speed","Nano Prime"],
    "Leica": ["Summilux-C","Summicron-C","Leica-R","Thalia","M 0.8","Elcan"],
    "Atlas": ["Orion Anamorphic","Orion Silver Edition","Mercury Anamorphic"],
    "Angenieux": ["Optimo","Optimo Ultra 12x","Optimo Prime","Type EZ-1","Type EZ-2"],
    "Cooke": ["S4/i","S7/i","S8/i","Panchro/i Classic","Anamorphic/i","Varotal/i","miniS4/i"],
    "ARRI": ["Signature Prime","Signature Zoom","Master Anamorphic","Ultra Wide Zoom"],
    "Canon": ["Sumire Prime","CN-E Prime","CN-E Zoom","Flex Zoom","K35"],
    "Fujinon": ["Premista","Cabrio","Alura","MK"],
    "Sigma": ["Cine Prime FF","Cine Zoom","Classic Prime"],
    "Schneider": ["Xenon FF","Cine-Xenar III"],
    "Tokina": ["Vista Prime","Vista Beyond","Cinema ATX"],
    "Laowa": ["Nanomorph","Ranger","Proteus 2x","Zero-D"],
    "Panavision": ["Primo","Primo Artiste","C Series","G Series","T Series","Ultra Speed","Sphero 65"],
    "Tribe7": ["Blackwing7"],
    "Vantage": ["Hawk V-Lite","Hawk 65","Hawk Class-X","MiniHawk"],
    "DZOFilm": ["Vespid Prime","Pictor Zoom","Arles FF"],
    "Sirui": ["Venus Anamorphic","Jupiter Prime"],
    "Lomo": ["Round Front Anamorphic","Square Front Anamorphic"]
  };
  var PRIMES = ["16mm","18mm","21mm","25mm","32mm","40mm","42mm","50mm","72mm","75mm","100mm","135mm"];
  var ZOOMS = ["18-55mm","20-55mm","50-125mm","25-250mm"];

  function esc(s){ return FP.esc(s); }
  function opts(list){ return list.map(function(v){ return '<option value="' + esc(v) + '"></option>'; }).join(""); }
  function modelsFor(map, brand){
    var b = String(brand || "").trim().toLowerCase();
    if (!b) return Object.keys(map).reduce(function(all, k){ return all.concat(map[k]); }, []);
    var key = Object.keys(map).filter(function(k){ return k.toLowerCase() === b; })[0];
    return key ? map[key] : [];
  }
  function byId(list, id){ for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  // bare numbers read as millimetres
  function lensName(v){ var s = String(v || "").trim(); return /^[\d.]+$/.test(s) ? s + "mm" : s; }

  function cameraHTML(c, i){
    return '<div class="cam-card" data-rec="' + esc(c.id) + '">' +
      '<div class="cam-card-head"><span class="cam-eyebrow">Camera ' + String.fromCharCode(65 + (i % 26)) + '</span>' +
        '<button type="button" class="link-btn danger" data-act="del-camera">Remove</button></div>' +
      '<div class="fld-row">' +
        FP.field("Brand", FP.input("brand", c.brand, 'list="camBrands" placeholder="Choose or type"')) +
        FP.field("Model", FP.input("model", c.model, 'list="camModels-' + esc(c.id) + '" placeholder="e.g. Alexa 35"') +
          '<datalist id="camModels-' + esc(c.id) + '">' + opts(modelsFor(CAMERA_MODELS, c.brand)) + '</datalist>') +
      '</div></div>';
  }
  function lensSetHTML(s){
    var have = {};
    s.lenses.forEach(function(l){ have[l.name.trim()] = true; });
    var chips = function(list){
      return list.map(function(v){
        return '<button type="button" class="chip' + (have[v] ? " on" : "") + '" data-act="preset" data-lens="' + esc(v) + '"' +
          ' aria-pressed="' + (have[v] ? "true" : "false") + '">' + esc(v) + '</button>';
      }).join("");
    };
    return '<div class="cam-card lens-card" data-rec="' + esc(s.id) + '">' +
      '<div class="cam-card-head"><span class="cam-eyebrow">Lens set</span>' +
        '<button type="button" class="link-btn danger" data-act="del-set">Remove</button></div>' +
      '<div class="fld-row">' +
        FP.field("Brand", FP.input("brand", s.brand, 'list="lensBrands" placeholder="Choose or type"')) +
        FP.field("Series", FP.input("series", s.series, 'list="lensSeries-' + esc(s.id) + '" placeholder="e.g. Supreme Prime"') +
          '<datalist id="lensSeries-' + esc(s.id) + '">' + opts(modelsFor(LENS_SERIES, s.brand)) + '</datalist>') +
      '</div>' +
      '<div class="chips"><span>Primes</span>' + chips(PRIMES) + '</div>' +
      '<div class="chips"><span>Zooms</span>' + chips(ZOOMS) + '</div>' +
      '<div class="lens-list" data-coll="lenses">' + (s.lenses.length ? s.lenses.map(function(l){
        return '<div class="lens-row" data-rec="' + esc(l.id) + '">' +
          FP.input("name", l.name, 'class="lens-name" placeholder="e.g. 32mm" aria-label="Lens"') +
          FP.input("note", l.note, 'class="lens-note" placeholder="Note (optional)" aria-label="Lens note"') +
          '<button type="button" class="x-btn" data-act="del-lens" aria-label="Remove ' + esc(l.name || "lens") + '">×</button></div>';
      }).join("") : '<p class="muted-note">No lenses yet. Tap the focal lengths above, or add one by hand.</p>') + '</div>' +
      '<button type="button" class="btn ghost" data-act="add-lens">+ Add lens</button>' +
    '</div>';
  }

  function change(fn){ FP.change(fn); }
  function focusLast(sel){
    var page = FP.pages.camera.host();
    var all = page && page.querySelectorAll(sel);
    if (all && all.length) all[all.length - 1].focus();
  }

  FP.formPage("camera", {
    html: function(p){
      var lenses = p.lensSets.reduce(function(n, s){ return n + s.lenses.length; }, 0);
      return '<div class="workwindow formpage camera">' +
        '<div class="pg-toolbar"><div class="left"><h3>Camera and lenses</h3><span class="count">' +
          p.cameras.length + (p.cameras.length === 1 ? " camera, " : " cameras, ") + lenses + (lenses === 1 ? " lens" : " lenses") + '</span></div></div>' +
        '<datalist id="camBrands">' + opts(Object.keys(CAMERA_MODELS)) + '</datalist>' +
        '<datalist id="lensBrands">' + opts(Object.keys(LENS_SERIES)) + '</datalist>' +
        '<div class="fp-section"><div class="fp-section-head"><h4>Cameras</h4>' +
          '<button type="button" class="btn ghost" data-act="add-camera">+ Add camera</button></div>' +
          '<div class="card-grid" data-coll="cameras">' + (p.cameras.length ? p.cameras.map(cameraHTML).join("")
            : '<p class="muted-note">No camera yet.</p>') + '</div></div>' +
        '<div class="fp-section"><div class="fp-section-head"><h4>Lenses</h4>' +
          '<p class="fp-hint">Every lens here is an option in the shot list\'s Lens column.</p>' +
          '<button type="button" class="btn ghost" data-act="add-set">+ Add lens set</button></div>' +
          '<div class="card-grid wide" data-coll="lensSets">' + (p.lensSets.length ? p.lensSets.map(lensSetHTML).join("")
            : '<p class="muted-note">No lens set yet.</p>') + '</div></div>' +
      '</div>';
    },
    resolve: function(p, coll, rec){
      if (coll === "cameras") return byId(p.cameras, rec);
      if (coll === "lensSets") return byId(p.lensSets, rec);
      if (coll === "lenses"){
        for (var i = 0; i < p.lensSets.length; i++){ var l = byId(p.lensSets[i].lenses, rec); if (l) return l; }
      }
      return null;
    },
    // a brand changes which models are suggested
    typed: function(H, p, c, el){
      if (c.k !== "brand") return;
      var map = c.coll === "cameras" ? CAMERA_MODELS : LENS_SERIES;
      var dl = H.querySelector("#" + (c.coll === "cameras" ? "camModels-" : "lensSeries-") + CSS.escape(c.rec));
      if (dl) dl.innerHTML = opts(modelsFor(map, el.value));
      if (c.coll === "cameras") return;
    },
    committed: function(el, c){
      if (c.coll === "lenses" && c.k === "name"){
        var v = lensName(el.value);
        if (v !== el.value) FP.change(function(p){ var r = FP.pages.camera.resolve(p, "lenses", c.rec); if (r) r.name = v; });
      }
      if (c.coll === "cameras" && c.k === "model" && /^alexa\s*35$/i.test(el.value.trim())) confetti(el);
    },
    actions: {
      "add-camera": function(){
        change(function(p){ p.cameras.push({ id: FP.uid("c"), brand: "", model: "" }); });
        focusLast('[data-coll="cameras"] [data-k="brand"]');
      },
      "del-camera": function(b, c){
        change(function(p){ p.cameras = p.cameras.filter(function(x){ return x.id !== c.rec; }); });
        FP.toast("Camera removed. Undo brings it back.");
      },
      "add-set": function(){
        change(function(p){ p.lensSets.push({ id: FP.uid("ls"), brand: "", series: "", lenses: [] }); });
        focusLast('[data-coll="lensSets"] > .lens-card [data-k="brand"]');
      },
      "del-set": function(b, c){
        change(function(p){ p.lensSets = p.lensSets.filter(function(x){ return x.id !== c.rec; }); });
        FP.toast("Lens set removed. Undo brings it back.");
      },
      "add-lens": function(b){
        var setId = b.closest(".lens-card").getAttribute("data-rec");
        change(function(p){ var s = byId(p.lensSets, setId); if (s) s.lenses.push({ id: FP.uid("ln"), name: "", note: "" }); });
        var card = FP.pages.camera.host().querySelector('.lens-card[data-rec="' + setId + '"]');
        var names = card && card.querySelectorAll(".lens-name");
        if (names && names.length) names[names.length - 1].focus();
      },
      "del-lens": function(b, c){
        change(function(p){ p.lensSets.forEach(function(s){ s.lenses = s.lenses.filter(function(l){ return l.id !== c.rec; }); }); });
      },
      // a focal length chip toggles that lens in the set
      preset: function(b){
        var setId = b.closest(".lens-card").getAttribute("data-rec"), name = b.getAttribute("data-lens");
        change(function(p){
          var s = byId(p.lensSets, setId);
          if (!s) return;
          var at = s.lenses.findIndex(function(l){ return l.name.trim() === name; });
          if (at !== -1) s.lenses.splice(at, 1);
          else {
            s.lenses.push({ id: FP.uid("ln"), name: name, note: "" });
            var mm = function(n){ return parseFloat(n) || 0; };
            s.lenses.sort(function(a, z){ return mm(a.name) - mm(z.name); });
          }
        });
      }
    },
    api: {
      resolve: function(p, coll, rec){
        for (var i = 0; i < p.lensSets.length; i++){ var l = byId(p.lensSets[i].lenses, rec); if (l) return l; }
        return null;
      }
    }
  });

  // the house camera gets a little celebration
  function confetti(originEl){
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
    document.body.appendChild(cv);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = cv.width = window.innerWidth * dpr, Hh = cv.height = window.innerHeight * dpr;
    var ctx = cv.getContext("2d");
    var r = originEl.getBoundingClientRect(), ox = (r.left + r.width / 2) * dpr, oy = (r.top + r.height / 2) * dpr;
    var COLORS = ["#FF4311", "#101112", "#D6D6D3", "#FFB199", "#8A8D92"];
    var parts = [];
    for (var i = 0; i < 150; i++){
      var a = Math.random() * Math.PI * 2, sp = (Math.random() * 13 + 4) * dpr;
      parts.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6 * dpr, w: (5 + Math.random() * 6) * dpr,
        h: (8 + Math.random() * 9) * dpr, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        color: COLORS[(Math.random() * COLORS.length) | 0] });
    }
    var start = performance.now(), LIFE = 3200;
    var reap = setTimeout(function(){ cv.remove(); }, LIFE + 900);
    requestAnimationFrame(function frame(now){
      if (!cv.isConnected) return;
      var t = now - start, alive = 0;
      ctx.clearRect(0, 0, W, Hh);
      parts.forEach(function(q){
        q.vx *= 0.99; q.vy = q.vy * 0.99 + 0.4 * dpr; q.x += q.vx; q.y += q.vy; q.rot += q.vr;
        if (q.y < Hh + 60 * dpr) alive++;
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.globalAlpha = Math.max(0, 1 - t / LIFE); ctx.fillStyle = q.color;
        ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); ctx.restore();
      });
      if (alive && t < LIFE) requestAnimationFrame(frame); else { clearTimeout(reap); cv.remove(); }
    });
  }
})();
