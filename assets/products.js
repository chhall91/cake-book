/* Cake Book – product types (Cake / Cupcakes / Oatmeal cream pies): labels, descriptions and the customer
 * confirmation text. Browser (window.CakeProducts) + Node (module.exports). */
(function (root) {
  'use strict';
  var TYPES = {
    cake: { key: 'cake', label: 'Cake', plural: 'Cakes', emoji: '🎂', section: '🎂 Cake', detail: '🎂 The cake' },
    cupcakes: { key: 'cupcakes', label: 'Cupcakes', plural: 'Cupcakes', emoji: '🧁', section: '🧁 Cupcakes', detail: '🧁 The cupcakes' },
    creampies: { key: 'creampies', label: 'Oatmeal cream pies', plural: 'Cream pies', emoji: '🍪', section: '🍪 Oatmeal cream pies', detail: '🍪 The oatmeal cream pies' }
  };
  var ORDER = ['cake', 'cupcakes', 'creampies'];
  function typeOf(o) { var t = o && o.productType; return TYPES[t] ? t : 'cake'; }
  function info(o) { return TYPES[typeOf(o)]; }
  function has(v) { return v !== '' && v != null && !(typeof v === 'number' && isNaN(v)); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function num(n) { n = +n; return String(Math.round(n * 100) / 100); }
  function money(n) { return '$' + Number(n).toFixed(2).replace(/\.00$/, ''); }

  // "2 dozen" / "30" / "" (no quantity)
  function qtyText(o) {
    if (!has(o.qty) || !(+o.qty > 0)) return '';
    return o.qtyUnit === 'each' ? num(o.qty) : num(o.qty) + ' dozen';
  }
  function pieces(o) { if (!(+o.qty > 0)) return 0; return o.qtyUnit === 'each' ? +o.qty : Math.round(+o.qty * 12); }
  function sizeWord(o) { var s = String(o.itemSize || '').trim(); return s && !/^regular$/i.test(s) ? s.toLowerCase() : ''; }
  /** "Birthday cake", "2 dozen mini cupcakes", "1 oatmeal cream pie", "Cupcakes" */
  function productPhrase(o) {
    var t = typeOf(o);
    if (isBulk(o)) {
      var bt = bulkTotals(o);
      return cap((bt.dozen ? num(bt.dozen) + ' dozen ' : '') + (sizeWord(o) ? sizeWord(o) + ' ' : '') + (t === 'cupcakes' ? 'cupcakes' : 'oatmeal cream pies'));
    }
    if (t === 'cake') { var oc = String(o.occasion || '').trim(); return oc ? (/\bcake$/i.test(oc) ? cap(oc) : cap(oc) + ' cake') : 'Cake'; }
    var q = qtyText(o), one = o.qtyUnit === 'each' && +o.qty === 1;
    var noun = t === 'cupcakes' ? (one ? 'cupcake' : 'cupcakes') : (one ? 'oatmeal cream pie' : 'oatmeal cream pies');
    return cap([q, sizeWord(o), noun].filter(Boolean).join(' '));
  }
  function wrappedText(o) {
    var w = o.wrapped === 'yes' ? 'Individually wrapped' : o.wrapped === 'no' ? 'Not individually wrapped' : '';
    return [w, String(o.packaging || '').trim()].filter(Boolean).join(', ');
  }
  /** Short description for list cards. */
  function cardDesc(o) {
    var t = typeOf(o), b;
    if (isBulk(o)) {
      var bt = bulkTotals(o);
      return ['Bulk', bt.people + (bt.people === 1 ? ' person' : ' people'), dz(bt.dozen),
        bt.outstanding > 0.004 ? money(bt.outstanding) + ' unpaid' : bt.unpaid ? bt.unpaid + ' unpaid' : bt.people ? 'all paid ✓' : ''].filter(Boolean).join(' · ');
    }
    if (t === 'cake') b = [o.size, o.tiers > 1 ? o.tiers + ' tiers' : '', o.flavor, o.filling ? o.filling + ' filling' : '', o.frosting];
    else if (t === 'cupcakes') b = [productPhrase(o), o.flavor, o.filling ? o.filling + ' filling' : '', o.frosting];
    else b = [productPhrase(o), o.flavor ? o.flavor + ' cookie' : '', o.filling ? o.filling + ' filling' : '', o.wrapped === 'yes' ? 'wrapped' : ''];
    return b.filter(Boolean).join(' · ');
  }
  /** [label, value] rows describing the product (for details, calendar descriptions and the customer text). */
  function specRows(o) {
    var t = typeOf(o), r;
    if (isBulk(o)) {
      var bt = bulkTotals(o);
      r = [['Total', num(bt.dozen) + ' dozen (' + bt.cookies + ')'], ['Size', o.itemSize], [t === 'creampies' ? 'Default cookie' : 'Default flavor', o.flavor], ['Default filling', o.filling],
        ['Frosting', t === 'cupcakes' ? o.frosting : ''], ['Price', priceText(o)], ['Packaging', t === 'creampies' ? wrappedText(o) : ''], ['Decorations', t === 'cupcakes' ? o.design : '']];
      return r.filter(function (x) { return has(x[1]) && String(x[1]).trim() !== ''; });
    }
    if (t === 'cake') {
      r = [['Size', [o.size, o.tiers ? o.tiers + (+o.tiers === 1 ? ' tier' : ' tiers') : '', o.shape, o.servings ? 'serves ' + o.servings : ''].filter(Boolean).join(', ')],
        ['Flavor', o.flavor], ['Filling', o.filling], ['Frosting', o.frosting], ['Design', o.design], ['Message on cake', o.message ? '"' + o.message + '"' : '']];
    } else if (t === 'cupcakes') {
      r = [['Quantity', qtyText(o) + (o.qtyUnit !== 'each' && pieces(o) ? ' (' + pieces(o) + ')' : '')], ['Size', o.itemSize], ['Flavor', o.flavor], ['Frosting', o.frosting], ['Filling', o.filling],
        ['Decorations', o.design], ['Liners', o.liners], ['Message', o.message ? '"' + o.message + '"' : '']];
    } else {
      r = [['Quantity', qtyText(o) + (o.qtyUnit !== 'each' && pieces(o) ? ' (' + pieces(o) + ')' : '')], ['Size', o.itemSize], ['Cookie', o.flavor], ['Filling', o.filling], ['Packaging', wrappedText(o)]];
    }
    return r.filter(function (x) { return has(x[1]) && String(x[1]).trim() !== ''; });
  }

  // ---------- customer confirmation text ----------
  function longDate(s, now) {
    var p = s.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]);
    var opts = { weekday: 'long', month: 'long', day: 'numeric' };
    if (p[0] !== (now || new Date()).getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }
  function timeText(t) { var p = t.split(':'); return new Date(2000, 0, 1, +p[0], +p[1]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/[\u202f\u00a0]/g, ' '); }
  /** Friendly order summary the baker texts to the customer to confirm. Empty fields are left out; private notes are never included. */
  function summaryText(o, opts) {
    opts = opts || {};
    var L = [], t = typeOf(o);
    var first = String(o.name || '').trim().split(/\s+/)[0];
    var sig = String(opts.signature || '').trim();
    L.push('Hi' + (first ? ' ' + first : '') + '!' + (sig ? ' This is ' + sig + '.' : '') + ' Here are the details for your order:');
    L.push('');
    var head = productPhrase(o);
    if (isBulk(o)) {
      L = [(o.organizer ? hello(o.organizer, sig) : 'Hi there!' + (sig ? ' This is ' + sig + '.' : '')) + ' Here are the details for the ' + (o.name ? o.name + ' ' : '') + 'bulk order:', ''].concat(bulkSummaryLines(o, opts.now));
      if (o.allergies) L.push('Allergies / dietary: ' + o.allergies);
      L.push('');
      var bw = whenText(o, opts.now);
      L.push((o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup') + (bw ? ': ' + bw : '') + placeText(o));
      var bt = bulkTotals(o);
      if (bt.owed) { L.push(''); L.push('Total: ' + money(bt.owed)); if (bt.collected) L.push('Collected so far: ' + money(bt.collected)); }
      L.push('');
      L.push('Please reply YES to confirm everything looks right, or let me know any changes. Thank you!');
      return L.join('\n');
    }
    if (t === 'cake') {
      var spec = [o.size, o.tiers > 1 ? o.tiers + ' tiers' : '', o.shape, o.servings ? 'serves ' + o.servings : ''].filter(Boolean).join(', ');
      L.push(head + (spec ? ' – ' + spec : ''));
    } else {
      L.push(head);
    }
    specRows(o).forEach(function (r) {
      if (r[0] === 'Quantity' || (t !== 'cake' && r[0] === 'Size') || (t === 'cake' && r[0] === 'Size')) return; // already in the headline
      L.push(r[0] + ': ' + r[1]);
    });
    if (o.allergies) L.push('Allergies / dietary: ' + o.allergies);
    L.push('');
    var when = o.dueDate ? longDate(o.dueDate, opts.now) + (o.dueTime ? ' at ' + timeText(o.dueTime) : '') : '';
    if (o.fulfillment === 'delivery') {
      L.push('Delivery' + (when ? ': ' + when : ''));
      if (o.address) L.push('Address: ' + String(o.address).replace(/\s*\n\s*/g, ', '));
    } else L.push('Pickup' + (when ? ': ' + when : ''));
    var price = has(o.price) ? +o.price : null, dep = has(o.deposit) ? +o.deposit : 0;
    var m = [];
    if (price !== null) m.push('Total: ' + money(price));
    if (dep > 0) m.push('Deposit paid: ' + money(dep));
    if (o.status === 'Paid') m.push('Paid in full – thank you!');
    else if (price !== null && dep > 0) m.push('Balance due: ' + money(Math.max(price - dep, 0)));
    if (o.status !== 'Paid' && price !== null && price - dep > 0 && String(opts.payInfo || '').trim()) m.push('You can pay with ' + String(opts.payInfo).trim() + '.');
    if (m.length) { L.push(''); L = L.concat(m); }
    L.push('');
    L.push('Please reply YES to confirm everything looks right, or let me know any changes. Thank you!');
    return L.join('\n');
  }
  /** Fingerprint of what the customer confirmed (status/payment changes don't count as a change). */
  function confirmSig(o) {
    var x = {}; for (var k in o) x[k] = o[k];
    x.status = ''; return summaryText(x, { now: new Date(2000, 0, 1) });
  }
  /** sms: link. iPhone (iOS 8+) needs "&body=", everything else uses the RFC 5724 "?body=". */
  function smsLink(phone, body, ios) {
    var n = String(phone || '').replace(/[^\d+]/g, '');
    return 'sms:' + n + (body ? (ios ? '&body=' : '?body=') + encodeURIComponent(body) : '');
  }


  // ---------- bulk / group orders (one order, many people) ----------
  var PAY_METHODS = ['Cash', 'Venmo', 'Cash App', 'Zelle', 'Check', 'Other'];
  function isBulk(o) { return !!(o && o.bulk && typeOf(o) !== 'cake'); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function priceText(o) {
    var b = [];
    if (has(o.pricePerDozen) && +o.pricePerDozen > 0) b.push(money(o.pricePerDozen) + ' per dozen');
    if (has(o.pricePerHalf) && +o.pricePerHalf > 0) b.push(money(o.pricePerHalf) + ' per half dozen');
    return b.join(', ');
  }
  /** What one person owes for their dozens (null when no price is set). Half dozens use the half-dozen price when given. */
  function personOwed(o, p) {
    var d = +p.dozen || 0, ppd = has(o.pricePerDozen) && +o.pricePerDozen > 0 ? +o.pricePerDozen : null;
    var pph = has(o.pricePerHalf) && +o.pricePerHalf > 0 ? +o.pricePerHalf : null;
    if (ppd === null && pph === null) return null;
    if (ppd === null) ppd = pph * 2;
    var whole = Math.floor(d + 1e-9), frac = round2(d - whole);
    var owed = whole * ppd + (frac ? (Math.abs(frac - 0.5) < 1e-9 && pph !== null ? pph : frac * ppd) : 0);
    return round2(owed);
  }
  /** Money picture for one person: owed, collected, outstanding, and state 'paid' | 'partial' | 'unpaid'. */
  function personMoney(o, p) {
    var owed = personOwed(o, p), paidAmt = has(p.amount) && !isNaN(+p.amount) ? +p.amount : null;
    var collected = p.paid ? (paidAmt !== null ? paidAmt : (owed || 0)) : 0;
    var outstanding = owed === null ? 0 : Math.max(round2(owed - collected), 0);
    var state = !p.paid ? 'unpaid' : outstanding > 0.004 ? 'partial' : 'paid';
    return { owed: owed, collected: round2(collected), outstanding: outstanding, state: state };
  }
  function defaultFlavor(o) { return String(o.flavor || '').trim() || (typeOf(o) === 'creampies' ? 'Classic' : 'Default flavor'); }
  function personFlavor(o, p) { return String(p.flavor || '').trim() || defaultFlavor(o); }
  function bulkTotals(o) {
    var t = { people: 0, dozen: 0, cookies: 0, owed: 0, collected: 0, outstanding: 0, unpaid: 0, partial: 0, pickedUp: 0, noPrice: false, flavors: [] }, fl = {};
    (o.people || []).forEach(function (p) {
      var m = personMoney(o, p), d = +p.dozen || 0;
      t.people++; t.dozen += d;
      if (m.owed === null) t.noPrice = true; else t.owed += m.owed;
      t.collected += m.collected; t.outstanding += m.outstanding;
      if (m.state !== 'paid') t.unpaid++;
      if (m.state === 'partial') t.partial++;
      if (p.pickedUp) t.pickedUp++;
      var f = personFlavor(o, p), key = f.toLowerCase();
      if (!fl[key]) { fl[key] = { flavor: f, dozen: 0, people: 0 }; t.flavors.push(fl[key]); }
      fl[key].dozen += d; fl[key].people++;
    });
    t.dozen = round2(t.dozen); t.cookies = Math.round(t.dozen * 12); t.owed = round2(t.owed); t.collected = round2(t.collected); t.outstanding = round2(t.outstanding);
    t.flavors.sort(function (a, b) { return b.dozen - a.dozen; });
    return t;
  }
  function dz(n) { n = +n || 0; return n === 0.5 ? '½ dozen' : (n % 1 === 0.5 ? Math.floor(n) + '½' : num(n)) + ' dozen'; }
  function shortProduct(o) { return typeOf(o) === 'cupcakes' ? 'cupcakes' : 'oatmeal cream pies'; }
  function hello(name, sig) {
    var first = String(name || '').trim().split(/\s+/)[0];
    return 'Hi' + (first ? ' ' + first : '') + '!' + (String(sig || '').trim() ? ' This is ' + String(sig).trim() + '.' : '');
  }
  function whenText(o, now) { return o.dueDate ? longDate(o.dueDate, now) + (o.dueTime ? ' at ' + timeText(o.dueTime) : '') : ''; }
  function placeText(o) { var a = String(o.address || '').trim().replace(/\s*\n\s*/g, ', '); return a ? ' at ' + a : ''; }
  /** Text to one person in a bulk order. kind: 'info' (default) | 'unpaid' (payment reminder) | 'ready' (ready for pickup). */
  function personText(o, p, opts) {
    opts = opts || {};
    var kind = opts.kind || 'info', m = personMoney(o, p), group = String(o.name || '').trim();
    var what = dz(p.dozen) + ' ' + (p.flavor ? String(p.flavor).trim().toLowerCase() + ' ' : '') + shortProduct(o) + (group ? ' (' + group + ')' : '');
    var due = m.outstanding > 0.004 ? m.outstanding : (!p.paid && m.owed === null ? null : 0);
    var pay = String(opts.payInfo || '').trim();
    var dueLine = due ? (m.state === 'partial' ? 'Still due: ' : 'Amount due: ') + money(due) + '.' + (pay ? ' You can pay with ' + pay + '.' : '') : (p.paid ? 'You’re all paid – thank you!' : '');
    var when = whenText(o, opts.now), deliv = o.fulfillment === 'delivery';
    var L = [hello(p.name, opts.signature)];
    if (kind === 'unpaid') {
      L.push('Friendly reminder about your ' + what + ': ' + (due ? 'the amount due is ' + money(due) + '.' : 'payment is still open.') + (pay ? ' You can pay with ' + pay + '.' : ''));
      if (when) L.push((deliv ? 'Delivery' : 'Pickup') + ' is ' + when + placeText(o) + '.');
    } else if (kind === 'ready') {
      L.push('Your ' + what + ' ' + (deliv ? 'will be delivered' : 'are ready for pickup') + (when ? ' – ' + when : '') + placeText(o) + '.');
      if (dueLine && due) L.push(dueLine);
    } else {
      L.push('Your order: ' + what + '.');
      if (when) L.push((deliv ? 'Delivery: ' : 'Pickup: ') + when + placeText(o) + '.');
      if (dueLine) L.push(dueLine);
    }
    L.push('Thank you!');
    return L.join('\n');
  }
  function bulkSummaryLines(o, now) {
    var bt = bulkTotals(o), L = [];
    L.push(productPhrase(o) + ' – bulk order, ' + bt.people + (bt.people === 1 ? ' person' : ' people'));
    if (bt.flavors.length > 1 || (bt.flavors[0] && bt.flavors[0].flavor !== defaultFlavor(o)) || o.flavor) L.push('Flavors: ' + bt.flavors.map(function (f) { return f.flavor + ' ' + num(f.dozen) + ' dz'; }).join(', '));
    if (o.filling) L.push('Filling: ' + o.filling);
    if (priceText(o)) L.push('Price: ' + priceText(o));
    return L;
  }
  /** Plain-text list for sharing (names, dozens, paid status). */
  function bulkShareText(o, opts) {
    opts = opts || {};
    var bt = bulkTotals(o), L = [String(o.name || 'Bulk order') + ' – ' + (typeOf(o) === 'cupcakes' ? 'Cupcakes' : 'Oatmeal cream pies')];
    var when = whenText(o, opts.now);
    if (when) L.push((o.fulfillment === 'delivery' ? 'Delivery ' : 'Pickup ') + when + placeText(o));
    L.push(bt.people + (bt.people === 1 ? ' person' : ' people') + ' · ' + num(bt.dozen) + ' dozen (' + bt.cookies + ' ' + (typeOf(o) === 'cupcakes' ? 'cupcakes' : 'cookies') + ')');
    if (!bt.noPrice || bt.owed) L.push('Collected ' + money(bt.collected) + ' of ' + money(bt.owed) + ' · ' + money(bt.outstanding) + ' outstanding (' + bt.unpaid + ' unpaid)');
    else L.push(bt.unpaid + ' unpaid');
    L.push('Picked up: ' + bt.pickedUp + ' of ' + bt.people);
    if (bt.flavors.length) L.push('By flavor: ' + bt.flavors.map(function (f) { return f.flavor + ' ' + num(f.dozen) + ' dz'; }).join(' · '));
    L.push('');
    sortedPeople(o, 'name').forEach(function (p, i) {
      var m = personMoney(o, p);
      L.push((i + 1) + '. ' + (p.name || 'No name') + ' – ' + dz(p.dozen) + (p.flavor ? ' ' + p.flavor : '') +
        ' – ' + (m.state === 'paid' ? 'PAID' + (p.method ? ' (' + p.method + ')' : '') : m.state === 'partial' ? 'PART PAID ' + money(m.collected) + ', owes ' + money(m.outstanding) : 'UNPAID' + (m.owed ? ' ' + money(m.owed) : '')) +
        (p.pickedUp ? ' – picked up' : '') + (opts.phones && p.phone ? ' – ' + p.phone : '') + (p.note ? ' – ' + p.note : ''));
    });
    return L.join('\n');
  }
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + (/^[=+\-@]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"' : v; }
  function bulkCSV(o) {
    var rows = [['Name', 'Phone', 'Dozen', 'Flavor', 'Owed', 'Paid', 'Method', 'Amount paid', 'Still due', 'Picked up', 'Note']];
    sortedPeople(o, 'name').forEach(function (p) {
      var m = personMoney(o, p);
      rows.push([p.name, p.phone, num(+p.dozen || 0), personFlavor(o, p), m.owed === null ? '' : m.owed.toFixed(2), m.state === 'paid' ? 'Yes' : m.state === 'partial' ? 'Partial' : 'No',
        p.paid ? p.method || '' : '', p.paid ? m.collected.toFixed(2) : '', m.outstanding.toFixed(2), p.pickedUp ? 'Yes' : 'No', p.note]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  /** "48 dozen cream pies – Smith fundraiser" (reminders, calendar) */
  function bulkTitle(o) { var bt = bulkTotals(o); return (bt.dozen ? num(bt.dozen) + ' dozen ' : '') + (typeOf(o) === 'cupcakes' ? 'cupcakes' : 'cream pies') + ' – ' + (String(o.name || '').trim() || 'bulk order'); }
  function sortedPeople(o, sort) {
    var list = (o.people || []).slice();
    if (sort === 'name') list.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }); });
    return list;
  }

  var api = { PAY_METHODS: PAY_METHODS, isBulk: isBulk, personOwed: personOwed, personMoney: personMoney, personFlavor: personFlavor, defaultFlavor: defaultFlavor,
    bulkTotals: bulkTotals, bulkTitle: bulkTitle, personText: personText, bulkShareText: bulkShareText, bulkCSV: bulkCSV, sortedPeople: sortedPeople, priceText: priceText, dz: dz, money: money,
    TYPES: TYPES, ORDER: ORDER, typeOf: typeOf, info: info, qtyText: qtyText, pieces: pieces, productPhrase: productPhrase,
    cardDesc: cardDesc, specRows: specRows, wrappedText: wrappedText, summaryText: summaryText, confirmSig: confirmSig, smsLink: smsLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CakeProducts = api;
})(this);
