(() => {
  'use strict';

  const STORAGE_KEY = 'quick-notes:v1';

  let idCounter = 0;

  const makeId = (takenIds, now) => {
    let id;
    do {
      idCounter += 1;
      id = `${now.toString(36)}-${idCounter.toString(36)}`;
    } while (takenIds.has(id));
    return id;
  };

  const isBlank = (text) => text.trim() === '';

  // Returns the new list, or null when the text is blank.
  const addNote = (notes, text, now = Date.now()) => {
    if (isBlank(text)) return null;
    const id = makeId(new Set(notes.map((note) => note.id)), now);
    return [{ id, text: text.trim(), createdAt: now }, ...notes];
  };

  // Returns the new list, or null when the text is blank.
  const editNote = (notes, id, text) => {
    if (isBlank(text)) return null;
    return notes.map((note) => (note.id === id ? { ...note, text: text.trim() } : note));
  };

  const deleteNote = (notes, id) => notes.filter((note) => note.id !== id);

  const searchNotes = (notes, query) => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return notes;
    return notes.filter((note) => note.text.toLowerCase().includes(needle));
  };

  const isValidEntry = (entry) =>
    typeof entry === 'object' && entry !== null &&
    typeof entry.id === 'string' && typeof entry.text === 'string';

  // Edit and delete find notes by id, so a repeated stored id gets a fresh one.
  const withUniqueIds = (notes) => {
    const taken = new Set(notes.map((note) => note.id));
    const seen = new Set();
    return notes.map((note) => {
      if (!seen.has(note.id)) {
        seen.add(note.id);
        return note;
      }
      const id = makeId(taken, Date.now());
      taken.add(id);
      return { ...note, id };
    });
  };

  // `ok` is false only when storage itself failed. Missing or corrupt data is
  // an empty list, not a failure.
  const loadNotes = (storage) => {
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      return { notes: [], ok: false };
    }
    if (raw === null || raw === undefined) return { notes: [], ok: true };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { notes: [], ok: true };
    }
    if (!Array.isArray(parsed)) return { notes: [], ok: true };
    return { notes: withUniqueIds(parsed.filter(isValidEntry)), ok: true };
  };

  // Returns true when the list was written.
  const saveNotes = (storage, notes) => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(notes));
      return true;
    } catch {
      return false;
    }
  };

  const api = { STORAGE_KEY, isBlank, addNote, editNote, deleteNote, searchNotes, loadNotes, saveNotes };

  globalThis.QuickNotes = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
