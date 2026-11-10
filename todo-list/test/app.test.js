const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../app.js');
const { loadPage, walk } = require('./fake-dom.js');

const KEY = 'todo-list:v1';
const BLANK = "Task title can't be blank.";
const EMPTY = 'No tasks yet. Add your first task above.';
const NO_ACTIVE = 'No active tasks.';
const NO_COMPLETED = 'No completed tasks yet.';
const STORAGE_FAILED = "Couldn't save your tasks in this browser. Changes may be lost when you close this page.";
const CONFIRM = "Delete this task? This can't be undone.";

const createStorage = (value = null) => ({
  value,
  writes: 0,
  getItem() { return this.value; },
  setItem(key, next) {
    assert.equal(key, KEY);
    this.writes += 1;
    this.value = next;
  },
});

// Titles ending in '*' are completed.
const seed = (...titles) => titles.map((title, i) => ({
  id: `id-${i}`,
  title: title.replace(/\*$/, ''),
  completed: title.endsWith('*'),
  createdAt: i,
}));

const setup = ({ tasks, storage, confirmResult = true } = {}) => {
  const document = loadPage();
  const store = storage !== undefined ? storage : createStorage(tasks ? JSON.stringify(tasks) : null);
  const confirmCalls = [];
  App.start({
    document,
    storage: store,
    confirm: (message) => {
      confirmCalls.push(message);
      return confirmResult;
    },
  });

  const byId = (id) => document.getElementById(id);
  const all = () => walk(document.documentElement);
  const byClass = (name) => all().filter((element) => element.className.split(' ').includes(name));
  const type = (field, text) => {
    field.value = text;
    field.fire('input');
  };
  const filterButtons = () => byId('filters').children;
  const ui = {
    document,
    store,
    confirmCalls,
    byId,
    all,
    byClass,
    type,
    addInput: byId('add-title'),
    addError: byId('add-error'),
    addForm: byId('add-form'),
    addButton: byId('add-submit'),
    status: byId('status'),
    warning: byId('storage-warning'),
    listArea: byId('list-area'),
    counts: () => byId('counts').textContent,
    filterButtons,
    filter: (name) => filterButtons().find((button) => button.getAttribute('data-filter') === name),
    pressed: () => filterButtons().filter((button) => button.getAttribute('aria-pressed') === 'true'),
    items: () => all().filter((element) => element.tag === 'li'),
    titles: () => byClass('task-title').map((element) => element.textContent),
    saved: () => JSON.parse(store.value),
    add: (text) => {
      type(ui.addInput, text);
      ui.addButton.click();
    },
    focused: () => document.activeElement,
    checkbox: (index) => byClass('task-toggle')[index],
    edit: (index) => byClass('edit')[index],
    del: (index) => byClass('delete')[index],
    field: () => byId('edit-title'),
    fieldError: () => byId('edit-error'),
    save: () => byClass('save')[0],
    cancel: () => byClass('cancel')[0],
    message: () => byClass('message')[0],
    lists: () => all().filter((element) => element.tag === 'ul'),
  };
  return ui;
};

const assertNoFieldError = (field, error) => {
  assert.equal(error.textContent, '');
  assert.equal(error.hidden, true);
  assert.equal(field.getAttribute('aria-invalid'), null);
  assert.equal(field.getAttribute('aria-describedby'), null);
};

const assertFieldError = (ui, field, error) => {
  assert.equal(error.textContent, BLANK);
  assert.equal(error.hidden, false);
  assert.equal(error.getAttribute('role'), 'alert');
  assert.ok(error.id);
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(field.getAttribute('aria-describedby'), error.id);
  assert.equal(ui.focused(), field);
};

// The message is "next to" the field when it sits in the field's container or
// in the container one level up.
const near = (message, field) =>
  message.parentNode === field.parentNode || message.parentNode === field.parentNode.parentNode;

