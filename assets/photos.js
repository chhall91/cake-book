/* Cake Book – storage (IndexedDB) + photo attachments: processing, object-URL cache, full-screen viewer, backup helpers.
 * Exposes window.CakeStore and window.CakePhotos. */
(function (root) {
  'use strict';

  // ---------- IndexedDB (db "cakebook" v2: stores "kv" + "photos") ----------
  var dbp = null;
  function open() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('IndexedDB not available'));
      var r = indexedDB.open('cakebook', 2);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      };
      r.onsuccess = function () { var db = r.result; db.onversionchange = function () { db.close(); dbp = null; }; res(db); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('Database upgrade blocked – close other Cake Book tabs.')); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode), q = fn(t.objectStore(store));
        if (q && q.addEventListener) q.addEventListener('error', function () { /* surface on abort */ });
        t.oncomplete = function () { res(q && q.result); };
        t.onerror = t.onabort = function () { rej(t.error || (q && q.error) || new Error('Storage error')); };
      });
    });
  }
  var Store = {
    kvGet: function (k) {
      return tx('kv', 'readonly', function (s) { return s.get(k); })
        .catch(function () { var v = localStorage.getItem('cakebook:' + k); return v ? JSON.parse(v) : undefined; });
    },
    kvSet: function (k, v) {
      return tx('kv', 'readwrite', function (s) { return s.put(v, k); })
        .catch(function () { localStorage.setItem('cakebook:' + k, JSON.stringify(v)); });
    },
    photoPut: function (rec) {
      // Store bytes as ArrayBuffer (Playwright WebKit rejects Blob in IndexedDB; real iOS Safari accepts both).
      var out = { id: rec.id, w: rec.w || 0, h: rec.h || 0, type: rec.type || 'image/jpeg', createdAt: rec.createdAt || Date.now() };
      function save(data) { out.data = data; return tx('photos', 'readwrite', function (s) { return s.put(out); }); }
      if (rec.data instanceof ArrayBuffer) return save(rec.data);
      if (rec.blob) return (rec.blob.arrayBuffer ? rec.blob.arrayBuffer() : new Response(rec.blob).arrayBuffer()).then(save);
      if (rec.dataUrl) return new Response(dataURLToBlob(rec.dataUrl)).arrayBuffer().then(save);
      return Promise.reject(new Error('Nothing to store'));
    },
    photoGet: function (id) {
      return tx('photos', 'readonly', function (s) { return s.get(id); }).then(function (rec) {
        if (!rec) return null;
        if (rec.blob) return rec;
        if (rec.data) return Object.assign({}, rec, { blob: new Blob([rec.data], { type: rec.type || 'image/jpeg' }) });
        if (rec.dataUrl) return Object.assign({}, rec, { blob: dataURLToBlob(rec.dataUrl) });
        return rec;
      });
    },
    photoDel: function (id) { revoke(id); return tx('photos', 'readwrite', function (s) { return s.delete(id); }); },
    photoKeys: function () { return tx('photos', 'readonly', function (s) { return s.getAllKeys(); }); },
    photoClear: function () { Object.keys(urlCache).forEach(revoke); return tx('photos', 'readwrite', function (s) { return s.clear(); }); }
  };

  // ---------- helpers ----------
  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function dataURLToBlob(d) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(d || '');
    if (!m) throw new Error('Bad image data');
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] || 'image/jpeg' });
  }
  function blobToDataURL(b) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(b); });
  }

  // ---------- image processing ----------
  var MAX_DIM = 1600, QUALITY = 0.8;
  function decodeWithImg(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { res({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: function () { URL.revokeObjectURL(url); } }); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img decode failed')); };
      img.src = url;
    });
  }
  function decodeWithBitmap(blob) {
    if (!root.createImageBitmap) return Promise.reject(new Error('no createImageBitmap'));
    return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(blob); })
      .then(function (bm) { return { src: bm, w: bm.width, h: bm.height, done: function () { if (bm.close) bm.close(); } }; });
  }
  function canvasToBlob(c) {
    return new Promise(function (res) {
      if (c.toBlob) c.toBlob(function (b) { res(b || dataURLToBlob(c.toDataURL('image/jpeg', QUALITY))); }, 'image/jpeg', QUALITY);
      else res(dataURLToBlob(c.toDataURL('image/jpeg', QUALITY)));
    });
  }
  // File → {id, blob, w, h, type, createdAt}. Downscales to MAX_DIM on the long side, re-encodes as JPEG.
  function processFile(file) {
    var isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
    return decodeWithImg(file).catch(function () { return decodeWithBitmap(file); }).then(function (d) {
      var s = Math.min(1, MAX_DIM / Math.max(d.w, d.h));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(d.w * s)); c.height = Math.max(1, Math.round(d.h * s));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(d.src, 0, 0, c.width, c.height);
      d.done();
      return canvasToBlob(c).then(function (blob) { c.width = c.height = 0; return { id: uid(), blob: blob, w: Math.round(d.w * s), h: Math.round(d.h * s), type: 'image/jpeg', createdAt: Date.now() }; });
    }).catch(function () {
      var e = new Error(isHeic
        ? 'This iPhone photo (HEIC) couldn’t be opened. Open it in Photos, take a screenshot of it, and add the screenshot instead.'
        : 'That file couldn’t be opened as a picture. Try a JPEG or PNG, or take a screenshot of it and add that.');
      e.friendly = true; throw e;
    });
  }
  function recordFromDataURL(dataUrl, id) {
    return { id: id || uid(), blob: dataURLToBlob(dataUrl), w: 0, h: 0, type: 'image/jpeg', createdAt: Date.now() };
  }

  // ---------- object URL cache ----------
  var urlCache = {};
  function revoke(id) { if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; } }
  function getURL(id) {
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return Store.photoGet(id).then(function (rec) {
      if (!rec) return null;
      var blob = rec.blob || (rec.dataUrl ? dataURLToBlob(rec.dataUrl) : null);
      if (!blob) return null;
      return (urlCache[id] = URL.createObjectURL(blob));
    }).catch(function () { return null; });
  }
  // Fill every <img data-pid="..."> inside el with its object URL.
  function hydrate(el) {
    Array.prototype.forEach.call((el || document).querySelectorAll('img[data-pid]:not([src])'), function (img) {
      getURL(img.dataset.pid).then(function (u) { if (u) img.src = u; else img.classList.add('missing'); });
    });
  }

  // ---------- share / save ----------
  function share(id, name) {
    return Store.photoGet(id).then(function (rec) {
      if (!rec) throw new Error('Photo not found');
      var blob = rec.blob || dataURLToBlob(rec.dataUrl);
      var file;
      try { file = new File([blob], name || 'cake-photo.jpg', { type: blob.type || 'image/jpeg' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file] }).then(function () { return 'shared'; }, function (e) { if (e && e.name === 'AbortError') return 'cancelled'; throw e; });
      }
      return getURL(id).then(function (url) {
        var w = root.open(url, '_blank');
        if (!w) { var a = document.createElement('a'); a.href = url; a.download = name || 'cake-photo.jpg'; document.body.appendChild(a); a.click(); a.remove(); }
        return 'opened';
      });
    });
  }

  // ---------- full-screen viewer ----------
  var V = null;
  function buildViewer() {
    var el = document.createElement('div');
    el.id = 'viewer'; el.className = 'viewer'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Photo viewer');
    el.innerHTML = '<div class="viewer-top"><button class="v-btn" data-v="close" aria-label="Close">✕</button><span class="v-count"></span>' +
      '<button class="v-btn v-share" data-v="share" aria-label="Save or share photo">⬆︎ Save</button></div>' +
      '<div class="viewer-track"></div>' +
      '<button class="v-arrow v-prev" data-v="prev" aria-label="Previous photo">‹</button><button class="v-arrow v-next" data-v="next" aria-label="Next photo">›</button>' +
      '<div class="viewer-caption"></div><div class="viewer-hint">Double-tap or pinch to zoom · swipe for more</div>';
    document.body.appendChild(el);
    var track = el.querySelector('.viewer-track');
    V = { el: el, track: track, list: [], index: 0, opts: {} };
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      var a = b.dataset.v;
      if (a === 'close') close();
      else if (a === 'prev') go(V.index - 1);
      else if (a === 'next') go(V.index + 1);
      else if (a === 'share') {
        var p = V.list[V.index];
        share(p.id, (V.opts.filePrefix || 'cake-photo') + '-' + (V.index + 1) + '.jpg').then(function (r) { if (V.opts.onShared) V.opts.onShared(r); })
          .catch(function (err) { if (V.opts.onError) V.opts.onError(err); });
      }
    });
    var t = null;
    track.addEventListener('scroll', function () {
      clearTimeout(t);
      t = setTimeout(function () { var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== V.index) { V.index = i; update(); } }, 60);
    });
    // double-tap / double-click to zoom a slide (pinch-zoom also works natively)
    var lastTap = 0;
    track.addEventListener('click', function (e) {
      var slide = e.target.closest('.slide'); if (!slide) return;
      var now = Date.now();
      if (now - lastTap < 320) {
        var z = !slide.classList.contains('zoomed');
        slide.classList.toggle('zoomed', z);
        if (z) { var img = slide.querySelector('img'); slide.scrollLeft = (img.offsetWidth - slide.clientWidth) / 2; slide.scrollTop = (img.offsetHeight - slide.clientHeight) / 2; }
        lastTap = 0;
      } else lastTap = now;
    });
    document.addEventListener('keydown', function (e) {
      if (V.el.hidden) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(V.index - 1); else if (e.key === 'ArrowRight') go(V.index + 1);
    });
    root.addEventListener('resize', function () { if (!V.el.hidden) V.track.scrollLeft = V.index * V.track.clientWidth; });
  }
  function update() {
    var n = V.list.length, p = V.list[V.index] || {};
    V.el.querySelector('.v-count').textContent = (V.index + 1) + ' / ' + n;
    var cap = V.el.querySelector('.viewer-caption');
    cap.textContent = p.caption || ''; cap.hidden = !p.caption;
    V.el.querySelector('.v-prev').hidden = V.index <= 0;
    V.el.querySelector('.v-next').hidden = V.index >= n - 1;
    Array.prototype.forEach.call(V.track.querySelectorAll('.slide.zoomed'), function (s, i) { if (+s.dataset.i !== V.index) s.classList.remove('zoomed'); });
  }
  function go(i) {
    if (i < 0 || i >= V.list.length) return;
    V.index = i;
    V.track.scrollTo({ left: i * V.track.clientWidth, behavior: 'smooth' });
    update();
  }
  function openViewer(list, index, opts) {
    if (!V) buildViewer();
    V.list = list.slice(); V.index = index || 0; V.opts = opts || {};
    V.track.innerHTML = V.list.map(function (p, i) {
      return '<div class="slide" data-i="' + i + '"><img data-pid="' + String(p.id).replace(/"/g, '') + '" alt="' + (p.caption ? String(p.caption).replace(/[<>"&]/g, '') : 'Photo ' + (i + 1)) + '"></div>';
    }).join('');
    hydrate(V.track);
    V.el.hidden = false;
    document.documentElement.classList.add('viewer-open');
    V.track.scrollLeft = V.index * V.track.clientWidth;
    requestAnimationFrame(function () { V.track.scrollLeft = V.index * V.track.clientWidth; });
    update();
    V.el.querySelector('[data-v="close"]').focus();
  }
  function close() {
    if (!V || V.el.hidden) return;
    V.el.hidden = true; V.track.innerHTML = '';
    document.documentElement.classList.remove('viewer-open');
    if (V.opts.onClose) V.opts.onClose();
  }

  // ---------- backup helpers ----------
  function exportPhotos(ids) {
    return Promise.all(ids.map(function (id) {
      return Store.photoGet(id).then(function (rec) {
        if (!rec) return null;
        var p = rec.blob ? blobToDataURL(rec.blob) : Promise.resolve(rec.dataUrl);
        return p.then(function (d) { return { id: rec.id, w: rec.w, h: rec.h, createdAt: rec.createdAt, dataUrl: d }; });
      }).catch(function () { return null; });
    })).then(function (l) { return l.filter(Boolean); });
  }
  function importPhotos(list) {
    return list.reduce(function (p, x) {
      return p.then(function () {
        if (!x || !x.id || !x.dataUrl) return;
        revoke(x.id);
        return Store.photoPut({ id: x.id, blob: dataURLToBlob(x.dataUrl), w: x.w || 0, h: x.h || 0, type: 'image/jpeg', createdAt: x.createdAt || Date.now() });
      });
    }, Promise.resolve());
  }

  root.CakeStore = Store;
  root.CakePhotos = { MAX_PER_ORDER: 10, processFile: processFile, recordFromDataURL: recordFromDataURL, getURL: getURL, hydrate: hydrate,
    open: openViewer, close: close, share: share, exportPhotos: exportPhotos, importPhotos: importPhotos, revoke: revoke };
})(this);
