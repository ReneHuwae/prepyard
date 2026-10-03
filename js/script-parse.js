/* Reading scripts: scene headings, pasted text, PDF import (screenplay and treatment),
   scene summaries and the line diff behind Compare. No page UI lives here.
   Ported from the classic app, where these rules were tuned against real scripts. */
(function(){
  "use strict";
  var FP = window.FP;

  function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function escAttr(s){ return esc(s).replace(/"/g, "&quot;"); }

  // ---------- scene headings ----------
  var DAYNIGHT_KEYWORDS = [
    [/night/i, "NIGHT"], [/sunrise/i, "SUNRISE"], [/sunset/i, "SUNSET"],
    [/dawn/i, "DAWN"], [/dusk|evening/i, "DUSK"], [/day|morning|afternoon|noon/i, "DAY"]
  ];
  function mapDayNight(s){
    for (var i = 0; i < DAYNIGHT_KEYWORDS.length; i++) if (DAYNIGHT_KEYWORDS[i][0].test(s)) return DAYNIGHT_KEYWORDS[i][1];
    return null;
  }
  // continuity tags ("CONTINUOUS", "MOMENTS LATER") aren't a time of day, but they don't
  // belong in the scene name either
  var SP_CONTINUITY = /^(continuous|same\s*time|moments?\s+later|later|same|magic\s+hour)$/i;
  function looksLikeSceneTail(s){
    s = (s || "").trim();
    var lastWord = (s.split(/\s+/).pop() || "");
    return mapDayNight(lastWord) !== null || SP_CONTINUITY.test(lastWord) || SP_CONTINUITY.test(s.replace(/.*[-–—]\s*/, ""));
  }
  function parseSlugline(line){
    var HEAD = "(INT\\.?\\s*\\/\\s*EXT|EXT\\.?\\s*\\/\\s*INT|I\\.?\\s*\\/\\s*E|INT|EXT)";
    var t = line.trim();
    var m = t.match(new RegExp("^\\d+\\s+" + HEAD + "\\.?\\s+(.+)$", "i"))
         || t.match(new RegExp("^" + HEAD + "\\.?\\s+(.+)$", "i"));
    if (!m) return null;
    var prefix = m[1].toUpperCase().replace(/[.\s]/g, "");
    var intext = /^(INT\/EXT|EXT\/INT|I\/E)$/.test(prefix) ? "INT/EXT" : (prefix === "EXT" ? "EXT" : "INT");
    var parts = m[2].split(/\s*[-–—]\s*/).filter(Boolean);
    // strip every trailing time-of-day or continuity tag: "CAR - DAY - CONTINUOUS" is CAR, DAY
    var daynight = null, guard = 0;
    while (parts.length > 1 && guard < 4){
      var last = parts[parts.length - 1].trim();
      var dn = mapDayNight(last);
      if (dn){ if (!daynight) daynight = dn; parts = parts.slice(0, -1); guard++; continue; }
      if (SP_CONTINUITY.test(last)){ parts = parts.slice(0, -1); guard++; continue; }
      break;
    }
    var name = parts.join(" - ").trim();
    if (!name) return null;
    return { name: name, intext: intext, daynight: daynight };
  }

  // ---------- scene summary ----------
  // abbreviations whose full stop doesn't end a sentence ("Mr. Smith enters")
  var SP_ABBR = /^(mr|mrs|ms|dr|st|jr|sr|vs|etc|no|prof|capt|lt|sgt|col|gen|rev|hon|mt|ft|ave|blvd|approx)$/i;
  function firstSentenceChunk(str){
    var re = /[^.!?]+[.!?]+|[^.!?]+$/g;
    var m, out = "";
    while ((m = re.exec(str))){
      out += m[0];
      var trimmed = out.trim();
      var lastWord = trimmed.replace(/[.!?]+$/, "").split(/\s+/).pop();
      if (/\.$/.test(trimmed) && SP_ABBR.test(lastWord)) continue;
      break;
    }
    return out;
  }
  // a one-line gist of the scene, read off the action lines under its heading
  function sceneSummaryFrom(node){
    if (!node) return "";
    var actions = [], chars = [], n = node.nextSibling;
    while (n){
      if (n.nodeType === 1){
        if (n.classList.contains("sp-scene")) break;
        var t = (n.textContent || "").replace(/\s+/g, " ").trim();
        if (t){
          if (n.classList.contains("sp-action")) actions.push(t);
          else if (n.classList.contains("sp-char")){
            var who = t.replace(/\s*\(.*\)\s*$/, "").trim();
            if (who && chars.indexOf(who) === -1) chars.push(who);
          }
        }
      }
      n = n.nextSibling;
    }
    var body = actions.join(" ");
    // a shooting note glued to the front of an action line isn't the scene's description
    while (/^\s*\([^)]*\)\s*/.test(body)) body = body.replace(/^\s*\([^)]*\)\s*/, "");
    var consumed = firstSentenceChunk(body);
    var out = consumed.trim();
    if (out.length < 32 && body.length > consumed.length){
      var more = firstSentenceChunk(body.slice(consumed.length)).trim();
      if (more) out += " " + more;
    }
    if (!out && chars.length) out = chars.slice(0, 3).join(", ");
    if (out.length > 180) out = out.slice(0, 178).replace(/\s+\S*$/, "") + "…";
    return out;
  }

  // ---------- pasted text → screenplay blocks ----------
  var SP_TRANS = /(^|\s)(CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|FADE OUT\.?|FADE TO BLACK\.?|FADE IN:)$/;
  function spIsCaps(t){ return /[A-Z]/.test(t) && !/[a-z]/.test(t); }
  // flattened PDF pastes often glue the cue to its line: "SAMBA Welcome, welcome."
  function spSplitCue(t){
    var m = t.match(/^([A-Z][A-Z0-9 .'’\-]{0,24}?(?:\s*\([^)]*\))?)\s+([A-Z(].*)$/);
    if (!m) return null;
    var cue = m[1].trim();
    if (!spIsCaps(cue.replace(/\([^)]*\)/g, ""))) return null;
    if (cue.split(/\s+/).length > 4) return null;
    return { cue: cue, rest: m[2].trim() };
  }
  // "12 EXT. HOSTEL - DAY 12": the number lives in the margins, not the heading text. A lone
  // trailing number only counts when it repeats the leading one or follows a time of day,
  // since it could be part of the location ("APARTMENT 4B").
  function spSceneParts(t){
    var lead = t.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    var num = lead ? lead[1] : "";
    var rest = lead ? lead[2] : t;
    var trail = rest.match(/^(.*\S)\s+(\d{1,4}[A-Za-z]?)$/);
    if (trail){
      if (num && trail[2] === num) rest = trail[1];
      else if (!num && looksLikeSceneTail(trail[1])){ num = trail[2]; rest = trail[1]; }
    }
    return { num: num, text: rest };
  }
  // page numbers and (CONTINUED) markers from the source; left in, they land mid-scene
  var SP_PAGE_NUM = /^(?:-\s*)?(?:page\s*)?\d{1,4}[.):]?(?:\s*-)?$/i;
  var SP_CONTINUED = /^\(?\s*(?:continued|cont'?d|more)\s*\)?\s*[:.]?\s*(?:\(\d+\)\s*)?$/i;
  function spIsPageFurniture(t){ return SP_PAGE_NUM.test(t) || SP_CONTINUED.test(t); }

  // returns { html, stripped } where stripped counts the page furniture taken out
  function screenplayHTML(raw){
    var lines = raw.split("\n");
    var out = [], prev = null, stripped = 0;
    function push(type, text, attrs){
      out.push('<div class="sp-' + type + '"' + (attrs || "") + '>' + (esc(text) || "<br>") + "</div>");
      prev = text.trim() ? type : null;
    }
    for (var i = 0; i < lines.length; i++){
      var t = lines[i].trim();
      // blank lines are dropped; spacing comes from the element rules
      if (!t) continue;
      if (spIsPageFurniture(t)){ stripped++; prev = null; continue; }
      if (parseSlugline(t)){
        var sc = spSceneParts(t);
        push("scene", sc.text, sc.num ? ' data-num="' + escAttr(sc.num) + '"' : "");
        continue;
      }
      if (/^\(.*\)$/.test(t)){ push("paren", t); continue; }
      if (spIsCaps(t) && SP_TRANS.test(t)){ push("trans", t); continue; }
      // a real cue is short, name-like and has no sentence punctuation at the end
      if (spIsCaps(t) && t.length <= 40 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 6){
        push((lines[i + 1] || "").trim() ? "char" : "action", t);
        continue;
      }
      var split = (prev !== "char" && prev !== "paren") ? spSplitCue(t) : null;
      if (split){
        push("char", split.cue);
        push(/^\(.*\)$/.test(split.rest) ? "paren" : "dialog", split.rest);
        continue;
      }
      // dialogue wraps at 3.5in (~35 chars), so a long line after dialogue is action
      var cont = (prev === "char" || prev === "paren") || (prev === "dialog" && t.length <= 45);
      push(cont ? "dialog" : "action", t);
    }
    return { html: out.join(""), stripped: stripped };
  }

  // ---------- PDF import ----------
  var pdfjsPromise = null;
  function vendorURL(file){ return new URL("vendor/" + file, document.baseURI).href; }
  function loadPdfJs(){
    if (!pdfjsPromise){
      pdfjsPromise = import(vendorURL("pdf.min.mjs")).then(function(lib){
        lib.GlobalWorkerOptions.workerSrc = vendorURL("pdf.worker.min.mjs");
        return lib;
      });
      pdfjsPromise.catch(function(){ pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }
  // pdf.js often splits one visual line into several items; merge items on one baseline
  function pdfLinesFromTextContent(items){
    var lines = [], cur = null;
    items.forEach(function(it){
      var str = it.str || "";
      var x = it.transform[4], y = it.transform[5];
      var w = it.width || 0;
      if (cur && Math.abs(y - cur.y) < 2.5){
        var gap = x - cur.endX;
        if (gap > 1.5 && !/\s$/.test(cur.text) && str) cur.text += " ";
        cur.text += str;
        cur.endX = Math.max(cur.endX, x + w);
        if (x < cur.x) cur.x = x;
      } else {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = { x: x, y: y, endX: x + w, text: str };
      }
    });
    if (cur && cur.text.trim()) lines.push(cur);
    return lines;
  }
  // the left margin shared by headings and action: the x position covering the most text
  function pdfDetectMarginX(lines){
    var buckets = {}, best = null, bestScore = -1;
    lines.forEach(function(l){
      var t = l.text.trim();
      if (t.length < 10) return;
      var key = Math.round(l.x / 3) * 3;
      buckets[key] = (buckets[key] || 0) + t.length;
    });
    Object.keys(buckets).forEach(function(k){
      if (buckets[k] > bestScore){ bestScore = buckets[k]; best = parseFloat(k); }
    });
    return best === null ? 0 : best;
  }
  // classify a line by its text and its indent from the action margin
  function pdfClassifyLine(text, indent){
    var t = text.trim();
    if (!t || spIsPageFurniture(t)) return null;
    var sc = spSceneParts(t);
    if (parseSlugline(sc.text)) return { type: "scene", text: sc.text, num: sc.num };
    if (/^\(.*\)$/.test(t)) return { type: "paren", text: t };
    if (spIsCaps(t)){
      if (SP_TRANS.test(t)) return { type: "trans", text: t };
      if (indent >= 30 && t.length <= 40 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 6){
        return { type: "char", text: t };
      }
    }
    return { type: indent >= 30 ? "dialog" : "action", text: t };
  }
  // does this file read like a screenplay? A landscape page or no headings says no
  function pdfLooksLikeScreenplay(lines, vpW, vpH){
    if (!lines.length) return false;
    if (vpW > vpH) return false;
    var sceneish = 0, capsish = 0;
    lines.forEach(function(l){
      var t = (l.text || "").trim();
      // numbered scripts put the scene number in front of the heading: "12 EXT. HOSTEL"
      if (/^(INT|EXT|INT\.\/EXT|I\/E)[\s.\/-]/i.test(spSceneParts(t).text)) sceneish++;
      if (t && t === t.toUpperCase() && /[A-Z]{3}/.test(t) && t.length < 40) capsish++;
    });
    if (sceneish >= 2) return true;
    return sceneish >= 1 && capsish >= lines.length * 0.05;
  }

  async function importScriptPdf(file){
    var pdfjsLib = await loadPdfJs();
    var buf = await file.arrayBuffer();
    var doc = await pdfjsLib.getDocument({ data: buf }).promise;
    var allLines = [];
    var vpW = 0, vpH = 0, pageTopY = {}, pageBotY = {};
    for (var p = 1; p <= doc.numPages; p++){
      var page = await doc.getPage(p);
      if (p === 1){
        var vp0 = page.getViewport({ scale: 1 });
        vpW = vp0.width; vpH = vp0.height;
      }
      var content = await page.getTextContent();
      pdfLinesFromTextContent(content.items).forEach(function(l){
        l.page = p; allLines.push(l);
        if (pageTopY[p] === undefined || l.y > pageTopY[p]) pageTopY[p] = l.y;
        if (pageBotY[p] === undefined || l.y < pageBotY[p]) pageBotY[p] = l.y;
      });
    }
    if (!allLines.length) return { html: "", scenes: 0, pages: doc.numPages, paper: null, looksLikeScreenplay: false, landscape: vpW > vpH };

    var marginX = pdfDetectMarginX(allLines);
    var gaps = [];
    for (var i = 1; i < allLines.length; i++){
      var g = allLines[i - 1].y - allLines[i].y;
      if (g > 0 && g < 40) gaps.push(g);
    }
    gaps.sort(function(a, b){ return a - b; });
    var lineHeight = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14;

    // Page capacity comes from the file, not an assumed US Letter: an A4 script holds more
    // lines per page, and assuming Letter overflows every page and compounds.
    var paper = null;
    if (vpH && lineHeight > 0){
      var maxSpan = 0, topMost = -Infinity, botMost = Infinity;
      for (var pk in pageTopY){
        var span = Math.round((pageTopY[pk] - pageBotY[pk]) / lineHeight) + 1;
        if (span > maxSpan) maxSpan = span;
        if (pageTopY[pk] > topMost) topMost = pageTopY[pk];
        if (pageBotY[pk] < botMost) botMost = pageBotY[pk];
      }
      var capLines = Math.max(20, Math.min(120, maxSpan));
      var padTopIn = Math.min(2, Math.max(0.3, (vpH - topMost) / 72));
      var padBotIn = (vpH / 72) - padTopIn - capLines / 6;
      if (!(padBotIn >= 0.25)) padBotIn = Math.min(2, Math.max(0.3, botMost / 72));
      paper = { wIn: vpW / 72, hIn: vpH / 72, padTopIn: padTopIn, padBotIn: padBotIn, linesPerPage: capLines };
    }

    var entries = [], sceneCount = 0;
    for (var j = 0; j < allLines.length; j++){
      var ln = allLines[j];
      var cls = pdfClassifyLine(ln.text, ln.x - marginX);
      if (!cls) continue;
      if (cls.type === "scene") sceneCount++;
      // a wrapped continuation sits one line-height below on the same page
      var mergeable = cls.type === "action" || cls.type === "dialog" || cls.type === "paren";
      var prevEntry = entries.length ? entries[entries.length - 1] : null;
      var samePage = prevEntry && prevEntry.page === ln.page;
      var gapOk = j > 0 && allLines[j - 1].page === ln.page && (allLines[j - 1].y - ln.y) <= lineHeight * 1.6;
      if (mergeable && gapOk && samePage && prevEntry.type === cls.type){
        prevEntry.text += " " + cls.text;
      } else {
        // the first block from a new PDF page starts a page here too, so the pages line up
        entries.push({ type: cls.type, text: cls.text, num: cls.num, page: ln.page,
          pgbreak: !!(prevEntry && prevEntry.page !== ln.page) });
      }
    }
    var html = entries.map(function(en){
      var attrs = (en.type === "scene" && en.num) ? ' data-num="' + escAttr(en.num) + '"' : "";
      if (en.pgbreak) attrs += ' data-pgbreak="1"';
      return '<div class="sp-' + en.type + '"' + attrs + '>' + (esc(en.text) || "<br>") + "</div>";
    }).join("");
    return { html: html, scenes: sceneCount, pages: doc.numPages, paper: paper,
      looksLikeScreenplay: pdfLooksLikeScreenplay(allLines, vpW, vpH), landscape: vpW > vpH };
  }

  // ---------- treatments ----------
  // A treatment isn't a screenplay: images, columns, any type, often landscape. Each page is
  // kept as an image at its own shape, with the real text laid over it as invisible,
  // positioned spans, so selecting text and making a shot still works.
  var TM_DISPLAY_PX_PER_IN = 108;
  var TM_MAX_PAGE_IN = 10;
  var TM_RASTER_SCALE = 2;
  // an OffscreenCanvas keeps rendering while the tab is in the background
  function tmMakeCanvas(w, h){
    if (typeof OffscreenCanvas === "function"){
      try { return { canvas: new OffscreenCanvas(w, h), offscreen: true }; } catch (e){}
    }
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return { canvas: c, offscreen: false };
  }
  async function tmCanvasToJpeg(rec, quality){
    if (rec.offscreen && rec.canvas.convertToBlob){
      var blob = await rec.canvas.convertToBlob({ type: "image/jpeg", quality: quality });
      return await new Promise(function(resolve, reject){
        var fr = new FileReader();
        fr.onload = function(){ resolve(fr.result); };
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    }
    return rec.canvas.toDataURL("image/jpeg", quality);
  }
  async function importTreatmentPdf(file, onProgress){
    var pdfjsLib = await loadPdfJs();
    var buf = await file.arrayBuffer();
    var doc = await pdfjsLib.getDocument({ data: buf }).promise;
    var measureCtx = document.createElement("canvas").getContext("2d");
    var pagesHtml = [];
    var widestIn = 0;
    for (var p = 1; p <= doc.numPages; p++){
      if (onProgress) onProgress(p, doc.numPages);
      var page = await doc.getPage(p);
      var base = page.getViewport({ scale: 1 });
      var pageWIn = Math.min(TM_MAX_PAGE_IN, base.width / 72);
      if (pageWIn > widestIn) widestIn = pageWIn;
      var dispW = pageWIn * TM_DISPLAY_PX_PER_IN;
      var dispScale = dispW / base.width;
      var vp = page.getViewport({ scale: dispScale });
      var crec = tmMakeCanvas(Math.round(vp.width * TM_RASTER_SCALE), Math.round(vp.height * TM_RASTER_SCALE));
      var ctx = crec.canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, crec.canvas.width, crec.canvas.height);
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: dispScale * TM_RASTER_SCALE }) }).promise;
      var img = await tmCanvasToJpeg(crec, 0.72);
      var spans = [];
      try {
        var tc = await page.getTextContent();
        tc.items.forEach(function(item){
          if (!item.str || !item.str.trim()) return;
          var tx = pdfjsLib.Util.transform(vp.transform, item.transform);
          var fh = Math.hypot(tx[2], tx[3]);
          if (!(fh > 0.5)) return;
          var left = tx[4], top = tx[5] - fh;
          var wantW = (item.width || 0) * dispScale;
          measureCtx.font = fh + "px 'Instrument Sans', sans-serif";
          var natW = measureCtx.measureText(item.str).width;
          // squeeze each run onto the width the PDF gave it, so a selection sits on its words
          var sx = (wantW > 0 && natW > 0) ? (wantW / natW) : 1;
          if (!isFinite(sx) || sx <= 0) sx = 1;
          spans.push('<span class="tm-t" style="left:' + (left / vp.width * 100).toFixed(3) +
            '%;top:' + (top / vp.height * 100).toFixed(3) + '%;font-size:' + (fh / vp.width * 100).toFixed(3) +
            'cqw;transform:scaleX(' + sx.toFixed(4) + ')">' + escAttr(item.str) + "</span>");
        });
      } catch (e){ /* an image-only page has no text layer */ }
      pagesHtml.push('<div class="tm-page" data-tm-page="' + p + '" style="--tm-w:' + dispW.toFixed(1) +
        'px;aspect-ratio:' + vp.width.toFixed(1) + ' / ' + vp.height.toFixed(1) + '">' +
        '<img class="tm-img" src="' + img + '" alt="Page ' + p + '" draggable="false">' +
        '<div class="tm-text">' + spans.join("") + "</div></div>");
    }
    return { html: '<div class="tm-doc">' + pagesHtml.join("") + "</div>", pages: doc.numPages, widestIn: widestIn || 8.5 };
  }

  // ---------- compare ----------
  var COMPARE_DIFF_CAP = 2500;
  // line-level LCS over block texts; null when the scripts are too long to line up
  function lcsDiffBlocks(a, b){
    var n = a.length, m = b.length;
    if (n > COMPARE_DIFF_CAP || m > COMPARE_DIFF_CAP) return null;
    var dp = new Array(n + 1), i, j;
    for (i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
    for (i = n - 1; i >= 0; i--){
      for (j = m - 1; j >= 0; j--){
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var ops = []; i = 0; j = 0;
    while (i < n && j < m){
      if (a[i] === b[j]){ ops.push({ type: "same", text: a[i], oldIndex: i, newIndex: j }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]){ ops.push({ type: "removed", text: a[i], oldIndex: i }); i++; }
      else { ops.push({ type: "added", text: b[j], newIndex: j }); j++; }
    }
    while (i < n){ ops.push({ type: "removed", text: a[i], oldIndex: i }); i++; }
    while (j < m){ ops.push({ type: "added", text: b[j], newIndex: j }); j++; }
    return ops;
  }

  FP.scriptParse = {
    parseSlugline: parseSlugline,
    sceneSummaryFrom: sceneSummaryFrom,
    screenplayHTML: screenplayHTML,
    importScriptPdf: importScriptPdf,
    importTreatmentPdf: importTreatmentPdf,
    lcsDiffBlocks: lcsDiffBlocks
  };
})();
