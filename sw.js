const CACHE="printelly-client-v47";
const ASSETS=["./","./index.html","./styles.css","./background-remover.css","./app.js","./background-removal-api.js","./studio-billing-api.js","./studio-credit-badge.js","./background-color-selection.js","./background-quality.js","./background-print-export.js","./background-remover.js","./background-studio/","./background-studio/index.html","./background-studio/standalone.css","./studio-packs/","./studio-packs/index.html","./studio-packs/styles.css","./studio-packs/app.js","./studio-admin/","./studio-admin/index.html","./studio-admin/styles.css","./studio-admin/app.js","./manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
