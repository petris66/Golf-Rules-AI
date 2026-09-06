const CACHE='golf-rules-ai-v2.0.9';
const SHELL=['/','/index.html','/style.css','/app.js','/manifest.webmanifest',
'/icons/icon-192.png','/icons/icon-512.png','/apple-touch-icon.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
  )));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