test('fake DOM refuses HTML injection sinks', () => {
  const { document, addInput } = setup();
  assert.throws(() => { addInput.innerHTML = '<b>x</b>'; });
  assert.throws(() => { addInput.outerHTML = '<b>x</b>'; });
  assert.throws(() => addInput.insertAdjacentHTML('beforeend', '<b>x</b>'));
  assert.throws(() => document.write('<b>x</b>'));
});

// Add task

test('[C5] the add form has a labelled text input and an Add task submit button', () => {
  const ui = setup();
  const label = ui.all().find((element) => element.tag === 'label' && element.htmlFor === 'add-title');
  assert.equal(label.textContent, 'New task');
  assert.equal(ui.addInput.tag, 'input');
  assert.equal(ui.addInput.type, 'text');
  assert.equal(ui.addInput.closest('form'), ui.addForm);
  assert.equal(ui.addButton.textContent, 'Add task');
  assert.equal(ui.addButton.type, 'submit');
  assert.equal(ui.addButton.closest('form'), ui.addForm);
});

test('[C5] clicking Add task creates a trimmed, pending task with an id and creation time', () => {
  const ui = setup();
  const before = Date.now();
  ui.add('   Buy milk  ');
  const [task] = ui.saved();
  assert.equal(task.title, 'Buy milk');
  assert.equal(task.completed, false);
  assert.equal(typeof task.id, 'string');
  assert.ok(task.id.length > 0);
  assert.equal(typeof task.createdAt, 'number');
  assert.ok(task.createdAt >= before && task.createdAt <= Date.now());
  assert.deepEqual(ui.titles(), ['Buy milk']);
});

test('[C5] pressing Enter in the add input creates a task', () => {
  const ui = setup();
  ui.type(ui.addInput, 'By keyboard');
  ui.addInput.press('Enter');
  assert.deepEqual(ui.saved().map((task) => task.title), ['By keyboard']);
});

test('[C5] ids are unique across adds', () => {
  const ui = setup();
  for (let i = 0; i < 50; i += 1) ui.add(`t${i}`);
  assert.equal(new Set(ui.saved().map((task) => task.id)).size, 50);
});

test('[C6] a new task is appended, the input clears and keeps focus, and it announces', () => {
  const ui = setup({ tasks: seed('a', 'b') });
  ui.addInput.focus();
  ui.add('c');
  assert.deepEqual(ui.titles(), ['a', 'b', 'c']);
  assert.deepEqual(ui.saved().map((task) => task.title), ['a', 'b', 'c']);
  assert.equal(ui.addInput.value, '');
  assert.equal(ui.focused(), ui.addInput);
  assert.equal(ui.status.textContent, 'Task added.');
});

test('[C6] adding while on Completed switches the filter to All', () => {
  const ui = setup({ tasks: seed('done*') });
  ui.filter('completed').click();
  ui.add('new');
  assert.deepEqual(ui.pressed(), [ui.filter('all')]);
  assert.deepEqual(ui.titles(), ['done', 'new']);
  assert.equal(ui.focused(), ui.addInput);
});

test('[C6] adding while on Active keeps Active, and the new task is visible', () => {
  const ui = setup({ tasks: seed('done*', 'open') });
  ui.filter('active').click();
  ui.add('new');
  assert.deepEqual(ui.pressed(), [ui.filter('active')]);
  assert.deepEqual(ui.titles(), ['open', 'new']);
});

test('[C7] blank submits create nothing and write nothing', () => {
  const ui = setup();
  for (const text of ['', '   ', '\t ']) ui.add(text);
  ui.type(ui.addInput, '  ');
  ui.addInput.press('Enter');
  assert.equal(ui.store.writes, 0);
  assert.equal(ui.store.value, null);
  assert.equal(ui.message().textContent, EMPTY);
});

test('[C7] a rejected add shows an alert next to the input, tied to it, and keeps focus', () => {
  const ui = setup();
  ui.addInput.focus();
  ui.add('   ');
  assertFieldError(ui, ui.addInput, ui.addError);
  assert.ok(near(ui.addError, ui.addInput));
});

