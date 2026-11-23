// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./logic.js');

const ctx = { now: '2026-11-23T10:00:00.000Z', today: '2026-11-23' };
const cat = (over) => Object.assign({ id: 'c1', name: 'Filming', cycleName: 'reel', cyclePlural: '', defaultDays: 7, steps: ['Hook', 'Film'] }, over);
const base = (over) => T.normalize(Object.assign({ categories: [cat()], people: [] }, over));
const person = (id, name, cycles, done, progressAt, categoryId) =>
  ({ id, name, categoryId: categoryId || 'c1', color: '#E68364', cycles, done, deadline: '', progressAt: progressAt || '' });
const four = ['A', 'B', 'C', 'D'];

// ---- ranking ----
test('3 reels and 25% ranks above 2 reels and 70%', () => {
  const d = base({ categories: [cat({ steps: four })], people: [person('b', 'Beta', 2, 3), person('a', 'Alpha', 3, 1)] });
  assert.deepEqual(T.ranked(d, 'c1').map((r) => r.person.id), ['a', 'b']);
});

test('same reels: the fuller bar ranks higher', () => {
  const d = base({ categories: [cat({ steps: four })], people: [person('x', 'X', 1, 1), person('y', 'Y', 1, 3)] });
  assert.equal(T.ranked(d, 'c1')[0].person.id, 'y');
});

test('equal progress: whoever got there first ranks higher', () => {
  const d = base({ people: [person('late', 'Aya', 1, 0, '2026-11-20T10:00:00Z'), person('early', 'Zed', 1, 0, '2026-11-10T10:00:00Z')] });
  assert.deepEqual(T.ranked(d, 'c1').map((r) => r.person.id), ['early', 'late']);
});

test('people who have not started get rank 0 and sit at the bottom', () => {
  const d = base({ people: [person('n', 'Newbie', 0, 0), person('s', 'Starter', 0, 1, '2026-11-21T00:00:00Z')] });
  assert.deepEqual(T.ranked(d, 'c1').map((x) => [x.person.id, x.rank]), [['s', 1], ['n', 0]]);
});

test('each category is ranked on its own', () => {
  const d = base({
    categories: [cat(), cat({ id: 'c2', name: 'Editing', cycleName: 'edit', steps: four })],
    people: [person('f', 'Filmer', 1, 0, '', 'c1'), person('e', 'Editor', 5, 3, '', 'c2'), person('g', 'Gina', 0, 1, '2026-11-01T00:00:00Z', 'c1')]
  });
  const s = T.sections(d);
  assert.deepEqual(s.map((x) => x.category.id), ['c1', 'c2']);
  assert.deepEqual(s[0].items.map((x) => [x.person.id, x.rank]), [['f', 1], ['g', 2]]);
  assert.deepEqual(s[1].items.map((x) => [x.person.id, x.rank]), [['e', 1]]);
  assert.equal(s[1].cycles, 5);
});

// ---- bars and steps ----
test('with two steps, one step done fills 50%', () => {
  let d = base({ people: [person('p', 'Sara', 0, 0)] });
  d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  const v = T.personView(d, d.people[0]);
  assert.deepEqual([v.pct, v.next, v.cycles], [50, 'Film', 0]);
});

test('finishing the last step counts a reel and restarts the bar', () => {
  let d = base({ people: [person('p', 'Sara', 0, 1)] });
  d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  const v = T.personView(d, d.people[0]);
  assert.deepEqual([v.cycles, v.pct, v.next], [1, 0, 'Hook']);
});

test('filled twice shows 2 reels', () => {
  let d = base({ people: [person('p', 'Sara', 0, 0)] });
  for (let i = 0; i < 4; i++) d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  assert.deepEqual([d.people[0].cycles, d.people[0].done], [2, 0]);
});

