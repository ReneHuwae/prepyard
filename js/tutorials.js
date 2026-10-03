/* Tutorials: short videos on Vimeo, opened from the home screen.
   To add one, put an entry in the list below. "vimeo" takes the video's page link
   (https://vimeo.com/123456789, or https://vimeo.com/123456789/abcdef for an unlisted one)
   or just its number. Videos show in this order. */
(function(){
  "use strict";
  var FP = window.FP;

  FP.TUTORIALS = [
    // { title: "Getting started", vimeo: "https://vimeo.com/123456789", text: "Import a script and make your first shot list." },
  ];

  function esc(s){ return FP.esc(s); }
  // https://vimeo.com/123 · vimeo.com/123/abcd · player.vimeo.com/video/123?h=abcd · 123
  function embedUrl(v){
    var s = String(v || "").trim(), m = s.match(/(?:video\/|vimeo\.com\/)?(\d{5,})(?:\/([0-9a-f]{6,}))?/i);
    if (!m) return "";
    var hash = m[2] || (s.match(/[?&]h=([0-9a-f]+)/i) || [])[1];
    return "https://player.vimeo.com/video/" + m[1] + "?" + (hash ? "h=" + hash + "&" : "") + "dnt=1&title=0&byline=0&portrait=0";
  }
  FP.vimeoEmbedUrl = embedUrl;

  function render(){
    var list = FP.TUTORIALS.filter(function(t){ return embedUrl(t.vimeo); });
    var grid = document.getElementById("tutGrid");
    if (!list.length){
      grid.innerHTML = '<p class="tut-empty">The first tutorials are on their way. Check back soon.</p>';
      return;
    }
    grid.innerHTML = list.map(function(t, i){
      return '<article class="tut-card">' +
        '<div class="tut-video"><iframe src="' + esc(embedUrl(t.vimeo)) + '" loading="lazy" title="' + esc(t.title || "Tutorial") + '"' +
          ' allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>' +
        '<div class="tut-body"><span class="tut-num">' + (i + 1 < 10 ? "0" : "") + (i + 1) + '</span>' +
          '<div><h3>' + esc(t.title || "Untitled") + '</h3>' + (t.text ? '<p>' + esc(t.text) + '</p>' : "") + '</div></div>' +
      '</article>';
    }).join("");
  }

  function show(on){
    document.getElementById("homeProjects").hidden = on;
    document.getElementById("homeTutorials").hidden = !on;
    document.getElementById("homeTutorialsBtn").classList.toggle("on", on);
    // stop any playing video when leaving
    document.getElementById("tutGrid").innerHTML = "";
    if (on) render();
    window.scrollTo(0, 0);
  }
  FP.showTutorials = show;
  document.getElementById("homeTutorialsBtn").addEventListener("click", function(){ show(true); });
  document.getElementById("tutBack").addEventListener("click", function(){ show(false); });
})();
