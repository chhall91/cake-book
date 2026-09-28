/* Cake Book – real push reminders (Web Push via the cake-push Cloudflare Worker).
   Keeps a persistent "dirty orders" queue so changes made offline are synced later. */
(function () {
  'use strict';
  var cfg = window.CAKE_CONFIG || {};
  var deps = null;            // { kvGet, kvSet, getOrders(), getOrder(id), remindersFor(order) -> [{fireAt,title,body}], onState() }
  var creds = null;           // { deviceId, secret, endpoint, enabledAt }
  var queue = { ids: {}, full: false };
  var lastError = '';
  var flushing = null, retryTimer = null, retryDelay = 5000;

  function apiBase() {
    var o = null; try { o = localStorage.getItem('cakebook.pushApi'); } catch (e) {}
    return String(o || cfg.pushApi || '').replace(/\/+$/, '');
  }
  function b64ToU8(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); s += '='.repeat((4 - s.length % 4) % 4);
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function changed() { if (deps && deps.onState) try { deps.onState(); } catch (e) {} }
  function saveCreds() { return deps.kvSet('push', creds); }
  function saveQueue() { return deps.kvSet('pushQueue', queue); }

  function request(method, path, body) {
    var headers = {};
    if (creds) headers.Authorization = 'Bearer ' + creds.deviceId + '.' + creds.secret;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(apiBase() + path, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .catch(function () { throw err('offline', 'No connection'); })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401) throw err('unauthorized', 'Device not recognised');
          if (!r.ok) { var e = err('http', data.error || ('Server error ' + r.status)); e.status = r.status; e.data = data; throw e; }
          return data;
        });
      });
  }

  // ---- capability / state ----
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  /** One of: no-server | need-homescreen | unsupported | denied | on | off */
  function status() {
    if (!apiBase() || !cfg.vapidPublicKey) return 'no-server';
    if (IS_IOS && !isStandalone()) return 'need-homescreen';
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (creds && Notification.permission === 'granted') return 'on';
    return 'off';
  }
  function pendingCount() { return Object.keys(queue.ids).length + (queue.full ? 1 : 0); }

  // ---- enable / disable ----
  function register(sub) {
    var body = { subscription: sub.toJSON ? sub.toJSON() : sub };
    return request('POST', '/subscribe', body).catch(function (e) {
      if (e.code === 'unauthorized' && creds) { creds = null; return request('POST', '/subscribe', body); }
      throw e;
    }).then(function (data) {
      if (data.secret) creds = { deviceId: data.deviceId, secret: data.secret, enabledAt: Date.now() };
      creds.endpoint = body.subscription.endpoint;
      return saveCreds();
    });
  }
  function getSubscription(createIfMissing) {
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) {
        if (s || !createIfMissing) return s;
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.vapidPublicKey) });
      });
    });
  }
  /** Must be called directly from a tap (iOS only shows the permission prompt for a user gesture). */
  function enable() {
    var st = status();
    if (st === 'no-server' || st === 'need-homescreen' || st === 'unsupported') return Promise.reject(err(st));
    var perm = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    return perm.then(function (p) {
      if (p !== 'granted') throw err('denied', 'Notifications were not allowed');
      return getSubscription(true);
    }).then(register).then(function () {
      queue.full = true; return saveQueue();
    }).then(function () { changed(); return flush(); });
  }
  function disable() {
    var c = creds;
    return getSubscription(false).then(function (s) { return s && s.unsubscribe(); }).catch(function () {}).then(function () {
      return c ? request('DELETE', '/subscribe').catch(function () {}) : null;
    }).then(function () {
      creds = null; queue = { ids: {}, full: false };
      return Promise.all([saveCreds(), saveQueue()]);
    }).then(changed);
  }
  function sendTest() {
    if (!creds) return Promise.reject(err('off'));
    return request('POST', '/test').catch(function (e) {
      if (e.status === 410) { creds = null; saveCreds(); changed(); throw err('gone', 'This phone’s notification subscription expired – turn reminders on again.'); }
      throw e;
    });
  }
  // On start-up: make sure the server has this phone's *current* subscription (iOS can rotate it).
  function checkSubscription() {
    if (!creds || !supported() || Notification.permission !== 'granted') return Promise.resolve();
    return getSubscription(true).then(function (s) {
      if (s && s.endpoint !== creds.endpoint) return register(s);
    }).catch(function (e) { if (e.code === 'unauthorized') { creds = null; saveCreds(); changed(); } });
  }

  // ---- sync queue ----
  function markDirty(orderId) {
    if (!creds || !orderId) return;
    queue.ids[orderId] = (queue.ids[orderId] || 0) + 1;
    saveQueue().then(flushSoon);
  }
  function fullSync() {
    if (!creds) return;
    queue.full = true;
    saveQueue().then(flushSoon);
  }
  var soonTimer = null;
  function flushSoon() { clearTimeout(soonTimer); soonTimer = setTimeout(function () { flush().catch(function () {}); }, 300); }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { flush().catch(function () {}); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 5 * 60000);
  }
  function syncOne(id) {
    var o = deps.getOrder(id), rems = o ? deps.remindersFor(o) : [];
    var gen = queue.ids[id];
    var p = rems.length
      ? request('POST', '/reminders', { orderId: id, url: '#/order/' + id, reminders: rems })
      : request('DELETE', '/reminders/' + encodeURIComponent(id));
    return p.catch(function (e) {
      if (e.code === 'http' && e.status >= 400 && e.status < 500 && e.status !== 429) { console.warn('push sync dropped', id, e.message); return; } // bad data: don't retry forever
      throw e;
    }).then(function () { if (queue.ids[id] === gen) delete queue.ids[id]; });
  }
  function doFull() {
    return request('GET', '/reminders').then(function (data) {
      var local = {};
      deps.getOrders().forEach(function (o) { local[o.id] = 1; queue.ids[o.id] = (queue.ids[o.id] || 0) + 1; });
      (data.reminders || []).forEach(function (r) { if (!local[r.orderId]) queue.ids[r.orderId] = (queue.ids[r.orderId] || 0) + 1; });
      queue.full = false;
      return saveQueue();
    });
  }
  function flush() {
    if (!creds || !apiBase()) return Promise.resolve();
    if (flushing) return flushing;
    flushing = (queue.full ? doFull() : Promise.resolve()).then(function next() {
      var ids = Object.keys(queue.ids);
      if (!ids.length) return;
      return syncOne(ids[0]).then(function () { return saveQueue(); }).then(next);
    }).then(function () {
      retryDelay = 5000; lastError = '';
    }, function (e) {
      if (e.code === 'unauthorized') { creds = null; queue = { ids: {}, full: false }; saveCreds(); saveQueue(); lastError = 'unauthorized'; }
      else { lastError = e.code === 'offline' ? 'offline' : (e.message || 'error'); scheduleRetry(); }
    }).then(function () { flushing = null; changed(); });
    return flushing;
  }

  function init(d) {
    deps = d;
    return Promise.all([deps.kvGet('push'), deps.kvGet('pushQueue')]).then(function (r) {
      creds = r[0] && r[0].deviceId ? r[0] : null;
      if (r[1] && r[1].ids) queue = r[1];
      window.addEventListener('online', function () { retryDelay = 5000; flush(); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden && pendingCount()) flush(); });
      changed();
      return checkSubscription().then(flush);
    }).catch(function (e) { console.warn('push init', e); });
  }

  window.CakePush = {
    init: init, status: status, enable: enable, disable: disable, sendTest: sendTest,
    markDirty: markDirty, fullSync: fullSync, flush: flush,
    isOn: function () { return status() === 'on'; },
    pendingCount: pendingCount, lastError: function () { return lastError; }, apiBase: apiBase
  };
})();
