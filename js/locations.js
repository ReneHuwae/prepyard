/* Locations page, Rev. 08: every place the shoot goes. A location's name is what the
   shot list's Location column uses, so renaming one here renames it on its shots; its
   coordinates feed the sun path and the callsheet. */
(function(){
  "use strict";
  var FP = window.FP;
  function esc(s){ return FP.esc(s); }
  function byId(list, id){ for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function norm(s){ return String(s || "").trim().toLowerCase(); }

  // which scenes and how many shots use a location, by name
  function usage(p, name){
    var n = norm(name), scenes = [], shots = 0;
    if (!n) return { scenes: scenes, shots: 0 };
    p.scenes.forEach(function(sc){
      var hit = sc.shots.filter(function(s){ return norm(s.location) === n; }).length;
      if (hit){ scenes.push(sc.num); shots += hit; }
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
  function mapsLink(coords){
    var c = FP.parseCoords(coords);
    return c ? "https://www.google.com/maps/search/?api=1&query=" + c.lat + "," + c.lon : "";
  }

  function linksHTML(coords){
    var link = mapsLink(coords);
    return (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">Open map</a>'
        : '<span class="muted">' + (coords ? "Couldn't read these coordinates" : "No coordinates yet") + '</span>') +
      '<button type="button" class="link-btn" data-act="sun"' + (link ? "" : " disabled") + '>Sun path</button>';
  }
  function rowHTML(p, l){
    var u = usage(p, l.name), sun = l.sunpath[0];
    var used = u.shots ? "Sc " + u.scenes.join(", ") + " · " + u.shots + (u.shots === 1 ? " shot" : " shots") : "Not used in the shot list yet";
    return '<div class="loc-row" data-rec="' + esc(l.id) + '">' +
      '<div class="loc-main">' +
        FP.input("name", l.name, 'class="loc-name" placeholder="Location name" aria-label="Location name"') +
        '<span class="loc-used">' + esc(used) + '</span>' +
      '</div>' +
      '<div class="loc-coords-wrap">' +
        FP.input("coords", l.coords, 'class="loc-coords" placeholder="Paste coordinates or a maps link" aria-label="Coordinates" spellcheck="false"') +
        '<div class="loc-links">' + linksHTML(l.coords) + '</div>' +
      '</div>' +
      '<button type="button" class="loc-sun' + (sun ? " has" : "") + '" data-act="sunimg" aria-label="' + (sun ? "Sun path image" : "Add a sun path image") + '">' +
        (sun ? '<img src="' + esc(sun.src) + '" alt="">' : '<span>+ Sun path image</span>') + '</button>' +
      '<button type="button" class="x-btn" data-act="del" aria-label="Remove ' + esc(l.name || "location") + '">×</button>' +
    '</div>';
  }

  var renameFrom = null;   // { id, name } when a name field gets focus
  var imgTarget = null;

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
        '<div class="loc-list" data-coll="locations">' + (p.locations.length ? p.locations.map(function(l){ return rowHTML(p, l); }).join("")
          : '<p class="muted-note pad">No locations yet. Add one here, or generate them from the script\'s scene headings.</p>') + '</div>' +
        '<input type="file" accept="image/*,.heic,.heif" hidden data-loc-file>' +
      '</div>';
    },
    resolve: function(p, coll, rec){ return coll === "locations" ? byId(p.locations, rec) : null; },
    typed: function(H, p, c, el){
      if (c.k === "coords") el.closest(".loc-row").querySelector(".loc-links").innerHTML = linksHTML(el.value);
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
      sun: function(b, c){
        if (FP.pages.sun && FP.pages.sun.openFor){ FP.pages.sun.openFor(c.rec); return; }
        FP.showPage("sun");
      },
      sunimg: function(b, c){
        var l = byId(FP.project().locations, c.rec);
        if (l && l.sunpath.length){
          FP.openMenu(b, [
            { label: "View larger", onClick: function(){
              FP.openModal("Sun path, " + (l.name || "location"), '<img class="modal-img" src="' + esc(l.sunpath[0].src) + '" alt="">');
            } },
            { label: "Replace", onClick: function(){ pick(c.rec); } },
            { label: "Remove", danger: true, onClick: function(){
              FP.change(function(p){ var x = byId(p.locations, c.rec); if (x) x.sunpath = []; });
            } }
          ]);
          return;
        }
        pick(c.rec);
      }
    },
    bind: function(host){
      host.addEventListener("change", function(e){
        if (!e.target.hasAttribute("data-loc-file")) return;
        var f = e.target.files && e.target.files[0], id = imgTarget;
        e.target.value = "";
        if (!f || !id) return;
        FP.readImageFile(f, 1400, 0.78).then(function(src){
          FP.change(function(p){ var l = byId(p.locations, id); if (l) l.sunpath = [{ id: FP.uid("ph"), src: src }]; });
        }, function(err){ FP.toast(err.message || "Couldn't add that image.", 5000); });
      });
    }
  });
  function pick(id){
    imgTarget = id;
    page.host().querySelector("[data-loc-file]").click();
  }
  function add(name, quiet){
    var id = FP.uid("l");
    FP.change(function(p){ p.locations.push({ id: id, name: name, coords: "", sunpath: [] }); });
    var row = page.host().querySelector('.loc-row[data-rec="' + id + '"]');
    if (!row) return;
    row.querySelector(quiet ? ".loc-coords" : ".loc-name").focus();
    row.scrollIntoView({ block: "nearest" });
  }
})();
