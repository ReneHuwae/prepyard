// Cloudflare Worker: serves Filmprep's files as they are, except js/config.js, which carries
// settings kept in Cloudflare rather than in the code. MAPBOX_TOKEN (or "Mapbox") is a secret set under
// Workers & Pages > filmprep > Settings > Variables and Secrets.
export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (url.pathname === "/js/config.js"){
      const body = "window.FP_MAPBOX_TOKEN = window.FP_MAPBOX_TOKEN || " + JSON.stringify(env.MAPBOX_TOKEN || env.Mapbox || env.MAPBOX || "") + ";\n";
      return new Response(body, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
    }
    return env.ASSETS.fetch(request);
  }
};
