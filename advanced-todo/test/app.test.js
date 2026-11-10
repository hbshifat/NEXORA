'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../app.js');
const { loadPage, walk } = require('./fake-dom.js');

const KEY = 'advanced-todo:v1';
const PREFS_KEY = 'advanced-todo:prefs:v1';
const TODAY = '2026-11-10';
const NOW = new Date(2026, 10, 10, 9, 30).getTime();
const EMPTY = 'No tasks yet. Add your first task above.';
const BLANK = "Task title can't be blank.";
const STORAGE_WARNING = /Changes may not be saved/;

// A fake localStorage that counts writes per key and can be made to fail.
const createStorage = ({ tasks, prefs, raw = {}, failGet = false, failSet = false } = {}) => {
  const values = new Map(Object.entries(raw));
  if (tasks) values.set(KEY, JSON.stringify(tasks));
  if (prefs) values.set(PREFS_KEY, JSON.stringify(prefs));
  const writes = new Map();
  return {
    values,
    writes,
    failGet,
    failSet,
    writeCount(key = KEY) { return writes.get(key) || 0; },
    getItem(key) {
      if (this.failGet) throw new Error('SecurityError');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (this.failSet) throw new Error('QuotaExceededError');
      assert.ok([KEY, PREFS_KEY].includes(key), key);
      writes.set(key, this.writeCount(key) + 1);
      values.set(key, String(value));
    },
  };
};

// Titles ending in '*' are completed. Later entries are newer.
const seed = (...specs) => specs.map((spec, i) => {
  const fields = typeof spec === 'string' ? { title: spec } : spec;
  const title = fields.title.replace(/\*$/, '');
  return {
    id: `id-${i}`,
    title,
    notes: '',
    priority: 'medium',
    due: null,
    completed: fields.title.endsWith('*'),
    createdAt: i,
    ...fields,
    title,
  };
});

const setup = ({ tasks, prefs, storage, confirmResult = true, now = NOW } = {}) => {
  const document = loadPage();
  const store = storage !== undefined ? storage : createStorage({ tasks, prefs });
  const confirmCalls = [];
  let clock = now;
  App.start({
    document,
    storage: store,
    confirm: (message) => {
      confirmCalls.push(message);
      return typeof confirmResult === 'function' ? confirmResult(message) : confirmResult;
    },
    now: () => clock,
  });

  const byId = (id) => document.getElementById(id);
  const all = () => walk(document.documentElement);
  const byClass = (name, root = document.documentElement) =>
    walk(root).filter((element) => element.className.split(' ').includes(name));
  const type = (field, text) => {
    field.value = text;
    field.fire('input');
  };
  const choose = (select, value) => {
    select.value = value;
    select.fire('input');
    select.fire('change');
  };
  const filterButtons = () => byId('filters').children;
  const items = () => all().filter((element) => element.tag === 'li');
  const itemFor = (title) => items().find((item) => byClass('task-title', item).some((el) => el.textContent === title));
  const buttonIn = (item, name) => walk(item).find((el) => el.tag === 'button' && el.textContent === name);

  const ui = {
    document,
    store,
    confirmCalls,
    byId,
    all,
    byClass,
    type,
    choose,
    setClock: (value) => { clock = value; },
    addInput: byId('add-title'),
    addPriority: byId('add-priority'),
    addDue: byId('add-due'),
    addNotes: byId('add-notes'),
    addError: byId('add-error'),
    addButton: byId('add-submit'),
    search: byId('search'),
    sort: byId('sort'),
    toggleAll: byId('toggle-all'),
    clear: byId('clear-completed'),
    status: () => byId('status').textContent,
    warning: byId('storage-warning'),
    listArea: byId('list-area'),
    counts: () => byId('counts').textContent,
    message: () => byClass('message').map((element) => element.textContent).join('|'),
    filter: (name) => filterButtons().find((button) => button.getAttribute('data-filter') === name),
    pressed: () => filterButtons().filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.getAttribute('data-filter')),
    items,
    itemFor,
    titles: () => byClass('task-title').map((element) => element.textContent),
    checkbox: (title) => walk(itemFor(title)).find((el) => el.tag === 'input' && el.type === 'checkbox'),
    editButton: (title) => buttonIn(itemFor(title), 'Edit'),
    deleteButton: (title) => buttonIn(itemFor(title), 'Delete'),
    saved: () => JSON.parse(store.values.get(KEY)),
    savedPrefs: () => JSON.parse(store.values.get(PREFS_KEY)),
    add: (title, { priority, due, notes } = {}) => {
      type(ui.addInput, title);
      if (priority) ui.choose(ui.addPriority, priority);
      if (due !== undefined) type(ui.addDue, due);
      if (notes !== undefined) type(ui.addNotes, notes);
      ui.addButton.click();
    },
    editor: () => ({
      title: byId('edit-title'),
      notes: byId('edit-notes'),
      priority: byId('edit-priority'),
      due: byId('edit-due'),
      error: byId('edit-error'),
      save: walk(byId('edit-title').closest('form')).find((el) => el.tag === 'button' && el.textContent === 'Save'),
      cancel: walk(byId('edit-title').closest('form')).find((el) => el.tag === 'button' && el.textContent === 'Cancel'),
    }),
    focused: () => document.activeElement,
  };
  return ui;
};

