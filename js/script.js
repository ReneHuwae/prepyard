/* Script page. The script itself is a document (HTML in project.script.html); shots made
   from it live in the project's scenes. A shot's text in the script is wrapped in a span
   carrying data-script-ref, which matches shot.scriptRef. Every change goes through
   commit(), which writes the script back into the project inside one FP.change(), so
   undo, autosave and the other pages all see the same thing. */
(function(){
  "use strict";
  var FP = window.FP;
  var SP = FP.scriptParse;
  FP.pages = FP.pages || {};

  function esc(s){
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg, ms){ if (FP.toast) FP.toast(msg, ms); }
  function lsGet(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e){} }
  function reducedMotion(){ return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function norm(t){ return String(t || "").replace(/\s+/g, " ").trim().toLowerCase(); }

  var SVGNS = "http://www.w3.org/2000/svg";

  // ---------- icons ----------
  var IC = {
    underline: '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.2v5.3a3.8 3.8 0 0 0 7.6 0V2.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="3" y1="13.3" x2="13" y2="13.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    strike: '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.4 4.3C10.8 3.1 9.6 2.5 8.1 2.5 6.3 2.5 5 3.4 5 4.8c0 1.1.8 1.7 2.2 2.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M5.2 11.2c.6 1.2 1.7 1.8 3.2 1.8 2 0 3.2-.9 3.2-2.3 0-.7-.3-1.2-.9-1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="2.4" y1="8" x2="13.6" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    erase: '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><line x1="3.8" y1="12.2" x2="12.2" y2="3.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    note: '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 2h9l3 3v9H2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M11 2v3h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="4.5" y1="7.3" x2="11.5" y2="7.3" stroke="currentColor" stroke-width="1"/><line x1="4.5" y1="9.8" x2="10" y2="9.8" stroke="currentColor" stroke-width="1"/></svg>',
    draw: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 13.5l.9-2.9 7.2-7.2 2 2-7.2 7.2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.6 3.4l2 2" stroke="currentColor" stroke-width="1.2"/></svg>',
    last: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2v9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4.6 7.8L8 11.2l3.4-3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pdf: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 1.5h6l3 3v10h-9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 1.5v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    compare: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 5h10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10 2.5l2.5 2.5-2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11H3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 8.5L3.5 11 6 13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    generate: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><line x1="2.5" y1="13.5" x2="10" y2="6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M12.2 2.2l.55 1.25 1.25.55-1.25.55-.55 1.25-.55-1.25-1.25-.55 1.25-.55z" fill="currentColor"/><path d="M13.5 8.2l.35.8.8.35-.8.35-.35.8-.35-.8-.8-.35.8-.35z" fill="currentColor"/></svg>'
  };
  var DRAW_ICONS = {
    select:  '<svg class="stb-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.8l8.7 5.4-3.9.9-1.5 3.9z" fill="currentColor"/></svg>',
    pencil:  '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 13.5l.9-2.9 7.2-7.2 2 2-7.2 7.2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.6 3.4l2 2" stroke="currentColor" stroke-width="1.2"/></svg>',
    marker:  '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.2 10.8l6.1-6.6 2.4 2.4-6.1 6.1H4.2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><line x1="2.6" y1="14.4" x2="9.4" y2="14.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    line:    '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><line x1="2.8" y1="2.8" x2="13.2" y2="13.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    arrow:   '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><line x1="2.8" y1="2.8" x2="12.6" y2="12.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8.4 12.9h4.7V8.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rect:    '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.4" y="4" width="11.2" height="8" stroke="currentColor" stroke-width="1.3"/></svg>',
    ellipse: '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><ellipse cx="8" cy="8" rx="5.8" ry="4.6" stroke="currentColor" stroke-width="1.3"/></svg>',
    eraser:  '<svg class="stb-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.1 10.2l5.1-5.1 4 4-3.6 3.6H5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><line x1="5.6" y1="14.2" x2="13.4" y2="14.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  };

  // Rev. 08 highlight colours. Pink and purple stay valid for highlights made in the
  // classic app; they just aren't offered any more.
  var ANNOT_COLORS = [
    { key: "orange", label: "Orange" }, { key: "yellow", label: "Yellow" },
    { key: "blue", label: "Blue" }, { key: "green", label: "Green" }
  ];
  var SIZE_FULL_NAMES = { EWS: "Extreme wide", WS: "Wide", FS: "Full", MWS: "Medium wide", MS: "Medium",
    MCU: "Medium close-up", CU: "Close-up", ECU: "Extreme close-up", Various: "Various" };

  // ---------- page state ----------
  var S = null;                  // the mounted page's elements; null while another page shows
  var selfChange = false;        // true while this page's own commit is going through FP.change
  var toggles = { shots: true, hl: true, notes: true };
  var scriptMode = "screenplay";
  var scriptPaper = null;
  var editMode = false;
  var editTimer = null;
  var lastCreatedRefId = null;
  var lastImportedPdf = null;
  var armedTool = null;          // { kind: underline | strike | note | erase | highlight, color }
  var refSnapshot = {};
  var LINES_PER_PAGE = 54, PAGE_GAP = 30;
  var pageStride = 0, pageCount = 0;

  function active(){
    return !!(S && FP.currentPage && FP.currentPage() === "script" && !document.querySelector("#modalHost .modal-backdrop"));
  }
  function inArea(node){ return !!(S && node && (node === S.area || S.area.contains(node))); }
  function selectionInArea(){
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    if (!inArea(sel.anchorNode) || !inArea(sel.focusNode)) return null;
    var r = sel.getRangeAt(0);
    return r.toString().trim() ? r : null;
  }
  function clearSelection(){ try { window.getSelection().removeAllRanges(); } catch (e){} }

  // ---------- saving the script into the project ----------
  // Pagination pushes, hover state and the shot badges are worked out on screen; none of
  // them belong in the saved script, or undo would see a change on every repaint.
  function serializeScript(){
    var c = S.area.cloneNode(true);
    Array.prototype.forEach.call(c.children, function(b){
      if (b.style && b.style.marginTop) b.style.removeProperty("margin-top");
      b.removeAttribute("data-pgpush");
    });
    c.querySelectorAll(".ssr-note").forEach(function(n){ n.remove(); });
    c.querySelectorAll(".script-shot-ref").forEach(function(sp){
      ["data-shot", "data-tip", "data-diverged", "data-abut", "data-hasnote"].forEach(function(a){ sp.removeAttribute(a); });
      sp.classList.remove("ssr-open", "ssr-settling", "ref-flash");
    });
    c.querySelectorAll(".script-reveal, .hl-wash").forEach(function(el){
      el.classList.remove("script-reveal", "hl-wash");
      el.style.removeProperty("--ri");
    });
    c.querySelectorAll("[style='']").forEach(function(el){ el.removeAttribute("style"); });
    c.querySelectorAll("[class='']").forEach(function(el){ el.removeAttribute("class"); });
    return c.innerHTML;
  }
  // Writes the script (and anything `extra` changes in the scenes) as one undo step.
  // `extra` runs first, since it may also mark the script (linking a heading to a scene).
  function commit(key, extra){
    if (!S) return;
    clearTimeout(editTimer); editTimer = null;
    var p = FP.project();
    if (!extra){
      var html0 = serializeScript(), draw0 = S.dwItems.innerHTML;
      if (html0 === p.script.html && draw0 === p.script.drawHTML &&
          scriptMode === p.script.mode && JSON.stringify(scriptPaper) === JSON.stringify(p.script.paper)) return;
    }
    selfChange = true;
    try {
      FP.change(function(proj){
        if (extra) extra(proj);
        proj.script.html = serializeScript();
        proj.script.drawHTML = S.dwItems.innerHTML;
        proj.script.mode = scriptMode;
        proj.script.paper = scriptPaper;
      }, key);
    } finally { selfChange = false; }
    resyncRefSnapshot();
  }
  function flushEdit(){ if (editTimer){ commit("script-edit"); } }

  // ---------- scenes and headings ----------
  function headings(){
    return Array.prototype.filter.call(S.area.children, function(n){ return n.classList.contains("sp-scene"); });
  }
  function sceneById(p, id){
    for (var i = 0; i < p.scenes.length; i++) if (p.scenes[i].id === id) return p.scenes[i];
    return null;
  }
  // Pair headings with scenes. A heading made into a scene here carries data-scene-id; one
  // from an older project is matched to an unclaimed scene of the same name, in order.
  function linkHeadings(p){
    var claimed = {};
    var hs = headings();
    hs.forEach(function(h){
      var id = h.getAttribute("data-scene-id");
      if (id && sceneById(p, id) && !claimed[id]) claimed[id] = true;
      else if (id) h.removeAttribute("data-scene-id");
    });
    hs.forEach(function(h){
      if (h.getAttribute("data-scene-id")) return;
      var parsed = SP.parseSlugline((h.textContent || "").trim());
      if (!parsed) return;
      var want = norm(parsed.name);
      for (var i = 0; i < p.scenes.length; i++){
        var sc = p.scenes[i];
        if (!claimed[sc.id] && norm(sc.name) === want){
          claimed[sc.id] = true;
          h.setAttribute("data-scene-id", sc.id);
          break;
        }
      }
    });
  }
  // the heading a selection sits under
  function findGoverningSlugline(range){
    var node = range.startContainer;
    if (node === S.area){
      var kids = S.area.childNodes;
      node = kids[Math.min(range.startOffset, kids.length - 1)] || null;
    } else {
      while (node && node.parentNode !== S.area) node = node.parentNode;
    }
    if (!node) return null;
    var nodes = Array.prototype.slice.call(S.area.childNodes);
    for (var i = nodes.indexOf(node); i >= 0; i--){
      var text = (nodes[i].textContent || "").trim();
      if (!text) continue;
      var parsed = SP.parseSlugline(text);
      if (parsed) return { node: nodes[i], parsed: parsed };
    }
    return null;
  }
  // adds a location to the project if it isn't there; returns its name as stored
  function ensureLocation(p, name){
    var n = String(name || "").trim();
    if (!n) return "";
    for (var i = 0; i < p.locations.length; i++){
      if (norm(p.locations[i].name) === norm(n)) return p.locations[i].name;
    }
    p.locations.push({ id: FP.uid("l"), name: n, address: "", coords: "", photos: [], sunpath: [] });
    return n;
  }
  function newSceneFromHeading(p, h, parsed){
    var loc = ensureLocation(p, parsed.name);
    var scene = FP.blankScene({
      num: String(FP.nextSceneNumber(p)), name: parsed.name, intext: parsed.intext,
      daynight: parsed.daynight || "DAY", summary: SP.sceneSummaryFrom(h),
      shots: [FP.blankShot({ location: loc })]
    });
    p.scenes.push(scene);
    h.setAttribute("data-scene-id", scene.id);
    return scene;
  }
  function sceneLocation(p, scene){
    for (var i = 0; i < scene.shots.length; i++) if (scene.shots[i].location) return scene.shots[i].location;
    for (var j = 0; j < p.locations.length; j++) if (norm(p.locations[j].name) === norm(scene.name)) return p.locations[j].name;
    return "";
  }
  function findShot(p, refOrId, byRef){
    for (var i = 0; i < p.scenes.length; i++){
      var shots = p.scenes[i].shots;
      for (var j = 0; j < shots.length; j++){
        if (byRef ? shots[j].scriptRef === refOrId : shots[j].id === refOrId){
          return { scene: p.scenes[i], shot: shots[j], index: j };
        }
      }
    }
    return null;
  }
  function shotLabel(scene, index){ return FP.shotNumbers(scene)[index].label; }

  // ---------- shots from the script ----------
  function wrapRangeInRefs(range, refId){
    var sc = range.startContainer, so = range.startOffset, ec = range.endContainer, eo = range.endOffset;
    var walker = document.createTreeWalker(S.area, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
    var made = 0;
    // one span per text run, so a selection across lines never wraps a block in an inline
    nodes.forEach(function(n){
      var start = (n === sc) ? so : 0, end = (n === ec) ? eo : n.length;
      if (end <= start || !n.data.slice(start, end).trim()) return;
      if (n.parentNode && n.parentNode.closest(".script-shot-ref")) return;
      var r = document.createRange();
      r.setStart(n, start); r.setEnd(n, end);
      var sp = document.createElement("span");
      sp.className = "script-shot-ref";
      sp.setAttribute("data-script-ref", refId);
      try { r.surroundContents(sp); made++; } catch (err){}
    });
    return made > 0;
  }
  function unwrapScriptRef(refId){
    S.area.querySelectorAll('.script-shot-ref[data-script-ref="' + refId + '"]').forEach(function(span){
      var parent = span.parentNode;
      span.querySelectorAll(".ssr-note").forEach(function(n){ n.remove(); });
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
  }
  // returns the new shot's id, or null
  function createShotFromRange(range, size){
    var text = range.toString().replace(/\s+/g, " ").trim();
    if (!text) return null;
    var gov = findGoverningSlugline(range);
    if (!gov && S.area.querySelector(".sp-scene")){
      toast("That line sits above the first scene heading, so there's no scene to add it to.", 4000);
      return null;
    }
    linkHeadings(FP.project());
    var refId = FP.uid("sref-");
    if (!wrapRangeInRefs(range, refId)) return null;
    var made = null;
    commit(null, function(p){
      var scene = null;
      if (gov){
        scene = sceneById(p, gov.node.getAttribute("data-scene-id"));
        if (!scene) scene = newSceneFromHeading(p, gov.node, gov.parsed);
      } else {
        scene = p.scenes[p.scenes.length - 1];
        if (!scene){ scene = FP.blankScene({ num: "1" }); p.scenes.push(scene); }
      }
      var loc = sceneLocation(p, scene);
      var blank = scene.shots.length === 1 && !scene.shots[0].scriptRef && !scene.shots[0].action ? scene.shots[0] : null;
      var shot = blank || FP.blankShot();
      shot.action = text;
      shot.scriptRef = refId;
      if (size) shot.size = size;
      if (!shot.location) shot.location = loc;
      if (!blank) scene.shots.push(shot);
      made = { scene: scene, shot: shot };
    });
    if (!made) return null;
    lastCreatedRefId = refId;
    updateJumpBtn();
    var label = shotLabel(made.scene, made.scene.shots.indexOf(made.shot));
    toast("Shot " + label + (size ? " (" + size + ")" : "") + " added to sc " + made.scene.num +
      (made.scene.name ? " · " + made.scene.name : "") + ".");
    return made.shot.id;
  }

  // ---------- shot badges over the script ----------
  function shotTipText(scene, index){
    var shot = scene.shots[index];
    function pad(n){ n = String(n || "").trim(); return /^[0-9]+$/.test(n) && n.length < 2 ? "0" + n : n; }
    var bits = [];
    bits.push("SC" + pad(scene.num) + " SH" + pad(shotLabel(scene, index)));
    if (shot.shotType) bits.push(shot.shotType);
    if (shot.size) bits.push(shot.size);
    if (shot.lens) bits.push(/^[\d.]+$/.test(shot.lens) ? shot.lens + "mm" : shot.lens);
    return bits.join("  ·  ");
  }
  function setShotRefNote(sp, text, tipText){
    var el = sp.lastElementChild;
    if (!el || el.className !== "ssr-note") el = null;
    if (!text){
      if (el) el.remove();
      sp.removeAttribute("data-hasnote");
      return;
    }
    if (!el){
      el = document.createElement("i");
      el.className = "ssr-note";
      el.setAttribute("contenteditable", "false");
      sp.appendChild(el);
    }
    el.setAttribute("data-note", text);
    el.setAttribute("data-tip", tipText || "");
    sp.setAttribute("data-hasnote", "1");
  }
  function refreshBadges(p){
    if (!S) return;
    var marks = S.area.querySelectorAll(".script-shot-ref");
    if (!marks.length) return;
    var byRef = {};
    p.scenes.forEach(function(sc){
      sc.shots.forEach(function(sh, i){ if (sh.scriptRef) byRef[sh.scriptRef] = { scene: sc, shot: sh, index: i }; });
    });
    var marked = {};
    marks.forEach(function(sp){
      var id = sp.getAttribute("data-script-ref");
      marked[id] = (marked[id] || "") + sp.textContent;
    });
    var seen = {};
    marks.forEach(function(sp){
      var id = sp.getAttribute("data-script-ref");
      sp.removeAttribute("data-shot");
      setShotRefNote(sp, "", "");
      // two marks that touch read as one; the second gets a hairline on its leading edge
      var prev = sp.previousSibling;
      while (prev && prev.nodeType === 3 && prev.textContent.length === 0) prev = prev.previousSibling;
      if (prev && prev.nodeType === 1 && prev.classList && prev.classList.contains("script-shot-ref") &&
          prev.getAttribute("data-script-ref") !== id) sp.setAttribute("data-abut", "1");
      else sp.removeAttribute("data-abut");
      var hit = byRef[id];
      if (!hit){ sp.removeAttribute("data-diverged"); sp.removeAttribute("data-tip"); return; }
      // the shotlist's action has been rewritten since this mark was made
      if (norm(marked[id]) === norm(hit.shot.action)) sp.removeAttribute("data-diverged");
      else sp.setAttribute("data-diverged", "1");
      if (seen[id]) return;
      seen[id] = 1;
      sp.setAttribute("data-shot", shotLabel(hit.scene, hit.index));
      var tip = shotTipText(hit.scene, hit.index);
      sp.setAttribute("data-tip", tip);
      setShotRefNote(sp, (hit.shot.notes || "").trim(), tip);
    });
  }
  function snapshotRefs(){
    var snap = {};
    if (!S) return snap;
    S.area.querySelectorAll(".script-shot-ref").forEach(function(r){
      var id = r.getAttribute("data-script-ref");
      snap[id] = (snap[id] || "") + r.textContent;
    });
    return snap;
  }
  function resyncRefSnapshot(){ refSnapshot = snapshotRefs(); }

  // ---------- pagination ----------
  function applyScriptPaper(paper){
    scriptPaper = paper || null;
    var st = S.stage.style;
    if (!paper){
      st.removeProperty("--sp-pw"); st.removeProperty("--sp-padtop"); st.removeProperty("--sp-padbot");
      LINES_PER_PAGE = 54;
      return;
    }
    st.setProperty("--sp-pw", String(paper.wIn));
    st.setProperty("--sp-padtop", String(paper.padTopIn));
    st.setProperty("--sp-padbot", String(paper.padBotIn));
    LINES_PER_PAGE = paper.linesPerPage || 54;
  }
  function setScriptMode(mode){
    scriptMode = mode === "treatment" ? "treatment" : "screenplay";
    if (!S) return;
    S.area.setAttribute("data-mode", scriptMode);
    S.stage.setAttribute("data-mode", scriptMode);
  }
  function paginate(){
    if (!S) return;
    if (scriptMode === "treatment"){
      S.pages.innerHTML = ""; S.nums.innerHTML = "";
      S.area.style.minHeight = "";
      pageCount = S.area.querySelectorAll(".tm-page").length;
      updatePageNo();
      return;
    }
    // a hidden page measures 0 tall; it re-runs when it comes back
    if (!S.area.offsetParent && S.area.offsetHeight === 0) return;
    var cs = getComputedStyle(S.area);
    var padTop = parseFloat(cs.paddingTop) || 0, padBottom = parseFloat(cs.paddingBottom) || 0;
    var lineH = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 14) * 1.4;
    var contentH = Math.round(lineH * LINES_PER_PAGE);
    var pageH = Math.round(padTop + contentH + padBottom);
    var stride = pageH + PAGE_GAP;
    // clear every inline top margin: a block's real spacing is in its class, so any inline
    // one is a page push from an earlier pass
    var blocks = S.area.children, i;
    for (i = 0; i < blocks.length; i++){
      if (blocks[i].style && blocks[i].style.marginTop) blocks[i].style.removeProperty("margin-top");
      blocks[i].removeAttribute("data-pgpush");
    }
    var lastBottom = padTop;
    for (i = 0; i < blocks.length; i++){
      var b = blocks[i];
      var top = b.offsetTop, h = b.offsetHeight;
      if (!h) continue;
      var idx = Math.max(0, Math.floor((top - padTop) / stride));
      var limit = idx * stride + padTop + contentH;
      var atPageTop = Math.abs(top - (idx * stride + padTop)) < 0.5;
      // a block from a new PDF page always starts a page, like it did in the source
      var forcedBreak = b.hasAttribute("data-pgbreak") && !atPageTop;
      var overflows = (top + h > limit) && (h <= contentH);
      if (forcedBreak || overflows){
        var push = (idx + 1) * stride + padTop - top;
        var base = parseFloat(getComputedStyle(b).marginTop) || 0;
        b.style.setProperty("margin-top", (base + push) + "px", "important");
        b.setAttribute("data-pgpush", "1");
        top += push;
      }
      lastBottom = top + h;
    }
    var pages = Math.max(1, Math.ceil((lastBottom - padTop) / stride));
    S.area.style.minHeight = (pages * stride - PAGE_GAP) + "px";
    var rects = "";
    for (var q = 0; q < pages; q++) rects += '<div class="script-page" style="top:' + (q * stride) + 'px;height:' + pageH + 'px;"></div>';
    S.pages.innerHTML = rects;
    var nums = "";
    for (var n = 1; n < pages; n++) nums += '<span style="top:' + (n * stride + padTop * 0.5) + 'px;">' + (n + 1) + '.</span>';
    S.nums.innerHTML = nums;
    pageStride = stride;
    pageCount = pages;
    updatePageNo();
  }
  // Courier Prime must be measured, not its fallback; ask for the face so the last pass runs
  // once it's really there
  function repaginateWhenSettled(){
    paginate();
    requestAnimationFrame(paginate);
    if (document.fonts && document.fonts.load){
      ['12px "Courier Prime"', '700 12px "Courier Prime"'].forEach(function(face){
        try { document.fonts.load(face).then(paginate).catch(function(){}); } catch (e){}
      });
    }
  }
  var paginateTimer = null;
  function queuePaginate(){ clearTimeout(paginateTimer); paginateTimer = setTimeout(paginate, 120); }

  function updatePageNo(){
    if (!S) return;
    if (!S.area.textContent.trim() && !S.area.querySelector(".tm-page")){ S.pageNo.textContent = ""; return; }
    var rect = S.stage.getBoundingClientRect();
    var probe = window.innerHeight * 0.35 - rect.top;
    var page = 1;
    if (scriptMode === "treatment"){
      var tms = S.area.querySelectorAll(".tm-page");
      for (var i = 0; i < tms.length; i++){ if (tms[i].offsetTop <= probe) page = i + 1; }
    } else if (pageStride){
      page = Math.min(pageCount, Math.max(1, Math.floor(probe / pageStride) + 1));
    }
    var sceneTxt = "";
    var hs = headings();
    var cur = null;
    for (var j = 0; j < hs.length; j++){ if (hs[j].offsetTop <= probe) cur = hs[j]; else break; }
    if (cur){
      var sc = sceneById(FP.project(), cur.getAttribute("data-scene-id"));
      if (sc) sceneTxt = ", scene " + sc.num;
      markRailActive(sc ? sc.id : null);
    }
    S.pageNo.textContent = "Page " + page + " of " + Math.max(1, pageCount) + sceneTxt;
  }

  // ---------- scene rail ----------
  var railActiveId = null;
  // the scenes that have a heading in the script, the same way linkHeadings pairs them,
  // read without touching the page
  function scenesInScript(p){
    var claimed = {}, hs = headings();
    hs.forEach(function(h){ var id = h.getAttribute("data-scene-id"); if (id && sceneById(p, id)) claimed[id] = true; });
    hs.forEach(function(h){
      var id = h.getAttribute("data-scene-id");
      if (id && claimed[id]) return;
      var parsed = SP.parseSlugline((h.textContent || "").trim());
      if (!parsed) return;
      var want = norm(parsed.name);
      for (var i = 0; i < p.scenes.length; i++){
        if (!claimed[p.scenes[i].id] && norm(p.scenes[i].name) === want){ claimed[p.scenes[i].id] = true; break; }
      }
    });
    return p.scenes.filter(function(sc){ return claimed[sc.id]; });
  }
  // the rail only lists scenes it can jump to, and goes away until there are any
  function renderRail(p){
    if (!S) return;
    var list = scenesInScript(p);
    S.root.classList.toggle("no-rail", !list.length);
    S.railCount.textContent = "Scenes, " + list.length;
    S.railEmpty.hidden = true;
    S.railList.innerHTML = list.map(function(sc){
      var dots = "";
      if (/INT/i.test(sc.intext)) dots += '<span class="tagdot int" title="Interior"></span>';
      if (/EXT/i.test(sc.intext)) dots += '<span class="tagdot ext" title="Exterior"></span>';
      if (/NIGHT|DUSK|DAWN/i.test(sc.daynight)) dots += '<span class="tagdot night" title="' + esc(sc.daynight) + '"></span>';
      var dn = sc.daynight ? sc.daynight.charAt(0) + sc.daynight.slice(1).toLowerCase() : "";
      var shots = sc.shots.filter(function(s){ return s.action || s.scriptRef; }).length;
      return '<button type="button" class="scene-item' + (sc.id === railActiveId ? " active" : "") + '" data-scene="' + esc(sc.id) + '">' +
        '<span class="n">' + esc(sc.num) + '</span>' +
        '<span class="t"><span class="slug">' + esc(sc.name || "Untitled scene") + '</span>' +
        '<span class="meta">' + esc([dn, shots + (shots === 1 ? " shot" : " shots")].filter(Boolean).join(", ")) + '</span>' +
        (dots ? '<span class="tags">' + dots + '</span>' : "") + '</span></button>';
    }).join("");
  }
  function markRailActive(id){
    if (!S || id === railActiveId) return;
    railActiveId = id;
    S.railList.querySelectorAll(".scene-item").forEach(function(b){ b.classList.toggle("active", b.dataset.scene === id); });
  }
  function jumpToScene(id){
    var p = FP.project();
    linkHeadings(p);
    var target = S.area.querySelector('.sp-scene[data-scene-id="' + id + '"]');
    if (!target){
      var sc = sceneById(p, id);
      var want = sc ? norm(sc.name) : "";
      if (want) target = headings().filter(function(h){ return norm(h.textContent).indexOf(want) !== -1; })[0];
    }
    markRailActive(id);
    if (target) target.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    else toast("That scene's heading isn't in the script.");
  }

  // ---------- reveal flourishes ----------
  function revealNewBlocks(beforeSet){
    if (!S || reducedMotion()) return;
    var animated = 0;
    Array.prototype.forEach.call(S.area.children, function(b){
      if (animated >= 150 || (beforeSet && beforeSet.has(b))) return;
      b.classList.add("script-reveal");
      b.style.setProperty("--ri", Math.min(animated, 55));
      b.addEventListener("animationend", function(){ b.classList.remove("script-reveal"); b.style.removeProperty("--ri"); }, { once: true });
      animated++;
    });
    if (animated){
      var sweep = document.createElement("div");
      sweep.className = "script-shine-sweep";
      sweep.addEventListener("animationend", function(){ sweep.remove(); }, { once: true });
      S.stage.appendChild(sweep);
    }
  }
  function playMagicBurst(anchorEl){
    if (reducedMotion()) return;
    var r = anchorEl.getBoundingClientRect();
    var host = document.createElement("div");
    host.className = "magic-burst";
    host.style.left = (r.left + r.width / 2) + "px";
    host.style.top = (r.top + r.height / 2) + "px";
    var colors = ["var(--accent)", "#FFE176", "#9AD1FF", "#B6F0C2"];
    host.innerHTML = '<div class="magic-ring"></div>';
    for (var i = 0; i < 22; i++){
      var p = document.createElement("div");
      var isStar = i % 3 === 0;
      p.className = "magic-particle" + (isStar ? " mp-star" : "");
      var angle = (Math.PI * 2 * i) / 22 + (Math.random() * 0.4 - 0.2);
      var dist = 60 + Math.random() * 70;
      p.style.setProperty("--dx", (Math.cos(angle) * dist).toFixed(1) + "px");
      p.style.setProperty("--dy", (Math.sin(angle) * dist - 30).toFixed(1) + "px");
      p.style.setProperty("--rot", (Math.random() * 260 - 130).toFixed(0) + "deg");
      p.style.setProperty("--ms", (isStar ? 10 + Math.random() * 6 : 4 + Math.random() * 4).toFixed(1) + "px");
      p.style.setProperty("--mc", colors[i % colors.length]);
      p.style.setProperty("--md", (700 + Math.random() * 500).toFixed(0) + "ms");
      p.style.setProperty("--mdelay", (Math.random() * 140).toFixed(0) + "ms");
      host.appendChild(p);
    }
    document.body.appendChild(host);
    setTimeout(function(){ host.remove(); }, 1500);
  }
  function spawnPoof(el){
    if (reducedMotion() || !el.getBoundingClientRect) return;
    var r = el.getBoundingClientRect();
    var host = document.createElement("div");
    host.className = "poof-host";
    host.style.left = (r.left + r.width / 2) + "px";
    host.style.top = (r.top + r.height / 2) + "px";
    for (var i = 0; i < 10; i++){
      var p = document.createElement("div");
      p.className = "poof-puff";
      var a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 26;
      p.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px");
      p.style.setProperty("--dy", (Math.sin(a) * d - 14).toFixed(1) + "px");
      p.style.setProperty("--ps", (8 + Math.random() * 14).toFixed(0) + "px");
      p.style.setProperty("--pscale", (1.6 + Math.random() * 1.2).toFixed(2));
      p.style.setProperty("--pd", (420 + Math.random() * 260).toFixed(0) + "ms");
      p.style.setProperty("--pdelay", (Math.random() * 90).toFixed(0) + "ms");
      host.appendChild(p);
    }
    document.body.appendChild(host);
    setTimeout(function(){ host.remove(); }, 900);
  }

  // ---------- generate scenes & locations ----------
  function generateScenes(btn){
    playMagicBurst(btn);
    btn.classList.remove("gs-cast"); void btn.offsetWidth; btn.classList.add("gs-cast");
    var p = FP.project();
    linkHeadings(p);
    var hs = headings().map(function(h){ return { node: h, parsed: SP.parseSlugline((h.textContent || "").trim()) }; })
      .filter(function(x){ return x.parsed; });
    if (!hs.length){
      toast("No scene headings found. Scene headings start with INT. or EXT.", 4500);
      return;
    }
    var locNames = {};
    p.locations.forEach(function(l){ if (l.name) locNames[norm(l.name)] = 1; });
    // work out what would change first, so a second click doesn't add an empty undo step
    var toCreate = hs.filter(function(x){ return !sceneById(p, x.node.getAttribute("data-scene-id")); });
    var toSummarize = hs.filter(function(x){
      var sc = sceneById(p, x.node.getAttribute("data-scene-id"));
      return sc && !sc.summary && SP.sceneSummaryFrom(x.node);
    });
    var newLocs = hs.filter(function(x){ return !locNames[norm(x.parsed.name)]; });
    var blankLocShots = 0;
    p.scenes.forEach(function(sc){
      if (!sc.name) return;
      var known = locNames[norm(sc.name)] || hs.some(function(x){ return norm(x.parsed.name) === norm(sc.name); });
      if (known) sc.shots.forEach(function(sh){ if (!sh.location) blankLocShots++; });
    });
    if (!toCreate.length && !toSummarize.length && !newLocs.length && !blankLocShots){
      toast("Every scene heading already has its scene, summary and location.");
      return;
    }
    var created = 0, summed = 0, filled = 0, before = p.locations.length;
    commit(null, function(proj){
      hs.forEach(function(x){
        var sc = sceneById(proj, x.node.getAttribute("data-scene-id"));
        if (!sc){ newSceneFromHeading(proj, x.node, x.parsed); created++; return; }
        ensureLocation(proj, x.parsed.name);
        if (!sc.summary){
          var s = SP.sceneSummaryFrom(x.node);
          if (s){ sc.summary = s; summed++; }
        }
      });
      proj.scenes.forEach(function(sc){
        var match = null;
        proj.locations.forEach(function(l){ if (norm(l.name) === norm(sc.name)) match = l.name; });
        if (!match) return;
        sc.shots.forEach(function(sh){ if (!sh.location){ sh.location = match; filled++; } });
      });
    });
    var addedLocs = FP.project().locations.length - before;
    var bits = [];
    if (created) bits.push("Created " + created + (created === 1 ? " scene" : " scenes"));
    if (addedLocs) bits.push(addedLocs + (addedLocs === 1 ? " new location" : " new locations"));
    if (summed) bits.push(summed + (summed === 1 ? " scene summary" : " scene summaries"));
    if (filled && !created) bits.push("filled " + filled + (filled === 1 ? " shot location" : " shot locations"));
    toast((bits.join(", ") || "Updated the scenes") + ".", 4000);
  }

  // ---------- annotations ----------
  function wrapRangeInAnnotation(range, className, attrs){
    var sc = range.startContainer, so = range.startOffset, ec = range.endContainer, eo = range.endOffset;
    var walker = document.createTreeWalker(S.area, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
    var made = 0;
    nodes.forEach(function(n){
      var start = (n === sc) ? so : 0, end = (n === ec) ? eo : n.length;
      if (end <= start || !n.data.slice(start, end).trim()) return;
      var r = document.createRange();
      r.setStart(n, start); r.setEnd(n, end);
      var sp = document.createElement("span");
      sp.className = "script-note " + className + (className === "script-note-hl" ? " hl-wash" : "");
      if (attrs) Object.keys(attrs).forEach(function(k){ sp.setAttribute(k, attrs[k]); });
      if (className === "script-note-hl") sp.addEventListener("animationend", function(){ sp.classList.remove("hl-wash"); }, { once: true });
      try { r.surroundContents(sp); made++; } catch (err){}
    });
    return made > 0;
  }
  function unwrapAnnotationSpan(span){
    if (!span || !span.parentNode) return;
    var parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  }
  // notes carry written content, so a blanket erase leaves them; they have their own Remove
  function removeAnnotationsInRange(range){
    var removed = 0;
    S.area.querySelectorAll(".script-note-hl, .script-note-underline, .script-note-strike").forEach(function(sp){
      if (range.intersectsNode(sp)){ unwrapAnnotationSpan(sp); removed++; }
    });
    return removed > 0;
  }
  function applyAnnotation(kind, range, color, anchorRect){
    if (kind === "note"){ showNotePopup(range, anchorRect || range.getBoundingClientRect()); clearSelection(); return; }
    var changed = false;
    if (kind === "underline") changed = wrapRangeInAnnotation(range, "script-note-underline");
    else if (kind === "strike") changed = wrapRangeInAnnotation(range, "script-note-strike");
    else if (kind === "highlight") changed = wrapRangeInAnnotation(range, "script-note-hl", { "data-color": color });
    else if (kind === "erase") changed = removeAnnotationsInRange(range);
    clearSelection();
    if (changed) commit();
  }
  function setArmedTool(tool){
    armedTool = tool;
    if (!S) return;
    S.annotTools.querySelectorAll(".sat-tool").forEach(function(b){
      var on = !!tool && b.dataset.annot === tool.kind && (tool.kind !== "highlight" || b.dataset.color === tool.color);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    S.area.classList.toggle("annot-armed", !!tool);
  }
  function applyArmedToSelection(){
    if (!armedTool) return false;
    var r = selectionInArea();
    if (!r) return false;
    applyAnnotation(armedTool.kind, r.cloneRange(), armedTool.color);
    return true;
  }

  // ---------- floating panels: selection bar, note editor, shot details ----------
  var sizeBarEl = null, sizeBarRange = null;
  function placeNear(el, rect){
    var w = el.offsetWidth, h = el.offsetHeight;
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    var top = rect.bottom + 8;
    if (top + h > window.innerHeight - 8) top = rect.top - h - 8;
    el.style.left = left + "px";
    el.style.top = Math.max(8, top) + "px";
  }
  function closeSizeBar(){ if (sizeBarEl){ sizeBarEl.remove(); sizeBarEl = null; } sizeBarRange = null; }
  function showSizeBar(range){
    var rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)){ closeSizeBar(); return; }
    closeSizeBar();
    sizeBarRange = range.cloneRange();
    var el = document.createElement("div");
    el.className = "script-size-toolbar";
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", "Make a shot or mark up the selection");
    var sizes = FP.visibleOptions(FP.project(), "size").filter(Boolean);
    el.innerHTML =
      '<div class="sst-group"><span class="sst-label">Create shot</span><div class="sst-row">' +
        sizes.map(function(s, i){
          return '<button type="button" class="script-size-btn" data-size="' + esc(s) + '" title="' + esc((SIZE_FULL_NAMES[s] || s) + (i < 9 ? " (" + (i + 1) + ")" : "")) + '">' +
            (i < 9 ? '<span class="ssb-key">' + (i + 1) + '</span>' : "") + '<span class="ssb-label">' + esc(s) + '</span></button>';
        }).join("") + '</div></div>' +
      '<div class="sst-group sst-group-annot"><span class="sst-label">Mark up</span><div class="sst-row">' +
        '<button type="button" class="script-annot-btn" data-annot="underline" title="Underline">' + IC.underline + '</button>' +
        '<button type="button" class="script-annot-btn" data-annot="strike" title="Strikethrough">' + IC.strike + '</button>' +
        ANNOT_COLORS.map(function(c){
          return '<button type="button" class="script-annot-btn swatch" data-annot="highlight" data-color="' + c.key + '" title="' + esc(c.label) + ' highlight"></button>';
        }).join("") +
        '<button type="button" class="script-annot-btn" data-annot="erase" title="Remove markup from the selection">' + IC.erase + '</button>' +
        '<button type="button" class="script-annot-btn" data-annot="note" title="Add a note">' + IC.note + '</button>' +
      '</div></div>';
    document.body.appendChild(el);
    sizeBarEl = el;
    placeNear(el, rect);
    el.addEventListener("mousedown", function(e){ e.preventDefault(); });     // keep the selection
    el.addEventListener("click", function(e){
      var sb = e.target.closest(".script-size-btn");
      var ab = e.target.closest(".script-annot-btn");
      if (!sb && !ab) return;
      var range = sizeBarRange;
      var anchor = (sb || ab).getBoundingClientRect();
      closeSizeBar();
      if (sb){
        var id = createShotFromRange(range, sb.dataset.size);
        clearSelection();
        if (id) showShotPopup(id, anchor);
      } else {
        applyAnnotation(ab.dataset.annot, range, ab.dataset.color, anchor);
      }
    });
  }

  var notePopupEl = null, noteRange = null, noteSpan = null;
  function closeNotePopup(){ if (notePopupEl){ notePopupEl.remove(); notePopupEl = null; } noteRange = null; noteSpan = null; }
  function showNotePopup(range, rect, existing){
    if (!rect || (!rect.width && !rect.height)) return;
    closeNotePopup();
    var el = document.createElement("div");
    el.className = "float-panel note-popup";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", existing ? "Edit note" : "Add note");
    el.innerHTML =
      '<div class="fpn-head"><span class="fpn-title">' + (existing ? "Edit note" : "Add note") + '</span>' +
        '<button type="button" class="btn ghost small" data-act="save">Save</button></div>' +
      '<textarea class="fpn-text" rows="4" placeholder="Write a note…" aria-label="Note">' + esc(existing ? existing.getAttribute("data-note") || "" : "") + '</textarea>' +
      (existing ? '<button type="button" class="btn ghost small fpn-remove" data-act="remove">Remove note</button>' : "");
    document.body.appendChild(el);
    notePopupEl = el; noteRange = range || null; noteSpan = existing || null;
    placeNear(el, rect);
    var ta = el.querySelector("textarea");
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    el.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "save") commitNote();
      else if (b.dataset.act === "remove"){ unwrapAnnotationSpan(noteSpan); closeNotePopup(); commit(); }
    });
    ta.addEventListener("keydown", function(e){
      if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); commitNote(); }
      else if (e.key === "Escape"){ e.stopPropagation(); closeNotePopup(); }
    });
  }
  function commitNote(){
    if (!notePopupEl) return;
    var text = notePopupEl.querySelector("textarea").value.trim();
    if (noteSpan){
      if (text) noteSpan.setAttribute("data-note", text); else unwrapAnnotationSpan(noteSpan);
    } else if (noteRange && text){
      wrapRangeInAnnotation(noteRange, "script-note-comment", { "data-note": text });
    }
    closeNotePopup();
    clearSelection();
    commit();
  }

  var shotPopupEl = null, shotPopupId = null;
  function closeShotPopup(){ if (shotPopupEl){ shotPopupEl.remove(); shotPopupEl = null; } shotPopupId = null; }
  function lensNames(p){
    var seen = {}, out = [];
    p.lensSets.forEach(function(s){ s.lenses.forEach(function(l){ var n = (l.name || "").trim(); if (n && !seen[n]){ seen[n] = 1; out.push(n); } }); });
    return out;
  }
  function showShotPopup(shotId, rect){
    var p = FP.project();
    var hit = findShot(p, shotId);
    if (!hit || !rect || (!rect.width && !rect.height)) return;
    closeShotPopup();
    var el = document.createElement("div");
    el.className = "float-panel shot-popup";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Shot details");
    shotPopupEl = el; shotPopupId = shotId;
    function field(col, label, options){
      var val = hit.shot[col];
      var btns = options.filter(Boolean).map(function(o){
        return '<button type="button" class="opt' + (o === val ? " on" : "") + '" data-col="' + col + '" data-val="' + esc(o) + '" aria-pressed="' + (o === val) + '">' + esc(o) + '</button>';
      }).join("");
      return '<div class="fpn-row"><span class="fpn-label">' + label + '</span><div class="fpn-opts">' +
        (btns || '<span class="fpn-empty">Add lenses on the Camera page to pick one here</span>') + '</div></div>';
    }
    el.innerHTML =
      '<div class="fpn-head"><span class="fpn-title">Sc ' + esc(hit.scene.num) + ', shot ' + esc(shotLabel(hit.scene, hit.index)) + '</span>' +
        (FP.pages.shotlist && FP.pages.shotlist.revealShot ? '<button type="button" class="btn ghost small" data-act="reveal">Show in shotlist</button>' : "") + '</div>' +
      field("size", "Size", FP.visibleOptions(p, "size")) +
      field("shotType", "Shot type", FP.visibleOptions(p, "shotType")) +
      field("lens", "Lens", lensNames(p)) +
      field("grip", "Grip", FP.visibleOptions(p, "grip")) +
      field("movement", "Movement", FP.visibleOptions(p, "movement")) +
      '<div class="fpn-row"><span class="fpn-label">Notes</span><textarea class="fpn-text" rows="3" placeholder="Add a note…" aria-label="Shot notes">' + esc(hit.shot.notes) + '</textarea></div>' +
      '<div class="fpn-foot"><button type="button" class="btn solid small" data-act="done">Done</button></div>';
    document.body.appendChild(el);
    placeNear(el, rect);
    el.addEventListener("click", function(e){
      var o = e.target.closest(".opt");
      if (o){
        var col = o.dataset.col, val = o.classList.contains("on") ? "" : o.dataset.val;
        el.querySelectorAll('.opt[data-col="' + col + '"]').forEach(function(b){
          var on = b === o && !!val;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        setShotField(shotId, col, val);
        return;
      }
      var a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "done") closeShotPopup();
      else if (a.dataset.act === "reveal"){ closeShotPopup(); FP.pages.shotlist.revealShot(shotId); }
    });
    el.querySelector("textarea").addEventListener("input", function(){ setShotField(shotId, "notes", this.value, true); });
    el.addEventListener("keydown", function(e){
      if (e.key === "Escape"){ e.stopPropagation(); closeShotPopup(); }
      else if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA"){ e.preventDefault(); closeShotPopup(); }
    });
  }
  function setShotField(shotId, col, val, typing){
    selfChange = true;
    try {
      FP.change(function(p){
        var hit = findShot(p, shotId);
        if (hit) hit.shot[col] = val;
      }, typing ? "shot:" + shotId + ":" + col : null);
    } finally { selfChange = false; }
  }

  // ---------- edit mode and the remove-linked-text question ----------
  function setEditMode(on){
    editMode = !!on;
    if (!S) return;
    S.stage.classList.toggle("script-editing", editMode);
    S.editBtn.classList.toggle("on", editMode);
    S.editBtn.querySelector(".lbl").textContent = editMode ? "Save changes" : "Edit script";
    S.editBtn.title = editMode ? "Finish editing and re-flow the pages" : "Type directly in the script";
  }
  function askEdit(){
    var body = FP.openModal("Edit the script directly?",
      '<p>Typing changes how the text flows, so page breaks and the page count can move. Shots and highlights stay attached to their text. Deleting text a shot was made from asks what to do with that shot.</p>' +
      '<p>Choose <b>Save changes</b> when you\'re done.</p>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-act="cancel">Cancel</button>' +
      '<button type="button" class="btn solid" data-act="start">Start editing</button></div>');
    body.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]");
      if (!b) return;
      FP.closeModal();
      if (b.dataset.act === "start"){ setEditMode(true); S.area.focus(); }
    });
  }
  function finishEdit(){
    setEditMode(false);
    commit();
    repaginateWhenSettled();
    refreshBadges(FP.project());
    toast("Script saved, " + Math.max(1, pageCount) + (pageCount === 1 ? " page." : " pages."));
  }
  function askRemoveLinked(ids){
    var p = FP.project();
    var labels = ids.map(function(id){
      var hit = findShot(p, id, true);
      return hit ? "shot " + shotLabel(hit.scene, hit.index) + " (sc " + hit.scene.num + ")" : null;
    }).filter(Boolean);
    var decided = false;
    var body = FP.openModal(ids.length > 1 ? "Remove text linked to " + ids.length + " shots?" : "Remove text linked to a shot?",
      '<p>' + (labels.length ? "This affects " + esc(labels.join(", ")) + ". " : "") +
      'You can keep the text, remove it but keep the shot in the shotlist, or remove the shot as well.</p>' +
      '<div class="modal-actions stack"><button type="button" class="btn solid" data-act="keep">Keep the text</button>' +
      '<button type="button" class="btn ghost" data-act="unlink">Remove text, keep the shot</button>' +
      '<button type="button" class="btn ghost danger" data-act="delete">Remove text and the shot</button></div>',
      function(){ if (!decided) restoreFromProject(); });
    body.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]");
      if (!b) return;
      decided = true;
      FP.closeModal();
      if (b.dataset.act === "keep"){ restoreFromProject(); return; }
      ids.forEach(unwrapScriptRef);
      if (b.dataset.act === "unlink"){ commit(); return; }
      commit(null, function(proj){
        proj.scenes.forEach(function(sc){
          sc.shots = sc.shots.filter(function(sh){ return ids.indexOf(sh.scriptRef) === -1; });
        });
      });
    });
  }
  // put the script back to its last saved state (drops an edit that was just made)
  function restoreFromProject(){
    if (!S) return;
    clearTimeout(editTimer); editTimer = null;
    loadFromProject(FP.project());
  }
  function onAreaInput(){
    var removed = [];
    Object.keys(refSnapshot).forEach(function(id){
      var joined = "";
      S.area.querySelectorAll('.script-shot-ref[data-script-ref="' + id + '"]').forEach(function(p){ joined += p.textContent; });
      if (!joined.trim()) removed.push(id);
    });
    queuePaginate();
    if (removed.length){ clearTimeout(editTimer); editTimer = null; askRemoveLinked(removed); return; }
    clearTimeout(editTimer);
    editTimer = setTimeout(function(){ commit("script-edit"); }, 500);
  }

  // ---------- paste and PDF import ----------
  function insertHTMLAtCaret(html){
    var sel = window.getSelection();
    var range;
    if (sel && sel.rangeCount && inArea(sel.anchorNode) && inArea(sel.focusNode)){
      range = sel.getRangeAt(0);
      range.deleteContents();
      // never split a block: paste goes after the block the caret is in
      var block = range.startContainer;
      while (block && block.parentNode !== S.area) block = block.parentNode;
      if (block && block !== S.area){ range = document.createRange(); range.setStartAfter(block); range.collapse(true); }
    } else {
      range = document.createRange();
      range.selectNodeContents(S.area);
      range.collapse(false);
    }
    var holder = document.createElement("div");
    holder.innerHTML = html;
    var frag = document.createDocumentFragment(), last = null;
    while (holder.firstChild){ last = holder.firstChild; frag.appendChild(holder.firstChild); }
    range.insertNode(frag);
    if (last && sel){
      var after = document.createRange();
      after.setStartAfter(last); after.collapse(true);
      sel.removeAllRanges(); sel.addRange(after);
    }
  }
  function onPaste(e){
    if (!S || !inArea(e.target)) return;
    e.preventDefault();
    if (scriptMode === "treatment"){ toast("This script is a treatment. Paste a screenplay after importing it as a script."); return; }
    var raw = (e.clipboardData || window.clipboardData).getData("text/plain").replace(/\r\n?/g, "\n");
    if (!raw.trim()) return;
    var before = new Set(S.area.children);
    var parsed = SP.screenplayHTML(raw);
    insertHTMLAtCaret(parsed.html);
    commit();
    repaginateWhenSettled();
    revealNewBlocks(before);
    if (parsed.stripped) toast("Removed " + parsed.stripped + (parsed.stripped === 1 ? " page number or break marker" : " page numbers and break markers") + " from the paste.", 4000);
  }

  function setImportBusy(busy, label){
    if (!S) return;
    S.importBtn.disabled = busy;
    S.importBtn.querySelector(".lbl").textContent = busy ? (label || "Importing…") : "Import PDF";
  }
  function runPdfImport(file, forceMode){
    lastImportedPdf = file;
    setImportBusy(true);
    toast("Reading " + file.name + "…", 60000);
    function fail(err){
      setImportBusy(false);
      toast("Couldn't import that PDF" + (err && err.message ? ": " + err.message : "."), 6000);
    }
    function asTreatment(why){
      toast("Rendering treatment pages…", 60000);
      SP.importTreatmentPdf(file, function(p, n){ toast("Rendering page " + p + " of " + n + "…", 60000); }).then(function(res){
        if (!S) return;
        setScriptMode("treatment");
        S.area.innerHTML = res.html;
        S.dwItems.innerHTML = "";
        applyScriptPaper({ wIn: Math.min(res.widestIn, 8.5), hIn: 11, padTopIn: 0, padBotIn: 0, linesPerPage: 54 });
        commit();
        paginate();
        setImportBusy(false);
        updateModeBtn();
        toast("Imported " + res.pages + (res.pages === 1 ? " page" : " pages") + " as a treatment" + (why ? " (" + why + ")" : "") +
          ". Select any text to make a shot from it.", 7000);
      }).catch(fail);
    }
    if (forceMode === "treatment"){ asTreatment(null); return; }
    SP.importScriptPdf(file).then(function(result){
      if (!S) return;
      var wantTreatment = forceMode === "screenplay" ? false : (!result.html || !result.looksLikeScreenplay);
      if (wantTreatment){
        asTreatment(result.landscape ? "landscape pages" : !result.html ? "no selectable text" : "no scene headings found");
        return;
      }
      setScriptMode("screenplay");
      S.area.innerHTML = result.html;
      S.dwItems.innerHTML = "";
      applyScriptPaper(result.paper);
      commit();
      repaginateWhenSettled();
      revealNewBlocks(null);
      setImportBusy(false);
      updateModeBtn();
      toast("Imported " + result.pages + (result.pages === 1 ? " page" : " pages") + ", found " + result.scenes +
        (result.scenes === 1 ? " scene heading" : " scene headings") + ". Use Generate scenes & locations to build the shotlist.", 7000);
    }).catch(fail);
  }
  function updateModeBtn(){
    if (!S) return;
    S.modeBtn.hidden = !lastImportedPdf;
    S.modeBtn.querySelector(".lbl").textContent = scriptMode === "treatment" ? "Read as script" : "Read as treatment";
  }
  function onImportFile(file){
    if (!S.area.textContent.trim() && !S.area.querySelector(".tm-page")){ runPdfImport(file); return; }
    var body = FP.openModal("Replace the current script?",
      '<p>Importing this PDF replaces everything on the Script page, including drawings. You can undo it afterwards.</p>' +
      '<div class="modal-actions"><button type="button" class="btn ghost" data-act="cancel">Cancel</button>' +
      '<button type="button" class="btn ghost" data-act="compare">Compare first</button>' +
      '<button type="button" class="btn solid" data-act="replace">Replace script</button></div>');
    body.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]");
      if (!b) return;
      FP.closeModal();
      if (b.dataset.act === "replace") runPdfImport(file);
      else if (b.dataset.act === "compare") openCompare(file);
    });
  }

  // ---------- compare ----------
  function openCompare(pdfFile){
    var body = FP.openModal("Compare with an updated version",
      '<div data-cmp="intro">' +
        '<p>Paste a revised draft, or import its PDF, to see what changed before anything on the Script page is touched.</p>' +
        '<textarea class="compare-textarea" id="compareInput" placeholder="Paste the new version here…" aria-label="New script version"></textarea>' +
        '<div class="modal-actions"><button type="button" class="btn ghost" data-act="pdf">Import a PDF instead</button>' +
          '<input type="file" accept="application/pdf,.pdf" hidden data-cmp="file">' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn solid" data-act="run">Compare</button></div>' +
      '</div>' +
      '<div data-cmp="results" hidden>' +
        '<div class="compare-summary" data-cmp="summary"></div>' +
        '<div class="compare-diff" data-cmp="diff"></div>' +
        '<div class="modal-actions"><button type="button" class="btn ghost" data-act="back">Back</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn ghost" data-act="keep">Keep current script</button>' +
          '<button type="button" class="btn solid" data-act="apply">Apply changes</button></div>' +
      '</div>');
    var q = function(k){ return body.querySelector('[data-cmp="' + k + '"]'); };
    var state = { ops: null, live: null, fresh: null, html: null };
    function run(newHTML){
      state.html = newHTML;
      var live = Array.prototype.slice.call(S.area.children);
      var tmp = document.createElement("div");
      tmp.innerHTML = newHTML;
      var fresh = Array.prototype.slice.call(tmp.children);
      q("intro").hidden = true; q("results").hidden = false;
      var ops = SP.lcsDiffBlocks(live.map(function(el){ return (el.textContent || "").trim(); }),
        fresh.map(function(el){ return (el.textContent || "").trim(); }));
      q("diff").innerHTML = "";
      if (!ops){
        state.ops = null;
        q("summary").innerHTML = "This script is too long to compare line by line here. You can still replace it outright and undo that afterwards.";
        return;
      }
      state.ops = ops; state.live = live; state.fresh = fresh;
      var added = 0, removed = 0, affected = [], p = FP.project();
      var frag = document.createDocumentFragment();
      ops.forEach(function(op){
        if (op.type === "added") added++;
        if (op.type === "removed"){
          removed++;
          live[op.oldIndex].querySelectorAll(".script-shot-ref").forEach(function(r){
            var hit = findShot(p, r.getAttribute("data-script-ref"), true);
            if (hit){
              var lbl = "Scene " + hit.scene.num + ", shot " + shotLabel(hit.scene, hit.index);
              if (affected.indexOf(lbl) === -1) affected.push(lbl);
            }
          });
        }
        var line = document.createElement("div");
        line.className = "cdiff-line cdiff-" + op.type;
        line.textContent = (op.type === "removed" ? "− " : op.type === "added" ? "+ " : "  ") + (op.text || "(blank line)");
        frag.appendChild(line);
      });
      q("diff").appendChild(frag);
      var html = "<b>" + added + "</b>" + (added === 1 ? " line" : " lines") + " added, <b>" + removed + "</b>" +
        (removed === 1 ? " line" : " lines") + " removed.";
      if (affected.length){
        html += "<div>Applying removes the script text behind <b>" + affected.length + "</b>" + (affected.length === 1 ? " shot" : " shots") +
          ". The shots stay in the shotlist, unlinked:</div><ul>" +
          affected.slice(0, 12).map(function(s){ return "<li>" + esc(s) + "</li>"; }).join("") +
          (affected.length > 12 ? "<li>and " + (affected.length - 12) + " more</li>" : "") + "</ul>";
      } else if (removed){
        html += "<div>None of the removed lines have shots made from them.</div>";
      }
      q("summary").innerHTML = html;
    }
    function runPdf(file){
      toast("Reading " + file.name + "…", 60000);
      SP.importScriptPdf(file).then(function(res){
        if (!res.html){ toast("Couldn't find any text in that PDF. It may be scanned.", 5000); return; }
        toast("Compared with " + file.name + ".");
        run(res.html);
      }).catch(function(err){ toast("Couldn't read that PDF" + (err && err.message ? ": " + err.message : "."), 5000); });
    }
    body.addEventListener("click", function(e){
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var a = b.dataset.act;
      if (a === "pdf") q("file").click();
      else if (a === "run"){
        var raw = body.querySelector("#compareInput").value.replace(/\r\n?/g, "\n");
        if (!raw.trim()){ body.querySelector("#compareInput").focus(); return; }
        run(SP.screenplayHTML(raw).html);
      } else if (a === "back"){ q("results").hidden = true; q("intro").hidden = false; }
      else if (a === "keep") FP.closeModal();
      else if (a === "apply"){
        // merge, not replace: untouched lines keep their own nodes, with every shot,
        // highlight and note on them
        var before = new Set();
        if (state.ops){
          var frag = document.createDocumentFragment();
          state.ops.forEach(function(op){
            if (op.type === "same"){ before.add(state.live[op.oldIndex]); frag.appendChild(state.live[op.oldIndex]); }
            else if (op.type === "added") frag.appendChild(state.fresh[op.newIndex].cloneNode(true));
          });
          S.area.innerHTML = "";
          S.area.appendChild(frag);
        } else {
          S.area.innerHTML = state.html;
        }
        setScriptMode("screenplay");
        commit();
        FP.closeModal();
        repaginateWhenSettled();
        refreshBadges(FP.project());
        revealNewBlocks(state.ops ? before : null);
        toast(state.ops ? "Applied the changes. Untouched shots, highlights and notes stayed in place." : "Script replaced.", 5000);
      }
    });
    q("file").addEventListener("change", function(){
      var f = this.files && this.files[0];
      this.value = "";
      if (f) runPdf(f);
    });
    if (pdfFile) runPdf(pdfFile);
    else body.querySelector("#compareInput").focus();
  }

  // ---------- drawing over the page ----------
  var DRAW_COLORS = ["#FF4311", "#F2B705", "#2F7BFF", "#1FA35B", "#E0559A", "#7A5CF6", "#111111"];
  var DRAW_TOOLS = [
    { key: "select", sk: "V", label: "Select", tip: "Select (V): move, resize, recolour, delete" },
    { key: "pencil", sk: "P", label: "Pencil", tip: "Pencil (P)" },
    { key: "marker", sk: "M", label: "Marker", tip: "Marker (M): broad and translucent" },
    { key: "line", sk: "L", label: "Line", tip: "Line (L): Shift snaps the angle" },
    { key: "arrow", sk: "A", label: "Arrow", tip: "Arrow (A): Shift snaps the angle" },
    { key: "rect", sk: "R", label: "Rectangle", tip: "Rectangle (R): Shift for a square" },
    { key: "ellipse", sk: "O", label: "Ellipse", tip: "Ellipse (O): Shift for a circle" },
    { key: "eraser", sk: "E", label: "Eraser", tip: "Eraser (E): click or sweep over marks" }
  ];
  var DRAW_HINTS = {
    select: "Drag a mark to move it, a corner to resize. Pick a colour or width to restyle it. Backspace deletes.",
    pencil: "Drag to draw freehand.", marker: "Drag to sweep a translucent highlight.",
    line: "Drag for a straight line. Hold Shift to snap the angle.", arrow: "Drag from tail to head. Hold Shift to snap the angle.",
    rect: "Drag out a box. Hold Shift for a square.", ellipse: "Drag out an ellipse. Hold Shift for a circle.",
    eraser: "Click or sweep across a mark to remove it."
  };
  var drawOn = false, drawTool = "pencil", drawColor = DRAW_COLORS[0], drawWidth = 3;
  var drawSel = [], dwDrag = null, dwDirty = false;
  var drawTextTop = lsGet("filmprep:drawTextOnTop") === "1";

  function dwRound(n){ return Math.round(n * 10) / 10; }
  function dwStrokeW(type, w){ return type === "marker" ? w * 3 : w; }
  function buildDrawBar(){
    S.drawBar.innerHTML =
      '<div class="stb-group tight">' + DRAW_TOOLS.map(function(t){
        return '<button type="button" class="sdt-tool" data-dtool="' + t.key + '" data-key="' + t.sk + '" title="' + esc(t.tip) + '" aria-label="' + esc(t.label) + '">' + DRAW_ICONS[t.key] + '</button>';
      }).join("") + '</div>' +
      '<div class="stb-divider"></div>' +
      '<div class="stb-group tight">' + DRAW_COLORS.map(function(c){
        return '<button type="button" class="sdt-swatch" data-dcolor="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '"></button>';
      }).join("") +
        '<label class="sdt-custom" title="Any other colour"><input type="color" data-s2="colorInput" value="' + DRAW_COLORS[0] + '" aria-label="Any other colour"></label>' +
      '</div>' +
      '<div class="stb-divider"></div>' +
      '<label class="sdt-width" title="Stroke width">Width <input type="range" min="1" max="24" step="1" value="3" data-s2="width" aria-label="Stroke width"><span class="sdt-wdot" data-s2="wdot"></span></label>' +
      '<div class="stb-divider"></div>' +
      '<label class="script-toggle" title="Keep the script legible by drawing underneath it"><input type="checkbox" data-s2="textTop"> Text on top</label>' +
      '<span class="draw-hint" data-s2="hint"></span>' +
      '<button type="button" class="tbtn" data-s2="clear" title="Remove every mark on the script">Clear all</button>';
  }
  function d2(k){ return S.drawBar.querySelector('[data-s2="' + k + '"]'); }
  function updateWidthDot(){
    var dot = d2("wdot");
    if (!dot) return;
    var d = Math.max(4, Math.min(20, dwStrokeW(drawTool === "marker" ? "marker" : "pencil", drawWidth)));
    dot.style.width = d + "px"; dot.style.height = d + "px"; dot.style.background = drawColor;
    dot.setAttribute("data-c", drawColor);
  }
  function setDrawTool(tool){
    drawTool = tool;
    S.drawBar.querySelectorAll(".sdt-tool").forEach(function(b){
      b.classList.toggle("active", b.dataset.dtool === tool);
      b.setAttribute("aria-pressed", b.dataset.dtool === tool ? "true" : "false");
    });
    S.stage.setAttribute("data-dtool", tool);
    if (tool !== "select") clearDrawSelection();
    updateWidthDot();
    d2("hint").textContent = DRAW_HINTS[tool] || "";
  }
  function setDrawColor(c, fromSelection){
    drawColor = c;
    var preset = false;
    S.drawBar.querySelectorAll(".sdt-swatch").forEach(function(b){
      var on = b.dataset.dcolor.toLowerCase() === c.toLowerCase();
      if (on) preset = true;
      b.classList.toggle("active", on);
    });
    S.drawBar.querySelector(".sdt-custom").classList.toggle("active", !preset);
    var ci = d2("colorInput");
    if (ci.value.toLowerCase() !== c.toLowerCase()) ci.value = c;
    updateWidthDot();
    // with marks selected, a colour restyles them
    if (!fromSelection && drawSel.length){
      drawSel.forEach(function(el){ el.setAttribute("stroke", c); });
      commit();
    }
  }
  function setDrawWidth(w, fromSelection){
    drawWidth = w;
    var sl = d2("width");
    if (+sl.value !== w) sl.value = w;
    updateWidthDot();
    if (!fromSelection && drawSel.length){
      drawSel.forEach(function(el){
        el.setAttribute("data-w", w);
        el.setAttribute("stroke-width", dwStrokeW(el.getAttribute("data-dt"), w));
        if (el.getAttribute("data-dt") === "arrow"){
          var p = dwGetPts(el);
          if (p.length === 2) el.setAttribute("d", dwArrowPath(p[0][0], p[0][1], p[1][0], p[1][1], w));
        }
      });
      commit();
    }
  }
  function setDrawTextTop(on){
    drawTextTop = !!on;
    lsSet("filmprep:drawTextOnTop", drawTextTop ? "1" : "0");
    if (!S) return;
    S.stage.classList.toggle("text-on-top", drawTextTop);
    d2("textTop").checked = drawTextTop;
  }
  function dwPathFromPts(pts){
    if (!pts.length) return "";
    if (pts.length === 1) return "M " + pts[0][0] + " " + pts[0][1] + " l 0.01 0";
    var d = "M " + pts[0][0] + " " + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++){
      d += " Q " + pts[i][0] + " " + pts[i][1] + " " + dwRound((pts[i][0] + pts[i + 1][0]) / 2) + " " + dwRound((pts[i][1] + pts[i + 1][1]) / 2);
    }
    var last = pts[pts.length - 1];
    return d + " L " + last[0] + " " + last[1];
  }
  function dwArrowPath(x1, y1, x2, y2, w){
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var d = "M " + dwRound(x1) + " " + dwRound(y1) + " L " + dwRound(x2) + " " + dwRound(y2);
    if (len < 2) return d;
    var head = Math.max(7, Math.min(len * 0.38, 6 + (w || 3) * 3)), ang = Math.atan2(dy, dx), spread = 0.46;
    return d + " M " + dwRound(x2 - head * Math.cos(ang - spread)) + " " + dwRound(y2 - head * Math.sin(ang - spread)) +
      " L " + dwRound(x2) + " " + dwRound(y2) +
      " L " + dwRound(x2 - head * Math.cos(ang + spread)) + " " + dwRound(y2 - head * Math.sin(ang + spread));
  }
  // every shape is a short list of points, so move and resize are one operation
  function dwGetPts(el){
    var t = el.getAttribute("data-dt"), n = function(a){ return +el.getAttribute(a) || 0; };
    if (t === "pencil" || t === "marker" || t === "arrow"){
      return (el.getAttribute("data-pts") || "").trim().split(/\s+/).filter(Boolean).map(function(p){ var a = p.split(","); return [+a[0], +a[1]]; });
    }
    if (t === "line") return [[n("x1"), n("y1")], [n("x2"), n("y2")]];
    if (t === "rect") return [[n("x"), n("y")], [n("x") + n("width"), n("y") + n("height")]];
    if (t === "ellipse") return [[n("cx") - n("rx"), n("cy") - n("ry")], [n("cx") + n("rx"), n("cy") + n("ry")]];
    return [];
  }
  function dwSetPts(el, pts){
    var t = el.getAttribute("data-dt");
    var fmt = function(ps){ return ps.map(function(p){ return dwRound(p[0]) + "," + dwRound(p[1]); }).join(" "); };
    if (t === "pencil" || t === "marker"){
      el.setAttribute("data-pts", fmt(pts));
      el.setAttribute("d", dwPathFromPts(pts.map(function(p){ return [dwRound(p[0]), dwRound(p[1])]; })));
    } else if (t === "arrow"){
      el.setAttribute("data-pts", fmt(pts));
      el.setAttribute("d", dwArrowPath(pts[0][0], pts[0][1], pts[1][0], pts[1][1], +el.getAttribute("data-w") || 3));
    } else if (t === "line"){
      el.setAttribute("x1", dwRound(pts[0][0])); el.setAttribute("y1", dwRound(pts[0][1]));
      el.setAttribute("x2", dwRound(pts[1][0])); el.setAttribute("y2", dwRound(pts[1][1]));
    } else if (t === "rect"){
      el.setAttribute("x", dwRound(Math.min(pts[0][0], pts[1][0]))); el.setAttribute("y", dwRound(Math.min(pts[0][1], pts[1][1])));
      el.setAttribute("width", dwRound(Math.abs(pts[1][0] - pts[0][0]))); el.setAttribute("height", dwRound(Math.abs(pts[1][1] - pts[0][1])));
    } else if (t === "ellipse"){
      el.setAttribute("cx", dwRound((pts[0][0] + pts[1][0]) / 2)); el.setAttribute("cy", dwRound((pts[0][1] + pts[1][1]) / 2));
      el.setAttribute("rx", dwRound(Math.abs(pts[1][0] - pts[0][0]) / 2)); el.setAttribute("ry", dwRound(Math.abs(pts[1][1] - pts[0][1]) / 2));
    }
  }
  function dwPoint(e){ var r = S.drawLayer.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function dwItems(){ return Array.prototype.slice.call(S.dwItems.querySelectorAll(".dw-item")); }
  function dwSegDist2(px, py, a, b){
    var vx = b[0] - a[0], vy = b[1] - a[1], len2 = vx * vx + vy * vy;
    var t = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / len2)) : 0;
    var dx = px - (a[0] + vx * t), dy = py - (a[1] + vy * t);
    return dx * dx + dy * dy;
  }
  function dwDist2(el, x, y){
    var pts = dwGetPts(el), t = el.getAttribute("data-dt");
    if (!pts.length) return Infinity;
    if (t === "rect" || t === "ellipse"){
      var x0 = Math.min(pts[0][0], pts[1][0]), x1 = Math.max(pts[0][0], pts[1][0]);
      var y0 = Math.min(pts[0][1], pts[1][1]), y1 = Math.max(pts[0][1], pts[1][1]);
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return 0;
      var dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
      return dx * dx + dy * dy;
    }
    if (pts.length === 1) return (x - pts[0][0]) * (x - pts[0][0]) + (y - pts[0][1]) * (y - pts[0][1]);
    var best = Infinity;
    for (var i = 0; i < pts.length - 1; i++) best = Math.min(best, dwSegDist2(x, y, pts[i], pts[i + 1]));
    return best;
  }
  // forgiving: anything within a few px of a mark counts, nearest wins
  function dwHitTest(x, y){
    var items = dwItems(), best = null, bestD = Infinity;
    for (var i = items.length - 1; i >= 0; i--){
      var tol = Math.max(9, (+items[i].getAttribute("stroke-width") || 3) / 2 + 6);
      var d = dwDist2(items[i], x, y);
      if (d <= tol * tol && d < bestD){ bestD = d; best = items[i]; }
    }
    return best;
  }
  function dwCreate(type, x, y){
    var el;
    if (type === "pencil" || type === "marker" || type === "arrow"){
      el = document.createElementNS(SVGNS, "path");
      el.setAttribute("fill", "none");
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("data-pts", dwRound(x) + "," + dwRound(y) + (type === "arrow" ? " " + dwRound(x) + "," + dwRound(y) : ""));
      el.setAttribute("d", "M " + dwRound(x) + " " + dwRound(y));
      if (type === "marker") el.setAttribute("stroke-opacity", "0.55");
    } else if (type === "line"){
      el = document.createElementNS(SVGNS, "line");
      ["x1", "x2"].forEach(function(a){ el.setAttribute(a, dwRound(x)); });
      ["y1", "y2"].forEach(function(a){ el.setAttribute(a, dwRound(y)); });
      el.setAttribute("stroke-linecap", "round");
    } else if (type === "rect"){
      el = document.createElementNS(SVGNS, "rect");
      el.setAttribute("x", dwRound(x)); el.setAttribute("y", dwRound(y));
      el.setAttribute("width", 0); el.setAttribute("height", 0);
      el.setAttribute("fill", "none");
    } else {
      el = document.createElementNS(SVGNS, "ellipse");
      el.setAttribute("cx", dwRound(x)); el.setAttribute("cy", dwRound(y));
      el.setAttribute("rx", 0); el.setAttribute("ry", 0);
      el.setAttribute("fill", "none");
    }
    el.setAttribute("class", "dw-item");
    el.setAttribute("data-dt", type);
    el.setAttribute("data-w", drawWidth);
    el.setAttribute("stroke", drawColor);
    el.setAttribute("stroke-width", dwStrokeW(type, drawWidth));
    return el;
  }
  function dwExtend(el, x0, y0, x, y, shift){
    var t = el.getAttribute("data-dt");
    if (t === "pencil" || t === "marker"){
      el.setAttribute("data-pts", el.getAttribute("data-pts") + " " + dwRound(x) + "," + dwRound(y));
      el.setAttribute("d", dwPathFromPts(dwGetPts(el)));
      return;
    }
    if (shift && (t === "line" || t === "arrow")){
      var dx = x - x0, dy = y - y0, step = Math.PI / 12;
      var ang = Math.round(Math.atan2(dy, dx) / step) * step, len = Math.sqrt(dx * dx + dy * dy);
      x = x0 + Math.cos(ang) * len; y = y0 + Math.sin(ang) * len;
    }
    if (shift && (t === "rect" || t === "ellipse")){
      var m = Math.max(Math.abs(x - x0), Math.abs(y - y0));
      x = x0 + (x < x0 ? -m : m); y = y0 + (y < y0 ? -m : m);
    }
    dwSetPts(el, [[x0, y0], [x, y]]);
  }
  function clearDrawSelection(){ drawSel = []; if (S) S.dwSel.innerHTML = ""; }
  function dwSelBBox(){
    if (!drawSel.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    drawSel.forEach(function(el){
      var b;
      try { b = el.getBBox(); } catch (err){ return; }
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    });
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }
  function renderDrawSelUI(){
    S.dwSel.innerHTML = "";
    var bb = dwSelBBox();
    if (!bb) return;
    var pad = 7, x = bb[0] - pad, y = bb[1] - pad, w = (bb[2] - bb[0]) + pad * 2, h = (bb[3] - bb[1]) + pad * 2;
    var box = document.createElementNS(SVGNS, "rect");
    box.setAttribute("class", "dw-selbox");
    box.setAttribute("x", x); box.setAttribute("y", y);
    box.setAttribute("width", Math.max(w, 1)); box.setAttribute("height", Math.max(h, 1));
    S.dwSel.appendChild(box);
    [[x, y, "nw"], [x + w, y, "ne"], [x, y + h, "sw"], [x + w, y + h, "se"]].forEach(function(hd){
      var r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("class", "dw-handle");
      r.setAttribute("x", hd[0] - 4.5); r.setAttribute("y", hd[1] - 4.5);
      r.setAttribute("width", 9); r.setAttribute("height", 9);
      r.setAttribute("data-h", hd[2]);
      S.dwSel.appendChild(r);
    });
  }
  function deleteDrawSelection(){
    if (!drawSel.length) return;
    drawSel.forEach(function(el){ spawnPoof(el); el.remove(); });
    clearDrawSelection();
    commit();
  }
  function clearAllDrawings(){
    var items = dwItems();
    if (!items.length) return;
    items.forEach(function(el){ spawnPoof(el); el.remove(); });
    clearDrawSelection();
    commit();
    toast("Drawings cleared. Undo brings them back.");
  }
  function dwEraseAt(x, y){
    var hit = dwHitTest(x, y);
    if (!hit) return;
    spawnPoof(hit);
    hit.remove();
    dwDirty = true;
  }
  function setDrawMode(on){
    drawOn = !!on;
    if (!S) return;
    S.stage.classList.toggle("drawing", drawOn);
    S.drawBar.hidden = !drawOn;
    S.drawBtn.classList.toggle("on", drawOn);
    S.drawBtn.setAttribute("aria-pressed", drawOn ? "true" : "false");
    S.annotTools.classList.toggle("inert", drawOn);
    S.area.setAttribute("contenteditable", drawOn ? "false" : "true");
    if (drawOn){
      setArmedTool(null);
      closeSizeBar();
      setDrawTool(drawTool); setDrawColor(drawColor, true); setDrawWidth(drawWidth, true);
    } else {
      clearDrawSelection();
      dwDrag = null;
    }
  }
  function bindDrawing(){
    var layer = S.drawLayer;
    layer.addEventListener("pointerdown", function(e){
      if (!drawOn || (e.button != null && e.button !== 0)) return;
      e.preventDefault();
      var p = dwPoint(e);
      try { layer.setPointerCapture(e.pointerId); } catch (err){}
      if (drawTool === "eraser"){ dwDrag = { mode: "erase" }; dwDirty = false; dwEraseAt(p[0], p[1]); return; }
      if (drawTool === "select"){
        var handle = e.target && e.target.classList && e.target.classList.contains("dw-handle") ? e.target : null;
        if (handle && drawSel.length){ dwDrag = { mode: "resize", h: handle.getAttribute("data-h"), bb: dwSelBBox(), orig: drawSel.map(dwGetPts) }; return; }
        var hit = dwHitTest(p[0], p[1]);
        if (hit){
          if (e.shiftKey){ var at = drawSel.indexOf(hit); if (at === -1) drawSel.push(hit); else drawSel.splice(at, 1); }
          else if (drawSel.indexOf(hit) === -1) drawSel = [hit];
          renderDrawSelUI();
          dwDrag = drawSel.length ? { mode: "move", start: p, orig: drawSel.map(dwGetPts) } : null;
        } else {
          if (!e.shiftKey) clearDrawSelection();
          var mq = document.createElementNS(SVGNS, "rect");
          mq.setAttribute("class", "dw-marquee");
          S.dwSel.appendChild(mq);
          dwDrag = { mode: "marquee", start: p, el: mq, add: e.shiftKey ? drawSel.slice() : [] };
        }
        return;
      }
      var el = dwCreate(drawTool, p[0], p[1]);
      S.dwItems.appendChild(el);
      dwDrag = { mode: "draw", el: el, start: p, last: p, moved: false };
    });
    layer.addEventListener("pointermove", function(e){
      if (!drawOn || !dwDrag) return;
      e.preventDefault();
      var p = dwPoint(e);
      if (dwDrag.mode === "draw"){
        var t = dwDrag.el.getAttribute("data-dt");
        if (t === "pencil" || t === "marker"){
          var dx = p[0] - dwDrag.last[0], dy = p[1] - dwDrag.last[1];
          if (dx * dx + dy * dy < 2.25) return;
          dwDrag.last = p;
        }
        dwDrag.moved = true;
        dwExtend(dwDrag.el, dwDrag.start[0], dwDrag.start[1], p[0], p[1], e.shiftKey);
      } else if (dwDrag.mode === "erase"){
        dwEraseAt(p[0], p[1]);
      } else if (dwDrag.mode === "move"){
        var mx = p[0] - dwDrag.start[0], my = p[1] - dwDrag.start[1];
        drawSel.forEach(function(el, i){ dwSetPts(el, dwDrag.orig[i].map(function(q){ return [q[0] + mx, q[1] + my]; })); });
        renderDrawSelUI();
      } else if (dwDrag.mode === "resize"){
        var bb = dwDrag.bb;
        if (!bb) return;
        var west = dwDrag.h === "nw" || dwDrag.h === "sw", north = dwDrag.h === "nw" || dwDrag.h === "ne";
        var ax = west ? bb[2] : bb[0], ay = north ? bb[3] : bb[1];
        var cx = west ? bb[0] : bb[2], cy = north ? bb[1] : bb[3];
        var sx = Math.abs(cx - ax) < 2 ? 1 : (p[0] - ax) / (cx - ax);
        var sy = Math.abs(cy - ay) < 2 ? 1 : (p[1] - ay) / (cy - ay);
        if (e.shiftKey){ var m = Math.max(Math.abs(sx), Math.abs(sy)); sx = sx < 0 ? -m : m; sy = sy < 0 ? -m : m; }
        var floor = function(v){ return Math.abs(v) < 0.04 ? (v < 0 ? -0.04 : 0.04) : v; };
        sx = floor(sx); sy = floor(sy);
        drawSel.forEach(function(el, i){ dwSetPts(el, dwDrag.orig[i].map(function(q){ return [ax + (q[0] - ax) * sx, ay + (q[1] - ay) * sy]; })); });
        renderDrawSelUI();
      } else if (dwDrag.mode === "marquee"){
        dwDrag.el.setAttribute("x", Math.min(dwDrag.start[0], p[0])); dwDrag.el.setAttribute("y", Math.min(dwDrag.start[1], p[1]));
        dwDrag.el.setAttribute("width", Math.abs(p[0] - dwDrag.start[0])); dwDrag.el.setAttribute("height", Math.abs(p[1] - dwDrag.start[1]));
      }
    });
    function finish(){
      if (!dwDrag) return;
      var d = dwDrag;
      dwDrag = null;
      if (d.mode === "draw"){
        var t = d.el.getAttribute("data-dt");
        if (!d.moved && t !== "pencil" && t !== "marker"){ d.el.remove(); return; }
        commit();
      } else if (d.mode === "erase"){
        if (dwDirty){ dwDirty = false; commit(); }
      } else if (d.mode === "move" || d.mode === "resize"){
        renderDrawSelUI();
        commit();
      } else if (d.mode === "marquee"){
        var x = +d.el.getAttribute("x"), y = +d.el.getAttribute("y"), w = +d.el.getAttribute("width"), h = +d.el.getAttribute("height");
        d.el.remove();
        drawSel = d.add.slice();
        if (w > 3 || h > 3){
          dwItems().forEach(function(el){
            var b;
            try { b = el.getBBox(); } catch (err){ return; }
            if (b.x + b.width >= x && b.x <= x + w && b.y + b.height >= y && b.y <= y + h && drawSel.indexOf(el) === -1) drawSel.push(el);
          });
        }
        renderDrawSelUI();
      }
    }
    layer.addEventListener("pointerup", finish);
    layer.addEventListener("pointercancel", finish);
    S.drawBar.addEventListener("click", function(e){
      var tb = e.target.closest(".sdt-tool");
      if (tb){ setDrawTool(tb.dataset.dtool); return; }
      var sw = e.target.closest(".sdt-swatch");
      if (sw){ setDrawColor(sw.dataset.dcolor); return; }
      if (e.target.closest('[data-s2="clear"]')) clearAllDrawings();
    });
    S.drawBar.addEventListener("input", function(e){
      var k = e.target.getAttribute("data-s2");
      if (k === "colorInput") setDrawColor(e.target.value);
      else if (k === "width") setDrawWidth(parseInt(e.target.value, 10) || 3);
    });
    S.drawBar.addEventListener("change", function(e){
      if (e.target.getAttribute("data-s2") === "textTop") setDrawTextTop(e.target.checked);
    });
  }

  // ---------- loading the page ----------
  function updateJumpBtn(){
    if (!S) return;
    S.lastShotBtn.disabled = !(lastCreatedRefId && S.area.querySelector('.script-shot-ref[data-script-ref="' + lastCreatedRefId + '"]'));
  }
  function applyToggles(){
    S.area.classList.toggle("hide-highlights", !toggles.shots);
    S.area.classList.toggle("hide-annot-hl", !toggles.hl);
    S.area.classList.toggle("hide-annot-notes", !toggles.notes);
  }
  function loadFromProject(p){
    closeShotPopup(); closeNotePopup(); closeSizeBar();
    setScriptMode(p.script.mode);
    S.area.innerHTML = p.script.html || "";
    S.dwItems.innerHTML = p.script.drawHTML || "";
    clearDrawSelection();
    applyScriptPaper(p.script.paper);
    refreshBadges(p);
    resyncRefSnapshot();
    renderRail(p);
    updateJumpBtn();
    updateModeBtn();
    repaginateWhenSettled();
  }
  function revealRef(refId){
    var span = S && S.area.querySelector('.script-shot-ref[data-script-ref="' + refId + '"]');
    if (!span) return false;
    span.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    span.classList.add("ref-flash");
    setTimeout(function(){ span.classList.remove("ref-flash"); }, 1600);
    return true;
  }

  function template(){
    var annot =
      '<button type="button" class="sat-tool" data-annot="underline" data-key="U" title="Underline (U): click, then select text" aria-label="Underline">' + IC.underline + '</button>' +
      '<button type="button" class="sat-tool" data-annot="strike" data-key="K" title="Strikethrough (K)" aria-label="Strikethrough">' + IC.strike + '</button>' +
      ANNOT_COLORS.map(function(c, i){
        return '<button type="button" class="sat-tool sw" data-annot="highlight" data-color="' + c.key + '" title="' + esc(c.label) + ' highlight (' + (i + 1) + ')" aria-label="' + esc(c.label) + ' highlight"></button>';
      }).join("") +
      '<button type="button" class="sat-tool" data-annot="erase" data-key="E" title="Erase markup (E)" aria-label="Erase markup">' + IC.erase + '</button>' +
      '<button type="button" class="sat-tool" data-annot="note" data-key="N" title="Note (N)" aria-label="Note">' + IC.note + '</button>';
    return '<div class="shell-body script-shell" data-s="root">' +
      '<aside class="toolrail script-rail" aria-label="Scenes">' +
        '<div class="tr-h" data-s="railCount">Scenes</div>' +
        '<div class="rail-list" data-s="railList"></div>' +
        '<p class="rail-empty" data-s="railEmpty">No scenes yet. Once your script is in, use <b>Generate scenes &amp; locations</b>, or select a line and make a shot from it.</p>' +
      '</aside>' +
      '<div class="workwindow script-main">' +
        '<div class="script-toolbars">' +
          '<div class="script-toolbar">' +
            '<div class="stb-group">' +
              '<label class="script-toggle"><input type="checkbox" data-s="tShots"' + (toggles.shots ? " checked" : "") + '>Shots</label>' +
              '<label class="script-toggle"><input type="checkbox" data-s="tHl"' + (toggles.hl ? " checked" : "") + '>Highlights</label>' +
              '<label class="script-toggle"><input type="checkbox" data-s="tNotes"' + (toggles.notes ? " checked" : "") + '>Notes</label>' +
            '</div>' +
            '<div class="stb-divider"></div>' +
            '<div class="annot-tools" data-s="annotTools" role="group" aria-label="Mark-up tools">' + annot + '</div>' +
            '<div class="stb-spacer"></div>' +
            '<span class="pageno" data-s="pageNo" aria-live="off"></span>' +
            '<button type="button" class="tbtn icon" data-s="helpBtn" title="How this page works" aria-label="How this page works">?</button>' +
          '</div>' +
          '<div class="script-toolbar">' +
            '<button type="button" class="tbtn" data-s="drawBtn" aria-pressed="false" title="Draw on the page (D)">' + IC.draw + 'Draw</button>' +
            '<button type="button" class="tbtn" data-s="lastShotBtn" disabled title="Scroll to the shot you made last">' + IC.last + 'Last shot</button>' +
            '<button type="button" class="tbtn" data-s="editBtn" title="Type directly in the script"><span class="serif-t" aria-hidden="true">T</span><span class="lbl">Edit script</span></button>' +
            '<div class="stb-spacer"></div>' +
            '<button type="button" class="tbtn" data-s="importBtn">' + IC.pdf + '<span class="lbl">Import PDF</span></button>' +
            '<input type="file" accept="application/pdf,.pdf" hidden data-s="importFile">' +
            '<button type="button" class="tbtn" data-s="modeBtn" hidden title="Read the last imported PDF the other way"><span class="lbl">Read as treatment</span></button>' +
            '<button type="button" class="tbtn" data-s="compareBtn" title="Compare with an updated version">' + IC.compare + 'Compare</button>' +
            '<button type="button" class="tbtn" data-s="generateBtn" title="Make a scene for every heading, and a location for every place">' + IC.generate + 'Generate scenes &amp; locations</button>' +
          '</div>' +
          '<div class="script-toolbar script-draw-toolbar" data-s="drawBar" hidden></div>' +
        '</div>' +
        '<div class="page-area" data-s="pageArea">' +
          '<div class="script-stage" data-s="stage">' +
            '<div class="script-pages" data-s="pages" aria-hidden="true"></div>' +
            '<div class="script-pagenums" data-s="nums" aria-hidden="true"></div>' +
            '<div class="script-body" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="Script" data-placeholder="Paste your script here, or use Import PDF." data-s="area"></div>' +
            '<svg class="script-draw-layer" data-s="drawLayer" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
              '<rect class="dw-catch" x="0" y="0" width="100%" height="100%" fill="transparent"></rect>' +
              '<g data-s="dwItems"></g><g data-s="dwSel"></g>' +
            '</svg>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function mount(host, p){
    host.innerHTML = template();
    S = {};
    host.querySelectorAll("[data-s]").forEach(function(el){ S[el.getAttribute("data-s")] = el; });
    S.host = host;
    buildDrawBar();
    applyToggles();
    setArmedTool(armedTool);
    setDrawTextTop(drawTextTop);
    setEditMode(editMode);
    bindDrawing();
    setDrawMode(drawOn);

    S.tShots.addEventListener("change", function(){ toggles.shots = this.checked; applyToggles(); });
    S.tHl.addEventListener("change", function(){ toggles.hl = this.checked; applyToggles(); });
    S.tNotes.addEventListener("change", function(){ toggles.notes = this.checked; applyToggles(); });
    S.annotTools.addEventListener("click", function(e){
      var b = e.target.closest(".sat-tool");
      if (!b) return;
      closeSizeBar();
      var kind = b.dataset.annot, color = b.dataset.color;
      var same = armedTool && armedTool.kind === kind && (kind !== "highlight" || armedTool.color === color);
      setArmedTool(same ? null : { kind: kind, color: color });
    });
    S.helpBtn.addEventListener("click", function(){
      FP.openModal("How the Script page works",
        '<p><b>Make a shot:</b> select text in the script. A bar appears with shot sizes: click one, or press its number. Shift+S makes a shot without a size. Click a highlighted shot to change its size, lens or notes.</p>' +
        '<p><b>Mark up:</b> the same bar underlines, strikes through, highlights or adds a note. Or arm a tool in the toolbar first (U, K, 1–4, E, N), then select text. Esc disarms it.</p>' +
        '<p><b>Draw:</b> press D or use Draw to sketch over the page. Each mark can be selected, moved and recoloured later.</p>' +
        '<p><b>Bring a script in:</b> paste it, or use Import PDF. A PDF without scene headings comes in as a treatment, page by page. Generate scenes &amp; locations makes a scene for each heading.</p>');
    });
    S.drawBtn.addEventListener("click", function(){ setDrawMode(!drawOn); });
    S.lastShotBtn.addEventListener("click", function(){ revealRef(lastCreatedRefId); });
    S.editBtn.addEventListener("click", function(){ if (editMode) finishEdit(); else askEdit(); });
    S.importBtn.addEventListener("click", function(){ S.importFile.click(); });
    S.importFile.addEventListener("change", function(){
      var f = this.files && this.files[0];
      this.value = "";
      if (f) onImportFile(f);
    });
    S.modeBtn.addEventListener("click", function(){
      if (lastImportedPdf) runPdfImport(lastImportedPdf, scriptMode === "treatment" ? "screenplay" : "treatment");
    });
    S.compareBtn.addEventListener("click", function(){ openCompare(null); });
    S.generateBtn.addEventListener("click", function(){ generateScenes(this); });
    S.railList.addEventListener("click", function(e){
      var b = e.target.closest(".scene-item");
      if (b) jumpToScene(b.dataset.scene);
    });

    S.area.addEventListener("input", onAreaInput);
    S.area.addEventListener("keydown", function(e){
      var mod = e.metaKey || e.ctrlKey, k = (e.key || "").toLowerCase();
      if (mod && k === "z"){
        e.preventDefault();
        flushEdit();
        if (e.shiftKey) FP.redo(); else FP.undo();
      } else if (mod && k === "y"){ e.preventDefault(); flushEdit(); FP.redo(); }
    });
    S.area.addEventListener("click", function(e){
      if (drawOn) return;
      var ref = e.target.closest(".script-shot-ref");
      if (ref && !selectionInArea()){
        var hit = findShot(FP.project(), ref.getAttribute("data-script-ref"), true);
        if (hit) showShotPopup(hit.shot.id, ref.getBoundingClientRect());
        return;
      }
      var note = e.target.closest(".script-note-comment");
      if (note && !selectionInArea()) showNotePopup(null, note.getBoundingClientRect(), note);
    });
    // hovering a mark opens its label; leaving rocks the number badge back into place
    S.area.addEventListener("mouseover", function(e){
      var ref = e.target.closest ? e.target.closest(".script-shot-ref") : null;
      if (!ref) return;
      S.area.querySelectorAll(".ssr-open").forEach(function(o){ if (o !== ref) o.classList.remove("ssr-open"); });
      ref.classList.remove("ssr-settling");
      ref.classList.add("ssr-open");
    });
    S.area.addEventListener("mouseout", function(e){
      var ref = e.target.closest ? e.target.closest(".script-shot-ref") : null;
      if (!ref) return;
      var to = e.relatedTarget;
      if (to && to.closest && to.closest(".script-shot-ref") === ref) return;
      ref.classList.remove("ssr-open");
      ref.classList.remove("ssr-settling"); void ref.offsetWidth; ref.classList.add("ssr-settling");
      setTimeout(function(){ ref.classList.remove("ssr-settling"); }, 520);
    });
    S.area.addEventListener("contextmenu", function(e){
      if (drawOn) return;
      var r = selectionInArea();
      var note = e.target.closest(".script-note");
      if (!r && !note) return;
      e.preventDefault();
      var items = [];
      if (r){
        var range = r.cloneRange();
        items.push({ label: "Create shot", hint: "Shift S", onClick: function(){ createShotFromRange(range); clearSelection(); } });
      }
      if (note){
        if (note.classList.contains("script-note-comment")){
          items.push({ label: "Edit note", onClick: function(){ showNotePopup(null, note.getBoundingClientRect(), note); } });
          items.push({ label: "Remove note", onClick: function(){ unwrapAnnotationSpan(note); commit(); } });
        } else {
          var what = note.classList.contains("script-note-hl") ? "highlight" : note.classList.contains("script-note-underline") ? "underline" : "strikethrough";
          items.push({ label: "Remove " + what, onClick: function(){ unwrapAnnotationSpan(note); commit(); } });
        }
      }
      var anchor = { getBoundingClientRect: function(){ return { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }; } };
      FP.openMenu(anchor, items);
    });

    loadFromProject(p);
  }

  // ---------- document-level input, only while this page shows ----------
  document.addEventListener("paste", onPaste);
  var typeHintAt = 0;
  document.addEventListener("beforeinput", function(e){
    if (!S || !inArea(e.target) || editMode) return;
    if (e.inputType === "insertFromPaste" || e.inputType === "insertFromPasteAsQuotation") return;
    // the script isn't a text editor until Edit script is on: a stray keypress would
    // re-flow every page break after it
    e.preventDefault();
    if (Date.now() - typeHintAt > 3000){
      typeHintAt = Date.now();
      toast("Use Edit script to type in the script. Pasting and Import PDF work any time.", 3500);
    }
  });
  function afterSelectionSettles(){
    if (!active() || drawOn || shotPopupEl || notePopupEl) return;
    if (applyArmedToSelection()) return;
    var r = selectionInArea();
    if (r) showSizeBar(r); else closeSizeBar();
  }
  document.addEventListener("mouseup", function(e){
    if (sizeBarEl && sizeBarEl.contains(e.target)) return;
    setTimeout(afterSelectionSettles, 0);
  });
  document.addEventListener("keyup", function(e){
    if (e.shiftKey || (e.key === "a" && (e.ctrlKey || e.metaKey))) setTimeout(afterSelectionSettles, 0);
  });
  document.addEventListener("mousedown", function(e){
    if (sizeBarEl && !sizeBarEl.contains(e.target)) closeSizeBar();
    if (notePopupEl && !notePopupEl.contains(e.target)) closeNotePopup();
    if (shotPopupEl && !shotPopupEl.contains(e.target) && !(e.target.closest && e.target.closest(".script-shot-ref"))) closeShotPopup();
  });
  window.addEventListener("scroll", function(){
    closeSizeBar();
    if (S && FP.currentPage && FP.currentPage() === "script") updatePageNo();
  }, { passive: true });
  window.addEventListener("resize", function(){ closeSizeBar(); closeNotePopup(); closeShotPopup(); if (S) queuePaginate(); });

  document.addEventListener("keydown", function(e){
    if (!active()) return;
    var t = e.target;
    var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    var inScript = inArea(t);
    var k = (e.key || "").toLowerCase();
    var mod = e.ctrlKey || e.metaKey || e.altKey;

    if (e.key === "Escape" && (shotPopupEl || notePopupEl)){ closeShotPopup(); closeNotePopup(); return; }

    // the selection bar: number keys pick a size
    if (sizeBarEl && sizeBarRange){
      if (inScript && !mod && k >= "1" && k <= "9"){
        var size = FP.visibleOptions(FP.project(), "size").filter(Boolean)[parseInt(k, 10) - 1];
        if (size){
          e.preventDefault();
          var btn = sizeBarEl.querySelector('.script-size-btn[data-size="' + size + '"]');
          var rect = (btn || sizeBarEl).getBoundingClientRect();
          var range = sizeBarRange;
          closeSizeBar();
          var id = createShotFromRange(range, size);
          clearSelection();
          if (id) showShotPopup(id, rect);
          return;
        }
      }
      if (k !== "shift") closeSizeBar();
    }
    // Shift+S: a shot from the selection, no size
    if (k === "s" && e.shiftKey && !mod){
      var r = selectionInArea();
      if (r){ e.preventDefault(); createShotFromRange(r.cloneRange()); clearSelection(); return; }
    }
    if (mod) return;
    if (e.key === "Escape"){
      if (drawOn){ e.preventDefault(); if (drawSel.length) clearDrawSelection(); else setDrawMode(false); return; }
      if (armedTool){ setArmedTool(null); return; }
    }
    if (drawOn){
      if ((e.key === "Delete" || e.key === "Backspace") && drawSel.length && !typing){ e.preventDefault(); deleteDrawSelection(); return; }
      if (typing) return;
      if (k === "d"){ e.preventDefault(); setDrawMode(false); return; }
      var map = { v: "select", p: "pencil", m: "marker", l: "line", a: "arrow", r: "rect", o: "ellipse", e: "eraser" };
      if (map[k]){ e.preventDefault(); setDrawTool(map[k]); }
      return;
    }
    // once a tool is armed its keys work from inside the script too (the caret lands
    // there after every selection); arming the first one needs focus elsewhere
    if (editMode || (typing && !armedTool)) return;
    if (k === "d" && !typing){ e.preventDefault(); setDrawMode(true); return; }
    var tool = null;
    if (k === "u") tool = { kind: "underline" };
    else if (k === "k") tool = { kind: "strike" };
    else if (k === "n") tool = { kind: "note" };
    else if (k === "e") tool = { kind: "erase" };
    else if (k >= "1" && k <= "4") tool = { kind: "highlight", color: ANNOT_COLORS[parseInt(k, 10) - 1].key };
    if (!tool) return;
    e.preventDefault();
    var same = armedTool && armedTool.kind === tool.kind && (tool.kind !== "highlight" || armedTool.color === tool.color);
    setArmedTool(same ? null : tool);
  });

  // ---------- page registration ----------
  FP.pages.script = {
    render: function(host, p){ mount(host, p); },
    update: function(host, p, info){
      if (!S) return;
      if (selfChange){
        refreshBadges(p);
        renderRail(p);
        updateJumpBtn();
        return;
      }
      // undo, redo, or a change made elsewhere: reload when the script itself differs
      clearTimeout(editTimer); editTimer = null;
      var html = serializeScript();
      if (html !== p.script.html || S.dwItems.innerHTML !== p.script.drawHTML || scriptMode !== p.script.mode ||
          JSON.stringify(scriptPaper) !== JSON.stringify(p.script.paper)){
        loadFromProject(p);
      } else {
        closeShotPopup();
        refreshBadges(p);
        renderRail(p);
        updateJumpBtn();
      }
    },
    leave: function(){
      if (!S) return;
      if (editTimer) commit("script-edit");
      if (editMode){ setEditMode(false); commit(); }
      closeSizeBar(); closeNotePopup(); closeShotPopup();
      if (drawOn) setDrawMode(false);
      S = null;
    },
    revealRef: function(refId){ return revealRef(refId); },
    revealScene: function(sceneId){ if (S) jumpToScene(sceneId); }
  };
})();
