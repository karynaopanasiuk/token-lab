import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeHex } from '../public/color.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('public/index.html');
const app = read('public/app.js');
const css = read('public/styles.css');

// Усе, що JS малює вже після першого малювання, зсуває сторінку. Цей набір тестів тримає в розмітці те,
// що має бути на місці до JS, і приховування main до першого рендеру.
describe('розмітка без стрибка макета', () => {
  const presets = [...html.matchAll(/<button type="button" class="preset" data-hex="([^"]+)"><span class="preset__dot" style="--dot: ([^"]+)"><\/span>([^<]+)<\/button>/g)];

  test('чотири пресети лежать у index.html з валідним hex і кольором крапки', () => {
    assert.equal(presets.length, 4);
    for (const [, hex, dot, name] of presets) {
      assert.equal(normalizeHex(hex), hex, `${name}: data-hex має бути нормалізованим #RRGGBB`);
      assert.equal(dot, hex, `${name}: колір крапки збігається з data-hex`);
    }
    assert.deepEqual(presets.map((p) => p[3]), ['Індиго', 'Жовтий', 'Бірюза', 'Теракота']);
  });

  test('перший пресет це колір за замовчуванням в app.js', () => {
    assert.match(app, new RegExp(`const DEFAULT_HEX = '${presets[0][1]}';`));
  });

  test('app.js більше не створює пресети сам', () => {
    assert.doesNotMatch(app, /createElement\('button'\)/);
    assert.doesNotMatch(app, /className = 'preset'/);
  });

  test('main прихований до першого рендеру і відкривається навіть після помилки', () => {
    assert.match(html, /<main class="main" data-pending>/);
    assert.match(css, /\.main\[data-pending\]\s*\{\s*visibility:\s*hidden;/);
    assert.match(app, /finally\s*\{\s*el\.main\.removeAttribute\('data-pending'\);/);
  });

  test('місце під скроллбар зарезервоване', () => {
    assert.match(css, /html\s*\{[^}]*scrollbar-gutter:\s*stable;/);
  });

  test('пресети не мають хардкод-кольорів у CSS: колір крапки йде зі змінної', () => {
    assert.match(css, /\.preset__dot\s*\{[^}]*background:\s*var\(--dot\);/);
  });
});
