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

  function toInt(v, def) { var n = parseInt(v, 10); return isFinite(n) ? n : def; }
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

  function makeId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Make any parsed JSON safe and consistent. Also rolls a bar that is past the
  // last step into a finished cycle (needed when the number of steps shrinks).
  function normalize(raw) {
    var d = raw && typeof raw === 'object' ? raw : {};
    var steps = (Array.isArray(d.steps) ? d.steps : [])
      .map(function (s) { return clip(s, 40); })
      .filter(Boolean)
      .slice(0, MAX_STEPS);
    var n = steps.length;
    var out = {
      rev: Math.max(0, toInt(d.rev, 0)),
      title: clip(d.title, 40) || 'Bridge Crossings',
      subtitle: clip(d.subtitle, 40) || 'Progress',
      about: typeof d.about === 'string' ? d.about.trim().slice(0, 600) : '',
      cycleName: clip(d.cycleName, 24) || 'reel',
      cyclePlural: clip(d.cyclePlural, 24),
      defaultDays: Math.min(60, Math.max(0, toInt(d.defaultDays, 0))),
      steps: steps,
      people: [],
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : ''
    };
    (Array.isArray(d.people) ? d.people : []).slice(0, MAX_PEOPLE).forEach(function (p, i) {
      if (!p || typeof p !== 'object') return;
      var name = clip(p.name, 40);
      if (!name) return;
      var cycles = Math.max(0, toInt(p.cycles, 0));
      var done = Math.max(0, toInt(p.done, 0));
      if (n === 0) done = 0;
      else if (done >= n) { cycles += Math.floor(done / n); done = done % n; }
      out.people.push({
        id: clip(p.id, 40) || 'p' + i,
        name: name,
        color: validColor(p.color) ? p.color : PALETTE[i % PALETTE.length],
        cycles: cycles,
        done: done,
        deadline: validDate(p.deadline) ? p.deadline : '',
        progressAt: typeof p.progressAt === 'string' ? p.progressAt : ''
      });
    });
    return out;
  }

  function cycleLabel(d, count) {
    return count === 1 ? d.cycleName : (d.cyclePlural || d.cycleName + 's');
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

  // [{person, rank}] from top to bottom. People who have not started get rank 0.
  function ranked(d) {
    var r = 0;
    return d.people.slice().sort(compare).map(function (p) {
      return { person: p, rank: started(p) ? ++r : 0 };
    });
  }

  function personView(d, p) {
    var n = d.steps.length;
    return {
      cycles: p.cycles,
      done: p.done,
      n: n,
      frac: n ? p.done / n : 0,
      pct: n ? Math.round(p.done / n * 100) : 0,
      next: n ? d.steps[p.done] : ''
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
    return { people: d.people.length, cycles: total };
  }

  function nextColor(d) {
    var used = {};
    d.people.forEach(function (p) { used[p.color.toUpperCase()] = true; });
    for (var i = 0; i < PALETTE.length; i++) if (!used[PALETTE[i].toUpperCase()]) return PALETTE[i];
    return PALETTE[d.people.length % PALETTE.length];
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
      d.people.push({
        id: clip(a.id, 40) || makeId(),
        name: name,
        color: validColor(a.color) ? a.color : nextColor(d),
        cycles: 0,
        done: 0,
        deadline: validDate(a.deadline) ? a.deadline : '',
        progressAt: ''
      });
    },

    stepDone: function (d, a, ctx) {
      var p = find(d, a.id), n = d.steps.length;
      if (!p || !n) return;
      p.done += 1;
      if (p.done >= n) { p.cycles += 1; p.done = 0; }
      p.progressAt = ctx.now;
      p.deadline = d.defaultDays > 0 ? addDays(ctx.today, d.defaultDays) : '';
    },

    undoStep: function (d, a) {
      var p = find(d, a.id), n = d.steps.length;
      if (!p || !n) return;
      if (p.done > 0) p.done -= 1;
      else if (p.cycles > 0) { p.cycles -= 1; p.done = n - 1; }
    },

    editPerson: function (d, a, ctx) {
      var p = find(d, a.id);
      if (!p) return;
      var name = clip(a.name, 40);
      if (name) p.name = name;
      if (validColor(a.color)) p.color = a.color;
      p.deadline = validDate(a.deadline) ? a.deadline : '';
      var cycles = Math.max(0, toInt(a.cycles, p.cycles));
      var done = Math.max(0, toInt(a.done, p.done));
      if (cycles !== p.cycles || done !== p.done) {
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
      var cn = clip(a.cycleName, 24); if (cn) d.cycleName = cn;
      d.cyclePlural = clip(a.cyclePlural, 24);
      d.defaultDays = Math.min(60, Math.max(0, toInt(a.defaultDays, d.defaultDays)));
      if (Array.isArray(a.steps)) {
        var steps = a.steps.map(function (s) { return clip(s, 40); }).filter(Boolean).slice(0, MAX_STEPS);
        if (steps.length) d.steps = steps;
      }
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
    PALETTE: PALETTE, MAX_STEPS: MAX_STEPS,
    normalize: normalize, run: run, ranked: ranked, personView: personView,
    cycleLabel: cycleLabel, deadlineInfo: deadlineInfo, summary: summary,
    nextColor: nextColor, makeId: makeId, isoDate: isoDate, addDays: addDays, validDate: validDate
  };
});
