// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('./logic.js');

const ctx = { now: '2026-11-23T10:00:00.000Z', today: '2026-11-23' };
const base = (over) => T.normalize(Object.assign({
  steps: ['Hook', 'Film'], defaultDays: 7, cycleName: 'reel', people: []
}, over));
const person = (id, name, cycles, done, progressAt) => ({ id, name, color: '#E68364', cycles, done, deadline: '', progressAt: progressAt || '' });

test('3 reels and 25% ranks above 2 reels and 70%', () => {
  const d = base({
    steps: ['A', 'B', 'C', 'D'],
    people: [person('b', 'Beta', 2, 3), person('a', 'Alpha', 3, 1)]
  });
  const order = T.ranked(d).map((r) => r.person.id);
  assert.deepEqual(order, ['a', 'b']);
});

test('same reels: the fuller bar ranks higher', () => {
  const d = base({ steps: ['A', 'B', 'C', 'D'], people: [person('x', 'X', 1, 1), person('y', 'Y', 1, 3)] });
  assert.equal(T.ranked(d)[0].person.id, 'y');
});

test('equal progress: whoever got there first ranks higher', () => {
  const d = base({ people: [
    person('late', 'Aya', 1, 0, '2026-11-20T10:00:00Z'),
    person('early', 'Zed', 1, 0, '2026-11-10T10:00:00Z')
  ] });
  assert.deepEqual(T.ranked(d).map((r) => r.person.id), ['early', 'late']);
});

test('people who have not started get rank 0 and sit at the bottom', () => {
  const d = base({ people: [person('n', 'Newbie', 0, 0), person('s', 'Starter', 0, 1, '2026-11-21T00:00:00Z')] });
  const r = T.ranked(d);
  assert.deepEqual(r.map((x) => [x.person.id, x.rank]), [['s', 1], ['n', 0]]);
});

test('with two steps, one step done fills 50%', () => {
  let d = base({ people: [person('p', 'Sara', 0, 0)] });
  d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  const v = T.personView(d, d.people[0]);
  assert.equal(v.pct, 50);
  assert.equal(v.next, 'Film');
  assert.equal(v.cycles, 0);
});

test('finishing the last step counts a reel and restarts the bar', () => {
  let d = base({ people: [person('p', 'Sara', 0, 1)] });
  d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  const v = T.personView(d, d.people[0]);
  assert.equal(v.cycles, 1);
  assert.equal(v.pct, 0);
  assert.equal(v.next, 'Hook');
});

test('filled twice shows 2 reels', () => {
  let d = base({ people: [person('p', 'Sara', 0, 0)] });
  for (let i = 0; i < 4; i++) d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  assert.equal(d.people[0].cycles, 2);
  assert.equal(d.people[0].done, 0);
});

test('a finished step sets the next deadline from the default days, or clears it', () => {
  let d = base({ people: [person('p', 'Sara', 0, 0)] });
  d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  assert.equal(d.people[0].deadline, '2026-11-30');
  d = T.run(d, 'saveSettings', { defaultDays: 0 }, ctx);
  d = T.run(d, 'stepDone', { id: 'p' }, ctx);
  assert.equal(d.people[0].deadline, '');
});

test('undo steps back, also across a finished reel', () => {
  let d = base({ people: [person('p', 'Sara', 1, 0)] });
  d = T.run(d, 'undoStep', { id: 'p' }, ctx);
  assert.equal(d.people[0].cycles, 0);
  assert.equal(d.people[0].done, 1);
  d = T.run(d, 'undoStep', { id: 'p' }, ctx);
  d = T.run(d, 'undoStep', { id: 'p' }, ctx);
  assert.equal(d.people[0].done, 0);
  assert.equal(d.people[0].cycles, 0);
});

test('fewer steps: a bar past the new end becomes a finished reel', () => {
  let d = base({ steps: ['A', 'B', 'C', 'D'], people: [person('p', 'Sara', 0, 3)] });
  d = T.run(d, 'saveSettings', { steps: ['A', 'B'] }, ctx);
  assert.equal(d.people[0].cycles, 1);
  assert.equal(d.people[0].done, 1);
});