// The accessible name from a for= label or a wrapping label.
const labelText = (ui, control) => {
  const byFor = ui.all().find((el) => el.tag === 'label' && control.id && el.htmlFor === control.id);
  if (byFor) return byFor.textContent;
  const wrapping = control.closest('label');
  return wrapping ? wrapping.textContent : null;
};

test('[C1] a task added through the form is stored with exactly the spec fields', () => {
  const ui = setup();
  ui.add('Write report', { priority: 'high', due: '2026-11-20', notes: 'Q4 numbers' });
  const saved = ui.saved();
  assert.equal(saved.length, 1);
  assert.deepEqual(Object.keys(saved[0]).sort(), ['completed', 'createdAt', 'due', 'id', 'notes', 'priority', 'title']);
  assert.deepEqual({ ...saved[0], id: 'x' }, {
    id: 'x', title: 'Write report', notes: 'Q4 numbers', priority: 'high', due: '2026-11-20', completed: false, createdAt: NOW,
  });
  assert.equal(typeof saved[0].id, 'string');
});

test('[C1] an empty due date is stored as null', () => {
  const ui = setup();
  ui.add('No date');
  assert.equal(ui.saved()[0].due, null);
  assert.equal(ui.saved()[0].priority, 'medium');
  assert.equal(ui.saved()[0].notes, '');
});

test('[C2] every change writes the full task list exactly once', () => {
  const ui = setup({ tasks: seed('A', 'B*', 'C') });
  const step = (action) => {
    const before = ui.store.writeCount();
    action();
    assert.equal(ui.store.writeCount(), before + 1);
  };
  step(() => ui.add('D'));
  step(() => ui.checkbox('A').click());
  step(() => {
    ui.editButton('C').click();
    ui.type(ui.editor().title, 'C2');
    ui.editor().save.click();
  });
  step(() => ui.deleteButton('D').click());
  step(() => ui.toggleAll.click());
  step(() => ui.toggleAll.click());
  step(() => ui.checkbox('A').click());
  step(() => ui.clear.click());
  assert.deepEqual(ui.saved().map((task) => task.title), ['B', 'C2']);
});

test('[C2] actions that change nothing do not write', () => {
  const ui = setup({ tasks: seed('A'), confirmResult: false });
  ui.add('   ');
  ui.deleteButton('A').click();
  ui.editButton('A').click();
  ui.editor().cancel.click();
  assert.equal(ui.store.writeCount(), 0);
});

