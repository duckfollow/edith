import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('./theme.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function mount({ native = true, system = 'dark' } = {}) {
  let changeMedia, select;
  const calls = [], storage = new Map();
  const media = { matches: system === 'dark', addEventListener(_, handler) { changeMedia = handler; } };
  const document = { documentElement: { dataset: {} }, createElement(tag) {
    const element = { append() {}, replaceChildren() {}, setAttribute() {}, add() {}, value: '' };
    if (tag === 'select') select = element;
    return element;
  } };
  let effective = system;
  const nativeWindow = {
    async setTheme(value) {
      calls.push(value);
      effective = value ?? system;
      media.matches = effective === 'dark';
      changeMedia();
    },
    async theme() { return effective; },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, document, matchMedia: () => media, Option: function() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { addEventListener() {} },
    require(name) {
      if (name.includes('api/core')) return { isTauri: () => native };
      if (name.includes('api/window')) return { getCurrentWindow: () => nativeWindow };
      return { icon: () => ({}) };
    },
  });
  exports.mountAppearance({ prepend() {} });
  return {
    calls, storage,
    choose(value) { select.value = value; select.onchange(); },
    get theme() { return document.documentElement.dataset.theme; },
    systemChange(value) { system = value; media.matches = value === 'dark'; changeMedia(); },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('native Light -> System releases override and returns to a dark OS', async () => {
  const app = mount(); await settle();
  app.choose('light'); await settle(); assert.equal(app.theme, 'light');
  app.choose('system'); await settle(); assert.equal(app.theme, 'dark');
  assert.equal(app.calls.at(-1), null);
  assert.equal(app.storage.get('edith-appearance'), 'system');
  const count = app.calls.length;
  app.systemChange('light'); await settle();
  assert.equal(app.theme, 'light'); assert.equal(app.calls.length, count);
});
test('native Dark -> System follows a light OS and rapid selections settle on System', async () => {
  const app = mount({ system: 'light' }); await settle();
  app.choose('dark'); await settle(); assert.equal(app.theme, 'dark');
  app.choose('light'); app.choose('dark'); app.choose('system');
  await settle(); assert.equal(app.theme, 'light'); assert.equal(app.calls.at(-1), null);
});
test('browser System follows matchMedia while explicit choices remain fixed', async () => {
  const app = mount({ native: false });
  app.choose('light'); app.systemChange('dark'); assert.equal(app.theme, 'light');
  app.choose('system'); assert.equal(app.theme, 'dark');
  app.systemChange('light'); assert.equal(app.theme, 'light');
  assert.equal(app.calls.length, 0);
});
