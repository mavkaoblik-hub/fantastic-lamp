const CACHE='caravan-slice-0.1-v1';
const ASSETS=['./','./index.html','./style.css','./game.js','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./assets/concept_cover.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(saved=>saved||fetch(event.request)));});