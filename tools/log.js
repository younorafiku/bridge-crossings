#!/usr/bin/env node
/* Bridge Crossings: log changes by name, and work out the calendar entries for the deadlines.
 *
 *   node tools/log.js data.json show
 *   node tools/log.js data.json sync
 *   node tools/log.js data.json '[{"do":"done","name":"Hiba"}]' [--write] [--today=YYYY-MM-DD]
 *
 * Every action is applied to a copy of the data. If any action fails, nothing is changed.
 * The rules are the same as on the page, because the changes go through logic.js.
 *
 * Actions (names match ignoring capitals and accents; part of a name is enough when it is unique):
 *   {"do":"add", "name", "category"?, "deadline"?, "color"?}
 *   {"do":"done", "name", "step"?, "through"?, "times"?}   marks the next step done
 *   {"do":"undo", "name"}
 *   {"do":"deadline", "name", "date"}                       date is YYYY-MM-DD, or "" to clear
 *   {"do":"edit", "name", "newName"?, "category"?, "color"?, "cycles"?, "done"?, "deadline"?}
 *   {"do":"remove", "name"}
 *   {"do":"category", "name", "newName"?, "steps"?, "cycleName"?, "cyclePlural"?, "defaultDays"?}
 *   {"do":"op", "op", "args"}                               any operation from logic.js
 */
'use strict';

const fs = require('fs');
const T = require('../logic.js');

const SITE = 'https://younorafiku.github.io/bridge-crossings/';