test('[C2] reloading restores the same tasks in the same state', () => {
  const first = setup();
  first.add('One', { priority: 'low', due: '2026-12-24', notes: 'note' });
  first.add('Two');
  first.checkbox('Two').click();
  const second = setup({ storage: first.store });
  assert.deepEqual(second.titles(), first.titles());
  assert.equal(second.checkbox('Two').checked, true);
  assert.equal(second.checkbox('One').checked, false);
  assert.equal(second.counts(), first.counts());
  assert.deepEqual(second.saved(), first.saved());
});

test('[C3] missing, corrupt, or non-array storage shows the empty state without throwing', () => {
  for (const raw of [undefined, '{oops', '{"id":"a"}', '7']) {
    const storage = createStorage({ raw: raw === undefined ? {} : { [KEY]: raw } });
    const ui = setup({ storage });
    assert.equal(ui.message(), EMPTY);
    assert.equal(ui.warning.hidden, true);
  }
});

test('[C3] invalid entries are skipped and the rest are shown', () => {
  const storage = createStorage({
    raw: {
      [KEY]: JSON.stringify([
        null, 3, { title: 'no id' }, { id: 'b', title: ' ' },
        { id: 'a', title: 'Kept', priority: 'bogus', due: 'soon', completed: 1 },
        { id: 'a', title: 'Dupe' },
      ]),
    },
  });
  const ui = setup({ storage });
  assert.deepEqual(ui.titles(), ['Kept']);
  assert.equal(ui.checkbox('Kept').checked, false);
  assert.match(ui.itemFor('Kept').textContent, /Medium priority/);
});

test('[C4] when reading storage throws, a warning shows and the app works in memory', () => {
  const storage = createStorage({ failGet: true, failSet: true });
  const ui = setup({ storage });
  assert.equal(ui.warning.hidden, false);
  assert.equal(ui.warning.getAttribute('role'), 'alert');
  assert.match(ui.warning.textContent, STORAGE_WARNING);
  ui.add('Still works');
  ui.checkbox('Still works').click();
  assert.deepEqual(ui.titles(), ['Still works']);
  assert.equal(ui.counts(), '1 total, 0 active, 1 completed, 0 overdue');
});

test('[C4] when writing throws (quota), a warning appears and the change stays in memory', () => {
  const storage = createStorage({ tasks: seed('A') });
  const ui = setup({ storage });
  assert.equal(ui.warning.hidden, true);
  storage.failSet = true;
  ui.add('B');
  assert.equal(ui.warning.hidden, false);
  assert.match(ui.warning.textContent, STORAGE_WARNING);
  assert.deepEqual(ui.titles().sort(), ['A', 'B']);
  ui.filter('active').click();
  assert.equal(ui.warning.hidden, false);
  storage.failSet = false;
  ui.add('C');
  ui.filter('all').click();
  assert.equal(ui.warning.hidden, true);
});

test('[C4] a prefs write that succeeds does not hide a failing task save', () => {
  const storage = createStorage();
  const ui = setup({ storage });
  storage.setItem = function setItem(key, value) {
    if (key === KEY) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  };
  ui.add('A');
  assert.equal(ui.warning.hidden, false);
  ui.filter('active').click();
  assert.equal(ui.warning.hidden, false);
});

test('[C4] a missing storage object (storage disabled) never crashes the app', () => {
  const ui = setup({ storage: null });
  assert.equal(ui.warning.hidden, false);
  ui.add('A');
  ui.choose(ui.sort, 'due');
  assert.deepEqual(ui.titles(), ['A']);
});

test('[C5] filter and sort are saved under the prefs key and restored; search is not', () => {
  const first = setup({ tasks: seed('A', 'B*') });
  first.filter('completed').click();
  first.choose(first.sort, 'priority');
  first.type(first.search, 'b');
  assert.deepEqual(first.savedPrefs(), { filter: 'completed', sort: 'priority' });
  assert.equal(first.store.values.get(PREFS_KEY).includes('"b"'), false);
  const second = setup({ storage: first.store });
  assert.deepEqual(second.pressed(), ['completed']);
  assert.equal(second.sort.value, 'priority');
  assert.equal(second.search.value, '');
  assert.deepEqual(second.titles(), ['B']);
});

