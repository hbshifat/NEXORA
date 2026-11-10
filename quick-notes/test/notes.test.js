const test = require('node:test');
const assert = require('node:assert/strict');
const Notes = require('../notes.js');

const memoryStorage = (value) => ({
  value,
  getItem() { return this.value === undefined ? null : this.value; },
  setItem(_, next) { this.value = next; },
});

test('[C4] addNote stores a unique id, the trimmed text, and a creation time', () => {
  const [note] = Notes.addNote([], '  hello\n  world\t ', 1234);
  assert.equal(note.text, 'hello\n  world');
  assert.equal(note.createdAt, 1234);
  assert.equal(typeof note.id, 'string');
  assert.notEqual(note.id, '');
});

test('[C4] ids stay unique when many notes share one timestamp', () => {
  let notes = [];
  for (let i = 0; i < 200; i += 1) notes = Notes.addNote(notes, `note ${i}`, 5000);
  assert.equal(new Set(notes.map((note) => note.id)).size, 200);
});

test('[C6] every character removed by trim counts as blank', () => {
  for (const text of ['', ' ', '\t', '\n', '\r\n', ' \t\n ', ' ', '﻿', ' ', ' ']) {
    assert.equal(Notes.addNote([], text), null, JSON.stringify(text));
  }
});

test('[C8] editNote rejects blank text', () => {
  const notes = [{ id: 'a', text: 'keep' }];
  assert.equal(Notes.editNote(notes, 'a', ' \n '), null);
  assert.equal(notes[0].text, 'keep');
});

test('[C10] editNote trims the text and keeps the position and creation time', () => {
  const notes = [{ id: 'a', text: '1', createdAt: 1 }, { id: 'b', text: '2', createdAt: 2 }];
  assert.deepEqual(Notes.editNote(notes, 'b', '  two  '), [
    { id: 'a', text: '1', createdAt: 1 },
    { id: 'b', text: 'two', createdAt: 2 },
  ]);
});

test('[C14] deleteNote removes only the matching note', () => {
  const notes = [{ id: 'a', text: '1' }, { id: 'b', text: '2' }];
  assert.deepEqual(Notes.deleteNote(notes, 'a'), [{ id: 'b', text: '2' }]);
});

test('[C15] search is a case-insensitive substring match on the trimmed query', () => {
  const notes = [{ id: 'a', text: 'Buy MILK' }, { id: 'b', text: 'call mum' }];
  assert.deepEqual(Notes.searchNotes(notes, '  milk ').map((note) => note.id), ['a']);
  assert.deepEqual(Notes.searchNotes(notes, 'M').map((note) => note.id), ['a', 'b']);
  assert.equal(Notes.searchNotes(notes, '   ').length, 2);
  assert.equal(Notes.searchNotes(notes, '').length, 2);
});

test('[C16] search treats regular expression characters literally', () => {
  const notes = [
    { id: 'plain', text: 'nothing special' },
    { id: 'star', text: 'a .* b' },
    { id: 'paren', text: 'f(x)' },
    { id: 'bracket', text: 'list[0]' },
  ];
  assert.deepEqual(Notes.searchNotes(notes, '.*').map((note) => note.id), ['star']);
  assert.deepEqual(Notes.searchNotes(notes, '(').map((note) => note.id), ['paren']);
  assert.deepEqual(Notes.searchNotes(notes, '[').map((note) => note.id), ['bracket']);
});

test('[C18] saveNotes writes the full list as JSON and loadNotes reads it back', () => {
  const notes = [{ id: 'b', text: 'second', createdAt: 2 }, { id: 'a', text: 'first', createdAt: 1 }];
  const storage = memoryStorage();
  assert.equal(Notes.saveNotes(storage, notes), true);
  assert.deepEqual(JSON.parse(storage.value), notes);
  assert.deepEqual(Notes.loadNotes(storage), { notes, ok: true });
  assert.equal(Notes.STORAGE_KEY, 'quick-notes:v1');
});

test('[C19] missing, invalid, and non-array data load as an empty list', () => {
  for (const value of [undefined, '', '{not json', 'null', '42', '"text"', '{"id":"a","text":"b"}']) {
    assert.deepEqual(Notes.loadNotes(memoryStorage(value)), { notes: [], ok: true }, String(value));
  }
});

test('[C19] entries without a string id and a string text are skipped', () => {
  const good = { id: 'ok', text: 'kept' };
  const stored = [null, 1, 'x', [], {}, { id: 1, text: 'a' }, { id: 'a', text: 2 }, { id: 'a' }, { text: 'a' }, good];
  assert.deepEqual(Notes.loadNotes(memoryStorage(JSON.stringify(stored))).notes, [good]);
});

test('[C19] notes with a repeated stored id are kept and get distinct ids', () => {
  const stored = [{ id: 'a', text: 'one' }, { id: 'a', text: 'two' }];
  const { notes } = Notes.loadNotes(memoryStorage(JSON.stringify(stored)));
  assert.deepEqual(notes.map((note) => note.text), ['one', 'two']);
  assert.equal(new Set(notes.map((note) => note.id)).size, 2);
  assert.equal(notes[0].id, 'a');
});

test('[C20] storage failures are reported and never thrown', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
  };
  assert.deepEqual(Notes.loadNotes(broken), { notes: [], ok: false });
  assert.equal(Notes.saveNotes(broken, []), false);
  assert.deepEqual(Notes.loadNotes(null), { notes: [], ok: false });
  assert.equal(Notes.saveNotes(null, []), false);
});