function fold(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ---------- finding things by name ----------
function pick(list, query, label, nameOf) {
  const q = fold(query);
  if (!q) throw new Error('A ' + label + ' name is needed.');
  const exact = list.filter((x) => fold(nameOf(x)) === q);
  if (exact.length === 1) return exact[0];
  let hits = exact;
  if (!hits.length) {
    const words = q.split(' ');
    hits = list.filter((x) => words.every((w) => fold(nameOf(x)).indexOf(w) !== -1));
  }
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error('No ' + label + ' matches "' + query + '". Options: ' + (list.map(nameOf).join(', ') || 'none yet') + '.');
  throw new Error('"' + query + '" matches ' + hits.map(nameOf).join(', ') + '. Which one?');
}

function resolvePerson(d, name) { return pick(d.people, name, 'person', (p) => p.name); }
function resolveCategory(d, name) { return pick(d.categories, name, 'category', (c) => c.name); }
function findById(d, id) { return d.people.filter((p) => p.id === id)[0] || null; }

function resolveStep(cat, step) {
  const q = fold(step);
  let hits = cat.steps.map((s, i) => i).filter((i) => fold(cat.steps[i]) === q);
  if (!hits.length) hits = cat.steps.map((s, i) => i).filter((i) => fold(cat.steps[i]).indexOf(q) !== -1);
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error('No step matches "' + step + '". Steps: ' + cat.steps.join(', ') + '.');
  throw new Error('"' + step + '" matches more than one step: ' + hits.map((i) => cat.steps[i]).join(', ') + '.');
}

// '' (or "clear") removes a deadline; anything else must be a real date.
function dateArg(v) {
  if (v == null || v === '' || fold(v) === 'clear' || fold(v) === 'none') return '';
  if (!T.validDate(v)) throw new Error('"' + v + '" is not a date. Use YYYY-MM-DD.');
  return v;
}

function describe(d, p) {
  const cat = T.categoryOf(d, p), v = T.personView(d, p);
  return p.name + ': ' + p.cycles + ' ' + T.cycleLabel(cat, p.cycles) + ' finished, bar ' + v.pct + '% (' + v.done + ' of ' + v.n +
    ' steps), next step "' + v.next + '", deadline ' + (p.deadline || 'none');
}

// ---------- calendar entries ----------
// One all-day entry per person who has a deadline. `end` is the day after, as Google Calendar wants.
function calendarEntries(d) {
  const out = {};
  d.people.forEach((p) => {
    if (!p.deadline) return;
    const cat = T.categoryOf(d, p), v = T.personView(d, p);
    out[p.id] = {
      id: p.id,
      name: p.name,
      title: p.name + ': ' + v.next + ' due',
      start: p.deadline,
      end: T.addDays(p.deadline, 1),
      description: cat.name + ', next step for ' + p.name + ' in Bridge Crossings.\n' + SITE
    };
  });
  return out;
}

function calendarPlan(before, after) {
  const plan = { create: [], update: [], delete: [] };
  Object.keys(after).forEach((id) => {
    const a = after[id], b = before[id];
    if (!b) plan.create.push(a);
    else if (a.title !== b.title || a.start !== b.start || a.description !== b.description) plan.update.push(a);
  });
  Object.keys(before).forEach((id) => {
    if (!after[id]) plan.delete.push({ id: id, name: before[id].name, title: before[id].title, start: before[id].start });
  });
  return plan;
}

// ---------- applying actions ----------
function apply(data, actions, ctx) {
  const start = T.normalize(data);
  let d = start;
  const notes = [], errors = [], touched = [];
  const touch = (id) => { if (touched.indexOf(id) === -1) touched.push(id); };
  const run = (op, args) => { d = T.run(d, op, args, ctx); };
  const list = Array.isArray(actions) ? actions : [actions];

  list.forEach((a, i) => {
    try {
      if (!a || typeof a !== 'object') throw new Error('Not an action.');
      switch (a['do']) {
        case 'add': {
          const name = String(a.name || '').trim();
          if (!name) throw new Error('A name is needed.');
          if (d.people.some((p) => fold(p.name) === fold(name))) throw new Error(name + ' is already in the tracker.');
          const cat = a.category ? resolveCategory(d, a.category) : d.categories[0];
          const deadline = dateArg(a.deadline);
          const id = T.makeId();
          run('addPerson', { id: id, name: name, categoryId: cat.id, color: a.color || T.nextColor(d), deadline: deadline });
          if (!findById(d, id)) throw new Error('Could not add ' + name + ' (the tracker is full).');
          touch(id);
          notes.push('Added ' + name + ' to ' + cat.name + (deadline ? ' with deadline ' + deadline : '') + '.');
          break;
        }
        case 'done': {
          const p = resolvePerson(d, a.name), cat = T.categoryOf(d, p);
          let times = 1;
          if (a.step) {
            const idx = resolveStep(cat, a.step);
            if (idx < p.done) throw new Error(p.name + ' has already done "' + cat.steps[idx] + '". Next step is "' + cat.steps[p.done] + '".');
            if (idx > p.done && !a.through) {
              throw new Error('"' + cat.steps[idx] + '" is not ' + p.name + '\'s next step (that is "' + cat.steps[p.done] +
                '"). To mark everything up to "' + cat.steps[idx] + '" as done, set through to true.');
            }
            times = idx - p.done + 1;
          } else if (a.times) {
            times = Math.max(1, Math.min(cat.steps.length, parseInt(a.times, 10) || 1));
          }
          const hadDeadline = p.deadline, before = p.cycles;
          const labels = [];
          for (let k = 0; k < times; k++) {
            labels.push(T.personView(d, findById(d, p.id)).next);
            run('stepDone', { id: p.id });
          }
          const now = findById(d, p.id);
          touch(p.id);
          notes.push(p.name + ': marked ' + labels.map((s) => '"' + s + '"').join(', ') + ' done.');
          if (now.cycles > before) notes.push(p.name + ' finished a ' + cat.cycleName + '.');
          if (hadDeadline && !now.deadline) notes.push(p.name + '\'s deadline (' + hadDeadline + ') was cleared because a step was marked done. Set the next one if there is one.');
          if (now.deadline && now.deadline !== hadDeadline) notes.push(p.name + '\'s next deadline was set to ' + now.deadline + ' (days per step).');
          break;
        }
        case 'undo': {
          const p = resolvePerson(d, a.name);
          if (!p.cycles && !p.done) throw new Error(p.name + ' has nothing to undo.');
          run('undoStep', { id: p.id });
          touch(p.id);
          notes.push(p.name + ': undid the last step.');
          break;
        }
        case 'deadline': {
          const p = resolvePerson(d, a.name);
          const date = dateArg(a.date);
          run('setDeadline', { id: p.id, deadline: date });
          touch(p.id);
          notes.push(p.name + ': ' + (date ? 'deadline set to ' + date + '.' : 'deadline cleared.'));
          if (date && ctx.today && date < ctx.today) notes.push('Note: ' + date + ' is in the past.');
          break;
        }
        case 'edit': {
          const p = resolvePerson(d, a.name);
          const cat = a.category ? resolveCategory(d, a.category) : T.categoryOf(d, p);
          const newName = a.newName ? String(a.newName).trim() : p.name;
          if (newName !== p.name && d.people.some((q) => q.id !== p.id && fold(q.name) === fold(newName))) throw new Error(newName + ' is already in the tracker.');
          const args = {
            id: p.id, name: newName, color: a.color || p.color, categoryId: cat.id,
            deadline: a.deadline !== undefined ? dateArg(a.deadline) : p.deadline
          };
          if (a.cycles !== undefined) args.cycles = a.cycles;
          if (a.done !== undefined) args.done = a.done;
          run('editPerson', args);
          touch(p.id);
          notes.push('Edited ' + newName + (cat.id !== p.categoryId ? ' (moved to ' + cat.name + ', bar restarted)' : '') + '.');
          break;
        }
        case 'remove': {
          const p = resolvePerson(d, a.name);
          run('removePerson', { id: p.id });
          notes.push('Removed ' + p.name + '.');
          break;
        }
        case 'category': {
          const existing = a.name ? d.categories.filter((c) => fold(c.name) === fold(a.name))[0] : null;
          if (!existing && !(Array.isArray(a.steps) && a.steps.length)) throw new Error('A new category needs its steps.');
          const base = existing || { cycleName: 'reel', cyclePlural: '', defaultDays: 0, steps: [] };
          run('saveCategory', {
            id: existing ? existing.id : T.makeId('c'),
            name: a.newName || a.name,
            steps: a.steps || base.steps,
            cycleName: a.cycleName !== undefined ? a.cycleName : base.cycleName,
            cyclePlural: a.cyclePlural !== undefined ? a.cyclePlural : base.cyclePlural,
            defaultDays: a.defaultDays !== undefined ? a.defaultDays : base.defaultDays
          });
          notes.push((existing ? 'Updated' : 'Added') + ' category ' + (a.newName || a.name) + '.');
          break;
        }
        case 'op': {
          run(a.op, a.args || {});
          notes.push('Ran ' + a.op + '.');
          break;
        }
        default:
          throw new Error('Unknown action "' + a['do'] + '".');
      }
    } catch (e) {
      errors.push('Action ' + (i + 1) + (a && a['do'] ? ' (' + a['do'] + ')' : '') + ': ' + e.message);
    }
  });

  if (errors.length) return { ok: false, errors: errors, notes: notes, data: start, people: [], calendar: { create: [], update: [], delete: [] } };
  return {
    ok: true,
    errors: [],
    notes: notes,
    data: d,
    people: touched.map((id) => findById(d, id)).filter(Boolean).map((p) => describe(d, p)),
    calendar: calendarPlan(calendarEntries(start), calendarEntries(d))
  };
}

function show(d) {
  return T.sections(d).map((s) => {
    const lines = s.items.map((it) => (it.rank ? it.rank : '-') + '. ' + describe(d, it.person));
    return s.category.name + ' (' + s.items.length + ' people, steps: ' + s.category.steps.join(' > ') + ')\n  ' + (lines.join('\n  ') || 'nobody yet');
  }).join('\n\n');
}

function fileText(d) { return JSON.stringify(d, null, 2) + '\n'; }

// ---------- command line ----------
function main(argv) {
  const flags = argv.filter((a) => a.indexOf('--') === 0);
  const args = argv.filter((a) => a.indexOf('--') !== 0);
  if (args.length < 2) {
    console.error('Usage: node tools/log.js <data.json> show | sync | \'<actions json>\' [--write] [--today=YYYY-MM-DD]');
    return 2;
  }
  const file = args[0], mode = args[1];
  const todayFlag = flags.filter((f) => f.indexOf('--today=') === 0)[0];
  const ctx = { now: new Date().toISOString(), today: todayFlag ? todayFlag.slice(8) : T.isoDate(new Date()) };
  const data = T.normalize(JSON.parse(fs.readFileSync(file, 'utf8')));

  if (mode === 'show') { console.log(show(data)); return 0; }
  if (mode === 'sync') {
    const entries = Object.keys(calendarEntries(data)).map((id) => calendarEntries(data)[id]).sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
    console.log(JSON.stringify({ entries: entries }, null, 2));
    return 0;
  }

  let actions;
  try { actions = JSON.parse(mode); } catch (e) { console.error('The actions are not valid JSON: ' + e.message); return 2; }
  const res = apply(data, actions, ctx);
  const out = { ok: res.ok, errors: res.errors, notes: res.notes, people: res.people, calendar: res.calendar, wrote: false };
  if (res.ok && flags.indexOf('--write') !== -1) { fs.writeFileSync(file, fileText(res.data)); out.wrote = true; }
  console.log(JSON.stringify(out, null, 2));
  return res.ok ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { apply: apply, calendarEntries: calendarEntries, calendarPlan: calendarPlan, show: show, fileText: fileText, resolvePerson: resolvePerson, fold: fold };
