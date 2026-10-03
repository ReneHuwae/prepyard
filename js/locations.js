/* Locations page, Rev. 08: a card per place, with its photo, name, address and the scenes
   shot there. A location's name is what the shot list's Location column uses, so renaming
   one here renames it on its shots; its coordinates give the callsheet its sun times. */
(function(){
  "use strict";
  var FP = window.FP;
  function esc(s){ return FP.esc(s); }
  function byId(list, id){ for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function norm(s){ return String(s || "").trim().toLowerCase(); }

  // the scenes that use a location, by name, and how many shots
  function usage(p, name){
    var n = norm(name), scenes = [], shots = 0;
    if (!n) return { scenes: scenes, shots: 0 };
    p.scenes.forEach(function(sc){
      var hit = sc.shots.filter(function(s){ return norm(s.location) === n; }).length;
      if (hit){ scenes.push(sc); shots += hit; }
    });
    return { scenes: scenes, shots: shots };
  }
  // names used in the shot list that aren't in the list yet
  function missing(p){
    var have = {}, out = [], seen = {};
    p.locations.forEach(function(l){ have[norm(l.name)] = true; });
    p.scenes.forEach(function(sc){ sc.shots.forEach(function(s){
      var n = norm(s.location);
      if (n && !have[n] && !seen[n]){ seen[n] = true; out.push(s.location.trim()); }
    }); });
    return out;
  }
  function mapsLink(l){
    var c = FP.parseCoords(l.coords);
    if (c) return "https://www.google.com/maps/search/?api=1&query=" + c.lat + "," + c.lon;
    if (l.address.trim()) return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(l.address.trim());
    return "";
  }
  function linkHTML(l){
    var link = mapsLink(l);
    return link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">Open map ↗</a>'
      : (l.coords.trim() ? '<span class="muted">Couldn\'t read these coordinates</span>' : "");
  }

  function cardHTML(p, l){
    var u = usage(p, l.name), ph = l.photos[0];
    return '<div class="loc-card" data-rec="' + esc(l.id) + '">' +
      '<button type="button" class="loc-photo' + (ph ? " has" : "") + '" data-act="photo" aria-label="' + (ph ? "Location photo" : "Add a photo") + '">' +
        (ph ? '<img src="' + esc(ph.src) + '" alt="">' + (l.photos.length > 1 ? '<span class="thumb-n">' + l.photos.length + '</span>' : "") : '<span>+ Photo</span>') + '</button>' +
      '<button type="button" class="x-btn loc-del" data-act="del" aria-label="Remove ' + esc(l.name || "location") + '">×</button>' +
      FP.input("name", l.name, 'class="loc-name" placeholder="Location name" aria-label="Location name"') +
      FP.input("address", l.address, 'class="loc-addr" placeholder="Address" aria-label="Address"') +
      FP.input("coords", l.coords, 'class="loc-coords" placeholder="Coordinates or a maps link" aria-label="Coordinates" spellcheck="false"') +
      '<div class="loc-links">' + linkHTML(l) + '</div>' +
      '<div class="loc-scenes">' + (u.scenes.length ? u.scenes.map(function(sc){
        return '<button type="button" class="loc-chip" data-act="scene" data-scene="' + esc(sc.id) + '" title="' + esc(sc.name || "Untitled scene") + '">Sc ' + esc(sc.num) + '</button>';
      }).join("") : '<span class="muted">No scenes here yet</span>') + '</div>' +
    '</div>';
  }

  var renameFrom = null;   // { id, name } when a name field gets focus
  var imgTarget = null;    // { id, replace }

  var page = FP.formPage("locations", {
    html: function(p){
      var miss = missing(p);
      return '<div class="workwindow formpage locations">' +
        '<div class="pg-toolbar"><div class="left"><h3>Locations</h3><span class="count">' +
          p.locations.length + (p.locations.length === 1 ? " location" : " locations") + '</span></div>' +
          '<div class="right"><button type="button" class="btn solid" data-act="add">+ Add location</button></div></div>' +
        (miss.length ? '<div class="loc-missing"><span>In the shot list but not here:</span>' + miss.map(function(n){
          return '<button type="button" class="chip" data-act="adopt" data-name="' + esc(n) + '">+ ' + esc(n) + '</button>';
        }).join("") + '</div>' : "") +
        (p.locations.length ? '<div class="loc-grid" data-coll="locations">' + p.locations.map(function(l){ return cardHTML(p, l); }).join("") + '</div>'
          : '<p class="muted-note pad">No locations yet. Add one here, or generate them from the script\'s scene headings.</p>') +
        '<input type="file" accept="image/*,.heic,.heif" multiple hidden data-loc-file>' +
      '</div>';
    },
    resolve: function(p, coll, rec){ return coll === "locations" ? byId(p.locations, rec) : null; },
    typed: function(H, p, c, el){
      if (c.k === "coords" || c.k === "address"){
        var l = byId(p.locations, c.rec);
        if (l) el.closest(".loc-card").querySelector(".loc-links").innerHTML = linkHTML(l);
      }
    },
    focused: function(el, c){ if (c.k === "name") renameFrom = { id: c.rec, name: el.value }; },
    // once a rename is done, the shots that used the old name follow it
    committed: function(el, c){
      if (c.k !== "name" || !renameFrom || renameFrom.id !== c.rec) return;
      var from = renameFrom.name, to = el.value.trim();
      renameFrom = { id: c.rec, name: el.value };
      if (!norm(from) || norm(from) === norm(to) || !to) return;
      var n = 0;
      FP.change(function(p){
        p.scenes.forEach(function(sc){ sc.shots.forEach(function(s){ if (norm(s.location) === norm(from)){ s.location = to; n++; } }); });
      });
      if (n) FP.toast(n + (n === 1 ? " shot" : " shots") + " now say “" + to + "”.");
    },
    actions: {
      add: function(){ add(""); },
      adopt: function(b){ add(b.getAttribute("data-name"), true); },
      del: function(b, c){
        FP.change(function(p){ p.locations = p.locations.filter(function(l){ return l.id !== c.rec; }); });
        FP.toast("Location removed. Undo brings it back.");
      },
      scene: function(b){
        if (FP.pages.breakdown && FP.pages.breakdown.revealScene) FP.pages.breakdown.revealScene(b.getAttribute("data-scene"));
      },
      photo: function(b, c){
        var l = byId(FP.project().locations, c.rec);
        if (!l || !l.photos.length){ pick(c.rec); return; }
        FP.openMenu(b, [
          { label: "View larger", onClick: function(){ gallery(c.rec); } },
          { label: "Add photos", onClick: function(){ pick(c.rec); } },
          { label: "Remove this photo", danger: true, onClick: function(){
            FP.change(function(p){ var x = byId(p.locations, c.rec); if (x) x.photos.shift(); });
          } }
        ]);
      }
    },
    bind: function(host){
      host.addEventListener("change", function(e){
        if (!e.target.hasAttribute("data-loc-file")) return;
        var files = Array.prototype.slice.call(e.target.files || []), id = imgTarget;
        e.target.value = "";
        if (!files.length || !id) return;
        Promise.all(files.map(function(f){ return FP.readImageFile(f, 1400, 0.78); })).then(function(srcs){
          FP.change(function(p){
            var l = byId(p.locations, id);
            if (l) srcs.forEach(function(src){ l.photos.push({ id: FP.uid("ph"), src: src }); });
          });
        }, function(err){ FP.toast(err.message || "Couldn't add that image.", 5000); });
      });
    }
  });
  function gallery(id){
    var l = byId(FP.project().locations, id);
    if (!l || !l.photos.length){ FP.closeModal(); return; }
    var body = FP.openModal(l.name || "Location", '<div class="bd-gallery">' + l.photos.map(function(ph, i){
      return '<figure data-i="' + i + '"><img src="' + esc(ph.src) + '" alt=""><figcaption>' +
        (i ? '<button type="button" class="btn ghost" data-g="first">Use as the card photo</button>' : '<span class="muted">Card photo</span>') +
        '<button type="button" class="btn ghost" data-g="remove">Remove</button></figcaption></figure>';
    }).join("") + '</div>');
    body.closest(".modal").classList.add("modal-wide");
    body.addEventListener("click", function(e){
      var b = e.target.closest("[data-g]");
      if (!b) return;
      var i = +b.closest("figure").getAttribute("data-i"), g = b.getAttribute("data-g");
      FP.change(function(p){
        var x = byId(p.locations, id);
        if (!x) return;
        var ph = x.photos.splice(i, 1)[0];
        if (g === "first") x.photos.unshift(ph);
      });
      gallery(id);
    });
  }
  function pick(id){
    imgTarget = id;
    page.host().querySelector("[data-loc-file]").click();
  }
  function add(name, quiet){
    var id = FP.uid("l");
    FP.change(function(p){ p.locations.push({ id: id, name: name, address: "", coords: "", photos: [], sunpath: [] }); });
    var card = page.host().querySelector('.loc-card[data-rec="' + id + '"]');
    if (!card) return;
    card.querySelector(quiet ? ".loc-addr" : ".loc-name").focus();
    card.scrollIntoView({ block: "nearest" });
  }
})();
