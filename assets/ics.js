/* Cake Book – iCalendar (.ics) builder with VALARM reminders. Browser (window.CakeICS) + Node. */
(function (root) {
  'use strict';
  var PR = (typeof module !== 'undefined' && module.exports) ? require('./products.js') : root.CakeProducts;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseLocal(dateStr, timeStr) {
    var d = dateStr.split('-').map(Number);
    var t = (timeStr || '00:00').split(':').map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, 0);
  }
  // Start of the cake event (local). If no time, midnight (all-day event).
  function orderStart(o) { return parseLocal(o.dueDate, o.dueTime || '00:00'); }
  // A reminder is {days: N days before, time: 'HH:MM'} → absolute local Date.
  function reminderDate(o, rem) {
    var base = parseLocal(o.dueDate, rem.time || '09:00');
    base.setDate(base.getDate() - (parseInt(rem.days, 10) || 0));
    return base;
  }
  function wall(d) { return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()); }
  function fmtLocal(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; }
  function fmtDate(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function fmtUTC(d) { return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'; }
  function esc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function duration(mins) {
    var neg = mins < 0; mins = Math.abs(Math.round(mins));
    var d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    var s = 'P' + (d ? d + 'D' : '');
    if (h || m || !d) s += 'T' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + (!h && !m ? '0M' : '');
    return (neg ? '-' : '') + s;
  }
  function byteLen(ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  // RFC 5545 line folding: max 75 octets per line, continuation lines start with a space.
  function fold(line) {
    var out = [], cur = '', len = 0, limit = 75;
    for (var ch of line) {
      var b = byteLen(ch);
      if (len + b > limit) { out.push(cur); cur = ' '; len = 1; limit = 75; }
      cur += ch; len += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function money(n) { return n === '' || n == null || isNaN(n) ? '' : '$' + Number(n).toFixed(2).replace(/\.00$/, ''); }

  function describe(o) {
    var bal = o.status === 'Paid' ? 0 : Math.max((+o.price || 0) - (+o.deposit || 0), 0);
    var lines = [
      'Customer: ' + (o.name || '') + (o.phone ? ' · ' + o.phone : '') + (o.email ? ' · ' + o.email : ''),
      (o.fulfillment === 'delivery' ? 'DELIVERY' + (o.address ? ' to ' + o.address : '') : 'Pickup'),
      'Order: ' + PR.productPhrase(o),
      o.occasion && 'Occasion: ' + o.occasion
    ].concat(PR.specRows(o).map(function (r) { return r[0] + ': ' + r[1]; }), [
      o.allergies && '⚠ Allergies: ' + o.allergies,
      o.price !== '' && o.price != null && ('Price: ' + money(o.price) + (o.deposit ? ' · Deposit: ' + money(o.deposit) : '') + ' · Balance due: ' + money(bal)),
      'Status: ' + (o.status || '') + (o.customerConfirmedAt ? ' (customer confirmed)' : ''), o.customerNotes && 'Notes: ' + o.customerNotes
    ]);
    return lines.filter(Boolean).join('\n');
  }

  function eventLines(o, now) {
    var start = orderStart(o), allDay = !o.dueTime;
    var L = ['BEGIN:VEVENT', 'UID:' + o.id + '@cakebook.app', 'DTSTAMP:' + fmtUTC(now)];
    if (allDay) {
      var next = new Date(start); next.setDate(next.getDate() + 1);
      L.push('DTSTART;VALUE=DATE:' + fmtDate(start), 'DTEND;VALUE=DATE:' + fmtDate(next));
    } else {
      var end = new Date(start.getTime() + 60 * 60000);
      L.push('DTSTART:' + fmtLocal(start), 'DTEND:' + fmtLocal(end));
    }
    // e.g. "🧁 Pickup: 2 dozen cupcakes for Jane Doe – Baby shower", "🎂 Deliver: Wedding cake for Maria Garcia"
    var cake = PR.typeOf(o) === 'cake', what = PR.productPhrase(o) + ' for ' + (o.name || 'customer') + (!cake && o.occasion ? ' – ' + o.occasion : '');
    var title = PR.info(o).emoji + ' ' + (o.fulfillment === 'delivery' ? 'Deliver' : 'Pickup') + ': ' + what;
    L.push('SUMMARY:' + esc(title), 'DESCRIPTION:' + esc(describe(o)));
    if (o.fulfillment === 'delivery' && o.address) L.push('LOCATION:' + esc(o.address));
    L.push('STATUS:' + (o.status === 'Inquiry' ? 'TENTATIVE' : 'CONFIRMED'));
    if (o.updatedAt) L.push('LAST-MODIFIED:' + fmtUTC(new Date(o.updatedAt)));
    (o.reminders || []).forEach(function (rem) {
      var mins = (wall(start) - wall(reminderDate(o, rem))) / 60000; // wall-clock minutes before start (DST-safe); negative = after start
      var label = (+rem.days === 0 ? 'Today' : rem.days + (+rem.days === 1 ? ' day' : ' days') + ' until') + ': ' + what;
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(label), 'TRIGGER:' + duration(-mins), 'END:VALARM');
    });
    L.push('END:VEVENT');
    return L;
  }

  function buildICS(orders, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cake Book//Cake Orders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Cake orders'];
    orders.filter(function (o) { return o.dueDate; }).forEach(function (o) { L = L.concat(eventLines(o, now)); });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  var api = { buildICS: buildICS, reminderDate: reminderDate, orderStart: orderStart, duration: duration, fold: fold, describe: describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CakeICS = api;
})(this);
