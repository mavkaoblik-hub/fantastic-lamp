const CACHE='caravan-slice-0.4-v1';
const ASSETS=['./','./index.html','./style.css','./game.js','./camera_math.js','./crew_motion.js','./caravan_systems.js','./gameplay_ui.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(saved=>saved||fetch(event.request)));});