test('[C5] invalid saved prefs fall back to all and created', () => {
  const storage = createStorage({ tasks: seed('A', 'B*'), raw: { [PREFS_KEY]: '{"filter":"nope","sort":"zzz"}' } });
  const ui = setup({ storage });
  assert.deepEqual(ui.pressed(), ['all']);
  assert.equal(ui.sort.value, 'created');
  assert.deepEqual(ui.titles(), ['B', 'A']);
});

test('[C6] the add form has labelled title, priority (default Medium), and due date fields', () => {
  const ui = setup();
  assert.equal(labelText(ui, ui.addInput), 'New task');
  assert.equal(labelText(ui, ui.addPriority), 'Priority');
  assert.equal(labelText(ui, ui.addDue), 'Due date (optional)');
  assert.equal(ui.addDue.type, 'date');
  assert.equal(ui.addPriority.value, 'medium');
  assert.deepEqual(ui.addPriority.options.map((o) => o.textContent), ['High', 'Medium', 'Low']);
  assert.equal(ui.addButton.type, 'submit');
  assert.equal(ui.addButton.textContent, 'Add task');
});

test('[C6] Enter in the title adds the task and clears the form', () => {
  const ui = setup();
  ui.type(ui.addInput, 'Via Enter');
  ui.choose(ui.addPriority, 'high');
  ui.type(ui.addDue, '2026-11-12');
  ui.addInput.press('Enter');
  assert.deepEqual(ui.titles(), ['Via Enter']);
  assert.equal(ui.addInput.value, '');
  assert.equal(ui.addPriority.value, 'medium');
  assert.equal(ui.addDue.value, '');
  assert.equal(ui.focused(), ui.addInput);
  assert.equal(ui.saved()[0].priority, 'high');
});

test('[C6] clicking Add task adds the task', () => {
  const ui = setup();
  ui.add('Via click');
  assert.deepEqual(ui.titles(), ['Via click']);
  assert.equal(ui.addInput.value, '');
});

test('[C7] a blank title shows an inline alert, adds nothing, and does not write', () => {
  const ui = setup();
  ui.add('   ');
  assert.equal(ui.addError.hidden, false);
  assert.equal(ui.addError.getAttribute('role'), 'alert');
  assert.equal(ui.addError.textContent, BLANK);
  assert.equal(ui.addInput.getAttribute('aria-invalid'), 'true');
  assert.equal(ui.addInput.getAttribute('aria-describedby'), 'add-error');
  assert.equal(ui.focused(), ui.addInput);
  assert.equal(ui.items().length, 0);
  assert.equal(ui.store.writeCount(), 0);
  ui.type(ui.addInput, 'x');
  assert.equal(ui.addError.hidden, true);
  assert.equal(ui.addInput.hasAttribute('aria-invalid'), false);
});

test('[C7] titles are trimmed; long titles and notes are limited', () => {
  const ui = setup();
  assert.equal(ui.addInput.getAttribute('maxlength'), '200');
  assert.equal(ui.addNotes.getAttribute('maxlength'), '1000');
  ui.add('   padded   ');
  assert.deepEqual(ui.titles(), ['padded']);
  ui.add('a'.repeat(201));
  assert.match(ui.addError.textContent, /200 characters/);
  ui.add('ok', { notes: 'n'.repeat(1001) });
  assert.match(ui.addError.textContent, /1000 characters/);
  assert.equal(ui.addNotes.getAttribute('aria-invalid'), 'true');
  assert.equal(ui.items().length, 1);
  assert.equal(ui.store.writeCount(), 1);
});