test('more steps keep everyone where they are', () => {
  let d = base({ people: [person('p', 'Sara', 2, 1)] });
  d = T.run(d, 'saveSettings', { steps: ['Hook', 'Session', 'Film'] }, ctx);
  assert.equal(d.people[0].cycles, 2);
  assert.equal(d.people[0].done, 1);
  assert.equal(T.personView(d, d.people[0]).next, 'Session');
});

test('an empty steps list is ignored', () => {
  const d = T.run(base(), 'saveSettings', { steps: ['', '  '] }, ctx);
  assert.deepEqual(d.steps, ['Hook', 'Film']);
});

test('adding people picks unused colours and keeps names tidy', () => {
  let d = base();
  d = T.run(d, 'addPerson', { id: 'a', name: '  Sara   B  ', color: T.nextColor(d) }, ctx);
  d = T.run(d, 'addPerson', { id: 'b', name: 'Omar', color: T.nextColor(d) }, ctx);
  assert.equal(d.people[0].name, 'Sara B');
  assert.notEqual(d.people[0].color, d.people[1].color);
  d = T.run(d, 'addPerson', { id: 'c', name: '   ' }, ctx);
  assert.equal(d.people.length, 2);
});

test('edit corrects progress and removal works', () => {
  let d = base({ people: [person('p', 'Sara', 0, 0)] });
  d = T.run(d, 'editPerson', { id: 'p', name: 'Sara B', color: '#72BFE7', deadline: '2026-12-01', cycles: 2, done: 1 }, ctx);
  assert.deepEqual([d.people[0].name, d.people[0].cycles, d.people[0].done, d.people[0].deadline], ['Sara B', 2, 1, '2026-12-01']);
  assert.equal(d.people[0].progressAt, ctx.now);
  d = T.run(d, 'removePerson', { id: 'p' }, ctx);
  assert.equal(d.people.length, 0);
});

test('bad colours and dates are repaired on load', () => {
  const d = T.normalize({ steps: ['A'], people: [{ id: 'x', name: 'Z', color: 'red', deadline: '2026-02-31', cycles: -3, done: 'abc' }] });
  assert.match(d.people[0].color, /^#[0-9A-F]{6}$/i);
  assert.equal(d.people[0].deadline, '');
  assert.equal(d.people[0].cycles, 0);
  assert.equal(d.people[0].done, 0);
});

test('run does not change its input and bumps the revision', () => {
  const d = base({ people: [person('p', 'Sara', 0, 0)] });
  const copy = JSON.stringify(d);
  const out = T.run(d, 'stepDone', { id: 'p' }, ctx);
  assert.equal(JSON.stringify(d), copy);
  assert.equal(out.rev, d.rev + 1);
  assert.equal(out.updatedAt, ctx.now);
});

test('cycle name is singular or plural', () => {
  const d = base({ cycleName: 'reel', cyclePlural: '' });
  assert.equal(T.cycleLabel(d, 1), 'reel');
  assert.equal(T.cycleLabel(d, 0), 'reels');
  assert.equal(T.cycleLabel(base({ cycleName: 'video', cyclePlural: 'videos' }), 2), 'videos');
});

test('deadline states', () => {
  assert.equal(T.deadlineInfo('', '2026-11-23').state, 'none');
  assert.equal(T.deadlineInfo('2026-11-20', '2026-11-23').state, 'late');
  assert.equal(T.deadlineInfo('2026-11-23', '2026-11-23').state, 'today');
  assert.equal(T.deadlineInfo('2026-11-25', '2026-11-23').state, 'soon');
  assert.equal(T.deadlineInfo('2026-11-30', '2026-11-23').days, 7);
});

test('summary totals finished reels', () => {
  const d = base({ people: [person('a', 'A', 2, 0), person('b', 'B', 3, 1)] });
  assert.deepEqual(T.summary(d), { people: 2, cycles: 5 });
});
