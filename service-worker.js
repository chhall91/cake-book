/* Cake Book service worker: offline app shell + serves generated .ics files as real text/calendar URLs (for iOS Calendar). */
var VERSION = 'cakebook-v3';
var SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'parser.js', 'ics.js', 'photos.js', 'manifest.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
var ICS_CACHE = 'cakebook-ics';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== ICS_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Generated calendar files: ./ics/<id>/<name>.ics
  if (/\/ics\/[^/]+\/[^/]+\.ics$/.test(url.pathname)) {
    e.respondWith(caches.open(ICS_CACHE).then(function (c) {
      return c.match(url.href).then(function (r) {
        return r || new Response('This calendar file has expired. Go back and tap “Add to my phone’s calendar” again.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    }));
    // tidy old generated files (older than 1 day)
    e.waitUntil(caches.open(ICS_CACHE).then(function (c) {
      return c.keys().then(function (ks) {
        var cutoff = Date.now() - 86400000;
        return Promise.all(ks.filter(function (k) { var m = k.url.match(/\/ics\/([^/]+)\//); return m && parseInt(m[1], 36) < cutoff; }).map(function (k) { return c.delete(k); }));
      });
    }));
    return;
  }
  // App shell: network-first for navigations (fresh code when online), cache fallback offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', copy); }); return res;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  // Static assets: stale-while-revalidate.
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || '#/upcoming';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) { list[i].postMessage({ url: target }); return list[i].focus(); } }
    return self.clients.openWindow('./' + target);
  }));
});
