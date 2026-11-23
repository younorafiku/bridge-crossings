// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../logic.js');
const L = require('./log.js');

const ctx = { now: '2026-11-23T20:00:00.000Z', today: '2026-11-23' };
const cat = (over) => Object.assign({ id: 'c1', name: 'Filming', cycleName: 'reel', cyclePlural: 'reels', defaultDays: 0, steps: ['Topics and hooks', 'Script', 'Film'] }, over);
const person = (id, name, cycles, done, deadline, categoryId) =>
  ({ id, name, categoryId: categoryId || 'c1', color: '#E68364', cycles, done, deadline: deadline || '', progressAt: cycles || done ? '2026-11-20T10:00:00Z' : '' });
const base = (people, cats) => T.normalize({ rev: 5, categories: cats || [cat()], people });
const get = (d, id) => d.people.filter((p) => p.id === id)[0];

test('done marks the next step, and says so', () => {
  const r = L.apply(base([person('h', 'Hiba ENAM', 0, 1)]), [{ do: 'done', name: 'hiba' }], ctx);
  assert.equal(r.ok, true);
  assert.deepEqual([get(r.data, 'h').done, get(r.data, 'h').cycles], [2, 0]);
  assert.match(r.notes[0], /"Script"/);
  assert.match(r.people[0], /next step "Film"/);
});

test('names ignore capitals and accents, and part of a name is enough when it is unique', () => {
  const d = base([person('a', 'Hélène Zoé', 0, 0), person('b', 'Lina bennis', 0, 0)]);
  assert.equal(L.resolvePerson(d, 'helene').id, 'a');
  assert.equal(L.resolvePerson(d, 'ZOE').id, 'a');
  assert.equal(L.resolvePerson(d, 'lina ben').id, 'b');
});

