'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, walk } = require('./fake-dom.js');

const APP_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(APP_DIR, '..');
const read = (file) => fs.readFileSync(path.join(APP_DIR, file), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const page = () => walk(loadPage().documentElement);
const sources = { 'todos.js': read('todos.js'), 'app.js': read('app.js') };
const testFiles = fs.readdirSync(__dirname).filter((file) => file.endsWith('.js'));
const TEST_COMMAND = 'node --test "advanced-todo/test/*.test.js"';

test('[C20] interactive elements have visible focus styles', () => {
  const rule = css.match(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/);
  assert.ok(rule, 'a :focus-visible rule exists');
  for (const tag of ['button', 'input', 'select', 'textarea']) assert.match(rule[1], new RegExp(`\\b${tag}:focus-visible`), tag);
  assert.match(rule[2], /outline:\s*\d+px solid/);
  assert.doesNotMatch(css, /outline:\s*(?:none|0)\b/);
});

test('[C20] index.html has no positive tabindex and only native controls', () => {
  for (const element of page()) {
    const tabindex = element.getAttribute('tabindex');
    if (tabindex !== null) assert.ok(Number(tabindex) <= 0);
    assert.notEqual(element.getAttribute('role'), 'button');
    assert.equal(element.hasAttribute('onclick'), false);
  }
});

test('[C20] every static input, select, and textarea has a matching label', () => {
  const elements = page();
  const labelled = new Set(elements.filter((el) => el.tag === 'label').map((el) => el.htmlFor));
  const controls = elements.filter((el) => ['input', 'select', 'textarea'].includes(el.tag));
  assert.ok(controls.length >= 6);
  for (const control of controls) assert.ok(labelled.has(control.id), control.id);
});

test('[C21] index.html has exactly one visually hidden status region', () => {
  const regions = page().filter((element) => element.getAttribute('role') === 'status');
  assert.equal(regions.length, 1);
  assert.ok(regions[0].className.split(' ').includes('visually-hidden'));
  assert.match(css, /\.visually-hidden\s*\{[^}]*position:\s*absolute/);
});

test('[C22] the page has a viewport meta tag and supports light and dark mode', () => {
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
  assert.match(css, /color-scheme:\s*light dark/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/);
});

test('[C22] no fixed width wider than 320px can force horizontal scrolling', () => {
  for (const [, property, value] of css.matchAll(/(?:^|[;{\s])((?:min-)?width):\s*(\d+)px/g)) {
    assert.ok(Number(value) <= 320, `${property}: ${value}px`);
  }
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.add-row,\s*\.controls-row\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.task\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /input, select, textarea\s*\{[^}]*max-width:\s*100%/);
});

test('[C9] completed tasks are struck through, not only recoloured', () => {
  assert.match(css, /\.task\.completed \.task-title\s*\{[^}]*text-decoration:\s*line-through/);
});

test('[C23] no source file uses an HTML or code injection sink', () => {
  const sinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'setTimeout(\'', 'setTimeout("'];
  for (const [file, source] of Object.entries({ ...sources, 'index.html': html })) {
    for (const sink of sinks) assert.equal(source.includes(sink), false, `${file}: ${sink}`);
  }
});

test('[C24] index.html references only the local styles.css, todos.js, and app.js', () => {
  const urls = page().flatMap((element) => ['src', 'href']
    .filter((name) => element.hasAttribute(name))
    .map((name) => element.getAttribute(name)));
  assert.deepEqual(urls.sort(), ['app.js', 'styles.css', 'todos.js']);
  assert.doesNotMatch(html, /(?:https?:)?\/\//);
  assert.doesNotMatch(css, /url\(|@import/);
});

test('[C24] scripts load as classic scripts and make no network calls', () => {
  const scripts = page().filter((element) => element.tag === 'script');
  assert.deepEqual(scripts.map((script) => script.getAttribute('src')), ['todos.js', 'app.js']);
  for (const script of scripts) assert.notEqual(script.getAttribute('type'), 'module');
  for (const [file, source] of Object.entries(sources)) {
    for (const api of [/\bfetch\b/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/, /^\s*import\s/m, /https?:/]) {
      assert.doesNotMatch(source, api, `${file}: ${api}`);
    }
  }
});

test('[C25] no package.json or node_modules is added', () => {
  for (const dir of [REPO_ROOT, APP_DIR, __dirname]) {
    assert.equal(fs.existsSync(path.join(dir, 'package.json')), false, dir);
    assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false, dir);
  }
});

test('[C25] test files require only node: built-ins and files inside advanced-todo/', () => {
  for (const file of testFiles) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const [, specifier] of source.matchAll(/require\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
      if (specifier.startsWith('node:')) continue;
      assert.match(specifier, /^\.\.?\//, `${file}: ${specifier}`);
      const resolved = path.resolve(__dirname, specifier);
      assert.ok(resolved.startsWith(APP_DIR + path.sep), `${file}: ${specifier} leaves advanced-todo/`);
    }
  }
});

test('[C25] the suite has a test for every criterion 1 to 24', () => {
  const allTests = testFiles
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8'))
    .join('\n');
  for (let number = 1; number <= 24; number += 1) {
    assert.match(allTests, new RegExp(`test\\('\\[C${number}\\] `), `criterion ${number}`);
  }
});

test('[C27] the app README covers opening, features, storage, and the test command', () => {
  const readme = read('README.md');
  assert.match(readme, /index\.html/);
  assert.ok(readme.includes(TEST_COMMAND));
  assert.ok(readme.includes('advanced-todo:v1'));
  assert.ok(readme.includes('advanced-todo:prefs:v1'));
  assert.match(readme, /unencrypted/i);
  assert.match(readme, /## Features\n\n(?:- .+\n){5,}/);
});

test('[C27] the root README layout tree lists advanced-todo/', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const tree = readme.split('## Repository layout')[1].split('```')[1];
  assert.match(tree, /[├└]── advanced-todo\//);
});

test('[C27] index.html sets lang, a title, and one h1', () => {
  const elements = page();
  assert.ok(loadPage().documentElement.getAttribute('lang'));
  const titles = elements.filter((element) => element.tag === 'title');
  assert.equal(titles.length, 1);
  assert.equal(titles[0].textContent, 'Advanced Todo');
  assert.equal(elements.filter((element) => element.tag === 'h1').length, 1);
});
