/* Cake Book service worker: offline app shell, push reminders, and generated .ics files served as real text/calendar URLs (for iOS Calendar). */
var VERSION = 'cakebook-v5';
var SHELL = ['./', 'index.html', 'assets/styles.css', 'assets/app.js', 'assets/parser.js', 'assets/ics.js', 'assets/photos.js', 'assets/push.js', 'assets/config.js', 'manifest.json',
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
  // App shell: pages and assets come from ONE precached version, so code is never mixed across versions.
  // Updates: the browser (and the app, when reopened) checks service-worker.js; a new version precaches everything,
  // activates, and the page reloads onto it.
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match('index.html').then(function (hit) {
        return hit || fetch(req).catch(function () { return c.match('./'); });
      });
    }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) { if (res.ok && url.pathname.indexOf('/ics/') === -1) c.put(req, res.clone()); return res; });
    });
  }));
});
// Push reminders from the cake-push Worker. iOS requires every push to show a notification.
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Cake Book', {
    body: d.body || '', tag: d.tag || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    data: { url: typeof d.url === 'string' && d.url.charAt(0) === '#' ? d.url : '#/upcoming' }
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
