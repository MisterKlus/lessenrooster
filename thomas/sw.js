const CACHE='lessenrooster-thomas-mupjm76f';
const FILES=["./","index.html","manifest.webmanifest","../icons/favicon-48.png","../icons/icon-192.png","../icons/icon-512.png","../icons/icon-maskable-512.png","../icons/apple-touch-icon.png"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
// Oude versies opruimen (ook de oude naam zonder persoon), niet die van de andere roosters
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&(key.startsWith('lessenrooster-thomas-')||/^lessenrooster-[^-]+$/.test(key))).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
 // no-cache: altijd bij GitHub nagaan of er een nieuwere versie is (anders kan de browser tot 10 minuten een oude tonen)
 event.respondWith(fetch(request.url,{cache:'no-cache'}).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
  return response;
 }).catch(()=>caches.match(request,{ignoreSearch:true}).then(hit=>hit||caches.match('index.html'))));
});