test('undo steps back, also across a finished reel', () => {
  let d = base({ people: [person('p', 'Sara', 1, 0)] });
  d = T.run(d, 'undoStep', { id: 'p' }, ctx);
  assert.deepEqual([d.people[0].cycles, d.people[0].done], [0, 1]);
  d = T.run(d, 'undoStep', { id: 'p' }, ctx);
  d = T.run(d, 'undoStep', { id: 'p' }, ctx);
  assert.deepEqual([d.people[0].cycles, d.people[0].done], [0, 0]);
});

test('people in different categories use their own steps', () => {
  let d = base({
    categories: [cat(), cat({ id: 'c2', name: 'Editing', steps: ['Cut', 'Captions', 'Review', 'Export'] })],
    people: [person('f', 'Filmer', 0, 1, '', 'c1'), person('e', 'Editor', 0, 1, '', 'c2')]
  });
  assert.equal(T.personView(d, d.people[0]).pct, 50);
  assert.equal(T.personView(d, d.people[1]).pct, 25);
  assert.equal(T.personView(d, d.people[1]).next, 'Captions');
  d = T.run(d, 'stepDone', { id: 'e' }, ctx);
  assert.equal(d.people[1].done, 2);
  assert.equal(d.people[1].cycles, 0);
});

// ---- deadlines ----
test('each person gets their own deadline, and it can be cleared', () => {
  let d = base({ people: [person('a', 'Ana', 0, 0), person('b', 'Bob', 0, 0)] });
  d = T.run(d, 'setDeadline', { id: 'a', deadline: '2026-12-05' }, ctx);
  d = T.run(d, 'setDeadline', { id: 'b', deadline: '2026-12-20' }, ctx);
  assert.deepEqual(d.people.map((p) => p.deadline), ['2026-12-05', '2026-12-20']);
  d = T.run(d, 'setDeadline', { id: 'a', deadline: '' }, ctx);
  assert.equal(d.people[0].deadline, '');
  d = T.run(d, 'setDeadline', { id: 'b', deadline: 'soon' }, ctx);
  assert.equal(d.people[1].deadline, '');
});

test('marking a step done sets the next deadline from the category days, or clears it', () => {
  let d = base({
    categories: [cat({ defaultDays: 7 }), cat({ id: 'c2', name: 'Editing', defaultDays: 0 })],
    people: [person('f', 'Filmer', 0, 0, '', 'c1'), person('e', 'Editor', 0, 0, '', 'c2')]
  });
  d = T.run(d, 'setDeadline', { id: 'e', deadline: '2026-12-01' }, ctx);
  d = T.run(d, 'stepDone', { id: 'f' }, ctx);
  d = T.run(d, 'stepDone', { id: 'e' }, ctx);
  assert.equal(d.people[0].deadline, '2026-11-30');
  assert.equal(d.people[1].deadline, '');
});

test('deadline states', () => {
  assert.equal(T.deadlineInfo('', '2026-11-23').state, 'none');
  assert.equal(T.deadlineInfo('2026-11-20', '2026-11-23').state, 'late');
  assert.equal(T.deadlineInfo('2026-11-23', '2026-11-23').state, 'today');
  assert.equal(T.deadlineInfo('2026-11-25', '2026-11-23').state, 'soon');
  assert.equal(T.deadlineInfo('2026-11-30', '2026-11-23').days, 7);
});

// ---- categories ----
test('fewer steps: a bar past the new end becomes a finished reel', () => {
  let d = base({ categories: [cat({ steps: four })], people: [person('p', 'Sara', 0, 3)] });
  d = T.run(d, 'saveCategory', { id: 'c1', name: 'Filming', steps: ['A', 'B'] }, ctx);
  assert.deepEqual([d.people[0].cycles, d.people[0].done], [1, 1]);
});

test('more steps keep everyone where they are', () => {
  let d = base({ people: [person('p', 'Sara', 2, 1)] });
  d = T.run(d, 'saveCategory', { id: 'c1', name: 'Filming', steps: ['Hook', 'Session', 'Film'] }, ctx);
  assert.deepEqual([d.people[0].cycles, d.people[0].done], [2, 1]);
  assert.equal(T.personView(d, d.people[0]).next, 'Session');
});

