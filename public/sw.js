const CACHE = 'trading-shell-__BUILD__';
const PRECACHE = [];
const url = path => new URL(path, self.registration.scope).href;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE.map(url)))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('trading-shell-')||k.startsWith('trade-journal-shell-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,target=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method!=='GET'||target.origin!==scope.origin||!target.pathname.startsWith(scope.pathname)||target.pathname.slice(scope.pathname.length).startsWith('api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(async()=> (await caches.open(CACHE)).match(url('index.html'))));return;
 }
 if(!PRECACHE.some(path=>url(path)===target.href))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});