test('[C7] the error clears on the next input event', () => {
  const ui = setup();
  ui.add('');
  ui.type(ui.addInput, 'x');
  assertNoFieldError(ui.addInput, ui.addError);
});

test('[C7] the error clears on the next successful add', () => {
  const ui = setup();
  ui.add('');
  ui.addInput.value = 'ok';
  ui.addButton.click();
  assertNoFieldError(ui.addInput, ui.addError);
  assert.deepEqual(ui.titles(), ['ok']);
});

// View tasks

test('[C8] each task is an li in a ul with a labelled checkbox, Edit, and Delete', () => {
  const ui = setup({ tasks: seed('Buy milk', 'Walk dog') });
  const [list] = ui.lists();
  assert.equal(list.children.length, 2);
  list.children.forEach((item, i) => {
    assert.equal(item.tag, 'li');
    const title = ['Buy milk', 'Walk dog'][i];
    const checkbox = walk(item).find((element) => element.tag === 'input');
    assert.equal(checkbox.type, 'checkbox');
    const label = checkbox.closest('label');
    assert.ok(label, 'checkbox is wrapped in a label');
    assert.equal(label.textContent, title);
    const buttons = walk(item).filter((element) => element.tag === 'button');
    assert.deepEqual(buttons.map((button) => button.textContent), ['Edit', 'Delete']);
    assert.equal(buttons[0].getAttribute('aria-label'), `Edit “${title}”`);
    assert.equal(buttons[1].getAttribute('aria-label'), `Delete “${title}”`);
  });
});

test('[C9] completed tasks are checked with a completed class, pending ones are not', () => {
  const ui = setup({ tasks: seed('open', 'done*') });
  const [open, done] = ui.items();
  assert.equal(ui.checkbox(0).checked, false);
  assert.equal(open.className.split(' ').includes('completed'), false);
  assert.equal(ui.checkbox(1).checked, true);
  assert.equal(done.className.split(' ').includes('completed'), true);
});

// Complete task

test('[C10] toggling a checkbox completes the task, saves, counts, and announces', () => {
  const ui = setup({ tasks: seed('a', 'b') });
  ui.checkbox(1).click();
  assert.deepEqual(ui.saved().map((task) => task.completed), [false, true]);
  assert.equal(ui.counts(), '2 total, 1 completed');
  assert.equal(ui.status.textContent, 'Task marked completed.');
  assert.equal(ui.checkbox(1).checked, true);
  assert.ok(ui.items()[1].className.split(' ').includes('completed'));
  assert.equal(ui.focused(), ui.checkbox(1));
});

test('[C10] toggling again marks the task pending', () => {
  const ui = setup({ tasks: seed('a*') });
  ui.checkbox(0).click();
  assert.equal(ui.saved()[0].completed, false);
  assert.equal(ui.counts(), '1 total, 0 completed');
  assert.equal(ui.status.textContent, 'Task marked pending.');
  assert.equal(ui.checkbox(0).checked, false);
  ui.checkbox(0).click();
  assert.equal(ui.saved()[0].completed, true);
  assert.equal(ui.status.textContent, 'Task marked completed.');
});

test('[C11] completing a task on Active removes it and focuses the following task', () => {
  const ui = setup({ tasks: seed('a', 'b', 'c') });
  ui.filter('active').click();
  ui.checkbox(1).click();
  assert.deepEqual(ui.titles(), ['a', 'c']);
  assert.equal(ui.focused(), ui.checkbox(1));
});

test('[C11] when no task follows, focus goes to the one before', () => {
  const ui = setup({ tasks: seed('a', 'b') });
  ui.filter('active').click();
  ui.checkbox(1).click();
  assert.deepEqual(ui.titles(), ['a']);
  assert.equal(ui.focused(), ui.checkbox(0));
});

test('[C11] when the last visible task leaves, focus goes to the pressed filter', () => {
  const ui = setup({ tasks: seed('a*') });
  ui.filter('completed').click();
  ui.checkbox(0).click();
  assert.equal(ui.message().textContent, NO_COMPLETED);
  assert.equal(ui.focused(), ui.filter('completed'));
});

