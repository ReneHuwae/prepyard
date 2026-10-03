/* Cast and crew page, Rev. 08: every department and its usual roles are laid out ready to fill
   in, a card per role. Only filled-in roles are stored; an empty card is just the slot.
   A starred card is a key contact at the top of the callsheet. The cast carry their
   own pickup, wardrobe, make-up and on-set times. */
(function(){
  "use strict";
  var FP = window.FP;
  var ROLES = [
    ["Production", ["Director", "Producer", "Line producer", "Production manager", "1st AD", "2nd AD", "Production coordinator", "Runner"]],
    ["Camera", ["Director of Photography", "Camera operator", "1st AC", "2nd AC", "DIT", "Stills photographer"]],
    ["Grip & electric", ["Gaffer", "Best boy electric", "Electrician", "Key grip", "Dolly grip"]],
    ["Sound", ["Sound mixer", "Boom operator"]],
    ["Art", ["Production designer", "Art director", "Props master", "Set dresser"]],
    ["Hair & make-up", ["Make-up artist", "Hair stylist"]],
    ["Wardrobe", ["Costume designer", "Wardrobe assistant"]],
    ["Script & production office", ["Script supervisor", "Location manager", "Production assistant"]],
    ["Other", []]
  ];
  var DEPTS = ROLES.map(function(r){ return r[0]; });
  // departments as the classic app named them
  var OLD = { "direction": "Production", "lighting": "Grip & electric", "grip": "Grip & electric", "hair & make-up": "Hair & make-up" };
  FP.CREW_DEPTS = DEPTS;
  FP.crewDept = function(c){
    var d = String(c.dept || "").trim();
    if (!d) return "Other";
    var m = DEPTS.filter(function(x){ return x.toLowerCase() === d.toLowerCase(); })[0];
    return m || OLD[d.toLowerCase()] || d;
  };
  function esc(s){ return FP.esc(s); }
  function norm(s){ return String(s || "").trim().toLowerCase(); }
  function byId(list, id){ for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  var TPL = "tpl|";   // an empty role slot: tpl|department|role
  function hidden(p){ return Array.isArray(p.callsheet.hiddenRoles) ? p.callsheet.hiddenRoles : []; }

  // a department's cards: its usual roles (filled or empty), then anyone else in it
  function deptCards(p, dept, roles){
    var people = p.callsheet.crew.filter(function(c){ return FP.crewDept(c) === dept; });
    var used = {}, cards = [], hide = hidden(p);
    roles.forEach(function(role){
      var c = people.filter(function(x){ return !used[x.id] && norm(x.role) === norm(role); })[0];
      if (c){ used[c.id] = true; cards.push({ person: c, role: role }); }
      else if (hide.indexOf(dept + "|" + role) === -1) cards.push({ tpl: TPL + dept + "|" + role, role: role });
    });
    people.forEach(function(c){ if (!used[c.id]) cards.push({ person: c, role: c.role, custom: true }); });
    return cards;
  }
  function cardHTML(card){
    var c = card.person || {}, rec = card.person ? c.id : card.tpl;
    var roleField = card.custom || (card.person && !card.role)
      ? FP.input("role", c.role, 'class="crew-role-in" placeholder="Role" aria-label="Role"')
      : '<div class="crew-role">' + esc(card.role) + '</div>';
    return '<div class="crew-card' + (card.person ? " filled" : "") + '" data-rec="' + esc(rec) + '">' +
      '<div class="crew-card-head">' + roleField +
        '<label class="star" title="Key contact: shown at the top of the callsheet"><input type="checkbox" data-k="key"' + (c.key ? " checked" : "") +
          ' aria-label="Key contact"><span aria-hidden="true">★</span></label>' +
        '<button type="button" class="x-btn" data-act="remove" aria-label="' + (card.person ? "Clear " : "Hide ") + esc(card.role || "role") + '" title="' +
          (card.person ? "Clear this card" : "Hide this role") + '">×</button></div>' +
      '<label class="crew-field"><span>Name</span>' + FP.input("name", c.name, 'placeholder="Full name"') + '</label>' +
      '<label class="crew-field"><span>Phone</span>' + FP.input("phone", c.phone, 'type="tel" placeholder="+31 6…"') + '</label>' +
      '<label class="crew-field"><span>Email</span>' + FP.input("email", c.email, 'type="email" placeholder="name@…"') + '</label>' +
    '</div>';
  }
  function castHTML(c, i){
    var t = function(k, label){ return '<td class="time-col">' + FP.input(k, c[k], 'class="cell-in" type="time" aria-label="' + label + '"') + '</td>'; };
    return '<tr data-rec="' + esc(c.id) + '">' +
      '<td class="num">' + (i + 1) + '</td>' +
      '<td>' + FP.input("character", c.character, 'class="cell-in" placeholder="Character" aria-label="Character"') + '</td>' +
      '<td>' + FP.input("actor", c.actor, 'class="cell-in" placeholder="Actor" aria-label="Actor"') + '</td>' +
      t("pickup", "Pickup") +
      '<td>' + FP.input("pickedUpBy", c.pickedUpBy, 'class="cell-in" placeholder="Driver" aria-label="Picked up by"') + '</td>' +
      '<td>' + FP.input("toAddress", c.toAddress, 'class="cell-in" placeholder="To" aria-label="Taken to"') + '</td>' +
      t("wardrobe", "Wardrobe") + t("makeup", "Make-up") + t("onSet", "On set") +
      '<td class="act-col"><button type="button" class="x-btn" data-act="del-cast" aria-label="Remove ' + esc(c.character || c.actor || "cast member") + '">×</button></td>' +
    '</tr>';
  }

  var page = FP.formPage("crew", {
    html: function(p){
      var cs = p.callsheet, filled = cs.crew.filter(function(c){ return c.name || c.phone || c.email; }).length, hide = hidden(p);
      return '<div class="workwindow formpage crew">' +
        '<div class="pg-toolbar"><div class="left"><h3>Cast and crew</h3><span class="count">Entered once, on every day\'s callsheet · ' +
          filled + ' filled in, ' + cs.cast.length + ' cast</span></div>' +
          '<div class="right">' + (hide.length ? '<button type="button" class="btn ghost" data-act="unhide">Show hidden roles (' + hide.length + ')</button>' : "") + '</div></div>' +
        '<div data-coll="crew">' + ROLES.map(function(r){
          var cards = deptCards(p, r[0], r[1]);
          if (!cards.length && r[0] === "Other") return '<section class="crew-dept"><div class="crew-dept-h"><span>Other</span>' +
            '<button type="button" class="link-btn" data-act="add-role" data-dept="Other">+ Add role</button></div></section>';
          return '<section class="crew-dept"><div class="crew-dept-h"><span>' + esc(r[0]) + '</span>' +
            '<button type="button" class="link-btn" data-act="add-role" data-dept="' + esc(r[0]) + '">+ Add role</button></div>' +
            '<div class="crew-grid">' + cards.map(cardHTML).join("") + '</div></section>';
        }).join("") +
        // departments only the classic app knew
        Object.keys(cs.crew.reduce(function(o, c){ var d = FP.crewDept(c); if (DEPTS.indexOf(d) === -1) o[d] = 1; return o; }, {})).map(function(d){
          return '<section class="crew-dept"><div class="crew-dept-h"><span>' + esc(d) + '</span></div><div class="crew-grid">' +
            deptCards(p, d, []).map(cardHTML).join("") + '</div></section>';
        }).join("") + '</div>' +
        '<section class="crew-dept cast-section"><div class="crew-dept-h"><span>Cast</span>' +
          '<span class="crew-dept-actions"><button type="button" class="link-btn" data-act="cast-from-script"' + (p.script.html ? "" : " disabled") + '>Add characters from the script</button>' +
          '<button type="button" class="link-btn" data-act="add-cast">+ Add cast member</button></span></div>' +
          (cs.cast.length ? '<div class="tbl-wrap"><table class="ftable" data-coll="cast"><thead><tr><th class="num">#</th><th>Character</th><th>Actor</th><th>Pickup</th>' +
            '<th>Picked up by</th><th>To</th><th>Wardrobe</th><th>Make-up</th><th>On set</th><th class="act-col"></th></tr></thead><tbody>' +
            cs.cast.map(castHTML).join("") + '</tbody></table></div>'
          : '<p class="muted-note">No cast added yet.</p>') +
        '</section>' +
      '</div>';
    },
    resolve: function(p, coll, rec){
      if (coll === "cast") return byId(p.callsheet.cast, rec);
      if (coll !== "crew") return null;
      if (rec.indexOf(TPL) !== 0) return byId(p.callsheet.crew, rec);
      // typing into an empty role slot fills that role in
      var parts = rec.slice(TPL.length).split("|"), dept = parts[0], role = parts.slice(1).join("|");
      var have = p.callsheet.crew.filter(function(c){ return FP.crewDept(c) === dept && norm(c.role) === norm(role); })[0];
      if (have) return have;
      var c = { id: FP.uid("cr"), name: "", role: role, phone: "", email: "", call: "", dept: dept, key: false };
      p.callsheet.crew.push(c);
      return c;
    },
    actions: {
      "add-role": function(b){
        var dept = b.getAttribute("data-dept"), id = FP.uid("cr");
        FP.change(function(p){ p.callsheet.crew.push({ id: id, name: "", role: "", phone: "", email: "", call: "", dept: dept, key: false }); });
        var f = page.host().querySelector('.crew-card[data-rec="' + id + '"] [data-k="role"]');
        if (f){ f.focus(); f.scrollIntoView({ block: "nearest" }); }
      },
      remove: function(b, c){
        if (c.rec.indexOf(TPL) === 0){
          var key = c.rec.slice(TPL.length);
          FP.change(function(p){ p.callsheet.hiddenRoles = hidden(p).concat([key]); });
          FP.toast("Role hidden. Show it again from the top of the page.");
          return;
        }
        FP.change(function(p){ p.callsheet.crew = p.callsheet.crew.filter(function(x){ return x.id !== c.rec; }); });
        FP.toast("Cleared. Undo brings it back.");
      },
      unhide: function(){ FP.change(function(p){ p.callsheet.hiddenRoles = []; }); },
      "add-cast": function(){
        var id = FP.uid("ca");
        FP.change(function(p){ p.callsheet.cast.push({ id: id, character: "", actor: "", pickup: "", pickedUpBy: "", toAddress: "", wardrobe: "", makeup: "", onSet: "" }); });
        var f = page.host().querySelector('[data-coll="cast"] tr[data-rec="' + id + '"] [data-k="character"]');
        if (f) f.focus();
      },
      // character cues are tagged by the screenplay parser; drop (CONT'D), (V.O.) and the like
      "cast-from-script": function(){
        var t = document.createElement("template"), p = FP.project(), seen = {}, add = [];
        t.innerHTML = p.script.html;
        p.callsheet.cast.forEach(function(c){ seen[(c.character || "").trim().toLowerCase()] = 1; });
        t.content.querySelectorAll(".sp-char").forEach(function(el){
          var n = el.textContent.replace(/\s*\([^)]*\)\s*$/, "").trim();
          if (n && !seen[n.toLowerCase()]){ seen[n.toLowerCase()] = 1; add.push(n); }
        });
        if (!add.length){ FP.toast("No new character names in the script."); return; }
        FP.change(function(pp){
          add.forEach(function(n){ pp.callsheet.cast.push({ id: FP.uid("ca"), character: n, actor: "", pickup: "", pickedUpBy: "", toAddress: "", wardrobe: "", makeup: "", onSet: "" }); });
        });
        FP.toast("Added " + add.length + (add.length === 1 ? " character" : " characters") + " from the script.");
      },
      "del-cast": function(b, c){
        FP.change(function(p){ p.callsheet.cast = p.callsheet.cast.filter(function(x){ return x.id !== c.rec; }); });
        FP.toast("Removed. Undo brings them back.");
      }
    }
  });
})();
