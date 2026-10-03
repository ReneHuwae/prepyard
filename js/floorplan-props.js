/* Floor plan objects and tools: the toolbar's groups and icons, and how each object is drawn.
   Objects are seen from above like an architect's plan, at about 40 units to the metre
   (a car is 4.6 m). Vehicles face +x; people, lights and furniture face -y (a chair's back,
   a bed's headboard and a kitchen's wall side are at -y). Colours come from classes in
   floorplan.css, so dark mode and selection work. */
(function(){
  "use strict";
  var FP = window.FP;
  var BG = ' style="fill:var(--bg-raised)"';

  // ---------- toolbar: groups, icons (20 x 20, drawn with the button's colour) ----------
  var TOOLS = [
    { group: "Tools", items: [
      { t: "select", tip: "Select and move (V)", svg: '<path d="M5 3 L5 16 L8.6 12.6 L11 17.5 L13 16.6 L10.6 11.8 L15.5 11.6 Z" fill="currentColor"/>' },
      { t: "eraser", tip: "Eraser: click an item to delete it (E)", svg: '<path d="M8.5 16.5 L3.5 11.5 L11 4 L16.5 9.5 L9.5 16.5 Z"/><path d="M7 8 L12.5 13.5"/><path d="M9.5 16.5 H17"/>' } ] },
    { group: "Walls", items: [
      { t: "wall", tip: "Wall: drag to draw (W)", svg: '<rect x="2.5" y="7.5" width="15" height="5"/><path d="M4.5 12.5 L7.5 7.5 M8.5 12.5 L11.5 7.5 M12.5 12.5 L15.5 7.5" stroke-width="1"/>' },
      { t: "door", tip: "Door: click a wall", svg: '<path d="M2.5 16.5 H5.5 M14.5 16.5 H17.5"/><path d="M5.5 16.5 V5"/><path d="M5.5 5 A11.5 11.5 0 0 1 17 16.5" stroke-dasharray="1.6 2"/>' },
      { t: "window", tip: "Window: click a wall", svg: '<path d="M2.5 7.5 V12.5 M17.5 7.5 V12.5"/><path d="M2.5 8.5 H17.5 M2.5 11.5 H17.5"/><path d="M2.5 10 H17.5" stroke-width="1"/>' } ] },
    { group: "Draw", items: [
      { t: "rect", tip: "Rectangle", svg: '<rect x="3" y="5" width="14" height="10" rx="1"/>' },
      { t: "ellipse", tip: "Ellipse", svg: '<ellipse cx="10" cy="10" rx="7" ry="5"/>' },
      { t: "line", tip: "Line", svg: '<path d="M4 16 L16 4"/><circle cx="4" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="4" r="1.2" fill="currentColor"/>' },
      { t: "arrow", tip: "Arrow: movement or direction", svg: '<path d="M4 16 L15 5"/><path d="M8.5 4.5 H15.5 V11.5"/>' },
      { t: "text", tip: "Text label (T)", svg: '<path d="M4.5 6 V4 H15.5 V6"/><path d="M10 4 V16"/><path d="M7.5 16 H12.5"/>' },
      { t: "brush", tip: "Brush: freehand", svg: '<path d="M3.5 16.5 C5.5 12 8 15 10 11 S13.5 5 16.5 3.5"/>' } ] },
    { group: "People", items: [
      { p: "actor", tip: "Actor", svg: '<rect x="2.5" y="9" width="15" height="6.5" rx="3.25"/><circle cx="10" cy="11" r="3.4"' + BG + '/><path d="M9.3 7.8 L10 6.6 L10.7 7.8 Z" fill="currentColor"/>' },
      { p: "extra", tip: "Extra", svg: '<rect x="2.5" y="9" width="15" height="6.5" rx="3.25" stroke-dasharray="2 1.6"/><circle cx="10" cy="11" r="3.4" stroke-dasharray="2 1.6"' + BG + '/><path d="M9.3 7.8 L10 6.6 L10.7 7.8 Z" fill="currentColor"/>' },
      { p: "mark", tip: "Mark: tape T on the floor", svg: '<path d="M5 5.5 H15 M10 5.5 V15.5" stroke-width="2.6" stroke-linecap="butt"/>' } ] },
    { group: "Vehicles", items: [
      { p: "car", tip: "Car", svg: '<path d="M3.5 6.5 H13 Q16.8 6.8 17.5 9 V11 Q16.8 13.2 13 13.5 H3.5 Q2.5 13.5 2.5 12.5 V7.5 Q2.5 6.5 3.5 6.5 Z"/><path d="M11 7.2 L13.6 8 V12 L11 12.8"/><rect x="6" y="7.6" width="5" height="4.8" rx="1"/>' },
      { p: "gmc", tip: "Van or SUV", svg: '<path d="M2.5 6 H14.5 Q17.6 6.3 18 9 V11 Q17.6 13.7 14.5 14 H2.5 Q1.5 14 1.5 13 V7 Q1.5 6 2.5 6 Z"/><path d="M12.5 6.6 L14.8 7.4 V12.6 L12.5 13.4"/><path d="M5.5 6 V14 M9 6 V14" stroke-width="1"/>' },
      { p: "cargo", tip: "Cargo van: two seats, empty back", svg: '<path d="M2.5 6 H14.5 Q17.6 6.3 18 9 V11 Q17.6 13.7 14.5 14 H2.5 Q1.5 14 1.5 13 V7 Q1.5 6 2.5 6 Z"/><path d="M12.5 6.6 L14.8 7.4 V12.6 L12.5 13.4"/><path d="M9.5 6 V14"/><rect x="10.2" y="7.3" width="2" height="2.2" rx=".5" fill="currentColor" stroke="none"/><rect x="10.2" y="10.5" width="2" height="2.2" rx=".5" fill="currentColor" stroke="none"/>' },
      { p: "truck", tip: "Truck and trailer", svg: '<rect x="1" y="5.5" width="11" height="9" rx=".8"/><path d="M4.5 5.5 V14.5 M8 5.5 V14.5" stroke-width="1"/><path d="M12 10 H13.5"/><path d="M13.5 6 H17 Q18.8 6.3 19 8 V12 Q18.8 13.7 17 14 H13.5 Z"/>' },
      { p: "bike", tip: "Bicycle", svg: '<rect x="1.5" y="9" width="5" height="2" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="9" width="5" height="2" rx="1" fill="currentColor" stroke="none"/><path d="M5 10 H15"/><path d="M14 6 V14"/><path d="M6.8 8.9 Q9 9 9.5 10 Q9 11 6.8 11.1 Z" fill="currentColor"/>' },
      { p: "moto", tip: "Motorbike", svg: '<rect x="1.5" y="8.6" width="5" height="2.8" rx="1.4" fill="currentColor" stroke="none"/><rect x="14" y="8.8" width="4.5" height="2.4" rx="1.2" fill="currentColor" stroke="none"/><path d="M5 7.5 L11 7 Q13.5 7.2 14 10 Q13.5 12.8 11 13 L5 12.5 Q4 10 5 7.5 Z"/><path d="M13.5 4.5 V15.5"/>' } ] },
    { group: "Lights", items: [
      { p: "light", tip: "Light", svg: '<path d="M10 2.5 C13.3 2.5 15.5 5 15.5 8 C15.5 10.4 13.6 11.7 13 13.5 H7 C6.4 11.7 4.5 10.4 4.5 8 C4.5 5 6.7 2.5 10 2.5 Z"/><path d="M7.5 15.5 H12.5 M8.5 17.5 H11.5"/>' },
      { p: "sun", tip: "Sun: which way the sunlight falls", svg: '<circle cx="10" cy="10" r="3.4" fill="currentColor"/><path d="M10 2.5 V4.5 M10 15.5 V17.5 M2.5 10 H4.5 M15.5 10 H17.5 M4.7 4.7 L6.1 6.1 M13.9 13.9 L15.3 15.3 M15.3 4.7 L13.9 6.1 M6.1 13.9 L4.7 15.3"/>' },
      { p: "lamp", tip: "Fresnel", svg: '<rect x="6.5" y="10" width="7" height="6.5" rx="1.2"/><path d="M6.5 10 L4.5 7.5 M13.5 10 L15.5 7.5"/><path d="M8 8 L6.5 3 M12 8 L13.5 3" stroke-dasharray="1.4 1.8"/>' },
      { p: "panel", tip: "LED panel or softbox", svg: '<rect x="3" y="11" width="14" height="5" rx="1"/><path d="M7.7 11 V16 M12.3 11 V16" stroke-width="1"/><path d="M4.5 9 L2.5 4 M15.5 9 L17.5 4" stroke-dasharray="1.4 1.8"/>' },
      { p: "tube", tip: "Tube light", svg: '<path d="M4 5.5 H16 M4 14.5 H16" stroke-dasharray="1.4 1.8"/><rect x="2.5" y="8.5" width="15" height="3" rx="1.5"/><path d="M6.5 8.5 V11.5 M10 8.5 V11.5 M13.5 8.5 V11.5" stroke-width="1"/>' },
      { p: "flex", tip: "Small flex LED", svg: '<path d="M6 8 L4 3.5 M14 8 L16 3.5" stroke-dasharray="1.4 1.8"/><rect x="4.5" y="10" width="11" height="3.5" rx=".8"/><path d="M10 13.5 V15.5"/><rect x="8.5" y="15.5" width="3" height="2" rx=".4" fill="currentColor" stroke="none"/>' },
      { p: "practical", tip: "Practical lamp", svg: '<path d="M6 3 H14 L16 9 H4 Z"/><path d="M10 9 V15.5"/><path d="M6.5 17 H13.5"/>' } ] },
    { group: "Grip", items: [
      { p: "bounce", tip: "Bounce board", svg: '<rect x="2.5" y="10.5" width="15" height="3" rx=".6"/><path d="M5 8 Q10 4.5 15 8" stroke-dasharray="1.4 1.8"/><path d="M10 13.5 V16.5"/>' },
      { p: "flag", tip: "Flag or neg", svg: '<rect x="2.5" y="10.5" width="15" height="3" rx=".6" fill="currentColor"/><path d="M10 13.5 V16.5"/>' },
      { p: "cstand", tip: "C-stand", svg: '<circle cx="9" cy="12" r="1.4" fill="currentColor"/><path d="M9 12 V5 M9 12 L3.5 15.5 M9 12 L14.5 15.5"/><path d="M9 5 L17 3" stroke-dasharray="1.6 1.6"/>' },
      { p: "track", tip: "Dolly and track", svg: '<path d="M2 8 H18 M2 12 H18"/><path d="M4.5 6 V14 M10 6 V14 M15.5 6 V14" stroke-width="1"/>' },
      { p: "village", tip: "Video village", svg: '<rect x="3" y="3.5" width="14" height="3" rx=".8" fill="currentColor"/><rect x="3" y="10" width="5.5" height="6" rx="1.2"/><rect x="11.5" y="10" width="5.5" height="6" rx="1.2"/>' } ] },
    { group: "Furniture", items: [
      { p: "table", tip: "Table", svg: '<rect x="3" y="5.5" width="14" height="9" rx="1.5"/><rect x="5" y="7.5" width="10" height="5" rx=".5" stroke-width="1" opacity=".5"/>' },
      { p: "chair", tip: "Chair", svg: '<rect x="5.5" y="7.5" width="9" height="8.5" rx="2"/><rect x="5" y="4" width="10" height="2.6" rx="1.3" fill="currentColor"/>' },
      { p: "stool", tip: "Stool", svg: '<circle cx="10" cy="10" r="5"/><circle cx="10" cy="10" r="2.2" stroke-width="1"/>' },
      { p: "sofa", tip: "Sofa", svg: '<rect x="2.5" y="6" width="15" height="9" rx="2"/><path d="M2.5 9 H17.5"/><path d="M5.5 9 V15 M14.5 9 V15"/>' },
      { p: "bed", tip: "Double bed", svg: '<rect x="4" y="2.5" width="12" height="15" rx="1.5"/><rect x="5.5" y="4.2" width="4" height="2.8" rx="1"/><rect x="10.5" y="4.2" width="4" height="2.8" rx="1"/><path d="M4 9 H16"/>' },
      { p: "bed1", tip: "Single bed", svg: '<rect x="6.5" y="2.5" width="7" height="15" rx="1.2"/><rect x="8" y="4" width="4" height="2.6" rx="1"/><path d="M6.5 8.5 H13.5"/>' },
      { p: "lounger", tip: "Sun lounger", svg: '<rect x="6" y="2.5" width="8" height="15" rx="1.2"/><path d="M6 7 H14"/><path d="M8 9.5 H12 M8 12 H12 M8 14.5 H12" stroke-width="1"/>' },
      { p: "wardrobe", tip: "Wardrobe", svg: '<rect x="3.5" y="3" width="13" height="14" rx="1"/><path d="M10 3 V17"/><path d="M8.5 9 V11 M11.5 9 V11"/>' },
      { p: "cabinet", tip: "Cabinet", svg: '<rect x="3.5" y="4" width="13" height="12" rx="1"/><path d="M3.5 8 H16.5 M3.5 12 H16.5"/><path d="M9 6 H11 M9 10 H11 M9 14 H11"/>' },
      { p: "kitchen", tip: "Kitchen block", svg: '<rect x="2" y="7" width="16" height="7" rx=".8"/><path d="M2 7 H18" stroke-width="2.2"/><rect x="4" y="8.8" width="5" height="3.4" rx=".8" stroke-width="1"/>' },
      { p: "stove", tip: "Stove", svg: '<rect x="3" y="3" width="14" height="14" rx="1.2"/><circle cx="7" cy="7" r="2"/><circle cx="13" cy="7" r="1.5"/><circle cx="7" cy="13" r="1.5"/><circle cx="13" cy="13" r="2"/>' },
      { p: "fridge", tip: "Fridge", svg: '<rect x="5" y="2.5" width="10" height="15" rx="1.2"/><path d="M5 7.5 H15"/><path d="M12.5 4 V6 M12.5 9.5 V12.5"/>' },
      { p: "bar", tip: "Bar with stools", svg: '<rect x="2" y="4" width="16" height="5" rx="1" fill="currentColor"/><circle cx="5" cy="13.5" r="2"/><circle cx="10" cy="13.5" r="2"/><circle cx="15" cy="13.5" r="2"/>' },
      { p: "toilet", tip: "Toilet", svg: '<rect x="6" y="2.5" width="8" height="3.5" rx=".8"/><path d="M7 6 Q6.5 15 10 16.5 Q13.5 15 13 6 Z"/>' },
      { p: "plant", tip: "Plant or dressing", svg: '<path d="M10 10 Q14 7.5 17.5 10 Q14 12.5 10 10 Z"/><path d="M10 10 Q6 7.5 2.5 10 Q6 12.5 10 10 Z"/><path d="M10 10 Q7.5 6 10 2.5 Q12.5 6 10 10 Z"/><path d="M10 10 Q7.5 14 10 17.5 Q12.5 14 10 10 Z"/><circle cx="10" cy="10" r="1.8"' + BG + '/>' } ] }
  ];

  // the area that picks an object up, [width, height] around its centre
  var HIT = {
    actor: [28, 22], extra: [28, 22], mark: [18, 18],
    car: [200, 90], gmc: [244, 96], cargo: [236, 96], truck: [652, 128], bike: [84, 28], moto: [88, 42],
    light: [32, 32], sun: [44, 44], lamp: [36, 36], panel: [42, 24], tube: [54, 14], flex: [28, 16], practical: [30, 30],
    bounce: [64, 24], flag: [52, 22], cstand: [44, 40], track: [200, 36], village: [76, 54],
    table: [64, 40], chair: [28, 30], stool: [18, 18], sofa: [88, 40], bed: [68, 88], bed1: [40, 88], lounger: [32, 84],
    wardrobe: [52, 28], cabinet: [42, 24], kitchen: [100, 28], stove: [28, 28], fridge: [28, 30], bar: [88, 50], toilet: [18, 30],
    plant: [44, 44]
  };

  function rays(r1, r2, n){
    var d = "";
    for (var k = 0; k < n; k++){ var a = k * 2 * Math.PI / n, c = Math.cos(a), s = Math.sin(a);
      d += "M" + (c * r1).toFixed(1) + "," + (s * r1).toFixed(1) + " L" + (c * r2).toFixed(1) + "," + (s * r2).toFixed(1) + " "; }
    return d;
  }
  function leaves(){
    var s = "";
    for (var k = 0; k < 7; k++) s += '<path class="p-leaf" d="M0,0 Q10,-6 20,0 Q10,6 0,0 Z" transform="rotate(' + Math.round(k * 360 / 7) + ')"/>';
    return s;
  }
  // a car-like body facing +x: front at x2, rear at x1, half width w
  function body(x1, x2, w, nose){
    return '<path class="p-fill" d="M' + (x1 + 8) + ',' + (-w) + ' L' + (x2 - nose) + ',' + (-w) + ' Q' + (x2 - 8) + ',' + (-w + 2) + ' ' + x2 + ',' + (-w + 18) +
      ' L' + x2 + ',' + (w - 18) + ' Q' + (x2 - 8) + ',' + (w - 2) + ' ' + (x2 - nose) + ',' + w + ' L' + (x1 + 8) + ',' + w + ' Q' + x1 + ',' + w + ' ' + x1 + ',' + (w - 8) +
      ' L' + x1 + ',' + (-w + 8) + ' Q' + x1 + ',' + (-w) + ' ' + (x1 + 8) + ',' + (-w) + ' Z"/>';
  }
  function mirrors(x, y){ return '<ellipse class="p-fill" cx="' + x + '" cy="' + (-y) + '" rx="6.5" ry="3.4"/><ellipse class="p-fill" cx="' + x + '" cy="' + y + '" rx="6.5" ry="3.4"/>'; }
  function glass(x1, x2, h1, h2, bulge){
    return '<path class="p-glass" d="M' + x1 + ',' + (-h1) + ' L' + x2 + ',' + (-h2) + ' Q' + (x2 + bulge) + ',0 ' + x2 + ',' + h2 + ' L' + x1 + ',' + h1 + ' Z"/>';
  }
  function beam(n, f, w1, w2){ return '<path class="p-beam" d="M' + (-n) + ',' + (-f) + ' L' + (-w2) + ',-72 L' + w2 + ',-72 L' + n + ',' + (-f) + ' Z"/>'; }

  function shape(kind){
    switch (kind){
      // people
      case "actor": return '<rect class="p-fill" x="-11" y="-4" width="22" height="9" rx="4.5"/><circle class="p-white" r="5"/><path class="p-dot" d="M-1.2,-4.9 L0,-6.8 L1.2,-4.9 Z"/>';
      case "extra": return '<rect class="p-ghost" x="-11" y="-4" width="22" height="9" rx="4.5"/><circle class="p-ghost" r="5"/><path class="p-ghost-dot" d="M-1.2,-4.9 L0,-6.8 L1.2,-4.9 Z"/>';
      case "mark": return '<rect class="p-mark" x="-7" y="-6.5" width="14" height="3" rx=".4"/><rect class="p-mark" x="-1.5" y="-6.5" width="3" height="12" rx=".4"/>';
      // vehicles
      case "car": return mirrors(32, 40) + body(-93, 92, 36, 36) + glass(18, 44, 30, 25, 4) +
        '<path class="p-glass" d="M-40,-30 L-58,-26 Q-61,0 -58,26 L-40,30 Z"/><rect class="p-white" x="-42" y="-30" width="62" height="60" rx="6"/>' +
        '<path class="p-thin" d="M62,-22 Q70,0 62,22 M-80,-30 L-80,30"/>';
      case "gmc": return mirrors(70, 44) + body(-118, 116, 40, 24) + glass(58, 82, 34, 29, 4) +
        '<rect class="p-white" x="-112" y="-34" width="172" height="68" rx="5"/><path class="p-faint" d="M-72,-34 V34 M-30,-34 V34 M12,-34 V34"/><path class="p-thin" d="M90,-22 Q96,0 90,22"/>';
      case "cargo": return mirrors(64, 44) + body(-114, 113, 40, 25) + glass(58, 82, 34, 29, 4) +
        '<rect class="p-white" x="-108" y="-34" width="114" height="68" rx="3"/><path class="p-line" d="M6,-40 V40" style="stroke-width:2.2"/>' +
        '<rect class="p-seat" x="18" y="-30" width="24" height="24" rx="5"/><rect class="p-seatback" x="13" y="-30" width="7" height="24" rx="3"/>' +
        '<rect class="p-seat" x="18" y="6" width="24" height="24" rx="5"/><rect class="p-seatback" x="13" y="6" width="7" height="24" rx="3"/>' +
        '<ellipse class="p-line" cx="50" cy="-18" rx="3" ry="9"/><path class="p-faint" d="M-108,0 H-102"/>';
      case "truck": return '<rect class="p-fill" x="-323" y="-52" width="544" height="104" rx="3"/>' +
        '<path class="p-faint" d="M-273,-52 V52 M-223,-52 V52 M-173,-52 V52 M-123,-52 V52 M-73,-52 V52 M-23,-52 V52 M27,-52 V52 M77,-52 V52 M127,-52 V52 M177,-52 V52"/>' +
        '<path class="p-line" d="M-323,-52 V52" style="stroke-width:3"/><rect class="p-glass" x="221" y="-30" width="12" height="60"/>' +
        mirrors(306, 60).replace(/rx="6.5" ry="3.4"/g, 'rx="9" ry="4.5"') +
        '<path class="p-fill" d="M235,-52 L304,-52 Q320,-50 323,-32 L323,32 Q320,50 304,52 L235,52 Q231,52 231,48 L231,-48 Q231,-52 235,-52 Z"/>' +
        glass(294, 314, 46, 41, 4) + '<rect class="p-white" x="237" y="-46" width="59" height="92" rx="6"/><path class="p-faint" d="M262,-46 V46"/>';
      case "bike": return '<rect class="p-tyre" x="-41" y="-2.2" width="24" height="4.4" rx="2.2"/><rect class="p-tyre" x="17" y="-2.2" width="24" height="4.4" rx="2.2"/>' +
        '<path class="p-line" d="M-29,0 H27"/><path class="p-line" d="M22,-12 V12" style="stroke-width:2"/><path class="p-dot" d="M-16,-3.4 Q-6,-4.2 -3,0 Q-6,4.2 -16,3.4 Q-18,0 -16,-3.4 Z"/>';
      case "moto": return '<g transform="scale(.82 .9)"><rect class="p-tyre" x="-52" y="-5" width="27" height="10" rx="5"/><rect class="p-tyre" x="27" y="-4" width="24" height="8" rx="4"/>' +
        '<path class="p-fill" d="M-32,-9 L8,-11 Q22,-11 25,0 Q22,11 8,11 L-32,9 Q-38,0 -32,-9 Z"/><rect class="p-glass" x="-30" y="-6" width="24" height="12" rx="6"/>' +
        '<ellipse class="p-white" cx="6" rx="9" ry="7"/><path class="p-line" d="M22,-19 V19" style="stroke-width:2.2"/>' +
        '<circle class="p-white" cx="25" cy="-21" r="2.4"/><circle class="p-white" cx="25" cy="21" r="2.4"/><path class="p-amber-line" d="M50,-5 Q54,0 50,5"/></g>';
      // lights
      case "light": return '<g transform="scale(.7)">' + '<circle class="p-halo" r="20"/><path class="p-warm" d="M0,-15 C8.5,-15 13,-9 13,-3 C13,3 8,6.5 6.5,10 L-6.5,10 C-8,6.5 -13,3 -13,-3 C-13,-9 -8.5,-15 0,-15 Z"/>' +
        '<path class="p-amber-line" d="M-3.5,10 V2 L0,-2 L3.5,2 V10" style="stroke-width:1.1"/><rect class="p-amber" x="-6" y="10" width="12" height="3.2" rx="1"/><rect class="p-amber" x="-4.5" y="13.6" width="9" height="3" rx="1"/>' + '</g>';
      case "sun": return '<path class="p-amber-line p-sunray" d="M-6,16 L-14,52 M6,16 L14,52 M0,18 V56"/><circle class="p-sun" r="10"/><path class="p-amber-line" d="' + rays(14, 20, 8) + '" style="stroke-width:2"/>';
      case "lamp": return '<g transform="scale(.8)">' + beam(10, 10, 0, 40) + '<path class="p-amber-line" d="M-11,-9 L-19,-19 M11,-9 L19,-19" style="stroke-width:2"/><rect class="p-warm" x="-11" y="-9" width="22" height="20" rx="3"/>' +
        '<path class="p-amber-line" d="M-9,-9 H9" style="stroke-width:3"/><circle class="p-amber" cy="3" r="2.6"/>' + '</g>';
      case "panel": return '<g transform="scale(.75)">' + '<path class="p-beam soft" d="M-26,-9 L-48,-72 L48,-72 L26,-9 Z"/><rect class="p-warm" x="-26" y="-9" width="52" height="15" rx="2"/>' +
        '<path class="p-amber-line" d="M-13,-9 V6 M0,-9 V6 M13,-9 V6" style="stroke-width:1"/><path class="p-amber-line" d="M-26,-9 H26" style="stroke-width:2.6"/><circle class="p-amber" cy="12" r="2.6"/>' + '</g>';
      case "tube": return '<ellipse class="p-halo" rx="33" ry="13"/><rect class="p-warm" x="-22" y="-3" width="44" height="6" rx="3" style="stroke-width:1.2"/>' +
        '<path class="p-amber-line" d="M-15,-3 V3 M-9,-3 V3 M-3,-3 V3 M3,-3 V3 M9,-3 V3 M15,-3 V3" style="stroke-width:.6;opacity:.7"/>' +
        '<rect class="p-tyre" x="-25" y="-3.5" width="4.5" height="7" rx="1.2"/><rect class="p-tyre" x="20.5" y="-3.5" width="4.5" height="7" rx="1.2"/>';
      case "flex": return '<g transform="scale(.75)"><path class="p-beam soft" d="M-14,-7 L-30,-60 L30,-60 L14,-7 Z"/><rect class="p-warm" x="-16" y="-6" width="32" height="6" rx="1" style="stroke-width:1.2"/>' +
        '<path class="p-line" d="M0,0 V3" style="stroke-width:1.2"/><rect class="p-tyre" x="-3.5" y="3" width="7" height="3.5" rx=".6"/></g>';
      case "practical": return '<circle class="p-halo" r="22"/><circle class="p-warm" r="10.5"/><circle class="p-amber-line" r="6" style="stroke-width:1;opacity:.6"/><circle class="p-amber" r="2.6"/>';
      // grip
      case "bounce": return '<path class="p-amber-line" d="M-30,-4 Q0,-16 30,-4" style="stroke-width:1.2;stroke-dasharray:2 2.4;opacity:.7"/><rect class="p-white" x="-30" y="-3" width="60" height="6" rx="1"/>' +
        '<path class="p-amber-line" d="M-29,-3 H29" style="stroke-width:2"/><path class="p-line" d="M0,3 V7"/><circle class="p-dot" cy="9" r="2.6"/>';
      case "flag": return '<g transform="scale(.85 1)">' + '<rect class="p-solid" x="-28" y="-3" width="56" height="6" rx="1"/><path class="p-line" d="M0,3 V7"/><circle class="p-dot" cy="9" r="2.6"/>' + '</g>';
      case "cstand": return '<path class="p-line" d="M0,0 L0,-17 M0,0 L-14.7,8.5 M0,0 L14.7,8.5" style="stroke-linecap:round"/><path class="p-thin" d="M0,0 L22,-12" style="stroke-dasharray:3 2.4"/>' +
        '<circle class="p-dot" r="3.2"/><circle class="p-white" cx="22" cy="-12" r="2.4" style="stroke-width:1.4"/>';
      case "track": var sl = ""; for (var x = -90; x <= 90; x += 20) sl += "M" + x + ",-15 V15 ";
        return '<path class="p-thin" d="' + sl + '"/><path class="p-line" d="M-98,-10 H98 M-98,10 H98" style="stroke-width:2"/>' +
          '<rect class="p-dolly" x="-16" y="-15" width="32" height="30" rx="3"/><circle class="p-white p-dolly-seat" r="7"/><path class="p-camdot" d="M22,0 L30,-5 L30,5 Z"/>';
      case "village": return '<rect class="p-solid" x="-28" y="-22" width="56" height="7" rx="1.5"/><path class="p-line" d="M0,-15 V-9"/><circle class="p-dot" cy="-7" r="2.4"/>' +
        [-25, 0, 25].map(function(cx){ return '<rect class="p-fill" x="' + (cx - 11) + '" y="4" width="22" height="20" rx="3"/><rect class="p-glass" x="' + (cx - 12) + '" y="20" width="24" height="5" rx="2.5"/>'; }).join("");
      // furniture
      case "table": return '<rect class="p-fill" x="-30" y="-18" width="60" height="36" rx="3"/><rect class="p-inset" x="-26" y="-14" width="52" height="28" rx="1.5"/>';
      case "chair": return '<rect class="p-fill" x="-11" y="-8" width="22" height="19" rx="4"/><rect class="p-glass" x="-12.5" y="-13.5" width="25" height="6.5" rx="3.2"/>';
      case "stool": return '<circle class="p-fill" r="8"/><circle class="p-white" r="4.5" style="stroke-width:1.2"/>';
      case "sofa": return '<rect class="p-fill" x="-42" y="-18" width="84" height="36" rx="6"/><rect class="p-glass" x="-42" y="-18" width="84" height="10" rx="5"/>' +
        '<rect class="p-fill" x="-42" y="-11" width="9" height="29" rx="4"/><rect class="p-fill" x="33" y="-11" width="9" height="29" rx="4"/>' +
        '<rect class="p-white" x="-31" y="-7" width="30" height="22" rx="3"/><rect class="p-white" x="1" y="-7" width="30" height="22" rx="3"/>';
      case "bed": return '<rect class="p-fill" x="-32" y="-40" width="64" height="80" rx="3"/><rect class="p-glass" x="-32" y="-43" width="64" height="6" rx="2"/>' +
        '<rect class="p-white" x="-27" y="-34" width="25" height="11" rx="4"/><rect class="p-white" x="2" y="-34" width="25" height="11" rx="4"/>' +
        '<path class="p-white" d="M-32,-16 H32 V37 Q32,40 29,40 H-29 Q-32,40 -32,37 Z"/><path class="p-faint" d="M-32,-9 H32"/>';
      case "bed1": return '<rect class="p-fill" x="-18" y="-40" width="36" height="80" rx="3"/><rect class="p-glass" x="-18" y="-43" width="36" height="6" rx="2"/>' +
        '<rect class="p-white" x="-13" y="-34" width="26" height="11" rx="4"/><path class="p-white" d="M-18,-16 H18 V37 Q18,40 15,40 H-15 Q-18,40 -18,37 Z"/><path class="p-faint" d="M-18,-9 H18"/>';
      case "lounger": return '<rect class="p-fill" x="-14" y="-40" width="28" height="80" rx="4"/><rect class="p-white" x="-14" y="-40" width="28" height="24" rx="4"/>' +
        '<path class="p-thin" d="M-10,-32 H10 M-10,-24 H10 M-10,-6 H10 M-10,2 H10 M-10,10 H10 M-10,18 H10 M-10,26 H10 M-10,34 H10"/>';
      case "wardrobe": return '<path class="p-swing" d="M-24,12 A12 12 0 0 0 -12,24 M24,12 A12 12 0 0 1 12,24"/><rect class="p-fill" x="-24" y="-12" width="48" height="24" rx="1.5"/>' +
        '<path class="p-line" d="M-24,-12 H24" style="stroke-width:3"/><path class="p-line" d="M0,-10 V12" style="stroke-width:1.2"/><path class="p-thin" d="M-21,-2 H21" style="stroke-dasharray:3 2"/>';
      case "cabinet": return '<rect class="p-fill" x="-19" y="-9" width="38" height="18" rx="1.5"/><path class="p-line" d="M-19,-9 H19" style="stroke-width:3"/>' +
        '<path class="p-line" d="M-19,6.5 H19" style="stroke-width:1"/><circle class="p-dot" cx="-8" cy="8.5" r="1.3"/><circle class="p-dot" cx="8" cy="8.5" r="1.3"/>';
      case "kitchen": return '<rect class="p-fill" x="-48" y="-12" width="96" height="24" rx="1.5"/><path class="p-line" d="M-48,-12 H48" style="stroke-width:3"/>' +
        '<rect class="p-white" x="-36" y="-7" width="13" height="14" rx="3" style="stroke-width:1.2"/><rect class="p-white" x="-21" y="-7" width="13" height="14" rx="3" style="stroke-width:1.2"/>' +
        '<circle class="p-dot" cx="-22" cy="-9.5" r="1.6"/><path class="p-faint" d="M0,-12 V12 M24,-12 V12"/>';
      case "stove": return '<rect class="p-fill" x="-12" y="-12" width="24" height="24" rx="1.5"/><path class="p-line" d="M-12,-12 H12" style="stroke-width:3"/>' +
        '<circle class="p-white" cx="-5.5" cy="-4.5" r="4" style="stroke-width:1.2"/><circle class="p-white" cx="5.5" cy="-4.5" r="3" style="stroke-width:1.2"/>' +
        '<circle class="p-white" cx="-5.5" cy="5.5" r="3" style="stroke-width:1.2"/><circle class="p-white" cx="5.5" cy="5.5" r="4" style="stroke-width:1.2"/>' +
        '<circle class="p-dot" cx="-5.5" cy="-4.5" r="1.2"/><circle class="p-dot" cx="5.5" cy="5.5" r="1.2"/>';
      case "fridge": return '<path class="p-swing" d="M-12,13 A24 24 0 0 0 12,37"/><rect class="p-fill" x="-12" y="-13" width="24" height="26" rx="2"/>' +
        '<path class="p-line" d="M-12,10 H12" style="stroke-width:1.2"/><path class="p-line" d="M-7,6 H7" style="stroke-linecap:round"/>';
      case "bar": return '<rect class="p-glass" x="-42" y="-16" width="84" height="20" rx="2"/><rect class="p-solid" x="-42" y="-16" width="84" height="5" rx="2"/>' +
        [-30, -10, 10, 30].map(function(cx){ return '<circle class="p-fill" cx="' + cx + '" cy="15" r="7.5" style="stroke-width:1.4"/>'; }).join("");
      case "toilet": return '<g transform="scale(.8 .9)"><rect class="p-fill" x="-10" y="-16" width="20" height="8" rx="1.8"/><path class="p-white" d="M-8,-8 Q-9,13 0,15 Q9,13 8,-8 Z"/><ellipse class="p-thin" cy="3" rx="4.5" ry="6.5" style="stroke-width:1.2"/></g>';
      case "plant": return leaves() + '<circle class="p-white" r="5.5"/>';
      default: return '<circle class="p-line" r="4"/><circle class="p-line" r="13" style="stroke-dasharray:3 3"/>';
    }
  }

  FP.floorplanProps = { TOOLS: TOOLS, HIT: HIT, shape: shape };
})();
