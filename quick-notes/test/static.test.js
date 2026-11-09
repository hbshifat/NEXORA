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
const sources = { 'notes.js': read('notes.js'), 'app.js': read('app.js') };
const testFiles = fs.readdirSync(__dirname).filter((file) => file.endsWith('.js'));

test('[C1] index.html references only local files', () => {
  const urls = page().flatMap((element) => ['src', 'href']
    .filter((name) => element.hasAttribute(name))
    .map((name) => element.getAttribute(name)));
  assert.ok(urls.length >= 3);
  for (const url of urls) assert.doesNotMatch(url, /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i, url);
});

test('[C1] no package.json or node_modules is added', () => {
  for (const dir of [REPO_ROOT, APP_DIR]) {
    assert.equal(fs.existsSync(path.join(dir, 'package.json')), false);
    assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false);
  }
});

test('[C1] test files use only node: built-ins and local files', () => {
  for (const file of testFiles) {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const [, specifier] of source.matchAll(/require\('([^']+)'\)/g)) {
      assert.match(specifier, /^(?:node:|\.\.?\/)/, `${file}: ${specifier}`);
    }
  }
});

test('[C2] scripts are classic and neither file uses fetch or crypto.randomUUID', () => {
  const scripts = page().filter((element) => element.tag === 'script');
  assert.deepEqual(scripts.map((script) => script.getAttribute('src')), ['notes.js', 'app.js']);
  for (const script of scripts) assert.notEqual(script.getAttribute('type'), 'module');
  for (const [file, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\bfetch\b/, file);
    assert.doesNotMatch(source, /randomUUID/, file);
  }
});

test('[C3] the suite has a test for every criterion marked (test)', () => {
  const required = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 29];
  const allTests = testFiles
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8'))
    .join('\n');
  for (const number of required) {
    assert.match(allTests, new RegExp(`test\\('\\[C${number}\\] `), `criterion ${number}`);
  }
});

test('[C23] neither source file uses an HTML or code injection sink', () => {
  const sinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function'];
  for (const [file, source] of Object.entries(sources)) {
    for (const sink of sinks) assert.equal(source.includes(sink), false, `${file}: ${sink}`);
  }
});

test('[C26] index.html sets lang, a title, one h1, and a status region', () => {
  const elements = page();
  assert.ok(loadPage().documentElement.getAttribute('lang'));
  const titles = elements.filter((element) => element.tag === 'title');
  assert.equal(titles.length, 1);
  assert.equal(titles[0].textContent, 'Quick Notes');
  assert.equal(elements.filter((element) => element.tag === 'h1').length, 1);
  assert.equal(elements.filter((element) => element.getAttribute('role') === 'status').length, 1);
});

test('[C29] index.html has the viewport meta tag', () => {
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
});
