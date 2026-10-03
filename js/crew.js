/* Crew page, Rev. 08: the people on the job, entered once for the whole production.
   Crew sit in departments; a starred name is a key contact at the top of every
   callsheet. The cast carry their own pickup, wardrobe, make-up and on-set times. */
(function(){
  "use strict";
  var FP = window.FP;
  var DEPTS = ["Production", "Direction", "Camera", "Lighting", "Grip", "Sound", "Art", "Hair & Make-up", "Wardrobe", "Other"];
  FP.CREW_DEPTS = DEPTS;
  function esc(s){ return FP.esc(s); }
  function byId(list, id){ for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  var addDept = "Camera";

  function deptOrder(crew){
    var byDept = {};
    crew.forEach(function(c){ (byDept[c.dept || "Other"] = byDept[c.dept || "Other"] || []).push(c); });
    var order = DEPTS.filter(function(d){ return byDept[d]; })
      .concat(Object.keys(byDept).filter(function(d){ return DEPTS.indexOf(d) === -1; }));
    return { order: order, byDept: byDept };
  }
  function personHTML(c){
    return '<tr data-rec="' + esc(c.id) + '">' +
      '<td class="star-col"><label class="star" title="Key contact: shown at the top of the callsheet">' +
        '<input type="checkbox" data-k="key"' + (c.key ? " checked" : "") + ' aria-label="Key contact"><span aria-hidden="true">★</span></label></td>' +
      '<td>' + FP.input("name", c.name, 'class="cell-in" placeholder="Name" aria-label="Name"') + '</td>' +
      '<td>' + FP.input("role", c.role, 'class="cell-in" placeholder="Role" aria-label="Role"') + '</td>' +
      '<td>' + FP.input("phone", c.phone, 'class="cell-in" type="tel" placeholder="Phone" aria-label="Phone"') + '</td>' +
      '<td>' + FP.input("email", c.email, 'class="cell-in" type="email" placeholder="Email" aria-label="Email"') + '</td>' +
      '<td class="time-col">' + FP.input("call", c.call, 'class="cell-in" type="time" aria-label="Own call time" title="Blank means the day\'s general call"') + '</td>' +
      '<td class="dept-col"><select class="cell-sel" data-k="dept" aria-label="Department">' +
        DEPTS.concat(DEPTS.indexOf(c.dept) === -1 && c.dept ? [c.dept] : []).map(function(d){
          return '<option' + (d === c.dept ? " selected" : "") + '>' + esc(d) + '</option>';
        }).join("") + '</select></td>' +
      '<td class="act-col"><button type="button" class="x-btn" data-act="del-crew" aria-label="Remove ' + esc(c.name || "person") + '">×</button></td>' +
    '</tr>';
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
      var cs = p.callsheet, d = deptOrder(cs.crew);
      return '<div class="workwindow formpage crew">' +
        '<div class="pg-toolbar"><div class="left"><h3>Crew and cast</h3><span class="count">' +
          cs.crew.length + (cs.crew.length === 1 ? " crew, " : " crew, ") + cs.cast.length + " cast</span></div></div>" +
        '<div class="fp-section"><div class="fp-section-head"><h4>Crew</h4>' +
          '<p class="fp-hint">Star a name to make it a key contact on the callsheet. A blank call time means the day\'s general call.</p>' +
          '<div class="add-inline"><select class="cell-sel boxed" data-crew-dept aria-label="Department for the new person">' +
            DEPTS.map(function(x){ return '<option' + (x === addDept ? " selected" : "") + '>' + esc(x) + '</option>'; }).join("") +
          '</select><button type="button" class="btn ghost" data-act="add-crew">+ Add person</button></div></div>' +
          (cs.crew.length ? '<div class="tbl-wrap"><table class="ftable" data-coll="crew"><thead><tr><th class="star-col" aria-label="Key contact">★</th><th>Name</th><th>Role</th><th>Phone</th><th>Email</th>' +
            '<th>Call</th><th>Department</th><th class="act-col"></th></tr></thead>' +
            d.order.map(function(dept){
              return '<tbody><tr class="dept-band"><td colspan="8">' + esc(dept) + '<span>' + d.byDept[dept].length + '</span></td></tr>' +
                d.byDept[dept].map(personHTML).join("") + '</tbody>';
            }).join("") + '</table></div>'
          : '<p class="muted-note">No one added yet. Pick a department and add your first name.</p>') +
        '</div>' +
        '<div class="fp-section"><div class="fp-section-head"><h4>Cast</h4>' +
          '<p class="fp-hint">Times here print on every callsheet.</p>' +
          '<button type="button" class="btn ghost" data-act="add-cast">+ Add cast member</button></div>' +
          (cs.cast.length ? '<div class="tbl-wrap"><table class="ftable" data-coll="cast"><thead><tr><th class="num">#</th><th>Character</th><th>Actor</th><th>Pickup</th>' +
            '<th>Picked up by</th><th>To</th><th>Wardrobe</th><th>Make-up</th><th>On set</th><th class="act-col"></th></tr></thead><tbody>' +
            cs.cast.map(castHTML).join("") + '</tbody></table></div>'
          : '<p class="muted-note">No cast added yet.</p>') +
        '</div>' +
      '</div>';
    },
    resolve: function(p, coll, rec){
      if (coll === "crew") return byId(p.callsheet.crew, rec);
      if (coll === "cast") return byId(p.callsheet.cast, rec);
      return null;
    },
    actions: {
      "add-crew": function(){
        var id = FP.uid("cr");
        FP.change(function(p){ p.callsheet.crew.push({ id: id, name: "", role: "", phone: "", email: "", call: "", dept: addDept, key: false }); });
        var f = page.host().querySelector('[data-coll="crew"] tr[data-rec="' + id + '"] [data-k="name"]');
        if (f) f.focus();
      },
      "del-crew": function(b, c){
        FP.change(function(p){ p.callsheet.crew = p.callsheet.crew.filter(function(x){ return x.id !== c.rec; }); });
        FP.toast("Removed. Undo brings them back.");
      },
      "add-cast": function(){
        var id = FP.uid("ca");
        FP.change(function(p){ p.callsheet.cast.push({ id: id, character: "", actor: "", pickup: "", pickedUpBy: "", toAddress: "", wardrobe: "", makeup: "", onSet: "" }); });
        var f = page.host().querySelector('[data-coll="cast"] tr[data-rec="' + id + '"] [data-k="character"]');
        if (f) f.focus();
      },
      "del-cast": function(b, c){
        FP.change(function(p){ p.callsheet.cast = p.callsheet.cast.filter(function(x){ return x.id !== c.rec; }); });
        FP.toast("Removed. Undo brings them back.");
      }
    },
    bind: function(host){
      host.addEventListener("change", function(e){
        if (e.target.hasAttribute("data-crew-dept")) addDept = e.target.value;
      });
    }
  });
})();
