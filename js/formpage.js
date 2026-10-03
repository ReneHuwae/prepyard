/* The shared machinery for pages that are mostly fields: Camera, Locations, Crew and the
   Callsheet. A field names the record it edits with data-coll / data-rec on an ancestor
   and its own key with data-k; the page's resolve(p, coll, rec) finds that record in the
   project. Typing writes straight through (one undo step per field burst) without a
   redraw; anything else redraws and puts the cursor back where it was. */
(function(){
  "use strict";
  var FP = window.FP;
  FP.pages = FP.pages || {};

  FP.formPage = function(name, def){
    var H = null, selfTyping = false;

    function ctx(el){
      var recEl = el.closest("[data-rec]");
      var collEl = el.closest("[data-coll]");
      return { coll: collEl && collEl.getAttribute("data-coll"), rec: recEl ? recEl.getAttribute("data-rec") : "",
        k: el.getAttribute("data-k") };
    }
    function draw(p){
      H.innerHTML = def.html(p);
      H.querySelectorAll("textarea.grow").forEach(autoGrow);
      if (def.drawn) def.drawn(H, p);
    }
    function autoGrow(ta){ ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
    function sel(c){
      return '[data-coll="' + c.coll + '"]' + (c.rec ? ' [data-rec="' + c.rec + '"]' : "") + ' [data-k="' + c.k + '"]';
    }
    function redraw(p){
      var a = document.activeElement, keep = null;
      if (a && H.contains(a) && a.hasAttribute("data-k")) keep = Object.assign(ctx(a), { s: a.selectionStart, e: a.selectionEnd });
      var y = window.scrollY;
      draw(p);
      window.scrollTo(0, y);
      if (!keep) return;
      var el = H.querySelector(sel(keep));
      if (!el) return;
      el.focus({ preventScroll: true });
      try { if (keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch (err){}
    }
    function valueOf(el){
      if (el.type === "checkbox") return el.checked;
      if (el.type === "number") return el.value === "" ? "" : +el.value;
      return el.value;
    }
    function write(el, typing){
      var c = ctx(el);
      if (!c.coll || !c.k) return;
      var v = valueOf(el);
      var fn = function(p){
        var rec = def.resolve(p, c.coll, c.rec);
        if (!rec) return;
        if (def.set) def.set(p, rec, c, v); else rec[c.k] = v;
      };
      if (typing){
        selfTyping = true;
        try { FP.change(fn, name + ":" + c.coll + ":" + c.rec + ":" + c.k); } finally { selfTyping = false; }
        if (def.typed) def.typed(H, FP.project(), c, el);
      } else {
        FP.change(fn);
      }
    }
    var api = {
      render: function(host, p){
        H = host;
        if (def.before) def.before(p);
        draw(p);
        host.addEventListener("input", function(e){
          var el = e.target;
          if (!el.hasAttribute || !el.hasAttribute("data-k")) return;
          if (el.tagName === "TEXTAREA" && el.classList.contains("grow")) autoGrow(el);
          if (el.type === "checkbox" || el.tagName === "SELECT" || el.type === "file") return;
          write(el, true);
        });
        host.addEventListener("change", function(e){
          var el = e.target;
          if (!el.hasAttribute || !el.hasAttribute("data-k")) return;
          if (el.type === "checkbox" || el.tagName === "SELECT") write(el, false);
          if (def.committed) def.committed(el, ctx(el));
        });
        host.addEventListener("focusin", function(e){
          var el = e.target;
          if (def.focused && el.hasAttribute && el.hasAttribute("data-k")) def.focused(el, ctx(el));
        });
        host.addEventListener("click", function(e){
          var b = e.target.closest("[data-act]");
          if (!b || !H.contains(b)) return;
          var fn = def.actions && def.actions[b.getAttribute("data-act")];
          if (!fn) return;
          if (b.getAttribute("data-menu") !== null) e.stopPropagation();
          fn(b, ctx(b), e);
        });
        if (def.bind) def.bind(host);
      },
      update: function(host, p){
        if (!H) return;
        if (selfTyping) return;
        redraw(p);
      },
      leave: function(){ if (def.leave) def.leave(); H = null; },
      host: function(){ return H; },
      redraw: function(){ if (H) redraw(FP.project()); }
    };
    Object.keys(def.api || {}).forEach(function(k){ api[k] = def.api[k]; });
    FP.pages[name] = api;
    return api;
  };

  // small helpers the field pages share
  FP.field = function(label, inner, cls){
    return '<label class="fld' + (cls ? " " + cls : "") + '"><span>' + FP.esc(label) + '</span>' + inner + '</label>';
  };
  FP.input = function(k, v, attrs){
    return '<input data-k="' + k + '" value="' + FP.esc(v == null ? "" : v) + '" autocomplete="off"' + (attrs ? " " + attrs : "") + '>';
  };
  FP.parseCoords = function(str){
    var m = String(str || "").match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
    return m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : null;
  };
})();
