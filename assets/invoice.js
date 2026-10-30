/* Cake Book v11 – invoices with Venmo.
   Each order (or bulk person) gets one private, unguessable invoice link (/i/<token>) on the cake-push Worker.
   The link is made when she taps "Send invoice"; later changes (paid, new price) update the same page. No card payments. */
(function () {
  'use strict';
  var deps = null, tokens = {}, pending = [];
  function apiBase() { return window.CakePush ? window.CakePush.apiBase() : String((window.CAKE_CONFIG || {}).pushApi || '').replace(/\/+$/, ''); }
  function key(o, p) { return o + '|' + (p || ''); }
  function save() { return deps.kvSet('invoices', { tokens: tokens, pending: pending }); }
  function randToken() { var b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function creds() { return window.CakeConfirm && CakeConfirm.creds(); }
  function available() { return !!(apiBase() && creds() && navigator.onLine !== false); }
  function has(orderId, personId) { return !!tokens[key(orderId, personId)]; }
  /** Stable invoice URL for this order/person ('' when offline / no server). Synchronous so it can go into an sms: href. */
  function linkFor(orderId, personId) {
    if (!available()) return '';
    var k = key(orderId, personId); if (!tokens[k]) { tokens[k] = { token: randToken(), createdAt: Date.now() }; save(); }
    return apiBase() + '/i/' + tokens[k].token;
  }
  function put(body, keepalive) {
    var c = creds(); if (!c) return Promise.reject(new Error('no device'));
    return fetch(apiBase() + '/invoices', { method: 'PUT', keepalive: !!keepalive, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.deviceId + '.' + c.secret }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'HTTP ' + r.status); e.status = r.status; throw e; } return d; }); });
  }
  /** Upload (or update) the invoice page. Failed uploads are queued and retried. */
  function publish(orderId, personId, invoice, dueDate, keepalive) {
    var t = tokens[key(orderId, personId)]; if (!t) return Promise.resolve();
    var body = { token: t.token, orderId: orderId, personId: personId || '', invoice: invoice, dueDate: dueDate || '' };
    pending = pending.filter(function (p) { return p.token !== body.token; });
    return put(body, keepalive).then(function () { t.sentAt = t.sentAt || Date.now(); t.updatedAt = Date.now(); return save(); }, function (e) {
      if (!(e.status >= 400 && e.status < 500 && e.status !== 429)) pending = pending.concat([body]).slice(-50);
      else console.warn('invoice rejected', e.message);
      return save();
    });
  }
  function flush() {
    if (!pending.length || !available()) return Promise.resolve();
    var list = pending.slice(); pending = [];
    return list.reduce(function (p, b) { return p.then(function () { return put(b).catch(function (e) { if (!(e.status >= 400 && e.status < 500 && e.status !== 429)) pending.push(b); }); }); }, Promise.resolve()).then(save);
  }
  /** Re-publish every invoice already sent for this order (e.g. after Mark paid). */
  function refresh(orderId, build, dueDate) {
    Object.keys(tokens).forEach(function (k) {
      var parts = k.split('|'); if (parts[0] !== orderId) return;
      var inv = build(parts[1] || ''); if (inv) publish(orderId, parts[1] || '', inv, dueDate);
    });
  }
  function forget(orderId) {
    var any = false; Object.keys(tokens).forEach(function (k) { if (k.split('|')[0] === orderId) { delete tokens[k]; any = true; } });
    pending = pending.filter(function (b) { return b.orderId !== orderId; }); save();
    var c = creds(); if (any && c && apiBase()) fetch(apiBase() + '/invoices/' + encodeURIComponent(orderId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + c.deviceId + '.' + c.secret } }).catch(function () {});
  }
  /** Venmo QR: keep the whole picture (no square crop), longest side <= 900px, JPEG <= ~150KB. */
  function qrJpeg(file) {
    return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('Could not read that picture')); }; im.src = u; })
      .then(function (im) {
        var sc = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        function enc(q) { return new Promise(function (r) { c.toBlob(r, 'image/jpeg', q); }).then(function (b) { return b.size <= 150 * 1024 || q < 0.45 ? b : enc(q - 0.1); }); }
        return enc(0.9);
      });
  }
  function uploadQr(file) {
    return qrJpeg(file).then(function (blob) {
      return CakeConfirm.ensureCreds().then(function (c) {
        if (!c) throw new Error('offline');
        return fetch(apiBase() + '/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + c.deviceId + '.' + c.secret }, body: blob });
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status); return d.id; }); });
    });
  }
  function imgUrl(id) { return id ? apiBase() + '/img/' + id + '.jpg' : ''; }
  function init(d) {
    deps = d;
    return deps.kvGet('invoices').then(function (s) {
      if (s) { tokens = s.tokens || {}; pending = s.pending || []; }
      window.addEventListener('online', flush);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });
      setTimeout(flush, 4000);
    });
  }
  window.CakeInvoice = { init: init, linkFor: linkFor, has: has, publish: publish, refresh: refresh, forget: forget, uploadQr: uploadQr, imgUrl: imgUrl, available: available };
})();
