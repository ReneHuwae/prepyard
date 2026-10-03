/* Sun path page, Rev. 08: where the sun is through a day at a place, drawn on a compass
   you can lay a satellite screenshot under. The path redraws as you change the place or
   the date; Save to location keeps the picture with that location. The sun maths is
   shared as FP.sun, so the callsheet can print sunrise and sunset. */
(function(){
  "use strict";
  var FP = window.FP;

  // ---------- the maths (after SunCalc, Vladimir Agafonkin) ----------
  var rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  function toDays(date){ return (date.getTime() / dayMs - 0.5 + J1970) - J2000; }
  function position(date, lat, lon){
    var lw = rad * -lon, phi = rad * lat, d = toDays(date);
    var M = rad * (357.5291 + 0.98560028 * d);
    var L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    var dec = Math.asin(Math.sin(0) * Math.cos(e) + Math.cos(0) * Math.sin(e) * Math.sin(L));
    var ra = Math.atan2(Math.sin(L) * Math.cos(e) - Math.tan(0) * Math.sin(e), Math.cos(L));
    var H = rad * (280.16 + 360.9856235 * d) - lw - ra;
    var az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    return { azimuth: (az / rad + 540) % 360, altitude: alt / rad };
  }
  function day(lat, lon, dateStr, tz){
    var p = dateStr.split("-").map(Number), out = [];
    for (var m = 0; m <= 1440; m += 4){
      var pos = position(new Date(Date.UTC(p[0], p[1] - 1, p[2]) + m * 60000 - tz * 3600000), lat, lon);
      out.push({ minute: m, azimuth: pos.azimuth, altitude: pos.altitude });
    }
    return out;
  }
  function crossing(s, th, rising){
    for (var i = 1; i < s.length; i++){
      var a = s[i - 1], b = s[i];
      if (rising ? (a.altitude < th && b.altitude >= th) : (a.altitude >= th && b.altitude < th))
        return a.minute + (th - a.altitude) / (b.altitude - a.altitude) * (b.minute - a.minute);
    }
    return null;
  }
  function hhmm(min){
    if (min == null) return "—";
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    if (m === 60){ m = 0; h++; }
    h = ((h % 24) + 24) % 24;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  function localTz(){ return -(new Date().getTimezoneOffset() / 60); }
  // the facts a callsheet wants for a place and a date
  function facts(lat, lon, dateStr, tz){
    var s = day(lat, lon, dateStr, tz == null || tz === "" || isNaN(tz) ? localTz() : +tz);
    var noon = s.reduce(function(m, x){ return x.altitude > m.altitude ? x : m; }, s[0]);
    return {
      samples: s,
      sunrise: hhmm(crossing(s, -0.833, true)), sunset: hhmm(crossing(s, -0.833, false)),
      noon: hhmm(noon.minute), noonAlt: noon.altitude,
      goldenAm: hhmm(crossing(s, -4, true)) + "–" + hhmm(crossing(s, 6, true)),
      goldenPm: hhmm(crossing(s, 6, false)) + "–" + hhmm(crossing(s, -4, false)),
      blueAm: hhmm(crossing(s, -6, true)) + "–" + hhmm(crossing(s, -4, true)),
      bluePm: hhmm(crossing(s, -4, false)) + "–" + hhmm(crossing(s, -6, false))
    };
  }
  FP.sun = { position: position, day: day, facts: facts, hhmm: hhmm, localTz: localTz };

  // ---------- drawing ----------
  var bg = null, bgOffset = { x: 0, y: 0 };   // the background picture lives with the session, not the project
  function polar(cx, cy, R, bearing, frac){
    var a = (bearing - 90) * rad, r = R * frac;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  function band(alt){
    if (alt >= 6) return "#F5C542";      // day
    if (alt >= -4) return "#FF4311";     // golden hour
    if (alt >= -6) return "#5A78C4";     // blue hour
    return "rgba(255,255,255,0.28)";
  }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function draw(cv, samples, o){
    var ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 46;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R + 30, 0, Math.PI * 2); ctx.clip();
    if (bg){
      ctx.save();
      ctx.translate(cx + bgOffset.x, cy + bgOffset.y);
      ctx.rotate((o.rotate || 0) * rad);
      var sc = Math.max((R * 2 + 60) / bg.width, (R * 2 + 60) / bg.height) * (o.zoom || 1);
      ctx.drawImage(bg, -bg.width * sc / 2, -bg.height * sc / 2, bg.width * sc, bg.height * sc);
      ctx.restore();
      ctx.fillStyle = "rgba(10,10,12,0.30)";
    } else {
      ctx.fillStyle = "#1B1B1E";
    }
    ctx.fillRect(cx - R - 30, cy - R - 30, (R + 30) * 2, (R + 30) * 2);
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach(function(f){ ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); });
    for (var d = 0; d < 360; d += 10){
      var major = d % 30 === 0, p1 = polar(cx, cy, R, d, 1), p2 = polar(cx, cy, R, d, major ? 0.93 : 0.97);
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.font = "700 15px Archivo, sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    [[0, "N"], [90, "E"], [180, "S"], [270, "W"]].forEach(function(x){ var p = polar(cx, cy, R + 20, x[0], 1); ctx.fillText(x[1], p.x, p.y); });

    if (samples){
      ctx.lineWidth = 5; ctx.lineCap = "round";
      for (var i = 1; i < samples.length; i++){
        var a = samples[i - 1], b = samples[i];
        if (a.altitude < -9 && b.altitude < -9) continue;
        var pa = polar(cx, cy, R, a.azimuth, clamp(1 - a.altitude / 90, 0, 1.13));
        var pb = polar(cx, cy, R, b.azimuth, clamp(1 - b.altitude / 90, 0, 1.13));
        ctx.strokeStyle = band((a.altitude + b.altitude) / 2);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      ctx.font = "600 11px 'Instrument Sans', sans-serif";
      samples.forEach(function(s){
        if (s.minute % 60 || s.altitude < -1) return;
        var rf = clamp(1 - s.altitude / 90, 0, 1.13), p = polar(cx, cy, R, s.azimuth, rf), lp = polar(cx, cy, R, s.azimuth, rf + 0.07);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillText(String(s.minute / 60), lp.x, lp.y);
      });
      var noon = samples.reduce(function(m, s){ return s.altitude > m.altitude ? s : m; }, samples[0]);
      var np = polar(cx, cy, R, noon.azimuth, clamp(1 - noon.altitude / 90, 0, 1.13));
      ctx.beginPath(); ctx.arc(np.x, np.y, 5, 0, Math.PI * 2); ctx.fillStyle = "#F5C542"; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- the page ----------
  function esc(s){ return FP.esc(s); }
  function today(){ var d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function state(p){
    var s = p.sun;
    return { lat: parseFloat(s.lat), lon: parseFloat(s.lon), date: s.date || today(),
      tz: s.tz === "" || s.tz == null || isNaN(parseFloat(s.tz)) ? localTz() : parseFloat(s.tz),
      zoom: (parseFloat(s.zoom) || 100) / 100, rotate: parseFloat(s.rotate) || 0 };
  }
  function ready(st){ return !isNaN(st.lat) && !isNaN(st.lon) && Math.abs(st.lat) <= 90 && Math.abs(st.lon) <= 180; }
  var lastFacts = null;
  function paint(H, p){
    var cv = H && H.querySelector("canvas.sun-canvas");
    if (!cv) return;
    var st = state(p);
    lastFacts = ready(st) ? facts(st.lat, st.lon, st.date, st.tz) : null;
    draw(cv, lastFacts && lastFacts.samples, st);
    var out = H.querySelector("[data-sun-readout]");
    out.innerHTML = lastFacts ? [["Sunrise", lastFacts.sunrise], ["Sunset", lastFacts.sunset],
        ["Solar noon", lastFacts.noon + " · " + lastFacts.noonAlt.toFixed(0) + "°"],
        ["Golden hour, morning", lastFacts.goldenAm], ["Golden hour, evening", lastFacts.goldenPm],
        ["Blue hour, evening", lastFacts.bluePm]].map(function(x){
          return '<div><div class="k">' + x[0] + '</div><div class="v">' + esc(x[1]) + '</div></div>';
        }).join("")
      : '<p class="muted-note">Pick a location with coordinates, or enter a latitude and longitude, to draw the sun\'s path.</p>';
    H.querySelector('[data-act="save"]').disabled = !lastFacts || !p.locations.length;
    // a time zone is roughly longitude / 15, give or take an hour or two of politics and summer time
    var warn = H.querySelector("[data-tz-warn]");
    if (warn) warn.hidden = !(ready(st) && Math.abs(st.lon / 15 - st.tz) > 3);
  }
  function locOptions(p, cur, blank){
    return (blank ? '<option value="">' + esc(blank) + '</option>' : "") + p.locations.map(function(l){
      return '<option value="' + esc(l.id) + '"' + (l.id === cur ? " selected" : "") + '>' + esc(l.name || "Untitled location") +
        (FP.parseCoords(l.coords) ? "" : " (no coordinates)") + '</option>';
    }).join("");
  }
  function useLocation(id){
    var l = FP.project().locations.filter(function(x){ return x.id === id; })[0];
    var c = l && FP.parseCoords(l.coords);
    FP.change(function(p){
      p.sun.loc = id || "";
      if (c){ p.sun.lat = String(c.lat); p.sun.lon = String(c.lon); }
    });
    if (l && !c) FP.toast("That location has no coordinates yet. Add them on the Locations page.");
  }
  function loadBg(file){
    if (!file || (file.type && file.type.indexOf("image/") !== 0)) return false;
    FP.readImageFile(file, 1800, 0.85).then(function(src){
      var img = new Image();
      img.onload = function(){ bg = img; bgOffset = { x: 0, y: 0 }; paint(page.host(), FP.project()); FP.toast("Background added. Drag it to line it up."); };
      img.src = src;
    }, function(err){ FP.toast(err.message || "Couldn't read that image.", 5000); });
    return true;
  }

  var page = FP.formPage("sun", {
    html: function(p){
      var s = p.sun, st = state(p);
      return '<div class="shell-body sunpage">' +
        '<aside class="toolrail sun-rail" data-coll="sun">' +
          '<div class="tr-h">Place and date</div>' +
          '<div class="sun-fields">' +
            FP.field("Location", '<select data-sun-loc>' + locOptions(p, s.loc, p.locations.length ? "Enter coordinates by hand" : "No locations yet") + '</select>') +
            FP.field("Paste coordinates or a maps link", '<input data-sun-paste placeholder="52.3676, 4.9041" autocomplete="off" spellcheck="false">') +
            '<div class="fld-row two">' +
              FP.field("Latitude", FP.input("lat", s.lat, 'inputmode="decimal" placeholder="52.3676"')) +
              FP.field("Longitude", FP.input("lon", s.lon, 'inputmode="decimal" placeholder="4.9041"')) +
            '</div>' +
            '<div class="fld-row two">' +
              FP.field("Date", FP.input("date", s.date || today(), 'type="date"')) +
              FP.field("UTC offset (h)", FP.input("tz", s.tz === "" || s.tz == null ? localTz() : s.tz, 'type="number" step="0.5"')) +
            '</div>' +
          '<p class="fp-hint tz-warn" data-tz-warn hidden>That UTC offset looks far from this longitude. Times are shown in the offset above, so check it for this place and date.</p>' +
          '</div>' +
          '<div class="tr-h">Background</div>' +
          '<div class="sun-fields">' +
            '<div class="sun-btns"><button type="button" class="btn ghost" data-act="maps"' + (ready(st) ? "" : " disabled") + '>Open satellite view ↗</button>' +
              '<button type="button" class="btn ghost" data-act="bg">' + (bg ? "Replace image" : "Add screenshot") + '</button>' +
              (bg ? '<button type="button" class="link-btn" data-act="bg-clear">Remove</button>' : "") + '</div>' +
            '<p class="fp-hint">Screenshot the satellite view, then paste it here (Ctrl/⌘ V), drop it on the compass, or add it as a file. Drag it to line it up.</p>' +
            FP.field("Zoom", FP.input("zoom", s.zoom || 100, 'type="range" min="50" max="300"')) +
            FP.field("Rotate to align north", FP.input("rotate", s.rotate || 0, 'type="range" min="0" max="359"')) +
          '</div>' +
        '</aside>' +
        '<div class="workwindow sun-out">' +
          '<div class="pg-toolbar"><div class="left"><h3>Sun path</h3><span class="count">' + esc(st.date) + '</span></div>' +
            '<div class="right"><select class="cell-sel boxed" data-sun-save aria-label="Location to save to">' +
              locOptions(p, s.loc || (p.locations[0] && p.locations[0].id), p.locations.length ? "" : "No locations yet") + '</select>' +
              '<button type="button" class="btn solid" data-act="save">Save to location</button></div></div>' +
          '<div class="sun-stage"><canvas class="sun-canvas" width="620" height="620" aria-label="Sun path compass"></canvas>' +
            '<div class="sun-legend"><span><i style="background:#F5C542"></i>Day</span><span><i style="background:#FF4311"></i>Golden hour</span>' +
              '<span><i style="background:#5A78C4"></i>Blue hour</span><span><i class="dot"></i>Hours</span></div></div>' +
          '<div class="sun-readout" data-sun-readout></div>' +
          '<input type="file" accept="image/*,.heic,.heif" hidden data-sun-file>' +
        '</div>' +
      '</div>';
    },
    resolve: function(p, coll){ return coll === "sun" ? p.sun : null; },
    set: function(p, rec, c, v){ rec[c.k] = String(v); },
    drawn: function(H, p){ paint(H, p); },
    typed: function(H, p, c){
      paint(H, p);
      if (c.k === "lat" || c.k === "lon") H.querySelector('[data-act="maps"]').disabled = !ready(state(p));
      if (c.k === "date") H.querySelector(".sun-out .count").textContent = state(p).date;
    },
    actions: {
      maps: function(){
        var st = state(FP.project());
        if (ready(st)) window.open("https://www.google.com/maps/@" + st.lat + "," + st.lon + ",18z/data=!3m1!1e3", "_blank", "noopener");
      },
      bg: function(){ page.host().querySelector("[data-sun-file]").click(); },
      "bg-clear": function(){ bg = null; page.redraw(); },
      save: function(){
        var H = page.host(), id = H.querySelector("[data-sun-save]").value, cv = H.querySelector("canvas.sun-canvas");
        if (!lastFacts || !id) return;
        var src = cv.toDataURL("image/jpeg", 0.85);
        FP.change(function(p){
          var l = p.locations.filter(function(x){ return x.id === id; })[0];
          if (l) l.sunpath = [{ id: FP.uid("ph"), src: src }];
        });
        var l = FP.project().locations.filter(function(x){ return x.id === id; })[0];
        FP.toast("Sun path saved to " + ((l && l.name) || "the location") + ".");
      }
    },
    bind: function(host){
      host.addEventListener("change", function(e){
        var t = e.target;
        if (t.hasAttribute("data-sun-loc")) useLocation(t.value);
        else if (t.hasAttribute("data-sun-file")){ loadBg(t.files && t.files[0]); t.value = ""; }
        else if (t.hasAttribute("data-sun-paste")){
          var c = FP.parseCoords(t.value);
          if (!c){ FP.toast("Couldn't find coordinates in that."); return; }
          FP.change(function(p){ p.sun.lat = String(c.lat); p.sun.lon = String(c.lon); p.sun.loc = ""; });
        }
      });
      // drag the background to line it up
      var drag = null;
      host.addEventListener("pointerdown", function(e){
        var cv = e.target.closest && e.target.closest("canvas.sun-canvas");
        if (!cv || !bg) return;
        var k = cv.width / cv.getBoundingClientRect().width;
        drag = { x: e.clientX, y: e.clientY, ox: bgOffset.x, oy: bgOffset.y, k: k };
        cv.setPointerCapture(e.pointerId);
      });
      host.addEventListener("pointermove", function(e){
        if (!drag) return;
        bgOffset = { x: drag.ox + (e.clientX - drag.x) * drag.k, y: drag.oy + (e.clientY - drag.y) * drag.k };
        paint(host, FP.project());
      });
      host.addEventListener("pointerup", function(){ drag = null; });
      host.addEventListener("dragover", function(e){
        if (!e.target.closest || !e.target.closest(".sun-stage")) return;
        e.preventDefault();
      });
      host.addEventListener("drop", function(e){
        if (!e.target.closest || !e.target.closest(".sun-stage")) return;
        e.preventDefault();
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!loadBg(f)) FP.toast("That file isn't an image.");
      });
    },
    api: {
      // from the Locations page: open on that place
      openFor: function(locId){
        FP.showPage("sun");
        useLocation(locId);
      }
    }
  });
  document.addEventListener("paste", function(e){
    if (FP.currentPage && FP.currentPage() !== "sun") return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++){
      if (items[i].type && items[i].type.indexOf("image/") === 0 && loadBg(items[i].getAsFile())){ e.preventDefault(); return; }
    }
  });
})();
