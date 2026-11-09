const test = require('node:test');
const assert = require('node:assert/strict');
const App = require('../app.js');
const { loadPage, walk } = require('./fake-dom.js');

const KEY = 'quick-notes:v1';
const BLANK = "Note can't be blank. Type something first.";
const EMPTY = 'No notes yet. Write your first note above to get started.';
const STORAGE_FAILED = "Couldn't save your notes in this browser. Changes may be lost when you close this page.";
const CONFIRM = "Delete this note? This can't be undone.";

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

const seed = (...texts) => texts.map((text, i) => ({ id: `id-${i}`, text, createdAt: i }));

const setup = ({ notes, storage, confirmResult = true } = {}) => {
  const document = loadPage();
  const store = storage !== undefined ? storage : createStorage(notes ? JSON.stringify(notes) : null);
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
  const ui = {
    document,
    store,
    confirmCalls,
    byId,
    all,
    byClass,
    type,
    addInput: byId('add-text'),
    addError: byId('add-error'),
    addForm: byId('add-form'),
    addButton: byId('add-submit'),
    search: byId('search'),
    status: byId('status'),
    warning: byId('storage-warning'),
    listArea: byId('list-area'),
    texts: () => byClass('note-text').map((element) => element.textContent),
    saved: () => JSON.parse(store.value),
    add: (text) => {
      type(ui.addInput, text);
      ui.addButton.click();
    },
    focused: () => document.activeElement,
    edit: (index) => byClass('edit')[index],
    del: (index) => byClass('delete')[index],
    field: () => byId('edit-text'),
    fieldError: () => byId('edit-error'),
    save: () => byClass('save')[0],
    cancel: () => byClass('cancel')[0],
    clearButton: () => byClass('clear-search')[0],
    message: () => byClass('message')[0],
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

test('fake DOM refuses HTML injection sinks', () => {
  const { document, addInput } = setup();
  assert.throws(() => { addInput.innerHTML = '<b>x</b>'; });
  assert.throws(() => { addInput.outerHTML = '<b>x</b>'; });
  assert.throws(() => addInput.insertAdjacentHTML('beforeend', '<b>x</b>'));
  assert.throws(() => document.write('<b>x</b>'));
});

test('[C4] submitting text creates a trimmed note with an id and creation time', () => {
  const ui = setup();
  const before = Date.now();
  ui.add('  first line\n\n  second  line \n');
  const [note] = ui.saved();
  assert.equal(note.text, 'first line\n\n  second  line');
  assert.equal(typeof note.id, 'string');
  assert.ok(note.createdAt >= before && note.createdAt <= Date.now());
});

test('[C4] ids are unique across adds', () => {
  const ui = setup();
  for (let i = 0; i < 50; i += 1) ui.add(`n${i}`);
  assert.equal(new Set(ui.saved().map((note) => note.id)).size, 50);
});

test('[C5] a new note goes on top, clears the field and search, and announces', () => {
  const ui = setup({ notes: seed('older', 'oldest') });
  ui.type(ui.search, 'older');
  assert.deepEqual(ui.texts(), ['older']);
  ui.addInput.focus();
  ui.add('newest');
  assert.deepEqual(ui.texts(), ['newest', 'older', 'oldest']);
  assert.equal(ui.addInput.value, '');
  assert.equal(ui.search.value, '');
  assert.equal(ui.focused(), ui.addInput);
  assert.equal(ui.status.textContent, 'Note added.');
});

test('[C6] blank submits create nothing and write nothing', () => {
  const ui = setup();
  for (const text of ['', '   ', '\t\n', '  ']) ui.add(text);
  assert.equal(ui.store.writes, 0);
  assert.equal(ui.store.value, null);
  assert.deepEqual(ui.texts(), []);
});

test('[C7] a rejected submit shows an alert tied to the field and focuses it', () => {
  const ui = setup();
  assert.equal(ui.addError.hidden, true);
  ui.add('   ');
  assertFieldError(ui, ui.addInput, ui.addError);
});

test('[C7] the error clears on the next input', () => {
  const ui = setup();
  ui.add('');
  ui.type(ui.addInput, 'a');
  assertNoFieldError(ui.addInput, ui.addError);
});

test('[C7] the error clears on the next successful submit', () => {
  const ui = setup();
  ui.add('');
  ui.addInput.value = 'real text';
  ui.addButton.click();
  assertNoFieldError(ui.addInput, ui.addError);
  assert.deepEqual(ui.texts(), ['real text']);
});

test('[C8] a blank edit is rejected and the note stays in edit mode', () => {
  const ui = setup({ notes: seed('keep me') });
  ui.edit(0).click();
  const field = ui.field();
  field.value = ' \n ';
  const writes = ui.store.writes;
  ui.save().click();
  assertFieldError(ui, field, ui.fieldError());
  assert.equal(ui.field(), field);
  assert.equal(ui.store.writes, writes);
  assert.equal(ui.saved()[0].text, 'keep me');
  ui.type(field, 'x');
  assertNoFieldError(field, ui.fieldError());
});

test('[C9] every note has Edit, which opens a labelled, focused textarea', () => {
  const ui = setup({ notes: seed('one', 'two') });
  assert.equal(ui.byClass('edit').length, 2);
  assert.equal(ui.edit(1).textContent, 'Edit');
  ui.edit(1).click();
  assert.deepEqual(ui.texts(), ['one']);
  const field = ui.field();
  assert.equal(field.tag, 'textarea');
  assert.equal(field.value, 'two');
  const label = ui.all().find((element) => element.tag === 'label' && element.htmlFor === field.id);
  assert.equal(label.textContent, 'Edit note');
  assert.equal(ui.save().textContent, 'Save');
  assert.equal(ui.cancel().textContent, 'Cancel');
  assert.equal(ui.focused(), field);
});

test('[C10] Save stores trimmed text in place and focuses the Edit button', () => {
  const ui = setup({ notes: seed('one', 'two', 'three') });
  ui.edit(1).click();
  ui.field().value = '  changed  ';
  ui.save().click();
  assert.deepEqual(ui.texts(), ['one', 'changed', 'three']);
  assert.deepEqual(ui.saved().map((note) => note.text), ['one', 'changed', 'three']);
  assert.equal(ui.saved()[1].id, 'id-1');
  assert.equal(ui.field(), null);
  assert.equal(ui.focused(), ui.edit(1));
  assert.equal(ui.status.textContent, 'Note saved.');
});

test('[C10] a note edited out of the search leaves the list and focus goes to search', () => {
  const ui = setup({ notes: seed('apple one', 'apple two') });
  ui.type(ui.search, 'apple');
  ui.edit(0).click();
  ui.field().value = 'pear';
  ui.save().click();
  assert.deepEqual(ui.texts(), ['apple two']);
  assert.equal(ui.focused(), ui.search);
  assert.equal(ui.status.textContent, 'Note saved.');
});

test('[C11] Cancel discards changes and focuses the Edit button', () => {
  const ui = setup({ notes: seed('one', 'two') });
  ui.edit(1).click();
  ui.field().value = 'discard me';
  const writes = ui.store.writes;
  ui.cancel().click();
  assert.deepEqual(ui.texts(), ['one', 'two']);
  assert.equal(ui.store.writes, writes);
  assert.equal(ui.field(), null);
  assert.equal(ui.focused(), ui.edit(1));
});

test('[C11] Escape in the textarea discards changes and focuses the Edit button', () => {
  const ui = setup({ notes: seed('one', 'two') });
  ui.edit(0).click();
  ui.field().value = 'discard me';
  ui.field().fire('keydown', { key: 'Escape' });
  assert.deepEqual(ui.texts(), ['one', 'two']);
  assert.equal(ui.field(), null);
  assert.equal(ui.focused(), ui.edit(0));
});

test('[C11] Escape during IME composition does not leave edit mode', () => {
  const ui = setup({ notes: seed('one') });
  ui.edit(0).click();
  ui.field().fire('keydown', { key: 'Escape', isComposing: true });
  assert.notEqual(ui.field(), null);
});

test('[C12] edit mode disables every outside control and restores them afterwards', () => {
  const ui = setup({ notes: seed('one', 'two', 'three') });
  ui.type(ui.addInput, 'draft in progress');
  ui.edit(1).click();
  const outside = [ui.addInput, ui.addButton, ui.search, ...ui.byClass('edit'), ...ui.byClass('delete')];
  assert.equal(outside.length, 7);
  for (const control of outside) assert.equal(control.disabled, true, control.tagName);
  for (const control of [ui.field(), ui.save(), ui.cancel()]) assert.equal(control.disabled, false);

  ui.cancel().click();
  const after = [ui.addInput, ui.addButton, ui.search, ...ui.byClass('edit'), ...ui.byClass('delete')];
  assert.equal(after.length, 9);
  for (const control of after) assert.equal(control.disabled, false, control.tagName);
  assert.equal(ui.addInput.value, 'draft in progress');
});

test('[C12] controls are enabled again after a save', () => {
  const ui = setup({ notes: seed('one', 'two') });
  ui.edit(0).click();
  ui.save().click();
  for (const control of [ui.addInput, ui.addButton, ui.search, ...ui.byClass('edit'), ...ui.byClass('delete')]) {
    assert.equal(control.disabled, false);
  }
});

test('[C13] Delete asks for confirmation with the exact text', () => {
  const ui = setup({ notes: seed('one') });
  assert.equal(ui.del(0).tag, 'button');
  assert.equal(ui.del(0).textContent, 'Delete');
  ui.del(0).click();
  assert.deepEqual(ui.confirmCalls, [CONFIRM]);
});

test('[C14] confirmed delete removes the note, announces, and focuses the next note', () => {
  const ui = setup({ notes: seed('one', 'two', 'three') });
  ui.del(1).click();
  assert.deepEqual(ui.texts(), ['one', 'three']);
  assert.deepEqual(ui.saved().map((note) => note.text), ['one', 'three']);
  assert.equal(ui.status.textContent, 'Note deleted.');
  assert.equal(ui.focused(), ui.edit(1));
});

test('[C14] deleting the last visible note focuses the one before it', () => {
  const ui = setup({ notes: seed('one', 'two') });
  ui.del(1).click();
  assert.equal(ui.focused(), ui.edit(0));
});

test('[C14] deleting the only note focuses the add field', () => {
  const ui = setup({ notes: seed('one') });
  ui.del(0).click();
  assert.equal(ui.focused(), ui.addInput);
});

test('[C14] the following note is taken from the visible list', () => {
  const ui = setup({ notes: seed('match a', 'hidden', 'match b') });
  ui.type(ui.search, 'match');
  ui.del(0).click();
  assert.deepEqual(ui.texts(), ['match b']);
  assert.equal(ui.focused(), ui.edit(0));
});

test('[C14] a declined delete changes nothing and refocuses Delete', () => {
  const ui = setup({ notes: seed('one', 'two'), confirmResult: false });
  const button = ui.del(1);
  const writes = ui.store.writes;
  button.click();
  assert.deepEqual(ui.texts(), ['one', 'two']);
  assert.equal(ui.store.writes, writes);
  assert.equal(ui.status.textContent, '');
  assert.equal(ui.focused(), button);
});

test('[C15] each input event filters the list', () => {
  const ui = setup({ notes: seed('Buy MILK', 'call mum') });
  ui.type(ui.search, 'mil');
  assert.deepEqual(ui.texts(), ['Buy MILK']);
  ui.type(ui.search, '  M ');
  assert.deepEqual(ui.texts(), ['Buy MILK', 'call mum']);
  ui.type(ui.search, '   ');
  assert.deepEqual(ui.texts(), ['Buy MILK', 'call mum']);
  ui.type(ui.search, '');
  assert.deepEqual(ui.texts(), ['Buy MILK', 'call mum']);
});

test('[C16] regular expression characters in the field do not throw', () => {
  const ui = setup({ notes: seed('plain', 'a.*b', 'f(x)', 'l[0]') });
  ui.type(ui.search, '.*');
  assert.deepEqual(ui.texts(), ['a.*b']);
  ui.type(ui.search, '(');
  assert.deepEqual(ui.texts(), ['f(x)']);
  ui.type(ui.search, '[');
  assert.deepEqual(ui.texts(), ['l[0]']);
});

test('[C17] no match shows a message and a Clear search button, and announces', () => {
  const ui = setup({ notes: seed('one', 'two') });
  ui.type(ui.search, '  zebra ');
  assert.equal(ui.message().textContent, 'No notes match "zebra".');
  assert.notEqual(ui.message().textContent, EMPTY);
  assert.equal(ui.status.textContent, 'No notes match "zebra".');

  const clear = ui.clearButton();
  assert.equal(clear.tag, 'button');
  assert.equal(clear.textContent, 'Clear search');
  clear.click();
  assert.equal(ui.search.value, '');
  assert.deepEqual(ui.texts(), ['one', 'two']);
  assert.equal(ui.focused(), ui.search);
  assert.equal(ui.status.textContent, '');
  assert.equal(ui.clearButton(), undefined);
});

test('[C17] a stale no-match announcement is cleared when results return', () => {
  const ui = setup({ notes: seed('one') });
  ui.type(ui.search, 'zebra');
  ui.type(ui.search, 'on');
  assert.equal(ui.status.textContent, '');
});

test('[C18] add, edit, and delete each write the full list under the key', () => {
  const ui = setup();
  ui.add('one');
  assert.equal(ui.store.writes, 1);
  ui.add('two');
  assert.equal(ui.store.writes, 2);
  assert.deepEqual(ui.saved().map((note) => note.text), ['two', 'one']);
  ui.edit(0).click();
  ui.field().value = 'two edited';
  ui.save().click();
  assert.equal(ui.store.writes, 3);
  assert.deepEqual(ui.saved().map((note) => note.text), ['two edited', 'one']);
  ui.del(1).click();
  assert.equal(ui.store.writes, 4);
  assert.deepEqual(ui.saved().map((note) => note.text), ['two edited']);
});

test('[C18] starting against stored data shows the same notes in the same order', () => {
  const first = setup();
  first.add('oldest');
  first.add('middle\nline');
  first.add('newest');
  const second = setup({ storage: createStorage(first.store.value) });
  assert.deepEqual(second.texts(), first.texts());
  assert.deepEqual(second.texts(), ['newest', 'middle\nline', 'oldest']);
});

test('[C19] bad stored values start empty without throwing or warning', () => {
  for (const value of [null, '{broken', '{"a":1}', '7', 'null']) {
    const ui = setup({ storage: createStorage(value) });
    assert.equal(ui.message().textContent, EMPTY, String(value));
    assert.equal(ui.warning.hidden, true);
  }
});

test('[C19] malformed stored entries are skipped', () => {
  const ui = setup({ storage: createStorage(JSON.stringify([null, { id: 'a' }, { id: 'b', text: 'kept' }, 3])) });
  assert.deepEqual(ui.texts(), ['kept']);
});

const brokenStorage = ({ read = true, write = true } = {}) => ({
  getItem() {
    if (read) throw new Error('denied');
    return null;
  },
  setItem() {
    if (write) throw new Error('quota');
  },
});

test('[C20] a failing read shows the warning and the app keeps working', () => {
  const ui = setup({ storage: brokenStorage() });
  assert.equal(ui.warning.hidden, false);
  assert.equal(ui.warning.textContent, STORAGE_FAILED);
  assert.equal(ui.message().textContent, EMPTY);
  ui.add('still works');
  assert.deepEqual(ui.texts(), ['still works']);
});

test('[C20] a failing write shows the warning and keeps the page state', () => {
  const ui = setup({ storage: brokenStorage({ read: false }) });
  assert.equal(ui.warning.hidden, true);
  ui.add('one');
  assert.equal(ui.warning.hidden, false);
  assert.equal(ui.warning.textContent, STORAGE_FAILED);
  ui.add('two');
  ui.edit(0).click();
  ui.field().value = 'two edited';
  ui.save().click();
  ui.del(1).click();
  assert.deepEqual(ui.texts(), ['two edited']);
  assert.equal(ui.warning.textContent, STORAGE_FAILED);
});

test('[C20] unavailable storage does not crash the app', () => {
  const ui = setup({ storage: null });
  assert.equal(ui.warning.textContent, STORAGE_FAILED);
  ui.add('one');
  assert.deepEqual(ui.texts(), ['one']);
});

test('[C20] the warning goes away once a save succeeds', () => {
  const storage = brokenStorage({ read: false });
  const ui = setup({ storage });
  ui.add('one');
  assert.equal(ui.warning.hidden, false);
  storage.setItem = () => {};
  ui.add('two');
  assert.equal(ui.warning.hidden, true);
  assert.equal(ui.warning.textContent, '');
});

test('[C21] the empty state shows, disappears, and returns', () => {
  const ui = setup();
  assert.equal(ui.message().textContent, EMPTY);
  ui.add('one');
  assert.equal(ui.message(), undefined);
  ui.del(0).click();
  assert.equal(ui.message().textContent, EMPTY);
});

test('[C21] the empty state wins over no-match when there are no notes', () => {
  const ui = setup();
  ui.type(ui.search, 'zebra');
  assert.equal(ui.message().textContent, EMPTY);
  assert.equal(ui.clearButton(), undefined);
});

test('[C22] markup in a note is shown literally and creates no elements', () => {
  for (const text of ['<img src=x onerror=alert(1)>', '<b>bold</b> &amp;']) {
    const ui = setup();
    ui.add(text);
    const [element] = ui.byClass('note-text');
    assert.equal(element.textContent, text);
    assert.equal(element.children.length, 0);
    assert.equal(ui.all().some((node) => node.tag === 'img' || node.tag === 'b'), false);
  }
});

test('[C22] markup stays literal in the edit textarea and the no-match message', () => {
  const text = '<img src=x onerror=alert(1)>';
  const ui = setup({ notes: seed(text) });
  ui.edit(0).click();
  assert.equal(ui.field().value, text);
  assert.equal(ui.field().children.length, 0);
  ui.cancel().click();

  ui.type(ui.search, '<b>bold</b> &amp;');
  assert.equal(ui.message().textContent, 'No notes match "<b>bold</b> &amp;".');
  assert.equal(ui.message().children.length, 0);
  assert.equal(ui.all().some((node) => node.tag === 'b'), false);
});

test('[C25] controls are native, in forms where they submit, with handlers only on them', () => {
  const ui = setup({ notes: seed('one', 'two') });
  const check = () => {
    for (const element of ui.all()) {
      assert.equal(element.getAttribute('role') === 'button', false);
      assert.equal(['a', 'select'].includes(element.tag), false, element.tag);
      const tabindex = element.getAttribute('tabindex');
      if (tabindex !== null) assert.ok(Number(tabindex) <= 0);
      if (element.listeners.has('click')) assert.equal(element.tag, 'button');
      if (element.listeners.has('submit')) assert.equal(element.tag, 'form');
      for (const type of ['keydown', 'input']) {
        if (element.listeners.has(type)) assert.ok(['input', 'textarea'].includes(element.tag));
      }
      if (element.tag === 'button' && element.type === 'submit') assert.ok(element.closest('form'));
    }
  };
  check();
  ui.edit(0).click();
  check();
  ui.cancel().click();
  ui.type(ui.search, 'zebra');
  check();
});

test('[C25] non-submitting buttons do not submit a form', () => {
  const ui = setup({ notes: seed('one') });
  ui.edit(0).click();
  ui.field().value = 'changed';
  assert.equal(ui.cancel().type, 'button');
  ui.cancel().click();
  assert.deepEqual(ui.texts(), ['one']);
});

test('[C26] the add, search, and edit fields each have a label', () => {
  const ui = setup({ notes: seed('one') });
  ui.edit(0).click();
  const labels = ui.all().filter((element) => element.tag === 'label');
  for (const field of [ui.addInput, ui.search, ui.field()]) {
    assert.ok(field.id);
    assert.equal(labels.filter((label) => label.htmlFor === field.id).length, 1, field.id);
  }
});

test('[C26] the status region carries the announcements', () => {
  const ui = setup();
  assert.equal(ui.status.getAttribute('role'), 'status');
  ui.add('one');
  assert.equal(ui.status.textContent, 'Note added.');
});

test('[C27] Ctrl+Enter and Cmd+Enter submit the add form', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const ui = setup();
    ui.type(ui.addInput, 'via keyboard');
    const event = ui.addInput.fire('keydown', { key: 'Enter', [modifier]: true });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(ui.texts(), ['via keyboard']);
  }
});

