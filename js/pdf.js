/* PDF exports, Rev. 08: the shot list, breakdown, schedule and callsheet as real PDFs
   (pdf-lib, with the font embedded through fontkit), in the same plain style as the app:
   white paper, hairline rules, grey scene bands, the scene number in orange. Every page
   carries the project and the document at the top and its page number at the bottom.
   Files are numbered per document: Midnight_Ferry_shotlist_v03.pdf. */
(function(){
  "use strict";
  var FP = window.FP;

  var C = {
    ink: [16, 17, 18], soft: [84, 87, 92], faint: [138, 141, 146], line: [214, 214, 211], band: [236, 236, 234],
    paper: [255, 255, 255], accent: [255, 67, 17], cam: [31, 107, 74], light: [168, 106, 0], notes: [75, 68, 168]
  };

  // ---------- loading the libraries (once, on the first export) ----------
  var libs = null;
  function script(src){
    return new Promise(function(resolve, reject){
      var s = document.createElement("script");
      s.src = new URL(src, document.baseURI).href;
      s.onload = resolve;
      s.onerror = function(){ reject(new Error("Couldn't load " + src)); };
      document.head.appendChild(s);
    });
  }
  function bytes(src){
    return fetch(new URL(src, document.baseURI).href).then(function(r){
      if (!r.ok) throw new Error("Couldn't load " + src);
      return r.arrayBuffer();
    });
  }
  function load(){
    if (!libs){
      libs = (window.PDFLib ? Promise.resolve() : script("vendor/pdf-lib.min.js"))
        .then(function(){ return window.fontkit ? null : script("vendor/fontkit.umd.min.js"); })
        .then(function(){
          return Promise.all(["Regular", "ExtraBold", "Italic"].map(function(w){ return bytes("vendor/PlusJakartaSans-" + w + ".woff"); }));
        })
        .then(function(f){ return { R: f[0], B: f[1], I: f[2] }; });
      libs.catch(function(){ libs = null; });
    }
    return libs;
  }
  function dataBytes(src){
    var b64 = String(src).split(",")[1] || "", bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ---------- a page-flowing document ----------
  // y runs down from the top of the page, like the screen
  function Doc(fonts, o){
    var L = window.PDFLib, pdf, f = {}, pages = [], page = null;
    var PW = o.portrait ? 595.28 : 841.89, PH = o.portrait ? 841.89 : 595.28, M = o.margin || 34;
    var TOP = M + 26, BOTTOM = PH - M - 16;
    var d = { PW: PW, PH: PH, M: M, W: PW - M * 2, y: TOP, TOP: TOP, BOTTOM: BOTTOM, onPage: null };
    var imgCache = {};

    function rgb(c){ return L.rgb(c[0] / 255, c[1] / 255, c[2] / 255); }
    function clean(s){ return String(s == null ? "" : s).replace(/[\t\r\n]+/g, " "); }
    d.init = function(){
      return L.PDFDocument.create().then(function(doc){
        pdf = doc;
        pdf.registerFontkit(window.fontkit);
        pdf.setTitle(o.title); pdf.setCreator("Filmprep"); pdf.setProducer("Filmprep");
        return Promise.all([pdf.embedFont(fonts.R, { subset: true }), pdf.embedFont(fonts.B, { subset: true }), pdf.embedFont(fonts.I, { subset: true })]);
      }).then(function(e){ f.R = e[0]; f.B = e[1]; f.I = e[2]; d.newPage(); return d; });
    };
    function font(op){ return op && op.bold ? f.B : op && op.italic ? f.I : f.R; }
    d.width = function(s, size, op){ return font(op).widthOfTextAtSize(clean(s), size); };
    d.text = function(x, y, s, op){
      op = op || {};
      s = clean(s);
      if (!s) return 0;
      var size = op.size || 9, w = d.width(s, size, op);
      if (op.align === "right") x -= w;
      page.drawText(s, { x: x, y: PH - y, size: size, font: font(op), color: rgb(op.color || C.ink) });
      return w;
    };
    // tracked capitals, the house style for labels
    d.label = function(x, y, s, op){
      op = op || {};
      s = clean(s).toUpperCase();
      var size = op.size || 6.8, track = op.track == null ? 0.6 : op.track, cx = x;
      if (op.align === "right") cx -= d.labelWidth(s, size, track);
      for (var i = 0; i < s.length; i++){
        page.drawText(s[i], { x: cx, y: PH - y, size: size, font: f.B, color: rgb(op.color || C.faint) });
        cx += f.B.widthOfTextAtSize(s[i], size) + track;
      }
      return cx - x;
    };
    d.labelWidth = function(s, size, track){
      s = clean(s).toUpperCase();
      var w = 0;
      for (var i = 0; i < s.length; i++) w += f.B.widthOfTextAtSize(s[i], size) + (track == null ? 0.6 : track);
      return w;
    };
    d.wrap = function(s, size, maxW, op){
      var out = [];
      String(s == null ? "" : s).split(/\n/).forEach(function(par){
        var words = par.split(/\s+/).filter(Boolean), cur = "";
        if (!words.length){ out.push(""); return; }
        words.forEach(function(wd){
          var t = cur ? cur + " " + wd : wd;
          if (cur && d.width(t, size, op) > maxW){ out.push(cur); cur = wd; }
          else cur = t;
          // a single word wider than the column is broken by characters
          while (d.width(cur, size, op) > maxW && cur.length > 1){
            var k = cur.length - 1;
            while (k > 1 && d.width(cur.slice(0, k), size, op) > maxW) k--;
            out.push(cur.slice(0, k)); cur = cur.slice(k);
          }
        });
        out.push(cur);
      });
      return out.length ? out : [""];
    };
    d.rect = function(x, y, w, h, c){ page.drawRectangle({ x: x, y: PH - y - h, width: w, height: h, color: rgb(c) }); };
    d.frame = function(x, y, w, h, c, lw){ page.drawRectangle({ x: x, y: PH - y - h, width: w, height: h, borderColor: rgb(c || C.line), borderWidth: lw || 0.6 }); };
    d.hline = function(x1, x2, y, c, lw){ page.drawLine({ start: { x: x1, y: PH - y }, end: { x: x2, y: PH - y }, thickness: lw || 0.5, color: rgb(c || C.line) }); };
    d.vline = function(x, y1, y2, c, lw){ page.drawLine({ start: { x: x, y: PH - y1 }, end: { x: x, y: PH - y2 }, thickness: lw || 0.5, color: rgb(c || C.line) }); };
    d.newPage = function(){
      page = pdf.addPage([PW, PH]);
      pages.push(page);
      d.y = TOP;
      // running head
      d.text(M, M + 6, o.project, { size: 8.5, bold: true });
      d.label(PW - M, M + 6, o.kind, { align: "right", color: C.accent });
      d.hline(M, PW - M, M + 13, C.ink, 0.8);
      if (d.onPage) d.onPage();
    };
    d.ensure = function(h){ if (d.y + h > BOTTOM){ d.newPage(); return true; } return false; };
    d.image = function(src, x, y, maxW, maxH, cover){
      if (!src) return Promise.resolve(null);
      var p = imgCache[src] || (imgCache[src] = (/^data:image\/png/i.test(src) ? pdf.embedPng(dataBytes(src)) : pdf.embedJpg(dataBytes(src))).catch(function(){ return null; }));
      return p.then(function(img){
        if (!img) return null;
        var s = cover ? Math.max(maxW / img.width, maxH / img.height) : Math.min(maxW / img.width, maxH / img.height);
        var w = img.width * s, h = img.height * s;
        if (cover){
          // pdf-lib can't crop, so a covering image is fitted instead and centred
          s = Math.min(maxW / img.width, maxH / img.height); w = img.width * s; h = img.height * s;
          d.rect(x, y, maxW, maxH, C.band);
          page.drawImage(img, { x: x + (maxW - w) / 2, y: PH - y - (maxH + h) / 2, width: w, height: h });
          return { w: maxW, h: maxH };
        }
        page.drawImage(img, { x: x, y: PH - y - h, width: w, height: h });
        return { w: w, h: h };
      });
    };
    d.finish = function(){
      var stamp = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      pages.forEach(function(pg, i){
        page = pg;
        d.hline(M, PW - M, PH - M - 6, C.line);
        d.text(M, PH - M + 4, "This document was created using Filmprep: the all-in-one preproduction app.", { size: 7, color: C.faint });
        d.text(PW - M, PH - M + 4, "Exported " + stamp + " · Page " + (i + 1) + " of " + pages.length, { size: 7, color: C.faint, align: "right" });
      });
      return pdf.save();
    };
    return d;
  }

  // ---------- shared pieces ----------
  function lensLabel(v){ var s = String(v || "").trim(); return /^[\d.]+$/.test(s) ? s + "mm" : s; }
  function sceneLoc(sc){ for (var i = 0; i < sc.shots.length; i++) if (sc.shots[i].location) return sc.shots[i].location; return ""; }
  function fmtDate(iso){
    if (!iso) return "Date not set";
    var dt = new Date(iso + "T12:00:00");
    return isNaN(dt) ? iso : dt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function clock(m){
    if (m == null) return "";
    var x = ((Math.round(m) % 1440) + 1440) % 1440, h = Math.floor(x / 60), mm = x % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }
  // a grey scene band: "SC 12" in orange, the name, then the slug in small capitals
  function sceneBand(d, sc, h){
    h = h || 22;
    d.rect(d.M, d.y, d.W, h, C.band);
    d.hline(d.M, d.M + d.W, d.y, C.ink, 0.8);
    var x = d.M + 8, base = d.y + h / 2 + 3.4;
    x += d.label(x, base, "Sc " + sc.num, { color: C.accent, size: 8 }) + 8;
    x += d.text(x, base, sc.name || "Untitled scene", { size: 9.5, bold: true }) + 10;
    d.label(x, base, [sc.intext, sceneLoc(sc), sc.daynight].filter(Boolean).join(" · "), { size: 6.8 });
    d.y += h;
  }
  // a table with wrapped cells; repeats its header when it breaks across pages
  function table(d, cols, rows, op){
    op = op || {};
    var FS = op.size || 8.2, LH = FS * 1.3, PX = 5, PY = 4.5, HH = 17;
    var total = cols.reduce(function(s, c){ return s + c.w; }, 0), x = d.M;
    if (op.auto){
      // short columns take what their longest value needs; text columns share the rest
      var fixed = 0, flexW = 0;
      cols.forEach(function(c){
        var need = d.labelWidth(c.label, 6.4) + PX * 2 + 2;
        if (c.img) need = Math.max(need, (op.imgW || 52) + PX * 2);
        else if (!c.flex) rows.forEach(function(r){ if (!r.band && r[c.key]) need = Math.max(need, Math.min(d.width(r[c.key], FS, { bold: c.bold || r.bold }) + PX * 2 + 1, 120)); });
        c.min = need;
        if (c.flex) flexW += c.flex; else fixed += need;
      });
      var room = d.W - fixed, flexMin = cols.reduce(function(s, c){ return s + (c.flex ? c.min : 0); }, 0);
      var squeeze = room < flexMin + 40 ? (d.W - flexMin - 40) / fixed : 1;
      room = d.W - fixed * Math.min(1, squeeze);
      cols.forEach(function(c){ c.pw = c.flex ? Math.max(c.min, room * c.flex / flexW) : c.min * Math.min(1, squeeze); });
      var sum = cols.reduce(function(s, c){ return s + c.pw; }, 0);
      cols.forEach(function(c){ c.pw *= d.W / sum; c.x = x; x += c.pw; });
    } else cols.forEach(function(c){ c.x = x; c.pw = c.w / total * d.W; x += c.pw; });
    function head(){
      d.hline(d.M, d.M + d.W, d.y + HH, C.ink, 0.8);
      cols.forEach(function(c){ d.label(c.x + PX, d.y + HH - 5.5, c.label, { size: 6.4 }); });
      d.y += HH;
    }
    if (op.header !== false && !op.headAfterBand){ d.ensure(HH + LH + PY * 2); head(); }
    var chain = Promise.resolve();
    rows.forEach(function(r){
      chain = chain.then(function(){
        if (r.band){
          d.ensure(24 + HH + LH + PY * 2);
          r.band(); if (op.header !== false && op.headAfterBand) head();
          return;
        }
        var cells = cols.map(function(c){ return c.img ? [] : d.wrap(r[c.key] || "", FS, c.pw - PX * 2, { bold: c.bold }); });
        var lines = Math.max.apply(Math, cells.map(function(l){ return l.length; }).concat([1]));
        var h = Math.max(lines * LH, op.imgH && cols.some(function(c){ return c.img && r[c.key]; }) ? op.imgH : 0) + PY * 2;
        if (d.ensure(h) && op.header !== false) head();
        var y = d.y;
        if (r.fill) d.rect(d.M, y, d.W, h, r.fill);
        var imgs = [];
        cols.forEach(function(c, i){
          if (c.img){ if (r[c.key]) imgs.push(d.image(r[c.key], c.x + PX, y + PY, c.pw - PX * 2, op.imgH || 30)); return; }
          cells[i].forEach(function(line, li){
            d.text(c.x + PX, y + PY + FS + li * LH - 1, line, { size: FS, bold: c.bold || r.bold, color: r.muted ? C.faint : (c.color || C.ink) });
          });
        });
        d.hline(d.M, d.M + d.W, y + h, C.line);
        d.y = y + h;
        return Promise.all(imgs);
      });
    });
    return chain;
  }

  // ---------- file names and saving ----------
  function slug(name){
    return String(name || "").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_{2,}/g, "_").replace(/^[_.]+|[_.]+$/g, "") || "filmprep";
  }
  var BLURB = {
    shotlist: "Every scene and shot, with the columns you have showing.",
    breakdown: "A card per scene: what it needs, its images, and every shot.",
    schedule: "Each shooting day with its times, scenes, shots and breaks.",
    callsheet: "The callsheet for the selected shooting day."
  };
  function run(kind, label, portrait, build){
    var p = FP.project();
    if (!p) return;
    var base = slug(p.name), key = kind + "|" + base.toLowerCase();
    var n = (parseInt(p.exportVersions[key], 10) || 0) + 1;
    var name = base + "_" + kind + "_v" + (n < 10 ? "0" : "") + n + ".pdf";
    FP.exportDialog({
      title: label + " PDF export",
      text: BLURB[kind] + " Each export gets the next version number, so you can tell revisions apart.",
      filename: name, mime: "application/pdf",
      build: function(){
        return load().then(function(fonts){
          return Doc(fonts, { portrait: portrait, project: p.name, kind: label, title: p.name + " · " + label }).init();
        }).then(function(d){
          return Promise.resolve(build(d, FP.project())).then(function(){ return d.finish(); });
        });
      },
      // the number only moves on once a file has actually been saved
      saved: function(){ FP.quietChange(function(pp){ pp.exportVersions[key] = n; }); }
    });
  }

  // ---------- shot list (landscape) ----------
  var WEIGHT = { startTc: 9, duration: 6, scene: 4, shot: 4, sub: 4, location: 11, special: 8, size: 6, shotType: 8, lens: 6,
    grip: 8, movement: 9, action: 24, copy: 15, notes: 15, thumb: 9 };
  var FLEX = { action: 4, copy: 2.5, notes: 2.5, location: 1.2 };
  function shotlist(d, p){
    var cols = (FP.shotlistColumns ? FP.shotlistColumns() : FP.COLUMNS).filter(function(c){ return c.key !== "scene"; })
      .map(function(c){ return { key: c.key, label: c.label, w: WEIGHT[c.key] || 8, bold: c.key === "shot", img: c.key === "thumb", flex: FLEX[c.key] }; });
    if (!p.scenes.length){ d.text(d.M, d.y + 20, "No scenes yet.", { size: 10, color: C.faint }); return; }
    var rows = [];
    p.scenes.forEach(function(sc, si){
      var labels = FP.shotNumbers(sc);
      rows.push({ band: function(){
        if (si) d.y += 12;
        d.ensure(80);
        sceneBand(d, sc);
        if (sc.summary.trim()){
          d.wrap(sc.summary, 8.4, d.W - 16).forEach(function(l){ d.y += 12; d.text(d.M + 8, d.y, l, { size: 8.4, color: C.soft }); });
          d.y += 6;
        }
      } });
      sc.shots.forEach(function(sh, i){
        var r = { shot: labels[i].label, thumb: sh.storyboard[0] && sh.storyboard[0].src };
        FP.COLUMNS.forEach(function(c){ if (!c.derived) r[c.key] = c.key === "lens" ? lensLabel(sh.lens) : sh[c.key]; });
        rows.push(r);
      });
    });
    return table(d, cols, rows, { size: 7.8, headAfterBand: true, header: true, imgH: 34, imgW: 46, auto: true });
  }

  // ---------- breakdown (portrait, a card per scene) ----------
  function breakdown(d, p){
    if (!p.scenes.length){ d.text(d.M, d.y + 20, "No scenes yet.", { size: 10, color: C.faint }); return; }
    var chain = Promise.resolve();
    p.scenes.forEach(function(sc, si){
      chain = chain.then(function(){
        if (si) d.y += 18;
        d.ensure(160);
        // heading
        d.label(d.M, d.y + 8, "Sc " + sc.num, { color: C.accent, size: 8 });
        d.label(d.M + d.labelWidth("Sc " + sc.num, 8) + 10, d.y + 8, [sc.intext, sceneLoc(sc), sc.daynight].filter(Boolean).join(" · "), { size: 7 });
        d.y += 26;
        d.text(d.M, d.y, sc.name || "Untitled scene", { size: 17, bold: true });
        d.y += 8;
        if (sc.summary){ d.wrap(sc.summary, 9.5, d.W).forEach(function(l){ d.y += 13; d.text(d.M, d.y, l, { size: 9.5, color: C.soft }); }); }
        d.y += 10;
        // camera / light / notes, three columns
        var lists = [["Camera", sc.camera, C.cam], ["Light", sc.light, C.light], ["Notes", sc.notes, C.notes]];
        var cw = (d.W - 24) / 3, wrapped = lists.map(function(l){
          var items = l[1].filter(function(x){ return String(x).trim(); }), lines = [];
          items.forEach(function(it){ d.wrap(it, 8.6, cw - 10).forEach(function(w, k){ lines.push((k ? "   " : "•  ") + w); }); });
          return lines.length ? lines : ["—"];
        });
        var lh = Math.max.apply(Math, wrapped.map(function(w){ return w.length; })) * 12 + 18;
        d.ensure(lh);
        lists.forEach(function(l, i){
          var x = d.M + i * (cw + 12);
          d.rect(x, d.y, 2, lh - 4, l[2]);
          d.label(x + 8, d.y + 8, l[0], { color: l[2] });
          wrapped[i].forEach(function(line, k){ d.text(x + 8, d.y + 21 + k * 12, line, { size: 8.6, color: line === "—" ? C.faint : C.ink }); });
        });
        d.y += lh + 6;
        // the scene's images: floor plan, then location photos
        var pics = sc.floorplan.map(function(x){ return { src: x.src, label: "Floor plan" }; })
          .concat(sc.locationPhotos.map(function(x){ return { src: x.src, label: "Location" }; }));
        var row = Promise.resolve();
        if (pics.length){
          var ph = 120, pw = 160, per = Math.max(1, Math.floor((d.W + 10) / (pw + 10)));
          pics.forEach(function(pic, k){
            row = row.then(function(){
              if (k % per === 0){ if (k) d.y += ph + 22; d.ensure(ph + 20); }
              var x = d.M + (k % per) * (pw + 10);
              d.label(x, d.y + 7, pic.label, { size: 6.2 });
              return d.image(pic.src, x, d.y + 11, pw, ph, true).then(function(){ d.frame(x, d.y + 11, pw, ph); });
            });
          });
          row = row.then(function(){ d.y += ph + 26; });
        }
        // the shots
        return row.then(function(){
          var labels = FP.shotNumbers(sc), shots = Promise.resolve();
          d.ensure(40);
          d.hline(d.M, d.M + d.W, d.y, C.ink, 0.8);
          d.label(d.M, d.y + 12, sc.shots.length + (sc.shots.length === 1 ? " shot" : " shots"));
          d.y += 18;
          sc.shots.forEach(function(sh, i){
            shots = shots.then(function(){
              var imgs = sh.storyboard.map(function(x){ return x.src; }).concat(sh.floorplan.map(function(x){ return x.src; }));
              var TW = 96, TH = 64, textW = d.W - 34 - (imgs.length ? TW + 12 : 0);
              var tags = [sh.size, lensLabel(sh.lens), sh.grip, sh.movement, sh.shotType, sh.special].filter(Boolean);
              var act = d.wrap(sh.action || "", 9.2, textW), notes = sh.crewNotes.filter(function(x){ return String(x).trim(); });
              var noteLines = [];
              notes.forEach(function(n){ d.wrap(n, 8.2, textW - 10).forEach(function(w, k){ noteLines.push((k ? "   " : "–  ") + w); }); });
              var textH = (tags.length ? 16 : 0) + act.length * 12.5 + (noteLines.length ? 8 + noteLines.length * 11 : 0);
              var imgRows = Math.ceil(imgs.length / 1);
              var h = Math.max(textH, imgs.length ? Math.min(imgRows, 2) * (TH + 6) : 0) + 14;
              d.ensure(h);
              var y = d.y + 6;
              d.text(d.M, y + 10, labels[i].label, { size: 12, bold: true });
              var tx = d.M + 34, ty = y;
              if (tags.length){
                var cx = tx;
                tags.forEach(function(t){
                  var w = d.labelWidth(t, 6.4, 0.4) + 8;
                  d.frame(cx, ty, w, 11, C.ink, 0.5);
                  d.label(cx + 4, ty + 8, t, { size: 6.4, track: 0.4, color: C.ink });
                  cx += w + 4;
                });
                ty += 16;
              }
              act.forEach(function(l){ ty += 12.5; d.text(tx, ty - 3, l, { size: 9.2 }); });
              if (noteLines.length){
                ty += 6;
                d.vline(tx, ty, ty + noteLines.length * 11 + 2, C.line, 1.2);
                noteLines.forEach(function(l){ ty += 11; d.text(tx + 7, ty - 1, l, { size: 8.2, color: C.soft }); });
              }
              var draws = imgs.slice(0, 2).map(function(src, k){
                var ix = d.M + d.W - TW, iy = y + k * (TH + 6);
                return d.image(src, ix, iy, TW, TH, true).then(function(){ d.frame(ix, iy, TW, TH); });
              });
              return Promise.all(draws).then(function(){
                d.y += h;
                d.hline(d.M + 34, d.M + d.W, d.y, C.line);
              });
            });
          });
          return shots;
        });
      });
    });
    return chain;
  }

  // ---------- schedule (portrait, a page per day) ----------
  function schedule(d, p){
    var scenesOnly = false;
    try { scenesOnly = localStorage.getItem("filmprep:schedScenesOnly") === "1"; } catch (e){}
    var ix = { scenes: {}, shots: {} };
    p.scenes.forEach(function(sc){
      ix.scenes[sc.id] = sc;
      var labels = FP.shotNumbers(sc);
      sc.shots.forEach(function(sh, i){ ix.shots[sh.id] = { shot: sh, scene: sc, label: labels[i].label }; });
    });
    var chain = Promise.resolve();
    p.schedule.days.forEach(function(day, di){
      chain = chain.then(function(){
        if (di) d.newPage();
        var t = FP.pages.schedule.timing(p, day.id);
        d.text(d.M, d.y + 14, "Day " + (di + 1), { size: 20, bold: true });
        d.text(d.M + d.W, d.y + 14, fmtDate(day.date), { size: 10, align: "right", color: C.soft });
        d.y += 30;
        var stats = [["Call", day.call], ["Est. wrap", clock(t.wrap)], ["Day total", (t.total / 60).toFixed(1) + " hrs"]];
        stats.forEach(function(s, i){
          var x = d.M + i * 110;
          d.label(x, d.y + 7, s[0]);
          d.text(x, d.y + 22, s[1], { size: 13, bold: true });
        });
        d.y += 36;
        var cols = [{ key: "time", label: "Time", w: 7 }, { key: "num", label: "Shot", w: 6, bold: true }, { key: "action", label: "Action", w: 48 },
          { key: "prep", label: "Prep", w: 7 }, { key: "shoot", label: "Shoot", w: 7 }, { key: "hrs", label: "Hrs", w: 6, bold: true }];
        var rows = [];
        day.rows.forEach(function(r){
          if (r.type === "scene" && ix.scenes[r.sceneId]){
            var sc = ix.scenes[r.sceneId];
            rows.push({ time: clock(t.at[r.id]), num: "Sc " + sc.num, action: (sc.name || "Untitled scene") + "   " + [sc.intext, sceneLoc(sc), sc.daynight].filter(Boolean).join(" · ") + (r.done ? "   (shot)" : ""),
              hrs: ((t.sceneMins[r.id] || 0) / 60).toFixed(1), fill: C.band, bold: true });
          } else if (r.type === "shot" && ix.shots[r.shotId] && !scenesOnly){
            var h = ix.shots[r.shotId];
            rows.push({ time: clock(t.at[r.id]), num: h.label, action: h.shot.action, prep: r.prep + "′", shoot: r.shoot + "′", hrs: ((r.prep + r.shoot) / 60).toFixed(1) });
          } else if (r.type === "break"){
            rows.push({ time: clock(t.at[r.id]), num: "", action: (r.label || "Break").toUpperCase(), prep: r.mins + "′", hrs: (r.mins / 60).toFixed(1), muted: true });
          }
        });
        if (!rows.length){ d.text(d.M, d.y + 14, "Nothing scheduled on this day yet.", { size: 10, color: C.faint }); return; }
        return table(d, cols, rows, { size: 8.6 });
      });
    });
    return chain;
  }

  // ---------- callsheet (portrait, one day) ----------
  function callsheet(d, p, dayId){
    var day = p.schedule.days.filter(function(x){ return x.id === dayId; })[0] || p.schedule.days[0];
    if (!day){ d.text(d.M, d.y + 20, "No shooting days yet.", { size: 10, color: C.faint }); return; }
    var data = FP.callsheetData(p, day), plan = data.plan, sun = data.sun, rec = data.rec, prod = data.prod, cs = p.callsheet;
    var n = p.schedule.days.indexOf(day) + 1;
    d.label(d.M, d.y + 6, "Callsheet", { color: C.accent });
    d.text(d.M, d.y + 28, p.name, { size: 22, bold: true });
    d.text(d.M + d.W, d.y + 12, "Day " + n + " of " + p.schedule.days.length, { size: 13, bold: true, align: "right" });
    d.text(d.M + d.W, d.y + 27, fmtDate(day.date), { size: 9.5, color: C.soft, align: "right" });
    d.y += 44;
    var stats = [["General call", day.call], ["Est. wrap", clock(plan.wrap)], ["Sunrise", sun && sun.sunrise], ["Sunset", sun && sun.sunset], ["Golden hour, evening", sun && sun.goldenPm]];
    var sw = d.W / stats.length;
    stats.forEach(function(s, i){ d.label(d.M + i * sw, d.y + 7, s[0], { size: 6.2 }); d.text(d.M + i * sw, d.y + 23, s[1] || "—", { size: 13, bold: true }); });
    d.y += 32;
    d.hline(d.M, d.M + d.W, d.y, C.ink, 1.4);
    d.y += 6;
    function section(title, extra){ d.ensure(50); d.y += 12; d.label(d.M, d.y, title, { color: C.ink, size: 7.2 }); if (extra) d.label(d.M + d.labelWidth(title, 7.2) + 10, d.y, extra, { size: 6.6 }); d.y += 6; }
    function kv(pairs){
      var w = d.W / pairs.length, lines = pairs.map(function(x){ return d.wrap(x[1] || "—", 9, w - 10); });
      var h = 12 + Math.max.apply(Math, lines.map(function(l){ return l.length; })) * 12;
      d.ensure(h + 4);
      pairs.forEach(function(x, i){
        d.label(d.M + i * w, d.y + 8, x[0], { size: 6.2 });
        lines[i].forEach(function(l, k){ d.text(d.M + i * w, d.y + 20 + k * 12, l, { size: 9 }); });
      });
      d.y += h + 4;
    }
    var chain = Promise.resolve();
    var keys = cs.crew.filter(function(c){ return c.key && String(c.name || "").trim(); });
    if (keys.length){
      chain = chain.then(function(){ section("Key contacts");
        return table(d, [{ key: "role", label: "Role", w: 26, bold: true }, { key: "name", label: "Name", w: 26 }, { key: "phone", label: "Phone", w: 20 }, { key: "email", label: "Email", w: 28 }], keys, { size: 8.6 }); });
    }
    chain = chain.then(function(){
      var lines = [prod.company, prod.address, prod.invoiceTo ? "Invoices: " + prod.invoiceTo + (prod.invoiceCc ? " (cc " + prod.invoiceCc + ")" : "") : ""].filter(Boolean);
      if (lines.length){ section("Production"); lines.forEach(function(l, i){ d.y += 12; d.text(d.M, d.y, l, { size: 9, bold: i === 0 && !!prod.company }); }); d.y += 4; }
      section("Location");
      d.y += 12; d.text(d.M, d.y, data.loc.name || "Not set", { size: 11, bold: true });
      if (data.loc.coords) d.text(d.M + d.width(data.loc.name || "Not set", 11, { bold: true }) + 12, d.y, data.loc.coords, { size: 8.6, color: C.soft });
      d.y += 4;
      kv([["Unit base", rec.unitBase], ["Nearest hospital", rec.hospital], ["Weather", rec.weather]]);
      var sceneCount = plan.rows.filter(function(r){ return !r.brk; }).length;
      section("Scenes", sceneCount ? sceneCount + (sceneCount === 1 ? " scene" : " scenes") + " · " + (plan.total / 60).toFixed(1) + " hrs" : "");
      if (!plan.rows.length){ d.y += 12; d.text(d.M, d.y, "No scenes scheduled yet.", { size: 9, color: C.faint }); return; }
      return table(d, [{ key: "time", label: "Time", w: 8 }, { key: "num", label: "Sc", w: 6, bold: true }, { key: "name", label: "Scene", w: 40 },
        { key: "ie", label: "Int/Ext", w: 9 }, { key: "dn", label: "Day/Night", w: 10 }, { key: "loc", label: "Location", w: 22 }],
        plan.rows.map(function(r){
          if (r.brk) return { time: clock(r.time), num: "", name: r.brk.toUpperCase() + " · " + r.mins + " min", fill: C.band, muted: true };
          return { time: clock(r.time), num: r.scene.num, name: (r.scene.name || "—") + (r.scene.summary ? " — " + r.scene.summary : ""), ie: r.scene.intext, dn: r.scene.daynight, loc: r.loc, muted: r.done };
        }), { size: 8.6 });
    });
    chain = chain.then(function(){
      var cast = cs.cast.filter(function(c){ return c.character || c.actor; });
      section("Cast");
      if (!cast.length){ d.y += 12; d.text(d.M, d.y, "No cast yet.", { size: 9, color: C.faint }); return; }
      return table(d, [{ key: "i", label: "#", w: 4 }, { key: "character", label: "Character", w: 16, bold: true }, { key: "actor", label: "Actor", w: 16 },
        { key: "pickup", label: "Pickup", w: 8 }, { key: "pickedUpBy", label: "By", w: 12 }, { key: "toAddress", label: "To", w: 14 },
        { key: "wardrobe", label: "Wardrobe", w: 10 }, { key: "makeup", label: "Make-up", w: 10 }, { key: "onSet", label: "On set", w: 9 }],
        cast.map(function(c, i){ return Object.assign({ i: String(i + 1) }, c); }), { size: 8.4 });
    });
    chain = chain.then(function(){
      var crew = cs.crew.filter(function(c){ return String(c.name || "").trim(); });
      section("Crew");
      if (!crew.length){ d.y += 12; d.text(d.M, d.y, "No crew yet.", { size: 9, color: C.faint }); return; }
      var depts = (FP.CREW_DEPTS || []).slice(), byDept = {};
      crew.forEach(function(c){ var k = FP.crewDept(c); (byDept[k] = byDept[k] || []).push(c); if (depts.indexOf(k) === -1) depts.push(k); });
      var rows = [];
      depts.filter(function(k){ return byDept[k]; }).forEach(function(k){
        rows.push({ role: k.toUpperCase(), fill: C.band, bold: true, muted: false });
        byDept[k].forEach(function(c){ rows.push({ role: c.role, name: c.name, phone: c.phone, email: c.email, call: c.call || day.call }); });
      });
      return table(d, [{ key: "role", label: "Role", w: 24 }, { key: "name", label: "Name", w: 24, bold: true }, { key: "phone", label: "Phone", w: 18 },
        { key: "email", label: "Email", w: 24 }, { key: "call", label: "Call", w: 10 }], rows, { size: 8.6 });
    });
    chain = chain.then(function(){
      var rides = cs.transport.filter(function(t){ return t.who || t.passengers; });
      if (rides.length){
        section("Transport");
        return table(d, [{ key: "who", label: "Driver", w: 16, bold: true }, { key: "passengers", label: "Passengers", w: 24 }, { key: "from", label: "From", w: 16 },
          { key: "to", label: "To", w: 16 }, { key: "call", label: "Call", w: 8 }, { key: "note", label: "Note", w: 20 }], rides, { size: 8.6 });
      }
    });
    return chain.then(function(){
      if (rec.breakfast || rec.lunch || rec.wrap || rec.diet){
        section("Catering");
        kv([["Breakfast", rec.breakfast], ["Lunch", rec.lunch], ["Wrap", rec.wrap], ["Diets and allergies", rec.diet]]);
      }
      if (rec.notes){
        section("Notes");
        d.wrap(rec.notes, 9.2, d.W).forEach(function(l){ d.ensure(13); d.y += 13; d.text(d.M, d.y, l, { size: 9.2 }); });
      }
      if (sun){
        d.y += 18;
        d.ensure(14);
        d.text(d.M, d.y, "Sun times for " + (data.loc.name || "the location") + " on this date, from its coordinates.", { size: 7, color: C.faint });
      }
    });
  }

  FP.exports = {
    shotlist: function(){ return run("shotlist", "Shot list", false, shotlist); },
    breakdown: function(){ return run("breakdown", "Breakdown", true, breakdown); },
    schedule: function(){ return run("schedule", "Schedule", true, schedule); },
    callsheet: function(dayId){
      var id = dayId || (FP.pages.callsheet && FP.pages.callsheet.dayId && FP.pages.callsheet.dayId()) || "";
      return run("callsheet", "Callsheet", true, function(d, p){ return callsheet(d, p, id); });
    },
    // for tests: build without saving
    _build: function(kind){
      var p = FP.project(), fns = { shotlist: [shotlist, false], breakdown: [breakdown, true], schedule: [schedule, true], callsheet: [function(d, pp){ return callsheet(d, pp, ""); }, true] };
      return load().then(function(fonts){ return Doc(fonts, { portrait: fns[kind][1], project: p.name, kind: kind, title: p.name }).init(); })
        .then(function(d){ return Promise.resolve(fns[kind][0](d, p)).then(function(){ return d.finish(); }); });
    }
  };
})();