test('[C11] the neighbor comes from the visible list, not the stored list', () => {
  const ui = setup({ tasks: seed('a', 'hidden*', 'b') });
  ui.filter('active').click();
  ui.checkbox(0).click();
  assert.deepEqual(ui.titles(), ['b']);
  assert.equal(ui.focused(), ui.checkbox(0));
});

// Edit task

test('[C12] Edit opens a labelled input with the title, Save and Cancel, and focuses it', () => {
  const ui = setup({ tasks: seed('a', 'Buy milk') });
  ui.edit(1).click();
  const field = ui.field();
  assert.equal(field.tag, 'input');
  assert.equal(field.type, 'text');
  assert.equal(field.value, 'Buy milk');
  const label = ui.all().find((element) => element.tag === 'label' && element.htmlFor === field.id);
  assert.equal(label.textContent, 'Edit task');
  assert.equal(ui.save().textContent, 'Save');
  assert.equal(ui.cancel().textContent, 'Cancel');
  assert.equal(ui.focused(), field);
  assert.deepEqual(ui.titles(), ['a']);
  assert.equal(ui.items().length, 2);
});

test('[C12] edit mode disables every outside control and re-enables them afterwards', () => {
  const ui = setup({ tasks: seed('a', 'b*', 'c') });
  ui.type(ui.addInput, 'draft');
  ui.edit(1).click();
  const editForm = ui.field().closest('form');
  const controls = ui.all().filter((element) => ['button', 'input'].includes(element.tag));
  const outside = controls.filter((element) => element.closest('form') !== editForm);
  const inside = controls.filter((element) => element.closest('form') === editForm);
  assert.ok(outside.length >= 2 + 3 + 2 * 3);
  for (const element of outside) assert.equal(element.disabled, true, element.className || element.id);
  for (const element of inside) assert.equal(element.disabled, false);
  assert.equal(ui.byClass('edit').length, 2);
  assert.equal(ui.byClass('field-error').filter((e) => e.closest('form') === editForm).length, 1);
  ui.cancel().click();
  for (const element of ui.all().filter((e) => ['button', 'input'].includes(e.tag))) {
    assert.equal(element.disabled, false);
  }
  assert.equal(ui.addInput.value, 'draft');
});

test('[C12] only one task can be in edit mode at a time', () => {
  const ui = setup({ tasks: seed('a', 'b') });
  ui.edit(0).click();
  ui.edit(0).click();
  assert.equal(ui.all().filter((element) => element.id === 'edit-title').length, 1);
  assert.equal(ui.field().value, 'a');
});

test('[C13] Save stores the trimmed title in place, keeps completed, focuses Edit, announces', () => {
  const ui = setup({ tasks: seed('a', 'b*', 'c') });
  ui.edit(1).click();
  ui.type(ui.field(), '  bee  ');
  ui.save().click();
  assert.deepEqual(ui.saved().map((task) => [task.title, task.completed]), [['a', false], ['bee', true], ['c', false]]);
  assert.equal(ui.field(), null);
  assert.deepEqual(ui.titles(), ['a', 'bee', 'c']);
  assert.equal(ui.focused(), ui.edit(1));
  assert.equal(ui.status.textContent, 'Task updated.');
});

test('[C13] Enter in the edit input saves', () => {
  const ui = setup({ tasks: seed('a') });
  ui.edit(0).click();
  ui.type(ui.field(), 'by enter');
  ui.field().press('Enter');
  assert.equal(ui.saved()[0].title, 'by enter');
  assert.equal(ui.focused(), ui.edit(0));
});

test('[C14] a blank edit is rejected and the task stays in edit mode', () => {
  const ui = setup({ tasks: seed('keep') });
  ui.edit(0).click();
  ui.type(ui.field(), '   ');
  ui.save().click();
  assertFieldError(ui, ui.field(), ui.fieldError());
  assert.ok(near(ui.fieldError(), ui.field()));
  assert.equal(ui.store.writes, 0);
  assert.equal(JSON.parse(ui.store.value)[0].title, 'keep');
  ui.field().press('Enter');
  assertFieldError(ui, ui.field(), ui.fieldError());
});