test('[C8] editing in place with Enter saves all fields and returns focus to Edit', () => {
  const ui = setup({ tasks: seed('Draft') });
  ui.editButton('Draft').click();
  const editor = ui.editor();
  assert.equal(ui.focused(), editor.title);
  assert.equal(editor.title.value, 'Draft');
  assert.equal(labelText(ui, editor.title), 'Title');
  assert.equal(labelText(ui, editor.notes), 'Notes (optional)');
  assert.equal(labelText(ui, editor.priority), 'Priority');
  assert.equal(labelText(ui, editor.due), 'Due date (optional)');
  ui.type(editor.title, '  Final  ');
  ui.type(editor.notes, 'details');
  ui.choose(editor.priority, 'low');
  ui.type(editor.due, '2026-11-30');
  editor.title.press('Enter');
  assert.equal(ui.byId('edit-title'), null);
  assert.deepEqual(ui.saved()[0], { ...seed('Draft')[0], title: 'Final', notes: 'details', priority: 'low', due: '2026-11-30' });
  assert.equal(ui.focused(), ui.editButton('Final'));
  assert.match(ui.status(), /updated/);
});

test('[C8] the Save button commits', () => {
  const ui = setup({ tasks: seed('One') });
  ui.editButton('One').click();
  ui.type(ui.editor().title, 'Uno');
  ui.editor().save.click();
  assert.deepEqual(ui.titles(), ['Uno']);
  assert.equal(ui.focused(), ui.editButton('Uno'));
});

test('[C8] Escape and Cancel discard changes and return focus to Edit', () => {
  const ui = setup({ tasks: seed({ title: 'Keep', notes: 'orig', priority: 'high', due: '2026-12-01' }) });
  for (const discard of [(editor) => editor.notes.press('Escape'), (editor) => editor.cancel.click()]) {
    ui.editButton('Keep').click();
    const editor = ui.editor();
    ui.type(editor.title, 'Changed');
    ui.type(editor.notes, 'changed');
    ui.choose(editor.priority, 'low');
    ui.type(editor.due, '');
    discard(editor);
    assert.equal(ui.byId('edit-title'), null);
    assert.deepEqual(ui.titles(), ['Keep']);
    assert.equal(ui.focused(), ui.editButton('Keep'));
    ui.editButton('Keep').click();
    assert.equal(ui.editor().notes.value, 'orig');
    assert.equal(ui.editor().priority.value, 'high');
    assert.equal(ui.editor().due.value, '2026-12-01');
    ui.editor().cancel.click();
  }
  assert.equal(ui.store.writeCount(), 0);
});

test('[C8] a blank title on save shows an inline error and keeps the edit open', () => {
  const ui = setup({ tasks: seed('Keep') });
  ui.editButton('Keep').click();
  ui.type(ui.editor().title, '   ');
  ui.editor().save.click();
  const editor = ui.editor();
  assert.notEqual(editor.title, null);
  assert.equal(editor.error.hidden, false);
  assert.equal(editor.error.getAttribute('role'), 'alert');
  assert.equal(editor.error.textContent, BLANK);
  assert.equal(editor.title.getAttribute('aria-invalid'), 'true');
  assert.equal(ui.focused(), editor.title);
  assert.equal(ui.store.writeCount(), 0);
});

test('[C8] while editing, other controls are disabled', () => {
  const ui = setup({ tasks: seed('A', 'B*') });
  ui.editButton('A').click();
  for (const control of [ui.addInput, ui.addButton, ui.search, ui.sort, ui.toggleAll, ui.clear, ui.filter('all'), ui.checkbox('B'), ui.deleteButton('B')]) {
    assert.equal(control.disabled, true, control.id || control.textContent);
  }
  ui.editor().cancel.click();
  assert.equal(ui.addInput.disabled, false);
  assert.equal(ui.clear.disabled, false);
});

test('[C9] each checkbox is labelled with its title and toggles completed', () => {
  const ui = setup({ tasks: seed('Wash car') });
  const checkbox = ui.checkbox('Wash car');
  assert.equal(labelText(ui, checkbox), 'Wash car');
  checkbox.click();
  assert.equal(ui.saved()[0].completed, true);
  assert.ok(ui.itemFor('Wash car').className.split(' ').includes('completed'));
  assert.match(ui.itemFor('Wash car').textContent, /Done/);
  assert.equal(ui.focused(), ui.checkbox('Wash car'));
  ui.checkbox('Wash car').click();
  assert.equal(ui.saved()[0].completed, false);
  assert.equal(ui.itemFor('Wash car').className.split(' ').includes('completed'), false);
});