test('an unknown or ambiguous name is an error that lists the options', () => {
  const d = base([person('a', 'Lina bennis', 0, 0), person('b', 'Lina karim', 0, 0), person('c', 'Omar', 0, 0)]);
  let r = L.apply(d, [{ do: 'done', name: 'lina' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Lina bennis, Lina karim/);
  r = L.apply(d, [{ do: 'done', name: 'zed' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /No person matches "zed"/);
  assert.match(r.errors[0], /Omar/);
  assert.equal(L.apply(d, [{ do: 'done', name: 'lina karim' }], ctx).ok, true);
});

test('finishing the last step counts a finished reel and says so', () => {
  const r = L.apply(base([person('h', 'Hiba', 1, 2)]), [{ do: 'done', name: 'Hiba' }], ctx);
  assert.deepEqual([get(r.data, 'h').cycles, get(r.data, 'h').done], [2, 0]);
  assert.ok(r.notes.some((n) => /finished a reel/.test(n)));
});

test('done with a step name: the next step works, a later one needs through, an earlier one is refused', () => {
  const d = base([person('h', 'Hiba', 0, 1)]);
  assert.equal(L.apply(d, [{ do: 'done', name: 'Hiba', step: 'script' }], ctx).ok, true);
  let r = L.apply(d, [{ do: 'done', name: 'Hiba', step: 'Film' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /not Hiba's next step/);
  r = L.apply(d, [{ do: 'done', name: 'Hiba', step: 'Film', through: true }], ctx);
  assert.equal(r.ok, true);
  assert.deepEqual([get(r.data, 'h').cycles, get(r.data, 'h').done], [1, 0]);
  r = L.apply(d, [{ do: 'done', name: 'Hiba', step: 'topics' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /already done/);
  r = L.apply(d, [{ do: 'done', name: 'Hiba', step: 'nonsense' }], ctx);
  assert.match(r.errors[0], /No step matches/);
});

test('if any action fails nothing is changed', () => {
  const d = base([person('a', 'Ana', 0, 0), person('b', 'Bob', 0, 0)]);
  const before = JSON.stringify(d);
  const r = L.apply(d, [{ do: 'done', name: 'Ana' }, { do: 'done', name: 'Nobody' }], ctx);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(r.data), before);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(r.calendar, { create: [], update: [], delete: [] });
});

test('several people in one go, each logged', () => {
  const d = base([person('a', 'Ana', 0, 0), person('b', 'Bob', 0, 1)]);
  const r = L.apply(d, [{ do: 'done', name: 'Ana' }, { do: 'done', name: 'Bob' }, { do: 'done', name: 'Bob' }], ctx);
  assert.deepEqual([get(r.data, 'a').done, get(r.data, 'b').cycles, get(r.data, 'b').done], [1, 1, 0]);
  assert.equal(r.people.length, 2);
});

test('marking a step done clears the deadline and says so; with days per step it sets the next one', () => {
  let d = base([person('h', 'Hiba', 0, 0, '2026-11-29')]);
  let r = L.apply(d, [{ do: 'done', name: 'Hiba' }], ctx);
  assert.equal(get(r.data, 'h').deadline, '');
  assert.ok(r.notes.some((n) => /deadline \(2026-11-29\) was cleared/.test(n)));
  assert.equal(r.calendar.delete.length, 1);
  d = base([person('h', 'Hiba', 0, 0, '2026-11-29')], [cat({ defaultDays: 7 })]);
  r = L.apply(d, [{ do: 'done', name: 'Hiba' }], ctx);
  assert.equal(get(r.data, 'h').deadline, '2026-11-30');
  assert.equal(r.calendar.update.length, 1);
  assert.equal(r.calendar.update[0].title, 'Hiba: Script due');
});

test('undo steps back, and refuses when there is nothing to undo', () => {
  const d = base([person('a', 'Ana', 0, 2), person('b', 'Bob', 0, 0)]);
  assert.equal(get(L.apply(d, [{ do: 'undo', name: 'Ana' }], ctx).data, 'a').done, 1);
  const r = L.apply(d, [{ do: 'undo', name: 'Bob' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /nothing to undo/);
});

test('deadline: set, clear, bad dates, and a note for a date in the past', () => {
  const d = base([person('a', 'Ana', 0, 0, '2026-12-01')]);
  let r = L.apply(d, [{ do: 'deadline', name: 'Ana', date: '2026-12-05' }], ctx);
  assert.equal(get(r.data, 'a').deadline, '2026-12-05');
  r = L.apply(d, [{ do: 'deadline', name: 'Ana', date: '' }], ctx);
  assert.equal(get(r.data, 'a').deadline, '');
  r = L.apply(d, [{ do: 'deadline', name: 'Ana', date: 'clear' }], ctx);
  assert.equal(get(r.data, 'a').deadline, '');
  r = L.apply(d, [{ do: 'deadline', name: 'Ana', date: '5 December' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /not a date/);
  r = L.apply(d, [{ do: 'deadline', name: 'Ana', date: '2026-11-02' }], ctx);
  assert.ok(r.notes.some((n) => /in the past/.test(n)));
});

test('add a person with category and deadline; a duplicate name is refused', () => {
  const d = base([person('a', 'Ana', 0, 0)], [cat(), cat({ id: 'c2', name: 'Editing', steps: ['Cut', 'Export'] })]);
  let r = L.apply(d, [{ do: 'add', name: 'Omar', category: 'edit', deadline: '2026-12-02' }], ctx);
  assert.equal(r.ok, true);
  const omar = r.data.people.filter((p) => p.name === 'Omar')[0];
  assert.deepEqual([omar.categoryId, omar.deadline], ['c2', '2026-12-02']);
  assert.equal(r.calendar.create.length, 1);
  assert.equal(r.calendar.create[0].title, 'Omar: Cut due');
  r = L.apply(d, [{ do: 'add', name: 'ANA' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /already in the tracker/);
});

test('edit keeps what is not mentioned; moving to another category restarts the bar', () => {
  const d = base([person('a', 'Ana', 2, 1, '2026-12-01')], [cat(), cat({ id: 'c2', name: 'Editing', steps: ['Cut', 'Export'] })]);
  let r = L.apply(d, [{ do: 'edit', name: 'Ana', newName: 'Ana B' }], ctx);
  assert.deepEqual([get(r.data, 'a').name, get(r.data, 'a').cycles, get(r.data, 'a').done, get(r.data, 'a').deadline], ['Ana B', 2, 1, '2026-12-01']);
  r = L.apply(d, [{ do: 'edit', name: 'Ana', category: 'Editing' }], ctx);
  assert.deepEqual([get(r.data, 'a').categoryId, get(r.data, 'a').cycles, get(r.data, 'a').done], ['c2', 0, 0]);
  r = L.apply(d, [{ do: 'edit', name: 'Ana', cycles: 5, done: 0 }], ctx);
  assert.deepEqual([get(r.data, 'a').cycles, get(r.data, 'a').done], [5, 0]);
});

test('remove deletes the person and their calendar entry', () => {
  const d = base([person('a', 'Ana', 0, 0, '2026-12-01'), person('b', 'Bob', 0, 0)]);
  const r = L.apply(d, [{ do: 'remove', name: 'Ana' }], ctx);
  assert.deepEqual(r.data.people.map((p) => p.id), ['b']);
  assert.deepEqual(r.calendar.delete.map((x) => x.id), ['a']);
});

test('calendar plan: create, update on a new date, update on a new next step, delete when cleared', () => {
  const d = base([person('a', 'Ana', 0, 0), person('b', 'Bob', 0, 0, '2026-12-01')]);
  let r = L.apply(d, [{ do: 'deadline', name: 'Ana', date: '2026-12-03' }], ctx);
  assert.deepEqual([r.calendar.create.length, r.calendar.update.length, r.calendar.delete.length], [1, 0, 0]);
  const e = r.calendar.create[0];
  assert.deepEqual([e.title, e.start, e.end], ['Ana: Topics and hooks due', '2026-12-03', '2026-12-04']);
  r = L.apply(d, [{ do: 'deadline', name: 'Bob', date: '2026-12-09' }], ctx);
  assert.deepEqual([r.calendar.create.length, r.calendar.update.length], [0, 1]);
  assert.equal(r.calendar.update[0].start, '2026-12-09');
  r = L.apply(d, [{ do: 'deadline', name: 'Bob', date: '' }], ctx);
  assert.deepEqual(r.calendar.delete.map((x) => x.id), ['b']);
  r = L.apply(d, [{ do: 'edit', name: 'Bob', done: 1 }], ctx);
  assert.equal(r.calendar.update[0].title, 'Bob: Script due');
});

test('a month-end deadline ends the next day, which may be in the next month', () => {
  const d = base([person('a', 'Ana', 0, 0, '2026-12-31')]);
  const entries = L.calendarEntries(d);
  assert.deepEqual([entries.a.start, entries.a.end], ['2026-12-31', '2027-01-01']);
});

test('category action adds and changes categories; a new one needs steps', () => {
  const d = base([person('a', 'Ana', 0, 0)]);
  let r = L.apply(d, [{ do: 'category', name: 'Editing', steps: ['Cut', 'Export'], cycleName: 'edit' }], ctx);
  assert.deepEqual(r.data.categories.map((c) => c.name), ['Filming', 'Editing']);
  r = L.apply(d, [{ do: 'category', name: 'Editing' }], ctx);
  assert.equal(r.ok, false);
  r = L.apply(d, [{ do: 'category', name: 'filming', defaultDays: 5 }], ctx);
  assert.equal(r.data.categories[0].defaultDays, 5);
  assert.deepEqual(r.data.categories[0].steps, ['Topics and hooks', 'Script', 'Film']);
});

test('an unknown action is reported', () => {
  const r = L.apply(base([person('a', 'Ana', 0, 0)]), [{ do: 'dance', name: 'Ana' }], ctx);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Unknown action "dance"/);
});

test('the command line writes the file in the same format as the page, and only when it worked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-log-'));
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, L.fileText(base([person('h', 'Hiba', 0, 0, '2026-11-29')])));
  const run = (actions, extra) => spawnSync(process.execPath, [path.join(__dirname, 'log.js'), file, JSON.stringify(actions)].concat(extra || []), { encoding: 'utf8' });

  let res = run([{ do: 'done', name: 'Hiba' }]);
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).wrote, false);
  assert.equal(T.normalize(JSON.parse(fs.readFileSync(file, 'utf8'))).people[0].done, 0);

  res = run([{ do: 'done', name: 'Nobody' }], ['--write']);
  assert.equal(res.status, 1);
  assert.equal(JSON.parse(res.stdout).wrote, false);

  res = run([{ do: 'done', name: 'Hiba' }], ['--write']);
  assert.equal(res.status, 0);
  const out = JSON.parse(res.stdout);
  assert.equal(out.wrote, true);
  assert.equal(out.calendar.delete.length, 1);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n');
  assert.equal(JSON.parse(text).people[0].done, 1);

  const shown = spawnSync(process.execPath, [path.join(__dirname, 'log.js'), file, 'show'], { encoding: 'utf8' });
  assert.match(shown.stdout, /Filming/);
  assert.match(shown.stdout, /Hiba/);
  const sync = spawnSync(process.execPath, [path.join(__dirname, 'log.js'), file, 'sync'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(sync.stdout).entries, []);
  fs.rmSync(dir, { recursive: true, force: true });
});