test('[C27] Ctrl+Enter and Cmd+Enter submit the edit form', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const ui = setup({ notes: seed('one') });
    ui.edit(0).click();
    ui.field().value = 'edited';
    ui.field().fire('keydown', { key: 'Enter', [modifier]: true });
    assert.deepEqual(ui.texts(), ['edited']);
    assert.equal(ui.status.textContent, 'Note saved.');
  }
});

test('[C27] plain Enter leaves the line break to the browser', () => {
  const ui = setup({ notes: seed('one') });
  ui.type(ui.addInput, 'draft');
  assert.equal(ui.addInput.fire('keydown', { key: 'Enter' }).defaultPrevented, false);
  assert.deepEqual(ui.texts(), ['one']);
  ui.edit(0).click();
  assert.equal(ui.field().fire('keydown', { key: 'Enter' }).defaultPrevented, false);
  assert.notEqual(ui.field(), null);
});

test('[C27] holding the shortcut does not trigger a blank-note error', () => {
  const ui = setup();
  ui.type(ui.addInput, 'once');
  ui.addInput.fire('keydown', { key: 'Enter', ctrlKey: true });
  const repeat = ui.addInput.fire('keydown', { key: 'Enter', ctrlKey: true, repeat: true });
  assert.equal(repeat.defaultPrevented, true);
  assert.equal(ui.addError.hidden, true);
});