test('[C14] the edit error clears on the next input and on a successful save', () => {
  const ui = setup({ tasks: seed('keep') });
  ui.edit(0).click();
  ui.type(ui.field(), '');
  ui.save().click();
  ui.type(ui.field(), 'x');
  assertNoFieldError(ui.field(), ui.fieldError());
  ui.type(ui.field(), ' ');
  ui.save().click();
  ui.field().value = 'fixed';
  ui.save().click();
  assert.equal(ui.saved()[0].title, 'fixed');
});

test('[C15] Cancel discards changes, leaves edit mode, and focuses Edit', () => {
  const ui = setup({ tasks: seed('a', 'b') });
  ui.edit(1).click();
  ui.type(ui.field(), 'changed');
  ui.cancel().click();
  assert.equal(ui.field(), null);
  assert.deepEqual(ui.titles(), ['a', 'b']);
  assert.equal(ui.store.writes, 0);
  assert.equal(ui.focused(), ui.edit(1));
});

test('[C15] Escape in the edit input discards changes and focuses Edit', () => {
  const ui = setup({ tasks: seed('a') });
  ui.edit(0).click();
  ui.type(ui.field(), 'changed');
  const event = ui.field().press('Escape');
  assert.equal(event.defaultPrevented, true);
  assert.equal(ui.field(), null);
  assert.deepEqual(ui.titles(), ['a']);
  assert.equal(ui.store.writes, 0);
  assert.equal(ui.focused(), ui.edit(0));
});

test('[C15] Escape during IME composition does not leave edit mode', () => {
  const ui = setup({ tasks: seed('a') });
  ui.edit(0).click();
  ui.field().press('Escape', { isComposing: true });
  assert.ok(ui.field());
});

// Delete task

test('[C16] Delete asks for confirmation with the exact text', () => {
  const ui = setup({ tasks: seed('a') });
  ui.del(0).click();
  assert.deepEqual(ui.confirmCalls, [CONFIRM]);
});

test('[C16] a confirmed delete removes the task, counts, announces, and focuses the next one', () => {
  const ui = setup({ tasks: seed('a', 'b*', 'c') });
  ui.del(1).click();
  assert.deepEqual(ui.titles(), ['a', 'c']);
  assert.deepEqual(ui.saved().map((task) => task.title), ['a', 'c']);
  assert.equal(ui.counts(), '2 total, 0 completed');
  assert.equal(ui.status.textContent, 'Task deleted.');
  assert.equal(ui.focused(), ui.checkbox(1));
});

test('[C16] deleting the last visible task focuses the previous one', () => {
  const ui = setup({ tasks: seed('a', 'b') });
  ui.del(1).click();
  assert.equal(ui.focused(), ui.checkbox(0));
});

test('[C16] the next task is taken from the visible list', () => {
  const ui = setup({ tasks: seed('a', 'hidden*', 'b') });
  ui.filter('active').click();
  ui.del(0).click();
  assert.deepEqual(ui.titles(), ['b']);
  assert.equal(ui.focused(), ui.checkbox(0));
});

test('[C16] deleting the only visible task focuses the add input', () => {
  const ui = setup({ tasks: seed('a') });
  ui.del(0).click();
  assert.equal(ui.focused(), ui.addInput);
  assert.equal(ui.message().textContent, EMPTY);
});

test('[C16] a declined delete changes nothing and refocuses Delete', () => {
  const ui = setup({ tasks: seed('a', 'b'), confirmResult: false });
  const button = ui.del(0);
  button.click();
  assert.deepEqual(ui.titles(), ['a', 'b']);
  assert.equal(ui.store.writes, 0);
  assert.equal(ui.counts(), '2 total, 0 completed');
  assert.equal(ui.focused(), button);
});

// Filter tasks

