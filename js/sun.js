/* Sun maths: sunrise, sunset and golden hour for a place and a date, so the callsheet
   can print them from a location's coordinates. */
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
})();
