/* Cake Book – main app. Plain JS, no dependencies. Data lives in IndexedDB (localStorage fallback). */
(function () {
  'use strict';
  var P = window.CakeParser, ICS = window.CakeICS;

  // ---------- constants ----------
  var STATUSES = ['Inquiry', 'Confirmed', 'In progress', 'Ready', 'Delivered/Picked up', 'Paid'];
  var DEFAULT_REMINDERS = [{ days: 3, time: '09:00' }, { days: 0, time: '08:00' }];
  var OCCASION_LIST = ['Birthday', 'Wedding', 'Anniversary', 'Baby shower', 'Bridal shower', 'Gender reveal', 'Graduation', 'Retirement', 'Christening', 'Baptism', 'Holiday', 'Just because'];
  var FLAVOR_LIST = ['Vanilla', 'Chocolate', 'Red velvet', 'Lemon', 'Strawberry', 'Funfetti', 'Carrot', 'Marble', 'Almond', 'Coconut', 'Salted caramel', 'Cookies & cream'];
  var FILLING_LIST = ['Strawberry', 'Raspberry', 'Lemon curd', 'Chocolate ganache', 'Buttercream', 'Cream cheese', 'Salted caramel', 'Cookies & cream', 'Fresh fruit'];
  var FROSTING_LIST = ['Buttercream', 'Swiss meringue buttercream', 'Cream cheese frosting', 'Whipped cream', 'Fondant', 'Chocolate ganache', 'Naked'];
  var SIZE_LIST = ['4 inch', '6 inch', '8 inch', '10 inch', '6 & 8 inch', 'Quarter sheet', 'Half sheet', 'Full sheet', '12 cupcakes', '24 cupcakes'];
  var SHAPES = ['', 'Round', 'Square', 'Heart', 'Sheet', 'Rectangle', 'Number', 'Letter', 'Carved', 'Other'];
  var REM_DAYS = [[0, 'Same day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [4, '4 days before'], [5, '5 days before'], [7, '1 week before'], [14, '2 weeks before']];

  var FORM = [
    { title: '👤 Customer', fields: [
      { k: 'name', label: 'Customer name *', type: 'text', cap: 'words' },
      { k: 'phone', label: 'Phone', type: 'tel' },
      { k: 'email', label: 'Email', type: 'email' },
      { k: 'fulfillment', label: 'Pickup or delivery', type: 'segmented', options: [['pickup', '🏠 Pickup'], ['delivery', '🚗 Delivery']] },
      { k: 'address', label: 'Delivery address', type: 'textarea', rows: 2, showIf: 'delivery' },
      { k: 'customerNotes', label: 'Notes', type: 'textarea', rows: 2 }
    ] },
    { title: '🎂 Cake', fields: [
      { k: 'occasion', label: 'Occasion', type: 'text', list: OCCASION_LIST, cap: 'sentences' },
      { k: 'dueDate', label: 'Due date *', type: 'date' },
      { row: [{ k: 'dueTime', label: 'Time', type: 'time' }, { k: 'tiers', label: 'Tiers', type: 'number', min: 1, max: 9 }] },
      { k: 'size', label: 'Size', type: 'text', list: SIZE_LIST },
      { row: [{ k: 'servings', label: 'Servings', type: 'number', min: 1 }, { k: 'shape', label: 'Shape', type: 'select', options: SHAPES }] },
      { k: 'flavor', label: 'Cake flavor', type: 'text', list: FLAVOR_LIST, cap: 'sentences' },
      { k: 'filling', label: 'Filling', type: 'text', list: FILLING_LIST, cap: 'sentences' },
      { k: 'frosting', label: 'Frosting', type: 'text', list: FROSTING_LIST, cap: 'sentences' },
      { k: 'design', label: 'Colors / design', type: 'textarea', rows: 3 },
      { k: 'message', label: 'Message on cake', type: 'text', cap: 'sentences' },
      { k: 'allergies', label: 'Allergies / dietary', type: 'text' }
    ] },
    { title: '💵 Price & status', fields: [
      { row: [{ k: 'price', label: 'Price ($)', type: 'money' }, { k: 'deposit', label: 'Deposit paid ($)', type: 'money' }] },
      { k: '_balance', type: 'balance' },
      { k: 'status', label: 'Status', type: 'select', options: STATUSES }
    ] }
  ];

  // ---------- storage (IndexedDB via photos.js: "kv" store for orders/settings, "photos" store for image blobs) ----------
  var Store = window.CakeStore, PH = window.CakePhotos;
  var DB = { get: Store.kvGet, set: Store.kvSet };

  var state = { orders: [], settings: { defaultReminders: DEFAULT_REMINDERS.slice(), notified: {} } };
  function persist() { return DB.set('orders', state.orders); }
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
    stopActive(); if (bigListening) stopBigMic(); PH.close();
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
    var desc = [o.size, o.tiers > 1 ? o.tiers + ' tiers' : '', o.flavor, o.filling ? o.filling + ' filling' : '', o.frosting].filter(Boolean).join(' · ');
    var t = o.dueTime ? fmtTime(o.dueTime) : '', ampm = (t.match(/\s?[AP]M$/i) || [''])[0];
    var timeBox = opts.showDate
      ? '<div class="time">' + esc(o.dueDate ? fmtDate(o.dueDate, { month: 'short', day: 'numeric' }) : '—') + '<small>' + esc(t || (o.dueDate ? parseISO(o.dueDate).getFullYear() : '')) + '</small></div>'
      : '<div class="time">' + (t ? esc(t.replace(ampm, '')) + '<small>' + esc(ampm.trim()) + '</small>' : '<small>All day</small>') + '</div>';
    var bal = balance(o);
    return '<div class="order-card' + (overdue ? ' overdue' : '') + '" role="button" tabindex="0" data-open="' + esc(o.id) + '">' + timeBox +
      '<div class="info"><div class="name">' + occasionEmoji(o) + ' ' + esc(o.name || 'Unnamed') + '</div>' +
      '<div class="desc">' + esc([o.occasion, desc].filter(Boolean).join(' – ') || 'No cake details yet') + '</div>' +
      '<div class="meta"><span class="pill ' + statusClass(o.status) + '">' + esc(o.status) + '</span>' +
      '<span class="pill plain">' + (o.fulfillment === 'delivery' ? '🚗 Delivery' : '🏠 Pickup') + '</span>' +
      (o.allergies ? '<span class="pill warn">⚠ Allergy</span>' : '') +
      (bal > 0 ? '<span class="pill plain">Due ' + money(bal) + '</span>' : '') +
      (nPhotos(o) ? '<span class="pill photo-pill" aria-label="' + nPhotos(o) + ' photos">📷 ' + nPhotos(o) + '</span>' : '') +
      (overdue ? '<span class="pill warn">Past due</span>' : '') + '</div></div>' +
      (nPhotos(o) ? '<img class="thumb" data-pid="' + esc(o.photos[0].id) + '" alt="">' : '') +
      (o.phone ? '<a class="call" href="' + telHref(o.phone) + '" aria-label="Call ' + esc(o.name) + '" data-stop>📞</a>' : '') +
      '</div>';
  }
  function nPhotos(o) { return (o.photos && o.photos.length) || 0; }
  function emptyHTML(title, text) { return '<div class="empty"><span class="big-emoji">🧁</span><h3>' + esc(title) + '</h3><p>' + text + '</p></div>'; }

  // ---------- upcoming ----------
  function renderUpcoming() {
    var showDone = $('#showDone').checked;
    var today = startOfDay(new Date()), weekEnd = addDays(today, 7);
    var g = { overdue: [], today: [], week: [], later: [], nodate: [], done: [] };
    state.orders.slice().sort(byDue).forEach(function (o) {
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
    if (!html) html = state.orders.length
      ? emptyHTML('All caught up!', 'No upcoming cakes. Tap “Talk to add a cake” when the next order comes in.')
      : emptyHTML('No cake orders yet', 'Tap <b>🎤 Talk to add a cake</b> and just say the order,<br>or type it in with <b>＋ Type a new order</b>.');
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
      var dots = list.slice(0, 4).map(function (o) { return '<i class="dot' + (isClosed(o) ? ' done' : '') + '"></i>'; }).join('');
      html += '<button class="' + cls + '" data-day="' + di + '" aria-label="' + esc(d.toDateString() + (list.length ? ', ' + list.length + ' cake' + (list.length > 1 ? 's' : '') : '')) + '">' + d.getDate() + '<span class="dots">' + dots + '</span></button>';
    }
    $('#calGrid').innerHTML = html;
    var sel = (byDay[calState.selected] || []).sort(byDue);
    $('#calDayTitle').textContent = fmtDate(calState.selected, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#calDayList').innerHTML = sel.length ? sel.map(function (o) { return cardHTML(o); }).join('')
      : '<p class="muted center">No cakes this day. <a href="#/new" data-newon="' + calState.selected + '">Add one</a></p>';
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
      return (o.name || '').toLowerCase().indexOf(q) >= 0 || (qd.length >= 3 && (o.phone || '').replace(/\D/g, '').indexOf(qd) >= 0);
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
      '<div class="detail-hero"><div class="hero-emoji">' + occasionEmoji(o) + '</div>' +
      '<div class="when">' + esc(fmtDate(o.dueDate)) + (o.dueTime ? ' · ' + esc(fmtTime(o.dueTime)) : '') + '</div>' +
      '<div class="sub">' + esc([o.occasion, relDay(o.dueDate), o.fulfillment === 'delivery' ? '🚗 Delivery' : '🏠 Pickup'].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="action-row">' +
      (o.phone ? '<a href="' + telHref(o.phone) + '"><span>📞</span>Call</a><a href="' + smsHref(o.phone) + '"><span>💬</span>Text</a>' : '') +
      (o.email ? '<a href="mailto:' + esc(o.email) + '"><span>✉️</span>Email</a>' : '') +
      (mapUrl ? '<a href="' + mapUrl + '" target="_blank" rel="noopener"><span>🗺️</span>Map</a>' : '') +
      '<button data-ics="' + esc(o.id) + '"><span>📅</span>Calendar</button></div>' +
      (o.allergies ? '<div class="allergy">⚠️ Allergies / dietary: ' + esc(o.allergies) + '</div>' : '') +
      '<div class="card"><h4 class="mt0">Status</h4><div class="status-picker">' + STATUSES.map(function (s) { return '<button class="' + statusClass(s) + (o.status === s ? ' on' : '') + '" data-status="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>📷 Photos' + (nPhotos(o) ? ' <span class="count">' + nPhotos(o) + '</span>' : '') + '</h3>' +
      (nPhotos(o) ? '<div class="photo-grid">' + o.photos.map(function (p, i) {
        return '<button class="ph-tile" data-photo-open="' + esc(o.id) + '" data-i="' + i + '" aria-label="Open photo ' + (i + 1) + '"><img data-pid="' + esc(p.id) + '" alt="' + esc(p.caption || 'Photo ' + (i + 1)) + '">' +
          (p.caption ? '<span class="ph-cap">' + esc(p.caption) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '<p class="muted small">No photos yet. <a href="#/edit/' + esc(o.id) + '">Add the picture the customer sent</a></p>') + '</div>' +
      '<div class="card"><h3>🎂 The cake</h3>' + (o.message ? '<div class="message-plaque">“' + esc(o.message) + '”</div>' : '') +
      '<dl class="kv">' + row('Occasion', esc(o.occasion)) + row('Size', esc(o.size)) + row('Tiers', esc(o.tiers)) + row('Shape', esc(o.shape)) + row('Servings', esc(o.servings)) +
      row('Flavor', esc(o.flavor)) + row('Filling', esc(o.filling)) + row('Frosting', esc(o.frosting)) + row('Colors / design', esc(o.design).replace(/\n/g, '<br>')) + '</dl></div>' +
      '<div class="card"><h3>💵 Money</h3><dl class="kv">' + row('Price', money(o.price)) + row('Deposit paid', money(o.deposit)) + '</dl>' +
      '<div class="balance-box"><span>Balance due</span><span>' + (o.status === 'Paid' ? 'Paid in full ✓' : money(balance(o))) + '</span></div></div>' +
      '<div class="card"><h3>👤 Customer</h3><dl class="kv">' + row('Name', esc(o.name)) +
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
    return page;
  }

  // ---------- form ----------
  function fieldHTML(f, o, voiceKeys) {
    var v = o[f.k] == null ? '' : o[f.k], id = 'f_' + f.k, vf = voiceKeys[f.k] ? ' voice-filled' : '';
    var mic = '<button type="button" class="mic" data-mic="' + id + '" aria-label="Dictate ' + esc(f.label) + '">🎤</button>';
    var lab = '<label for="' + id + '">' + esc(f.label) + '</label>';
    var listAttr = f.list ? ' list="dl_' + f.k + '"' : '';
    var dl = f.list ? '<datalist id="dl_' + f.k + '">' + f.list.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' : '';
    var capA = f.cap ? ' autocapitalize="' + f.cap + '"' : '';
    var wrapAttrs = f.showIf ? ' data-showif="' + f.showIf + '"' : '';
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
      case 'money':
        return wrap('<input id="' + id + '" name="' + f.k + '" type="text" inputmode="decimal" value="' + esc(v) + '" data-kind="money" placeholder="0">');
      case 'select':
        return wrap('<select id="' + id + '" name="' + f.k + '">' + f.options.map(function (x) { return '<option value="' + esc(x) + '"' + (x === v ? ' selected' : '') + '>' + esc(x || '—') + '</option>'; }).join('') + '</select>');
      case 'segmented':
        return '<div class="field"><span class="field-label">' + esc(f.label) + '</span><div class="segmented' + vf + '">' + f.options.map(function (x) { return '<label><input type="radio" name="' + f.k + '" value="' + x[0] + '"' + (v === x[0] ? ' checked' : '') + '><span>' + x[1] + '</span></label>'; }).join('') + '</div></div>';
      case 'balance':
        return '<div class="balance-box"><span>Balance due</span><span id="balanceVal"></span></div>';
    }
    return '';
  }

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
      html += '<div class="form-section"><h3>' + sec.title + '</h3>';
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
    function refresh() {
      var fd = form.elements, pr = parseFloat(fd.price.value), dp = parseFloat(fd.deposit.value);
      $('#balanceVal').textContent = fd.status.value === 'Paid' ? 'Paid in full ✓' : (isNaN(pr) ? '—' : money(Math.max(pr - (isNaN(dp) ? 0 : dp), 0)));
      var ful = (form.querySelector('input[name=fulfillment]:checked') || {}).value;
      $$('[data-showif]', form).forEach(function (el) { el.hidden = el.dataset.showif !== ful; });
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
        reminders: o.reminders.filter(function (r) { return r.time; })
      });
      delete rec._newOn; delete rec.warnings;
      if (fromVoice && existing.transcript) rec.transcript = existing.transcript;
      if (isEdit) state.orders = state.orders.map(function (x) { return x.id === rec.id ? rec : x; }); else state.orders.push(rec);
      removedIds.forEach(function (pid) { Store.photoDel(pid).catch(function () {}); });
      persist().then(function () { toast(isEdit ? 'Order updated ✓' : 'Cake order saved 🎂'); })
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
    var canAsk = 'Notification' in window && Notification.permission === 'default' && state.orders.length > 0;
    var sig = list.map(function (o) { return o.id + o.dueDate; }).join('|') + canAsk;
    if ((!list.length && !canAsk) || sessionStorage.getItem('bannerHidden') === sig) { b.hidden = true; return; }
    var html = '';
    if (list.length) {
      html += '<h4>🔔 Coming up soon</h4><ul>' + list.slice(0, 5).map(function (o) {
        return '<li><button data-open="' + esc(o.id) + '"><b>' + esc(fmtDate(o.dueDate)) + (o.dueTime ? ' ' + esc(fmtTime(o.dueTime)) : '') + '</b> · ' + esc(o.name) +
          (o.occasion ? ' – ' + esc(o.occasion) : '') + ' <span class="muted">(' + (isPast(o) ? 'past due – mark delivered?' : relDay(o.dueDate)) + ')</span></button></li>';
      }).join('') + '</ul>';
    }
    html += '<div class="row">' + (canAsk ? '<button class="btn small-btn" id="bannerNotif">Turn on alerts</button>' : '') + '<button class="btn link small-btn" id="bannerHide">Hide</button></div>';
    b.innerHTML = html; b.hidden = false;
    $('#bannerHide').onclick = function () { sessionStorage.setItem('bannerHidden', sig); b.hidden = true; };
    if ($('#bannerNotif')) $('#bannerNotif').onclick = requestNotifications;
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
  function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var now = new Date(), changed = false;
    state.orders.forEach(function (o) {
      if (!o.dueDate || isClosed(o)) return;
      (o.reminders || []).forEach(function (r) {
        var t = ICS.reminderDate(o, r), key = o.id + '|' + t.getTime();
        if (t <= now && now - t < 36 * 3600000 && !state.settings.notified[key]) {
          state.settings.notified[key] = Date.now(); changed = true;
          var n = daysBetween(now, parseISO(o.dueDate));
          notify('🎂 ' + (n <= 0 ? 'Today: ' : n === 1 ? 'Tomorrow: ' : 'In ' + n + ' days: ') + (o.name || 'Cake') + (o.occasion ? ' – ' + o.occasion : ''),
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
    var st = !('Notification' in window) ? (IS_IOS ? 'On iPhone, app alerts work only after “Add to Home Screen” (iOS 16.4+). Calendar reminders (below) always work.' : 'Not supported in this browser.')
      : Notification.permission === 'granted' ? 'App alerts are ON – they appear when the app is open or recently opened.'
      : Notification.permission === 'denied' ? 'Alerts are blocked – change this in Settings › Notifications.' : 'App alerts are off.';
    $('#notifStatus').textContent = st;
    $('#notifBtn').hidden = !('Notification' in window) || Notification.permission !== 'default';
    var ed = reminderEditor($('#defaultReminders'), state.settings.defaultReminders, persistSettings);
    $('#addDefaultReminder').onclick = function () { ed.add(); };
    var n = state.orders.length, base = n + ' order' + (n === 1 ? '' : 's') + ' saved on this device.';
    $('#storageInfo').textContent = base + ' Save a backup now and then (e.g. to iCloud Drive).';
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
      $('#storageInfo').textContent = base + ' ' + (e.usage / 1048576).toFixed(1) + ' MB used. Save a backup now and then (e.g. to iCloud Drive).';
    }).catch(function () {});
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
      var data = { app: 'cake-book', version: 2, exportedAt: new Date().toISOString(), orders: state.orders, photos: photos, settings: { defaultReminders: state.settings.defaultReminders } };
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
      PH.importPhotos(photos).then(function () { return migrateLegacyPhotos(list); }).then(function () {
        var map = {};
        state.orders.forEach(function (o) { map[o.id] = o; });
        list.forEach(function (o) { if (map[o.id] && map[o.id] !== o) deleteReplacedPhotos(map[o.id], o); map[o.id] = o; });
        state.orders = Object.keys(map).map(function (k) { return map[k]; });
        if (data.settings && Array.isArray(data.settings.defaultReminders)) state.settings.defaultReminders = data.settings.defaultReminders;
        return Promise.all([persist(), persistSettings()]);
      }).then(function () { toast('Restored ' + list.length + ' order' + (list.length === 1 ? '' : 's') + (photos.length ? ' and ' + photos.length + ' photos' : '') + ' ✓', 4000); route(); })
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
      if ((el = t.closest('[data-ics]'))) { var o = getOrder(el.dataset.ics); if (o) exportICS([o], icsName(o)); return; }
      if ((el = t.closest('[data-icsfile]'))) { e.preventDefault(); var of = getOrder(el.dataset.icsfile); if (of) shareOrDownload(icsName(of), ICS.buildICS([of]), 'text/calendar'); return; }
      if ((el = t.closest('[data-status]'))) {
        var od = getOrder(location.hash.split('/')[2]); if (!od) return;
        od.status = el.dataset.status; od.updatedAt = Date.now(); persist(); renderDetail(od.id); toast('Status: ' + od.status); return;
      }
      if ((el = t.closest('[data-delete]'))) {
        var del = getOrder(el.dataset.delete);
        if (del && confirm('Delete the order for ' + (del.name || 'this customer') + '? This cannot be undone.')) {
          state.orders = state.orders.filter(function (x) { return x.id !== del.id; }); persist(); deleteOrderPhotos(del); toast('Order deleted'); location.replace('#/upcoming');
        }
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('.order-card')) e.target.click(); });
    $('#showDone').onchange = renderUpcoming;
    $('#calPrev').onclick = function () { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() - 1, 1); renderCalendar(); };
    $('#calNext').onclick = function () { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() + 1, 1); renderCalendar(); };
    $('#calToday').onclick = function () { var n = new Date(); calState.month = new Date(n.getFullYear(), n.getMonth(), 1); calState.selected = iso(n); renderCalendar(); };
    $('#searchInput').oninput = renderOrders;
    $('#notifBtn').onclick = requestNotifications;
    $('#exportIcsUpcoming').onclick = function () { var today = iso(new Date()); exportICS(state.orders.filter(function (o) { return o.dueDate >= today && !isClosed(o); }), 'cake-orders-upcoming.ics'); };
    $('#exportIcsAll').onclick = function () { exportICS(state.orders.filter(function (o) { return o.dueDate; }), 'cake-orders-all.ics'); };
    $('#exportJson').onclick = exportJSON;
    $('#importJson').onchange = function (e) { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; };
    $('#wipeAll').onclick = function () {
      if (!state.orders.length) { toast('Nothing to delete'); return; }
      if (confirm('Delete ALL ' + state.orders.length + ' orders from this device?') && confirm('Really delete everything? Consider saving a backup first.')) {
        state.orders = []; persist(); Store.photoClear().catch(function () {}); toast('All orders deleted'); route();
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
    return migrateLegacyPhotos(state.orders).then(function (changed) { return changed ? persist() : null; }).catch(function () {});
  }).then(function () {
    bind(); route(); checkReminders();
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
  window.CakeApp = { store: Store, photos: PH, state: state, persist: persist, route: route, buildICS: function () { return ICS.buildICS(state.orders); } };
})();