test('[C17] a labelled group holds All, Active, Completed with All pressed on load', () => {
  const ui = setup({ tasks: seed('a') });
  const group = ui.byId('filters');
  assert.equal(group.getAttribute('role'), 'group');
  assert.equal(group.getAttribute('aria-label'), 'Filter tasks');
  const buttons = ui.filterButtons();
  assert.deepEqual(buttons.map((button) => button.tag), ['button', 'button', 'button']);
  assert.deepEqual(buttons.map((button) => button.textContent), ['All', 'Active', 'Completed']);
  assert.deepEqual(buttons.map((button) => button.getAttribute('aria-pressed')), ['true', 'false', 'false']);
});

test('[C17] exactly one filter is pressed after every change', () => {
  const ui = setup({ tasks: seed('a') });
  for (const name of ['active', 'completed', 'all', 'completed']) {
    ui.filter(name).click();
    assert.deepEqual(ui.pressed(), [ui.filter(name)]);
    for (const button of ui.filterButtons()) assert.ok(['true', 'false'].includes(button.getAttribute('aria-pressed')));
  }
});

test('[C18] each filter shows the matching tasks in stored order and keeps focus', () => {
  const ui = setup({ tasks: seed('a', 'b*', 'c', 'd*') });
  assert.deepEqual(ui.titles(), ['a', 'b', 'c', 'd']);
  ui.filter('active').click();
  assert.deepEqual(ui.titles(), ['a', 'c']);
  assert.equal(ui.focused(), ui.filter('active'));
  ui.filter('completed').click();
  assert.deepEqual(ui.titles(), ['b', 'd']);
  assert.equal(ui.focused(), ui.filter('completed'));
  ui.filter('all').click();
  assert.deepEqual(ui.titles(), ['a', 'b', 'c', 'd']);
  assert.equal(ui.focused(), ui.filter('all'));
});

test('[C18] the filter is not persisted and resets to All on reload', () => {
  const ui = setup({ tasks: seed('a', 'b*') });
  const writes = ui.store.writes;
  ui.filter('completed').click();
  assert.equal(ui.store.writes, writes);
  const reloaded = setup({ storage: ui.store });
  assert.deepEqual(reloaded.pressed(), [reloaded.filter('all')]);
  assert.deepEqual(reloaded.titles(), ['a', 'b']);
});

// Counts

test('[C19] counts read total and completed, and update after add, toggle, and delete', () => {
  const ui = setup();
  assert.equal(ui.counts(), '0 total, 0 completed');
  ui.add('a');
  ui.add('b');
  ui.add('c');
  assert.equal(ui.counts(), '3 total, 0 completed');
  ui.checkbox(0).click();
  assert.equal(ui.counts(), '3 total, 1 completed');
  ui.del(2).click();
  assert.equal(ui.counts(), '2 total, 1 completed');
});

test('[C19] counts reflect all tasks regardless of filter', () => {
  const ui = setup({ tasks: seed('a', 'b*', 'c') });
  for (const name of ['all', 'active', 'completed']) {
    ui.filter(name).click();
    assert.equal(ui.counts(), '3 total, 1 completed');
  }
});

// Empty states

test('[C20] with no tasks the list area shows the empty message and no ul', () => {
  const ui = setup();
  assert.equal(ui.listArea.textContent, EMPTY);
  assert.equal(ui.lists().length, 0);
  ui.add('a');
  assert.equal(ui.message(), undefined);
  assert.equal(ui.lists().length, 1);
  ui.del(0).click();
  assert.equal(ui.listArea.textContent, EMPTY);
  assert.equal(ui.lists().length, 0);
});

test('[C21] Active with no pending tasks shows its message, which comes and goes', () => {
  const ui = setup({ tasks: seed('done*') });
  ui.filter('active').click();
  assert.equal(ui.listArea.textContent, NO_ACTIVE);
  assert.equal(ui.lists().length, 0);
  ui.add('open');
  assert.equal(ui.message(), undefined);
  assert.deepEqual(ui.titles(), ['open']);
  ui.checkbox(0).click();
  assert.equal(ui.listArea.textContent, NO_ACTIVE);
});

