/* Satellite imagery from Mapbox: finding an address, and a static image of a spot at the
   floor plan's scale. The token is a public one (it only reads maps), meant to sit in a page. */
(function(){
  "use strict";
  var FP = window.FP;
  // The token isn't kept in the code: a page sets window.FP_MAPBOX_TOKEN before this file
  // loads. Without one, Filmprep simply shows no satellite images.
  var TOKEN = window.FP_MAPBOX_TOKEN || "";
  if (!TOKEN) return;
  var API = "https://api.mapbox.com";

  // Mapbox zoom levels count 512 px tiles: one pixel is 78271.517 m at zoom 0 on the equator
  function zoomFor(lat, metresPerPixel){
    var z = Math.log(78271.517 * Math.cos(lat * Math.PI / 180) / metresPerPixel) / Math.LN2;
    return Math.max(0, Math.min(22, z));
  }

  FP.maps = {
    // a satellite image w x h px showing w / pxPerMetre metres across, centred on lat/lon,
    // turned so that `bearing` (degrees from north) points up
    satelliteUrl: function(lat, lon, w, h, pxPerMetre, bearing){
      var z = zoomFor(lat, 1 / pxPerMetre);
      return API + "/styles/v1/mapbox/satellite-v9/static/" + lon.toFixed(6) + "," + lat.toFixed(6) + "," + z.toFixed(2) + "," +
        Math.round(((bearing || 0) % 360 + 360) % 360) + "/" + Math.round(w) + "x" + Math.round(h) + "?access_token=" + TOKEN;
    },
    // a satellite picture of a place: zoom 17 shows a street and its surroundings
    satelliteAt: function(lat, lon, zoom, w, h){
      return API + "/styles/v1/mapbox/satellite-streets-v12/static/" + lon.toFixed(6) + "," + lat.toFixed(6) + "," + (zoom || 17) + ",0/" +
        Math.round(w) + "x" + Math.round(h) + "@2x?access_token=" + TOKEN;
    },
    // an address to { lat, lon, place }, or null when nothing matches
    geocode: function(address){
      var url = API + "/geocoding/v5/mapbox.places/" + encodeURIComponent(address) + ".json?limit=1&access_token=" + TOKEN;
      // a blocked or failed connection reads "Load failed" or "Failed to fetch"; say what it means
      return fetch(url).catch(function(){
        throw new Error("Couldn't reach the map service. This page may not be allowed to connect to it.");
      }).then(function(r){
        if (!r.ok) throw new Error("The map service didn't answer (" + r.status + ").");
        return r.json();
      }).then(function(j){
        var f = j && j.features && j.features[0];
        var c = f && (f.center || (f.geometry && f.geometry.coordinates));
        return c ? { lon: +c[0], lat: +c[1], place: f.place_name || "" } : null;
      });
    },
    // move a centre by metres east and north
    offset: function(lat, lon, east, north){
      return { lat: lat + north / 111320, lon: lon + east / (111320 * Math.cos(lat * Math.PI / 180)) };
    },
    attribution: "© Mapbox © OpenStreetMap © Maxar"
  };
})();