test('[C10] cancelling delete changes nothing', () => {
  const ui = setup({ tasks: seed('Stay'), confirmResult: false });
  ui.deleteButton('Stay').click();
  assert.equal(ui.confirmCalls.length, 1);
  assert.match(ui.confirmCalls[0], /Stay/);
  assert.deepEqual(ui.titles(), ['Stay']);
  assert.equal(ui.store.writeCount(), 0);
  assert.equal(ui.focused(), ui.deleteButton('Stay'));
});

test('[C10] after delete, focus moves to the next task, else the previous, else the add input', () => {
  // Newest first, so the display order is C, B, A.
  const ui = setup({ tasks: seed('A', 'B', 'C') });
  ui.deleteButton('B').click();
  assert.deepEqual(ui.titles(), ['C', 'A']);
  assert.equal(ui.focused(), ui.checkbox('A'));
  ui.deleteButton('A').click();
  assert.equal(ui.focused(), ui.checkbox('C'));
  ui.deleteButton('C').click();
  assert.equal(ui.focused(), ui.addInput);
  assert.equal(ui.message(), EMPTY);
});

test('[C11] filter buttons set aria-pressed and limit the list', () => {
  const ui = setup({ tasks: seed('A', 'B*', 'C') });
  assert.deepEqual(ui.pressed(), ['all']);
  ui.filter('active').click();
  assert.deepEqual(ui.pressed(), ['active']);
  assert.deepEqual(ui.titles(), ['C', 'A']);
  assert.equal(ui.focused(), ui.filter('active'));
  ui.filter('completed').click();
  assert.deepEqual(ui.pressed(), ['completed']);
  assert.deepEqual(ui.titles(), ['B']);
  ui.filter('all').click();
  assert.deepEqual(ui.titles(), ['C', 'B', 'A']);
});

test('[C11] completing a task under the Active filter moves focus to a neighbour', () => {
  const ui = setup({ tasks: seed('A', 'B', 'C'), prefs: { filter: 'active', sort: 'created' } });
  ui.checkbox('B').click();
  assert.deepEqual(ui.titles(), ['C', 'A']);
  assert.equal(ui.focused(), ui.checkbox('A'));
});

test('[C12] search filters by title or notes, case-insensitively, combined with the filter', () => {
  const ui = setup({ tasks: seed('Buy MILK', { title: 'Call mum', notes: 'ask about milk' }, 'Milk cow*', 'Other') });
  assert.equal(labelText(ui, ui.search), 'Search tasks');
  ui.type(ui.search, 'milk');
  assert.deepEqual(ui.titles(), ['Milk cow', 'Call mum', 'Buy MILK']);
  ui.filter('active').click();
  assert.deepEqual(ui.titles(), ['Call mum', 'Buy MILK']);
  ui.type(ui.search, '');
  assert.deepEqual(ui.titles(), ['Other', 'Call mum', 'Buy MILK']);
  assert.equal(ui.store.writeCount(), 0);
});

test('[C13] the sort select offers newest, due date, and priority, and never reorders storage', () => {
  const tasks = seed(
    { title: 'Low late', priority: 'low', due: '2026-12-01' },
    { title: 'High none', priority: 'high' },
    { title: 'Med soon', priority: 'medium', due: '2026-11-11' },
    { title: 'High soon', priority: 'high', due: '2026-11-11' },
  );
  const ui = setup({ tasks });
  assert.equal(labelText(ui, ui.sort), 'Sort by');
  assert.deepEqual(ui.sort.options.map((o) => [o.value, o.textContent]), [
    ['created', 'Newest first'], ['due', 'Due date'], ['priority', 'Priority'],
  ]);
  assert.deepEqual(ui.titles(), ['High soon', 'Med soon', 'High none', 'Low late']);
  ui.choose(ui.sort, 'due');
  assert.deepEqual(ui.titles(), ['High soon', 'Med soon', 'Low late', 'High none']);
  ui.choose(ui.sort, 'priority');
  assert.deepEqual(ui.titles(), ['High soon', 'High none', 'Med soon', 'Low late']);
  ui.checkbox('Low late').click();
  assert.deepEqual(ui.saved().map((task) => task.title), ['Low late', 'High none', 'Med soon', 'High soon']);
});

