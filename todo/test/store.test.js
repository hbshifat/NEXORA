import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTodoStore } from '../store.js';

describe('add', () => {
  test('adds a task with the given title, uncompleted', () => {
    const store = createTodoStore();
    const task = store.add('Buy milk');

    assert.equal(task.title, 'Buy milk');
    assert.equal(task.completed, false);
    assert.equal(typeof task.id, 'string');
    assert.ok(task.id.length > 0);
    assert.equal(typeof task.createdAt, 'number');
  });

  test('trims whitespace from the title', () => {
    const store = createTodoStore();
    const task = store.add('  Buy milk  ');
    assert.equal(task.title, 'Buy milk');
  });

  test('assigns unique ids', () => {
    const store = createTodoStore();
    const a = store.add('First');
    const b = store.add('Second');
    assert.notEqual(a.id, b.id);
  });

  test('rejects an empty or whitespace-only title', () => {
    const store = createTodoStore();
    assert.throws(() => store.add(''));
    assert.throws(() => store.add('   '));
  });

  test('rejects a non-string title', () => {
    const store = createTodoStore();
    assert.throws(() => store.add(undefined));
    assert.throws(() => store.add(42));
  });
});

describe('toggle', () => {
  test('flips completed from false to true and back', () => {
    const store = createTodoStore();
    const task = store.add('Buy milk');

    const toggled = store.toggle(task.id);
    assert.equal(toggled.completed, true);

    const toggledAgain = store.toggle(task.id);
    assert.equal(toggledAgain.completed, false);
  });

  test('throws for an unknown id', () => {
    const store = createTodoStore();
    assert.throws(() => store.toggle('does-not-exist'));
  });
});

describe('remove', () => {
  test('removes an existing task and returns true', () => {
    const store = createTodoStore();
    const task = store.add('Buy milk');

    assert.equal(store.remove(task.id), true);
    assert.deepEqual(store.filter('all'), []);
  });

  test('returns false for an unknown id and leaves the store untouched', () => {
    const store = createTodoStore();
    store.add('Buy milk');

    assert.equal(store.remove('does-not-exist'), false);
    assert.equal(store.filter('all').length, 1);
  });
});

describe('filter', () => {
  test('"all" returns every task regardless of status', () => {
    const store = createTodoStore();
    store.add('Active one');
    store.add('Will complete');

    assert.equal(store.filter('all').length, 2);
  });

  test('"active" returns only uncompleted tasks', () => {
    const store = createTodoStore();
    const a = store.add('Active one');
    const b = store.add('Will complete');
    store.toggle(b.id);

    const active = store.filter('active');
    assert.equal(active.length, 1);
    assert.equal(active[0].id, a.id);
  });

  test('"completed" returns only completed tasks', () => {
    const store = createTodoStore();
    const a = store.add('Active one');
    const b = store.add('Will complete');
    store.toggle(b.id);

    const completed = store.filter('completed');
    assert.equal(completed.length, 1);
    assert.equal(completed[0].id, b.id);
  });

  test('defaults to "all" when no status is given', () => {
    const store = createTodoStore();
    store.add('Only task');
    assert.equal(store.filter().length, 1);
  });

  test('rejects an unknown status', () => {
    const store = createTodoStore();
    assert.throws(() => store.filter('bogus'));
  });

  test('returns a snapshot, not a live reference to internal state', () => {
    const store = createTodoStore();
    store.add('Task');
    const snapshot = store.filter('all');
    snapshot.push({ id: 'injected', title: 'injected', completed: false });

    assert.equal(store.filter('all').length, 1);
  });
});

describe('clearCompleted', () => {
  test('removes only completed tasks', () => {
    const store = createTodoStore();
    const a = store.add('Stays active');
    const b = store.add('Gets completed');
    store.toggle(b.id);

    store.clearCompleted();

    const remaining = store.filter('all');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, a.id);
  });

  test('is a no-op when nothing is completed', () => {
    const store = createTodoStore();
    store.add('Still active');
    store.clearCompleted();
    assert.equal(store.filter('all').length, 1);
  });
});

describe('getStats', () => {
  test('reports total, active, and completed counts', () => {
    const store = createTodoStore();
    const a = store.add('One');
    store.add('Two');
    store.add('Three');
    store.toggle(a.id);

    assert.deepEqual(store.getStats(), { total: 3, active: 2, completed: 1 });
  });

  test('reports zeros for an empty store', () => {
    const store = createTodoStore();
    assert.deepEqual(store.getStats(), { total: 0, active: 0, completed: 0 });
  });
});
