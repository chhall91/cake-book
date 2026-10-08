/* Cake Book – natural-language order parser (heuristic, no dependencies).
 * Works in the browser (window.CakeParser) and in Node (module.exports). */
(function (root) {
  'use strict';

  // ---------- vocab ----------
  var MONTHS = { january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5,
    july: 6, jul: 6, august: 7, aug: 7, september: 8, sept: 8, sep: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11 };
  var MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
  var WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  var WEEKDAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday)';

  var SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
    eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };

  var OCCASIONS = [
    ['baby shower', 'Baby shower'], ['bridal shower', 'Bridal shower'], ['wedding shower', 'Bridal shower'],
    ['gender reveal', 'Gender reveal'], ['bar mitzvah', 'Bar mitzvah'], ['bat mitzvah', 'Bat mitzvah'],
    ['first communion', 'First communion'], ['1st communion', 'First communion'], ['communion', 'Communion'],
    ['quinceanera', 'Quinceañera'], ['quinceañera', 'Quinceañera'], ['sweet 16', 'Sweet 16'], ['sweet sixteen', 'Sweet 16'],
    ['smash cake', 'Smash cake'], ["mother's day", "Mother's Day"], ["mothers day", "Mother's Day"],
    ["father's day", "Father's Day"], ["fathers day", "Father's Day"], ["valentine's", "Valentine's Day"], ['valentines', "Valentine's Day"],
    ['birthday', 'Birthday'], ['wedding', 'Wedding'], ['anniversary', 'Anniversary'], ['engagement', 'Engagement'],
    ['graduation', 'Graduation'], ['retirement', 'Retirement'], ['christening', 'Christening'], ['baptism', 'Baptism'],
    ['christmas', 'Christmas'], ['easter', 'Easter'], ['halloween', 'Halloween'], ['thanksgiving', 'Thanksgiving'],
    ['new year', "New Year's"], ['housewarming', 'Housewarming'], ['farewell', 'Farewell'], ['going away', 'Farewell'],
    ['welcome home', 'Welcome home'], ['shower', 'Shower'], ['party', 'Party']
  ];

  var FLAVORS = ['german chocolate', 'white chocolate', 'dark chocolate', 'double chocolate', 'milk chocolate', 'red velvet',
    'cookies and cream', 'cookies & cream', 'black forest', 'tres leches', 'salted caramel', 'peanut butter', 'lemon blueberry',
    'strawberry shortcake', 'earl grey', 'carrot cake', 'banana bread', 'italian cream', 'hummingbird', 'chocolate', 'vanilla',
    'lemon', 'carrot', 'strawberry', 'raspberry', 'blueberry', 'funfetti', 'confetti', 'marble', 'almond', 'coconut', 'spice',
    'pumpkin', 'banana', 'white', 'yellow', 'coffee', 'mocha', 'espresso', 'chai', 'pistachio', 'oreo', 'champagne',
    'orange', 'caramel', 'lavender', 'matcha', 'cherry', 'apple', 'cinnamon', 'gingerbread', 'butter', 'pound'];

  var PURE_COLORS = ['rose gold', 'baby blue', 'light blue', 'navy blue', 'navy', 'hot pink', 'light pink', 'pale pink',
    'pink', 'blush', 'red', 'burgundy', 'maroon', 'coral', 'yellow', 'gold', 'golden', 'green', 'sage', 'teal', 'turquoise',
    'blue', 'purple', 'lilac', 'violet', 'white', 'ivory', 'black', 'silver', 'rainbow', 'pastel', 'brown', 'beige', 'orange', 'neutral'];
  // words that are both colors and flavors: kept as part of frosting/flavor, and only treated as color when clearly colors
  var AMBIG_COLORS = ['lavender', 'mint', 'peach', 'cream', 'champagne', 'chocolate'];

  var FROSTINGS_RE = /\b(swiss meringue buttercream|italian meringue buttercream|american buttercream|butter ?cream|cream cheese frosting|cream cheese icing|whipped cream|frosting|icing|fondant|ganache|glaze|meringue)\b/i;

  var STOP_BOUND = '(?:with|and|a|an|the|of|cake|tier|tiers|tiered|inch|in|on|for|at|to|is|layer|layers|\\||,)';

  var PHRASE_STOPS = [
    'pick ?-?up', 'picking (?:it )?up', 'pick it up', 'for pickup', 'delivery', 'deliver(?:ed)?', '\\$', '\\d+(?:\\.\\d+)? ?(?:dollars?|bucks)',
    'deposit', 'paid', 'price', 'total', 'cost', 'costs', 'charge', 'allerg\\w*', 'nut[- ]free', 'no nuts', 'gluten', 'dairy', 'vegan',
    'egg[- ]free', 'due', '(?:for|on|this|next|by) (?:today|tomorrow|' + WEEKDAY_RE.slice(1, -1) + ')', 'today', 'tomorrow',
    WEEKDAY_RE, MONTH_RE + ' \\d', 'at \\d', 'at noon', 'phone', 'email', 'number', '(?:the )?colou?rs?', 'theme', 'design',
    'with (?:\\w+ )?(?:filling|frosting|buttercream|icing|fondant)', '\\d+ ?-?inch', '\\d+ ?-?tiers?', 'serves', 'feeds', 'flavou?r'
  ];
  var STOP_LOOKAHEAD = '(?=\\s*(?:[,.;!|]|$)|\\s+(?:and\\s+|then\\s+)?(?:' + PHRASE_STOPS.join('|') + ')(?![a-z]))';

  var NAME_STOP = new Set(('a an the and or but with for on at to of in is it its it\'s has have had wants want needs need would like ' +
    'i im i\'m she he they we her his their my our your me you this that these next coming cake cakes order orders new ' +
    'phone number email mail cell mobile call text pickup pick delivery deliver delivered due tier tiers tiered inch round square ' +
    'please ok okay so um uh hi hey hello customer name called about calling from party ' +
    'today tomorrow tonight morning afternoon evening noon ' +
    'january february march april may june july august september october november december ' +
    'sunday monday tuesday wednesday thursday friday saturday cupcakes cupcake sheet dozen oatmeal cream creme pie pies cookies mini bulk group ' +
    'chocolate vanilla red velvet lemon strawberry funfetti buttercream frosting fondant filling says message').split(/\s+/));
  OCCASIONS.forEach(function (o) { o[0].split(' ').forEach(function (w) { NAME_STOP.add(w); }); });

  // ---------- helpers ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function titleCase(s) { return s.replace(/\b([a-z])([a-z'’-]*)/gi, function (m, a, b) { return a.toUpperCase() + b.toLowerCase(); }); }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').replace(/^[\s,.;:|-]+|[\s,.;:|-]+$/g, '').trim(); }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function ordSuffix(n) { var t = n % 100; if (t >= 11 && t <= 13) return 'th'; return ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'; }

  // Convert spelled-out numbers ("two tier", "twenty-five", "tenth", "one hundred twenty") to digits.
  function wordsToNumbers(text) {
    var toks = String(text).match(/[A-Za-z]+(?:-[A-Za-z]+)*|[^A-Za-z]+/g) || [];
    var out = '';
    var i = 0;
    function val(word) {
      var w = word.toLowerCase();
      if (w in SMALL) return { v: SMALL[w], k: 'small' };
      if (w in TENS) return { v: TENS[w], k: 'tens' };
      if (w in ORD) return { v: ORD[w], k: 'ord' };
      if (w === 'hundred') return { v: 100, k: 'mul' };
      if (w === 'thousand') return { v: 1000, k: 'mul' };
      return null;
    }
    while (i < toks.length) {
      var j = i, total = 0, cur = 0, last = null, any = false, ordinal = false, lastWordIdx = -1;
      while (j < toks.length) {
        var tok = toks[j];
        if (!/^[A-Za-z]/.test(tok)) {
          if (any && /^ +$/.test(tok) && j + 1 < toks.length) { j++; continue; }
          break;
        }
        if (any && tok.toLowerCase() === 'and' && last && last.k === 'mul') { j++; continue; }
        var parts = tok.split('-');
        var vals = parts.map(val);
        if (vals.some(function (v) { return !v; })) break;
        var okAll = true, t2 = total, c2 = cur, l2 = last, ord2 = false;
        for (var p = 0; p < vals.length; p++) {
          var v = vals[p];
          if (ord2) { okAll = false; break; }
          if (v.k === 'mul') {
            if (l2 === null && v.v === 100) { okAll = false; break; }
            if (v.v === 100) c2 = (c2 || 1) * 100; else { t2 += (c2 || 1) * 1000; c2 = 0; }
          } else {
            var val2 = v.v;
            if (l2 === null) c2 = val2;
            else if (l2.k === 'tens' && val2 < 10 && (v.k === 'small' || v.k === 'ord')) c2 += val2;
            else if (l2.k === 'mul' && val2 < 100) c2 += val2;
            else { okAll = false; break; }
            if (v.k === 'ord') ord2 = true;
          }
          l2 = v;
        }
        if (!okAll) break;
        total = t2; cur = c2; last = l2; ordinal = ord2; any = true; lastWordIdx = j;
        j++;
        if (ordinal) break;
      }
      if (any) {
        var n = total + cur;
        out += String(n) + (ordinal ? ordSuffix(n) : '');
        i = lastWordIdx + 1;
      } else { out += toks[i]; i++; }
    }
    return out;
  }

  function normalizeText(text) {
    var t = ' ' + wordsToNumbers(String(text || '')) + ' ';
    t = t.replace(/[\u2018\u2019]/g, "'");
    t = t.replace(/\b([ap])\.\s?m\b\.?/gi, function (m, a) { return a.toLowerCase() + 'm'; });
    t = t.replace(/(\d)\s*o'?\s?clock/gi, '$1');
    t = t.replace(/\b(\d+) point (\d+)\b/gi, '$1.$2');
    t = t.replace(/\s+/g, ' ');
    return t;
  }

  function formatPhone(raw) {
    var d = raw.replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    if (d.length === 7) return d.slice(0, 3) + '-' + d.slice(3);
    return raw.trim();
  }

  function normalizeSpokenEmail(s) {
    var t = ' ' + s.trim() + ' ';
    t = t.replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.').replace(/\s+underscore\s+/gi, '_')
      .replace(/\s+(dash|hyphen)\s+/gi, '-');
    return t.replace(/\s+/g, '').toLowerCase();
  }

  function extractNumber(text) {
    var m = normalizeText(text).replace(/,(\d{3})/g, '$1').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function to24(h, m, ap, hint) {
    h = parseInt(h, 10); m = parseInt(m || '0', 10);
    if (h > 23 || m > 59) return null;
    if (ap) {
      ap = ap.toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    } else if (hint) {
      if (/morning/.test(hint)) { if (h === 12) h = 0; }
      else if (h < 12) h += 12;
    } else if (h >= 1 && h <= 7) h += 12;        // bakery hours heuristic: 1–7 → afternoon/evening
    return pad(h) + ':' + pad(m);
  }

  // Parse date/time from free text. Returns {date, time, spans:[[start,end]], warnings}
  function parseDateTime(input, now, prenormalized) {
    now = now || new Date();
    var t = prenormalized ? input : normalizeText(input);
    var res = { date: '', time: '', spans: [], warnings: [] };
    var m, re;
    function span(mm, idx) { res.spans.push([idx, idx + mm.length]); }

    // ---- time ----
    re = /\b(?:at |by |around |about |@ ?)?(\d{1,2})(?:(:|\s)(\d{2}))?\s*(am|pm)\b/gi;
    while ((m = re.exec(t))) {
      if (m[2] === ' ' && !/^(00|15|30|45)$/.test(m[3])) { re.lastIndex = m.index + m[0].indexOf(m[1]) + m[1].length; continue; }
      var tt = to24(m[1], m[3], m[4]);
      if (tt) { res.time = tt; span(m[0], m.index); break; }
    }
    if (!res.time && (m = /\b(?:at |by |around )?(noon|midday|lunchtime|lunch time)\b/i.exec(t))) { res.time = '12:00'; span(m[0], m.index); }
    if (!res.time) {
      re = /\b(?:at|by|around)\s+(\d{1,2})(?:[:\s](\d{2}))?(?!\s*(?:inch|in\.|"|tier|serv|people|guests|dollar|bucks|th\b|st\b|nd\b|rd\b|%|\/|\d|[a-z]+ (?:street|st|avenue|ave|road|rd|lane|drive|dr|court|way)))\s*(in the morning|in the afternoon|in the evening|at night|tonight)?/gi;
      while ((m = re.exec(t))) {
        if (m[2] && !/^(00|15|30|45)$/.test(m[2])) continue;
        var t2 = to24(m[1], m[2], null, m[3]);
        if (t2) { res.time = t2; span(m[0], m.index); break; }
      }
    }

    // ---- date ----
    var today = startOfDay(now);
    var explicit = null, weekdayDate = null, weekdayName = null;
    function yearFix(mon, day, yr) {
      var y = yr ? parseInt(yr, 10) : today.getFullYear();
      if (y < 100) y += 2000;
      var d = new Date(y, mon, day);
      if (d.getMonth() !== mon) return null;
      if (!yr && d < addDays(today, -1)) d = new Date(y + 1, mon, day);
      return d;
    }
    if ((m = new RegExp('\\b' + MONTH_RE + '\\.?\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?', 'i').exec(t))) {
      explicit = yearFix(MONTHS[m[1].toLowerCase()], parseInt(m[2], 10), m[3]); span(m[0], m.index);
    } else if ((m = new RegExp('\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH_RE + '\\b(?:,?\\s+(20\\d{2}))?', 'i').exec(t))) {
      explicit = yearFix(MONTHS[m[2].toLowerCase()], parseInt(m[1], 10), m[3]); span(m[0], m.index);
    } else if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
      explicit = yearFix(parseInt(m[1], 10) - 1, parseInt(m[2], 10), m[3]); span(m[0], m.index);
    } else if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t))) {
      explicit = new Date(+m[1], +m[2] - 1, +m[3]); span(m[0], m.index);
    } else if ((m = /\bthe\s+(\d{1,2})(st|nd|rd|th)\b/i.exec(t))) {
      var dd = parseInt(m[1], 10);
      var cand = new Date(today.getFullYear(), today.getMonth(), dd);
      if (cand < today) cand = new Date(today.getFullYear(), today.getMonth() + 1, dd);
      if (dd >= 1 && dd <= 31) { explicit = cand; span(m[0], m.index); }
    }

    if ((m = /\b(day after tomorrow)\b/i.exec(t))) { weekdayDate = addDays(today, 2); span(m[0], m.index); }
    else if ((m = /\b(tomorrow)\b/i.exec(t))) { weekdayDate = addDays(today, 1); span(m[0], m.index); }
    else if ((m = /\b(today|tonight|this afternoon|this evening)\b/i.exec(t))) { weekdayDate = today; span(m[0], m.index); }
    else if ((m = /\bin\s+(\d{1,2}|a|an)\s+(days?|weeks?)\b/i.exec(t))) {
      var n = /^an?$/i.test(m[1]) ? 1 : parseInt(m[1], 10);
      weekdayDate = addDays(today, /week/i.test(m[2]) ? n * 7 : n); span(m[0], m.index);
    } else if ((m = /\b(?:a\s+)?week from (today|now)\b/i.exec(t))) { weekdayDate = addDays(today, 7); span(m[0], m.index); }
    else if ((m = new RegExp('\\b(?:(this coming|this|next|coming|upcoming)\\s+)?' + WEEKDAY_RE + '\\b', 'i').exec(t))) {
      var wd = WEEKDAYS[m[2].toLowerCase()];
      var mode = m[1] ? m[1].toLowerCase() : '';
      var diff = (wd - today.getDay() + 7) % 7;
      if (mode === 'this') { /* 0..6 */ }
      else if (mode === 'next') { if (diff === 0) diff = 7; diff += 7; }
      else if (diff === 0) diff = 7;
      weekdayDate = addDays(today, diff); weekdayName = m[2]; span(m[0], m.index);
    }

    var d = explicit || weekdayDate;
    if (explicit && weekdayName && explicit.getDay() !== WEEKDAYS[weekdayName.toLowerCase()]) {
      res.warnings.push('You said ' + cap(weekdayName.toLowerCase()) + ', but ' + explicit.toDateString().slice(4, 10) +
        ' is a ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][explicit.getDay()] + ' – please check the date.');
    }
    if (d) res.date = isoDate(d);
    return res;
  }

  // ---------- product type & quantity ----------
  // "2 dozen" → {qty:2, unit:'dozen'}; "30" → {qty:30, unit:'each'}; "half a dozen" → 6 each; "a dozen and a half" → 1.5 dozen.
  function parseQuantity(text) {
    var t = normalizeText(text).toLowerCase(), m;
    if (/\bbaker'?s\s+dozen\b/.test(t)) return { qty: 13, unit: 'each' };
    if ((m = /\b(\d+)\s+and\s+a\s+half\s+dozen\b/.exec(t))) return { qty: +m[1] + 0.5, unit: 'dozen' };
    if ((m = /\b(\d+(?:\.\d+)?|a|an|one)?\s*dozen\s+and\s+a\s+half\b/.exec(t))) return { qty: (m[1] && /\d/.test(m[1]) ? +m[1] : 1) + 0.5, unit: 'dozen' };
    if (/\bhalf\s+(?:a\s+)?dozen\b/.test(t)) return { qty: 6, unit: 'each' };
    if ((m = /\b(\d+(?:\.\d+)?|a|an|one)\s+dozen\b/.exec(t))) return { qty: /\d/.test(m[1]) ? +m[1] : 1, unit: 'dozen' };
    if (/\bdozens?\b/.test(t)) return { qty: 1, unit: 'dozen' };
    if ((m = /\b(\d+)\b/.exec(t))) return { qty: +m[1], unit: 'each' };
    return null;
  }
  var CREAMPIE_RE = /\b(?:oatmeal\s+)?(?:cream|creme|crème)\s+pies?(?:\s+cookies?)?\b|\boatmeal\s+(?:sandwich\s+)?(?:pies?|cream\s+sandwich(?:es)?|cream\s+cookies?)\b/i;
  var CUPCAKE_RE = /\bcupcakes?\b/i;
  var CAKE_SIGNAL_RE = /\bcake\b|\b\d{1,2}\s*(?:-\s*)?(?:inch(?:es)?|in\.|")|\btier(?:s|ed)?\b|\b(?:quarter|half|full)\s+sheet\b/i;
  var QTY_BEFORE_RE = new RegExp('(?:\\b(\\d+(?:\\.\\d+)?|a|an|one|half(?:\\s+a)?|a\\s+half|baker\'?s)\\s+)?(?:\\b(dozen)(?:\\s+and\\s+a\\s+half)?\\s+)?(?:of\\s+(?:the\\s+|your\\s+)?)?' +
    '(?:\\b(mini|minis|miniature|small|bite[- ]size(?:d)?|regular|standard|normal|full[- ]size(?:d)?|large|big|jumbo|giant)\\s+)?' +
    '((?:\\b(?:' + FLAVORS.map(escRe).join('|') + '|and|&)\\s+){0,4})$', 'i');
  function sizeFor(word, type) {
    if (!word) return '';
    if (/^(mini|minis|miniature|small|bite)/i.test(word)) return 'Mini';
    if (/^(jumbo|giant|large|big)$/i.test(word)) return type === 'cupcakes' ? 'Jumbo' : 'Regular';
    return 'Regular';
  }

  // ---------- bulk orders: one person per line ----------
  // "Jane Doe 555-123-4567 2 dozen paid", "Bob Smith, 1.5 dz, pumpkin, venmo", "Amy – half dozen – owes", "1. Tom x3 picked up",
  // or our own CSV export (header row with Name / Dozen / Paid …).
  var BULK_FLAVORS = ['brown sugar', 'peanut butter', 'red velvet', 'pumpkin spice', 'cookies and cream', 'cookies & cream', 'salted caramel', 'oatmeal raisin',
    'classic', 'original', 'regular', 'maple', 'pumpkin', 'chocolate', 'vanilla', 'gingerbread', 'cinnamon', 'raisin', 'snickerdoodle', 'lemon', 'strawberry',
    'funfetti', 'caramel', 'coconut', 'mint', 'espresso', 'mocha', 'apple', 'cherry', 'carrot', 'banana', 'birthday cake'];
  var METHODS = [[/\bcash\s?app\b|\$cashtag/i, 'Cash App'], [/\bvenmo(?:ed)?\b/i, 'Venmo'], [/\bzelle(?:d)?\b/i, 'Zelle'], [/\bcheck\b|\bcheque\b/i, 'Check'], [/\bcash\b/i, 'Cash'], [/\bpay\s?pal\b|\bcard\b|\bapple\s?pay\b/i, 'Other']];
  function dozenFrom(t) {
    var m;
    if ((m = /\b(\d+)\s*(?:and\s+a\s+half|½|\s1\/2)\s*(?:dozen|doz|dzn|dz)?\b/i.exec(t)) && /½|half|1\/2/.test(m[0])) return { v: +m[1] + 0.5, m: m };
    if ((m = /(?:^|\s)½\s*(?:dozen|doz|dzn|dz)?\b|\bhalf\s+(?:a\s+)?(?:dozen|doz|dzn|dz)\b|\b1\/2\s*(?:dozen|doz|dzn|dz)\b/i.exec(t))) return { v: 0.5, m: m };
    if ((m = /\b(\d+(?:\.\d+)?)\s*(?:dozen|doz|dzn|dz)\.?(?![a-z])/i.exec(t))) return { v: +m[1], m: m };
    if ((m = /\b(?:a\s+)?dozen\b/i.exec(t))) return { v: 1, m: m };
    if ((m = /(?:^|\s)[x×]\s?(\d+(?:\.\d+)?)\b/i.exec(t))) return { v: +m[1], m: m };
    if ((m = /(?:^|[\s,|;\t])(\d{1,3}(?:\.5)?)(?=$|[\s,|;\t])/.exec(t))) return { v: +m[1], m: m };
    return null;
  }
  function parseBulkLine(line, opts) {
    opts = opts || {};
    var raw = String(line || '').trim();
    var r = { name: '', phone: '', dozen: '', flavor: '', paid: false, method: '', amount: '', pickedUp: false, note: '', raw: raw, warnings: [] };
    if (!raw) return null;
    var t = ' ' + raw.replace(/^\s*(?:\d{1,3}[.)]\s+|[-•*–]\s+)/, '') + ' ';
    t = normalizeText(t).replace(/\bpaid\s+in\s+full\b/i, 'paid');
    var m;
    function cut(x) { t = t.replace(x, ' | '); }
    if ((m = /\S+@\S+\.\w+/.exec(t))) cut(m[0]);
    if ((m = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.exec(t)) || (m = /\b\d{3}[\s.-]\d{4}\b/.exec(t))) { r.phone = formatPhone(m[0]); cut(m[0]); }
    if ((m = /\$\s?(\d+(?:\.\d{1,2})?)|\b(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks)\b/i.exec(t))) { r.amount = parseFloat(m[1] || m[2]); cut(m[0]); }
    if ((m = /\b(?:picked\s?up|pickedup|got (?:it|them)|delivered|collected)\b/i.exec(t))) { r.pickedUp = true; cut(m[0]); }
    var unpaid = /\b(?:unpaid|not\s+paid|hasn'?t\s+paid|has\s+not\s+paid|needs?\s+to\s+pay|owes?|owing|due)\b/i.exec(t);
    if (unpaid) cut(unpaid[0]);
    for (var i = 0; i < METHODS.length; i++) { if ((m = METHODS[i][0].exec(t))) { r.method = METHODS[i][1]; cut(m[0]); break; } }
    if ((m = /\b(?:paid|pd|prepaid)\b|✓|✔/i.exec(t))) { r.paid = true; cut(m[0]); }
    if (r.method && !unpaid) r.paid = true;
    if (unpaid) { r.paid = false; if (r.method) r.note = 'will pay ' + r.method; r.method = ''; r.amount = ''; }
    if (!r.paid) r.amount = '';
    var d = dozenFrom(t);
    if (d) { r.dozen = d.v; t = t.slice(0, d.m.index) + ' | ' + t.slice(d.m.index + d.m[0].length); }
    var fl = (opts.flavors || []).concat(BULK_FLAVORS).sort(function (a, b) { return b.length - a.length; });
    for (var k = 0; k < fl.length; k++) {
      var fm = new RegExp('\\b' + escRe(fl[k].toLowerCase()) + '\\b', 'i').exec(t);
      if (fm) { r.flavor = /^(classic|original|regular)$/i.test(fl[k]) ? '' : cap(fl[k].toLowerCase()); cut(fm[0]); if (/^(classic|original|regular)$/i.test(fl[k])) r.classic = true; break; }
    }
    t = t.replace(/\b(?:each|cream\s+pies?|oatmeal|cupcakes?|cookies?|for|of|and|wants?|ordered|order|flavou?r|filling)\b/gi, ' | ');
    var segs = t.split(/[|,;\t]|\s[-–—]\s|\s{2,}/).map(function (x) { return clean(x).replace(/^[:\-–—]+|[:\-–—]+$/g, '').trim(); }).filter(function (x) { return /[A-Za-z]/.test(x); });
    if (segs.length) {
      var nm = segs.shift().replace(/[^A-Za-z'’.\- ]/g, ' ').replace(/\s+/g, ' ').trim();
      r.name = nm === nm.toLowerCase() || nm === nm.toUpperCase() ? titleCase(nm) : nm;
      var rest = segs.join(', ');
      if (rest) r.note = (r.note ? r.note + '; ' : '') + rest;
    }
    if (!r.name) r.warnings.push('no name');
    if (r.dozen === '') r.warnings.push('no amount – counted as 1 dozen');
    return r;
  }
  function csvSplit(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim().replace(/^'(?=[=+\-@])/, ''); });
  }
  /** Many lines → people. Lines can also be separated by ";" or "next person" (handy when dictating). */
  function parseBulkList(text, opts) {
    var lines = String(text || '').split(/\r?\n|;|\bnext person\b/i).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!lines.length) return [];
    var sep = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    var head = csvSplit(lines[0].toLowerCase(), sep);
    var col = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
    if (col(/^name$|customer|person/) >= 0 && (col(/dozen|qty|quantity|how many/) >= 0 || col(/paid/) >= 0)) {
      var C = { name: col(/^name$|customer|person/), phone: col(/phone|cell|number/), dozen: col(/dozen|qty|quantity|how many/), flavor: col(/flavou?r/),
        paid: col(/^paid\??$|paid\?|^status$/), method: col(/method|how paid/), amount: col(/amount paid|^paid amount|^amount$/), picked: col(/picked|pick ?up|delivered/), note: col(/note/) };
      return lines.slice(1).map(function (ln) {
        var c = csvSplit(ln, sep), g = function (k) { return C[k] >= 0 ? (c[C[k]] || '').trim() : ''; };
        if (!g('name') && !g('phone')) return null;
        var paidV = g('paid').toLowerCase(), p = {
          name: g('name'), phone: g('phone') ? formatPhone(g('phone')) : '', dozen: g('dozen') !== '' && !isNaN(parseFloat(g('dozen'))) ? parseFloat(g('dozen')) : '',
          flavor: g('flavor'), paid: /^(yes|y|paid|true|1|x|✓|partial)$/.test(paidV), method: g('method'), amount: '', pickedUp: /^(yes|y|true|1|x|✓)$/i.test(g('picked')),
          note: g('note'), raw: ln, warnings: [] };
        if (p.paid && g('amount') !== '' && !isNaN(parseFloat(g('amount').replace(/[$,]/g, '')))) p.amount = parseFloat(g('amount').replace(/[$,]/g, ''));
        if (paidV === 'yes' || paidV === 'paid') p.amount = p.amount === '' ? '' : p.amount;
        if (p.dozen === '') p.warnings.push('no amount – counted as 1 dozen');
        return p;
      }).filter(Boolean);
    }
    return lines.filter(function (ln) { return !/^names?\b.*\b(?:phone|dozen|paid|qty)\b/i.test(ln); }).map(function (ln) { return parseBulkLine(ln, opts); }).filter(function (p) { return p && (p.name || p.phone); });
  }

  // ---------- main parser ----------
  function parseOrder(text, now) {
    now = now || new Date();
    var r = { name: '', phone: '', email: '', fulfillment: '', address: '', customerNotes: '', occasion: '', dueDate: '', dueTime: '',
      size: '', servings: '', tiers: '', shape: '', flavor: '', filling: '', frosting: '', design: '', message: '', allergies: '',
      price: '', deposit: '', bulk: false, pricePerDozen: '', productType: '', qty: '', qtyUnit: '', itemSize: '', liners: '', wrapped: '', packaging: '', warnings: [] };
    var w = normalizeText(text);
    var m;
    function cut(str) { w = w.replace(str, ' | '); }
    function cutSpan(a, b) { w = w.slice(0, a) + ' | ' + w.slice(b); }

    // email (typed or spoken "sarah at gmail dot com")
    if ((m = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(w))) { r.email = m[0].toLowerCase().replace(/\.$/, ''); cut(m[0]); }
    else if ((m = /\b([a-z0-9][a-z0-9._-]*(?:\s+(?:dot|underscore)\s+[a-z0-9]+)*)\s+at\s+([a-z0-9-]+(?:\s+dot\s+[a-z]{2,})+)\b/i.exec(w))) {
      r.email = normalizeSpokenEmail(m[1] + ' at ' + m[2]); cut(m[0]);
    }
    w = w.replace(/\b(?:(?:her|his|their|the)\s+)?e-?mail(?:\s+address)?(?:\s+is)?\b/gi, ' | ');

    // phone
    if ((m = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.exec(w)) || (m = /\b\d{3}[\s.-]\d{4}\b/.exec(w))) {
      r.phone = formatPhone(m[0]); cut(m[0]);
    } else {
      // spoken digit-by-digit ("five five five one two three ...") → "5 5 5 1 2 3 ..."
      var pre2 = /\b\d{1,4}(?:[\s.-]+\d{1,4}){2,10}\b/g;
      while ((m = pre2.exec(w))) {
        var dg = m[0].replace(/\D/g, '');
        if (dg.length === 10 || (dg.length === 11 && dg[0] === '1')) { r.phone = formatPhone(dg); cut(m[0]); break; }
      }
    }
    w = w.replace(/\b(?:(?:her|his|their|the)\s+)?(?:phone|cell|mobile)(?:\s+number)?(?:\s+is)?\b|\bnumber is\b/gi, ' | ');

    // "$12 a dozen" is a price, not a quantity
    w = w.replace(/(\$\s?\d+(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\s*(?:dollars?|bucks))\s+(?:a|per|each|for\s+a|for\s+each)\s+dozen\b/gi, '$1 perdz');
    // product type: cupcakes / oatmeal cream pies (cakes are the default)
    w = w.replace(/\bcup\s+cakes\b/gi, 'cupcakes').replace(/\bcup\s+cake\b/gi, 'cupcake');
    var cpM = CREAMPIE_RE.exec(w), cuM = CUPCAKE_RE.exec(w);
    if (cpM || cuM) {
      var ptype = cpM && cuM ? (cpM.index < cuM.index ? 'creampies' : 'cupcakes') : cpM ? 'creampies' : 'cupcakes';
      var pm = ptype === 'creampies' ? cpM : cuM;
      var pname = ptype === 'creampies' ? 'Oatmeal cream pies' : 'Cupcakes';
      if (CAKE_SIGNAL_RE.test(w.replace(pm[0], ' '))) {
        r.productType = 'cake';
        r.warnings.push(pname + ' were mentioned along with a cake – this is saved as a cake order. Add the ' + pname.toLowerCase() + ' as their own order if you like.');
      } else {
        r.productType = ptype;
        if (cpM && cuM) r.warnings.push('You mentioned both cupcakes and cream pies – this order is set to ' + pname.toLowerCase() + '. Add the other as a separate order.');
        var qb = QTY_BEFORE_RE.exec(w.slice(0, pm.index));
        var qStart = pm.index, flavStart = pm.index;
        if (qb) {
          var qPhrase = qb[0].slice(0, qb[0].length - qb[4].length);
          if (qb[1] || qb[2]) { var pq = parseQuantity(qPhrase); if (pq) { r.qty = pq.qty; r.qtyUnit = pq.unit; } }
          if (qb[3]) r.itemSize = sizeFor(qb[3], ptype);
          qStart = qb.index; flavStart = qb.index + qPhrase.length;
        }
        cutSpan(pm.index, pm.index + pm[0].length);
        if (flavStart > qStart) cutSpan(qStart, flavStart);
        if (r.qty === '') {
          // "cupcakes – three dozen", "2 dozen of them", "half a dozen"
          var qa = /\b(?:\d+(?:\.\d+)?|a|an|one)?\s*(?:and\s+a\s+half\s+)?dozen(?:\s+and\s+a\s+half)?\b|\bhalf\s+(?:a\s+)?dozen\b|\bbaker'?s\s+dozen\b/i.exec(w);
          if (qa) { var pq2 = parseQuantity(qa[0]); if (pq2) { r.qty = pq2.qty; r.qtyUnit = pq2.unit; } cut(qa[0]); }
        }
        if (!r.itemSize && (m = /\b(mini|minis|miniature|bite[- ]size(?:d)?|jumbo)\b/i.exec(w))) { r.itemSize = sizeFor(m[1], ptype); cut(m[0]); }
        if (ptype === 'creampies') {
          if ((m = /\b(?:not|no need to be|don'?t need to be|doesn'?t need to be)\s+(?:individually\s+)?wrapped\b|\bunwrapped\b/i.exec(w))) { r.wrapped = 'no'; cut(m[0]); }
          else if ((m = /\b(?:individually|separately|each\s+(?:one\s+)?)\s*(?:wrapped|bagged|packaged)\b|\bwrapped\s+(?:individually|separately)\b/i.exec(w))) { r.wrapped = 'yes'; cut(m[0]); }
          if ((m = /\b(?:in\s+)?(?:a\s+|an\s+)?((?:gift|bakery|white|clear|pink|cardboard|plastic|cellophane|cello|treat)\s+)?(box(?:es)?|trays?|platters?|bags?|tins?|containers?)(?:\s+of\s+(\d+))?\b/i.exec(w))) {
            r.packaging = cap(((m[1] || '') + m[2] + (m[3] ? ' of ' + m[3] : '')).toLowerCase()); cut(m[0]);
          }
        }
      }
    }

    // message on cake
    var msgRe1 = /\b(?:that\s+)?(?:says|saying|reads|reading|message(?:\s+(?:is|on\s+(?:the\s+)?cake|should\s+say|says|reads))?|inscription(?:\s+is)?|writ(?:e|ing)(?:\s+on\s+(?:it|top))?)\s*[:,]?\s*["“]([^"”]+)["”]/i;
    var msgRe2 = new RegExp('\\b(?:that\\s+)?(?:says|saying|reads|reading|message(?:\\s+(?:is|on\\s+(?:the\\s+)?cake|should\\s+say|says|reads))?|inscription(?:\\s+is)?|writ(?:e|ing)(?:\\s+on\\s+(?:it|top))?)\\s*[:,]?\\s+(.+?)' + STOP_LOOKAHEAD, 'i');
    if ((m = msgRe1.exec(w)) || (m = msgRe2.exec(w))) { r.message = clean(m[1]).replace(/^['"]|['"]$/g, ''); cut(m[0]); }

    // address / delivery
    var addrRe = new RegExp('\\b(?:deliver(?:ed|y|ing)?(?:\\s+it)?\\s+(?:to|at)|delivery\\s+address(?:\\s+is)?|address(?:\\s+is)?|drop(?:\\s+it)?\\s+off\\s+at)\\s+(.+?)' +
      STOP_LOOKAHEAD.replace("'at \\\\d', ", ''), 'i');
    var streetRe = /\b\d{1,6}\s+(?:[A-Za-z]+\s+){1,3}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|way|boulevard|blvd|place|pl|circle|cir|terrace|parkway|pkwy|highway|hwy|trail|loop)\b\.?(?:\s+(?:apt|apartment|unit|suite|#)\s*\w+)?/i;
    if ((m = addrRe.exec(w))) {
      var a = clean(m[1]);
      var sm = streetRe.exec(m[1]);
      if (sm && sm.index === 0) a = clean(m[1]);
      r.address = a; r.fulfillment = 'delivery'; cut(m[0]);
    } else if ((m = streetRe.exec(w))) { r.address = clean(m[0]); r.fulfillment = 'delivery'; cut(m[0]); }

    // money
    var moneyRe = /\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)|\b(\d{1,5}(?:\.\d{1,2})?)\s*(?:dollars?|bucks|usd)\b/gi;
    var amounts = [];
    while ((m = moneyRe.exec(w))) amounts.push({ v: parseFloat((m[1] || m[2]).replace(/,/g, '')), i: m.index, e: m.index + m[0].length, s: m[0] });
    // bare numbers after keywords ("price 85", "deposit 20", "20 deposit")
    var kwRe = /\b(price|total|cost|costs|charging|charge|deposit|balance)(?:\s+(?:is|of|will be|was))?\s+(\d{1,5}(?:\.\d{1,2})?)\b(?!\s*(?:inch|tier|people|serv|pm|am|th|st|nd|rd))/gi;
    while ((m = kwRe.exec(w))) {
      var ni = m.index + m[0].lastIndexOf(m[2]);
      if (!amounts.some(function (x) { return ni >= x.i && ni < x.e; })) amounts.push({ v: parseFloat(m[2]), i: ni, e: ni + m[2].length, s: m[2] });
    }
    var kwRe2 = /\b(?:paid|put down|gave (?:me|us))\s+(?:me\s+|us\s+)?(\d{1,5}(?:\.\d{1,2})?)\b(?!\s*(?:inch|tier|people|serv|pm|am|th|st|nd|rd))|\b(\d{1,5}(?:\.\d{1,2})?)\s+(?:down|deposit)\b/gi;
    while ((m = kwRe2.exec(w))) {
      var num = m[1] || m[2], nj = m.index + m[0].indexOf(num);
      if (!amounts.some(function (x) { return nj >= x.i && nj < x.e; })) amounts.push({ v: parseFloat(num), i: nj, e: nj + num.length, s: num });
    }
    amounts.sort(function (x, y) { return x.i - y.i; });
    var balance = null;
    amounts.forEach(function (x) {
      var before = w.slice(Math.max(0, x.i - 40), x.i), after = w.slice(x.e, x.e + 30);
      if (/^\s*(?:dollars?\s+)?(?:non-?refundable\s+)?(?:deposit|down\b|retainer)(?!\s*(?:of|is|was)?\s*\$?\d)/i.test(after) ||
          /(?:deposit|down payment|paid|put down|retainer|gave me|already)(?:\s+(?:of|is|was|already|me|a|an|us))*\s*$/i.test(before)) x.kind = 'deposit';
      else if (/balance(?:\s+(?:due|of|is))*\s*$/i.test(before) || /^\s*(?:dollars?\s+)?balance/i.test(after)) x.kind = 'balance';
      else x.kind = 'price';
    });
    amounts.forEach(function (x) {
      if (/^\s*(?:dollars?\s+)?perdz\b/i.test(w.slice(x.e, x.e + 25))) { x.kind = 'perdozen'; if (r.pricePerDozen === '') r.pricePerDozen = x.v; }
      if (x.kind === 'deposit' && r.deposit === '') r.deposit = x.v;
      else if (x.kind === 'price' && r.price === '') r.price = x.v;
      else if (x.kind === 'balance' && balance === null) balance = x.v;
    });
    if (r.price === '' && balance !== null) r.price = balance + (r.deposit || 0);
    w = w.replace(/\bperdz\b/gi, ' | ');
    for (var ai = amounts.length - 1; ai >= 0; ai--) cutSpan(amounts[ai].i, amounts[ai].e);
    w = w.replace(/\b(?:non-?refundable\s+)?(?:deposit|down payment|retainer)(?:\s+(?:of|is|was))?\b|\b(?:price|total|cost|costs|charging)(?:\s+(?:is|of|will be))?\b|\bpaid\b(?:\s+(?:a|an))?|\bbalance(?:\s+due)?\b/gi, ' | ');

    // date & time
    var dt = parseDateTime(w, now, true);
    r.dueDate = dt.date; r.dueTime = dt.time; r.warnings = r.warnings.concat(dt.warnings);
    dt.spans.sort(function (x, y) { return y[0] - x[0]; }).forEach(function (s) { cutSpan(s[0], s[1]); });
    w = w.replace(/\b(?:due|for|on|by)\s+(?=\|)/gi, ' ');

    // customer name
    var nameExplicit = /\b(?:customer(?:'s)?(?:\s+name)?(?:\s+is)?|(?:her|his|their|the|my)\s+name\s+is|name(?:'s|\s+is)|order\s+for|this\s+is\s+for|it'?s\s+for|order\s+from|cake\s+order\s+from)\s*[:,]?\s+([A-Za-z][A-Za-z'-]+(?:\s+[A-Za-z][A-Za-z'-]+){0,2})/i;
    var nameIntro = /\b(?:this is|it's|it is|i'm|i am)\s+([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?)/;
    var nameWeak = /(?:\b(?:cake|cakes|cupcakes|pies|order)|\|)\s+for\s+(?:the\s+)?([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2})/;
    function takeName(str) {
      var words = str.split(/\s+/), keep = [];
      for (var k = 0; k < words.length && keep.length < 3; k++) {
        var wd = words[k].replace(/[^A-Za-z'-]/g, '');
        if (!wd || NAME_STOP.has(wd.toLowerCase()) || /\d/.test(words[k]) || /'s$/i.test(wd)) break;
        keep.push(wd);
        if (/[,.;|]$/.test(words[k])) break;
      }
      return keep.join(' ');
    }
    var nm = '';
    if ((m = nameExplicit.exec(w))) { nm = takeName(m[1]); if (nm) cut(m[0].slice(0, m[0].indexOf(m[1])) + nm); }
    if (!nm) {
      var lead = w.replace(/^[\s|,.]*(?:(?:ok(?:ay)?|so|um+|uh+|hi|hey|hello|alright|all right|new order|new cake|order|customer|name|the)[\s,.|]+)*/i, '');
      nm = takeName(lead.split(/[|,.;]/)[0].trim());
      if (nm) w = w.replace(new RegExp('\\b' + escRe(nm) + '\\b'), ' | ');
    }
    if (!nm && (m = nameIntro.exec(w))) { nm = takeName(m[1]); if (nm) cut(m[0]); }
    if (!nm && (m = nameWeak.exec(w))) {
      var cand2 = takeName(m[1]);
      if (cand2) { nm = cand2; w = w.replace(new RegExp('\\b' + escRe(cand2) + '\\b'), ' | '); }
    }
    r.name = nm ? titleCase(nm) : '';

    // size / servings / tiers / shape
    var sizes = [];
    var inchRe = /\b(\d{1,2}(?:\s*(?:,|and|&|\/)\s*\d{1,2})*)\s*(?:-\s*|\s)?(?:inch(?:es)?|in\.|")(?![a-z])/gi;
    while ((m = inchRe.exec(w))) sizes = sizes.concat(m[1].split(/\s*(?:,|and|&|\/)\s*/).filter(Boolean));
    w = w.replace(inchRe, ' | ');
    if (sizes.length) r.size = sizes.join(' & ') + ' inch';
    if ((m = /\b(quarter|half|full|1\/4|1\/2)\s+sheet\b/i.exec(w))) {
      r.size = cap(m[1].replace('1/4', 'quarter').replace('1/2', 'half').toLowerCase()) + ' sheet'; r.shape = 'Sheet'; cut(m[0]);
    }
    if ((m = /\b(\d+)\s+(dozen\s+)?(?:mini\s+)?cupcakes\b/i.exec(w))) {
      var cc = parseInt(m[1], 10) * (m[2] ? 12 : 1);
      r.size = (r.size ? r.size + ' + ' : '') + cc + ' cupcakes'; cut(m[0]);
    }
    if ((m = /\b(?:serves?|serving|feeds?|for)\s+(?:about\s+|around\s+|up\s+to\s+|roughly\s+)?(\d{1,3})(?:\s+(?:people|guests|persons|kids|adults|servings))?\b(?!\s*(?:am|pm|th|st|nd|rd|inch|tier|:))/i.exec(w)) &&
        (/serv|feed/i.test(m[0]) || /people|guests|persons|kids|adults|servings/i.test(m[0]))) { r.servings = parseInt(m[1], 10); cut(m[0]); }
    else if ((m = /\b(?:about\s+|around\s+)?(\d{1,3})\s+(?:servings|people|guests|persons|portions|slices)\b/i.exec(w))) { r.servings = parseInt(m[1], 10); cut(m[0]); }
    if ((m = /\b(\d)\s*(?:-\s*|\s)?tier(?:s|ed)?\b/i.exec(w))) { r.tiers = parseInt(m[1], 10); cut(m[0]); }
    else if ((m = /\b(single|double|triple)(?:\s*-?\s*)(?:tier(?:s|ed)?|layer)?\b/i.exec(w)) && /tier|double|triple/i.test(m[0])) {
      r.tiers = { single: 1, double: 2, triple: 3 }[m[1].toLowerCase()]; cut(m[0]);
    } else if ((m = /\btiers?\s*(?:is|of)?\s*(\d)\b/i.exec(w))) { r.tiers = parseInt(m[1], 10); cut(m[0]); }
    if (!r.tiers && sizes.length > 1) r.tiers = sizes.length;
    if ((m = /\b(round|square|rectangle|rectangular|heart(?:-?\s?shaped)?|oval|hexagon(?:al)?|number|letter|sheet|castle|carved)\b/i.exec(w))) {
      var sh = m[1].toLowerCase();
      if (!(sh === 'sheet' && r.shape)) r.shape = cap(sh.replace(/rectangular/, 'rectangle').replace(/heart.*/, 'heart').replace(/hexagonal/, 'hexagon'));
    }

    // filling
    function wordsBefore(idx, max) {
      var pre = w.slice(0, idx).split(/\s+/).filter(Boolean), got = [];
      for (var k = pre.length - 1; k >= 0 && got.length < max; k--) {
        var tok = pre[k];
        if (/[,.;|]$/.test(tok) && got.length) break;
        var tk = tok.replace(/[^A-Za-z'&-]/g, '').toLowerCase();
        if (!tk || new RegExp('^' + STOP_BOUND + '$').test(tk) || tk === 'filling' || tk === 'filled' || tk === 'inside' || /[,.;|]/.test(tok) || /\d/.test(tok)) break;
        got.unshift(tk);
      }
      while (got.length && /^(and|&)$/.test(got[0])) got.shift();
      return got;
    }
    function wordsAfter(idx, max) {
      var post = w.slice(idx).split(/\s+/).filter(Boolean), got = [];
      for (var k = 0; k < post.length && got.length < max; k++) {
        var tok = post[k], tk = tok.replace(/[^A-Za-z'&-]/g, '').toLowerCase();
        if (!tk || /^(with|a|an|the|cake|and|on|for|at|in|inside|filling|frosting|icing|buttercream|fondant|tier|tiers)$/.test(tk) || /\d/.test(tok)) break;
        got.push(tk);
        if (/[,.;|]$/.test(tok)) break;
      }
      return got;
    }
    if ((m = /\bfilling\b/i.exec(w))) {
      var fw = wordsBefore(m.index, 4);
      if (fw.length) { r.filling = cap(fw.join(' ')); var fs = w.slice(0, m.index).lastIndexOf(fw[0]); cutSpan(fs, m.index + m[0].length); }
      else {
        var fa = /\bfilling\s+(?:is\s+|of\s+)?/i.exec(w), fw2 = fa ? wordsAfter(fa.index + fa[0].length, 4) : [];
        if (fw2.length) { r.filling = cap(fw2.join(' ')); cut(new RegExp(escRe(fa[0]) + '\\s*' + fw2.map(escRe).join('\\W+'), 'i')); }
      }
    } else if ((m = /\b(?:filled with|with a|with)\s+/i.exec(w)) && /filled/i.test(m[0])) {
      var fw3 = wordsAfter(m.index + m[0].length, 4);
      if (fw3.length) { r.filling = cap(fw3.join(' ')); cut(new RegExp(escRe(m[0]) + fw3.map(escRe).join('\\W+'), 'i')); }
    }

    // frosting (+ colors mentioned before it)
    var colorsFound = [];
    if ((m = FROSTINGS_RE.exec(w))) {
      var pre = wordsBefore(m.index, 3), keepW = [];
      pre.forEach(function (pw) {
        if (PURE_COLORS.indexOf(pw) !== -1 && pw !== 'white' || (pw === 'white' && !/chocolate/.test(m[1]))) colorsFound.push(pw);
        else keepW.push(pw);
      });
      var kw = m[1].toLowerCase().replace('butter cream', 'buttercream');
      r.frosting = cap((keepW.length ? keepW.join(' ') + ' ' : '') + kw);
      var st = pre.length ? w.slice(0, m.index).lastIndexOf(pre[0]) : m.index;
      cutSpan(st, m.index + m[0].length);
    }

    // flavor
    var flavRe = new RegExp('\\b(' + FLAVORS.map(escRe).join('|') + ')\\b', 'gi');
    var fl = [];
    while ((m = flavRe.exec(w))) fl.push({ s: m[1].toLowerCase(), i: m.index, e: m.index + m[0].length });
    var flm = /\bflavou?r(?:\s+is|\s+of)?\s+/i.exec(w);
    if (flm) {
      var fAfter = wordsAfter(flm.index + flm[0].length, 3);
      if (fAfter.length) r.flavor = cap(fAfter.join(' '));
    }
    if (!r.flavor && fl.length) {
      // skip pure color words that are also flavors ("white", "orange", "yellow") when followed by color context
      var first = fl[0], flav = first.s;
      if (fl[1] && /^\s*(?:and|&|\/|or|half|with a hint of)\s*(?:half\s+)?$/i.test(w.slice(first.e, fl[1].i))) {
        flav = first.s + ' & ' + fl[1].s;
        if (fl[2] && /^\s*$/.test(w.slice(fl[1].e, fl[2].i))) flav += ' ' + fl[2].s;
      }
      r.flavor = cap(flav.replace(/ cake$/, ''));
      var lastF = fl[0];
      fl.forEach(function (x) { if (r.flavor.toLowerCase().indexOf(x.s) !== -1) lastF = x; });
      cutSpan(first.i, lastF.e);
    }

    // occasion
    var lw = w.toLowerCase(), best = null, generic = { party: 1, shower: 1, 'smash cake': 1 };
    OCCASIONS.forEach(function (oc) {
      var om = new RegExp("\\b(?:(\\d{1,3}(?:st|nd|rd|th))\\s+)?" + escRe(oc[0]) + "\\b").exec(lw);
      if (!om) return;
      var cand = { oc: oc, m: om, g: generic[oc[0]] ? 1 : 0 };
      if (!best || cand.g < best.g || (cand.g === best.g && (om.index < best.m.index || (om.index === best.m.index && om[0].length > best.m[0].length)))) best = cand;
    });
    if (best) {
      r.occasion = (best.m[1] ? best.m[1] + ' ' : '') + best.oc[1];
      cutSpan(best.m.index, best.m.index + best.m[0].length);
      if (best.oc[0] !== 'smash cake' && /\bsmash cake\b/i.test(w)) { r.size = r.size ? r.size + ' (smash cake)' : 'Smash cake'; w = w.replace(/\bsmash cake\b/i, ' | '); }
    }

    // allergies / dietary
    var allergies = [];
    var alRe = /\b((?:peanut|tree nut|nut|gluten|dairy|egg|soy|sugar|lactose|wheat)[- ]free)\b|\bno (nuts|peanuts|dairy|eggs|gluten|soy)\b|\b(vegan|vegetarian|celiac|coeliac|kosher|halal|diabetic)\b|\b(peanut|tree nut|nut|egg|dairy|gluten|soy|shellfish|sesame|wheat|milk) allerg(?:y|ies)\b/gi;
    while ((m = alRe.exec(w))) {
      if (m[1]) allergies.push(m[1].toLowerCase().replace(' ', '-'));
      else if (m[2]) allergies.push('no ' + m[2].toLowerCase());
      else if (m[3]) allergies.push(m[3].toLowerCase());
      else if (m[4]) allergies.push(m[4].toLowerCase() + ' allergy');
    }
    w = w.replace(alRe, ' | ');
    var alRe2 = new RegExp('\\ballerg(?:ic|y|ies)\\s+(?:is\\s+|to\\s+|are\\s+)?(.+?)' + STOP_LOOKAHEAD, 'i');
    if ((m = alRe2.exec(w))) { allergies.push('allergic to ' + clean(m[1]).toLowerCase()); cut(m[0]); }
    r.allergies = allergies.filter(function (x, i, arr) { return arr.indexOf(x) === i; }).join(', ');

    // pickup / delivery
    if (!r.fulfillment) {
      if (/\b(pick\s?-?\s?up|picking (?:it )?up|pick (?:it|them) up|will pick|collect(?:ing|ion)?)\b/i.test(w)) r.fulfillment = 'pickup';
      else if (/\bdeliver(?:y|ed|ing)?\b/i.test(w)) r.fulfillment = 'delivery';
    }
    w = w.replace(/\b(?:for\s+)?(pick\s?-?\s?up|picking (?:it )?up|pick (?:it|them) up|delivery|deliver(?:ed|ing)?)\b/gi, ' | ');

    // cupcake liners / wrappers ("blue and white liners", "gold foil wrappers")
    if (r.productType === 'cupcakes' && (m = /\b(?:cupcake\s+)?(?:liners?|wrappers?|cups)\b/i.exec(w))) {
      var lwords = w.slice(0, m.index).split(/\s+/).filter(Boolean), lk = [], LOK = PURE_COLORS.concat(AMBIG_COLORS, ['foil', 'metallic', 'polka', 'dot', 'dots', 'striped', 'floral', 'paper', 'glitter', 'sparkly', 'and', '&']);
      for (var li = lwords.length - 1; li >= 0 && lk.length < 6; li--) {
        var lt = lwords[li].replace(/[^A-Za-z&-]/g, '').toLowerCase();
        if (!lt || /[,.;|]$/.test(lwords[li]) && lk.length || LOK.indexOf(lt) === -1) break;
        lk.unshift(lt);
      }
      while (lk.length && /^(and|&)$/.test(lk[0])) lk.shift();
      r.liners = cap(lk.join(' '));
      var ls = lk.length ? w.slice(0, m.index).lastIndexOf(lk[0]) : m.index;
      cutSpan(ls, m.index + m[0].length);
    }

    // colors & design
    var colRe = new RegExp('\\b(' + PURE_COLORS.concat(AMBIG_COLORS).map(escRe).join('|') + ')\\b', 'gi');
    while ((m = colRe.exec(w))) {
      var c = m[1].toLowerCase();
      if (AMBIG_COLORS.indexOf(c) !== -1 && !/^\s*(?:and|&|,|colou?rs?|theme|accents?)/i.test(w.slice(m.index + m[0].length, m.index + m[0].length + 10)) &&
          !/(?:and|&|,)\s*$/.test(w.slice(Math.max(0, m.index - 6), m.index))) continue;
      colorsFound.push(c);
    }
    var design = [];
    var uniqColors = colorsFound.filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    if (uniqColors.length) design.push(cap(uniqColors.join(', ')));
    var themeRe = /\b((?:[a-z]+\s+){0,2}?[a-z]+)\s+(?:theme|themed)\b/gi;
    while ((m = themeRe.exec(w))) {
      var th = m[1].toLowerCase().split(' ').filter(function (x) { return !/^(a|an|the|with|and|colou?rs?)$/.test(x) && PURE_COLORS.indexOf(x) === -1; }).join(' ');
      if (th) design.push(cap(th) + ' theme');
    }
    var decoRe = new RegExp('\\b(?:decorated with|decorations?(?:\\s+(?:of|are|is))?|with (?:a |some )?(?=(?:[a-z]+\\s+){0,3}?(?:topper|drip|sprinkles|flowers|roses|macarons|pearls|balloons|stars|butterflies|dinosaurs?|unicorn|figures?)\\b))\\s*(.+?)' + STOP_LOOKAHEAD, 'gi');
    while ((m = decoRe.exec(w))) {
      var dd2 = clean(m[1]);
      if (dd2 && dd2.length < 80) design.push(cap(dd2));
    }
    if (!/topper/i.test(design.join(' ')) && (m = /\b((?:[a-z]+\s+){0,2}?)(toppers?|picks)\b/i.exec(w))) {
      var tp = m[1].trim().split(/\s+/).filter(function (x) { return x && !/^(a|an|the|with|and|some|on|top|of)$/i.test(x); });
      design.push(cap((tp.length ? tp.join(' ') + ' ' : '') + m[2].toLowerCase())); cut(m[0]);
    }
    r.design = design.join('; ');

    // notes
    var noteRe = /\b(?:notes?(?:\s+that)?|also note|special request(?:s)?)\s*[:,]?\s+(.+?)(?=[.;|]|$)/i;
    if ((m = noteRe.exec(w))) r.customerNotes = cap(clean(m[1]));

    if ((r.productType === 'cupcakes' || r.productType === 'creampies') && /\b(?:bulk|group\s+order|fundraiser|everyone'?s\s+orders?|sign[- ]?up\s+(?:sheet|list))\b/i.test(text)) {
      r.bulk = true; r.qty = ''; r.warnings.push('Bulk order – add each person on the order page after saving.');
    } else if (r.pricePerDozen !== '' && r.price === '' && r.qty !== '' && r.qtyUnit === 'dozen') r.price = Math.round(r.qty * r.pricePerDozen * 100) / 100;
    if (!r.dueDate) r.warnings.push('No date found – please pick the due date.');
    if (!r.name) r.warnings.push('No customer name found.');
    r._rest = clean(w.replace(/\|/g, ' '));
    return r;
  }

  var api = { parseOrder: parseOrder, parseDateTime: parseDateTime, wordsToNumbers: wordsToNumbers, normalizeText: normalizeText,
    normalizeSpokenEmail: normalizeSpokenEmail, formatPhone: formatPhone, extractNumber: extractNumber, isoDate: isoDate, parseQuantity: parseQuantity, parseBulkLine: parseBulkLine, parseBulkList: parseBulkList };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CakeParser = api;
})(this);
