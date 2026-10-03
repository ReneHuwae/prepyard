/* Breakdown page, Rev. 08: one card per scene. On the left, what the scene needs
   (name, summary, camera, light and notes); on the right, its floor plan and location
   photos, then every shot with its tags, action, crew notes and images. Everything here
   is edited in place and lives in the project, the same scenes the Shotlist shows. */
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
  function reducedMotion(){ return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  var LISTS = [
    { key: "camera", label: "Camera", placeholder: "Add a camera note…" },
    { key: "light",  label: "Light",  placeholder: "Add a lighting note…" },
    { key: "notes",  label: "Notes",  placeholder: "Add a note…" }
  ];
  // the image slots: where each lives in the model, and whether it holds one image or many
  var MEDIA = {
    floorplan:      { label: "Floor plan",      on: "scene", field: "floorplan",      multi: false },
    locationPhotos: { label: "Location photos", on: "scene", field: "locationPhotos", multi: true },
    shotFloorplan:  { label: "Shot floor plan", on: "shot",  field: "floorplan",      multi: false, short: "Floor plan" },
    storyboard:     { label: "Storyboard",      on: "shot",  field: "storyboard",     multi: true,  short: "Image" }
  };

  var H = null;
  var selfTyping = false;
  var mediaTarget = null;   // { kind, sceneId, shotId, replaceId }

  function sceneById(p, id){ for (var i = 0; i < p.scenes.length; i++) if (p.scenes[i].id === id) return p.scenes[i]; return null; }
  function shotIn(scene, id){ for (var i = 0; i < scene.shots.length; i++) if (scene.shots[i].id === id) return scene.shots[i]; return null; }
  function sceneLocation(scene){
    for (var i = 0; i < scene.shots.length; i++) if (scene.shots[i].location) return scene.shots[i].location;
    return "";
  }
  function slugline(scene){
    var loc = sceneLocation(scene);
    var a = [scene.intext, loc].filter(Boolean).join(". ");
    return [a, scene.daynight].filter(Boolean).join(", ");
  }
  function mediaList(p, t){
    var sc = sceneById(p, t.sceneId);
    if (!sc) return null;
    var m = MEDIA[t.kind];
    if (m.on === "scene") return sc[m.field];
    var sh = shotIn(sc, t.shotId);
    return sh ? sh[m.field] : null;
  }

  // ---------- drawing ----------
  function listHTML(items, attrs, placeholder, aria){
    var lines = items.length ? items : [""];
    return '<ul class="bd-list">' + lines.map(function(t, i){
      return '<li><input class="bd-li" ' + attrs + ' data-li="' + i + '" value="' + esc(t) + '" placeholder="' + esc(placeholder) + '"' +
        ' aria-label="' + esc(aria + ", line " + (i + 1)) + '" autocomplete="off"></li>';
    }).join("") + '</ul>';
  }
  function slotHTML(scene, shot, kind){
    var m = MEDIA[kind];
    var list = (shot || scene)[m.field];
    var ids = 'data-kind="' + kind + '"' + (shot ? ' data-shot-id="' + esc(shot.id) + '"' : "");
    if (shot){
      var src = list[0] && list[0].src;
      return '<button type="button" class="bshot-thumb' + (src ? " has" : "") + '" data-act="media" ' + ids +
        ' aria-label="' + esc((src ? "" : "Add ") + m.label.toLowerCase()) + '">' +
        (src ? '<img src="' + esc(src) + '" alt="">' + (list.length > 1 ? '<span class="thumb-n">' + list.length + '</span>' : "")
             : '<span>+ ' + esc(m.short) + '</span>') + '</button>';
    }
    if (!list.length){
      return '<button type="button" class="bslot" data-act="media" ' + ids + '><span>+ ' + esc(m.label) + '</span></button>';
    }
    return '<div class="bslot has' + (m.multi && list.length > 1 ? " many" : "") + '">' +
      '<span class="bslot-label">' + esc(m.label) + '</span>' +
      '<div class="bslot-grid">' + list.map(function(ph){
        return '<button type="button" class="bslot-img" data-act="media" ' + ids + ' aria-label="' + esc(m.label) + '"><img src="' + esc(ph.src) + '" alt=""></button>';
      }).join("") +
      (m.multi ? '<button type="button" class="bslot-add" data-act="media-add" ' + ids + ' aria-label="Add ' + esc(m.label.toLowerCase()) + '">+</button>' : "") +
      '</div></div>';
  }
  function shotHTML(scene, shot, label){
    var tags = [shot.size, shot.lens, shot.grip, shot.movement].filter(Boolean);
    return '<div class="bshot-row" data-shot-id="' + esc(shot.id) + '">' +
      '<button type="button" class="bnum" data-act="reveal-shot" title="Show in shot list" aria-label="Shot ' + esc(scene.num + label) + ', show in shot list">' +
        esc(label) + '</button>' +
      '<div class="bshot-body">' +
        (tags.length ? '<div class="btags">' + tags.map(function(t){ return '<span>' + esc(t) + '</span>'; }).join("") + '</div>' : "") +
        '<textarea class="baction grow" rows="1" data-f="action" placeholder="Describe the shot…" aria-label="Action, shot ' + esc(label) + '">' + esc(shot.action) + '</textarea>' +
        '<div class="bcrew"><b>Crew notes</b>' + listHTML(shot.crewNotes, 'data-list="crewNotes"', "Add a crew note…", "Crew note, shot " + label) + '</div>' +
      '</div>' +
      slotHTML(scene, shot, "shotFloorplan") +
      slotHTML(scene, shot, "storyboard") +
    '</div>';
  }
  function cardHTML(p, scene){
    var labels = FP.shotNumbers(scene);
    return '<article class="bcard" data-scene="' + esc(scene.id) + '">' +
      '<div class="bcard-left">' +
        '<div class="bcard-eyebrow"><span class="bcard-scene">Sc ' + esc(scene.num) + '</span><span class="bcard-slug">' + esc(slugline(scene)) + '</span>' +
          '<button type="button" class="bcard-menu" data-act="scene-menu" aria-label="Scene ' + esc(scene.num) + ' options">⋯</button></div>' +
        '<input class="bcard-title" data-sf="name" value="' + esc(scene.name) + '" placeholder="Untitled scene" aria-label="Scene name, scene ' + esc(scene.num) + '" autocomplete="off">' +
        '<textarea class="bcard-summary grow" rows="1" data-sf="summary" placeholder="One-line summary…" aria-label="Summary, scene ' + esc(scene.num) + '">' + esc(scene.summary) + '</textarea>' +
        LISTS.map(function(l){
          return '<div class="btag"><b>' + esc(l.label) + '</b>' + listHTML(scene[l.key], 'data-list="' + l.key + '"', l.placeholder, l.label + ", scene " + scene.num) + '</div>';
        }).join("") +
      '</div>' +
      '<div class="bcard-right">' +
        '<div class="bslots">' + slotHTML(scene, null, "floorplan") + slotHTML(scene, null, "locationPhotos") + '</div>' +
        '<div class="bshots">' + (scene.shots.length
          ? scene.shots.map(function(sh, i){ return shotHTML(scene, sh, labels[i].label); }).join("")
          : '<p class="bshots-empty">No shots yet.</p>') + '</div>' +
        '<button type="button" class="btn ghost bcard-addshot" data-act="add-shot">+ Add shot</button>' +
      '</div>' +
    '</article>';
  }
  function countText(p){ return p.scenes.length ? p.scenes.length + (p.scenes.length === 1 ? " scene" : " scenes") : "No scenes yet"; }

  function render(host, p){
    H = host;
    host.innerHTML =
      '<div class="workwindow breakdown">' +
        '<div class="pg-toolbar">' +
          '<div class="left"><h3>Breakdown</h3><span class="count" data-bd="count"></span></div>' +
          '<div class="right">' +
            '<button type="button" class="btn ghost" data-act="export-pdf">Export Breakdown PDF</button>' +
          '</div>' +
        '</div>' +
        '<div class="bd-cards" data-bd="body"></div>' +
        '<input type="file" accept="image/*,.heic,.heif" hidden data-bd="file">' +
      '</div>';
    drawBody(p);
    bind(host);
  }
  function drawBody(p){
    H.querySelector('[data-bd="count"]').textContent = countText(p);
    var body = H.querySelector('[data-bd="body"]');
    if (!p.scenes.length){
      body.innerHTML = '<div class="bd-empty"><p>No scenes yet. Scenes come from the Script page or the Shot list, and each one gets a card here.</p>' +
        '<button type="button" class="btn solid" data-act="add-scene">+ Add scene</button></div>';
      return;
    }
    body.innerHTML = p.scenes.map(function(sc){ return cardHTML(p, sc); }).join("");
    body.querySelectorAll("textarea.grow").forEach(autoGrow);
  }
  function autoGrow(ta){ ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }

  function focusKey(el){
    var card = el.closest(".bcard"), row = el.closest(".bshot-row");
    return { scene: card && card.getAttribute("data-scene"), shot: row && row.getAttribute("data-shot-id"),
      sf: el.getAttribute("data-sf"), f: el.getAttribute("data-f"), list: el.getAttribute("data-list"), li: el.getAttribute("data-li") };
  }
  function findByKey(k){
    var base = '.bcard[data-scene="' + k.scene + '"]' + (k.shot ? ' .bshot-row[data-shot-id="' + k.shot + '"]' : "");
    var sel = k.sf ? base + ' [data-sf="' + k.sf + '"]'
      : k.f ? base + ' [data-f="' + k.f + '"]'
      : k.list ? base + ' [data-list="' + k.list + '"][data-li="' + k.li + '"]' : null;
    if (!sel) return null;
    var all = H.querySelectorAll(sel);
    // a scene's own lists sit outside its shot rows
    for (var i = 0; i < all.length; i++) if (k.shot || !all[i].closest(".bshot-row")) return all[i];
    return null;
  }
  function redraw(p){
    var a = document.activeElement, keep = null;
    if (a && H.contains(a) && a.matches("input, textarea")) keep = Object.assign(focusKey(a), { s: a.selectionStart, e: a.selectionEnd });
    drawBody(p);
    if (!keep) return;
    var el = findByKey(keep);
    if (!el) return;
    el.focus({ preventScroll: true });
    try { el.setSelectionRange(keep.s, keep.e); } catch (err){}
  }
  function focusLine(k){
    var el = findByKey(k);
    if (!el) return;
    el.focus();
    var n = el.value.length;
    try { el.setSelectionRange(n, n); } catch (err){}
  }

  // ---------- changes ----------
  function typed(fn, key){
    selfTyping = true;
    try { FP.change(fn, key); } finally { selfTyping = false; }
  }
  function listOwner(p, k){
    var sc = sceneById(p, k.scene);
    if (!sc) return null;
    return k.shot ? shotIn(sc, k.shot) : sc;
  }
  function onInput(e){
    var el = e.target;
    if (!el.matches("input, textarea")) return;
    var k = focusKey(el);
    if (!k.scene) return;
    if (el.tagName === "TEXTAREA") autoGrow(el);
    var v = el.value;
    if (k.sf){
      typed(function(p){ var sc = sceneById(p, k.scene); if (sc) sc[k.sf] = v; }, "bd:" + k.scene + ":" + k.sf);
    } else if (k.f){
      typed(function(p){ var o = listOwner(p, k); if (o) o[k.f] = v; }, "bd:" + k.shot + ":" + k.f);
    } else if (k.list){
      var i = +k.li;
      typed(function(p){
        var o = listOwner(p, k);
        if (!o) return;
        while (o[k.list].length <= i) o[k.list].push("");
        o[k.list][i] = v;
      }, "bd:" + (k.shot || k.scene) + ":" + k.list + ":" + i);
    }
  }
  function onKeydown(e){
    var el = e.target;
    if (!el.matches || !el.matches("input.bd-li")) return;
    var k = focusKey(el), i = +k.li;
    if (e.key === "Enter"){
      e.preventDefault();
      var before = el.value.slice(0, el.selectionStart), after = el.value.slice(el.selectionEnd);
      FP.change(function(p){
        var o = listOwner(p, k);
        if (!o) return;
        while (o[k.list].length <= i) o[k.list].push("");
        o[k.list].splice(i, 1, before, after);
      });
      focusLine(Object.assign({}, k, { li: String(i + 1) }));
      var nx = findByKey(Object.assign({}, k, { li: String(i + 1) }));
      if (nx) try { nx.setSelectionRange(0, 0); } catch (err){}
    } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0 && i > 0){
      e.preventDefault();
      var prevLen = 0, rest = el.value;
      FP.change(function(p){
        var o = listOwner(p, k);
        if (!o || o[k.list].length <= i) return;
        prevLen = o[k.list][i - 1].length;
        o[k.list].splice(i - 1, 2, o[k.list][i - 1] + rest);
      });
      var pv = findByKey(Object.assign({}, k, { li: String(i - 1) }));
      if (pv){ pv.focus(); try { pv.setSelectionRange(prevLen, prevLen); } catch (err){} }
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.altKey){
      var to = findByKey(Object.assign({}, k, { li: String(i + (e.key === "ArrowDown" ? 1 : -1)) }));
      if (to){ e.preventDefault(); to.focus(); }
    }
  }

  function addShot(sceneId){
    var id = null;
    FP.change(function(p){
      var sc = sceneById(p, sceneId);
      if (!sc) return;
      var shot = FP.blankShot({ location: sceneLocation(sc) });
      sc.shots.push(shot);
      id = shot.id;
    });
    var f = id && H.querySelector('.bshot-row[data-shot-id="' + id + '"] [data-f="action"]');
    if (f) f.focus();
  }
  function addScene(){
    var id = null;
    FP.change(function(p){
      var sc = FP.blankScene({ num: String(FP.nextSceneNumber(p)), shots: [FP.blankShot()] });
      p.scenes.push(sc);
      id = sc.id;
    });
    var f = id && H.querySelector('.bcard[data-scene="' + id + '"] [data-sf="name"]');
    if (f){ f.focus(); f.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }); }
  }

  // ---------- images ----------
  function pickImages(t){
    mediaTarget = t;
    var input = H.querySelector('[data-bd="file"]');
    input.multiple = MEDIA[t.kind].multi && !t.replaceId;
    input.click();
  }
  function onFiles(){
    var input = this, files = Array.prototype.slice.call(input.files || []);
    input.value = "";
    var t = mediaTarget;
    mediaTarget = null;
    if (!files.length || !t) return;
    var m = MEDIA[t.kind];
    if (!m.multi) files = files.slice(0, 1);
    Promise.all(files.map(function(f){ return FP.readImageFile(f, m.on === "scene" ? 1400 : 900, 0.74); })).then(function(srcs){
      FP.change(function(p){
        var list = mediaList(p, t);
        if (!list) return;
        var items = srcs.map(function(src){ return { id: FP.uid("ph"), src: src }; });
        if (t.replaceId){
          var at = list.findIndex(function(x){ return x.id === t.replaceId; });
          if (at !== -1) list.splice(at, 1, items[0]); else list.push(items[0]);
        } else if (!m.multi){
          list.splice(0, list.length, items[0]);
        } else {
          items.forEach(function(it){ list.push(it); });
        }
      });
      if (FP.pages.breakdown.galleryOpen) openGallery(t);
    }, function(err){ toast(err.message || "Couldn't add that image.", 5000); });
  }
  // every image in a slot, large, with Replace and Remove on each
  function openGallery(t){
    var p = FP.project(), list = mediaList(p, t);
    if (!list || !list.length){ FP.closeModal(); return; }
    var m = MEDIA[t.kind], sc = sceneById(p, t.sceneId);
    var title = m.label + ", scene " + sc.num;
    if (t.shotId){
      var idx = sc.shots.findIndex(function(s){ return s.id === t.shotId; });
      title = m.label + ", shot " + sc.num + "/" + FP.shotNumbers(sc)[idx].label;
    }
    FP.pages.breakdown.galleryOpen = true;
    var body = FP.openModal(title,
      '<div class="bd-gallery">' + list.map(function(ph){
        return '<figure data-ph="' + esc(ph.id) + '"><img src="' + esc(ph.src) + '" alt="">' +
          '<figcaption><button type="button" class="btn ghost" data-g="replace">Replace</button>' +
          '<button type="button" class="btn ghost" data-g="remove">Remove</button></figcaption></figure>';
      }).join("") + '</div>' +
      (m.multi ? '<div><button type="button" class="btn solid" data-g="add">+ Add images</button></div>' : ""),
      function(){ FP.pages.breakdown.galleryOpen = false; });
    body.closest(".modal").classList.add("modal-wide");
    body.addEventListener("click", function(e){
      var b = e.target.closest("[data-g]");
      if (!b) return;
      var fig = b.closest("figure"), phId = fig && fig.getAttribute("data-ph");
      var g = b.getAttribute("data-g");
      if (g === "add") pickImages(Object.assign({}, t, { replaceId: null }));
      else if (g === "replace") pickImages(Object.assign({}, t, { replaceId: phId }));
      else if (g === "remove"){
        FP.change(function(p){
          var l = mediaList(p, t);
          if (!l) return;
          var at = l.findIndex(function(x){ return x.id === phId; });
          if (at !== -1) l.splice(at, 1);
        });
        toast("Image removed. Undo brings it back.");
        openGallery(t);
      }
    });
  }

  function sceneMenu(btn, sceneId){
    var p = FP.project(), sc = sceneById(p, sceneId);
    if (!sc) return;
    var inScript = p.script.html.indexOf('data-scene-id="' + sceneId + '"') !== -1;
    FP.openMenu(btn, [
      { label: "Add shot", onClick: function(){ addShot(sceneId); } },
      { label: "Show in shot list", disabled: !sc.shots.length, onClick: function(){
        if (FP.pages.shotlist && FP.pages.shotlist.revealShot) FP.pages.shotlist.revealShot(sc.shots[0].id);
      } },
      { label: "Show in script", disabled: !inScript, onClick: function(){
        FP.showPage("script");
        if (FP.pages.script && FP.pages.script.revealScene) FP.pages.script.revealScene(sceneId);
      } }
    ], { alignRight: true });
  }

  function bind(host){
    host.addEventListener("input", onInput);
    host.addEventListener("keydown", onKeydown);
    host.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var act = b.getAttribute("data-act");
      var card = b.closest(".bcard"), sceneId = card && card.getAttribute("data-scene");
      if (act === "export-pdf") FP.exports.breakdown();
      else if (act === "add-scene") addScene();
      else if (act === "add-shot") addShot(sceneId);
      else if (act === "scene-menu"){ e.stopPropagation(); sceneMenu(b, sceneId); }
      else if (act === "reveal-shot"){
        var id = b.closest(".bshot-row").getAttribute("data-shot-id");
        if (FP.pages.shotlist && FP.pages.shotlist.revealShot) FP.pages.shotlist.revealShot(id);
      } else if (act === "media" || act === "media-add"){
        var t = { kind: b.getAttribute("data-kind"), sceneId: sceneId, shotId: b.getAttribute("data-shot-id") || null };
        var list = mediaList(FP.project(), t);
        if (act === "media-add" || !list || !list.length) pickImages(t);
        else openGallery(t);
      }
    });
    host.querySelector('[data-bd="file"]').addEventListener("change", onFiles);
  }

  FP.pages.breakdown = {
    galleryOpen: false,
    render: render,
    update: function(host, p){
      if (!H) return;
      if (selfTyping){
        H.querySelector('[data-bd="count"]').textContent = countText(p);
        return;
      }
      redraw(p);
    },
    leave: function(){ H = null; },
    revealScene: function(sceneId){
      FP.showPage("breakdown");
      var card = H && H.querySelector('.bcard[data-scene="' + sceneId + '"]');
      if (card) card.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    }
  };
})();
