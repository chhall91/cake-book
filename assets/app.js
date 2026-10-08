/* Cake Book – main app. Plain JS, no dependencies. Data lives in IndexedDB (localStorage fallback). */
(function () {
  'use strict';
  var P = window.CakeParser, ICS = window.CakeICS, PR = window.CakeProducts;

  // ---------- constants ----------
  var STATUSES = ['Inquiry', 'Confirmed', 'In progress', 'Ready', 'Delivered/Picked up', 'Paid'];
  var DEFAULT_REMINDERS = [{ days: 3, time: '09:00' }, { days: 0, time: '08:00' }];
  var OCCASION_LIST = ['Birthday', 'Wedding', 'Anniversary', 'Baby shower', 'Bridal shower', 'Gender reveal', 'Graduation', 'Retirement', 'Christening', 'Baptism', 'Holiday', 'Just because'];
  var FLAVOR_LIST = ['Vanilla', 'Chocolate', 'Red velvet', 'Lemon', 'Strawberry', 'Funfetti', 'Carrot', 'Marble', 'Almond', 'Coconut', 'Salted caramel', 'Cookies & cream'];
  var FILLING_LIST = ['Strawberry', 'Raspberry', 'Lemon curd', 'Chocolate ganache', 'Buttercream', 'Cream cheese', 'Salted caramel', 'Cookies & cream', 'Fresh fruit'];
  var FROSTING_LIST = ['Buttercream', 'Swiss meringue buttercream', 'Cream cheese frosting', 'Whipped cream', 'Fondant', 'Chocolate ganache', 'Naked'];
  var SIZE_LIST = ['4 inch', '6 inch', '8 inch', '10 inch', '6 & 8 inch', 'Quarter sheet', 'Half sheet', 'Full sheet'];
  var SHAPES = ['', 'Round', 'Square', 'Heart', 'Sheet', 'Rectangle', 'Number', 'Letter', 'Carved', 'Other'];
  var CUP_FLAVOR_LIST = ['Vanilla', 'Chocolate', 'Red velvet', 'Lemon', 'Strawberry', 'Funfetti', 'Vanilla & chocolate', 'Carrot', 'Cookies & cream', 'Salted caramel', 'Pumpkin spice', 'Coconut'];
  var COOKIE_LIST = ['Oatmeal (classic)', 'Brown sugar oatmeal', 'Chocolate oatmeal', 'Pumpkin oatmeal', 'Oatmeal raisin', 'Cinnamon oatmeal', 'Maple oatmeal', 'Gingerbread oatmeal'];
  var CP_FILLING_LIST = ['Marshmallow creme', 'Vanilla buttercream', 'Cream cheese', 'Brown butter', 'Maple', 'Cinnamon', 'Chocolate', 'Pumpkin spice', 'Peanut butter', 'Salted caramel'];
  var CUP_SIZES = ['Regular', 'Mini', 'Jumbo'], CP_SIZES = ['Regular', 'Mini'];
  var LINER_LIST = ['White', 'Gold foil', 'Silver foil', 'Pink', 'Blue', 'Black', 'Polka dot', 'Clear / none'];
  var PACKAGING_LIST = ['Bakery box', 'Gift box', 'Boxes of 6', 'Boxes of 12', 'Tray / platter', 'Cellophane bags', 'Treat bags with ribbon'];
  var REM_DAYS = [[0, 'Same day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [4, '4 days before'], [5, '5 days before'], [7, '1 week before'], [14, '2 weeks before']];

  // Fields: types = which product types show the field (default: all); labels / lists = per-type label and suggestions.
  var CU = ['cupcakes'], CP = ['creampies'], CK = ['cake'], BAKED = ['cupcakes', 'creampies'];
  var FORM = [
    { title: '🍰 What are they ordering?', fields: [{ k: 'productType', type: 'typepicker' },
      { k: 'bulk', type: 'switch', label: '👥 Bulk / group order', hint: 'Lots of people, each with their own dozens and payment (fundraisers, offices, teams)', types: BAKED }] },
    { title: '👤 Customer', fields: [
      { k: 'name', label: 'Customer name *', labels: { bulk: 'Group or fundraiser name *' }, type: 'text', cap: 'words' },
      { k: 'organizer', label: 'Organizer (contact person)', type: 'text', cap: 'words', bulk: 'only' },
      { k: 'phone', label: 'Phone', labels: { bulk: 'Organizer phone' }, type: 'tel' },
      { k: 'email', label: 'Email', type: 'email' },
      { k: 'fulfillment', label: 'Pickup or delivery', type: 'segmented', options: [['pickup', '🏠 Pickup'], ['delivery', '🚗 Delivery']] },
      { k: 'address', label: 'Delivery address', labels: { bulk: 'Pickup spot / delivery address' }, type: 'textarea', rows: 2, showIf: 'delivery', bulkShow: true },
      { k: 'customerNotes', label: 'Notes (private – not texted)', type: 'textarea', rows: 2 }
    ] },
    { title: '🎂 Cake', product: true, fields: [
      { k: 'occasion', label: 'Occasion', type: 'text', list: OCCASION_LIST, cap: 'sentences' },
      { k: 'dueDate', label: 'Due date *', type: 'date' },
      { row: [{ k: 'dueTime', label: 'Time', type: 'time' }, { k: 'tiers', label: 'Tiers', type: 'number', min: 1, max: 9, types: CK },
        { k: 'itemSize', label: 'Size', type: 'select', optionsBy: { cupcakes: CUP_SIZES, creampies: CP_SIZES }, types: BAKED }] },
      { row: [{ k: 'qty', label: 'How many', type: 'qty', types: BAKED, bulk: 'hide' }, { k: 'qtyUnit', label: 'Counted in', type: 'segmented', options: [['dozen', 'Dozen'], ['each', 'Each']], types: BAKED, small: true, bulk: 'hide' }] },
      { k: 'size', label: 'Size', type: 'text', list: SIZE_LIST, types: CK },
      { row: [{ k: 'servings', label: 'Servings', type: 'number', min: 1, types: CK }, { k: 'shape', label: 'Shape', type: 'select', options: SHAPES, types: CK }] },
      { k: 'flavor', label: 'Cake flavor', labels: { cupcakes: 'Cupcake flavor(s)', creampies: 'Cookie flavor', bulk_cupcakes: 'Default cupcake flavor', bulk_creampies: 'Default cookie flavor' }, type: 'text', list: FLAVOR_LIST, lists: { cupcakes: CUP_FLAVOR_LIST, creampies: COOKIE_LIST }, cap: 'sentences' },
      { k: 'filling', label: 'Filling', labels: { creampies: 'Filling flavor', bulk: 'Default filling' }, type: 'text', list: FILLING_LIST, lists: { creampies: CP_FILLING_LIST }, cap: 'sentences' },
      { k: 'frosting', label: 'Frosting', type: 'text', list: FROSTING_LIST, cap: 'sentences', types: ['cake', 'cupcakes'] },
      { k: 'design', label: 'Colors / design', labels: { cupcakes: 'Decorations / toppers' }, type: 'textarea', rows: 3, types: ['cake', 'cupcakes'] },
      { k: 'liners', label: 'Liners / colors', type: 'text', list: LINER_LIST, cap: 'sentences', types: CU },
      { k: 'wrapped', label: 'Individually wrapped?', type: 'segmented', options: [['yes', '✓ Yes'], ['no', 'No']], types: CP },
      { k: 'packaging', label: 'Packaging', type: 'text', list: PACKAGING_LIST, cap: 'sentences', types: CP },
      { k: 'message', label: 'Message on cake', labels: { cupcakes: 'Message / writing' }, type: 'text', cap: 'sentences', types: ['cake', 'cupcakes'], bulk: 'hide' },
      { k: 'allergies', label: 'Allergies / dietary', type: 'text' }
    ] },
    { title: '💵 Price & status', fields: [
      { row: [{ k: 'price', label: 'Price ($)', type: 'money', bulk: 'hide' }, { k: 'deposit', label: 'Deposit paid ($)', type: 'money', bulk: 'hide' }] },
      { row: [{ k: 'pricePerDozen', label: 'Price per dozen ($)', type: 'money', bulk: 'only' }, { k: 'pricePerHalf', label: 'Half dozen ($, optional)', type: 'money', bulk: 'only' }] },
      { k: '_balance', type: 'balance', bulk: 'hide' },
      { k: 'status', label: 'Status', type: 'select', options: STATUSES }
    ] }
  ];

  // ---------- storage (IndexedDB via photos.js: "kv" store for orders/settings, "photos" store for image blobs) ----------
  var Store = window.CakeStore, PH = window.CakePhotos;
  var DB = { get: Store.kvGet, set: Store.kvSet };

  var state = { orders: [], settings: { defaultReminders: DEFAULT_REMINDERS.slice(), notified: {} } };
  function persist() { return DB.set('orders', state.orders); }
  var Push = window.CakePush;
  function persistSettings() { return DB.set('settings', state.settings); }

  // ---------- utils ----------
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
  function fmtTime(t) { if (!t) return ''; var p = t.split(':'); return new Date(2000, 0, 1, +p[0], +p[1]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function fmtDate(s, opts) { return s ? parseISO(s).toLocaleDateString([], opts || { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'; }
  function money(n) { if (n === '' || n == null || isNaN(n)) return '—'; return '$' + Number(n).toFixed(2).replace(/\.00$/, ''); }
  function balance(o) { return o.status === 'Paid' ? 0 : Math.max((+o.price || 0) - (+o.deposit || 0), 0); }
  function isClosed(o) { return o.status === 'Delivered/Picked up' || o.status === 'Paid'; }
  function isPast(o) { return o.dueDate && parseISO(o.dueDate) < startOfDay(new Date()); }
  function isDone(o) { return o.status === 'Delivered/Picked up' || (o.status === 'Paid' && isPast(o)); }
  function statusClass(s) { return 'st-' + String(s || '').replace(/[^A-Za-z]+/g, '-'); }
  function relDay(s) {
    if (!s) return '';
    var n = daysBetween(new Date(), parseISO(s));
    if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday';
    return n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
  }
  function sortKey(o) { return (o.dueDate || '9999-99-99') + 'T' + (o.dueTime || '99:99'); }
  function byDue(a, b) { return sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0; }
  function occasionEmoji(o) {
    var s = (o.occasion || '').toLowerCase();
    if (/wedding|engage|bridal/.test(s)) return '💍'; if (/baby|gender|christen|baptis/.test(s)) return '🍼';
    if (/graduat/.test(s)) return '🎓'; if (/anniv|valentine/.test(s)) return '💕'; if (/birthday/.test(s)) return '🎈';
    if (/christmas|holiday/.test(s)) return '🎄'; if (/retire/.test(s)) return '🌴'; return '🎂';
  }
  function orderEmoji(o) { return PR.typeOf(o) === 'cake' ? occasionEmoji(o) : PR.info(o).emoji; }
  function typePill(o) { var t = PR.typeOf(o), ti = PR.TYPES[t]; return '<span class="pill type-pill tp-' + t + '">' + ti.emoji + ' ' + esc(t === 'cake' ? 'Cake' : ti.plural) + '</span>'; }
  // Customer-confirmation state: 'confirmed' | 'changed' (details edited after the customer confirmed) | 'sent' | ''
  function confirmState(o) {
    if (o.customerConfirmedAt) return o.confirmedSig && o.confirmedSig !== PR.confirmSig(o) ? 'changed' : 'confirmed';
    return o.confirmSentAt ? 'sent' : '';
  }
  function confirmPill(o) {
    var c = confirmState(o);
    return c === 'confirmed' ? '<span class="pill ok">✅ Customer confirmed</span>' : c === 'changed' ? '<span class="pill warn">✏️ Changed since confirmed</span>' : c === 'sent' ? '<span class="pill plain">💬 Waiting for reply</span>' : '';
  }
  function telHref(p) { return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }
  function smsHref(p) { return 'sms:' + String(p || '').replace(/[^\d+]/g, ''); }
  var toastTimer;
  function toast(msg, ms) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600); }
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var IS_STANDALONE = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function getOrder(id) { return state.orders.find(function (o) { return o.id === id; }); }
  function slug(s) { return String(s || 'order').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'order'; }

  // ---------- file delivery ----------
  function blobDownload(name, text, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime }));
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  // iOS only hands an .ics to the Calendar app ("Add All" sheet) when it arrives from a real URL served
  // as text/calendar. We store the file in Cache Storage and the service worker serves it at ./ics/<name>.ics.
  var ICS_CACHE = 'cakebook-ics';
  function serveICS(name, text) {
    if (!('caches' in window) || !navigator.serviceWorker || !navigator.serviceWorker.controller) return Promise.reject(new Error('no sw'));
    var path = 'ics/' + Date.now().toString(36) + '/' + name;
    var url = new URL(path, location.href).href;
    return caches.open(ICS_CACHE).then(function (c) {
      return c.put(url, new Response(text, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="' + name + '"', 'Cache-Control': 'no-store' } }));
    }).then(function () { return url; });
  }
  function openCalendarFile(name, text) {
    if (!IS_IOS) { blobDownload(name, text, 'text/calendar;charset=utf-8'); toast('Calendar file downloaded – open it to add to your calendar.', 4500); return; }
    serveICS(name, text).then(function (url) {
      // In Safari this shows the Calendar "Add All" sheet. In the Home-Screen app a new window keeps the app intact.
      if (IS_STANDALONE) window.open(url, '_blank'); else location.href = url;
      toast('Tap “Add All” to put it in your Calendar 📅', 5000);
    }).catch(function () {
      shareOrDownload(name, text, 'text/calendar');
    });
  }
  // Fallback: share sheet → "Save to Files", then tap the file in Files to open Calendar.
  function shareOrDownload(name, text, mime) {
    try {
      var file = new File([text], name, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          blobDownload(name, text, mime);
        });
        toast('Choose “Save to Files”, then tap the file in Files to add it to Calendar.', 6000);
        return;
      }
    } catch (e) {}
    blobDownload(name, text, mime);
    toast('Downloaded. Open it from Files/Downloads to add it to your calendar.', 5000);
  }

  // ---------- speech ----------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var activeRec = null;
  function stopActive() {
    if (activeRec) { try { activeRec.onend = null; activeRec.abort(); } catch (e) {} activeRec = null; }
    $$('.mic.listening').forEach(function (b) { b.classList.remove('listening'); });
  }
  function newRec(continuous) { var r = new SR(); r.lang = navigator.language || 'en-US'; r.continuous = !!continuous; r.interimResults = true; r.maxAlternatives = 1; return r; }
  function speechError(e) {
    var m = { 'not-allowed': 'Microphone blocked. Allow the mic (Settings › Safari › Microphone), or use the 🎤 key on your keyboard.',
      'service-not-allowed': 'Voice input is off here. Use the 🎤 key on your keyboard instead (Settings › General › Keyboard › Enable Dictation).',
      'no-speech': "I didn't hear anything – try again.", 'network': 'Voice recognition needs an internet connection.', 'audio-capture': 'No microphone found.' }[e.error];
    if (m) toast(m, 5000);
  }
  // Dictate into a single field.
  function micForField(btn, input) {
    if (!SR) { input.focus(); toast('Tap the 🎤 key on your keyboard to dictate', 3500); return; }
    if (btn.classList.contains('listening')) { stopActive(); return; }
    stopActive();
    var rec = newRec(false), base = input.value, finalText = '';
    var kind = input.dataset.kind || input.type;
    var liveText = kind === 'text' || kind === 'textarea';
    rec.onresult = function (ev) {
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript; else interim += ev.results[i][0].transcript;
      }
      if (liveText) input.value = (base ? base + ' ' : '') + (finalText + interim).trim();
    };
    rec.onerror = function (e) { speechError(e); };
    rec.onend = function () {
      btn.classList.remove('listening'); activeRec = null;
      var said = finalText.trim(); if (!said) { if (liveText) input.value = base; return; }
      if (kind === 'date') {
        var d = P.parseDateTime(said);
        if (d.date) input.value = d.date; else toast('Could not understand that date: “' + said + '”');
        if (d.time && input.form && input.form.dueTime && !input.form.dueTime.value) input.form.dueTime.value = d.time;
      } else if (kind === 'dozen') {
        var bl = P.parseBulkLine('x ' + said);
        if (bl && bl.dozen !== '') input.value = bl.dozen; else toast('Could not understand that amount: “' + said + '”');
      } else if (kind === 'qty') {
        var q = P.parseQuantity(said);
        if (q) { input.value = q.qty; var u = input.form && input.form.querySelector('input[name=qtyUnit][value=' + q.unit + ']'); if (u) u.checked = true; }
        else toast('Could not understand that amount: “' + said + '”');
      } else if (kind === 'tel') input.value = P.formatPhone(P.wordsToNumbers(said).replace(/[^\d+]/g, ''));
      else if (kind === 'email') input.value = P.normalizeSpokenEmail(said);
      else { var txt = said.charAt(0).toUpperCase() + said.slice(1); input.value = (base ? base + ' ' : '') + txt; }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    try { rec.start(); activeRec = rec; btn.classList.add('listening'); } catch (e) { toast('Could not start the microphone'); }
  }

  // ---------- router ----------
  var navCount = 0, pendingDraft = null;
  var calState = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selected: iso(new Date()) };
  function route() {
    stopActive(); if (bigListening) stopBigMic(); PH.close(); if (!$('#sheetWrap').hidden) closeSheet();
    var h = location.hash || '#/upcoming';
    var parts = h.slice(2).split('?')[0].split('/');
    $$('.page').forEach(function (p) { p.hidden = true; });
    document.body.classList.remove('page-open');
    var page = null;
    if (parts[0] === 'order' && parts[1]) page = renderDetail(parts[1]);
    else if (parts[0] === 'edit' && parts[1]) page = renderForm(getOrder(parts[1]), false);
    else if (parts[0] === 'new') { page = renderForm(pendingDraft, !!(pendingDraft && pendingDraft.transcript)); pendingDraft = null; }
    else if (parts[0] === 'voice') page = renderVoice();
    if (page) { page.hidden = false; page.scrollTop = 0; document.body.classList.add('page-open'); return; }
    var tab = ['upcoming', 'calendar', 'orders', 'settings'].indexOf(parts[0]) >= 0 ? parts[0] : 'upcoming';
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + tab; });
    $$('.tabbar a[data-tab]').forEach(function (a) { a.classList.toggle('on', a.dataset.tab === tab); });
    $('#pageTitle').textContent = $('#view-' + tab).dataset.title;
    if (tab === 'upcoming') renderBanner(); else $('#banner').hidden = true;
    ({ upcoming: renderUpcoming, calendar: renderCalendar, orders: renderOrders, settings: renderSettings })[tab]();
    window.scrollTo(0, 0);
  }
  function goBack() { if (navCount > 0) history.back(); else location.hash = '#/upcoming'; }

  // ---------- cards ----------
  function cardHTML(o, opts) {
    opts = opts || {};
    var overdue = isPast(o) && !isDone(o);
    var desc = PR.cardDesc(o), isCake = PR.typeOf(o) === 'cake';
    var t = o.dueTime ? fmtTime(o.dueTime) : '', ampm = (t.match(/\s?[AP]M$/i) || [''])[0];
    var timeBox = opts.showDate
      ? '<div class="time">' + esc(o.dueDate ? fmtDate(o.dueDate, { month: 'short', day: 'numeric' }) : '—') + '<small>' + esc(t || (o.dueDate ? parseISO(o.dueDate).getFullYear() : '')) + '</small></div>'
      : '<div class="time">' + (t ? esc(t.replace(ampm, '')) + '<small>' + esc(ampm.trim()) + '</small>' : '<small>All day</small>') + '</div>';
    var bal = PR.isBulk(o) ? PR.bulkTotals(o).outstanding : balance(o);
    return '<div class="order-card' + (overdue ? ' overdue' : '') + '" role="button" tabindex="0" data-open="' + esc(o.id) + '">' + timeBox +
      '<div class="info"><div class="name">' + orderEmoji(o) + ' ' + esc(o.name || 'Unnamed') + '</div>' +
      '<div class="desc">' + esc([o.occasion, desc].filter(Boolean).join(' – ') || (isCake ? 'No cake details yet' : PR.productPhrase(o))) + '</div>' +
      '<div class="meta">' + typePill(o) + (PR.isBulk(o) ? '<span class="pill bulk-pill">👥 Bulk</span>' : '') + '<span class="pill ' + statusClass(o.status) + '">' + esc(o.status) + '</span>' +
      '<span class="pill plain">' + (o.fulfillment === 'delivery' ? '🚗 Delivery' : '🏠 Pickup') + '</span>' +
      (o.allergies ? '<span class="pill warn">⚠ Allergy</span>' : '') +
      (bal > 0 && !PR.isBulk(o) ? '<span class="pill plain">Due ' + money(bal) + '</span>' : '') +
      (nPhotos(o) ? '<span class="pill photo-pill" aria-label="' + nPhotos(o) + ' photos">📷 ' + nPhotos(o) + '</span>' : '') +
      confirmPill(o) + (overdue ? '<span class="pill warn">Past due</span>' : '') + '</div></div>' +
      (nPhotos(o) ? '<img class="thumb" data-pid="' + esc(o.photos[0].id) + '" alt="">' : '') +
      (o.phone ? '<a class="call" href="' + telHref(o.phone) + '" aria-label="Call ' + esc(o.name) + '" data-stop>📞</a>' : '') +
      '</div>';
  }
  function nPhotos(o) { return (o.photos && o.photos.length) || 0; }
  function emptyHTML(title, text) { return '<div class="empty"><span class="big-emoji">🧁</span><h3>' + esc(title) + '</h3><p>' + text + '</p></div>'; }

  // ---------- upcoming ----------
  var typeFilter = 'all';
  try { typeFilter = sessionStorage.getItem('typeFilter') || 'all'; } catch (e) {}
  function renderTypeChips(box, counts) {
    box.innerHTML = [['all', '📋', 'All']].concat(PR.ORDER.map(function (k) { return [k, PR.TYPES[k].emoji, PR.TYPES[k].plural]; })).map(function (c) {
      var n = counts[c[0]] || 0;
      return '<button class="chip' + (c[0] === typeFilter ? ' on' : '') + '" data-typefilter="' + c[0] + '" aria-pressed="' + (c[0] === typeFilter) + '" aria-label="' + esc(c[2] + ', ' + n) + '">' +
        '<span class="te">' + c[1] + (n ? '<span class="chip-n">' + n + '</span>' : '') + '</span><span class="tl">' + esc(c[2]) + '</span></button>';
    }).join('');
  }
  function renderUpcoming() {
    var showDone = $('#showDone').checked;
    var counts = { all: 0 };
    state.orders.forEach(function (o) { if (!isDone(o) || showDone) { counts.all++; var t = PR.typeOf(o); counts[t] = (counts[t] || 0) + 1; } });
    renderTypeChips($('#typeChips'), counts);
    var today = startOfDay(new Date()), weekEnd = addDays(today, 7);
    var g = { overdue: [], today: [], week: [], later: [], nodate: [], done: [] };
    state.orders.slice().sort(byDue).forEach(function (o) {
      if (typeFilter !== 'all' && PR.typeOf(o) !== typeFilter) return;
      if (!o.dueDate) { g.nodate.push(o); return; }
      var d = parseISO(o.dueDate);
      if (isDone(o)) { if (showDone) g.done.push(o); return; }
      if (d < today) g.overdue.push(o);
      else if (+d === +today) g.today.push(o);
      else if (d <= weekEnd) g.week.push(o);
      else g.later.push(o);
    });
    var html = '';
    function section(title, list, byDay) {
      if (!list.length) return;
      html += '<h2 class="group-title">' + title + ' <span class="count">' + list.length + '</span></h2>';
      var lastDay = null;
      list.forEach(function (o) {
        if (byDay && o.dueDate !== lastDay) { lastDay = o.dueDate; html += '<div class="day-label">' + esc(fmtDate(o.dueDate, { weekday: 'long', month: 'short', day: 'numeric' })) + ' · ' + relDay(o.dueDate) + '</div>'; }
        html += cardHTML(o);
      });
    }
    section('⚠️ Past due', g.overdue, true);
    section('Today', g.today, false);
    section('This week', g.week, true);
    section('Later', g.later, true);
    section('No date yet', g.nodate, false);
    section('Finished', g.done.reverse(), true);
    if (!html && typeFilter !== 'all' && state.orders.length) html = emptyHTML('No ' + PR.TYPES[typeFilter].plural.toLowerCase() + ' coming up', 'Tap <b>All</b> to see every order.');
    if (!html) html = state.orders.length
      ? emptyHTML('All caught up!', 'No upcoming orders. Tap “Talk to add an order” when the next one comes in.')
      : emptyHTML('No cake orders yet', 'Tap <b>🎤 Talk to add a cake</b> and just say the order,<br>or type it in with <b>⌨️ Type an order</b>.');
    $('#upcomingList').innerHTML = html;
    PH.hydrate($('#upcomingList'));
  }

  // ---------- calendar ----------
  function renderCalendar() {
    var m = calState.month, mo = m.getMonth();
    $('#calTitle').textContent = m.toLocaleDateString([], { month: 'long', year: 'numeric' });
    var byDay = {};
    state.orders.forEach(function (o) { if (o.dueDate) (byDay[o.dueDate] = byDay[o.dueDate] || []).push(o); });
    var start = addDays(m, -m.getDay());
    var html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');
    var todayIso = iso(new Date());
    for (var i = 0; i < 42; i++) {
      var d = addDays(start, i), di = iso(d), list = byDay[di] || [];
      if (i % 7 === 0 && i >= 28 && d.getMonth() !== mo) break;
      var cls = 'cal-day' + (d.getMonth() !== mo ? ' other' : '') + (di === todayIso ? ' today' : '') + (di === calState.selected ? ' selected' : '') + (list.length ? ' has' : '');
      var dots = list.slice(0, 4).map(function (o) { return '<i class="dot dot-' + PR.typeOf(o) + (isClosed(o) ? ' done' : '') + '"></i>'; }).join('');
      html += '<button class="' + cls + '" data-day="' + di + '" aria-label="' + esc(d.toDateString() + (list.length ? ', ' + list.length + ' order' + (list.length > 1 ? 's' : '') : '')) + '">' + d.getDate() + '<span class="dots">' + dots + '</span></button>';
    }
    $('#calGrid').innerHTML = html;
    var sel = (byDay[calState.selected] || []).sort(byDue);
    $('#calDayTitle').textContent = fmtDate(calState.selected, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#calDayList').innerHTML = sel.length ? sel.map(function (o) { return cardHTML(o); }).join('')
      : '<p class="muted center">No orders this day. <a href="#/new" data-newon="' + calState.selected + '">Add one</a></p>';
    PH.hydrate($('#calDayList'));
  }

  // ---------- all orders / search ----------
  var orderFilter = 'All';
  function renderOrders() {
    $('#statusFilter').innerHTML = ['All'].concat(STATUSES).map(function (s) { return '<button class="chip' + (s === orderFilter ? ' on' : '') + '" data-filter="' + esc(s) + '">' + esc(s) + '</button>'; }).join('');
    var q = $('#searchInput').value.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    var list = state.orders.filter(function (o) {
      if (orderFilter !== 'All' && o.status !== orderFilter) return false;
      if (!q) return true;
      var hit = function (n, ph) { return (n || '').toLowerCase().indexOf(q) >= 0 || (qd.length >= 3 && (ph || '').replace(/\D/g, '').indexOf(qd) >= 0); };
      return hit(o.name, o.phone) || (o.organizer && hit(o.organizer, '')) || (PR.isBulk(o) && (o.people || []).some(function (p) { return hit(p.name, p.phone); }));
    }).sort(function (a, b) { return byDue(b, a); });
    $('#ordersList').innerHTML = list.length ? list.map(function (o) { return cardHTML(o, { showDate: true }); }).join('')
      : (state.orders.length ? emptyHTML('No matches', 'No orders match “' + esc(q) + '”.') : emptyHTML('No orders yet', 'Orders you add will show up here.'));
    PH.hydrate($('#ordersList'));
  }

  // ---------- detail ----------
  function remLabel(r) { return (REM_DAYS.find(function (x) { return x[0] === +r.days; }) || [0, r.days + ' days before'])[1]; }
  function renderDetail(id) {
    var o = getOrder(id), page = $('#page-detail');
    if (!o) { page.innerHTML = '<div class="page-head"><button class="icon-btn" data-back>‹ Back</button><h2>Not found</h2><span></span></div><div class="page-body">' + emptyHTML('Order not found', 'It may have been deleted.') + '</div>'; return page; }
    function row(k, v) { return v === '' || v == null ? '' : '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
    var rems = (o.reminders || []).map(function (r) {
      var when = o.dueDate ? ICS.reminderDate(o, r) : null;
      return '<li>' + esc(remLabel(r)) + ' at ' + esc(fmtTime(r.time)) + (when ? ' <span class="muted">(' + esc(when.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + ')</span>' : '') + '</li>';
    }).join('');
    var mapUrl = o.address ? 'https://maps.apple.com/?q=' + encodeURIComponent(o.address) : '';
    page.innerHTML =
      '<div class="page-head"><button class="icon-btn" data-back>‹ Back</button><h2>' + esc(o.name || 'Order') + '</h2><a class="icon-btn strong linkbtn" href="#/edit/' + esc(o.id) + '">Edit</a></div>' +
      '<div class="page-body">' +
      '<div class="detail-hero"><div class="hero-emoji">' + orderEmoji(o) + '</div>' +
      '<div class="hero-product">' + esc(PR.productPhrase(o)) + '</div>' +
      '<div class="when">' + esc(fmtDate(o.dueDate)) + (o.dueTime ? ' · ' + esc(fmtTime(o.dueTime)) : '') + '</div>' +
      '<div class="sub">' + esc([PR.isBulk(o) ? '👥 Bulk order' : '', o.occasion, relDay(o.dueDate), o.fulfillment === 'delivery' ? '🚗 Delivery' : '🏠 Pickup'].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="action-row">' +
      (o.phone ? '<a href="' + telHref(o.phone) + '"><span>📞</span>Call</a><a href="' + smsHref(o.phone) + '"><span>💬</span>Text</a>' : '') +
      (o.email ? '<a href="mailto:' + esc(o.email) + '"><span>✉️</span>Email</a>' : '') +
      (mapUrl ? '<a href="' + mapUrl + '" target="_blank" rel="noopener"><span>🗺️</span>Map</a>' : '') +
      '<button data-ics="' + esc(o.id) + '"><span>📅</span>Calendar</button></div>' +
      (o.allergies ? '<div class="allergy">⚠️ Allergies / dietary: ' + esc(o.allergies) + '</div>' : '') +
      (PR.isBulk(o) ? bulkCardHTML(o) : '') +
      confirmCardHTML(o) +
      '<div class="card"><h4 class="mt0">Status</h4><div class="status-picker">' + STATUSES.map(function (s) { return '<button class="' + statusClass(s) + (o.status === s ? ' on' : '') + '" data-status="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>📷 Photos' + (nPhotos(o) ? ' <span class="count">' + nPhotos(o) + '</span>' : '') + '</h3>' +
      (nPhotos(o) ? '<div class="photo-grid">' + o.photos.map(function (p, i) {
        return '<button class="ph-tile" data-photo-open="' + esc(o.id) + '" data-i="' + i + '" aria-label="Open photo ' + (i + 1) + '"><img data-pid="' + esc(p.id) + '" alt="' + esc(p.caption || 'Photo ' + (i + 1)) + '">' +
          (p.caption ? '<span class="ph-cap">' + esc(p.caption) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '<p class="muted small">No photos yet. <a href="#/edit/' + esc(o.id) + '">Add the picture the customer sent</a></p>') + '</div>' +
      productCardHTML(o, row) +
      (PR.isBulk(o) ? '' : '<div class="card"><h3>💵 Money</h3><dl class="kv">' + row('Price', money(o.price)) + row('Deposit paid', money(o.deposit)) + '</dl>' +
      '<div class="balance-box"><span>Balance due</span><span>' + (o.status === 'Paid' ? 'Paid in full ✓' : money(balance(o))) + '</span></div></div>') +
      '<div class="card"><h3>👤 ' + (PR.isBulk(o) ? 'Group' : 'Customer') + '</h3><dl class="kv">' + row(PR.isBulk(o) ? 'Group' : 'Name', esc(o.name)) + (PR.isBulk(o) ? row('Organizer', esc(o.organizer)) : '') +
      row('Phone', o.phone ? '<a href="' + telHref(o.phone) + '">' + esc(o.phone) + '</a>' : '') + row('Email', o.email ? '<a href="mailto:' + esc(o.email) + '">' + esc(o.email) + '</a>' : '') +
      row('Handoff', o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup') + row('Address', esc(o.address)) + row('Notes', esc(o.customerNotes).replace(/\n/g, '<br>')) + '</dl></div>' +
      '<div class="card"><h3>🔔 Reminders</h3>' + (rems ? '<ul class="rem-list">' + rems + '</ul>' : '<p class="muted">No reminders.</p>') +
      '<button class="btn block" data-ics="' + esc(o.id) + '">📅 Add to my phone’s calendar</button>' +
      '<p class="muted small">Adds this cake to your iPhone Calendar with these reminders as alarms – they’ll go off even when the app is closed.' +
      (IS_IOS ? ' <a href="#" data-icsfile="' + esc(o.id) + '">Trouble? Save the file instead</a>' : '') + '</p></div>' +
      (o.transcript ? '<details class="card transcript-details"><summary>🎤 What was said</summary><p><i>' + esc(o.transcript) + '</i></p></details>' : '') +
      '<p class="muted small center">Added ' + esc(new Date(o.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) + '</p>' +
      '<button class="btn danger block" data-delete="' + esc(o.id) + '">Delete order</button></div>';
    PH.hydrate(page);
    if (PR.isBulk(o)) renderPeople(o);
    return page;
  }

  // ---------- bulk orders: people list, totals, texts ----------
  var CONTACTS_OK = 'contacts' in navigator && 'ContactsManager' in window && navigator.contacts && typeof navigator.contacts.select === 'function';
  var peopleView = { id: null, filter: 'all', sort: 'name', q: '' };
  function textOpts() { return { signature: state.settings.signature, payInfo: state.settings.payInfo }; }
  function getPerson(o, pid) { return (o.people || []).find(function (p) { return p.id === pid; }); }
  function pid() { return 'pp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function bulkCardHTML(o) {
    if (peopleView.id !== o.id) peopleView = { id: o.id, filter: 'all', sort: 'name', q: '' };
    var bt = PR.bulkTotals(o), priced = !bt.noPrice || bt.owed > 0, noun = PR.typeOf(o) === 'cupcakes' ? 'cupcakes' : 'cookies';
    function tile(label, val, sub, cls) { return '<div class="bt' + (cls ? ' ' + cls : '') + '"><span class="bt-l">' + label + '</span><b>' + val + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
    var tiles = tile('People', bt.people) + tile('Dozen', PR.dz(bt.dozen).replace(' dozen', ''), bt.cookies + ' ' + noun) +
      tile('Picked up', bt.pickedUp + '<span class="of">/' + bt.people + '</span>', bt.people && bt.pickedUp === bt.people ? 'everyone ✓' : '') +
      (priced ? tile('Collected', money(bt.collected), 'of ' + money(bt.owed)) + tile('Outstanding', money(bt.outstanding), bt.unpaid + ' unpaid', bt.outstanding > 0 ? 'warn' : 'good')
        : tile('Unpaid', bt.unpaid, 'people', bt.unpaid ? 'warn' : 'good'));
    var bake = bt.flavors.length ? '<div class="bake-list"><span>🥣 To bake</span>' + bt.flavors.map(function (f) { return '<span class="bake-f"><b>' + esc(f.flavor) + '</b> ' + esc(PR.dz(f.dozen)) + '</span>'; }).join('') + '</div>' : '';
    var unpaidWithPhone = (o.people || []).filter(function (p) { return p.phone && PR.personMoney(o, p).state !== 'paid'; }).length;
    return '<div class="card bulk-card" id="bulkCard"><h3>👥 People &amp; payments</h3>' +
      '<div class="bulk-totals">' + tiles + '</div>' +
      (!priced && bt.people ? '<p class="muted small">Tip: add a <a href="#/edit/' + esc(o.id) + '">price per dozen</a> to track who owes what.</p>' : '') + bake +
      '<div class="two-btn"><button class="btn" data-person-add="' + esc(o.id) + '">＋ Add person</button><button class="btn secondary" data-paste-open="' + esc(o.id) + '">📋 Paste a list</button></div>' +
      (bt.people ? '<div class="bulk-actions">' +
        '<button data-walk="unpaid"' + (unpaidWithPhone ? '' : ' disabled') + '><span>💬</span>Remind unpaid' + (unpaidWithPhone ? ' (' + unpaidWithPhone + ')' : '') + '</button>' +
        '<button data-walk="ready"><span>📣</span>Ready texts</button>' +
        '<button data-share-list="' + esc(o.id) + '"><span>📤</span>Share list</button>' +
        '<button data-bulk-more="' + esc(o.id) + '"><span>⋯</span>More</button></div>' +
        '<div class="chips people-filter" id="peopleFilter"></div>' +
        (bt.people > 8 ? '<input type="search" class="text-input people-search" id="peopleSearch" placeholder="Find a name or number…" value="' + esc(peopleView.q) + '" aria-label="Find a person">' : '') +
        '<div id="peopleList" class="people-list"></div>'
        : '<p class="muted center small">No one yet. Add people one at a time, or paste a list like:<br><i>Jane Doe 555-123-4567 2 dozen paid</i></p>') +
      '</div>';
  }
  function renderPeople(o) {
    var box = $('#peopleList'); if (!box) return;
    var all = o.people || [], unpaid = 0, notPicked = 0;
    all.forEach(function (p) { if (PR.personMoney(o, p).state !== 'paid') unpaid++; if (!p.pickedUp) notPicked++; });
    $('#peopleFilter').innerHTML = [['all', 'All', all.length], ['unpaid', 'Unpaid', unpaid], ['notpicked', 'Not picked up', notPicked]].map(function (c) {
      return '<button class="chip' + (peopleView.filter === c[0] ? ' on' : '') + '" data-pfilter="' + c[0] + '">' + c[1] + ' <span class="chip-n">' + c[2] + '</span></button>';
    }).join('') + '<button class="chip sort-chip" data-psort aria-label="Sort">' + (peopleView.sort === 'name' ? '↕︎ A–Z' : '↕︎ Added') + '</button>';
    var q = peopleView.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    var list = PR.sortedPeople(o, peopleView.sort).filter(function (p) {
      if (peopleView.filter === 'unpaid' && PR.personMoney(o, p).state === 'paid') return false;
      if (peopleView.filter === 'notpicked' && p.pickedUp) return false;
      if (!q) return true;
      return String(p.name || '').toLowerCase().indexOf(q) >= 0 || (qd.length >= 3 && String(p.phone || '').replace(/\D/g, '').indexOf(qd) >= 0);
    });
    box.innerHTML = list.length ? list.map(function (p) { return personRowHTML(o, p); }).join('')
      : '<p class="muted center small">' + (all.length ? (peopleView.filter === 'unpaid' ? 'Everyone has paid 🎉' : peopleView.filter === 'notpicked' ? 'Everyone has picked up 🎉' : 'No matches.') : '') + '</p>';
  }
  function personRowHTML(o, p) {
    var m = PR.personMoney(o, p);
    var amt = m.owed === null ? '' : m.state === 'paid' ? money(m.collected) : m.state === 'partial' ? money(m.outstanding) + ' due' : money(m.owed);
    var payLbl = m.state === 'paid' ? '✓ Paid' + (p.method ? ' · ' + esc(p.method) : '') : m.state === 'partial' ? '½ Part paid' : '💵 Unpaid';
    return '<div class="person ps-' + m.state + (p.pickedUp ? ' picked' : '') + '">' +
      '<button class="p-main" data-person-edit="' + esc(p.id) + '" aria-label="Edit ' + esc(p.name || 'person') + '">' +
      '<span class="p-top"><span class="p-name">' + esc(p.name || p.phone || 'No name') + '</span><span class="p-amt">' + amt + '</span></span>' +
      '<span class="p-sub">' + esc([PR.dz(p.dozen), p.flavor, p.note ? '📝 ' + p.note : ''].filter(Boolean).join(' · ')) + '</span></button>' +
      '<div class="p-actions"><button class="p-pay" data-person-pay="' + esc(p.id) + '">' + payLbl + '</button>' +
      '<button class="p-pick" data-person-pick="' + esc(p.id) + '" aria-pressed="' + !!p.pickedUp + '">' + (p.pickedUp ? '📦 Picked up ✓' : '📦 Not picked up') + '</button>' +
      (p.phone ? '<a class="p-text" href="' + esc(PR.smsLink(p.phone, PR.personText(o, p, textOpts()), IS_IOS)) + '" data-person-text="' + esc(p.id) + '" aria-label="Text ' + esc(p.name) + '">💬</a>' : '') +
      '</div></div>';
  }
  function bulkChanged(o, msg) {
    o.updatedAt = Date.now(); persist(); Push.markDirty(o.id);
    var pg = $('#page-detail'), y = pg.scrollTop; renderDetail(o.id); pg.scrollTop = y;
    if (msg) toast(msg);
  }
  // ---- bottom sheet ----
  function openSheet(html, bindFn) {
    var w = $('#sheetWrap'), sh = $('#sheet');
    sh.innerHTML = html; w.hidden = false; document.body.classList.add('sheet-open');
    sh.onclick = sh.oninput = sh.onchange = sh.onsubmit = null;
    if (bindFn) bindFn(sh);
    sh.scrollTop = 0;
  }
  function closeSheet() { stopActive(); $('#sheetWrap').hidden = true; document.body.classList.remove('sheet-open'); $('#sheet').innerHTML = ''; }
  function sheetHead(title) { return '<div class="sheet-head"><h3>' + title + '</h3><button class="icon-btn" data-sheet-close aria-label="Close">✕</button></div>'; }
  function micBtn(id, label) { return '<button type="button" class="mic" data-mic="' + id + '" aria-label="Dictate ' + esc(label) + '">🎤</button>'; }
  function flavorListFor(o) { return PR.typeOf(o) === 'cupcakes' ? CUP_FLAVOR_LIST : COOKIE_LIST; }

  function personSheet(o, p, keepOpenMsg) {
    var isNew = !p;
    p = p || { dozen: 1, paid: false, pickedUp: false };
    var html = sheetHead(isNew ? 'Add person' : 'Edit ' + esc(p.name || 'person')) + '<form id="personForm" novalidate autocomplete="off">' +
      (keepOpenMsg ? '<p class="added-note">' + esc(keepOpenMsg) + '</p>' : '') +
      '<div class="field"><label for="pp_name">Name</label><div class="input-wrap"><input id="pp_name" name="name" type="text" data-kind="text" autocapitalize="words" value="' + esc(p.name || '') + '">' + micBtn('pp_name', 'name') +
      (CONTACTS_OK ? '<button type="button" class="mic" data-contact-one aria-label="Pick from contacts">📇</button>' : '') + '</div></div>' +
      '<div class="field"><label for="pp_phone">Phone</label><div class="input-wrap"><input id="pp_phone" name="phone" type="tel" inputmode="tel" data-kind="tel" value="' + esc(p.phone || '') + '">' + micBtn('pp_phone', 'phone') + '</div></div>' +
      '<div class="field"><label for="pp_dozen">How many dozen</label><div class="stepper"><button type="button" data-step="-0.5" aria-label="Half dozen less">−</button>' +
      '<input id="pp_dozen" name="dozen" type="text" inputmode="decimal" data-kind="dozen" value="' + esc(p.dozen === '' ? '' : p.dozen) + '"><button type="button" data-step="0.5" aria-label="Half dozen more">＋</button>' + micBtn('pp_dozen', 'how many dozen') + '</div>' +
      '<div class="quick-dz">' + [0.5, 1, 2, 3, 4, 6].map(function (n) { return '<button type="button" data-setdz="' + n + '">' + (n === 0.5 ? '½' : n) + '</button>'; }).join('') + '</div>' +
      '<p class="owes" id="pp_owes"></p></div>' +
      '<div class="field"><label for="pp_flavor">Flavor <span class="muted">(if not ' + esc(PR.defaultFlavor(o)) + ')</span></label><div class="input-wrap"><input id="pp_flavor" name="flavor" type="text" data-kind="text" list="pp_fl" autocapitalize="sentences" placeholder="' + esc(PR.defaultFlavor(o)) + '" value="' + esc(p.flavor || '') + '">' + micBtn('pp_flavor', 'flavor') + '</div>' +
      '<datalist id="pp_fl">' + flavorListFor(o).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><span class="field-label">Payment</span><div class="segmented"><label><input type="radio" name="paid" value="no"' + (p.paid ? '' : ' checked') + '><span>💵 Not paid</span></label><label><input type="radio" name="paid" value="yes"' + (p.paid ? ' checked' : '') + '><span>✓ Paid</span></label></div></div>' +
      '<div id="pp_payinfo"' + (p.paid ? '' : ' hidden') + '><div class="method-chips">' + PR.PAY_METHODS.map(function (mth) { return '<label><input type="radio" name="method" value="' + mth + '"' + (p.method === mth ? ' checked' : '') + '><span>' + mth + '</span></label>'; }).join('') + '</div>' +
      '<div class="field"><label for="pp_amount">Amount paid <span class="muted">(only if different)</span></label><div class="input-wrap"><input id="pp_amount" name="amount" type="text" inputmode="decimal" data-kind="money" placeholder="" value="' + esc(p.amount == null ? '' : p.amount) + '"></div></div></div>' +
      '<div class="field switch-field"><label class="switch"><input type="checkbox" name="pickedUp"' + (p.pickedUp ? ' checked' : '') + '><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>📦 ' + (o.fulfillment === 'delivery' ? 'Delivered' : 'Picked up') + '</b></span></label></div>' +
      '<div class="field"><label for="pp_note">Note</label><div class="input-wrap"><input id="pp_note" name="note" type="text" data-kind="text" autocapitalize="sentences" value="' + esc(p.note || '') + '">' + micBtn('pp_note', 'note') + '</div></div>' +
      '<button type="submit" class="btn block big">' + (isNew ? '＋ Add' : '💾 Save') + '</button>' +
      (isNew ? '<button type="button" class="btn secondary block" data-save-another>Add &amp; next person</button>' : '<button type="button" class="btn danger block" data-person-delete>Delete ' + esc(p.name || 'person') + '</button>') +
      '</form>';
    openSheet(html, function (sh) {
      var f = $('#personForm'), E = f.elements;
      function dozenVal() { var v = parseFloat(String(E.dozen.value).replace(',', '.')); return isNaN(v) ? '' : Math.max(v, 0); }
      function upd() {
        var paid = (f.querySelector('input[name=paid]:checked') || {}).value === 'yes';
        $('#pp_payinfo').hidden = !paid;
        var owed = PR.personOwed(o, { dozen: dozenVal() === '' ? 1 : dozenVal() });
        $('#pp_owes').textContent = owed === null ? '' : 'Owes ' + money(owed) + (PR.priceText(o) ? ' (' + PR.priceText(o) + ')' : '');
        E.amount.placeholder = owed === null ? '' : money(owed);
      }
      upd();
      sh.oninput = sh.onchange = upd;
      sh.onclick = function (e) {
        var b;
        if ((b = e.target.closest('[data-mic]'))) { e.preventDefault(); micForField(b, document.getElementById(b.dataset.mic)); return; }
        if ((b = e.target.closest('[data-step]'))) { var nv = Math.max((dozenVal() || 0) + parseFloat(b.dataset.step), 0.5); E.dozen.value = nv; upd(); return; }
        if ((b = e.target.closest('[data-setdz]'))) { E.dozen.value = b.dataset.setdz; upd(); return; }
        if (e.target.closest('[data-contact-one]')) {
          navigator.contacts.select(['name', 'tel'], { multiple: false }).then(function (r) {
            if (r && r[0]) { if (r[0].name && r[0].name[0]) E.name.value = r[0].name[0]; if (r[0].tel && r[0].tel[0]) E.phone.value = P.formatPhone(r[0].tel[0]); }
          }).catch(function () {});
          return;
        }
        if (e.target.closest('[data-save-another]')) { save(true); return; }
        if (e.target.closest('[data-person-delete]')) {
          if (!confirm('Remove ' + (p.name || 'this person') + ' from the list?')) return;
          o.people = o.people.filter(function (x) { return x.id !== p.id; }); closeSheet(); bulkChanged(o, (p.name || 'Person') + ' removed');
        }
      };
      f.onsubmit = function (e) { e.preventDefault(); save(false); };
      function save(another) {
        var name = E.name.value.trim(), phone = E.phone.value.trim();
        if (!name && !phone) { toast('Add a name (or phone number)'); E.name.focus(); return; }
        var paid = (f.querySelector('input[name=paid]:checked') || {}).value === 'yes';
        var amt = parseFloat(String(E.amount.value).replace(/[$,\s]/g, ''));
        var rec = Object.assign({}, isNew ? { id: pid(), addedAt: Date.now() } : p, {
          name: name, phone: phone ? P.formatPhone(phone) : '', dozen: dozenVal() === '' ? 1 : dozenVal(), flavor: E.flavor.value.trim(), note: E.note.value.trim(),
          paid: paid, method: paid ? ((f.querySelector('input[name=method]:checked') || {}).value || '') : '', amount: paid && !isNaN(amt) ? amt : '',
          pickedUp: E.pickedUp.checked
        });
        if (paid && !p.paid) rec.paidAt = Date.now();
        if (rec.pickedUp && !p.pickedUp) rec.pickedUpAt = Date.now();
        o.people = o.people || [];
        if (isNew) o.people.push(rec); else o.people = o.people.map(function (x) { return x.id === rec.id ? rec : x; });
        bulkChanged(o, isNew ? (rec.name || 'Person') + ' added ✓' : 'Saved ✓');
        if (another) personSheet(o, null, (rec.name || 'Person') + ' added ✓ (' + o.people.length + ' people)'); else closeSheet();
        if (another) setTimeout(function () { var n = $('#pp_name'); if (n) n.focus(); }, 50);
      }
    });
  }
  function paySheet(o, p) {
    var m = PR.personMoney(o, p);
    var html = sheetHead('💵 ' + esc(p.name || 'Payment')) +
      '<p class="pay-owes">' + (m.owed === null ? 'No price set for this order.' : 'Owes <b>' + money(m.owed) + '</b> for ' + esc(PR.dz(p.dozen))) + (p.paid ? '<br><span class="muted">Paid ' + money(m.collected) + (p.method ? ' by ' + esc(p.method) : '') + '</span>' : '') + '</p>' +
      '<p class="field-label">' + (p.paid ? 'Change how they paid' : 'How did they pay?') + '</p>' +
      '<div class="method-grid">' + PR.PAY_METHODS.map(function (mth) { return '<button type="button" class="' + (p.paid && p.method === mth ? 'on' : '') + '" data-pay-method="' + mth + '">' + ({ Cash: '💵', Venmo: '🔵', 'Cash App': '🟩', Zelle: '🟣', Check: '🧾', Other: '💳' })[mth] + ' ' + mth + '</button>'; }).join('') + '</div>' +
      '<div class="field"><label for="pay_amt">Amount <span class="muted">(only if different)</span></label><div class="input-wrap"><input id="pay_amt" type="text" inputmode="decimal" placeholder="' + (m.owed === null ? '' : money(m.owed)) + '" value="' + esc(p.paid && p.amount !== '' && p.amount != null ? p.amount : '') + '"></div></div>' +
      (p.paid ? '<button class="btn danger block" data-pay-undo>Mark as not paid</button>' : '');
    openSheet(html, function (sh) {
      sh.onclick = function (e) {
        var b;
        if ((b = e.target.closest('[data-pay-method]'))) {
          var amt = parseFloat(String($('#pay_amt').value).replace(/[$,\s]/g, ''));
          if (!p.paid) p.paidAt = Date.now();
          p.paid = true; p.method = b.dataset.payMethod; p.amount = isNaN(amt) ? '' : amt;
          closeSheet(); bulkChanged(o, (p.name || 'Person') + ' paid ✓ (' + p.method + ')');
        } else if (e.target.closest('[data-pay-undo]')) { p.paid = false; p.method = ''; p.amount = ''; delete p.paidAt; closeSheet(); bulkChanged(o, (p.name || 'Person') + ' marked not paid'); }
      };
    });
  }
  function pasteSheet(o) {
    var html = sheetHead('📋 Paste a list') +
      '<p class="small muted">One person per line, like <i>Jane Doe 555-123-4567 2 dozen paid venmo</i>. Copy a list from Notes, Messages or a spreadsheet and paste it here. To dictate, tap 🎤 and say “next person” between people.</p>' +
      '<div class="input-wrap"><textarea id="pasteBox" rows="7" data-kind="textarea" placeholder="Jane Doe 555-123-4567 2 dozen paid&#10;Bob Smith 1 ½ dozen pumpkin&#10;Amy Lee half dozen owes"></textarea>' + micBtn('pasteBox', 'the list') + '</div>' +
      (CONTACTS_OK ? '<button type="button" class="btn secondary block" data-contact-many>📇 Pick people from Contacts</button>' : '') +
      '<div id="pastePreview" class="paste-preview"></div><button class="btn block big" id="pasteAdd" disabled>Add people</button>';
    openSheet(html, function (sh) {
      var parsed = [];
      function key(p) { return p.phone ? p.phone.replace(/\D/g, '') : String(p.name || '').trim().toLowerCase(); }
      function preview() {
        var have = {}; (o.people || []).forEach(function (p) { have[key(p)] = 1; if (p.name) have[String(p.name).trim().toLowerCase()] = 1; });
        parsed = P.parseBulkList($('#pasteBox').value, { flavors: flavorListFor(o) }).map(function (p) { p.dup = !!(have[key(p)] || (p.name && have[p.name.trim().toLowerCase()])); return p; });
        var add = parsed.filter(function (p) { return !p.dup; });
        $('#pastePreview').innerHTML = parsed.length ? '<p class="small"><b>' + add.length + ' to add</b>' + (parsed.length > add.length ? ' · ' + (parsed.length - add.length) + ' already on the list (skipped)' : '') + '</p><ul>' + parsed.map(function (p) {
          return '<li class="' + (p.dup ? 'dup' : '') + '"><b>' + esc(p.name || p.phone) + '</b> · ' + esc(PR.dz(p.dozen === '' ? 1 : p.dozen)) + (p.flavor ? ' · ' + esc(p.flavor) : '') + (p.paid ? ' · ✓ paid' + (p.method ? ' ' + esc(p.method) : '') + (p.amount !== '' ? ' ' + money(p.amount) : '') : ' · unpaid') +
            (p.pickedUp ? ' · picked up' : '') + (p.phone && p.name ? ' · ' + esc(p.phone) : '') + (p.note ? ' · <i>' + esc(p.note) + '</i>' : '') +
            (p.dup ? ' <span class="warn-t">already on list</span>' : p.warnings.length ? ' <span class="warn-t">' + esc(p.warnings.join(', ')) + '</span>' : '') + '</li>';
        }).join('') + '</ul>' : '';
        $('#pasteAdd').disabled = !add.length; $('#pasteAdd').textContent = add.length ? 'Add ' + add.length + (add.length === 1 ? ' person' : ' people') : 'Add people';
      }
      sh.oninput = preview;
      sh.onclick = function (e) {
        var b;
        if ((b = e.target.closest('[data-mic]'))) { e.preventDefault(); micForField(b, document.getElementById(b.dataset.mic)); return; }
        if (e.target.closest('[data-contact-many]')) {
          navigator.contacts.select(['name', 'tel'], { multiple: true }).then(function (list) {
            var lines = (list || []).map(function (c) { return [(c.name && c.name[0]) || '', (c.tel && c.tel[0]) || '', '1 dozen'].filter(Boolean).join(' '); });
            var ta = $('#pasteBox'); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + lines.join('\n'); preview();
          }).catch(function () {});
          return;
        }
        if (e.target.closest('#pasteAdd')) {
          var add = parsed.filter(function (p) { return !p.dup; }), now = Date.now();
          o.people = (o.people || []).concat(add.map(function (p, i) {
            return { id: pid(), addedAt: now + i, name: p.name, phone: p.phone, dozen: p.dozen === '' ? 1 : p.dozen, flavor: p.flavor, paid: p.paid, method: p.method, amount: p.amount,
              pickedUp: p.pickedUp, note: p.note, paidAt: p.paid ? now : undefined };
          }));
          closeSheet(); bulkChanged(o, add.length + (add.length === 1 ? ' person' : ' people') + ' added ✓');
        }
      };
    });
  }
  // Walk through people one at a time, opening Messages with each person's own text (iOS can't send many individual texts at once).
  function walkSheet(o, kind) {
    var list = PR.sortedPeople(o, 'name').filter(function (p) { return kind === 'unpaid' ? PR.personMoney(o, p).state !== 'paid' : !p.pickedUp; });
    var noPhone = list.filter(function (p) { return !p.phone; }), queue = list.filter(function (p) { return p.phone; }), i = 0, sent = 0;
    var title = kind === 'unpaid' ? '💬 Payment reminders' : '📣 Ready-for-pickup texts';
    if (o.fulfillment === 'delivery' && kind === 'ready') title = '📣 Delivery texts';
    function draw() {
      var html = sheetHead(title);
      if (i >= queue.length) {
        html += '<div class="walk-done"><span class="big-emoji">✅</span><h3>' + (queue.length ? 'All done' : 'No one to text') + '</h3><p class="muted">' +
          (queue.length ? 'Opened ' + sent + ' of ' + queue.length + ' texts.' : kind === 'unpaid' ? 'Everyone with a phone number has paid.' : 'Everyone with a phone number has picked up.') + '</p>' +
          '<button class="btn block" data-sheet-close>Close</button></div>';
      } else {
        var p = queue[i], txt = PR.personText(o, p, Object.assign(textOpts(), { kind: kind }));
        html += '<p class="walk-count">' + (i + 1) + ' of ' + queue.length + ' · <b>' + esc(p.name || p.phone) + '</b>' + (kind === 'unpaid' ? ' · owes ' + money(PR.personMoney(o, p).outstanding) : '') + '</p>' +
          '<pre class="sms-preview">' + esc(txt) + '</pre>' +
          '<a class="btn block big confirm-send" href="' + esc(PR.smsLink(p.phone, txt, IS_IOS)) + '" data-walk-send>💬 Text ' + esc(String(p.name || 'them').split(' ')[0]) + '</a>' +
          '<div class="two-btn"><button class="btn secondary" data-walk-skip>Skip</button><button class="btn secondary" data-sheet-close>Stop</button></div>' +
          '<p class="muted small">After you send it, come back here for the next person.</p>';
      }
      if (noPhone.length) html += '<p class="muted small">No phone number for: ' + esc(noPhone.map(function (p) { return p.name; }).join(', ')) + '</p>';
      openSheet(html, function (sh) {
        sh.onclick = function (e) {
          if (e.target.closest('[data-walk-send]')) {
            var p = queue[i]; p[kind === 'unpaid' ? 'remindedAt' : 'readyTextAt'] = Date.now(); o.updatedAt = Date.now(); persist(); sent++;
            setTimeout(function () { i++; draw(); }, 700);   // let Messages open first, then show the next person
          } else if (e.target.closest('[data-walk-skip]')) { i++; draw(); }
        };
      });
    }
    draw();
  }
  function shareSheet(o) {
    var withPhones = false;
    function txt() { return PR.bulkShareText(o, { phones: withPhones }); }
    var html = sheetHead('📤 Share the list') +
      '<div class="field switch-field"><label class="switch"><input type="checkbox" id="shPhones"><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>Include phone numbers</b></span></label></div>' +
      '<pre class="sms-preview share-preview" id="sharePreview"></pre>' +
      '<button class="btn block" data-share-text>📤 Share as text</button>' +
      '<button class="btn secondary block" data-share-csv>📄 Share spreadsheet (CSV)</button>' +
      '<button class="btn link block" data-share-copy>Copy text</button>';
    openSheet(html, function (sh) {
      $('#sharePreview').textContent = txt();
      sh.onchange = function () { withPhones = $('#shPhones').checked; $('#sharePreview').textContent = txt(); };
      sh.onclick = function (e) {
        var t = txt();
        if (e.target.closest('[data-share-text]')) {
          if (navigator.share) navigator.share({ title: o.name || 'Bulk order', text: t }).catch(function () {});
          else copyText(t);
        } else if (e.target.closest('[data-share-csv]')) {
          shareOrDownload(slug(o.name || 'bulk-order') + '-' + (o.dueDate || 'list') + '.csv', PR.bulkCSV(o), 'text/csv');
        } else if (e.target.closest('[data-share-copy]')) copyText(t);
      };
    });
  }
  function copyText(t) {
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copied ✓'); }, function () { toast('Could not copy – press and hold the text to select it'); });
  }
  function moreSheet(o) {
    var html = sheetHead('⋯ More') +
      '<button class="btn secondary block" data-bm="allpicked">📦 Mark everyone ' + (o.fulfillment === 'delivery' ? 'delivered' : 'picked up') + '</button>' +
      '<button class="btn secondary block" data-bm="phones">📋 Copy all phone numbers</button>' +
      '<button class="btn secondary block" data-bm="again">🔁 Start the next round with the same people</button>' +
      '<p class="muted small">Next round copies the group, prices and everyone’s name, number and usual dozens into a new order (nobody marked paid or picked up). You pick the new date.</p>';
    openSheet(html, function (sh) {
      sh.onclick = function (e) {
        var b = e.target.closest('[data-bm]'); if (!b) return;
        if (b.dataset.bm === 'allpicked') {
          if (!confirm('Mark all ' + (o.people || []).length + ' people as ' + (o.fulfillment === 'delivery' ? 'delivered' : 'picked up') + '?')) return;
          var now = Date.now(); (o.people || []).forEach(function (p) { if (!p.pickedUp) { p.pickedUp = true; p.pickedUpAt = now; } });
          closeSheet(); bulkChanged(o, 'Everyone marked ✓');
        } else if (b.dataset.bm === 'phones') {
          copyText((o.people || []).filter(function (p) { return p.phone; }).map(function (p) { return p.name + ': ' + p.phone; }).join('\n'));
        } else if (b.dataset.bm === 'again') {
          var copy = JSON.parse(JSON.stringify(o)), now = Date.now();
          ['id', 'createdAt', 'updatedAt', 'dueDate', 'photos', 'transcript', 'confirmSentAt', 'customerConfirmedAt', 'confirmedSig'].forEach(function (k) { delete copy[k]; });
          copy.status = 'Inquiry';
          copy.people = (o.people || []).map(function (p, i) { return { id: pid(), addedAt: now + i, name: p.name, phone: p.phone, dozen: p.dozen, flavor: p.flavor, paid: false, method: '', amount: '', pickedUp: false, note: '' }; });
          closeSheet(); pendingDraft = copy; location.hash = '#/new'; toast('Pick the date for the next round, then Save', 4000);
        }
      };
    });
  }

  function productCardHTML(o, row) {
    var t = PR.typeOf(o), msg = (t !== 'creampies' && o.message) ? '<div class="message-plaque">“' + esc(o.message) + '”</div>' : '';
    var rows = row('Occasion', esc(o.occasion));
    if (PR.isBulk(o)) msg = '';
    if (t === 'cake') {
      rows += row('Size', esc(o.size)) + row('Tiers', esc(o.tiers)) + row('Shape', esc(o.shape)) + row('Servings', esc(o.servings)) +
        row('Flavor', esc(o.flavor)) + row('Filling', esc(o.filling)) + row('Frosting', esc(o.frosting)) + row('Colors / design', esc(o.design).replace(/\n/g, '<br>'));
    } else {
      PR.specRows(o).forEach(function (r) { if (r[0] !== 'Message') rows += row(r[0], esc(r[1]).replace(/\n/g, '<br>')); });
    }
    return '<div class="card product-card"><h3>' + (PR.isBulk(o) ? PR.info(o).emoji + ' Bulk ' + PR.info(o).label.toLowerCase() : PR.info(o).detail) + '</h3>' + msg + '<dl class="kv">' + rows + '</dl></div>';
  }
  function confirmText(o) { return PR.summaryText(o, { signature: state.settings.signature, payInfo: state.settings.payInfo }); }
  function confirmCardHTML(o) {
    if (!o.phone) return '';
    var c = confirmState(o), when = function (t) { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
    var line = c === 'confirmed' ? '✅ Customer confirmed ' + esc(when(o.customerConfirmedAt))
      : c === 'changed' ? '✏️ You changed this order after the customer confirmed (' + esc(when(o.customerConfirmedAt)) + '). Text them the new details.'
      : c === 'sent' ? '💬 Confirmation text opened ' + esc(when(o.confirmSentAt)) + ' – waiting for their reply.'
      : 'Text the customer a summary so they can check everything is right.';
    return '<div class="card confirm-card' + (c === 'confirmed' ? ' is-confirmed' : '') + '"><h3>💬 Customer confirmation</h3><p class="small confirm-line">' + line + '</p>' +
      '<a class="btn block big confirm-send" href="' + esc(PR.smsLink(o.phone, confirmText(o), IS_IOS)) + '" data-confirm-send="' + esc(o.id) + '">💬 Text for confirmation</a>' +
      '<button class="btn block ' + (c === 'confirmed' ? 'ok-btn' : 'secondary') + '" data-confirm-toggle="' + esc(o.id) + '" aria-pressed="' + (c === 'confirmed') + '">' +
      (c === 'confirmed' ? '✅ Customer confirmed (tap to undo)' : '👍 Mark customer confirmed') + '</button>' +
      '<details class="msg-preview"><summary>Preview the message</summary><pre class="sms-preview">' + esc(confirmText(o)) + '</pre>' +
      '<button class="btn link small-btn" data-copy-summary="' + esc(o.id) + '">Copy text</button></details></div>';
  }

  // ---------- form ----------
  function fieldHTML(f, o, voiceKeys) {
    var v = o[f.k] == null ? '' : o[f.k], id = 'f_' + f.k, vf = voiceKeys[f.k] ? ' voice-filled' : '';
    var t = PR.typeOf(o), label = labelFor(f.labels, f.label, t, PR.isBulk(o));
    var mic = '<button type="button" class="mic" data-mic="' + id + '" aria-label="Dictate ' + esc(label) + '">🎤</button>';
    var lab = '<label for="' + id + '"' + (f.labels ? ' data-labels="' + esc(JSON.stringify(Object.assign({ _: f.label }, f.labels))) + '"' : '') + '>' + esc(label) + '</label>';
    var lists = f.list ? Object.assign({ _: f.list }, f.lists || {}) : null;
    var listAttr = lists ? ' list="dl_' + f.k + '_' + (f.lists && f.lists[t] ? t : '_') + '"' + (f.lists ? ' data-lists="1"' : '') : '';
    var dl = lists ? Object.keys(lists).map(function (lk) { return '<datalist id="dl_' + f.k + '_' + lk + '">' + lists[lk].map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>'; }).join('') : '';
    var capA = f.cap ? ' autocapitalize="' + f.cap + '"' : '';
    var wrapAttrs = (f.showIf ? ' data-showif="' + f.showIf + '"' : '') + (f.types ? ' data-types="' + f.types.join(' ') + '"' : '') + (f.bulk ? ' data-bulk="' + f.bulk + '"' : '') + (f.bulkShow ? ' data-bulkshow="1"' : '');
    function wrap(inner) { return '<div class="field"' + wrapAttrs + '>' + lab + '<div class="input-wrap' + vf + '">' + inner + '</div>' + dl + '</div>'; }
    switch (f.type) {
      case 'text': case 'tel': case 'email':
        return wrap('<input id="' + id + '" name="' + f.k + '" type="' + f.type + '" value="' + esc(v) + '"' + listAttr + capA +
          (f.type === 'tel' ? ' inputmode="tel" autocomplete="off"' : '') + (f.type === 'email' ? ' inputmode="email" autocapitalize="off" autocorrect="off"' : '') + ' data-kind="' + f.type + '">' + mic);
      case 'textarea':
        return wrap('<textarea id="' + id + '" name="' + f.k + '" rows="' + (f.rows || 3) + '" data-kind="textarea" autocapitalize="sentences">' + esc(v) + '</textarea>' + mic);
      case 'date':
        return wrap('<input id="' + id + '" name="' + f.k + '" type="date" value="' + esc(v) + '" data-kind="date">' + mic);
      case 'time':
        return wrap('<input id="' + id + '" name="' + f.k + '" type="time" step="60" value="' + esc(v) + '" data-kind="time">');
      case 'number':
        return wrap('<input id="' + id + '" name="' + f.k + '" type="text" inputmode="numeric" pattern="[0-9]*" value="' + esc(v) + '" data-kind="number">');
      case 'qty':
        return wrap('<input id="' + id + '" name="' + f.k + '" type="text" inputmode="decimal" value="' + esc(v) + '" data-kind="qty" placeholder="e.g. 2">' + mic);
      case 'money':
        return wrap('<input id="' + id + '" name="' + f.k + '" type="text" inputmode="decimal" value="' + esc(v) + '" data-kind="money" placeholder="0">');
      case 'select':
        var opts = f.optionsBy ? (f.optionsBy[t] || f.optionsBy[Object.keys(f.optionsBy)[0]]) : f.options;
        if (f.optionsBy && v && opts.indexOf(v) === -1) opts = opts.concat([v]);
        return wrap('<select id="' + id + '" name="' + f.k + '">' + opts.map(function (x) { return '<option value="' + esc(x) + '"' + (x === v ? ' selected' : '') + '>' + esc(x || '—') + '</option>'; }).join('') + '</select>');
      case 'segmented':
        return '<div class="field"' + wrapAttrs + '><span class="field-label">' + esc(f.label) + '</span><div class="segmented' + (f.small ? ' seg-small' : '') + vf + '">' + f.options.map(function (x) { return '<label><input type="radio" name="' + f.k + '" value="' + x[0] + '"' + (v === x[0] ? ' checked' : '') + '><span>' + x[1] + '</span></label>'; }).join('') + '</div></div>';
      case 'typepicker':
        return '<div class="type-picker' + vf + '" role="radiogroup" aria-label="Product">' + PR.ORDER.map(function (k) {
          var ti = PR.TYPES[k];
          return '<label><input type="radio" name="productType" value="' + k + '"' + (t === k ? ' checked' : '') + '><span><b>' + ti.emoji + '</b>' + esc(k === 'creampies' ? 'Oatmeal cream pies' : ti.label) + '</span></label>';
        }).join('') + '</div>';
      case 'balance':
        return '<div class="balance-box"' + wrapAttrs + '><span>Balance due</span><span id="balanceVal"></span></div>';
      case 'switch':
        return '<div class="field switch-field"' + wrapAttrs + '><label class="switch' + vf + '"><input type="checkbox" id="' + id + '" name="' + f.k + '"' + (v ? ' checked' : '') + '><span class="sw" aria-hidden="true"></span>' +
          '<span class="sw-text"><b>' + esc(f.label) + '</b>' + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</span></label></div>';
    }
    return '';
  }
  // label lookup: bulk_<type> → bulk → <type> → default
  function labelFor(m, def, t, bulk) { m = m || {}; return (bulk && (m['bulk_' + t] || m.bulk)) || m[t] || def; }

  function reminderEditor(container, list, onChange) {
    function draw() {
      container.innerHTML = list.map(function (r, i) {
        return '<div class="rem"><select data-i="' + i + '" data-f="days" aria-label="When">' + REM_DAYS.map(function (d) { return '<option value="' + d[0] + '"' + (+r.days === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') +
          '</select><span>at</span><input type="time" step="60" data-i="' + i + '" data-f="time" value="' + esc(r.time) + '" aria-label="Time"><button type="button" class="x" data-i="' + i + '" aria-label="Remove reminder">✕</button></div>';
      }).join('') || '<p class="muted small">No reminders.</p>';
    }
    container.onchange = function (e) { var t = e.target; if (!t.dataset.f) return; list[+t.dataset.i][t.dataset.f] = t.dataset.f === 'days' ? +t.value : t.value; if (onChange) onChange(list); };
    container.onclick = function (e) { var b = e.target.closest('.x'); if (!b) return; list.splice(+b.dataset.i, 1); draw(); if (onChange) onChange(list); };
    draw();
    return { add: function () { list.push({ days: 1, time: '09:00' }); draw(); if (onChange) onChange(list); } };
  }

  function renderForm(existing, fromVoice) {
    var page = $('#page-form'), form = $('#orderForm');
    var isEdit = !!(existing && existing.id);
    var o = Object.assign({ fulfillment: 'pickup', status: 'Inquiry', reminders: state.settings.defaultReminders }, existing || {});
    if (!isEdit && fromVoice && existing.deposit) o.status = 'Confirmed';
    if (!isEdit && existing && existing._newOn) o.dueDate = existing._newOn;
    if (!o.fulfillment) o.fulfillment = 'pickup';
    o.productType = PR.typeOf(o);
    if (!o.qtyUnit) o.qtyUnit = 'dozen';
    if (!o.itemSize) o.itemSize = 'Regular';
    o.reminders = (o.reminders || []).map(function (r) { return { days: +r.days, time: r.time }; });
    var voiceKeys = {};
    if (fromVoice) Object.keys(existing).forEach(function (k) { if (existing[k] !== '' && existing[k] != null && k !== 'warnings' && k !== 'transcript') voiceKeys[k] = 1; });
    $('#formTitle').textContent = isEdit ? 'Edit order' : 'New order';
    var html = '';
    if (fromVoice) {
      html += '<div class="voice-card"><b>🎤 Filled in from what you said</b> – check the <mark>highlighted</mark> fields, then Save.<p>“' + esc(existing.transcript) + '”</p>' +
        (existing.warnings && existing.warnings.length ? '<ul>' + existing.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    FORM.forEach(function (sec) {
      html += '<div class="form-section"><h3' + (sec.product ? ' id="productTitle"' : '') + '>' + (sec.product ? (PR.isBulk(o) ? PR.info(o).emoji + ' Bulk ' + PR.info(o).label.toLowerCase() : PR.info(o).section) : sec.title) + '</h3>';
      sec.fields.forEach(function (f) {
        html += f.row ? '<div class="two-col">' + f.row.map(function (x) { return fieldHTML(x, o, voiceKeys); }).join('') + '</div>' : fieldHTML(f, o, voiceKeys);
      });
      html += '</div>';
    });
    html += '<div class="form-section"><h3>📷 Photos <span class="count" id="photoCount"></span></h3><p class="muted small">Pictures the customer sent (up to ' + PH.MAX_PER_ORDER + '). Choose from Photos or take a picture.</p>' +
      '<label class="btn secondary block file-btn" id="addPhotosBtn">＋ Add photos<input type="file" id="photoInput" accept="image/*" multiple class="vh"></label>' +
      '<div class="photo-status muted small" id="photoStatus" hidden></div><div class="photo-list" id="formPhotos"></div></div>';
    html += '<div class="form-section"><h3>🔔 Reminders</h3><div class="reminders" id="formReminders"></div><button type="button" class="btn secondary small-btn" id="addReminder">＋ Add reminder</button></div>';
    html += '<button type="submit" class="btn block big">💾 Save order</button>';
    form.innerHTML = html;

    // photos: list of {id, caption}; blobs live in IndexedDB. Removed ones are deleted from storage on save;
    // photos added but never saved are cleaned up at next start (orphan sweep).
    var photos = (o.photos || []).map(function (p) { return { id: p.id, caption: p.caption || '' }; });
    var removedIds = [], photoBusy = 0;
    var remEd = reminderEditor($('#formReminders'), o.reminders);
    $('#addReminder').onclick = function () { remEd.add(); };
    function drawPhotos() {
      var box = $('#formPhotos');
      box.innerHTML = photos.map(function (p, i) {
        var cid = 'cap_' + p.id;
        return '<div class="photo-item"><div class="ph-thumb-wrap"><button type="button" class="ph-thumb" data-ph-open="' + i + '" aria-label="View photo ' + (i + 1) + '"><img data-pid="' + esc(p.id) + '" alt=""></button>' +
          '<button type="button" class="ph-remove" data-ph-remove="' + i + '" aria-label="Remove photo ' + (i + 1) + '">✕</button></div>' +
          '<div class="input-wrap ph-cap-wrap"><input id="' + cid + '" class="ph-caption" data-ph-cap="' + i + '" type="text" data-kind="text" autocapitalize="sentences" maxlength="140" placeholder="Caption (optional)" value="' + esc(p.caption) + '">' +
          '<button type="button" class="mic" data-mic="' + cid + '" aria-label="Dictate caption">🎤</button></div></div>';
      }).join('');
      PH.hydrate(box);
      $('#photoCount').textContent = photos.length ? photos.length + ' / ' + PH.MAX_PER_ORDER : '';
      $('#addPhotosBtn').classList.toggle('disabled', photos.length >= PH.MAX_PER_ORDER);
    }
    drawPhotos();
    $('#formPhotos').addEventListener('input', function (e) { var i = e.target.dataset.phCap; if (i != null && photos[+i]) photos[+i].caption = e.target.value; });
    $('#photoInput').onchange = function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      var room = PH.MAX_PER_ORDER - photos.length;
      if (room <= 0) { toast('This order already has ' + PH.MAX_PER_ORDER + ' photos – remove one first.'); return; }
      if (files.length > room) { toast('Only ' + room + ' more photo' + (room === 1 ? '' : 's') + ' fit – adding the first ' + room + '.', 4000); files = files.slice(0, room); }
      var status = $('#photoStatus'), failures = [], done = 0;
      photoBusy++;
      status.hidden = false;
      // one at a time keeps memory low on iPhone
      files.reduce(function (chain, f) {
        return chain.then(function () {
          status.textContent = 'Adding photo ' + (++done) + ' of ' + files.length + '…';
          return PH.processFile(f).then(function (rec) {
            return Store.photoPut(rec).then(function () { photos.push({ id: rec.id, caption: '' }); drawPhotos(); },
              function () { failures.push('Not enough storage space on this phone for more photos.'); });
          }).catch(function (err) { failures.push(err.friendly ? err.message : 'A photo could not be added.'); });
        });
      }, Promise.resolve()).then(function () {
        photoBusy--; status.hidden = true;
        if (failures.length) toast((failures.length === 1 ? '' : failures.length + ' photos not added. ') + failures[0], 7000);
        else toast(files.length === 1 ? 'Photo added 📷' : files.length + ' photos added 📷');
      });
    };
    function curType() { return (form.querySelector('input[name=productType]:checked') || { value: 'cake' }).value; }
    var shownType = null;
    // Switching product type relabels fields, swaps suggestion lists and shows/hides type-specific fields.
    // Values typed into hidden fields are kept (switching back restores them) but are ignored for this type.
    function curBulk() { var b = form.elements.bulk; return !!(b && b.checked) && curType() !== 'cake'; }
    function applyType(t, bulk) {
      shownType = t + (bulk ? '+bulk' : '');
      $('#productTitle').textContent = PR.TYPES[t].section;
      if (bulk) $('#productTitle').textContent = PR.TYPES[t].emoji + ' Bulk ' + PR.TYPES[t].label.toLowerCase();
      $$('label[data-labels]', form).forEach(function (l) { var m = JSON.parse(l.dataset.labels); l.textContent = labelFor(m, m._, t, bulk); var mb = l.parentNode.querySelector('.mic'); if (mb) mb.setAttribute('aria-label', 'Dictate ' + l.textContent); });
      $$('input[data-lists]', form).forEach(function (inp) { var id = 'dl_' + inp.name + '_' + t; inp.setAttribute('list', document.getElementById(id) ? id : 'dl_' + inp.name + '__'); });
      var sel = form.elements.itemSize;
      if (sel) {
        var opts = t === 'creampies' ? CP_SIZES : CUP_SIZES, cur = sel.value;
        sel.innerHTML = opts.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
        sel.value = opts.indexOf(cur) >= 0 ? cur : 'Regular';
      }
    }
    function refresh() {
      var fd = form.elements, pr = parseFloat(fd.price.value), dp = parseFloat(fd.deposit.value);
      $('#balanceVal').textContent = fd.status.value === 'Paid' ? 'Paid in full ✓' : (isNaN(pr) ? '—' : money(Math.max(pr - (isNaN(dp) ? 0 : dp), 0)));
      var ful = (form.querySelector('input[name=fulfillment]:checked') || {}).value, t = curType(), bulk = curBulk();
      if (t + (bulk ? '+bulk' : '') !== shownType) applyType(t, bulk);
      $$('[data-showif],[data-types],[data-bulk]', form).forEach(function (el) {
        var d = el.dataset;
        el.hidden = (d.showif && d.showif !== ful && !(d.bulkshow && bulk)) || (d.types && d.types.split(' ').indexOf(t) === -1) ||
          (d.bulk === 'only' && !bulk) || (d.bulk === 'hide' && bulk);
      });
    }
    form.oninput = form.onchange = refresh;
    refresh();
    form.onclick = function (e) {
      var m = e.target.closest('[data-mic]');
      if (m) { e.preventDefault(); micForField(m, document.getElementById(m.dataset.mic)); return; }
      var rm = e.target.closest('[data-ph-remove]');
      if (rm) { e.preventDefault(); var gone = photos.splice(+rm.dataset.phRemove, 1)[0]; if (gone) removedIds.push(gone.id); drawPhotos(); toast('Photo removed'); return; }
      var op = e.target.closest('[data-ph-open]');
      if (op) { e.preventDefault(); PH.open(photos, +op.dataset.phOpen, viewerOpts(name0())); }
    };
    function name0() { return form.elements.name.value.trim(); }
    function save(e) {
      if (e) e.preventDefault();
      var fd = form.elements, name = fd.name.value.trim(), due = fd.dueDate.value;
      if (!name) { toast('Please add the customer’s name'); fd.name.focus(); return; }
      if (!due) { toast('Please pick the due date'); fd.dueDate.focus(); return; }
      if (photoBusy) { toast('Still adding photos – one moment…'); return; }
      var num = function (x) { var n = parseFloat(String(x).replace(/[$,\s]/g, '')); return isNaN(n) ? '' : n; };
      var now = Date.now();
      var rec = Object.assign({}, isEdit ? existing : {}, {
        id: isEdit ? existing.id : uid(), createdAt: isEdit ? existing.createdAt : now, updatedAt: now,
        name: name, phone: fd.phone.value.trim(), email: fd.email.value.trim(),
        fulfillment: (form.querySelector('input[name=fulfillment]:checked') || { value: 'pickup' }).value,
        address: fd.address.value.trim(), customerNotes: fd.customerNotes.value.trim(), occasion: fd.occasion.value.trim(),
        dueDate: due, dueTime: fd.dueTime.value, size: fd.size.value.trim(), servings: num(fd.servings.value), tiers: num(fd.tiers.value),
        shape: fd.shape.value, flavor: fd.flavor.value.trim(), filling: fd.filling.value.trim(), frosting: fd.frosting.value.trim(),
        design: fd.design.value.trim(), message: fd.message.value.trim(), allergies: fd.allergies.value.trim(),
        price: num(fd.price.value), deposit: num(fd.deposit.value), status: fd.status.value, photos: photos.slice(),
        productType: curType(), qty: num(fd.qty.value), qtyUnit: (form.querySelector('input[name=qtyUnit]:checked') || { value: 'dozen' }).value,
        itemSize: fd.itemSize.value, liners: fd.liners.value.trim(), wrapped: (form.querySelector('input[name=wrapped]:checked') || { value: '' }).value,
        packaging: fd.packaging.value.trim(),
        bulk: curBulk(), organizer: fd.organizer.value.trim(), pricePerDozen: num(fd.pricePerDozen.value), pricePerHalf: num(fd.pricePerHalf.value),
        people: (existing && existing.people) || o.people || [],
        reminders: o.reminders.filter(function (r) { return r.time; })
      });
      delete rec._newOn; delete rec.warnings;
      if (fromVoice && existing.transcript) rec.transcript = existing.transcript;
      if (isEdit) state.orders = state.orders.map(function (x) { return x.id === rec.id ? rec : x; }); else state.orders.push(rec);
      Push.markDirty(rec.id);
      removedIds.forEach(function (pid) { Store.photoDel(pid).catch(function () {}); });
      persist().then(function () { toast(isEdit ? 'Order updated ✓' : (rec.productType === 'cake' ? 'Cake order' : PR.TYPES[rec.productType].label + ' order') + ' saved ' + PR.TYPES[rec.productType].emoji); })
        .catch(function () { toast('Could not save – phone storage may be full.', 5000); });
      if (fromVoice) $('#transcript').value = '';
      location.replace('#/order/' + rec.id);
    }
    form.onsubmit = save;
    $('#saveTop').onclick = save;
    return page;
  }

  // ---------- voice page ----------
  // Each recognition "session" rewrites its own text from event.results (robust against iOS duplicate/cumulative results);
  // when Safari ends a session after a pause we commit and restart while the user is still in listening mode.
  var bigRec = null, bigListening = false;
  function renderVoice() {
    var page = $('#page-voice');
    $('#voiceUnsupported').hidden = !!SR;
    $('#bigMic').hidden = !SR; $('#micStatus').hidden = !SR;
    $('#micStatus').textContent = 'Tap to start';
    return page;
  }
  function startBigMic() {
    var btn = $('#bigMic'), ta = $('#transcript');
    stopActive();
    bigListening = true;
    var restarts = 0;
    function begin() {
      var base = ta.value.trim();
      var rec = newRec(!IS_IOS); bigRec = rec;
      rec.onresult = function (ev) {
        var all = '';
        for (var i = 0; i < ev.results.length; i++) all += ev.results[i][0].transcript + ' ';
        all = all.replace(/\s+/g, ' ').trim();
        ta.value = (base ? base + ' ' : '') + all;
        restarts = 0;
      };
      rec.onerror = function (e) { if (e.error === 'no-speech' || e.error === 'aborted') return; bigListening = false; speechError(e); };
      rec.onend = function () {
        if (bigListening && restarts++ < 20) { try { begin(); return; } catch (e) {} }
        stopBigMic();
      };
      rec.start();
    }
    try { begin(); btn.classList.add('listening'); $('#micStatus').textContent = 'Listening… tap when you’re done'; }
    catch (e) { bigListening = false; toast('Could not start the microphone'); }
  }
  function stopBigMic() {
    bigListening = false;
    if (bigRec) { var r = bigRec; bigRec = null; r.onend = null; try { r.stop(); } catch (e) {} }
    $('#bigMic').classList.remove('listening');
    $('#micStatus').textContent = $('#transcript').value.trim() ? 'Tap to add more' : 'Tap to start';
  }

  // ---------- banner & notifications ----------
  function dueSoon() {
    var now = new Date(), today = startOfDay(now), soonEnd = addDays(today, 3);
    return state.orders.filter(function (o) {
      if (!o.dueDate || isClosed(o)) return false;
      var d = parseISO(o.dueDate);
      return d < soonEnd || (o.reminders || []).some(function (r) { return ICS.reminderDate(o, r) <= now; });
    }).sort(byDue);
  }
  function renderBanner() {
    var b = $('#banner'), list = dueSoon();
    var ps = Push.status();
    var canAsk = state.orders.length > 0 && (ps === 'off' ? Notification.permission !== 'denied' : ps === 'no-server' && 'Notification' in window && Notification.permission === 'default');
    var sig = list.map(function (o) { return o.id + o.dueDate; }).join('|') + canAsk;
    if ((!list.length && !canAsk) || sessionStorage.getItem('bannerHidden') === sig) { b.hidden = true; return; }
    var html = '';
    if (list.length) {
      html += '<h4>🔔 Coming up soon</h4><ul>' + list.slice(0, 5).map(function (o) {
        return '<li><button data-open="' + esc(o.id) + '"><b>' + esc(fmtDate(o.dueDate)) + (o.dueTime ? ' ' + esc(fmtTime(o.dueTime)) : '') + '</b> · ' + esc(o.name) +
          ' – ' + esc(PR.productPhrase(o)) + ' <span class="muted">(' + (isPast(o) ? 'past due – mark delivered?' : relDay(o.dueDate)) + ')</span></button></li>';
      }).join('') + '</ul>';
    }
    html += '<div class="row">' + (canAsk ? '<button class="btn small-btn" id="bannerNotif">Turn on alerts</button>' : '') + '<button class="btn link small-btn" id="bannerHide">Hide</button></div>';
    b.innerHTML = html; b.hidden = false;
    $('#bannerHide').onclick = function () { sessionStorage.setItem('bannerHidden', sig); b.hidden = true; };
    if ($('#bannerNotif')) $('#bannerNotif').onclick = function () { if (Push.status() === 'off') enablePush(); else requestNotifications(); };
  }
  function requestNotifications() {
    if (!('Notification' in window)) {
      toast(IS_IOS ? 'On iPhone, alerts need the Home-Screen app (Share › Add to Home Screen, iOS 16.4+). Calendar reminders always work.' : 'This browser does not support notifications.', 6000); return;
    }
    Notification.requestPermission().then(function (p) {
      toast(p === 'granted' ? 'Alerts are on 🔔' : 'Notifications were not allowed');
      checkReminders(); if (!$('#view-upcoming').hidden) renderBanner(); if (!$('#view-settings').hidden) renderSettings();
    });
  }
  function notify(title, body, tag, url) {
    var opts = { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: url } };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) return navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(title, opts); });
    try { var n = new Notification(title, opts); n.onclick = function () { window.focus(); location.hash = url; }; } catch (e) {}
    return Promise.resolve();
  }
  // What the push server gets for one order: customer name, product + quantity, occasion and due date/time.
  function pushRemindersFor(o) {
    if (!o || !o.dueDate || isClosed(o)) return [];
    var now = Date.now();
    return (o.reminders || []).filter(function (r) { return r && r.time; }).map(function (r) {
      var t = ICS.reminderDate(o, r);
      if (isNaN(t) || t.getTime() < now - 5 * 60000) return null; // server ignores older ones too
      var n = daysBetween(t, parseISO(o.dueDate));
      return {
        fireAt: t.toISOString(),
        title: reminderTitle(o, n),
        body: 'Due ' + fmtDate(o.dueDate) + (o.dueTime ? ' at ' + fmtTime(o.dueTime) : '') + (PR.isBulk(o) ? ' · ' + PR.bulkTotals(o).people + ' people' : '')
      };
    }).filter(Boolean).slice(0, 20);
  }
  // "🧁 Tomorrow: 2 dozen cupcakes for Jane Doe – Baby shower", "🎂 Today: Birthday cake for Sarah Johnson"
  function reminderTitle(o, n) {
    var cake = PR.typeOf(o) === 'cake';
    if (PR.isBulk(o)) return PR.info(o).emoji + ' ' + (n <= 0 ? 'Today: ' : n === 1 ? 'Tomorrow: ' : 'In ' + n + ' days: ') + PR.bulkTitle(o);
    return PR.info(o).emoji + ' ' + (n <= 0 ? 'Today: ' : n === 1 ? 'Tomorrow: ' : 'In ' + n + ' days: ') + PR.productPhrase(o) + ' for ' + (o.name || 'customer') +
      (!cake && o.occasion ? ' – ' + o.occasion : '');
  }
  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || Push.isOn()) return;
    var now = new Date(), changed = false;
    state.orders.forEach(function (o) {
      if (!o.dueDate || isClosed(o)) return;
      (o.reminders || []).forEach(function (r) {
        var t = ICS.reminderDate(o, r), key = o.id + '|' + t.getTime();
        if (t <= now && now - t < 36 * 3600000 && !state.settings.notified[key]) {
          state.settings.notified[key] = Date.now(); changed = true;
          var n = daysBetween(now, parseISO(o.dueDate));
          notify(reminderTitle(o, n),
            [fmtDate(o.dueDate) + (o.dueTime ? ' at ' + fmtTime(o.dueTime) : ''), o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup', o.flavor, o.allergies ? '⚠ ' + o.allergies : ''].filter(Boolean).join(' · '),
            key, '#/order/' + o.id);
        }
      });
    });
    if (changed) {
      var cutoff = Date.now() - 60 * 86400000;
      Object.keys(state.settings.notified).forEach(function (k) { if (state.settings.notified[k] < cutoff) delete state.settings.notified[k]; });
      persistSettings();
    }
  }

  // ---------- settings, export, backup ----------
  function renderSettings() {
    renderNotifCard();
    $('#signatureInput').value = state.settings.signature || '';
    $('#payInfoInput').value = state.settings.payInfo || '';
    var ed = reminderEditor($('#defaultReminders'), state.settings.defaultReminders, persistSettings);
    $('#addDefaultReminder').onclick = function () { ed.add(); };
    var n = state.orders.length, base = n + ' order' + (n === 1 ? '' : 's') + ' saved on this device.';
    $('#storageInfo').textContent = base + ' Save a backup now and then (e.g. to iCloud Drive).';
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
      $('#storageInfo').textContent = base + ' ' + (e.usage / 1048576).toFixed(1) + ' MB used. Save a backup now and then (e.g. to iCloud Drive).';
    }).catch(function () {});
  }
  function renderNotifCard() {
    var ps = Push.status(), el = $('#notifStatus'), html = '';
    var show = { pushOnBtn: false, pushTestBtn: false, pushOffBtn: false, notifBtn: false };
    if (ps === 'need-homescreen') {
      html = '<b>To get order reminders even when Cake Book is closed</b>, it has to be on your Home Screen (iPhone with iOS 16.4 or newer):' +
        '<ol class="push-steps"><li>In Safari tap the Share button <b>⬆︎</b></li><li>Choose <b>Add to Home Screen</b></li><li>Open Cake Book from the new Home Screen icon</li><li>Come back here (More) and tap <b>Turn on reminder notifications</b></li></ol>';
    } else if (ps === 'unsupported') {
      html = IS_IOS ? 'This iPhone needs iOS 16.4 or newer for app notifications. Use the calendar reminders below instead.' : 'This browser can’t receive push notifications. Use the calendar reminders below instead.';
    } else if (ps === 'denied') {
      html = 'Notifications are blocked for Cake Book. ' + (IS_IOS ? 'Open iPhone <b>Settings › Notifications › Cake Book</b>, turn on <b>Allow Notifications</b>, then come back here.' : 'Allow them in your browser’s site settings, then come back here.');
    } else if (ps === 'on') {
      var pend = Push.pendingCount(), le = Push.lastError();
      html = '✅ <b>Reminder notifications are ON.</b> They arrive at each reminder time, even when the app is closed.' +
        (pend ? '<br><span class="small">⏳ ' + (le === 'offline' ? 'Offline – ' : '') + 'waiting to sync changes' + (le && le !== 'offline' ? ' (' + esc(le) + ')' : '') + '… will retry automatically.</span>' : '');
      show.pushTestBtn = show.pushOffBtn = true;
    } else if (ps === 'off') {
      html = 'Get a notification on this phone at each order’s reminder times – even when Cake Book is closed.' +
        (Push.lastError() === 'unauthorized' ? '<br><b>Please turn reminder notifications on again.</b>' : '');
      show.pushOnBtn = true;
    } else { // no-server: in-app alerts only (old behaviour)
      html = !('Notification' in window) ? (IS_IOS ? 'On iPhone, app alerts work only after “Add to Home Screen” (iOS 16.4+). Calendar reminders (below) always work.' : 'Not supported in this browser.')
        : Notification.permission === 'granted' ? 'App alerts are ON – they appear when the app is open or recently opened.'
        : Notification.permission === 'denied' ? 'Alerts are blocked – change this in Settings › Notifications.' : 'App alerts are off.';
      show.notifBtn = 'Notification' in window && Notification.permission === 'default';
    }
    el.innerHTML = html;
    Object.keys(show).forEach(function (k) { $('#' + k).hidden = !show[k]; });
  }
  function enablePush() {
    var btn = $('#pushOnBtn'); btn.disabled = true; btn.textContent = 'Turning on…';
    Push.enable().then(function () {
      toast('Reminder notifications are on 🔔', 3500);
    }).catch(function (e) {
      toast(e.code === 'denied' ? 'Notifications were not allowed' : e.code === 'offline' ? 'No internet connection – try again when you’re online.' : 'Could not turn on notifications: ' + (e.message || e), 5000);
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Turn on reminder notifications';
      if (!$('#view-settings').hidden) renderNotifCard();
      if (!$('#view-upcoming').hidden) renderBanner();
    });
  }
  function exportICS(list, name) {
    if (!list.length) { toast('No orders to export'); return; }
    openCalendarFile(name, ICS.buildICS(list));
  }
  var preparedBackup = null;
  function exportJSON() {
    var btn = $('#exportJson');
    function deliver(b) {
      preparedBackup = null; btn.textContent = 'Save backup file';
      if (IS_IOS) shareOrDownload(b.name, b.text, 'application/json'); else { blobDownload(b.name, b.text, 'application/json'); toast('Backup saved'); }
    }
    if (preparedBackup && preparedBackup.sig === backupSig()) { deliver(preparedBackup); return; }
    var ids = [];
    state.orders.forEach(function (o) { (o.photos || []).forEach(function (p) { ids.push(p.id); }); });
    var t0 = Date.now();
    if (ids.length) toast('Preparing backup with ' + ids.length + ' photo' + (ids.length === 1 ? '' : 's') + '…', 8000);
    PH.exportPhotos(ids).then(function (photos) {
      var data = { app: 'cake-book', version: 2, exportedAt: new Date().toISOString(), orders: state.orders, photos: photos, settings: { defaultReminders: state.settings.defaultReminders, signature: state.settings.signature || '', payInfo: state.settings.payInfo || '' } };
      var b = { name: 'cake-book-backup-' + iso(new Date()) + '.json', text: JSON.stringify(data), sig: backupSig() };
      // Safari only allows the share sheet right after a tap; if preparing took a while, ask for one more tap.
      if (IS_IOS && Date.now() - t0 > 700) {
        preparedBackup = b; btn.textContent = '⬇︎ Tap again to save backup (' + (b.text.length / 1048576).toFixed(1) + ' MB)';
        toast('Backup ready – tap the button again to save it', 5000);
      } else deliver(b);
    }).catch(function () { toast('Could not read the photos for the backup'); });
  }
  function backupSig() { return state.orders.length + ':' + state.orders.reduce(function (m, o) { return Math.max(m, o.updatedAt || 0); }, 0); }
  function importJSON(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var data, list;
      try {
        data = JSON.parse(rd.result); list = Array.isArray(data) ? data : data.orders;
        if (!Array.isArray(list)) throw new Error('bad');
      } catch (e) { toast('That file is not a Cake Book backup'); return; }
      list = list.filter(function (o) { return o && typeof o === 'object' && o.id; });
      var photos = Array.isArray(data.photos) ? data.photos : [];
      if (!confirm('Restore ' + list.length + ' order(s)' + (photos.length ? ' and ' + photos.length + ' photo(s)' : '') + ' from this backup?\nOrders already here with the same ID will be replaced; others are kept.')) return;
      toast('Restoring…', 8000);
      migrateProductTypes(list);
      PH.importPhotos(photos).then(function () { return migrateLegacyPhotos(list); }).then(function () {
        var map = {};
        state.orders.forEach(function (o) { map[o.id] = o; });
        list.forEach(function (o) { if (map[o.id] && map[o.id] !== o) deleteReplacedPhotos(map[o.id], o); map[o.id] = o; });
        state.orders = Object.keys(map).map(function (k) { return map[k]; });
        if (data.settings && Array.isArray(data.settings.defaultReminders)) state.settings.defaultReminders = data.settings.defaultReminders;
        if (data.settings && typeof data.settings.signature === 'string' && !state.settings.signature) state.settings.signature = data.settings.signature;
        if (data.settings && typeof data.settings.payInfo === 'string' && !state.settings.payInfo) state.settings.payInfo = data.settings.payInfo;
        return Promise.all([persist(), persistSettings()]);
      }).then(function () { Push.fullSync(); toast('Restored ' + list.length + ' order' + (list.length === 1 ? '' : 's') + (photos.length ? ' and ' + photos.length + ' photos' : '') + ' ✓', 4000); route(); })
        .catch(function () { toast('Restore failed – the phone may be out of storage space.', 6000); });
    };
    rd.readAsText(file);
  }
  function deleteReplacedPhotos(oldO, newO) {
    var keep = {}; (newO.photos || []).forEach(function (p) { keep[p.id] = 1; });
    (oldO.photos || []).forEach(function (p) { if (!keep[p.id]) Store.photoDel(p.id).catch(function () {}); });
  }

  // ---------- photos: viewer options, legacy migration, orphan cleanup ----------
  function viewerOpts(name) {
    return { filePrefix: 'cake-' + slug(name || 'photo'),
      onShared: function (r) { if (r === 'opened') toast('Press and hold the picture to save it to Photos', 4000); },
      onError: function () { toast('Could not share this photo'); } };
  }
  // v6: orders gained a product type. Older orders (and old backups) are cakes; nothing else is touched.
  function migrateProductTypes(orders) {
    var changed = false;
    orders.forEach(function (o) { if (o && !PR.TYPES[o.productType]) { o.productType = 'cake'; changed = true; } });
    return changed;
  }
  // Old versions stored one downscaled data URL in order.photo – move it into the photos store.
  function migrateLegacyPhotos(orders) {
    var changed = false;
    return orders.reduce(function (p, o) {
      return p.then(function () {
        if (!o.photos) { o.photos = []; changed = true; }
        if (typeof o.photo !== 'string' || o.photo.indexOf('data:') !== 0) { if ('photo' in o && !o.photo) { delete o.photo; changed = true; } return; }
        var rec;
        try { rec = PH.recordFromDataURL(o.photo); } catch (e) { return; }
        return Store.photoPut(rec).then(function () {
          o.photos.unshift({ id: rec.id, caption: '' }); delete o.photo; changed = true;
        }).catch(function () { /* keep legacy field if storage fails */ });
      });
    }, Promise.resolve()).then(function () { return changed; });
  }
  function sweepOrphanPhotos() {
    var used = {};
    state.orders.forEach(function (o) { (o.photos || []).forEach(function (p) { used[p.id] = 1; }); });
    return Store.photoKeys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return !used[k]; }).map(function (k) { return Store.photoDel(k); }));
    }).catch(function () {});
  }
  function deleteOrderPhotos(o) { (o.photos || []).forEach(function (p) { Store.photoDel(p.id).catch(function () {}); }); }

  // ---------- events ----------
  function icsName(o) { return 'cake-' + slug(o.name) + '-' + o.dueDate + '.ics'; }
  function bind() {
    window.addEventListener('hashchange', function () { navCount++; route(); });
    document.addEventListener('click', function (e) {
      var t = e.target, el;
      if (t.closest('[data-stop]')) return;
      if ((el = t.closest('[data-back]'))) { e.preventDefault(); goBack(); return; }
      if ((el = t.closest('[data-go]'))) { location.hash = el.dataset.go; return; }
      if ((el = t.closest('[data-newon]'))) { e.preventDefault(); pendingDraft = { _newOn: el.dataset.newon }; location.hash = '#/new'; return; }
      if ((el = t.closest('[data-photo-open]'))) { var po = getOrder(el.dataset.photoOpen); if (po) PH.open(po.photos, +el.dataset.i, viewerOpts(po.name)); return; }
      if ((el = t.closest('[data-open]'))) { location.hash = '#/order/' + el.dataset.open; return; }
      if ((el = t.closest('[data-day]'))) {
        calState.selected = el.dataset.day; var d = parseISO(el.dataset.day);
        if (d.getMonth() !== calState.month.getMonth()) calState.month = new Date(d.getFullYear(), d.getMonth(), 1);
        renderCalendar(); return;
      }
      if ((el = t.closest('[data-filter]'))) { orderFilter = el.dataset.filter; renderOrders(); return; }
      if ((el = t.closest('[data-sheet-close]'))) { e.preventDefault(); closeSheet(); return; }
      if ((el = t.closest('[data-new-bulk]'))) { pendingDraft = { productType: 'creampies', bulk: true }; location.hash = '#/new'; return; }
      var bo = location.hash.indexOf('#/order/') === 0 ? getOrder(location.hash.split('/')[2]) : null;
      if (bo && PR.isBulk(bo)) {
        if ((el = t.closest('[data-person-add]'))) { personSheet(bo, null); return; }
        if ((el = t.closest('[data-paste-open]'))) { pasteSheet(bo); return; }
        if ((el = t.closest('[data-person-edit]'))) { var pe = getPerson(bo, el.dataset.personEdit); if (pe) personSheet(bo, pe); return; }
        if ((el = t.closest('[data-person-pay]'))) { var pp = getPerson(bo, el.dataset.personPay); if (pp) paySheet(bo, pp); return; }
        if ((el = t.closest('[data-person-pick]'))) {
          var pk = getPerson(bo, el.dataset.personPick); if (!pk) return;
          pk.pickedUp = !pk.pickedUp; if (pk.pickedUp) pk.pickedUpAt = Date.now(); else delete pk.pickedUpAt;
          var left = (bo.people || []).filter(function (x) { return !x.pickedUp; }).length;
          bulkChanged(bo, pk.pickedUp ? (pk.name || 'Person') + ' picked up ✓' + (left ? '' : ' – that’s everyone 🎉') : (pk.name || 'Person') + ' not picked up');
          return;
        }
        if ((el = t.closest('[data-person-text]'))) { var ptx = getPerson(bo, el.dataset.personText); if (ptx) { ptx.textedAt = Date.now(); bo.updatedAt = Date.now(); persist(); } return; }
        if ((el = t.closest('[data-walk]'))) { walkSheet(bo, el.dataset.walk); return; }
        if ((el = t.closest('[data-share-list]'))) { shareSheet(bo); return; }
        if ((el = t.closest('[data-bulk-more]'))) { moreSheet(bo); return; }
        if ((el = t.closest('[data-pfilter]'))) { peopleView.filter = el.dataset.pfilter; renderPeople(bo); return; }
        if ((el = t.closest('[data-psort]'))) { peopleView.sort = peopleView.sort === 'name' ? 'added' : 'name'; renderPeople(bo); return; }
      }
      if ((el = t.closest('[data-typefilter]'))) { typeFilter = el.dataset.typefilter; try { sessionStorage.setItem('typeFilter', typeFilter); } catch (x) {} renderUpcoming(); return; }
      if ((el = t.closest('[data-confirm-send]'))) {
        // the link itself opens Messages with the summary filled in; we just note when it was sent
        var cs = getOrder(el.dataset.confirmSend); if (!cs) return;
        if (confirmState(cs) === 'changed') { delete cs.customerConfirmedAt; delete cs.confirmedSig; }
        cs.confirmSentAt = Date.now(); cs.updatedAt = Date.now(); persist();
        setTimeout(function () { if (location.hash === '#/order/' + cs.id) { var y = $('#page-detail').scrollTop; renderDetail(cs.id); $('#page-detail').scrollTop = y; } }, 600);
        return;
      }
      if ((el = t.closest('[data-confirm-toggle]'))) {
        var ct = getOrder(el.dataset.confirmToggle); if (!ct) return;
        var msg;
        if (confirmState(ct) === 'confirmed') { delete ct.customerConfirmedAt; delete ct.confirmedSig; msg = 'Marked as not confirmed yet'; }
        else {
          ct.customerConfirmedAt = Date.now(); ct.confirmedSig = PR.confirmSig(ct); msg = 'Customer confirmed ✅';
          if (ct.status === 'Inquiry') { ct.status = 'Confirmed'; msg += ' · Status: Confirmed'; Push.markDirty(ct.id); }
        }
        ct.updatedAt = Date.now(); persist();
        var y2 = $('#page-detail').scrollTop; renderDetail(ct.id); $('#page-detail').scrollTop = y2; toast(msg); return;
      }
      if ((el = t.closest('[data-copy-summary]'))) {
        e.preventDefault(); var cc = getOrder(el.dataset.copySummary); if (!cc) return;
        var txt = confirmText(cc);
        (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Message copied – paste it into Messages'); }, function () { toast('Could not copy – press and hold the text to select it'); });
        return;
      }
      if ((el = t.closest('[data-ics]'))) { var o = getOrder(el.dataset.ics); if (o) exportICS([o], icsName(o)); return; }
      if ((el = t.closest('[data-icsfile]'))) { e.preventDefault(); var of = getOrder(el.dataset.icsfile); if (of) shareOrDownload(icsName(of), ICS.buildICS([of]), 'text/calendar'); return; }
      if ((el = t.closest('[data-status]'))) {
        var od = getOrder(location.hash.split('/')[2]); if (!od) return;
        od.status = el.dataset.status; od.updatedAt = Date.now(); persist(); Push.markDirty(od.id); renderDetail(od.id); toast('Status: ' + od.status); return;
      }
      if ((el = t.closest('[data-delete]'))) {
        var del = getOrder(el.dataset.delete);
        if (del && confirm('Delete the order for ' + (del.name || 'this customer') + '? This cannot be undone.')) {
          state.orders = state.orders.filter(function (x) { return x.id !== del.id; }); persist(); Push.markDirty(del.id); deleteOrderPhotos(del); toast('Order deleted'); location.replace('#/upcoming');
        }
      }
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'peopleSearch') { var so = getOrder(location.hash.split('/')[2]); if (so) { peopleView.q = e.target.value; renderPeople(so); } }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('.order-card')) e.target.click(); });
    $('#showDone').onchange = renderUpcoming;
    $('#calPrev').onclick = function () { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() - 1, 1); renderCalendar(); };
    $('#calNext').onclick = function () { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() + 1, 1); renderCalendar(); };
    $('#calToday').onclick = function () { var n = new Date(); calState.month = new Date(n.getFullYear(), n.getMonth(), 1); calState.selected = iso(n); renderCalendar(); };
    $('#searchInput').oninput = renderOrders;
    $('#notifBtn').onclick = requestNotifications;
    $('#pushOnBtn').onclick = enablePush;
    $('#pushOffBtn').onclick = function () {
      if (!confirm('Turn off reminder notifications on this phone? (Calendar reminders keep working.)')) return;
      Push.disable().then(function () { toast('Reminder notifications turned off'); });
    };
    $('#pushTestBtn').onclick = function () {
      var b = $('#pushTestBtn'); b.disabled = true;
      Push.sendTest().then(function () { toast('Test sent – it should appear in a few seconds 🔔', 4000); })
        .catch(function (e) { toast(e.code === 'offline' ? 'No internet connection' : (e.message || 'Test failed'), 5000); })
        .then(function () { b.disabled = false; });
    };
    $('#exportIcsUpcoming').onclick = function () { var today = iso(new Date()); exportICS(state.orders.filter(function (o) { return o.dueDate >= today && !isClosed(o); }), 'cake-orders-upcoming.ics'); };
    $('#exportIcsAll').onclick = function () { exportICS(state.orders.filter(function (o) { return o.dueDate; }), 'cake-orders-all.ics'); };
    $('#exportJson').onclick = exportJSON;
    $('#payInfoInput').onchange = function (e) { state.settings.payInfo = e.target.value.trim(); persistSettings(); toast(state.settings.payInfo ? 'Saved – texts will say “You can pay with ' + state.settings.payInfo + '”' : 'Payment info removed'); };
    $('#signatureInput').onchange = function (e) { state.settings.signature = e.target.value.trim(); persistSettings(); toast(state.settings.signature ? 'Texts will say “This is ' + state.settings.signature + '”' : 'Texts won’t include a name'); };
    $('#importJson').onchange = function (e) { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; };
    $('#wipeAll').onclick = function () {
      if (!state.orders.length) { toast('Nothing to delete'); return; }
      if (confirm('Delete ALL ' + state.orders.length + ' orders from this device?') && confirm('Really delete everything? Consider saving a backup first.')) {
        state.orders = []; persist(); Push.fullSync(); Store.photoClear().catch(function () {}); toast('All orders deleted'); route();
      }
    };
    $('#bigMic').onclick = function () { if (bigListening) stopBigMic(); else startBigMic(); };
    $('#clearTranscript').onclick = function () { $('#transcript').value = ''; $('#transcript').focus(); };
    $('#parseBtn').onclick = function () {
      if (bigListening) stopBigMic();
      var text = $('#transcript').value.trim();
      if (!text) { toast('Say or type the order first'); return; }
      var draft = P.parseOrder(text);
      delete draft._rest;
      draft.transcript = text;
      pendingDraft = draft;
      location.hash = '#/new?voice=1';
    };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { checkReminders(); if (!document.body.classList.contains('page-open') && !$('#view-upcoming').hidden) renderBanner(); } });
    setInterval(checkReminders, 60000);
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
    $('#installBtn').onclick = function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; $('#installBtn').hidden = true; }); };
  }

  // ---------- boot ----------
  var ordersLoaded = false;
  Promise.all([DB.get('orders'), DB.get('settings')]).then(function (res) {
    ordersLoaded = Array.isArray(res[0]);
    state.orders = ordersLoaded ? res[0] : [];
    if (res[1]) state.settings = Object.assign(state.settings, res[1]);
    if (!state.settings.notified) state.settings.notified = {};
    if (!Array.isArray(state.settings.defaultReminders)) state.settings.defaultReminders = DEFAULT_REMINDERS.slice();
    var typed = ordersLoaded && migrateProductTypes(state.orders);
    return migrateLegacyPhotos(state.orders).then(function (changed) { return changed || typed ? persist() : null; }).catch(function () {});
  }).then(function () {
    bind(); route(); checkReminders();
    Push.init({
      kvGet: Store.kvGet, kvSet: Store.kvSet,
      getOrders: function () { return state.orders; }, getOrder: getOrder, remindersFor: pushRemindersFor,
      onState: function () { if (!$('#view-settings').hidden) renderNotifCard(); }
    }).then(function () {
      // v6 reminder titles name the product ("2 dozen cupcakes for …"): refresh what the server has once.
      if (state.settings.pushTitles !== 2) { Push.fullSync(); state.settings.pushTitles = 2; persistSettings(); }
    });
    if (ordersLoaded) sweepOrphanPhotos(); // never sweep if orders could not be read
    document.documentElement.classList.add('ready');
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    var hadController = !!navigator.serviceWorker.controller, reloading = false;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').then(function (reg) {
        // check for a new version whenever the app is brought back to the foreground
        document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () {}); });
      }).catch(function () {});
    });
    // a new version took over: reload once so the new code runs (but never while she's filling in a form)
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) { hadController = true; return; }
      if (!document.body.classList.contains('page-open')) { reloading = true; location.reload(); }
      else toast('Cake Book was updated – it will refresh next time you open it.', 5000);
    });
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.url) location.hash = e.data.url; });
  }
  window.CakeApp = { closeSheet: closeSheet, products: PR, confirmText: confirmText, store: Store, photos: PH, push: Push, pushRemindersFor: pushRemindersFor, state: state, persist: persist, route: route, buildICS: function () { return ICS.buildICS(state.orders); } };
})();
