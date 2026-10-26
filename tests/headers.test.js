import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { THEME_SCRIPT_HASH, SECURITY_HEADERS, CONTENT_SECURITY_POLICY, withSecurityHeaders } from '../functions/_lib/security.js';
import { onRequestGet as servePalettePage } from '../functions/p/[id].js';
import { json } from '../functions/_lib/palettes.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function parseHeadersFile(text) {
  const sections = {};
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      sections[current] = {};
      continue;
    }
    const colon = line.indexOf(':');
    sections[current][line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return sections;
}

const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const hashOf = (source) => `sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}`;

describe('public/_headers і functions/_lib/security.js', () => {
  const sections = parseHeadersFile(read('public/_headers'));

  test('заголовки /* збігаються із SECURITY_HEADERS у коді функції', () => {
    const expected = Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([name, value]) => [name.toLowerCase(), value]));
    assert.deepEqual(sections['/*'], expected);
  });

  test('шрифти кешуються надовго', () => {
    assert.equal(sections['/fonts/*']['cache-control'], 'public, max-age=31536000, immutable');
  });

  test('CSP суворий для скриптів: без unsafe-inline, unsafe-eval і зовнішніх джерел', () => {
    const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
    assert.deepEqual(directives['script-src'], ["'self'", `'${THEME_SCRIPT_HASH}'`]);
    assert.deepEqual(directives['style-src-attr'], ["'unsafe-inline'"]);
    assert.deepEqual(directives['default-src'], ["'self'"]);
    assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
    assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval|https?:/);
  });
});

describe('інлайн-скрипт теми', () => {
  const pages = { 'index.html': read('public/index.html'), '404.html': read('public/404.html') };

  test('на кожній сторінці рівно один інлайн-скрипт, його sha256 збігається з CSP', () => {
    for (const [name, html] of Object.entries(pages)) {
      const scripts = inlineScripts(html);
      assert.equal(scripts.length, 1, `${name}: інлайн-скриптів ${scripts.length}`);
      assert.equal(hashOf(scripts[0]), THEME_SCRIPT_HASH, `${name}: хеш розійшовся з CSP, новий ${hashOf(scripts[0])}`);
    }
  });

  test('index.html і 404.html мають однаковий скрипт, а _headers містить той самий хеш', () => {
    assert.equal(inlineScripts(pages['index.html'])[0], inlineScripts(pages['404.html'])[0]);
    assert.ok(read('public/_headers').includes(`'${THEME_SCRIPT_HASH}'`));
  });
});

describe('що CSP заборонила б', () => {
  test('у розмітці й шаблонах немає inline-обробників подій', () => {
    for (const path of ['public/index.html', 'public/404.html', 'public/app.js']) {
      assert.doesNotMatch(read(path), /\son[a-z]+\s*=\s*["'`]/, path);
    }
  });

  test('сторінки і скрипти не звертаються до зовнішніх адрес', () => {
    for (const path of ['public/index.html', 'public/404.html', 'public/app.js', 'public/tokens.js', 'public/color.js', 'public/styles.css']) {
      const urls = (read(path).match(/https?:\/\/[^\s"'<>)]+/g) ?? []).filter((url) => url !== 'http://www.w3.org/2000/svg');
      assert.deepEqual(urls, [], path);
    }
  });
});

describe('withSecurityHeaders і /p/:id', () => {
  test('додає всі заголовки, перезаписує чужі, зберігає статус і тіло', async () => {
    const original = new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html', 'content-security-policy': "default-src *" } });
    const result = withSecurityHeaders(original);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), '<html></html>');
    assert.equal(result.headers.get('content-type'), 'text/html');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(result.headers.get(name), value, name);
  });

  test('сторінка /p/:id віддається з заголовками безпеки', async () => {
    const env = { ASSETS: { fetch: async (request) => new Response(`asset for ${new URL(request.url).pathname}`, { headers: { 'content-type': 'text/html' } }) } };
    const response = await servePalettePage({ request: new Request('https://example.test/p/abc234'), env });
    assert.equal(await response.text(), 'asset for /');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers.get(name), value, name);
  });

  test('JSON-відповіді API мають nosniff', () => {
    assert.equal(json({}).headers.get('x-content-type-options'), 'nosniff');
  });
});
