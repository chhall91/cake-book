/* Cake Book voice commands (v8): rule-based, offline. Turns "make Jane 3 dozen", "move the Smith cake to Saturday at 2",
 * "Jane paid venmo", "show unpaid" … into a plan (before → after diffs) that the app shows on a confirm card.
 * parseIntent(text) → intent (no data needed);  interpret(text, ctx[, choice]) → result for the UI.
 * Works in the browser (window.CakeCommands) and in Node (module.exports). */
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var P = isNode ? require('./parser.js') : root.CakeParser;
  var PR = isNode ? require('./products.js') : root.CakeProducts;

  // ---------------------------------------------------------------- text helpers
  var FILLER = /^(?:ok(?:ay)?|um+|uh+|so|well|hey(?: cake book)?|cake book|please|can you|could you|would you|will you|i need (?:you )?to|i want (?:you )?to|i'?d like (?:you )?to|let'?s|go ahead and|actually|oh|and|also|now|alright|all right|yes|yeah|hi|hello|quick change|change of plans?)\b[\s,:]*/i;
  function clean(text) {
    var t = P.normalizeText(String(text || '')).replace(/[\u2018\u2019]/g, "'").trim();
    t = t.replace(/[.!?]+$/g, '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
    var prev; do { prev = t; t = t.replace(FILLER, '').trim(); } while (t !== prev && t);
    t = t.replace(/[\s,]*\b(?:please|thanks|thank you|for me)$/i, '').trim();
    return t;
  }
  function cap(s) { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** Dozens from a phrase: "3 dozen", "half a dozen", "1 and a half", "a dozen and a half", "a couple", "another" → number | null */
  function qty(str) {
    if (str == null) return null;
    var t = ' ' + String(str).toLowerCase().replace(/\ba couple(?: of)?\b|\bcouple(?: of)?\b/g, ' 2 ').replace(/\ba few\b/g, ' 3 ').replace(/\banother\b/g, ' 1 ') + ' ', m;
    if ((m = /(\d+(?:\.\d+)?)\s*(?:and a half|½|1\/2)/.exec(t))) return +m[1] + 0.5;
    if (/\b(?:a |1 )?dozen and a half\b/.test(t)) return 1.5;
    if ((m = /(\d+(?:\.\d+)?)/.exec(t))) return +m[1];
    if (/\bhalf (?:a )?dozen\b|\ba half\b|(?:^|\s)½|\bhalf\b/.test(t)) return 0.5;
    if (/\b(?:a|1) dozen\b|\bdozen\b/.test(t)) return 1;
    return null;
  }
  function money(str) {
    var t = String(str || ''), m;
    if ((m = /\$\s?(\d+(?:\.\d{1,2})?)/.exec(t))) return +m[1];
    if ((m = /(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks)/i.exec(t))) return +m[1];
    if ((m = /(\d+(?:\.\d{1,2})?)/.exec(t))) return +m[1];
    return null;
  }
  var METHOD_RE = [[/\bcash\s?app(?:ed)?\b/i, 'Cash App'], [/\bvenmo(?:ed)?\b/i, 'Venmo'], [/\bzelle(?:d)?\b/i, 'Zelle'], [/\bcheck\b|\bcheque\b/i, 'Check'], [/\bcash\b/i, 'Cash'], [/\bpay\s?pal\b|\bcard\b|\bapple\s?pay\b|\bcredit\b/i, 'Other']];
  function methodOf(t) { for (var i = 0; i < METHOD_RE.length; i++) if (METHOD_RE[i][0].test(t)) return METHOD_RE[i][1]; return ''; }

  var GENERIC = /(?:^|\s)(?:order|orders|one|ones|cake|cakes|cupcakes?|oatmeal cream pies?|cream pies?|pies|cookies|bulk order|group order|list|stuff|pickup|pick up|delivery|date|time|day|due date|thing|sign ?up)$/i;
  var PRONOUN = /^(?:it|this|that|her|him|them|she|he|they|hers|his|theirs|me|everything|the whole thing|this one|that one|the|this order|that order)$/i;
  /** "the Smith cake" → { text: 'smith', hint: 'cake' }; pronouns → '' */
  function who(x) {
    var t = String(x || '').trim().replace(/^[,\s]+|[,\s]+$/g, ''), hint = '';
    t = t.replace(/^(?:for|to|on|of|from)\s+/i, '');
    var prev;
    do {
      prev = t;
      t = t.replace(/^(?:the|her|his|their|my|our|a|an|this|that|mrs?\.?|ms\.?|miss)\s+/i, '');
      var g = GENERIC.exec(t);
      if (g && t.length > g[0].length) {
        var w = g[0].trim().toLowerCase();
        if (/cupcake/.test(w)) hint = 'cupcakes'; else if (/pie|cookie/.test(w)) hint = 'creampies'; else if (/cake/.test(w)) hint = hint || 'cake';
        t = t.slice(0, t.length - g[0].length).trim();
      }
      t = t.replace(/(?:'s|s'|’s)$/i, '').trim();
    } while (t !== prev);
    if (PRONOUN.test(t) || /^(?:order|orders|cake|cakes|cupcakes?|pies|cookies|list|date|time|day|pickup|pick up|delivery|due date|pickup time|delivery time)$/i.test(t)) t = '';
    return { text: t, hint: hint };
  }

  // ---------------------------------------------------------------- fuzzy names (speech misspellings)
  var STOP = { the: 1, a: 1, an: 1, and: 1, of: 1, for: 1, order: 1, mr: 1, mrs: 1, ms: 1, miss: 1 };
  function toks(s) { return String(s || '').toLowerCase().replace(/[’']s\b/g, '').split(/[^a-z0-9]+/).filter(function (w) { return w && !STOP[w]; }); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function phon(w) {   // soundex-like key with a few English spelling equivalences
    w = w.toLowerCase().replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^ph/, 'f').replace(/ph/g, 'f').replace(/^ch/, 'k').replace(/^c(?=[aou])/, 'k').replace(/ck/g, 'k').replace(/^x/, 'z');
    var codes = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
    var f = w.charAt(0), out = f, last = codes[f] || 0;
    for (var i = 1; i < w.length && out.length < 4; i++) { var c = codes[w.charAt(i)] || 0; if (c && c !== last) out += c; if (w.charAt(i) !== 'h' && w.charAt(i) !== 'w') last = c; }
    return out;
  }
  function sim(a, b) {
    if (a === b) return 1;
    if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
    if (a.length >= 3 && b.length >= 3 && (b.indexOf(a) === 0 || a.indexOf(b) === 0)) return 0.9;
    var r = 1 - lev(a, b) / Math.max(a.length, b.length);
    if (a.length > 2 && b.length > 2 && phon(a) === phon(b)) r = Math.max(r, 0.86);
    return r;
  }
  /** How well spoken words match a name (0..1). Every spoken word has to match some word of the name. */
  function nameScore(q, name) {
    var qt = toks(q), ct = toks(name);
    if (!qt.length || !ct.length) return 0;
    var sum = 0, worst = 1;
    qt.forEach(function (w) { var b = 0; ct.forEach(function (c) { b = Math.max(b, sim(w, c)); }); sum += b; worst = Math.min(worst, b); });
    var s = sum / qt.length;
    if (worst < 0.6) s *= 0.7;
    return round2(s);
  }
  var THRESH = 0.76;
  function best(cands) {   // cands: [{score, rank}] → the clear winner(s)
    cands = cands.filter(function (c) { return c.score >= THRESH; }).sort(function (a, b) { return b.score - a.score || (a.rank || 0) - (b.rank || 0); });
    if (!cands.length) return [];
    var top = cands[0].score;
    return cands.filter(function (c) { return top >= 0.99 ? c.score >= 0.99 : c.score >= top - 0.08; });
  }

  // ---------------------------------------------------------------- dates
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(s) { if (!s) return 'no date'; return parseISO(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function fmtTime(t) { if (!t) return 'no time'; var h = +t.split(':')[0], m = t.split(':')[1]; return (h % 12 || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  var CLOSED = { 'Delivered/Picked up': 1, Paid: 1, Cancelled: 1 };
  function isOpen(o) { return !CLOSED[o.status]; }
  function recentOrUpcoming(o, now) { return !o.dueDate || parseISO(o.dueDate) >= addDays(startOfDay(now), -10); }

  // ---------------------------------------------------------------- intent parsing
  var QTY = "(?:a couple(?: of)?|couple(?: of)?|another|half(?: a)?|a|\\d+(?:\\.\\d+)?)(?:\\s+and a half)?\\s*(?:dozens?|doz|dz)(?:\\s+and a half)?|a half dozen|half (?:a )?dozen|a dozen and a half|dozen and a half|\\d+(?:\\.\\d+)?(?:\\s+and a half)?|a couple(?: of)?|couple(?: of)?";
  var PRODUCT_TAIL = "(?:\\s+(?:of\\s+)?(?:them|those|the\\s+)?(?:oatmeal cream pies?|cream pies?|cupcakes?|cookies|pies|instead|total|in total|altogether|now))*";
  var FIELD_WORDS = {
    pricePerDozen: 'price per dozen|per dozen price|dozen price|price a dozen', pricePerHalf: 'half dozen price|price per half dozen|half price',
    flavor: '(?:cake |cookie |cupcake )?flavou?rs?', frosting: 'frosting|icing|buttercream', filling: 'filling', size: 'size', tiers: 'tiers?|layers?',
    servings: 'servings|serving size|number of people|guest count|guests', occasion: 'occasion|event', message: 'message|writing|inscription|wording',
    design: 'design|decorations?|colou?rs?|theme|toppers?', liners: 'liners?|cupcake liners?', packaging: 'packaging|boxes|box',
    deposit: 'deposit|down payment', price: 'price|total|cost|charge', qty: 'quantity|amount|count|how many|number of dozen',
    allergies: 'allerg(?:y|ies)|dietary', organizer: 'organi[sz]er|contact person', email: 'email(?: address)?', itemSize: 'cookie size|cupcake size'
  };
  var FIELD_ORDER = ['pricePerDozen', 'pricePerHalf', 'itemSize', 'flavor', 'frosting', 'filling', 'size', 'tiers', 'servings', 'occasion', 'message', 'design', 'liners', 'packaging', 'deposit', 'price', 'qty', 'allergies', 'organizer', 'email'];
  var FIELD_ALT = FIELD_ORDER.map(function (k) { return FIELD_WORDS[k]; }).join('|');
  function fieldKey(word) {
    for (var i = 0; i < FIELD_ORDER.length; i++) if (new RegExp('^(?:' + FIELD_WORDS[FIELD_ORDER[i]] + ')$', 'i').test(String(word).trim())) return FIELD_ORDER[i];
    return null;
  }
  var FLAVOR_WORDS = /^(?:chocolate|vanilla|lemon|strawberry|red velvet|funfetti|carrot|marble|coconut|pumpkin|pumpkin spice|maple|classic|original|cinnamon|gingerbread|brown sugar|salted caramel|caramel|confetti|almond|banana|spice|cookies (?:and|&) cream|peanut butter|mocha|espresso|white chocolate|raspberry|blueberry|cherry|orange|key lime|oatmeal raisin|snickerdoodle|birthday cake|german chocolate|black forest|tres leches|champagne|pistachio|mint|apple)(?: (?:cake|flavou?r|oatmeal|cookies?|cupcakes?))?$/i;
  var DATEWORDS = /\b(?:today|tonight|tomorrow|(?:mon|tues|wednes|thurs|fri|satur|sun)day|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b|\b\d{1,2}:\d\d\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\bnext week\b|\b\d{1,2}(?::\d\d)?\s*(?:am|pm)\b|\bnoon\b|\bat \d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)\b|\b\d{1,2}\/\d{1,2}\b|\bweekend\b/i;
  function hasDate(t) { return DATEWORDS.test(t); }
  function isQtyPhrase(t) { return new RegExp('^(?:' + QTY + ')' + PRODUCT_TAIL + '$', 'i').test(String(t).trim()) && qty(t) !== null; }
  function I(act, o) { o = o || {}; o.act = act; return o; }
  function statusFrom(w) {
    w = String(w).toLowerCase();
    if (/confirm/.test(w)) return 'Confirmed';
    if (/^ready|finished|^done baking/.test(w)) return 'Ready';
    if (/progress|baking|being made|started/.test(w)) return 'In progress';
    if (/delivered|handed off|done|complete/.test(w)) return 'Delivered/Picked up';
    if (/inquiry/.test(w)) return 'Inquiry';
    if (/cancel/.test(w)) return 'Cancelled';
    if (/paid/.test(w)) return 'Paid';
    return '';
  }
  function fieldIntent(word, whoTxt, value) {
    if (/date|time/i.test(word)) return I('reschedule', { who: whoTxt, when: value });
    return I('field', { field: fieldKey(word) || 'flavor', who: whoTxt, value: String(value).trim() });
  }
  var COMMAND_START = /^(?:make|change|move|set|mark|add|remove|delete|cancel|update|switch|put|take|give|open|show|reschedule|push|postpone|instead|bump|drop|check|confirm|fix|correct|note|go to|who|what|undo)\b/i;

  function parseIntent(raw) {
    var s = clean(raw), m;
    if (!s) return I('empty');
    var L = s.toLowerCase();
    // ---- meta
    if (/^(?:help|what can i say|what can you do|what do i say|how does this work|commands?|examples?)\b/.test(L)) return I('help');
    if (/^(?:undo|undo that|undo the last (?:change|thing)|take that back|revert(?: that)?|put it back)$/.test(L)) return I('undo');
    if ((m = /^(?:(?:a|an)\s+)?(?:new|another)\s+order\b[\s,:]*(?:for\s+)?(.*)$/i.exec(s)) || (m = /^(?:add|make|start|create|take)\s+(?:a|an)\s+(?:new\s+)?order\b[\s,:]*(?:for\s+)?(.*)$/i.exec(s))) return I('new', { text: m[1] });

    // ---- a whole new order said in one go ("Sarah Johnson, 555-…, birthday cake for Saturday…") – keep the old behaviour
    if (!COMMAND_START.test(s) && newOrderSignals(raw) >= 3) return I('new', { text: '' });
    // ---- queries
    if (/^(?:show(?: me)?|who|list|which|what|find|tell me|anyone|anybody|is there anyone)\b.*\b(?:unpaid|owes?|owing|hasn'?t paid|haven'?t paid|not paid|didn'?t pay|still (?:need|needs|has|have) to pay|outstanding|balance|money)\b/.test(L) || /^(?:unpaid|owing|outstanding|who owes)(?: people| orders| list)?$/.test(L)) return I('query', { q: 'unpaid' });
    if (/^(?:show(?: me)?|who|list|which|tell me|anyone|anybody)\b.*\b(?:hasn'?t|haven'?t|not|didn'?t|still (?:need|needs) to|yet to)\s+(?:been\s+)?(?:picked|pick|come|gotten|got|collected)/.test(L) || /^not picked up$/.test(L)) return I('query', { q: 'notpicked' });
    if (/^(?:what(?:'s| is| are| do i have| have i got| orders?(?: are| do i have)?)?|show(?: me)?|list|any|anything|which orders?|how many orders?|do i have)\b/.test(L) && /\b(?:due|coming up|this week|next week|today|tonight|tomorrow|weekend|(?:mon|tues|wednes|thurs|fri|satur|sun)day|upcoming|scheduled)\b/.test(L)) {
      var range = /\b(?:today|tonight)\b/.test(L) ? 'today' : /\btomorrow\b/.test(L) ? 'tomorrow' : /\bnext week\b/.test(L) ? 'nextweek' : /\bweekend\b/.test(L) ? 'weekend' :
        (m = /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/.exec(L)) ? 'day:' + m[1] : 'week';
      return I('query', { q: 'due', range: range });
    }
    if ((m = /^(?:show(?: me)?|list)\s+(?:all\s+)?(?:the\s+|my\s+)?(cakes?|cupcakes?|cream pies?|oatmeal cream pies?|cookies|bulk orders?|group orders?)(?:\s+orders?)?$/i.exec(s))) {
      return I('query', { q: 'type', type: /cupcake/i.test(m[1]) ? 'cupcakes' : /pie|cookie/i.test(m[1]) ? 'creampies' : /bulk|group/i.test(m[1]) ? 'bulk' : 'cake' });
    }
    // ---- navigation
    if ((m = /^(?:open|show(?: me)?|go to|pull up|bring up|find|look up|see|view|take me to|switch to)\s+(.+)$/i.exec(s))) return I('open', { who: m[1] });

    // ---- notes
    if ((m = /^(?:add|put|write|make|leave|jot down)\s+(?:a\s+|another\s+)?note\s*(?:(?:to|for|on|about)\s+(.+?)\s*)?(?:that|saying|says|:|,|-|which says)\s*(.+)$/i.exec(s)) ||
        (m = /^note\s*(?:(?:for|on|about)\s+(.+?))?\s*(?::|,|that|-)\s*(.+)$/i.exec(s))) return I('note', { who: m[1] || '', text: m[2] });
    if ((m = /^(?:add|put|write)\s+(?:a\s+)?note\s+(.+)$/i.exec(s))) return I('note', { who: '', text: m[1] });

    // ---- deposit
    if (/\b(?:deposit|down payment|put down)\b/i.test(s) && money(s) !== null && !/\b(?:per|a) dozen\b/i.test(s)) {
      var dw = '';
      if ((m = /^(.+?)\s+(?:has\s+|already\s+|just\s+)*(?:paid|put down|gave(?: me)?|left|sent(?: me)?|made|dropped off|venmoed|zelled)\b/i.exec(s)) && !/\bdeposit\b/i.test(m[1])) dw = m[1];
      else if ((m = /\b(?:deposit|down payment)\s+(?:for|on|from)\s+(.+?)\s+(?:is|was|of|=|paid|came in)\b/i.exec(s))) dw = m[1];
      else if ((m = /\b(?:for|on|from)\s+(.+?)$/i.exec(s)) && !/\d/.test(m[1])) dw = m[1];
      if (/^(?:got|received|took|change|set|update|make|the|i)$/i.test(dw.trim())) dw = '';
      return I('field', { field: 'deposit', who: dw, value: String(money(s)) });
    }
    // ---- price per dozen ("make it 14 dollars a dozen")
    if ((m = /\$?\s?(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks)?\s+(?:a|per|each|for a|for each)\s+(half\s+)?dozen\b/i.exec(s)) && /^(?:make|change|set|charge|it'?s|price|update|switch)/i.test(s)) {
      var pw = (/\bfor\s+(?:the\s+)?(.+?)$/i.exec(s.slice(m.index + m[0].length)) || [])[1] || '';
      return I('field', { field: m[2] ? 'pricePerHalf' : 'pricePerDozen', who: pw, value: m[1] });
    }

    // ---- bulk dozens: "instead of Jane only getting 1 dozen … make it 3 dozen"
    if ((m = /^instead of\s+(.+?)\s+for\s+(.+?)[,\s]+(?:make it|make that|give (?:her|him|them)|do|change it to|it'?s|it should be)\s+(.+)$/i.exec(s)) && qty(m[1]) !== null && /^(?:\d|half|a |dozen|couple)/i.test(m[1]))
      return I('setDozen', { who: m[2], from: qty(m[1]), n: qty(m[3]) });
    if ((m = /^instead of\s+(.+?)\s+(?:only\s+|just\s+)?(?:getting|having|ordering|wanting|taking|with|at|on|being|down for|signed up for)\s+(.+?)[,\s]+(?:make it|make that|make (?:hers|his|theirs)|give (?:her|him|them)|change it to|change that to|it should be|do|let'?s do|(?:she|he|they) (?:wants?|needs?)|put (?:her|him|them) down for|bump (?:it|her|him|them) (?:up )?to|she'?s getting|he'?s getting|they'?re getting)\s+(.+)$/i.exec(s)) && qty(m[3]) !== null)
      return I('setDozen', { who: m[1], from: qty(m[2]), n: qty(m[3]) });
    if ((m = /^instead of\s+(.+?)[,\s]+(?:make it|make that|do|give (?:her|him|them))\s+(.+?)\s+for\s+(.+)$/i.exec(s)) && qty(m[2]) !== null)
      return I('setDozen', { who: m[3], from: qty(m[1]), n: qty(m[2]) });
    // "change Jane from 1 dozen to 3"  /  "move the Smith cake from Friday to Saturday"
    if ((m = /^(?:change|update|switch|bump|move|take|put|go|increase|decrease|raise|lower|drop|up)\s+(.+?)\s+from\s+(.+?)\s+(?:up to|down to|to|into)\s+(.+)$/i.exec(s))) {
      if (qty(m[2]) !== null && qty(m[3]) !== null && !hasDate(m[3]) && !/\$|dollar|buck|inch|tier/i.test(m[2] + m[3])) return I('setDozen', { who: m[1], from: qty(m[2]), n: qty(m[3]) });
      if (hasDate(m[3])) return I('reschedule', { who: m[1], when: m[3] });
      var fk0 = fieldKey(m[1].replace(/^(?:the|her|his|their)\s+/i, '')); if (fk0) return I('field', { field: fk0, who: '', value: m[3] });
    }
    // more / extra
    if ((m = new RegExp('^(?:add|give|put|throw in|tack on)\\s+(' + QTY + '|another)\\s*(?:more|extra|additional)?\\s*(?:dozens?)?\\s*(?:more\\s+)?' + PRODUCT_TAIL + '\\s+(?:to|for|onto|on)\\s+(.+)$', 'i').exec(s)))
      return I('addDozen', { who: m[2], n: qty(m[1]), orAddPerson: !/\b(?:more|extra|additional|another)\b/i.test(s) });
    if ((m = new RegExp('^give\\s+(.+?)\\s+(' + QTY + '|another)\\s*(?:dozens?)?\\s*(?:more|extra|additional)\\b', 'i').exec(s)) || (m = /^give\s+(.+?)\s+(another(?:\s+half)?)\s+dozen\b/i.exec(s)))
      return I('addDozen', { who: m[1], n: /half/i.test(m[2]) ? 0.5 : qty(m[2]) });
    if ((m = /^(.+?)\s+(?:also\s+|now\s+|actually\s+)?(?:wants|needs|would like|is getting|gets|ordered|asked for|wanted|is taking|will take|'ll take|is adding|added)\s+(.+?)\s+(?:more|extra|additional)\b/i.exec(s)) && qty(m[2]) !== null && !/\b(?:paid|pick)/i.test(m[1]))
      return I('addDozen', { who: m[1], n: qty(m[2]) });
    if ((m = /^(.+?)\s+(?:also\s+)?(?:wants|needs|would like|is getting|gets|ordered|asked for|wanted|will take|'ll take)\s+(another)(\s+half)?\s+dozen\b/i.exec(s)))
      return I('addDozen', { who: m[1], n: m[3] ? 0.5 : 1 });
    if ((m = new RegExp('^(' + QTY + '|another)\\s+(?:more|extra|additional)\\s*(?:dozens?)?' + PRODUCT_TAIL + '\\s+(?:for|to)\\s+(.+)$', 'i').exec(s)))
      return I('addDozen', { who: m[2], n: qty(m[1]) });
    // less / fewer
    if ((m = new RegExp('^(?:take|remove|subtract|knock|cut|drop)\\s+(' + QTY + ')' + PRODUCT_TAIL + '\\s+(?:off(?: of)?|from|away from)\\s+(.+)$', 'i').exec(s)))
      return I('subDozen', { who: m[2], n: qty(m[1]) });
    if ((m = /^(.+?)\s+(?:only\s+)?(?:wants|needs|would like|is getting|gets)\s+(.+?)\s+(?:less|fewer)\b/i.exec(s)) && qty(m[2]) !== null)
      return I('subDozen', { who: m[1], n: qty(m[2]) });

    // ---- phone
    if ((m = /^(?:change|update|set|fix|correct|put)\s+(.+?)(?:'s|s')?\s+(?:phone number|phone|cell number|cell phone|cell|mobile|number)\s+(?:to|is|as|=)\s+(.+)$/i.exec(s)) ||
        (m = /^(.+?)(?:'s|s')\s+(?:new\s+|correct\s+|real\s+)?(?:phone number|phone|cell number|cell|mobile|number)\s+is\s+(?:actually\s+|now\s+)?(.+)$/i.exec(s)) ||
        (m = /^(?:the\s+)?(?:phone number|phone|number)\s+(?:for\s+(.+?)\s+)?(?:is|should be)\s+(.+)$/i.exec(s)))
      return I('phone', { who: m[1] || '', value: m[2] });
    return parseIntent2(s, L);
  }

  function parseIntent2(s, L) {
    var m;
    if ((m = new RegExp('^add\\s+(.+?)\\s+(' + QTY + '|another)\\s*(?:dozens?)?\\s*(?:more|extra|additional)\\b', 'i').exec(s)) || (m = /^add\s+(.+?)\s+(another(?:\s+half)?)\s+dozen\b/i.exec(s)))
      return I('addDozen', { who: m[1], n: /half/i.test(m[2]) ? 0.5 : qty(m[2]) });
    if ((m = new RegExp('^(' + QTY + ')' + PRODUCT_TAIL + '\\s+for\\s+(.+)$', 'i').exec(s)) && qty(m[1]) !== null && !/\d{3}/.test(m[2]))
      return I('setDozen', { who: m[2], n: qty(m[1]), orAddPerson: true });
    if ((m = new RegExp('^(?:put|sign up|write down|mark)\\s+(.+?)\\s+(?:down\\s+)?for\\s+(' + QTY + ')' + PRODUCT_TAIL + '$', 'i').exec(s)) && qty(m[2]) !== null)
      return I('setDozen', { who: m[1], n: qty(m[2]), orAddPerson: true });
    // ---- add person ("add Mike Brown 2 dozen to the Smith fundraiser", "put Mike down for 2 dozen")
    if ((m = /^(?:add|put|sign up|include|also add|plus|write down|write in|squeeze in)\s+(.+)$/i.exec(s)) && !/^(?:a\s+)?(?:note|deposit|delivery|pickup)\b/i.test(m[1])) {
      var rest = m[1], ord = '';
      var om = /\s+(?:to|on|onto|in|into|for)\s+(?:the\s+)?([^\d$]+?)(?:\s+(?:order|list|bulk order|group order|sign ?up(?: sheet)?))?$/i.exec(rest);
      if (om && !/^(?:half|a dozen|dozen|a couple)/i.test(om[1]) && !methodOf(om[1]) && !FLAVOR_WORDS.test(om[1])) { ord = om[1]; rest = rest.slice(0, om.index); }
      rest = rest.replace(/\s+down for\s+/i, ' ').replace(/\s+(?:for|with|getting|who wants|wants)\s+(?=\d|half|a dozen|a couple|another)/i, ' ');
      return I('addPerson', { line: rest, ord: ord });
    }

    // ---- paid / unpaid
    if ((m = /^(?:mark|set|put|change|make)\s+(.+?)\s+(?:as\s+|to\s+|back to\s+|down as\s+)?(?:unpaid|not paid|owing|hasn'?t paid|didn'?t pay)$/i.exec(s)) ||
        (m = /^(.+?)\s+(?:hasn'?t|has not|didn'?t|did not|never|still hasn'?t)\s+(?:paid|pay|payed)\b/i.exec(s)) ||
        (m = /^(.+?)\s+(?:still\s+)?owes(?:\s+(?:me|us))?\b/i.exec(s)))
      return I('paid', { who: m[1], paid: false });
    if ((m = /^(?:mark|set|put|change|make)\s+(.+?)\s+(?:as\s+|to\s+|down as\s+)?(?:paid(?: in full)?|paid up|all paid)(.*)$/i.exec(s)) ||
        (m = /^(.+?)\s+(?:has\s+|already\s+|just\s+|finally\s+|is\s+)*(?:paid|payed|paid up|venmoed|zelled|cash ?apped|sent (?:me |us )?(?:the |her |his )?(?:money|payment)|squared up|settled up)\b(.*)$/i.exec(s)) ||
        (m = /^(?:got|received|i got|i received|collected)\s+(?:paid|payment|the money|money|cash|\$?\d+(?:\.\d+)?\s*(?:dollars?|bucks)?)\s+from\s+(.+?)()$/i.exec(s))) {
      var tail = (m[2] || '');
      var amt = /\$|\d/.test(tail) ? money(tail) : (/^(?:got|received|i got|i received|collected)\s+\$?\d/i.test(s) ? money(s) : null);
      return I('paid', { who: m[1], paid: true, method: methodOf(tail + ' ' + s), amount: amt, full: /\bin full\b/i.test(s) });
    }

    // ---- picked up
    if ((m = /^(.+?)\s+(?:hasn'?t|has not|didn'?t|did not|never|still hasn'?t|still needs to|has yet to)\s+(?:picked|pick|come|gotten|got|collected|grabbed)/i.exec(s)) ||
        (m = /^(?:mark|set|put|change)\s+(.+?)\s+(?:as\s+)?(?:not|un)\s*-?\s*(?:picked up|delivered|collected)$/i.exec(s)))
      return I('picked', { who: m[1], picked: false });
    if ((m = /^(?:mark|set|put)\s+(.+?)\s+(?:as\s+)?(picked up|delivered|collected|handed off|gone)$/i.exec(s)) || (m = /^(?:check off|tick off|cross off)\s+(.+?)()$/i.exec(s)))
      return I('picked', { who: m[1], picked: true, statusWord: /delivered/i.test(m[2]) ? 'delivered' : '' });
    if ((m = /^(.+?)\s+(?:has\s+|just\s+|already\s+|finally\s+)*(?:picked up|picked (?:hers|his|theirs|it|them|her order|his order|their order|her stuff|his stuff) up|got (?:hers|his|theirs|it|them|her order|his order|their order|her pies|his pies|her cookies|her cupcakes|their cookies)|came (?:by|and got)|stopped by|collected|grabbed (?:hers|his|theirs|them|it)|has (?:hers|his|theirs))\b/i.exec(s)))
      return I('picked', { who: m[1], picked: true });
    if ((m = /^(?:i\s+)?(?:delivered|dropped off|handed off)\s+(.+?)$/i.exec(s))) return I('picked', { who: m[1], picked: true, statusWord: 'delivered' });

    // ---- reschedule
    if ((m = /^(?:move|reschedule|push|postpone|bump|shift|change|switch|make)\s+(.+?)\s+(?:back\s+|up\s+|over\s+)?(?:to|till|until|for|on|onto)\s+(.+)$/i.exec(s)) && hasDate(m[2]) && !isQtyPhrase(m[2]) && !fieldKey(m[1].replace(/^(?:the|her|his|their)\s+/i, '')))
      return I('reschedule', { who: m[1], when: m[2] });
    if ((m = /^(?:the\s+)?(?:(.+?)(?:'s|s')\s+)?(?:pickup|pick up|delivery|due date|date|time|pickup time|delivery time|pickup date|delivery date|appointment)\s+(?:for\s+(.+?)\s+)?(?:is|should be|will be|has to be|needs to be|changed to|moved to)\s+(?:now\s+|actually\s+)?(.+)$/i.exec(s)) && hasDate(m[3]))
      return I('reschedule', { who: m[1] || m[2] || '', when: m[3] });
    if ((m = /^(.+?)\s+(?:wants to|will|'ll|is going to|can|needs to|would like to|is gonna)\s+(?:pick (?:it |them |her order |his order )?up|come(?: by| get it)?|get (?:it|them))\s+(.+)$/i.exec(s)) && hasDate(m[2]))
      return I('reschedule', { who: m[1], when: m[2], fulfillment: 'pickup' });
    if ((m = /^(?:move|reschedule|push|postpone)\s+(?:it\s+|this\s+|that\s+)?(?:to\s+)?(.+)$/i.exec(s)) && hasDate(m[1])) return I('reschedule', { who: '', when: m[1] });

    // ---- remove person / cancel
    if ((m = /^(?:remove|delete|drop|cross out|scratch|kick out|take out)\s+(.+?)(?:\s+(?:off|out of|from)(?:\s+(?:the\s+)?(.+?))?)?$/i.exec(s)) ||
        (m = /^take\s+(.+?)\s+(?:off|out)(?:\s+(?:of\s+)?(?:the\s+)?(.+?))?$/i.exec(s)))
      return I('remove', { who: m[1], ord: (m[2] && !/^(?:list|order|sheet)$/i.test(m[2])) ? m[2] : '' });
    if ((m = /^cancel\s+(.+)$/i.exec(s)) || (m = /^(.+?)\s+(?:cancell?ed|dropped out|backed out|is out|pulled out|doesn'?t want (?:any|them|it|hers|his)(?: anymore)?|no longer wants (?:any|them|it)|changed (?:her|his|their) mind)\b/i.exec(s)))
      return I('remove', { who: m[1], cancel: true });

    // ---- customer confirmed
    if ((m = /^(?:mark\s+)?(?:the\s+)?customer\s+(?:as\s+|has\s+)?(?:confirmed|said yes|approved)(?:\s+(?:for|on)\s+(.+))?$/i.exec(s)) || (m = /^mark\s+(.+?)\s+(?:as\s+)?customer[- ]confirmed$/i.exec(s)))
      return I('customerConfirmed', { who: m[1] || '' });
    if ((m = /^(.+?)\s+(?:confirmed|said yes|replied yes|texted (?:back )?yes|wrote back yes|approved|okayed|ok'?d|signed off)(?:\s+(?:the|her|his|their|it|everything|on)\b.*)?$/i.exec(s)) && !/^(?:mark|set|it|this|that|order)\b/i.test(m[1]) && !/\s(?:is|are)$/i.test(m[1]))
      return I('customerConfirmed', { who: m[1] });

    // ---- status
    var STAT = '(confirmed|ready(?: for pickup)?|done|finished|complete|completed|in progress|baking|being made|started|delivered|handed off|inquiry|cancell?ed|paid in full)';
    if ((m = new RegExp('^(?:mark|set|change|put|move|make|switch)\\s+(.+?)\\s+(?:as\\s+|to\\s+|status to\\s+|into\\s+)?' + STAT + '$', 'i').exec(s)) ||
        (m = new RegExp('^(.+?)\\s+(?:is|are)\\s+(?:now\\s+|all\\s+)?' + STAT + '$', 'i').exec(s)))
      return I('status', { who: m[1], status: statusFrom(m[2]) });
    if ((m = /^confirm\s+(.+)$/i.exec(s))) return I('status', { who: m[1], status: 'Confirmed' });
    if ((m = /^(?:i'?m|i am|i'?ve|i have)\s+(?:started\s+|starting\s+|working on|baking|making|begun)\s*(.+)$/i.exec(s))) return I('status', { who: m[1], status: 'In progress' });
    if ((m = /^(?:i'?m|i am)\s+(?:done|finished)\s+(?:with\s+|baking\s+|making\s+)?(.+)$/i.exec(s))) return I('status', { who: m[1], status: 'Ready' });

    // ---- pickup / delivery / address
    if ((m = /^(?:make|change|switch|set|turn)\s+(.+?)\s+(?:to\s+|as\s+|into\s+)?(?:a\s+)?(delivery|pickup|pick up|pick-up)(?:\s+(?:to|at)\s+(.+))?$/i.exec(s)))
      return I('fulfillment', { who: m[1], value: /deliver/i.test(m[2]) ? 'delivery' : 'pickup', address: m[3] || '' });
    if ((m = /^(?:it'?s|its|this is|that'?s)\s+(?:a\s+|now\s+(?:a\s+)?)?(delivery|pickup|pick up)(?:\s+(?:to|at)\s+(.+))?$/i.exec(s))) return I('fulfillment', { who: '', value: /deliver/i.test(m[1]) ? 'delivery' : 'pickup', address: m[2] || '' });
    if ((m = /^(?:deliver|(?:we'?re|we are|i'?m|i am) delivering|(?:i'?ll|i will|we'?ll|we will) deliver)\s+(?:it\s+|them\s+|(.+?)\s+)?to\s+(.+)$/i.exec(s))) return I('fulfillment', { who: m[1] || '', value: 'delivery', address: m[2] });
    if ((m = /^(.+?)\s+(?:will|'ll|is going to|wants to|would rather)\s+pick\s+(?:it|them|her order|his order|their order)?\s*up$/i.exec(s))) return I('fulfillment', { who: m[1], value: 'pickup', address: '' });
    if ((m = /^(?:change|update|set|fix)\s+(?:the\s+)?(?:(.+?)(?:'s|s')\s+)?(?:delivery address|address|pickup spot|pickup location|location|place)\s+(?:for\s+(.+?)\s+)?(?:to|is|as)\s+(.+)$/i.exec(s)) ||
        (m = /^(?:the\s+)?(?:(.+?)(?:'s|s')\s+)?(?:delivery address|address|pickup spot|pickup location|location)\s+(?:for\s+(.+?)\s+)?(?:is|should be|will be|changed to)\s+(.+)$/i.exec(s)))
      return I('address', { who: m[1] || m[2] || '', value: m[3] });

    // ---- fields ("change the frosting to cream cheese", "the price is 90", "make it chocolate")
    if ((m = new RegExp('^(?:change|make|set|update|switch|put|fix)\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+)?(?:(.+?)(?:\'s|s\')\\s+)?(' + FIELD_ALT + ')\\s+(?:for\\s+(.+?)\\s+|on\\s+(.+?)\\s+)?(?:to|is|as|=|into|at)\\s+(.+)$', 'i').exec(s)))
      return fieldIntent(m[2], m[1] || m[3] || m[4] || '', m[5]);
    if ((m = new RegExp('^(?:the\\s+|her\\s+|his\\s+|their\\s+)?(?:(.+?)(?:\'s|s\')\\s+)?(' + FIELD_ALT + ')\\s+(?:for\\s+(.+?)\\s+|on\\s+(.+?)\\s+)?(?:is|should be|will be|=|needs to be|was|has to be|should say|should read|says|reads|to say)\\s+(?:now\\s+|actually\\s+|going to be\\s+)?(.+)$', 'i').exec(s)))
      return fieldIntent(m[2], m[1] || m[3] || m[4] || '', m[5]);
    if ((m = new RegExp('^(?:change|make|set|update|switch)\\s+(.+?)\\s+(?:to|into)\\s+(?:a\\s+)?(.+?)\\s+(' + FIELD_ALT + ')$', 'i').exec(s)))
      return fieldIntent(m[3], m[1], m[2]);
    if ((m = /^(?:charge|bill)\s+(?:her|him|them|(.+?))\s+(\$?\d+.*)$/i.exec(s))) return I('field', { field: 'price', who: m[1] || '', value: String(money(m[2])) });
    if ((m = /^(?:it'?s|its|that'?s|make it|the total is|total)\s+(\$\s?\d+(?:\.\d\d)?|\d+(?:\.\d\d)?\s*(?:dollars?|bucks))(?:\s+(?:total|for (?:the\s+)?(.+)))?$/i.exec(s))) return I('field', { field: 'price', who: m[2] || '', value: String(money(m[1])) });
    // "make it 3 dozen for Jane" / "make Jane 3 dozen" / "Jane only wants 1 dozen" / "make it chocolate"
    if ((m = new RegExp('^(?:make|change|set|switch|update|bump|put)\\s+(?:it|that|this|the order|the cake|the cupcakes|the cream pies|the pies)\\s+(?:to\\s+|at\\s+)?(' + QTY + ')' + PRODUCT_TAIL + '\\s+(?:for|to)\\s+(.+)$', 'i').exec(s)))
      return I('setDozen', { who: m[2], n: qty(m[1]) });
    if ((m = new RegExp('^(?:make|change|set|put|update|switch|bump|drop|lower|raise|increase|decrease|reduce|give)\\s+(.+?)\\s+(?:down\\s+|up\\s+)?(?:to\\s+|for\\s+|at\\s+|as\\s+|with\\s+|get\\s+|have\\s+|be\\s+|getting\\s+)?(' + QTY + ')' + PRODUCT_TAIL + '$', 'i').exec(s)) && qty(m[2]) !== null)
      return I('setDozen', { who: m[1], n: qty(m[2]), each: !/dozen|doz|dz|half/i.test(m[2]) });
    if ((m = new RegExp('^(.+?)\\s+(?:only\\s+|actually\\s+|now\\s+|just\\s+|really\\s+)*(?:wants|needs|would like|should (?:get|have)|is getting|gets|is down for|ordered|will take|\'ll take|is taking|changed (?:it |her order |his order )?to|is having)\\s+(?:only\\s+|just\\s+)?(' + QTY + ')' + PRODUCT_TAIL + '$', 'i').exec(s)) && qty(m[2]) !== null)
      return I('setDozen', { who: m[1], n: qty(m[2]), each: !/dozen|doz|dz|half/i.test(m[2]) });
    if ((m = /^(?:make|change|switch)\s+(?:it|that|this|the cake|the cupcakes|the cream pies|the order)\s+(?:to\s+|into\s+)?(?:an?\s+)?(.+)$/i.exec(s))) {
      var v = m[1].trim();
      if (/^\d+\s*(?:inch|in\b|")/i.test(v) || /\bsheet\b/i.test(v)) return I('field', { field: 'size', who: '', value: v });
      if (/^\d+\s*tiers?|tier(?:ed)?$/i.test(v)) return I('field', { field: 'tiers', who: '', value: v });
      if (money(v) !== null && /\$|dollars?|bucks/i.test(v)) return I('field', { field: 'price', who: '', value: String(money(v)) });
      if (/^(?:mini|minis|jumbo|regular|large|small)$/i.test(v)) return I('field', { field: 'itemSize', who: '', value: v });
      if (FLAVOR_WORDS.test(v)) return I('field', { field: 'flavor', who: '', value: v.replace(/\s+(?:flavou?r)$/i, '') });
      return I('unknownChange', { value: v });
    }
    return I('unknown');
  }

  // ---------------------------------------------------------------- resolution
  function people(o) { return (o && Array.isArray(o.people)) ? o.people : []; }
  function getO(ctx, id) { return ctx.orders.find(function (o) { return o.id === id; }) || null; }
  function bulkOrders(ctx) { return ctx.orders.filter(function (o) { return PR.isBulk(o) && (o.id === ctx.currentId || (isOpen(o) && recentOrUpcoming(o, ctx.now))); }); }
  function findPeople(txt, ctx) {
    var c = [];
    bulkOrders(ctx).forEach(function (o) {
      people(o).forEach(function (p) { var sc = nameScore(txt, p.name); if (sc) c.push({ score: sc, order: o, person: p, rank: o.id === ctx.currentId ? 0 : 1 }); });
    });
    var cur = c.filter(function (x) { return x.order.id === ctx.currentId && x.score >= THRESH; });
    return best(cur.length ? cur : c);
  }
  function findOrders(ref, ctx, opts) {
    opts = opts || {};
    var w = typeof ref === 'string' ? who(ref) : ref, now = startOfDay(ctx.now);
    if (!w || !w.text) return [];
    var c = ctx.orders.filter(function (o) { return (o.status !== 'Cancelled' || opts.any) && (!opts.bulkOnly || PR.isBulk(o)); }).map(function (o) {
      var sc = Math.max(nameScore(w.text, o.name), nameScore(w.text, o.organizer || ''), nameScore(w.text, (o.name || '') + ' ' + (o.organizer || '')));
      if (w.hint && PR.typeOf(o) !== w.hint) sc *= 0.85;
      if (!isOpen(o)) sc *= 0.97;
      var d = o.dueDate ? (parseISO(o.dueDate) - now) / 864e5 : 999;
      return { score: round2(sc), order: o, rank: (d < 0 ? 1000 - d : d) + (o.id === ctx.currentId ? -5000 : 0) };
    });
    var cur = c.filter(function (x) { return x.order.id === ctx.currentId && x.score >= THRESH; });
    return best(cur.length ? cur : c);
  }
  function upcomingPick(ctx, filter) {
    var now = startOfDay(ctx.now);
    return ctx.orders.filter(function (o) { return isOpen(o) && o.dueDate && parseISO(o.dueDate) >= addDays(now, -1) && (!filter || filter(o)); })
      .sort(byDue).slice(0, 8);
  }
  function optOrder(o) { return { label: (o.name || 'Unnamed'), sub: [PR.cardDesc(o) || PR.productPhrase(o), o.dueDate ? fmtDate(o.dueDate) : ''].filter(Boolean).join(' · '), choice: { orderId: o.id } }; }
  function optPerson(x) { var m = PR.personMoney(x.order, x.person); return { label: x.person.name || x.person.phone, sub: PR.dz(x.person.dozen) + (m.owed !== null ? ' · owes ' + money$(m.owed) : '') + ' · ' + x.order.name, choice: { orderId: x.order.id, personId: x.person.id } }; }
  function money$(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); }

  /** Pick the order (and person) an intent is about. kind: 'person' | 'order' | 'either' */
  function target(it, ctx, choice, kind) {
    var cur = ctx.currentId ? getO(ctx, ctx.currentId) : null;
    if (choice && choice.orderId) {
      var o = getO(ctx, choice.orderId);
      if (!o) return { error: 'That order is gone.' };
      if (choice.personId) { var p = people(o).find(function (x) { return x.id === choice.personId; }); return p ? { order: o, person: p } : { error: 'That person is no longer on the list.' }; }
      return { order: o };
    }
    var w = who(it.who || ''), ordRef = it.ord ? who(it.ord) : null, scope = null;
    if (ordRef && ordRef.text) {
      var os = findOrders(ordRef, ctx, { bulkOnly: kind === 'person' });
      if (os.length === 1) scope = os[0].order; else if (os.length > 1) return { pick: os.map(function (x) { return optOrder(x.order); }), why: 'Which order did you mean?' };
    }
    if (!w.text) {
      var o2 = scope || cur;
      if (kind === 'person') return o2 && PR.isBulk(o2) ? { needPerson: o2 } : { error: 'Who is that for? Say their name, e.g. “Jane wants 2 more dozen”.' };
      if (o2) return { order: o2 };
      var up = upcomingPick(ctx);
      return up.length ? { pick: up.map(optOrder), why: 'Which order?' } : { error: 'Which order? Say the name, e.g. “move Sarah’s cake to Saturday”.' };
    }
    var ppl = [];
    if (kind !== 'order') {
      ppl = findPeople(w.text, scope ? Object.assign({}, ctx, { currentId: scope.id }) : ctx);
      if (scope) ppl = ppl.filter(function (x) { return x.order.id === scope.id; });
    }
    var ords = kind === 'person' || scope ? [] : findOrders(w, ctx);
    if (cur) {   // scope to what she's looking at
      var pc = ppl.filter(function (x) { return x.order.id === cur.id; }), oc = ords.filter(function (x) { return x.order.id === cur.id; });
      if (pc.length === 1 && !oc.length) return { order: cur, person: pc[0].person };
      if (oc.length && !pc.length) return { order: cur };
      if (pc.length > 1) return { pick: pc.map(optPerson), why: 'Which ' + cap(w.text) + '?' };
    }
    if (ppl.length === 1 && !ords.length) return { order: ppl[0].order, person: ppl[0].person };
    if (!ppl.length && ords.length === 1) return { order: ords[0].order };
    if (ppl.length + ords.length > 1) {
      var topP = ppl.length ? ppl[0].score : 0, topO = ords.length ? ords[0].score : 0;
      if (ppl.length === 1 && topP >= 0.99 && topO < 0.9) return { order: ppl[0].order, person: ppl[0].person };
      if (ords.length === 1 && topO >= 0.99 && topP < 0.9) return { order: ords[0].order };
      return { pick: ppl.map(optPerson).concat(ords.map(function (x) { return optOrder(x.order); })), why: 'Who did you mean by “' + cap(w.text) + '”?' };
    }
    return { notFound: w.text };
  }

  // ---------------------------------------------------------------- diffs
  var LABELS = { dueDate: 'Date', dueTime: 'Time', status: 'Status', fulfillment: 'Pickup / delivery', address: 'Address', flavor: 'Flavor', frosting: 'Frosting', filling: 'Filling',
    size: 'Size', tiers: 'Tiers', servings: 'Servings', occasion: 'Occasion', message: 'Message', design: 'Design', liners: 'Liners', packaging: 'Packaging', qty: 'Quantity',
    price: 'Price', deposit: 'Deposit', pricePerDozen: 'Price per dozen', pricePerHalf: 'Half-dozen price', phone: 'Phone', allergies: 'Allergies', customerNotes: 'Notes',
    organizer: 'Organizer', email: 'Email', itemSize: 'Size', customerConfirmedAt: 'Customer confirmed' };
  function show(k, v, o) {
    if (k === 'customerConfirmedAt') return v ? 'yes ✓' : 'no';
    if (v === '' || v == null) return '—';
    if (k === 'dueDate') return fmtDate(v);
    if (k === 'dueTime') return fmtTime(v);
    if (k === 'price' || k === 'deposit' || k === 'pricePerDozen' || k === 'pricePerHalf') return money$(+v);
    if (k === 'fulfillment') return v === 'delivery' ? 'Delivery' : 'Pickup';
    if (k === 'qty') return (o.qtyUnit === 'each' ? v + ' each' : PR.dz(v));
    if (k === 'customerNotes') return String(v).replace(/\n/g, ' / ');
    return String(v);
  }
  function balance(o) { return o.status === 'Paid' ? 0 : Math.max((+o.price || 0) - (+o.deposit || 0), 0); }
  function personBits(o, p) {
    var m = PR.personMoney(o, p);
    return { dozen: PR.dz(p.dozen), owes: m.owed === null ? '' : money$(m.owed),
      paid: p.paid ? (m.state === 'partial' ? 'part paid (' + money$(m.collected) + ')' : 'paid' + (p.method ? ' (' + p.method + ')' : '')) : 'not paid',
      picked: p.pickedUp ? 'picked up ✓' : 'not picked up', phone: p.phone || '—', flavor: p.flavor || PR.defaultFlavor(o), note: p.note || '—' };
  }
  var PBITS = [['dozen', ''], ['owes', 'owes '], ['paid', ''], ['picked', ''], ['phone', 'phone '], ['flavor', 'flavor '], ['note', 'note ']];
  function diff(a, b) {
    var rows = [];
    Object.keys(LABELS).forEach(function (k) {
      if (k === 'itemSize' && a.itemSize === b.itemSize) return;
      var x = a[k] == null ? '' : a[k], y = b[k] == null ? '' : b[k];
      if (k === 'customerConfirmedAt') { x = !!x; y = !!y; }
      if (k === 'qty' && a.qtyUnit !== b.qtyUnit) { x += a.qtyUnit; y += b.qtyUnit; }
      if (String(x) !== String(y)) rows.push({ label: LABELS[k], segs: [[show(k, a[k], a), show(k, b[k], b)]] });
    });
    if (!PR.isBulk(b) && (a.price !== b.price || a.deposit !== b.deposit || a.status !== b.status) && balance(a) !== balance(b)) rows.push({ label: 'Balance due', segs: [[money$(balance(a)), money$(balance(b))]] });
    if (PR.isBulk(a) || PR.isBulk(b)) {
      var ap = people(a), bp = people(b), changed = false;
      bp.forEach(function (p) {
        var old = ap.find(function (x) { return x.id === p.id; }), nb = personBits(b, p);
        if (!old) { changed = true; rows.push({ label: p.name || p.phone, added: true, segs: [['not on the list', [nb.dozen, nb.owes && 'owes ' + nb.owes, nb.paid, p.phone].filter(Boolean).join(' · ')]] }); return; }
        var ob = personBits(a, old), segs = [];
        PBITS.forEach(function (f) { if (ob[f[0]] !== nb[f[0]]) segs.push([ob[f[0]], nb[f[0]], f[1]]); });
        if (old.name !== p.name) segs.unshift([old.name, p.name]);
        if (segs.length) { changed = true; rows.push({ label: p.name || p.phone, segs: segs }); }
      });
      ap.forEach(function (p) { if (!bp.find(function (x) { return x.id === p.id; })) { changed = true; rows.push({ label: p.name || p.phone, removed: true, segs: [[personBits(a, p).dozen, 'removed from the list']] }); } });
      if (changed) {
        var ta = PR.bulkTotals(a), tb = PR.bulkTotals(b), s2 = [];
        if (ta.people !== tb.people) s2.push([ta.people + ' people', tb.people + ' people']);
        if (ta.dozen !== tb.dozen) s2.push([PR.dz(ta.dozen), PR.dz(tb.dozen)]);
        if (ta.owed !== tb.owed && !tb.noPrice) s2.push([money$(ta.owed), money$(tb.owed), 'owed ']);
        if (ta.outstanding !== tb.outstanding && !tb.noPrice) s2.push([money$(ta.outstanding), money$(tb.outstanding), 'outstanding ']);
        if (s2.length) rows.push({ label: 'Order total', total: true, segs: s2 });
      }
    }
    return rows;
  }
  function segText(s) { return (s[2] || '') + s[0] + ' → ' + s[1]; }
  function summary(rows) { return rows.filter(function (r) { return !r.total; }).map(function (r) { return r.label + ': ' + r.segs.map(segText).join(', '); }).join('; '); }

  // ---------------------------------------------------------------- plans
  function plan(order, mutate, title, extra) {
    var next = clone(order);
    var err = mutate(next);
    if (typeof err === 'string') return { kind: 'error', msg: err };
    var rows = diff(order, next);
    if (!rows.length) return { kind: 'nochange', msg: 'Nothing to change – that’s already how it is.', orderId: order.id };
    next.updatedAt = Date.now();
    var p = Object.assign({ kind: 'plan', orderId: order.id, orderName: order.name, title: title, rows: rows, summary: summary(rows), next: next,
      dateChanged: order.dueDate !== next.dueDate || order.dueTime !== next.dueTime, warnings: [] }, extra || {});
    if (p.dateChanged && next.dueDate && parseISO(next.dueDate) < startOfDay(new Date())) p.warnings.push('That date is in the past.');
    return p;
  }
  function personPlan(order, person, fn, verb) {
    return plan(order, function (n) { var np = people(n).find(function (x) { return x.id === person.id; }); return fn(np, n); }, (person.name || 'Person') + (verb ? ' – ' + verb : ''));
  }
  function phoneOf(v) { var d = String(v || '').replace(/[^\d]/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); return d.length === 10 ? P.formatPhone(d) : ''; }

  function interpret(text, ctx, choice) {
    ctx = Object.assign({ orders: [], currentId: null, now: new Date() }, ctx || {});
    return resolve(parseIntent(text), ctx, choice, text);
  }
  var KIND = { setDozen: 'either', addDozen: 'person', subDozen: 'person', phone: 'either', paid: 'either', picked: 'either', remove: 'either', note: 'either',
    field: 'either', reschedule: 'order', status: 'order', customerConfirmed: 'order', fulfillment: 'order', address: 'order' };
  function resolve(it, ctx, choice, text) {
    var a = it.act;
    function res(r) { r.intent = it; return r; }
    if (a === 'empty') return res({ kind: 'unknown', empty: true });
    if (a === 'help') return res({ kind: 'help' });
    if (a === 'undo') return res({ kind: 'undo' });
    if (a === 'new') return res({ kind: 'new', text: it.text || text });
    if (a === 'unknown' || a === 'unknownChange') {
      if (a === 'unknown' && !COMMAND_START.test(clean(text)) && looksLikeNewOrder(text)) return res({ kind: 'new', text: text });
      return res({ kind: 'unknown', msg: a === 'unknownChange' ? 'I’m not sure what to change to “' + it.value + '”. Try naming it, e.g. “change the frosting to ' + it.value + '”.' : '' });
    }
    if (a === 'query') return res(query(it, ctx));
    if (a === 'open') {
      if (choice && choice.orderId) return res({ kind: 'nav', orderId: choice.orderId });
      var w = who(it.who), os = findOrders(w, ctx, { any: true }), ps = w.text ? findPeople(w.text, ctx) : [];
      if (os.length === 1 && (!ps.length || os[0].score >= ps[0].score)) return res({ kind: 'nav', orderId: os[0].order.id });
      if (!os.length && ps.length === 1) return res({ kind: 'nav', orderId: ps[0].order.id, personId: ps[0].person.id });
      if (os.length + ps.length > 1) return res({ kind: 'pick', why: 'Which one?', options: os.map(function (x) { return optOrder(x.order); }).concat(ps.map(function (x) { var op = optPerson(x); op.choice = { orderId: x.order.id }; return op; })) });
      return res({ kind: 'error', msg: 'I couldn’t find an order for “' + cap(w.text || it.who) + '”.' });
    }
    if (a === 'addPerson') return res(addPerson(it, ctx, choice));
    var kind = KIND[a] || 'order';
    if (a === 'field' && !/^(?:flavor)$/.test(it.field)) kind = 'order';
    var t = target(it, ctx, choice, kind);
    if (t.error) return res({ kind: 'error', msg: t.error });
    if (t.pick) return res({ kind: 'pick', why: t.why, options: t.pick });
    if (t.needPerson) {
      if (a === 'note' || a === 'field' || a === 'phone') t = { order: t.needPerson };
      else return res({ kind: 'error', msg: a === 'setDozen' || a === 'addDozen' ? 'Who is that for? Say their name, e.g. “make Jane ' + PR.dz(it.n || 1) + '”.' : 'Who do you mean? Say their name.' });
    }
    if (t.notFound) {
      if (it.orAddPerson) return res(addPerson({ act: 'addPerson', line: it.who + ' ' + it.n + ' dozen', ord: '' }, ctx, null));
      return res({ kind: 'error', msg: 'I couldn’t find “' + cap(t.notFound) + '”' + (ctx.currentId ? ' on this order or any other' : '') + '.', notFound: t.notFound });
    }
    return res(t.person ? personAction(it, t.order, t.person, ctx) : orderAction(it, t.order, ctx));
  }
  function personAction(it, o, p, ctx) {
    switch (it.act) {
      case 'setDozen': {
        var r = personPlan(o, p, function (np) { if (!(it.n > 0)) return 'How many dozen?'; np.dozen = round2(it.n); }, PR.dz(it.n));
        if (r.kind === 'plan' && it.from != null && Math.abs(it.from - (+p.dozen || 0)) > 0.01) r.warnings.push('You said ' + PR.dz(it.from) + ', but ' + (p.name || 'they') + ' had ' + PR.dz(p.dozen) + '.');
        return r;
      }
      case 'addDozen': return personPlan(o, p, function (np) { if (!(it.n > 0)) return 'How many more dozen?'; np.dozen = round2((+np.dozen || 0) + it.n); }, '+' + PR.dz(it.n));
      case 'subDozen': return personPlan(o, p, function (np) { var v = round2((+np.dozen || 0) - (it.n || 0)); if (v <= 0) return (p.name || 'They') + ' only has ' + PR.dz(p.dozen) + '. To take them off the list say “remove ' + (p.name || '') + '”.'; np.dozen = v; }, '−' + PR.dz(it.n));
      case 'paid': return personPlan(o, p, function (np) {
        if (it.paid) {
          if (!np.paid) np.paidAt = Date.now();
          np.paid = true; if (it.method) np.method = it.method;
          if (it.amount != null) { var ow = PR.personOwed(o, np); np.amount = ow !== null && Math.abs(it.amount - ow) < 0.01 ? '' : it.amount; }
        } else { np.paid = false; np.method = ''; np.amount = ''; delete np.paidAt; }
      }, it.paid ? 'paid' : 'not paid');
      case 'picked': return personPlan(o, p, function (np) { np.pickedUp = !!it.picked; if (it.picked) np.pickedUpAt = Date.now(); else delete np.pickedUpAt; }, it.picked ? 'picked up' : 'not picked up');
      case 'phone': { var ph = phoneOf(it.value); if (!ph) return { kind: 'error', msg: 'I didn’t catch a full 10-digit phone number in “' + it.value + '”.' }; return personPlan(o, p, function (np) { np.phone = ph; }, 'new phone'); }
      case 'remove': return plan(o, function (n) { n.people = people(n).filter(function (x) { return x.id !== p.id; }); }, 'Remove ' + (p.name || 'person') + ' from ' + (o.name || 'the list'));
      case 'note': return personPlan(o, p, function (np) { np.note = [np.note, cap(it.text)].filter(Boolean).join(' · '); }, 'note');
      case 'field':
        if (it.field === 'flavor') return personPlan(o, p, function (np) { np.flavor = cap(String(it.value).replace(/\s+(?:flavou?r)$/i, '')); }, 'flavor');
        return orderAction(it, o, ctx);
      default: return orderAction(it, o, ctx);
    }
  }
  function orderAction(it, o, ctx) {
    var label = o.name || 'Order', bulk = PR.isBulk(o);
    switch (it.act) {
      case 'setDozen':
        if (bulk) return { kind: 'error', msg: '“' + label + '” is a bulk order – say who, e.g. “make Jane ' + PR.dz(it.n) + '”.' };
        if (PR.typeOf(o) === 'cake') return { kind: 'error', msg: '“' + label + '” is a cake order – there’s no dozen count to change.' };
        return plan(o, function (n) { if (it.each && it.n > 6) { n.qty = it.n; n.qtyUnit = 'each'; } else { n.qty = it.n; n.qtyUnit = 'dozen'; } }, label + ' – quantity');
      case 'addDozen': case 'subDozen':
        if (bulk) return { kind: 'error', msg: 'Say who, e.g. “Jane wants 2 more dozen”.' };
        if (PR.typeOf(o) === 'cake') return { kind: 'error', msg: '“' + label + '” is a cake order.' };
        return plan(o, function (n) { var v = round2((+n.qty || 0) + (it.act === 'addDozen' ? 1 : -1) * it.n); if (v <= 0) return 'That would leave nothing.'; n.qty = v; n.qtyUnit = n.qtyUnit || 'dozen'; }, label + ' – quantity');
      case 'reschedule': {
        var d = P.parseDateTime(it.when, ctx && ctx.now);
        if (!d.date && !d.time) return { kind: 'error', msg: 'I couldn’t tell the new day or time in “' + it.when + '”.' };
        return plan(o, function (n) { if (d.date) n.dueDate = d.date; if (d.time) n.dueTime = d.time; if (it.fulfillment) n.fulfillment = it.fulfillment; }, label + ' – new ' + (d.date && d.time ? 'date & time' : d.date ? 'date' : 'time'));
      }
      case 'status': if (!it.status) return { kind: 'error', msg: 'Which status?' }; return plan(o, function (n) { n.status = it.status; }, label + ' – status');
      case 'remove': return plan(o, function (n) { n.status = 'Cancelled'; }, 'Cancel ' + label, { note: 'The order stays in the app as “Cancelled” and its reminders stop. You can change the status back any time.' });
      case 'paid':
        return plan(o, function (n) {
          if (bulk) return '“' + label + '” is a bulk order – say who paid, e.g. “Jane paid”.';
          if (!it.paid) { if (n.status === 'Paid') { n.status = 'Confirmed'; return; } return label + ' isn’t marked paid.'; }
          if (it.amount != null && it.amount < balance(n) - 0.01 && !it.full) n.deposit = round2((+n.deposit || 0) + it.amount); else n.status = 'Paid';
        }, label + (it.paid ? ' – payment' : ' – not paid'));
      case 'picked':
        return plan(o, function (n) {
          if (bulk) return '“' + label + '” is a bulk order – say who picked up, e.g. “Jane picked up”.';
          if (it.picked) n.status = 'Delivered/Picked up'; else if (n.status === 'Delivered/Picked up') n.status = 'Ready'; else return label + ' isn’t marked picked up.';
        }, label + ' – ' + (it.picked ? (o.fulfillment === 'delivery' ? 'delivered' : 'picked up') : 'not picked up'));
      case 'customerConfirmed':
        return plan(o, function (n) { n.customerConfirmedAt = Date.now(); n.confirmedSig = PR.confirmSig(n); if (n.status === 'Inquiry') n.status = 'Confirmed'; }, label + ' – customer confirmed');
      case 'fulfillment': return plan(o, function (n) { n.fulfillment = it.value; if (it.address) n.address = cap(it.address); }, label + ' – ' + it.value);
      case 'address': return plan(o, function (n) { n.address = cap(it.value); }, label + ' – address');
      case 'phone': { var ph = phoneOf(it.value); if (!ph) return { kind: 'error', msg: 'I didn’t catch a full 10-digit phone number in “' + it.value + '”.' }; return plan(o, function (n) { n.phone = ph; }, label + ' – phone'); }
      case 'note': return plan(o, function (n) { n.customerNotes = [n.customerNotes, cap(it.text)].filter(Boolean).join('\n'); }, label + ' – note');
      case 'field': return fieldPlan(it, o);
      default: return { kind: 'unknown' };
    }
  }
  var NUM_FIELDS = { price: 1, deposit: 1, pricePerDozen: 1, pricePerHalf: 1, tiers: 1, servings: 1 };
  function fieldPlan(it, o) {
    var k = it.field, v = String(it.value || '').trim(), label = o.name || 'Order', t = PR.typeOf(o), bulk = PR.isBulk(o), val;
    if (!v) return { kind: 'error', msg: 'Change the ' + (LABELS[k] || k).toLowerCase() + ' to what?' };
    if (NUM_FIELDS[k]) { val = money(v); if (val == null) return { kind: 'error', msg: 'I didn’t catch a number in “' + v + '”.' }; }
    if ((k === 'pricePerDozen' || k === 'pricePerHalf') && !bulk) return { kind: 'error', msg: 'Price per dozen is for bulk orders. Try “change the price to …”.' };
    if ((k === 'price' || k === 'deposit') && bulk) return { kind: 'error', msg: 'Bulk orders use a price per dozen – try “change the price per dozen to 14”.' };
    if (k === 'qty') {
      if (bulk) return { kind: 'error', msg: 'For a bulk order say who, e.g. “make Jane 3 dozen”.' };
      if (t === 'cake') return { kind: 'error', msg: 'Cakes don’t have a quantity – try size or tiers.' };
      var q = P.parseQuantity(v); if (!q) return { kind: 'error', msg: 'How many? I heard “' + v + '”.' };
      return plan(o, function (n) { if (q.unit === 'each' && q.qty === 6 && /half/i.test(v)) { n.qty = 0.5; n.qtyUnit = 'dozen'; } else { n.qty = q.qty; n.qtyUnit = q.unit; } }, label + ' – quantity');
    }
    if (k === 'size' && t !== 'cake') k = 'itemSize';
    if (k === 'itemSize') { var sz = /mini|small|bite/i.test(v) ? 'Mini' : /jumbo|large|big|giant/i.test(v) ? (t === 'cupcakes' ? 'Jumbo' : 'Regular') : 'Regular'; return plan(o, function (n) { n.itemSize = sz; }, label + ' – size'); }
    if (val === undefined) val = cap(v.replace(/\s+(?:flavou?r|frosting|icing|filling)$/i, ''));
    if (k === 'tiers' || k === 'servings') val = Math.round(val);
    return plan(o, function (n) { n[k] = val; }, label + ' – ' + (LABELS[k] || k).toLowerCase());
  }
  function addPerson(it, ctx, choice) {
    var o = null;
    if (choice && choice.orderId) o = getO(ctx, choice.orderId);
    else {
      var bulks = bulkOrders(ctx), cur = ctx.currentId && getO(ctx, ctx.currentId);
      if (it.ord) {
        var os = findOrders(it.ord, ctx, { bulkOnly: true });
        if (os.length === 1) o = os[0].order; else if (os.length > 1) return { kind: 'pick', why: 'Add to which order?', options: os.map(function (x) { return optOrder(x.order); }) };
        else { it.line = it.line + ' ' + it.ord; it.ord = ''; }   // wasn't an order name after all
      }
      if (!o && cur && PR.isBulk(cur)) o = cur;
      if (!o && bulks.length === 1) o = bulks[0];
      if (!o && bulks.length > 1) return { kind: 'pick', why: 'Add ' + (P.parseBulkLine(it.line, {}).name || 'them') + ' to which bulk order?', options: bulks.map(optOrder) };
      if (!o) return { kind: 'error', msg: 'There’s no bulk order to add people to. Start one with the 👥 Bulk order button.' };
    }
    var b = P.parseBulkLine(it.line, {});
    if (!b || !b.name) return { kind: 'error', msg: 'I didn’t catch the person’s name in “' + it.line + '”.' };
    var exists = people(o).find(function (p) { return nameScore(b.name, p.name) >= 0.99; });
    var r = plan(o, function (n) {
      var np = { id: 'pp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), addedAt: Date.now(), name: b.name, phone: b.phone, dozen: b.dozen === '' ? 1 : b.dozen,
        flavor: b.flavor, paid: b.paid, method: b.method, amount: b.amount, pickedUp: b.pickedUp, note: b.note };
      if (b.paid) np.paidAt = Date.now();
      n.people = people(n).concat([np]);
    }, 'Add ' + b.name + ' to ' + (o.name || 'the order'));
    if (r.kind === 'plan') {
      if (b.dozen === '') r.warnings.push('I didn’t hear how many – put down 1 dozen.');
      if (exists) r.warnings.push('There’s already a ' + exists.name + ' on this list. To change their dozens say “' + exists.name.split(' ')[0] + ' wants 2 more dozen”.');
    }
    return r;
  }
  function newOrderSignals(text) {
    var d = P.parseOrder(text), n = ['phone', 'dueDate', 'occasion', 'price', 'flavor', 'qty', 'size'].filter(function (k) { return d[k] !== '' && d[k] != null; }).length;
    return d.phone && n >= 2 ? Math.max(n, 3) : n;
  }
  function looksLikeNewOrder(text) {
    var d = P.parseOrder(text);
    var n = ['phone', 'dueDate', 'occasion', 'price', 'flavor', 'qty', 'size'].filter(function (k) { return d[k] !== '' && d[k] != null; }).length;
    return n >= 2 || (!!d.name && n >= 1);
  }
  function byDue(a, b) { return ((a.dueDate || '9') + (a.dueTime || '')).localeCompare((b.dueDate || '9') + (b.dueTime || '')); }
  function query(it, ctx) {
    var now = startOfDay(ctx.now), cur = ctx.currentId && getO(ctx, ctx.currentId);
    if (it.q === 'unpaid' || it.q === 'notpicked') {
      if (cur && PR.isBulk(cur)) return { kind: 'nav', orderId: cur.id, peopleFilter: it.q };
      var list = ctx.orders.filter(function (o) {
        if (o.status === 'Cancelled') return false;
        if (it.q === 'unpaid') { if (PR.isBulk(o)) { var bt = PR.bulkTotals(o); return bt.outstanding > 0.004 || (bt.noPrice && bt.unpaid > 0); } return o.status !== 'Paid' && o.status !== 'Inquiry' && balance(o) > 0; }
        return PR.isBulk(o) ? isOpen(o) && people(o).some(function (p) { return !p.pickedUp; }) : isOpen(o) && o.dueDate && o.dueDate <= iso(now);
      }).sort(byDue);
      return { kind: 'list', title: it.q === 'unpaid' ? 'Money still owed' : 'Not picked up yet', ids: list.map(function (o) { return o.id; }), peopleFilter: it.q };
    }
    if (it.q === 'type') {
      var tl = ctx.orders.filter(function (o) { return isOpen(o) && (it.type === 'bulk' ? PR.isBulk(o) : PR.typeOf(o) === it.type); }).sort(byDue);
      return { kind: 'list', title: { cake: 'Cake orders', cupcakes: 'Cupcake orders', creampies: 'Cream pie orders', bulk: 'Bulk orders' }[it.type], ids: tl.map(function (o) { return o.id; }) };
    }
    var dow = now.getDay(), from = now, to, title;
    if (it.range === 'today') { to = now; title = 'Due today'; }
    else if (it.range === 'tomorrow') { from = to = addDays(now, 1); title = 'Due tomorrow'; }
    else if (it.range === 'nextweek') { from = addDays(now, ((8 - dow) % 7) || 7); to = addDays(from, 6); title = 'Due next week'; }
    else if (it.range === 'weekend') { var sat = dow === 0 ? addDays(now, -1) : addDays(now, 6 - dow); from = dow === 0 ? now : sat; to = addDays(sat, 1); title = 'Due this weekend'; }
    else if (/^day:/.test(it.range)) { var want = { sun: 0, mon: 1, tues: 2, wednes: 3, thurs: 4, fri: 5, satur: 6 }[it.range.slice(4)]; from = to = addDays(now, (want - dow + 7) % 7); title = 'Due ' + from.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); }
    else { to = addDays(now, (7 - dow) % 7); title = 'Due this week'; }
    var f = iso(from), tt = iso(to);
    var due = ctx.orders.filter(function (o) { return isOpen(o) && o.dueDate && o.dueDate >= f && o.dueDate <= tt; }).sort(byDue);
    if (it.range === 'week' || it.range === 'today') due = ctx.orders.filter(function (o) { return isOpen(o) && o.dueDate && o.dueDate < iso(now); }).sort(byDue).concat(due);
    return { kind: 'list', title: title, ids: due.map(function (o) { return o.id; }) };
  }

  var EXAMPLES = [
    ['New order', ['Sarah Johnson 555-123-4567, birthday cake for Saturday at 2, chocolate, $85', 'New order: Jane, 2 dozen cupcakes Friday']],
    ['Bulk orders', ['Make Jane 3 dozen', 'Instead of Jane only getting 1 dozen make it 3 dozen', 'Jane wants 2 more dozen', 'Add Mike Brown 2 dozen to the Smith fundraiser', 'Jane paid Venmo', 'Bob hasn’t paid', 'Tom picked up', 'Remove Amy', 'Change Bob’s number to 555-201-0009']],
    ['Change an order', ['Move the Smith cake to Saturday at 2', 'Change the frosting to cream cheese', 'Deposit paid 20', 'The price is 90', 'Make it a delivery to 12 Oak Street', 'Add a note that she’s allergic to nuts', 'Mark Sarah’s cake ready', 'Sarah confirmed', 'Cancel the Garcia order']],
    ['Find things', ['Open Jane’s order', 'Show unpaid', 'What’s due this week?', 'Who hasn’t picked up?']],
    ['Oops', ['Undo']]
  ];

  var api = { parseIntent: parseIntent, interpret: interpret, resolve: resolve, clean: clean, qty: qty, money: money, nameScore: nameScore, who: who, diff: diff, summary: summary, segText: segText, phon: phon, EXAMPLES: EXAMPLES };
  if (isNode) module.exports = api; else root.CakeCommands = api;
})(this);
