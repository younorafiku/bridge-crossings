/* Bridge Crossings tracker: pure logic, no DOM.
 * Used by index.html in the browser and by test.js in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tracker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Brand field colours first, then more hues that stay readable on the navy ground.
  var PALETTE = [
    '#E68364', '#F1BF5B', '#B5D45A', '#65C49A', '#4FC8D6', '#72BFE7', '#7C9BF0',
    '#A789DB', '#D08BD9', '#E8749E', '#F0A07C', '#E8DE8A', '#8EE0C2', '#9FB4C7'
  ];

  var MAX_STEPS = 12;
  var MAX_PEOPLE = 200;
  var MAX_CATEGORIES = 8;

  function toInt(v, def) { var n = parseInt(v, 10); return isFinite(n) ? n : def; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function clip(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function validColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }

  function isoDate(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function addDays(iso, days) {
    var p = iso.split('-').map(Number);
    return isoDate(new Date(p[0], p[1] - 1, p[2] + days));
  }
  function daysBetween(fromIso, toIso) {
    var a = fromIso.split('-').map(Number), b = toIso.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }

  function makeId(prefix) { return (prefix || 'p') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function cleanSteps(list) {
    return (Array.isArray(list) ? list : []).map(function (s) { return clip(s, 40); }).filter(Boolean).slice(0, MAX_STEPS);
  }

  // Categories are groups of people who follow the same steps (filming, editing...).
  // A file from the first version has one list of steps for everyone: it becomes one category.
  function normalizeCategories(d) {
    var cats = [], seen = {};
    (Array.isArray(d.categories) ? d.categories : []).slice(0, MAX_CATEGORIES).forEach(function (c, i) {
      if (!c || typeof c !== 'object') return;
      var name = clip(c.name, 30);
      if (!name) return;
      var id = clip(c.id, 40) || 'c' + i;
      while (seen[id]) id += '_';
      seen[id] = true;
      var steps = cleanSteps(c.steps);
      cats.push({
        id: id,
        name: name,
        cycleName: clip(c.cycleName, 24) || 'reel',
        cyclePlural: clip(c.cyclePlural, 24),
        defaultDays: clamp(toInt(c.defaultDays, 0), 0, 60),
        steps: steps.length ? steps : ['Done']
      });
    });
    if (!cats.length) {
      var legacy = cleanSteps(d.steps);
      cats.push({
        id: 'main',
        name: 'Filming',
        cycleName: clip(d.cycleName, 24) || 'reel',
        cyclePlural: clip(d.cyclePlural, 24),
        defaultDays: clamp(toInt(d.defaultDays, 0), 0, 60),
        steps: legacy.length ? legacy : ['Hook', 'Film']
      });
    }
    return cats;
  }

  // Make any parsed JSON safe and consistent. Also rolls a bar that is past the
  // last step into a finished cycle (needed when the number of steps shrinks).
  function normalize(raw) {
    var d = raw && typeof raw === 'object' ? raw : {};
    var cats = normalizeCategories(d);
    var byId = {};
    cats.forEach(function (c) { byId[c.id] = c; });
    var out = {
      rev: Math.max(0, toInt(d.rev, 0)),
      title: clip(d.title, 40) || 'Bridge Crossings',
      subtitle: clip(d.subtitle, 40) || 'Progress',
      about: typeof d.about === 'string' ? d.about.trim().slice(0, 600) : '',
      categories: cats,
      people: [],
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : ''
    };
    (Array.isArray(d.people) ? d.people : []).slice(0, MAX_PEOPLE).forEach(function (p, i) {
      if (!p || typeof p !== 'object') return;
      var name = clip(p.name, 40);
      if (!name) return;
      var cat = byId[p.categoryId] || cats[0];
      var n = cat.steps.length;
      var cycles = Math.max(0, toInt(p.cycles, 0));
      var done = Math.max(0, toInt(p.done, 0));
      if (done >= n) { cycles += Math.floor(done / n); done = done % n; }
      out.people.push({
        id: clip(p.id, 40) || 'p' + i,
        name: name,
        categoryId: cat.id,
        color: validColor(p.color) ? p.color : PALETTE[i % PALETTE.length],
        cycles: cycles,
        done: done,
        deadline: validDate(p.deadline) ? p.deadline : '',
        progressAt: typeof p.progressAt === 'string' ? p.progressAt : ''
      });
    });
    return out;
  }

  function findCategory(d, id) {
    for (var i = 0; i < d.categories.length; i++) if (d.categories[i].id === id) return d.categories[i];
    return null;
  }
  function categoryOf(d, p) { return findCategory(d, p.categoryId) || d.categories[0]; }

  function cycleLabel(cat, count) {
    return count === 1 ? cat.cycleName : (cat.cyclePlural || cat.cycleName + 's');
  }

  function started(p) { return p.cycles > 0 || p.done > 0; }

  // Most finished cycles first, then the bar, then whoever got there first, then name.
  function compare(a, b) {
    if (a.cycles !== b.cycles) return b.cycles - a.cycles;
    if (a.done !== b.done) return b.done - a.done;
    var ta = a.progressAt || '', tb = b.progressAt || '';
    if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return a.name.localeCompare(b.name);
  }

  // [{person, rank}] for one category, top to bottom. People who have not started get rank 0.
  function ranked(d, categoryId) {
    var r = 0;
    return d.people.filter(function (p) { return p.categoryId === categoryId; }).sort(compare).map(function (p) {
      return { person: p, rank: started(p) ? ++r : 0 };
    });
  }

  // One block per category, in the saved order.
  function sections(d) {
    return d.categories.map(function (c) {
      var items = ranked(d, c.id), total = 0;
      items.forEach(function (it) { total += it.person.cycles; });
      return { category: c, items: items, cycles: total };
    });
  }

  function personView(d, p) {
    var cat = categoryOf(d, p), n = cat.steps.length;
    return {
      cycles: p.cycles,
      done: p.done,
      n: n,
      frac: p.done / n,
      pct: Math.round(p.done / n * 100),
      next: cat.steps[p.done]
    };
  }

  function deadlineInfo(deadline, today) {
    if (!deadline) return { state: 'none', days: 0 };
    var days = daysBetween(today, deadline);
    return { state: days < 0 ? 'late' : days === 0 ? 'today' : days <= 2 ? 'soon' : 'ok', days: days };
  }

  function summary(d) {
    var total = 0;
    d.people.forEach(function (p) { total += p.cycles; });
    return { people: d.people.length, cycles: total, categories: d.categories.length };
  }

  function nextColor(d) {
    var used = {};
    d.people.forEach(function (p) { used[p.color.toUpperCase()] = true; });
    for (var i = 0; i < PALETTE.length; i++) if (!used[PALETTE[i].toUpperCase()]) return PALETTE[i];
    return PALETTE[d.people.length % PALETTE.length];
  }

  // Name search: ignores capitals and accents, every word typed must appear in the name.
  function fold(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function matchName(name, query) {
    var words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    var n = fold(name);
    return words.every(function (w) { return n.indexOf(w) !== -1; });
  }

  // Admin-only ways to order the rows. The public page is always in rank order.
  var SORTS = [
    { id: 'rank', label: 'Rank' },
    { id: 'deadline', label: 'Closest deadline' },
    { id: 'step', label: 'Next step' },
    { id: 'name', label: 'Name' },
    { id: 'quiet', label: 'Waiting longest' }
  ];

  function validSort(id) {
    return SORTS.some(function (s) { return s.id === id; }) ? id : 'rank';
  }

  // Compare two optional values: the ones that have a value come first (or last, when `emptyFirst`).
  function byValue(x, y, emptyFirst) {
    if (x && y) return x === y ? 0 : x < y ? -1 : 1;
    if (!x && !y) return 0;
    return (x ? -1 : 1) * (emptyFirst ? -1 : 1);
  }

  var SORT_FNS = {
    // Late first, then soonest. No deadline goes last.
    deadline: function (a, b) { return byValue(a.deadline, b.deadline, false); },
    // Everyone whose next step is the first one together, then the second one, and so on.
    step: function (a, b) { return a.done - b.done; },
    name: function (a, b) { return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }); },
    // Longest since the last step was marked. Someone with no progress at all counts as waiting longest.
    quiet: function (a, b) { return byValue(a.progressAt, b.progressAt, true); }
  };

  // items: [{person, rank}] in rank order. Returns a new array. Ties keep the rank order.
  function sortItems(items, mode) {
    var fn = SORT_FNS[validSort(mode)];
    if (!fn) return items.slice();
    return items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) { return fn(a.it.person, b.it.person) || a.i - b.i; })
      .map(function (x) { return x.it; });
  }

  function find(d, id) {
    for (var i = 0; i < d.people.length; i++) if (d.people[i].id === id) return d.people[i];
    return null;
  }

  // Every change is an operation, so it can be replayed on top of the latest saved data.
  var OPS = {
    addPerson: function (d, a) {
      if (d.people.length >= MAX_PEOPLE) return;
      var name = clip(a.name, 40);
      if (!name) return;
      var cat = findCategory(d, a.categoryId) || d.categories[0];
      d.people.push({
        id: clip(a.id, 40) || makeId(),
        name: name,
        categoryId: cat.id,
        color: validColor(a.color) ? a.color : nextColor(d),
        cycles: 0,
        done: 0,
        deadline: validDate(a.deadline) ? a.deadline : '',
        progressAt: ''
      });
    },

    stepDone: function (d, a, ctx) {
      var p = find(d, a.id);
      if (!p) return;
      var cat = categoryOf(d, p), n = cat.steps.length;
      p.done += 1;
      if (p.done >= n) { p.cycles += 1; p.done = 0; }
      p.progressAt = ctx.now;
      p.deadline = cat.defaultDays > 0 ? addDays(ctx.today, cat.defaultDays) : '';
    },

    undoStep: function (d, a) {
      var p = find(d, a.id);
      if (!p) return;
      var n = categoryOf(d, p).steps.length;
      if (p.done > 0) p.done -= 1;
      else if (p.cycles > 0) { p.cycles -= 1; p.done = n - 1; }
    },

    setDeadline: function (d, a) {
      var p = find(d, a.id);
      if (p) p.deadline = validDate(a.deadline) ? a.deadline : '';
    },

    editPerson: function (d, a, ctx) {
      var p = find(d, a.id);
      if (!p) return;
      var name = clip(a.name, 40);
      if (name) p.name = name;
      if (validColor(a.color)) p.color = a.color;
      p.deadline = validDate(a.deadline) ? a.deadline : '';
      var cat = findCategory(d, a.categoryId);
      var moved = !!cat && cat.id !== p.categoryId;
      var cycles = Math.max(0, toInt(a.cycles, moved ? 0 : p.cycles));
      var done = Math.max(0, toInt(a.done, moved ? 0 : p.done));
      if (moved || cycles !== p.cycles || done !== p.done) {
        if (moved) p.categoryId = cat.id;
        p.cycles = cycles;
        p.done = done;
        p.progressAt = (cycles > 0 || done > 0) ? ctx.now : '';
      }
    },

    removePerson: function (d, a) {
      d.people = d.people.filter(function (p) { return p.id !== a.id; });
    },

    saveSettings: function (d, a) {
      var title = clip(a.title, 40); if (title) d.title = title;
      d.subtitle = clip(a.subtitle, 40) || d.subtitle;
      d.about = typeof a.about === 'string' ? a.about.trim().slice(0, 600) : d.about;
    },

    // Adds the category when the id is new, otherwise changes it.
    saveCategory: function (d, a) {
      var name = clip(a.name, 30);
      var steps = cleanSteps(a.steps);
      if (!name || !steps.length) return;
      var cat = findCategory(d, a.id);
      if (!cat) {
        if (d.categories.length >= MAX_CATEGORIES) return;
        cat = { id: clip(a.id, 40) || makeId('c') };
        d.categories.push(cat);
      }
      cat.name = name;
      cat.steps = steps;
      cat.cycleName = clip(a.cycleName, 24) || cat.cycleName || 'reel';
      cat.cyclePlural = clip(a.cyclePlural, 24);
      cat.defaultDays = clamp(toInt(a.defaultDays, cat.defaultDays || 0), 0, 60);
    },

    // Only an empty category can go, and one must always remain.
    removeCategory: function (d, a) {
      if (d.categories.length < 2) return;
      if (d.people.some(function (p) { return p.categoryId === a.id; })) return;
      d.categories = d.categories.filter(function (c) { return c.id !== a.id; });
    },

    moveCategory: function (d, a) {
      var i = -1;
      d.categories.forEach(function (c, k) { if (c.id === a.id) i = k; });
      var j = i + (a.dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= d.categories.length) return;
      var t = d.categories[i]; d.categories[i] = d.categories[j]; d.categories[j] = t;
    }
  };

  // ctx = { now: ISO timestamp, today: 'YYYY-MM-DD' }. Returns new data; the input is not changed.
  function run(d, op, args, ctx) {
    var fn = OPS[op];
    if (!fn) throw new Error('Unknown operation: ' + op);
    var base = normalize(d);
    var c = clone(base);
    fn(c, args || {}, ctx);
    var out = normalize(c);
    out.rev = base.rev + 1;
    out.updatedAt = ctx.now;
    return out;
  }

  return {
    PALETTE: PALETTE, MAX_STEPS: MAX_STEPS, MAX_CATEGORIES: MAX_CATEGORIES,
    normalize: normalize, run: run, ranked: ranked, sections: sections, personView: personView,
    categoryOf: categoryOf, cycleLabel: cycleLabel, deadlineInfo: deadlineInfo, summary: summary,
    nextColor: nextColor, makeId: makeId, isoDate: isoDate, addDays: addDays, validDate: validDate,
    matchName: matchName, SORTS: SORTS, validSort: validSort, sortItems: sortItems
  };
});
