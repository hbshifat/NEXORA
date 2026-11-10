// A small stand-in for the browser DOM, built from the real index.html.
// It models the browser rules the app depends on: disabled, hidden, and removed
// elements cannot hold focus, a button with no type submits its form, clicking a
// checkbox flips it and fires change, Enter in a single-line input submits its
// form (Enter in a textarea does not), and a select's value is one of its options.
const fs = require('node:fs');
const path = require('node:path');

const VOID_TAGS = new Set(['meta', 'link', 'input', 'br', 'img', 'hr']);
const FOCUSABLE_TAGS = new Set(['button', 'input', 'textarea', 'a', 'select']);

const forbidden = (name) => () => {
  throw new Error(`${name} is forbidden in Advanced Todo`);
};

class FakeText {
  constructor(data) {
    this.data = String(data);
    this.parentNode = null;
  }

  get textContent() {
    return this.data;
  }
}

class FakeElement {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.currentValue = null;
    this.checked = false;
  }

  get tag() {
    return this.tagName.toLowerCase();
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get htmlFor() { return this.getAttribute('for') || ''; }
  set htmlFor(value) { this.setAttribute('for', value); }
  get rows() { return Number(this.getAttribute('rows')); }
  set rows(value) { this.setAttribute('rows', value); }

  get type() {
    return this.getAttribute('type') || (this.tag === 'button' ? 'submit' : '');
  }

  set type(value) { this.setAttribute('type', value); }

  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(on) { this.toggleAttribute('disabled', on); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(on) { this.toggleAttribute('hidden', on); }

  toggleAttribute(name, on) {
    if (on) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }

  get options() {
    return walk(this).filter((element) => element.tag === 'option');
  }

  get value() {
    if (this.tag === 'select') {
      if (this.currentValue !== null) return this.currentValue;
      const options = this.options;
      const chosen = options.find((option) => option.hasAttribute('selected')) || options[0];
      return chosen ? chosen.value : '';
    }
    if (this.currentValue !== null) return this.currentValue;
    if (this.tag === 'textarea') return this.textContent;
    if (this.tag === 'option') return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent;
    return this.getAttribute('value') || '';
  }

  // Like a browser, a select only takes a value one of its options has.
  set value(text) {
    const next = String(text);
    if (this.tag === 'select') {
      this.currentValue = this.options.some((option) => option.value === next) ? next : '';
      return;
    }
    this.currentValue = next;
  }

  get children() {
    return this.childNodes.filter((node) => node instanceof FakeElement);
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }

  set textContent(text) {
    this.replaceChildren();
    if (text !== '') this.append(new FakeText(text));
  }

  get innerHTML() { return forbidden('innerHTML')(); }
  set innerHTML(_) { forbidden('innerHTML')(); }
  get outerHTML() { return forbidden('outerHTML')(); }
  set outerHTML(_) { forbidden('outerHTML')(); }
  insertAdjacentHTML() { forbidden('insertAdjacentHTML')(); }

  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? new FakeText(node) : node;
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }

  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === this.ownerDocument.documentElement;
  }

  get isHiddenInTree() {
    for (let node = this; node; node = node.parentNode) {
      if (node.hidden) return true;
    }
    return false;
  }

  closest(tag) {
    for (let node = this; node; node = node.parentNode) {
      if (node.tag === tag) return node;
    }
    return null;
  }

  focus() {
    if (!FOCUSABLE_TAGS.has(this.tag) || this.disabled || !this.isConnected || this.isHiddenInTree) return;
    this.ownerDocument.focused = this;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  // Dispatches a bubbling event and returns it.
  fire(type, init = {}) {
    const event = {
      type,
      target: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...init,
    };
    for (let node = this; node; node = node.parentNode) {
      for (const listener of node.listeners.get(type) || []) listener(event);
    }
    return event;
  }

  get isTextInput() {
    return this.tag === 'input' && ['', 'text', 'search', 'date'].includes(this.type);
  }

  click() {
    if (this.disabled) return;
    if (this.tag === 'input' && this.type === 'checkbox') {
      this.checked = !this.checked;
      const event = this.fire('click');
      if (event.defaultPrevented) {
        this.checked = !this.checked;
        return;
      }
      this.fire('input');
      this.fire('change');
      return;
    }
    const event = this.fire('click');
    if (event.defaultPrevented || this.tag !== 'button' || this.type !== 'submit') return;
    const form = this.closest('form');
    if (form) form.fire('submit');
  }

  // A key press on this element. Enter in a text input submits its form unless
  // the form's default button is disabled (HTML implicit submission).
  press(key, init = {}) {
    if (this.disabled) return null;
    const event = this.fire('keydown', { key, ...init });
    if (event.defaultPrevented || key !== 'Enter' || !this.isTextInput) return event;
    const form = this.closest('form');
    if (!form) return event;
    const submitter = walk(form).find((element) => element.tag === 'button' && element.type === 'submit');
    if (submitter && submitter.disabled) return event;
    form.fire('submit');
    return event;
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = null;
    this.focused = null;
  }

  get body() {
    return walk(this.documentElement).find((element) => element.tag === 'body');
  }

  get activeElement() {
    const element = this.focused;
    if (element && element.isConnected && !element.disabled && !element.isHiddenInTree) return element;
    return this.body;
  }

  createElement(tag) {
    return new FakeElement(tag, this);
  }

  createTextNode(data) {
    return new FakeText(data);
  }

  getElementById(id) {
    return walk(this.documentElement).find((element) => element.id === id) || null;
  }

  write() {
    forbidden('document.write')();
  }

  writeln() {
    forbidden('document.writeln')();
  }
}

// Every element at or below root, in document order.
const walk = (root) => [root, ...root.children.flatMap(walk)];

const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-z0-9]+)\s*>|<([a-z0-9]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|[^<]+/gi;
const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

const parseHtml = (html) => {
  const document = new FakeDocument();
  const stack = [];
  for (const [token, closeTag, openTag, rawAttributes] of html.matchAll(TOKEN)) {
    const parent = stack[stack.length - 1];
    if (closeTag) {
      stack.pop();
    } else if (openTag) {
      const element = document.createElement(openTag);
      for (const [, name, double, single, bare] of (rawAttributes || '').matchAll(ATTRIBUTE)) {
        element.setAttribute(name.toLowerCase(), double ?? single ?? bare ?? '');
      }
      if (parent) parent.append(element);
      else document.documentElement = element;
      if (!VOID_TAGS.has(element.tag)) stack.push(element);
    } else if (parent && !token.startsWith('<')) {
      if (token.trim() !== '') parent.append(new FakeText(token));
    }
  }
  return document;
};

const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const loadPage = () => parseHtml(fs.readFileSync(INDEX_PATH, 'utf8'));

module.exports = { FakeElement, FakeDocument, parseHtml, loadPage, walk };