test('a new category is added; a category needs a name and a step', () => {
  let d = base();
  d = T.run(d, 'saveCategory', { id: 'c9', name: 'Editing', cycleName: 'edit', steps: ['Cut', 'Export'], defaultDays: 3 }, ctx);
  assert.deepEqual(d.categories.map((c) => c.name), ['Filming', 'Editing']);
  assert.equal(T.cycleLabel(d.categories[1], 2), 'edits');
  d = T.run(d, 'saveCategory', { id: 'cx', name: '  ', steps: ['A'] }, ctx);
  d = T.run(d, 'saveCategory', { id: 'cy', name: 'Empty', steps: ['', ' '] }, ctx);
  assert.equal(d.categories.length, 2);
});

test('only an empty category can be removed, and one always remains', () => {
  let d = base({ categories: [cat(), cat({ id: 'c2', name: 'Editing' })], people: [person('p', 'Sara', 0, 0, '', 'c2')] });
  d = T.run(d, 'removeCategory', { id: 'c2' }, ctx);
  assert.equal(d.categories.length, 2);
  d = T.run(d, 'removePerson', { id: 'p' }, ctx);
  d = T.run(d, 'removeCategory', { id: 'c2' }, ctx);
  assert.deepEqual(d.categories.map((c) => c.id), ['c1']);
  d = T.run(d, 'removeCategory', { id: 'c1' }, ctx);
  assert.equal(d.categories.length, 1);
});

test('categories can be reordered', () => {
  let d = base({ categories: [cat(), cat({ id: 'c2', name: 'Editing' }), cat({ id: 'c3', name: 'Design' })] });
  d = T.run(d, 'moveCategory', { id: 'c3', dir: -1 }, ctx);
  assert.deepEqual(d.categories.map((c) => c.id), ['c1', 'c3', 'c2']);
  d = T.run(d, 'moveCategory', { id: 'c1', dir: -1 }, ctx);
  assert.deepEqual(d.categories.map((c) => c.id), ['c1', 'c3', 'c2']);
});

test('cycle name is singular or plural, per category', () => {
  const d = base({ categories: [cat({ cycleName: 'reel' }), cat({ id: 'c2', name: 'Editing', cycleName: 'video', cyclePlural: 'videos' })] });
  assert.equal(T.cycleLabel(d.categories[0], 1), 'reel');
  assert.equal(T.cycleLabel(d.categories[0], 0), 'reels');
  assert.equal(T.cycleLabel(d.categories[1], 2), 'videos');
});

// ---- people ----
test('adding people: category, colours, tidy names', () => {
  let d = base({ categories: [cat(), cat({ id: 'c2', name: 'Editing' })] });
  d = T.run(d, 'addPerson', { id: 'a', name: '  Sara   B  ', color: T.nextColor(d), categoryId: 'c2' }, ctx);
  d = T.run(d, 'addPerson', { id: 'b', name: 'Omar', color: T.nextColor(d), categoryId: 'nope' }, ctx);
  d = T.run(d, 'addPerson', { id: 'c', name: '   ' }, ctx);
  assert.deepEqual(d.people.map((p) => [p.name, p.categoryId]), [['Sara B', 'c2'], ['Omar', 'c1']]);
  assert.notEqual(d.people[0].color, d.people[1].color);
});

test('edit corrects progress; moving to another category starts the bar from zero', () => {
  let d = base({ categories: [cat(), cat({ id: 'c2', name: 'Editing', steps: four })], people: [person('p', 'Sara', 0, 0)] });
  d = T.run(d, 'editPerson', { id: 'p', name: 'Sara B', color: '#72BFE7', deadline: '2026-12-01', cycles: 2, done: 1 }, ctx);
  assert.deepEqual([d.people[0].name, d.people[0].cycles, d.people[0].done, d.people[0].deadline], ['Sara B', 2, 1, '2026-12-01']);
  assert.equal(d.people[0].progressAt, ctx.now);
  d = T.run(d, 'editPerson', { id: 'p', name: 'Sara B', categoryId: 'c2', deadline: '' }, ctx);
  assert.deepEqual([d.people[0].categoryId, d.people[0].cycles, d.people[0].done, d.people[0].progressAt], ['c2', 0, 0, '']);
  d = T.run(d, 'removePerson', { id: 'p' }, ctx);
  assert.equal(d.people.length, 0);
});