test('[C21] Completed with no completed tasks shows its message, which comes and goes', () => {
  const ui = setup({ tasks: seed('open') });
  ui.filter('completed').click();
  assert.equal(ui.listArea.textContent, NO_COMPLETED);
  assert.equal(ui.lists().length, 0);
  ui.filter('all').click();
  ui.checkbox(0).click();
  ui.filter('completed').click();
  assert.deepEqual(ui.titles(), ['open']);
  ui.del(0).click();
  assert.equal(ui.listArea.textContent, EMPTY);
  ui.add('x');
  ui.filter('completed').click();
  assert.equal(ui.listArea.textContent, NO_COMPLETED);
});

// Persistence

test('[C22] add, edit, toggle, and delete each write the full list under the key', () => {
  const ui = setup();
  ui.add('a');
  assert.equal(ui.store.writes, 1);
  ui.add('b');
  assert.equal(ui.store.writes, 2);
  assert.deepEqual(ui.saved().map((task) => task.title), ['a', 'b']);
  ui.edit(0).click();
  ui.type(ui.field(), 'A');
  ui.save().click();
  assert.equal(ui.store.writes, 3);
  assert.deepEqual(ui.saved().map((task) => task.title), ['A', 'b']);
  ui.checkbox(1).click();
  assert.equal(ui.store.writes, 4);
  assert.deepEqual(ui.saved().map((task) => task.completed), [false, true]);
  ui.del(0).click();
  assert.equal(ui.store.writes, 5);
  assert.deepEqual(ui.saved().map((task) => task.title), ['b']);
  for (const task of ui.saved()) {
    assert.deepEqual(Object.keys(task).sort(), ['completed', 'createdAt', 'id', 'title']);
  }
});

test('[C22] starting against stored data shows the same tasks, order, and states', () => {
  const tasks = seed('first', 'second*', 'third');
  const ui = setup({ tasks });
  assert.deepEqual(ui.titles(), ['first', 'second', 'third']);
  assert.deepEqual([0, 1, 2].map((i) => ui.checkbox(i).checked), [false, true, false]);
  assert.equal(ui.store.writes, 0);
  const again = setup({ storage: ui.store });
  assert.deepEqual(again.titles(), ['first', 'second', 'third']);
});

test('[C23] bad stored values start empty without throwing or warning', () => {
  for (const raw of [null, '{oops', '{"a":1}', '"x"', '7', 'null']) {
    const ui = setup({ storage: createStorage(raw) });
    assert.equal(ui.listArea.textContent, EMPTY);
    assert.equal(ui.warning.hidden, true);
  }
});

test('[C23] malformed entries are skipped, completed is coerced, duplicates keep the first', () => {
  const raw = JSON.stringify([
    null, 'x', 3, { id: 5, title: 'bad id' }, { id: 'no-title' }, { id: 'blank', title: '  ' },
    { id: 'a', title: 'one', completed: 'true' },
    { id: 'a', title: 'dupe', completed: true },
    { id: 'b', title: 'two', completed: true },
  ]);
  const ui = setup({ storage: createStorage(raw) });
  assert.deepEqual(ui.titles(), ['one', 'two']);
  assert.deepEqual([0, 1].map((i) => ui.checkbox(i).checked), [false, true]);
  assert.equal(ui.counts(), '2 total, 1 completed');
});

test('[C24] a failing read shows the warning and the app keeps working in memory', () => {
  const storage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  const ui = setup({ storage });
  assert.equal(ui.warning.hidden, false);
  assert.equal(ui.warning.textContent, STORAGE_FAILED);
  ui.add('in memory');
  ui.checkbox(0).click();
  assert.deepEqual(ui.titles(), ['in memory']);
  assert.equal(ui.counts(), '1 total, 1 completed');
  assert.equal(ui.warning.hidden, false);
});

