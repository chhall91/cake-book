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
    if (t === 'cake') b = [o.size, o.tiers > 1 ? o.tiers + ' tiers' : '', o.flavor, o.filling ? o.filling + ' filling' : '', o.frosting];
    else if (t === 'cupcakes') b = [productPhrase(o), o.flavor, o.filling ? o.filling + ' filling' : '', o.frosting];
    else b = [productPhrase(o), o.flavor ? o.flavor + ' cookie' : '', o.filling ? o.filling + ' filling' : '', o.wrapped === 'yes' ? 'wrapped' : ''];
    return b.filter(Boolean).join(' · ');
  }
  /** [label, value] rows describing the product (for details, calendar descriptions and the customer text). */
  function specRows(o) {
    var t = typeOf(o), r;
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

  var api = { TYPES: TYPES, ORDER: ORDER, typeOf: typeOf, info: info, qtyText: qtyText, pieces: pieces, productPhrase: productPhrase,
    cardDesc: cardDesc, specRows: specRows, wrappedText: wrappedText, summaryText: summaryText, confirmSig: confirmSig, smsLink: smsLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CakeProducts = api;
})(this);