test('settings change only the title, small line and about text', () => {
  let d = base();
  d = T.run(d, 'saveSettings', { title: 'Bridge Crossings 2', subtitle: 'Progress', about: ' Hello ' }, ctx);
  assert.deepEqual([d.title, d.subtitle, d.about, d.categories.length], ['Bridge Crossings 2', 'Progress', 'Hello', 1]);
});

// ---- search ----
test('name search ignores capitals and accents and wants every word', () => {
  assert.ok(T.matchName('Lina bennis', 'lina'));
  assert.ok(T.matchName('Lina bennis', 'BEN lin'));
  assert.ok(!T.matchName('Lina bennis', 'lina karim'));
  assert.ok(T.matchName('Hélène Zoé', 'helene zoe'));
  assert.ok(T.matchName('Fatima-ezzahra Atlach', 'fatima ezzahra'));
  assert.ok(T.matchName('عائشة Zoé', 'عائ'));
  assert.ok(T.matchName('Anyone', '   '));
});

// ---- loading old and broken data ----
test('the first version of the file (one list of steps) becomes one category, nothing lost', () => {
  const old = {
    rev: 4, title: 'Bridge Crossings', subtitle: 'Reels progress', about: 'x', cycleName: 'reel', cyclePlural: 'reels', defaultDays: 0,
    steps: ['Topics and hooks', 'Script', 'Film'],
    people: [{ id: 'pmw', name: 'Lina bennis', color: '#E68364', cycles: 0, done: 1, deadline: '', progressAt: '2026-11-23T18:05:57.542Z' }],
    updatedAt: '2026-11-23T18:05:57.542Z'
  };
  const d = T.normalize(old);
  assert.equal(d.categories.length, 1);
  assert.deepEqual([d.categories[0].id, d.categories[0].name, d.categories[0].steps, d.categories[0].defaultDays],
    ['main', 'Filming', ['Topics and hooks', 'Script', 'Film'], 0]);
  assert.equal(d.people[0].categoryId, 'main');
  assert.equal(T.personView(d, d.people[0]).next, 'Script');
  assert.equal(d.rev, 4);
  assert.equal('steps' in d, false);
});

test('an empty file still gives one usable category', () => {
  const d = T.normalize({});
  assert.deepEqual([d.categories.length, d.categories[0].steps], [1, ['Hook', 'Film']]);
});

