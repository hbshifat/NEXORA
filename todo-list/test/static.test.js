const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, walk } = require('./fake-dom.js');

const APP_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(APP_DIR, '..');
const read = (file) => fs.readFileSync(path.join(APP_DIR, file), 'utf8');
const html = read('index.html');
const page = () => walk(loadPage().documentElement);
const sources = { 'todos.js': read('todos.js'), 'app.js': read('app.js') };
const testFiles = fs.readdirSync(__dirname).filter((file) => file.endsWith('.js'));
const TEST_COMMAND = 'node --test "todo-list/test/*.test.js"';

// Criteria marked (test) in factory/jobs/003-todo-list/spec.md.
const TEST_CRITERIA = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29,
];

test('[C1] index.html references only local files', () => {
  const urls = page().flatMap((element) => ['src', 'href']
    .filter((name) => element.hasAttribute(name))
    .map((name) => element.getAttribute(name)));
  assert.ok(urls.length >= 3);
  for (const url of urls) assert.doesNotMatch(url, /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i, url);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?\s*(?:https?:|\/\/)/i);
});

test('[C1] no package.json or node_modules is added', () => {
  for (const dir of [REPO_ROOT, APP_DIR, __dirname]) {
    assert.equal(fs.existsSync(path.join(dir, 'package.json')), false, dir);
    assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false, dir);
  }
});

test('[C1] test files require only node: built-ins and files inside todo-list/', () => {
  for (const file of testFiles) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const [, specifier] of source.matchAll(/require\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
      if (specifier.startsWith('node:')) continue;
      assert.match(specifier, /^\.\.?\//, `${file}: ${specifier}`);
      const resolved = path.resolve(__dirname, specifier);
      assert.ok(resolved.startsWith(APP_DIR + path.sep), `${file}: ${specifier} leaves todo-list/`);
    }
  }
});

test('[C2] todos.js then app.js load as classic scripts, without fetch or randomUUID', () => {
  const scripts = page().filter((element) => element.tag === 'script');
  assert.deepEqual(scripts.map((script) => script.getAttribute('src')), ['todos.js', 'app.js']);
  for (const script of scripts) assert.notEqual(script.getAttribute('type'), 'module');
  for (const [file, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\bfetch\b/, file);
    assert.doesNotMatch(source, /randomUUID/, file);
  }
});

test('[C3] the suite has a test for every criterion marked (test)', () => {
  const allTests = testFiles
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8'))
    .join('\n');
  for (const number of TEST_CRITERIA) {
    assert.match(allTests, new RegExp(`test\\('\\[C${number}\\] `), `criterion ${number}`);
  }
});

test('[C4] the app README covers opening, the test command, and features', () => {
  const readme = read('README.md');
  assert.match(readme, /index\.html/);
  assert.ok(readme.includes('python3 -m http.server'));
  assert.ok(readme.includes(TEST_COMMAND));
  assert.match(readme, /## Features\n\n(?:- .+\n){3,}/);
});

test('[C4] the root README layout tree lists todo-list/', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const tree = readme.split('## Repository layout')[1].split('```')[1];
  assert.match(tree, /[├└]── todo-list\//);
});

test('[C26] neither source file uses an HTML or code injection sink', () => {
  const sinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function'];
  for (const [file, source] of Object.entries(sources)) {
    for (const sink of sinks) assert.equal(source.includes(sink), false, `${file}: ${sink}`);
  }
});

test('[C27] index.html sets lang, a title, one h1, and one status region', () => {
  const elements = page();
  assert.ok(loadPage().documentElement.getAttribute('lang'));
  const titles = elements.filter((element) => element.tag === 'title');
  assert.equal(titles.length, 1);
  assert.equal(titles[0].textContent, 'Todo List');
  assert.equal(elements.filter((element) => element.tag === 'h1').length, 1);
  assert.equal(elements.filter((element) => element.getAttribute('role') === 'status').length, 1);
});

test('[C27] index.html has no positive tabindex and only native controls', () => {
  for (const element of page()) {
    const tabindex = element.getAttribute('tabindex');
    if (tabindex !== null) assert.ok(Number(tabindex) <= 0);
    assert.notEqual(element.getAttribute('role'), 'button');
    assert.equal(element.hasAttribute('onclick'), false);
  }
});

test('[C29] index.html has the viewport meta tag', () => {
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
});
