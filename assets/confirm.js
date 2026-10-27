/* Cake Book v9 – customer "confirm order" links (via the cake-push Cloudflare Worker).
   Each confirmation text gets a random, unguessable link (/c/<token>). The order summary is uploaded only when the text is
   actually sent. The app polls the Worker for answers and marks orders Confirmed / Change requested.
   If the Worker is unreachable (or the phone is offline), texts fall back to the old wording without a link. */
(function () {
  'use strict';
  var deps = null, creds = null, tokens = {}, pending = [], since = 0, down = 0, polling = null, timer = null;
  var DOWN_MS = 60000;

  function apiBase() { return window.CakePush ? window.CakePush.apiBase() : String((window.CAKE_CONFIG || {}).pushApi || '').replace(/\/+$/, ''); }
  function randToken() {
    var b = new Uint8Array(18); crypto.getRandomValues(b);
    return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // One identity: push reminders and confirm links share the same Worker device id (kept even if push is turned off).
  function myCreds() {
    var p = window.CakePush && window.CakePush.creds && window.CakePush.creds();
    if (p && (!creds || creds.deviceId !== p.deviceId)) { creds = { deviceId: p.deviceId, secret: p.secret, createdAt: Date.now() }; if (deps) save(); }
    return p || creds;
  }
  function save() { return deps.kvSet('confirmLinks', { creds: creds, tokens: tokens, pending: pending, since: since }); }
  function req(method, path, body, keepalive) {
    var c = myCreds(), h = {};
    if (c) h.Authorization = 'Bearer ' + c.deviceId + '.' + c.secret;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    var ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 8000);
    return fetch(apiBase() + path, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store', keepalive: !!keepalive, signal: ctl && ctl.signal })
      .then(function (r) {
        clearTimeout(t);
        return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; throw e; } down = 0; return d; });
      }, function (e) { clearTimeout(t); throw e; })
      .catch(function (e) {
        if (e.status >= 500) down = Date.now();
        if (e.status === 401 && path !== '/device') { creds = null; save(); }
        throw e;
      });
  }
  function ensureCreds() {
    if (myCreds() || !apiBase() || !navigator.onLine) return Promise.resolve(myCreds());
    return req('POST', '/device', {}).then(function (d) { creds = { deviceId: d.deviceId, secret: d.secret, createdAt: Date.now() }; return save().then(function () { return creds; }); });
  }
  /** Can we put a link in a text right now? */
  // v10.6: a hiccup (e.g. a request cut off when iPhone suspends the app) no longer drops links for 5 minutes.
  // Only a real server outage (5xx) pauses links, for 1 minute; a failed upload is queued and retried, so the link still works.
  function available() { return !!(apiBase() && myCreds() && navigator.onLine !== false && (!down || Date.now() - down > DOWN_MS)); }
  function key(orderId, personId) { return orderId + '|' + (personId || ''); }
  /** URL for this order/person's confirm link, or '' (fallback: old text without a link). Synchronous so it can go straight into an sms: href. */
  function linkFor(orderId, personId) {
    if (!available()) return '';
    var k = key(orderId, personId), t = tokens[k];
    if (!t || t.answered) { t = tokens[k] = { token: randToken(), createdAt: Date.now() }; save(); }
    return apiBase() + '/c/' + t.token;
  }
  /** Called when the confirmation text is sent: uploads the summary for that link (keepalive, retried later if it fails). */
  function sent(orderId, personId, summary, dueDate) {
    var t = tokens[key(orderId, personId)];
    if (!t) return Promise.resolve();
    var body = { token: t.token, orderId: orderId, personId: personId || '', summary: summary, dueDate: dueDate || '' };
    t.sentAt = Date.now();
    return req('POST', '/links', body, true).then(function () { t.registered = true; return save(); }, function (e) {
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) { console.warn('confirm link rejected', e.message); return save(); }
      pending = pending.filter(function (p) { return p.token !== body.token; }).concat([body]).slice(-50);
      return save();
    });
  }
  function flushPending() {
    if (!pending.length) return Promise.resolve();
    var list = pending.slice();
    return list.reduce(function (p, b) {
      return p.then(function () {
        return req('POST', '/links', b).then(function () { pending = pending.filter(function (x) { return x.token !== b.token; }); },
          function (e) { if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) pending = pending.filter(function (x) { return x.token !== b.token; }); else throw e; });
      });
    }, Promise.resolve()).then(save, function () { return save(); });
  }
  /** Fetch new customer answers and hand them to the app. */
  function poll() {
    if (polling) return polling;
    if (!apiBase() || navigator.onLine === false) return Promise.resolve([]);
    polling = ensureCreds().then(function (c) {
      if (!c) return [];
      return flushPending().then(function () { return req('GET', '/links/responses?since=' + since); }).then(function (d) {
        var list = d.responses || [];
        list.forEach(function (r) {
          var t = tokens[key(r.orderId, r.personId)]; if (t) t.answered = true;
          since = Math.max(since, r.respondedAt);
        });
        if (list.length) { try { deps.apply(list); } catch (e) { console.warn('confirm apply', e); } }
        return save().then(function () { return list; });
      });
    }).catch(function (e) { console.warn('confirm poll', e && e.message); return []; }).then(function (r) { polling = null; return r; });
    return polling;
  }
  /** Order deleted: remove its links from the Worker. */
  function forget(orderId) {
    Object.keys(tokens).forEach(function (k) { if (k.split('|')[0] === orderId) delete tokens[k]; });
    save();
    if (myCreds() && apiBase()) req('DELETE', '/links/' + encodeURIComponent(orderId)).catch(function () {});
  }
  function init(d) {
    deps = d;
    return deps.kvGet('confirmLinks').then(function (s) {
      if (s) { creds = s.creds || null; tokens = s.tokens || {}; pending = s.pending || []; since = s.since || 0; }
      document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
      window.addEventListener('online', function () { down = 0; poll(); });
      clearInterval(timer); timer = setInterval(function () { if (!document.hidden) poll(); }, 45000);
      return poll();
    }).catch(function (e) { console.warn('confirm init', e); });
  }
  window.CakeConfirm = { init: init, ensureCreds: ensureCreds, poll: poll, linkFor: linkFor, sent: sent, forget: forget, available: available, creds: function () { return myCreds(); }, ownCreds: function () { return creds; } };
})();
