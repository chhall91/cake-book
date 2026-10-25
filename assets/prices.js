/* Cake Book v10 – shareable price list.
   Edited in the app (#/prices), stored on the phone, and published to the cake-push Worker as a public page /p/<token>.
   The token is made once, so the link never changes; every save republishes. */
(function () {
  'use strict';
  var DISCLAIMER = 'Prices are estimates and may go up depending on design, size and ingredient costs.';
  var deps = null, busy = {}, data = null, timer = null, publishing = null;
  var TYPES = [{ type: 'cake', label: 'Cakes', emoji: '🎂' }, { type: 'cupcakes', label: 'Cupcakes', emoji: '🧁' }, { type: 'cookies', label: 'Cookies', emoji: '🍪' }, { type: 'creampies', label: 'Oatmeal cream pies', emoji: '🍪' }];
  var TAGS = { cake: 'Birthdays, showers & every celebration', cupcakes: 'Perfect for parties & sharing', cookies: 'Fresh-baked by the dozen', creampies: 'Soft, chewy, homemade classics' };
  var DEF = { cake: ['cakes', '🎂'], cupcakes: ['cupcakes', '🧁'], cookies: ['cookies', '🍪'], creampies: ['cream-pies', '🥧'], other: ['add-ons', '✨'] };
  function slugify(t) { return String(t || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'treats'; }
  function uniqueSlug(base, except) {
    var s = slugify(base), n = 2, used = data ? data.groups.filter(function (g) { return g !== except; }).map(function (g) { return g.slug; }) : [];
    if (s === 'menu') s = 'menu-items';
    var out = s; while (used.indexOf(out) >= 0) out = s + '-' + n++; return out;
  }
  /** v10.5: every group gets a stable slug (hash link), an emoji and an addon flag. */
  function migrate() {
    var ch = false;
    data.groups.forEach(function (g) {
      if (g.addon === undefined) { g.addon = g.type === 'other'; ch = true; }
      if (!g.emoji) { g.emoji = (DEF[g.type] || DEF.other)[1]; ch = true; }
      if (!g.slug) { g.slug = uniqueSlug(g.type === 'other' ? slugify(g.label) : (DEF[g.type] || [g.label])[0], g); ch = true; }
    });
    return ch;
  }
  function ex(name, price, note) { return { id: rid(), name: name, price: price, note: note, example: true }; }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function cookieGroup() {
    return { type: 'cookies', label: 'Cookies', items: [ex('Classic cookies', '$18–24', 'Per dozen – chocolate chip, sugar or snickerdoodle'), ex('Decorated sugar cookies', '$36–48', 'Per dozen – custom iced designs'),
      ex('Gourmet / stuffed cookies', '$30–40', 'Per dozen – big bakery-style'), ex('Mini cookies', '$10–14', 'Per dozen')] };
  }
  function seed() {
    return {
      v: 1, title: '', intro: 'Prices are estimates – your final quote depends on size, design and details. Text me to order!', contact: '',
      groups: [
        { type: 'cake', label: 'Cakes', items: [ex('6" round cake', '$45–60', 'Serves 8–12'), ex('8" round cake', '$60–80', 'Serves 16–24'), ex('10" round cake', '$85–110', 'Serves 28–38'),
          ex('2-tier cake', '$150–250', '6" + 8" – serves about 40'), ex('3-tier cake', '$300–450', '6" + 8" + 10" – serves about 75'),
          ex('Quarter sheet cake', '$50–70', 'Serves about 24'), ex('Half sheet cake', '$90–120', 'Serves about 48'), ex('Smash cake', '$25–35', '4" – perfect for a first birthday')] },
        { type: 'other', label: 'Cake add-ons', items: [ex('Fondant covering', '+$1–2 per serving', 'Instead of buttercream'), ex('Custom cake topper', '+$10–25', 'Name or age topper'),
          ex('Fresh flowers', '+$15–40', 'Depends on flowers'), ex('Filling upgrade', '+$5–15', 'Fruit, ganache, cream cheese, etc.'), ex('Delivery', '$10–25', 'Depends on distance – setup included for tiered cakes')] },
        { type: 'cupcakes', label: 'Cupcakes', items: [ex('Standard cupcakes', '$24–30', 'Per dozen'), ex('Gourmet / filled cupcakes', '$36–45', 'Per dozen'), ex('Mini cupcakes', '$15–20', 'Per dozen'), ex('Custom toppers or decorations', '+$6–12', 'Per dozen')] },
        cookieGroup(),
        { type: 'creampies', label: 'Oatmeal cream pies', items: [ex('Oatmeal cream pies', '$20–28', 'Per dozen'), ex('Mini oatmeal cream pies', '$12–15', 'Per dozen'), ex('Individually wrapped', '+$3', 'Per dozen'),
          ex('Bulk / fundraiser pricing', '$1.50–2 each', '5+ dozen – ask for a quote')] }
      ],
      token: null, publishedAt: 0, dirty: false, exampleIntro: true
    };
  }
  function base() { return window.CakePush ? window.CakePush.apiBase() : String((window.CAKE_CONFIG || {}).pushApi || '').replace(/\/+$/, ''); }
  function save() { return deps.kvSet('priceList', data); }
  function hasExamples() { return data.groups.some(function (g) { return g.items.some(function (i) { return i.example; }); }); }
  function url() { return data.token ? base() + '/p/' + data.token : ''; }
  function title() { return data.title || ((deps.settings().signature || '').trim() ? deps.settings().signature.trim() + ' – Prices' : 'Cake & Treat Prices'); }
  function payload() {
    return { title: title(), intro: data.intro, contact: data.contact,
      groups: data.groups.map(function (g) { return { type: g.type, slug: g.slug, emoji: g.emoji, addon: !!g.addon, photo: g.photo || '', label: g.label, tagline: g.tagline || '', hidden: !!g.hidden, items: g.items.map(function (i) { return { name: i.name, price: i.price, note: i.note }; }) }; }) };
  }
  function token() {
    var b = new Uint8Array(18); crypto.getRandomValues(b);
    return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /** Publish the current list (creates the link the first time). Resolves with the URL. */
  function publish() {
    if (publishing) return publishing.then(function () { return data.dirty ? publish() : url(); });
    if (!base()) return Promise.reject(new Error('No server configured'));
    if (!data.token) { data.token = token(); }
    data.dirty = true; save();
    publishing = window.CakeConfirm.ensureCreds().then(function (c) {
      if (!c) throw new Error('offline');
      var snap = JSON.stringify(payload());
      return fetch(base() + '/prices', { method: 'PUT', cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.deviceId + '.' + c.secret },
        body: JSON.stringify({ token: data.token, list: JSON.parse(snap) }) }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status); });
      }).then(function () { if (JSON.stringify(payload()) === snap) data.dirty = false; data.publishedAt = Date.now(); return save(); });
    }).then(function () { publishing = null; return url(); }, function (e) { publishing = null; throw e; });
    return publishing;
  }
  /** Saved an edit: republish shortly if the list has already been shared. */
  function changed() {
    data.dirty = true; save();
    clearTimeout(timer);
    if (data.token) timer = setTimeout(function () { publish().then(function () { renderStatus(); }, function () { renderStatus(); }); }, 800);
  }
  function retryIfDirty() { if (data && data.token && data.dirty && navigator.onLine !== false) publish().catch(function () {}); }

  // ---------- photos: square-crop to 800px JPEG <= ~150KB on the phone, then upload ----------
  function loadImage(file) {
    return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); }; im.onerror = function () { rej(new Error('Could not read that photo')); }; im.src = u; });
  }
  function squareJpeg(file) {
    return loadImage(file).then(function (im) {
      var w = im.naturalWidth, h = im.naturalHeight, side = Math.min(w, h), out = Math.min(800, side);
      var c = document.createElement('canvas'); c.width = c.height = out;
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, out, out);
      x.drawImage(im, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
      function enc(q, size) {
        return new Promise(function (r) { c.toBlob(r, 'image/jpeg', q); }).then(function (b) {
          if (b.size <= 150 * 1024 || q < 0.4) {
            if (b.size > 150 * 1024 && size > 500) { var c2 = document.createElement('canvas'); c2.width = c2.height = 560; c2.getContext('2d').drawImage(c, 0, 0, 560, 560); c = c2; return enc(0.8, 560); }
            return b;
          }
          return enc(q - 0.1, size);
        });
      }
      return enc(0.85, out);
    });
  }
  function imgUrl(id) { return id ? base() + '/img/' + id + '.jpg' : ''; }
  function uploadPhoto(g, file) {
    busy[g.slug] = true; keep(render);
    return squareJpeg(file).then(function (blob) {
      return window.CakeConfirm.ensureCreds().then(function (c) {
        if (!c) throw new Error('offline');
        return fetch(base() + '/images', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + c.deviceId + '.' + c.secret }, body: blob });
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status); return d.id; }); });
    }).then(function (id) { g.photo = id; delete busy[g.slug]; changed(); keep(render); deps.toast('Photo added ✓'); },
      function (e) { delete busy[g.slug]; keep(render); deps.toast(navigator.onLine === false ? 'You’re offline – try the photo again when connected.' : 'Couldn’t add the photo (' + e.message + ')', 4500); });
  }

  // ---------- UI ----------
  var esc = function (s) { return deps.esc(s); };
  function itemRow(g, i) {
    return '<div class="pl-item' + (i.example ? ' is-example' : '') + '" data-gi="' + g + '" data-id="' + esc(i.id) + '">' +
      '<div class="pl-row"><input class="text-input pl-name" data-f="name" value="' + esc(i.name) + '" placeholder="Item (e.g. 8&quot; round)" maxlength="80" aria-label="Item name">' +
      '<input class="text-input pl-price" data-f="price" value="' + esc(i.price) + '" placeholder="from $40" maxlength="40" aria-label="Price" inputmode="text"></div>' +
      '<div class="pl-row"><input class="text-input pl-note" data-f="note" value="' + esc(i.note) + '" placeholder="Note (optional) – e.g. per dozen, serves 12" maxlength="140" aria-label="Note">' +
      '<button class="icon-btn pl-del" type="button" data-pl-del aria-label="Remove ' + esc(i.name || 'item') + '">🗑</button></div>' +
      (i.example ? '<span class="pl-ex">EXAMPLE – replace with your price</span>' : '') + '</div>';
  }
  function render() {
    var page = document.getElementById('page-prices');
    var n = data.groups.length;
    var groups = data.groups.map(function (g, gi) {
      var addon = !!g.addon, ph = g.photo, slug = esc(g.slug);
      var head = '<div class="pl-ghead">' + (addon ? '<span class="pl-emoji-static">✨</span>' : '<input class="text-input pl-emoji" data-g="' + gi + '" data-gf="emoji" value="' + esc(g.emoji) + '" maxlength="4" aria-label="Emoji">') +
        '<input class="text-input pl-gname" data-g="' + gi + '" data-gf="label" value="' + esc(g.label) + '" maxlength="40" aria-label="Category name">' +
        '<button class="icon-btn" type="button" data-pl-up="' + gi + '"' + (gi ? '' : ' disabled') + ' aria-label="Move up">↑</button>' +
        '<button class="icon-btn" type="button" data-pl-down="' + gi + '"' + (gi < n - 1 ? '' : ' disabled') + ' aria-label="Move down">↓</button>' +
        '<button class="icon-btn" type="button" data-pl-gdel="' + gi + '" aria-label="Delete category">🗑</button></div>';
      var photo = addon ? '' : '<div class="pl-photo">' + (busy[g.slug] ? '<div class="pl-thumb pl-busy">⏳</div>' : ph ? '<img class="pl-thumb" src="' + esc(imgUrl(ph)) + '" alt="">' : '<div class="pl-thumb pl-noimg">' + esc(g.emoji) + '</div>') +
        '<div class="pl-photo-btns"><label class="btn secondary small-btn">' + (ph ? '🔄 Replace photo' : '📷 Add photo') + '<input type="file" accept="image/*" class="vh" data-pl-photo="' + gi + '"></label>' +
        (ph ? '<button class="btn link" type="button" data-pl-unphoto="' + gi + '">Remove photo</button>' : '<span class="muted small">Shows on the menu tile</span>') + '</div></div>';
      return '<div class="card pl-group' + (g.hidden ? ' is-hidden' : '') + (addon ? ' is-addon' : '') + '" data-slug="' + slug + '">' + head +
        (addon ? '<p class="muted small">Add-ons show inside the category above them.</p>' : photo + '<label class="field-label" for="plTag' + gi + '">Tagline on the menu tile (optional)</label><input class="text-input" id="plTag' + gi + '" data-g="' + gi + '" data-gf="tagline" maxlength="80" placeholder="' + esc(TAGS[g.type] || 'e.g. Made to order') + '" value="' + esc(g.tagline || '') + '">') +
        '<label class="toggle-row"><input type="checkbox" data-g="' + gi + '" data-gf="hidden"' + (g.hidden ? ' checked' : '') + '> Hide ' + (addon ? 'add-ons' : 'this category') + ' from customers</label>' + g.items.map(function (i) { return itemRow(gi, i); }).join('') +
        '<button class="btn secondary small-btn" type="button" data-pl-add="' + gi + '">＋ Add item</button></div>';
    }).join('') + '<div class="two-btn"><button class="btn block" type="button" id="plAddCat">＋ Add category</button><button class="btn secondary block" type="button" id="plAddAddon">＋ Add-on section</button></div>';
    page.innerHTML = '<div class="page-head"><button class="icon-btn" data-back>‹ Back</button><h2>Price list</h2><span></span></div><div class="page-body">' +
      (hasExamples() || data.exampleIntro ? '<div class="pl-banner" id="plBanner">⚠️ <b>These are example prices.</b> Replace them with your real prices before you share. Items marked EXAMPLE haven’t been changed yet – tap one to edit it, or 🗑 to remove it.</div>' : '') +
      '<div class="card pl-share"><button class="btn block big" type="button" id="plShare">📤 Share price list</button>' +
      '<p class="muted small" id="plStatus"></p><a class="btn link" id="plPreview" target="_blank" rel="noopener" hidden>👀 Preview what customers see</a></div>' +
      '<div class="card"><label class="field-label" for="plTitle">Title</label><input class="text-input" id="plTitle" maxlength="80" placeholder="' + esc(title()) + '" value="' + esc(data.title) + '">' +
      '<label class="field-label" for="plIntro" style="margin-top:10px">Note at the top</label><textarea class="text-input" id="plIntro" rows="3" maxlength="600">' + esc(data.intro) + '</textarea>' +
      '<label class="field-label" for="plContact" style="margin-top:10px">How to order (optional)</label><input class="text-input" id="plContact" maxlength="120" placeholder="e.g. Text 555-123-4567 to order" value="' + esc(data.contact) + '"></div>' +
      groups + '<p class="muted small center">Changes save automatically. Once shared, your link stays the same and always shows your latest prices.</p></div>';
    renderStatus();
    page.oninput = function (e) {
      var t = e.target, row = t.closest('.pl-item');
      if (t.id === 'plTitle') data.title = t.value; else if (t.id === 'plIntro') { data.intro = t.value; data.exampleIntro = false; } else if (t.id === 'plContact') data.contact = t.value;
      else if (t.dataset.gf) { var gg = data.groups[+t.dataset.g]; if (t.dataset.gf === 'hidden') { gg.hidden = t.checked; t.closest('.pl-group').classList.toggle('is-hidden', t.checked); } else gg[t.dataset.gf] = t.value; changed(); return; }
      else if (t.dataset.plPhoto) return;
      else if (row) {
        var it = find(row); if (!it) return; it[t.dataset.f] = t.value;
        if (it.example) { it.example = false; row.classList.remove('is-example'); var x = row.querySelector('.pl-ex'); if (x) x.remove(); }
      }
      if (!hasExamples()) { data.exampleIntro = false; var b = document.getElementById('plBanner'); if (b) b.remove(); }
      changed();
    };
    page.onclick = function (e) {
      var t = e.target, el;
      if ((el = t.closest('[data-pl-del]'))) {
        var row = el.closest('.pl-item'), g = data.groups[+row.dataset.gi];
        g.items = g.items.filter(function (i) { return i.id !== row.dataset.id; }); changed(); keep(render); return;
      }
      if ((el = t.closest('[data-pl-add]'))) {
        var it = { id: rid(), name: '', price: '', note: '' }; data.groups[+el.dataset.plAdd].items.push(it); save(); keep(render);
        var inp = page.querySelector('[data-id="' + it.id + '"] .pl-name'); if (inp) inp.focus(); return;
      }
      if (t.closest('#plShare')) { share(); return; }
      var gi;
      if ((el = t.closest('[data-pl-up]')) || (el = t.closest('[data-pl-down]'))) {
        gi = +(el.dataset.plUp || el.dataset.plDown); var to = el.dataset.plUp !== undefined ? gi - 1 : gi + 1;
        if (to < 0 || to >= data.groups.length) return;
        var mv = data.groups.splice(gi, 1)[0]; data.groups.splice(to, 0, mv); changed(); keep(render); return;
      }
      if ((el = t.closest('[data-pl-gdel]'))) {
        gi = +el.dataset.plGdel; var dg = data.groups[gi];
        if (!confirm('Delete “' + (dg.label || 'this category') + '” and its ' + dg.items.length + ' item' + (dg.items.length === 1 ? '' : 's') + '?')) return;
        data.groups.splice(gi, 1); changed(); keep(render); deps.toast('Category deleted'); return;
      }
      if ((el = t.closest('[data-pl-unphoto]'))) { delete data.groups[+el.dataset.plUnphoto].photo; changed(); keep(render); return; }
      if (t.closest('#plAddCat') || t.closest('#plAddAddon')) {
        var isAdd = !!t.closest('#plAddAddon'), name = prompt(isAdd ? 'Name for the add-on section (e.g. Extras)' : 'Name for the new category (e.g. Pies, Brownies)', isAdd ? 'Extras' : '');
        if (!name || !name.trim()) return;
        var ng = { type: isAdd ? 'other' : 'custom', label: name.trim().slice(0, 40), emoji: isAdd ? '✨' : '🍰', addon: isAdd, tagline: '', items: [{ id: rid(), name: '', price: '', note: '' }] };
        ng.slug = uniqueSlug(ng.label); data.groups.push(ng); changed(); render();
        var card = page.querySelector('[data-slug="' + ng.slug + '"]'); if (card) { card.scrollIntoView({ block: 'start' }); var fi = card.querySelector('.pl-name'); if (fi) fi.focus(); }
        return;
      }
    };
    page.onchange = function (e) {
      var t = e.target; if (!t.dataset || t.dataset.plPhoto === undefined) return;
      var f = t.files && t.files[0]; if (f) uploadPhoto(data.groups[+t.dataset.plPhoto], f);
    };
    return page;
  }
  function keep(fn) { var p = document.getElementById('page-prices'), y = p.scrollTop; fn(); p.scrollTop = y; }
  function find(row) { var g = data.groups[+row.dataset.gi]; return g && g.items.filter(function (i) { return i.id === row.dataset.id; })[0]; }
  function renderStatus() {
    var el = document.getElementById('plStatus'), pv = document.getElementById('plPreview'); if (!el) return;
    if (!data.token) { el.textContent = 'Not shared yet. Tap Share to get a link you can text to customers.'; pv.hidden = true; return; }
    el.innerHTML = (data.dirty ? '⏳ Saving changes to your link…' : '✅ Your link is up to date.') + '<br><span class="pl-url">' + esc(url()) + '</span>';
    pv.href = url(); pv.hidden = false;
  }
  function share() {
    if (hasExamples() && !confirm('Some prices are still EXAMPLES. Share anyway?')) return;
    var btn = document.getElementById('plShare'); btn.disabled = true; btn.textContent = '⏳ Getting your link…';
    clearTimeout(timer);
    publish().then(function (u) {
      renderStatus(); btn.disabled = false; btn.textContent = '📤 Share price list';
      var text = 'Here are my prices: ' + u + '\n' + DISCLAIMER;
      if (navigator.share) navigator.share({ title: title(), text: 'Here are my prices:\n' + DISCLAIMER, url: u }).catch(function () {});
      else location.href = 'sms:?&body=' + encodeURIComponent(text);
    }, function (e) {
      renderStatus(); btn.disabled = false; btn.textContent = '📤 Share price list';
      deps.toast(navigator.onLine === false ? 'You’re offline – connect to the internet and try again.' : 'Couldn’t publish the price list (' + e.message + '). Try again in a minute.', 5000);
    });
  }
  function init(d) {
    deps = d;
    return deps.kvGet('priceList').then(function (s) {
      data = s && s.groups ? s : seed();
      // v10.4: lists saved before Cookies existed get the Cookies group (before Oatmeal cream pies)
      if (!data.cookiesAdded) {
        if (!data.groups.some(function (g) { return g.type === 'cookies'; })) {
          var at = data.groups.findIndex(function (g) { return g.type === 'creampies'; });
          data.groups.splice(at < 0 ? data.groups.length : at, 0, cookieGroup()); if (data.token) data.dirty = true;
        }
        data.cookiesAdded = true; save();
      }
      if (migrate()) { if (data.token) data.dirty = true; save(); }
      window.addEventListener('online', retryIfDirty);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) retryIfDirty(); });
      setTimeout(retryIfDirty, 3000);
    });
  }
  window.CakePrices = { squareJpeg: squareJpeg, uploadPhoto: uploadPhoto, DISCLAIMER: DISCLAIMER, init: init, render: render, publish: publish, url: url, hasExamples: hasExamples, data: function () { return data; } };
})();
