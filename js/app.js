/* Filmprep app shell: home screen, header, page tabs, settings, project files.
   Pages register themselves in FP.pages; any page not rebuilt yet shows what the
   project holds for it, so nothing looks lost while the rebuild is in progress. */
(function(){
  "use strict";
  var FP = window.FP;

  // ---------- small helpers ----------
  function $(id){ return document.getElementById(id); }
  var esc = FP.esc = function(s){
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function lsGet(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e){} }

  var toastTimer = null;
  var toast = FP.toast = function(msg, ms){
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.hidden = true; }, ms || 3000);
  };

  function relativeTime(iso){
    if (!iso) return "";
    var d = new Date(iso).getTime();
    if (isNaN(d)) return "";
    var s = Math.max(0, Math.round((Date.now() - d) / 1000));
    if (s < 45) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var days = Math.round(h / 24);
    if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
    return "on " + new Date(iso).toLocaleDateString();
  }

  function slugForFile(name){
    return String(name || "project").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  }
  // Inside a claude.ai artifact the page can't start a download itself; the
  // downloads capability asks the viewer instead. Resolves true when saved.
  var downloadsCap = (window.claude && typeof window.claude.use === "function")
    ? window.claude.use("downloads").catch(function(){ return null; })
    : Promise.resolve(null);
  function download(filename, text, mime){
    return downloadsCap.then(function(cap){
      if (!cap){ browserDownload(filename, text, mime); return true; }
      return cap.save({ filename: filename, data: text }).then(function(){ return true; }, function(err){
        if (err && err.code === "declined") return false;
        if (err && err.code === "rate_limited") toast("A save is already waiting for your answer.");
        else toast("This view can't save files.");
        return false;
      });
    });
  }
  // where the "classic version" links go; an artifact build points this at the classic artifact
  FP.CLASSIC_URL = window.FP_CLASSIC_URL || "classic/";
  function browserDownload(filename, text, mime){
    var blob = new Blob([text], { type: mime || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
  function isEditable(el){
    return !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
  }

  // ---------- popover menus ----------
  var openMenuEl = null;
  function closeMenu(){ if (openMenuEl){ openMenuEl.remove(); openMenuEl = null; } }
  // items: { label, hint, onClick, disabled, danger, confirm } | "sep" | { heading }
  var openMenu = FP.openMenu = function(anchor, items, opts){
    closeMenu();
    opts = opts || {};
    var menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    items.forEach(function(it){
      if (it === "sep"){ menu.insertAdjacentHTML("beforeend", '<div class="menu-sep"></div>'); return; }
      if (it.heading){ menu.insertAdjacentHTML("beforeend", '<div class="menu-label">' + esc(it.heading) + '</div>'); return; }
      var b = document.createElement("button");
      b.type = "button";
      b.className = "menu-item" + (it.danger ? " danger" : "");
      b.setAttribute("role", "menuitem");
      b.innerHTML = '<span>' + esc(it.label) + '</span>' + (it.hint ? '<span class="hint">' + esc(it.hint) + '</span>' : "");
      if (it.disabled) b.disabled = true;
      var armed = false;
      b.addEventListener("click", function(e){
        e.stopPropagation();
        if (it.confirm && !armed){
          armed = true;
          b.classList.add("armed");
          b.firstChild.textContent = it.confirm;
          return;
        }
        closeMenu();
        if (it.onClick) it.onClick();
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    var w = menu.offsetWidth;
    var left = opts.alignRight ? r.right - w : r.left;
    menu.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + "px";
    menu.style.top = Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + "px";
    openMenuEl = menu;
    var first = menu.querySelector(".menu-item:not([disabled])");
    if (first) first.focus();
    return menu;
  };
  document.addEventListener("click", function(e){ if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape"){ closeMenu(); closeModal(); } });
  window.addEventListener("resize", closeMenu);

  // ---------- modal ----------
  var modalOnClose = null;
  function closeModal(){
    var host = $("modalHost");
    if (!host.firstChild) return;
    host.innerHTML = "";
    if (modalOnClose){ var f = modalOnClose; modalOnClose = null; f(); }
  }
  FP.closeModal = closeModal;
  var openModal = FP.openModal = function(title, bodyHTML, onClose){
    closeMenu();
    $("modalHost").innerHTML =
      '<div class="modal-backdrop" data-modal-backdrop><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="btn ghost" type="button" data-modal-close>Close</button></div>' +
        '<div class="modal-body">' + bodyHTML + '</div>' +
      '</div></div>';
    modalOnClose = onClose || null;
    var host = $("modalHost");
    host.querySelector("[data-modal-close]").addEventListener("click", closeModal);
    host.querySelector("[data-modal-backdrop]").addEventListener("mousedown", function(e){
      if (e.target === e.currentTarget) closeModal();
    });
    return host.querySelector(".modal-body");
  };

  // ---------- home ----------
  var homeTimer = null;

  function showHome(){
    $("editor").hidden = true;
    $("home").hidden = false;
    document.title = "Filmprep";
    renderHome();
    clearInterval(homeTimer);
    homeTimer = setInterval(renderHome, 60000);
  }

  function renderHome(){
    return FP.storage.list().then(function(list){
      var grid = $("homeGrid");
      var html = '<div class="home-card new"><button class="open" type="button" data-action="new"><span class="plus">+</span>New project</button></div>';
      list.forEach(function(p){
        html += '<div class="home-card" data-id="' + esc(p.id) + '">' +
          '<button class="open" type="button" data-action="open">' +
            '<span class="hc-name">' + esc(p.name || "Untitled project") + '</span>' +
            '<span class="hc-meta">Edited ' + esc(relativeTime(p.updatedAt)) + '</span>' +
          '</button>' +
          '<button class="hc-menu" type="button" data-action="menu" title="Rename, duplicate or delete" aria-label="Project options">⋯</button>' +
        '</div>';
      });
      grid.innerHTML = html;
    });
  }

  $("homeGrid").addEventListener("click", function(e){
    var b = e.target.closest("[data-action]");
    if (!b) return;
    var card = b.closest(".home-card");
    var id = card && card.dataset.id;
    if (b.dataset.action === "new") createProject();
    else if (b.dataset.action === "open") openProject(id);
    else if (b.dataset.action === "menu"){
      e.stopPropagation();
      openMenu(b, [
        { label: "Rename", onClick: function(){ renameOnHome(card, id); } },
        { label: "Duplicate", onClick: function(){ duplicateProject(id); } },
        "sep",
        { label: "Delete…", danger: true, confirm: "Click again to delete", onClick: function(){
          FP.storage.remove(id).then(renderHome).then(function(){ toast("Project deleted."); });
        } }
      ], { alignRight: true });
    }
  });

  function renameOnHome(card, id){
    var nameEl = card.querySelector(".hc-name");
    var original = nameEl.textContent;
    nameEl.contentEditable = "true";
    nameEl.focus();
    var r = document.createRange(); r.selectNodeContents(nameEl);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    var done = false;
    function finish(save){
      if (done) return;
      done = true;
      nameEl.contentEditable = "false";
      var v = nameEl.textContent.replace(/\s+/g, " ").trim() || original;
      nameEl.textContent = v;
      if (save && v !== original) FP.storage.rename(id, v).then(renderHome);
    }
    nameEl.addEventListener("blur", function(){ finish(true); }, { once: true });
    nameEl.addEventListener("keydown", function(ev){
      if (ev.key === "Enter"){ ev.preventDefault(); nameEl.blur(); }
      else if (ev.key === "Escape"){ ev.stopPropagation(); nameEl.textContent = original; finish(false); }
    });
    // a click on the name while renaming shouldn't open the project
    nameEl.closest(".open").addEventListener("click", function(ev){ if (!done) ev.stopPropagation(); }, { capture: true, once: true });
  }

  function uniqueName(base){
    return FP.storage.list().then(function(list){
      var names = list.map(function(p){ return p.name; });
      var name = base, n = 2;
      while (names.indexOf(name) !== -1){ name = base + " " + n; n++; }
      return name;
    });
  }
  function createProject(){
    uniqueName("Untitled project").then(function(name){
      var id = FP.newProjectId();
      var p = FP.blankProject(name);
      return FP.storage.save(id, p).then(function(){ enterProject(id, p, "script"); });
    });
  }
  function duplicateProject(id){
    FP.storage.load(id).then(function(p){
      if (!p) return;
      p.name = p.name + " (Copy)";
      return FP.storage.save(FP.newProjectId(), p).then(renderHome).then(function(){ toast("Project duplicated."); });
    });
  }
  function openProject(id){
    FP.storage.load(id).then(function(p){
      if (!p){ toast("That project couldn't be found."); renderHome(); return; }
      enterProject(id, p);
    }, function(){ toast("That project couldn't be opened."); });
  }

  // reading a project file from disk, from the home screen or the editor
  function readProjectFile(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){
        var data;
        try { data = JSON.parse(reader.result); } catch (e){ data = null; }
        var p = data ? FP.projectFromFile(data) : null;
        if (p) resolve(p); else reject(new Error("not a project file"));
      };
      reader.onerror = function(){ reject(reader.error); };
      reader.readAsText(file);
    });
  }
  $("homeOpenFile").addEventListener("click", function(){ $("homeOpenFileInput").click(); });
  $("homeOpenFileInput").addEventListener("change", function(){
    var input = this, file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    readProjectFile(file).then(function(p){
      var id = FP.newProjectId();
      return FP.storage.save(id, p).then(function(){ enterProject(id, p); toast("Project opened."); });
    }, function(){ toast("That file isn't a Filmprep project."); });
  });

  // ---------- editor ----------
  var currentPage = "script";
  var MORE_PAGES = ["camera", "locations", "sun", "crew"];

  function enterProject(id, project, page){
    FP.openSession(id, project);
    clearInterval(homeTimer);
    $("home").hidden = true;
    $("editor").hidden = false;
    currentPage = page || lsGet("filmprep:lastPage:" + id) || "script";
    if (!FP.pages[currentPage]) currentPage = "script";
    renderHeader();
    renderSaveMeta();
    showPage(currentPage);
    window.scrollTo(0, 0);
  }
  function leaveProject(){
    var page = FP.pages[currentPage];
    if (page && page.leave) page.leave();
    $("page").innerHTML = "";
    FP.closeSession();
    showHome();
  }
  $("goHome").addEventListener("click", leaveProject);

  function renderHeader(){
    var p = FP.project();
    if (!p) return;
    var nameEl = $("projName");
    if (nameEl.contentEditable !== "true") nameEl.textContent = p.name;
    document.title = p.name + " · Filmprep";
  }

  // rename in the header
  (function(){
    var nameEl = $("projName");
    var original = "";
    function begin(){
      if (nameEl.contentEditable === "true") return;
      original = nameEl.textContent;
      nameEl.contentEditable = "true";
      nameEl.focus();
      var r = document.createRange(); r.selectNodeContents(nameEl);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    function commit(save){
      if (nameEl.contentEditable !== "true") return;
      nameEl.contentEditable = "false";
      var v = nameEl.textContent.replace(/\s+/g, " ").trim();
      if (!save || !v){ nameEl.textContent = original; return; }
      if (v !== original) FP.change(function(p){ p.name = v; }, "project-name");
      renderHeader();
    }
    nameEl.addEventListener("click", begin);
    nameEl.addEventListener("keydown", function(e){
      if (nameEl.contentEditable !== "true"){
        if (e.key === "Enter" || e.key === " "){ e.preventDefault(); begin(); }
        return;
      }
      if (e.key === "Enter"){ e.preventDefault(); commit(true); nameEl.blur(); }
      else if (e.key === "Escape"){ e.stopPropagation(); commit(false); nameEl.blur(); }
    });
    nameEl.addEventListener("blur", function(){ commit(true); });
  })();

  // undo / redo
  function pulse(el){ el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
  $("undoBtn").addEventListener("click", function(){ if (FP.canUndo()){ FP.undo(); pulse(this); } });
  $("redoBtn").addEventListener("click", function(){ if (FP.canRedo()){ FP.redo(); pulse(this); } });
  FP.on("history", function(){
    $("undoBtn").disabled = !FP.canUndo();
    $("redoBtn").disabled = !FP.canRedo();
  });
  document.addEventListener("keydown", function(e){
    if (!FP.project() || $("editor").hidden) return;
    var mod = e.metaKey || e.ctrlKey;
    if (!mod || isEditable(e.target)) return;
    var k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey){ e.preventDefault(); if (FP.canUndo()){ FP.undo(); pulse($("undoBtn")); } }
    else if ((k === "z" && e.shiftKey) || k === "y"){ e.preventDefault(); if (FP.canRedo()){ FP.redo(); pulse($("redoBtn")); } }
  });

  // save status in the header
  function renderSaveMeta(){
    var el = $("saveMeta");
    var s = FP.saveState;
    el.classList.toggle("is-error", s.status === "error");
    if (!FP.storageAvailable){
      el.textContent = "Not stored in this browser";
      el.title = "This browser isn't letting Filmprep keep projects. Use Save project file to keep your work.";
      el.classList.add("is-error");
      return;
    }
    el.title = "";
    if (s.status === "pending" || s.status === "saving") el.textContent = "Saving…";
    else if (s.status === "error") el.textContent = "Not saved — storage full?";
    else if (s.at) el.textContent = "Saved " + relativeTime(s.at.toISOString());
    else el.textContent = "All changes saved";
  }
  FP.on("save", renderSaveMeta);
  setInterval(function(){ if (!$("editor").hidden) renderSaveMeta(); }, 30000);

  FP.on("change", function(info){
    renderHeader();
    var page = FP.pages[currentPage];
    if (page && page.update) page.update($("page"), FP.project(), info);
    else renderPage();
  });

  // ---------- page tabs ----------
  FP.currentPage = function(){ return $("editor").hidden ? null : currentPage; };
  FP.showPage = function(name){ showPage(name); };
  function showPage(name){
    if (!FP.pages[name]) return;
    var prev = FP.pages[currentPage];
    if (prev && prev.leave && currentPage !== name) prev.leave();
    currentPage = name;
    var id = FP.projectId();
    if (id) lsSet("filmprep:lastPage:" + id, name);
    var inMore = MORE_PAGES.indexOf(name) !== -1;
    Array.prototype.forEach.call(document.querySelectorAll("#tabbar [data-page], #moredrop [data-page]"), function(b){
      b.classList.toggle("active", b.dataset.page === name);
      if (b.dataset.page === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("moreBtn").classList.toggle("active", inMore);
    setMoreOpen(inMore);
    renderPage();
  }
  function renderPage(){
    var page = FP.pages[currentPage];
    var host = $("page");
    host.innerHTML = "";
    page.render(host, FP.project());
  }
  function setMoreOpen(open){
    $("moredrop").hidden = !open;
    $("moreBtn").setAttribute("aria-expanded", open ? "true" : "false");
    $("moreBtn").querySelector(".car").textContent = open ? "▴" : "▾";
  }
  $("tabbar").addEventListener("click", function(e){
    var b = e.target.closest("[data-page]");
    if (b){ showPage(b.dataset.page); return; }
    if (e.target.closest("#moreBtn")){
      var inMore = MORE_PAGES.indexOf(currentPage) !== -1;
      if (inMore) return;                       // a More page is showing; its strip stays
      setMoreOpen($("moredrop").hidden);
    }
  });
  $("moredrop").addEventListener("click", function(e){
    var b = e.target.closest("[data-page]");
    if (b) showPage(b.dataset.page);
  });

  // ---------- project file, export, settings ----------
  function saveProjectFile(){
    var p = FP.project();
    if (!p) return;
    download(slugForFile(p.name) + ".filmprep.json", FP.projectFileJSON(p), "application/json").then(function(saved){
      if (saved) toast("Project file saved to your downloads.");
    });
  }
  $("shareBtn").addEventListener("click", saveProjectFile);

  $("exportBtn").addEventListener("click", function(e){
    e.stopPropagation();
    openMenu(this, [
      { label: "Project file", hint: ".json", onClick: saveProjectFile },
      "sep",
      { heading: "PDF" },
      { label: "Shotlist", hint: "returns in phase 5", disabled: true },
      { label: "Breakdown", hint: "returns in phase 5", disabled: true },
      { label: "Schedule", hint: "returns in phase 5", disabled: true },
      { label: "Callsheet", hint: "returns in phase 5", disabled: true }
    ], { alignRight: true });
  });

  // Settings: the look of the app (this browser) and the project's dropdown lists.
  var THEME_KEY = "filmprep:theme";
  function applyTheme(t){
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  applyTheme(lsGet(THEME_KEY));

  var PREF_COLS = [
    { key: "size", label: "Size" }, { key: "shotType", label: "Shot type" }, { key: "grip", label: "Grip" },
    { key: "movement", label: "Movement" }, { key: "special", label: "Special" }, { key: "sub", label: "Sub" }
  ];
  function prefFor(p, col){
    var o = p.optionPrefs[col];
    return { hidden: (o && Array.isArray(o.hidden)) ? o.hidden : [], custom: (o && Array.isArray(o.custom)) ? o.custom : [] };
  }
  FP.visibleOptions = function(p, col){
    var pr = prefFor(p, col);
    return (FP.OPTIONS[col] || []).concat(pr.custom).filter(function(o){ return o === "" || pr.hidden.indexOf(o) === -1; });
  };

  var prefCol = "size";
  function openSettings(){
    var body = openModal("Settings", "");
    function draw(){
      var p = FP.project();
      var theme = lsGet(THEME_KEY) || "system";
      var pr = prefFor(p, prefCol);
      var opts = (FP.OPTIONS[prefCol] || []).concat(pr.custom).filter(function(o){ return o !== ""; });
      body.innerHTML =
        '<div class="field-label">Appearance on this device</div>' +
        '<div><div class="seg" role="group" aria-label="Appearance">' +
          ["system", "light", "dark"].map(function(t){
            return '<button type="button" data-theme-set="' + t + '" class="' + (theme === t ? "on" : "") + '">' +
              (t === "system" ? "Match system" : t.charAt(0).toUpperCase() + t.slice(1)) + '</button>';
          }).join("") +
        '</div></div>' +
        '<div class="field-label" style="margin-top:6px">Dropdown lists in this project</div>' +
        '<p>Pick a list, then click an option to hide it from the dropdowns. Shots that already use a hidden option keep it.</p>' +
        '<div class="pref-cols">' + PREF_COLS.map(function(c){
          return '<button type="button" data-pref-col="' + c.key + '" class="' + (c.key === prefCol ? "on" : "") + '">' + esc(c.label) + '</button>';
        }).join("") + '</div>' +
        '<div class="pref-opts">' + opts.map(function(o){
          var custom = pr.custom.indexOf(o) !== -1;
          var off = pr.hidden.indexOf(o) !== -1;
          return '<button type="button" class="pref-opt' + (off ? " off" : "") + '" data-pref-opt="' + esc(o) + '" title="' +
            (custom ? "Click to remove this option" : (off ? "Hidden — click to show" : "Click to hide")) + '">' +
            esc(o) + (custom ? ' <span class="x" aria-hidden="true">×</span>' : "") + '</button>';
        }).join("") + '</div>' +
        '<form class="pref-add" id="prefAddForm"><input type="text" id="prefAddInput" placeholder="Add your own option…" aria-label="New option">' +
          '<button class="btn ghost" type="submit">Add</button></form>';
    }
    body.addEventListener("click", function(e){
      var t = e.target.closest("[data-theme-set]");
      if (t){
        var v = t.dataset.themeSet;
        lsSet(THEME_KEY, v);
        applyTheme(v);
        draw();
        return;
      }
      var c = e.target.closest("[data-pref-col]");
      if (c){ prefCol = c.dataset.prefCol; draw(); return; }
      var o = e.target.closest("[data-pref-opt]");
      if (o){
        var val = o.dataset.prefOpt;
        FP.change(function(p){
          var pr = p.optionPrefs[prefCol] = prefFor(p, prefCol);
          if (pr.custom.indexOf(val) !== -1){
            pr.custom = pr.custom.filter(function(x){ return x !== val; });
          } else if (pr.hidden.indexOf(val) !== -1){
            pr.hidden = pr.hidden.filter(function(x){ return x !== val; });
          } else {
            pr.hidden = pr.hidden.concat([val]);
          }
        });
        draw();
      }
    });
    body.addEventListener("submit", function(e){
      e.preventDefault();
      var input = body.querySelector("#prefAddInput");
      var v = input.value.replace(/\s+/g, " ").trim();
      if (!v) return;
      var exists = (FP.OPTIONS[prefCol] || []).concat(prefFor(FP.project(), prefCol).custom).some(function(x){
        return x.toLowerCase() === v.toLowerCase();
      });
      if (exists){ toast("That option is already in the list."); return; }
      FP.change(function(p){
        var pr = p.optionPrefs[prefCol] = prefFor(p, prefCol);
        pr.custom = pr.custom.concat([v]);
      });
      draw();
      body.querySelector("#prefAddInput").focus();
    });
    draw();
  }
  $("settingsBtn").addEventListener("click", openSettings);

  // ---------- pages not rebuilt yet ----------
  FP.pages = FP.pages || {};

  function countMapItems(map){
    var n = 0;
    Object.keys(map || {}).forEach(function(k){ if (Array.isArray(map[k])) n += map[k].length; });
    return n;
  }
  function sceneRows(p){
    if (!p.scenes.length) return '<div class="empty">No scenes yet.</div>';
    return p.scenes.map(function(s){
      var meta = [s.intext, s.daynight].filter(Boolean).join(" · ");
      return '<div class="row"><span class="k">Sc ' + esc(s.num) + '</span>' +
        '<span class="v">' + esc(s.name || "Untitled scene") + '<small>' + esc(meta) + (s.summary ? " — " + esc(s.summary) : "") + '</small></span>' +
        '<span class="n">' + s.shots.length + (s.shots.length === 1 ? " shot" : " shots") + '</span></div>';
    }).join("");
  }
  function scriptHeadings(p){
    if (!p.script.html) return 0;
    var t = document.createElement("template");
    t.innerHTML = p.script.html;
    return t.content.querySelectorAll(".sp-scene").length;
  }
  function prettyDate(iso){
    if (!iso) return "No date set";
    var d = new Date(iso + "T12:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  var PENDING = {
    script: { title: "Script", phase: 2, summary: function(p){
      if (!p.script.html) return { count: "No script yet", body: '<div class="empty">No script imported yet.</div>' };
      var n = scriptHeadings(p);
      return { count: (p.script.mode === "treatment" ? "Treatment" : "Screenplay"),
        body: '<div class="row"><span class="k">Script</span><span class="v">Imported as a ' +
          (p.script.mode === "treatment" ? "treatment" : "screenplay") + '<small>' + n + (n === 1 ? " scene heading" : " scene headings") +
          (p.script.drawHTML ? ", with drawings" : "") + '</small></span><span class="n"></span></div>' };
    } },
    shotlist: { title: "Shot list", phase: 3, summary: function(p){
      var shots = FP.countShots(p);
      return { count: shots + (shots === 1 ? " shot, " : " shots, ") + p.scenes.length + (p.scenes.length === 1 ? " scene" : " scenes"), body: sceneRows(p) };
    } },
    breakdown: { title: "Breakdown", phase: 4, summary: function(p){
      return { count: p.scenes.length + (p.scenes.length === 1 ? " scene" : " scenes"), body: sceneRows(p) };
    } },
    schedule: { title: "Schedule", phase: 4, summary: function(p){
      var days = p.schedule.days;
      return { count: days.length + (days.length === 1 ? " shooting day" : " shooting days"),
        body: days.length ? days.map(function(d, i){
          var shots = d.rows.filter(function(r){ return r.type === "shot"; }).length;
          var breaks = d.rows.filter(function(r){ return r.type === "break"; }).length;
          return '<div class="row"><span class="k">Day ' + (i + 1) + '</span><span class="v">' + esc(prettyDate(d.date)) +
            '<small>Call ' + esc(d.call) + '</small></span><span class="n">' + shots + " shots, " + breaks + (breaks === 1 ? " break" : " breaks") + '</span></div>';
        }).join("") : '<div class="empty">No shooting days yet.</div>' };
    } },
    floorplan: { title: "Floor plan", phase: 5, summary: function(p){
      var f = p.floorplan;
      var parts = [["walls", f.walls], ["doors and windows", f.doors], ["shapes", f.shapes], ["camera positions", f.cams], ["props", f.props]]
        .map(function(x){ return countMapItems(x[1]) + " " + x[0]; });
      return { count: Object.keys(f.walls || {}).length + " floor plans",
        body: '<div class="row"><span class="k">Drawn</span><span class="v">' + esc(parts.join(", ")) + '</span><span class="n"></span></div>' };
    } },
    callsheet: { title: "Callsheet", phase: 5, summary: function(p){
      var c = p.callsheet;
      return { count: p.schedule.days.length + (p.schedule.days.length === 1 ? " day" : " days"),
        body: [["Crew", c.crew.length], ["Cast", c.cast.length], ["Transport", c.transport.length]].map(function(x){
          return '<div class="row"><span class="k">' + x[0] + '</span><span class="v">' + x[1] + (x[1] === 1 ? " entry" : " entries") + '</span><span class="n"></span></div>';
        }).join("") };
    } },
    camera: { title: "Camera and lenses", phase: 5, summary: function(p){
      var rows = p.cameras.map(function(c){
        return '<div class="row"><span class="k">Camera</span><span class="v">' + esc([c.brand, c.model].filter(Boolean).join(" ")) + '</span><span class="n"></span></div>';
      }).concat(p.lensSets.map(function(s){
        return '<div class="row"><span class="k">Lenses</span><span class="v">' + esc([s.brand, s.series].filter(Boolean).join(" ") || "Lens set") +
          '<small>' + esc(s.lenses.map(function(l){ return l.name; }).filter(Boolean).join(", ")) + '</small></span>' +
          '<span class="n">' + s.lenses.length + (s.lenses.length === 1 ? " lens" : " lenses") + '</span></div>';
      }));
      return { count: p.cameras.length + (p.cameras.length === 1 ? " camera" : " cameras"),
        body: rows.join("") || '<div class="empty">No cameras or lenses yet.</div>' };
    } },
    locations: { title: "Locations", phase: 5, summary: function(p){
      return { count: p.locations.length + (p.locations.length === 1 ? " location" : " locations"),
        body: p.locations.map(function(l){
          return '<div class="row"><span class="k">Location</span><span class="v">' + esc(l.name || "Unnamed") +
            (l.coords ? '<small>' + esc(l.coords) + '</small>' : "") + '</span><span class="n">' +
            (l.sunpath.length ? "Sun path saved" : "") + '</span></div>';
        }).join("") || '<div class="empty">No locations yet.</div>' };
    } },
    sun: { title: "Sun path", phase: 5, summary: function(p){
      var s = p.sun;
      return { count: s.lat && s.lon ? "Position set" : "No position set",
        body: '<div class="row"><span class="k">Position</span><span class="v">' +
          (s.lat && s.lon ? esc(s.lat + ", " + s.lon) : "Not set") + (s.date ? '<small>' + esc(prettyDate(s.date)) + '</small>' : "") +
          '</span><span class="n"></span></div>' };
    } },
    crew: { title: "Crew", phase: 5, summary: function(p){
      var crew = p.callsheet.crew;
      return { count: crew.length + (crew.length === 1 ? " person" : " people"),
        body: crew.map(function(c){
          return '<div class="row"><span class="k">' + esc(c.dept || "Crew") + '</span><span class="v">' + esc(c.name || "Unnamed") +
            '<small>' + esc(c.role) + '</small></span><span class="n"></span></div>';
        }).join("") || '<div class="empty">No crew yet.</div>' };
    } }
  };

  Object.keys(PENDING).forEach(function(name){
    if (FP.pages[name]) return;
    var def = PENDING[name];
    FP.pages[name] = {
      render: function(host, p){
        var s = def.summary(p);
        host.innerHTML =
          '<div class="workwindow">' +
            '<div class="pg-toolbar"><div class="left"><h3>' + esc(def.title) + '</h3><span class="count">' + esc(s.count) + '</span></div></div>' +
            '<div class="pending">' +
              '<div class="pending-eyebrow">Being rebuilt, phase ' + def.phase + '</div>' +
              '<p>This page comes back in the new design in phase ' + def.phase + ' of the rebuild. Everything the project holds for it is kept, listed below. ' +
              'To work on it now, use the <a href="' + esc(FP.CLASSIC_URL) + '" target="_blank" rel="noopener">classic version</a>.</p>' +
              '<div class="datalist">' + s.body + '</div>' +
            '</div>' +
          '</div>';
      }
    };
  });

  // ---------- boot ----------
  var classicLink = $("classicLink");
  if (classicLink) classicLink.href = FP.CLASSIC_URL;
  FP.storage.init()
    .then(function(){ return FP.importClassicProjects().catch(function(){ return 0; }); })
    .then(function(imported){
      $("boot").hidden = true;
      if (imported){
        var n = $("homeNotice");
        n.textContent = "Brought over " + imported + (imported === 1 ? " project" : " projects") +
          " from the classic version. The originals are still there, untouched.";
        n.hidden = false;
      }
      if (!FP.storageAvailable){
        var w = $("homeNotice");
        w.textContent = "This browser isn't letting Filmprep keep projects between visits (a private window does this). " +
          "Your work lasts until you close the tab, so use Save project file to keep it.";
        w.hidden = false;
      }
      showHome();
    });
})();