test('bad colours, dates, unknown categories and duplicate ids are repaired on load', () => {
  const d = T.normalize({
    categories: [{ id: 'a', name: 'One', steps: ['A'] }, { id: 'a', name: 'Two', steps: [] }],
    people: [{ id: 'x', name: 'Z', categoryId: 'ghost', color: 'red', deadline: '2026-02-31', cycles: -3, done: 'abc' }]
  });
  assert.match(d.people[0].color, /^#[0-9A-F]{6}$/i);
  assert.deepEqual([d.people[0].deadline, d.people[0].cycles, d.people[0].done, d.people[0].categoryId], ['', 0, 0, 'a']);
  assert.deepEqual(d.categories.map((c) => c.id), ['a', 'a_']);
  assert.deepEqual(d.categories[1].steps, ['Done']);
});

test('run does not change its input and bumps the revision', () => {
  const d = base({ people: [person('p', 'Sara', 0, 0)] });
  const copy = JSON.stringify(d);
  const out = T.run(d, 'stepDone', { id: 'p' }, ctx);
  assert.equal(JSON.stringify(d), copy);
  assert.equal(out.rev, d.rev + 1);
  assert.equal(out.updatedAt, ctx.now);
});

test('summary totals finished cycles across categories', () => {
  const d = base({ categories: [cat(), cat({ id: 'c2', name: 'Editing' })], people: [person('a', 'A', 2, 0), person('b', 'B', 3, 1, '', 'c2')] });
  assert.deepEqual(T.summary(d), { people: 2, cycles: 5, categories: 2 });
});

// ---- admin sorting ----
const withDeadline = (p, deadline) => Object.assign(p, { deadline });
const order = (d, mode) => T.sortItems(T.ranked(d, 'c1'), mode).map((x) => x.person.id);

test('sort by rank leaves the ranking as it is', () => {
  const d = base({ people: [person('a', 'Aya', 0, 1, '2026-11-02T00:00:00Z'), person('b', 'Bo', 2, 0, '2026-11-01T00:00:00Z')] });
  assert.deepEqual(order(d, 'rank'), ['b', 'a']);
  assert.deepEqual(order(d, 'nonsense'), ['b', 'a']);
});

test('sort by closest deadline: late first, then soonest, no deadline last, ties keep rank order', () => {
  const d = base({
    people: [
      withDeadline(person('none', 'None', 3, 0), ''),
      withDeadline(person('far', 'Far', 2, 0), '2026-12-10'),
      withDeadline(person('late', 'Late', 0, 1, '2026-11-01T00:00:00Z'), '2026-11-18'),
      withDeadline(person('soon', 'Soon', 1, 0, '2026-11-02T00:00:00Z'), '2026-11-24'),
      withDeadline(person('soon2', 'Soon2', 0, 1, '2026-11-03T00:00:00Z'), '2026-11-24')
    ]
  });
  assert.deepEqual(order(d, 'deadline'), ['late', 'soon', 'soon2', 'far', 'none']);
});

test('sort by next step groups people at the same step, first step first', () => {
  const d = base({
    categories: [cat({ steps: four })],
    people: [person('x', 'X', 0, 3, '2026-11-01T00:00:00Z'), person('y', 'Y', 4, 0), person('z', 'Z', 1, 1, '2026-11-02T00:00:00Z'), person('w', 'W', 0, 0)]
  });
  assert.deepEqual(order(d, 'step'), ['y', 'w', 'z', 'x']);
});

test('sort by name ignores capitals and accents', () => {
  const d = base({ people: [person('1', 'hiba', 0, 0), person('2', 'Hélène', 0, 0), person('3', 'Ali', 0, 0), person('4', 'Zed', 0, 0)] });
  assert.deepEqual(order(d, 'name'), ['3', '2', '1', '4']);
});

test('sort by waiting longest: no progress first, then the oldest step, newest last', () => {
  const d = base({
    people: [
      person('new', 'New', 1, 0, '2026-11-22T10:00:00Z'),
      person('old', 'Old', 0, 1, '2026-11-05T10:00:00Z'),
      person('never', 'Never', 0, 0),
      person('mid', 'Mid', 2, 0, '2026-11-15T10:00:00Z')
    ]
  });
  assert.deepEqual(order(d, 'quiet'), ['never', 'old', 'mid', 'new']);
});

test('sorting returns a new list and does not change the input or the ranks', () => {
  const d = base({ people: [person('a', 'Zed', 2, 0), person('b', 'Ali', 1, 0)] });
  const items = T.ranked(d, 'c1');
  const before = JSON.stringify(items);
  const sorted = T.sortItems(items, 'name');
  assert.equal(JSON.stringify(items), before);
  assert.deepEqual(sorted.map((x) => [x.person.id, x.rank]), [['b', 2], ['a', 1]]);
});

test('every sort option has an id and a label, and validSort falls back to rank', () => {
  assert.deepEqual(T.SORTS.map((s) => s.id), ['rank', 'deadline', 'step', 'name', 'quiet']);
  assert.ok(T.SORTS.every((s) => s.label));
  assert.equal(T.validSort('deadline'), 'deadline');
  assert.equal(T.validSort('x'), 'rank');
  assert.equal(T.validSort(undefined), 'rank');
});