test('[C14] overdue, due today, and future dates have text labels from the injected clock', () => {
  const ui = setup({
    tasks: seed(
      { title: 'Late', due: '2026-11-09' },
      { title: 'Late done*', due: '2026-11-01' },
      { title: 'Now', due: TODAY },
      { title: 'Later', due: '2026-11-11' },
      { title: 'Never' },
    ),
  });
  const due = (title) => ui.byClass('task-due', ui.itemFor(title)).map((el) => el.textContent).join('');
  assert.match(due('Late'), /^Overdue/);
  assert.match(due('Late'), /2026-11-09/);
  assert.ok(ui.itemFor('Late').className.split(' ').includes('overdue'));
  assert.doesNotMatch(due('Late done'), /Overdue/);
  assert.equal(due('Now'), 'Due today');
  assert.equal(due('Later'), 'Due 2026-11-11');
  assert.equal(due('Never'), '');
});

test('[C14] the clock decides what is overdue', () => {
  const ui = setup({ tasks: seed({ title: 'T', due: '2026-11-11' }), now: new Date(2026, 10, 12, 0, 1).getTime() });
  assert.match(ui.itemFor('T').textContent, /Overdue/);
  assert.equal(ui.counts(), '1 total, 1 active, 0 completed, 1 overdue');
});

test('[C15] priority shows as a text label on each task', () => {
  const ui = setup({ tasks: seed({ title: 'H', priority: 'high' }, { title: 'M' }, { title: 'L', priority: 'low' }) });
  const label = (title) => ui.byClass('task-priority', ui.itemFor(title))[0].textContent;
  assert.equal(label('H'), 'High priority');
  assert.equal(label('M'), 'Medium priority');
  assert.equal(label('L'), 'Low priority');
});

test('[C16] the counts line covers all tasks, not just visible ones', () => {
  const ui = setup({
    tasks: seed({ title: 'A', due: '2026-11-01' }, 'B*', 'C', 'D*', { title: 'E', due: '2026-12-01' }),
  });
  assert.equal(ui.counts(), '5 total, 3 active, 2 completed, 1 overdue');
  ui.filter('completed').click();
  ui.type(ui.search, 'D');
  assert.equal(ui.counts(), '5 total, 3 active, 2 completed, 1 overdue');
  ui.type(ui.search, '');
  ui.filter('all').click();
  ui.checkbox('A').click();
  assert.equal(ui.counts(), '5 total, 2 active, 3 completed, 0 overdue');
});

test('[C17] empty states differ for no tasks, no filter matches, and no search matches', () => {
  const ui = setup();
  assert.equal(ui.message(), EMPTY);
  ui.add('Only active');
  ui.filter('completed').click();
  assert.equal(ui.message(), 'No completed tasks yet.');
  ui.filter('all').click();
  ui.type(ui.search, 'zzz');
  assert.equal(ui.message(), 'No tasks match “zzz”.');
  ui.type(ui.search, '');
  ui.checkbox('Only active').click();
  ui.filter('active').click();
  assert.equal(ui.message(), 'No active tasks. Everything is done.');
  const messages = new Set([EMPTY, 'No completed tasks yet.', 'No tasks match “zzz”.', 'No active tasks. Everything is done.']);
  assert.equal(messages.size, 4);
});