test('[C24] a failing write shows the warning and keeps the page state', () => {
  const storage = createStorage();
  storage.setItem = () => { throw new Error('quota'); };
  const ui = setup({ storage });
  assert.equal(ui.warning.hidden, true);
  ui.add('kept');
  assert.equal(ui.warning.hidden, false);
  assert.equal(ui.warning.textContent, STORAGE_FAILED);
  assert.deepEqual(ui.titles(), ['kept']);
  assert.equal(ui.status.textContent, 'Task added.');
});

test('[C24] unavailable storage does not crash the app', () => {
  const ui = setup({ storage: null });
  assert.equal(ui.warning.hidden, false);
  ui.add('works');
  assert.deepEqual(ui.titles(), ['works']);
});

test('[C24] the warning hides again after a later write succeeds', () => {
  const storage = createStorage();
  let fail = true;
  const realSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (fail) throw new Error('quota');
    realSet(key, value);
  };
  const ui = setup({ storage });
  ui.add('a');
  assert.equal(ui.warning.hidden, false);
  fail = false;
  ui.add('b');
  assert.equal(ui.warning.hidden, true);
  assert.deepEqual(ui.saved().map((task) => task.title), ['a', 'b']);
});

// Plain-text safety

test('[C25] markup in a title is shown literally and creates no elements', () => {
  const ui = setup();
  const injected = () => ui.all().filter((element) => ['img', 'b'].includes(element.tag)).length;
  const scripts = () => ui.all().filter((element) => element.tag === 'script').length;
  const scriptsBefore = scripts();
  const titles = ['<img src=x onerror=alert(1)>', '<b>bold</b> &amp;', '<script>alert(1)</script>'];
  for (const title of titles) ui.add(title);
  assert.deepEqual(ui.titles(), titles);
  for (const element of ui.byClass('task-title')) assert.equal(element.children.length, 0);
  assert.equal(injected(), 0);
  assert.equal(scripts(), scriptsBefore);
  assert.equal(ui.edit(0).getAttribute('aria-label'), `Edit “${titles[0]}”`);
  assert.equal(ui.del(1).getAttribute('aria-label'), `Delete “${titles[1]}”`);
});

test('[C25] markup stays literal in the edit input value', () => {
  const ui = setup({ tasks: seed('<b>bold</b> &amp;') });
  ui.edit(0).click();
  assert.equal(ui.field().value, '<b>bold</b> &amp;');
  ui.save().click();
  assert.equal(ui.saved()[0].title, '<b>bold</b> &amp;');
});

// Keyboard and accessibility

test('[C27] controls are native, tabindex is never positive, and click handlers are on controls only', () => {
  const ui = setup({ tasks: seed('a', 'b*') });
  const check = () => {
    for (const element of ui.all()) {
      const tabindex = element.getAttribute('tabindex');
      if (tabindex !== null) assert.ok(Number(tabindex) <= 0, `tabindex ${tabindex}`);
      assert.equal(element.getAttribute('role') === 'button', false);
      if (element.listeners.has('click')) assert.ok(['button', 'input'].includes(element.tag), element.tag);
      if (element.listeners.has('change')) assert.equal(element.tag, 'input');
    }
  };
  check();
  ui.edit(0).click();
  check();
  ui.cancel().click();
  ui.filter('completed').click();
  check();
});

test('[C27] non-submitting buttons do not submit a form', () => {
  const ui = setup({ tasks: seed('a') });
  for (const button of [...ui.filterButtons(), ui.edit(0), ui.del(0)]) {
    assert.equal(button.type, 'button');
  }
  ui.edit(0).click();
  assert.equal(ui.cancel().type, 'button');
  assert.equal(ui.save().type, 'submit');
});

test('[C27] the status region carries the announcements', () => {
  const ui = setup();
  assert.equal(ui.status.getAttribute('role'), 'status');
  ui.add('a');
  assert.equal(ui.status.textContent, 'Task added.');
  assert.equal(ui.all().filter((element) => element.getAttribute('role') === 'status').length, 1);
});