test('[C18] Mark all complete toggles to Mark all active and is disabled with no tasks', () => {
  const ui = setup();
  assert.equal(ui.toggleAll.disabled, true);
  ui.add('A');
  ui.add('B');
  assert.equal(ui.toggleAll.disabled, false);
  assert.equal(ui.toggleAll.textContent, 'Mark all complete');
  ui.toggleAll.click();
  assert.ok(ui.saved().every((task) => task.completed));
  assert.equal(ui.toggleAll.textContent, 'Mark all active');
  assert.equal(ui.focused(), ui.toggleAll);
  ui.toggleAll.click();
  assert.ok(ui.saved().every((task) => !task.completed));
  assert.equal(ui.toggleAll.textContent, 'Mark all complete');
});

test('[C19] Clear completed confirms with the count and is disabled with none completed', () => {
  const ui = setup({ tasks: seed('A*', 'B', 'C*') });
  assert.equal(ui.clear.disabled, false);
  ui.clear.click();
  assert.equal(ui.confirmCalls.length, 1);
  assert.match(ui.confirmCalls[0], /\b2 completed tasks\b/);
  assert.deepEqual(ui.titles(), ['B']);
  assert.equal(ui.clear.disabled, true);
  assert.equal(ui.focused(), ui.toggleAll);
});

test('[C19] cancelling Clear completed changes nothing; one task uses the singular', () => {
  const ui = setup({ tasks: seed('A*', 'B'), confirmResult: false });
  ui.clear.click();
  assert.match(ui.confirmCalls[0], /\b1 completed task\?/);
  assert.deepEqual(ui.titles(), ['B', 'A']);
  assert.equal(ui.store.writeCount(), 0);
});

test('[C20] every input, select, and textarea has a label, and task buttons name the task', () => {
  const ui = setup({ tasks: seed('Pay rent') });
  const check = () => {
    for (const control of ui.all().filter((el) => ['input', 'select', 'textarea'].includes(el.tag))) {
      const text = labelText(ui, control);
      assert.ok(text && text.trim() !== '', `${control.tag}#${control.id} has no label`);
    }
  };
  check();
  assert.equal(ui.editButton('Pay rent').getAttribute('aria-label'), 'Edit “Pay rent”');
  assert.equal(ui.deleteButton('Pay rent').getAttribute('aria-label'), 'Delete “Pay rent”');
  ui.editButton('Pay rent').click();
  check();
});

test('[C20] all task controls are native, focusable elements', () => {
  const ui = setup({ tasks: seed('A') });
  for (const control of [ui.checkbox('A'), ui.editButton('A'), ui.deleteButton('A'), ui.toggleAll, ui.search, ui.sort]) {
    control.focus();
    assert.equal(ui.focused(), control);
  }
  for (const button of ui.all().filter((el) => el.tag === 'button')) assert.equal(button.type === 'submit' || button.type === 'button', true);
});

test('[C21] changes are announced in the status live region', () => {
  const ui = setup({ tasks: seed('Old*') });
  const region = ui.byId('status');
  assert.equal(region.getAttribute('role'), 'status');
  assert.ok(region.className.split(' ').includes('visually-hidden'));
  ui.add('New');
  assert.match(ui.status(), /“New” added/);
  ui.checkbox('New').click();
  assert.match(ui.status(), /“New” marked complete/);
  ui.checkbox('New').click();
  assert.match(ui.status(), /“New” marked active/);
  ui.deleteButton('New').click();
  assert.match(ui.status(), /“New” deleted/);
  ui.clear.click();
  assert.match(ui.status(), /Cleared 1 task/);
});

test('[C23] titles and notes render as plain text, never as markup', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const ui = setup();
  ui.add(payload, { notes: '<b>bold</b>' });
  assert.deepEqual(ui.titles(), [payload]);
  assert.equal(ui.byClass('task-notes')[0].textContent, '<b>bold</b>');
  assert.equal(ui.all().some((el) => el.tag === 'img' || el.tag === 'b'), false);
  assert.equal(ui.editButton(payload).getAttribute('aria-label'), `Edit “${payload}”`);
});

test('[C23] the fake DOM throws if the app reaches for an HTML sink', () => {
  const ui = setup();
  assert.throws(() => { ui.listArea.innerHTML = '<p>'; }, /forbidden/);
  assert.throws(() => ui.document.write('x'), /forbidden/);
});
