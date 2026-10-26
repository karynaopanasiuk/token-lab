import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE_VERSION, ID_PATTERN, createId, json, readHex } from '../functions/_lib/palettes.js';
import { onRequestPost, onRequest as postFallback } from '../functions/api/palettes.js';
import { onRequestGet } from '../functions/api/palettes/[id].js';
import { onRequest as apiNotFound } from '../functions/api/[[path]].js';

const ORIGIN = 'http://localhost:8788';

function post(body, { type = 'application/json', headers = {} } = {}) {
  return new Request(`${ORIGIN}/api/palettes`, {
    method: 'POST',
    headers: { 'content-type': type, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// Мінімальна підміна D1 під запити з функцій. Справжній SQL перевіряється локально через wrangler.
function fakeDb() {
  const rows = [];
  let conflicts = 0;
  return {
    rows,
    conflictNext(count) {
      conflicts = count;
    },
    prepare(sql) {
      return {
        bind: (...args) => ({
          async run() {
            const [id, hex, version] = args;
            if (conflicts > 0) {
              conflicts -= 1;
              return { meta: { changes: 0 } };
            }
            if (rows.some((row) => row.id === id || (row.hex === hex && row.version === version))) {
              return { meta: { changes: 0 } };
            }
            rows.push({ id, hex, version, created_at: '2026-10-26T12:00:00.000Z' });
            return { meta: { changes: 1 } };
          },
          async first() {
            if (sql.startsWith('SELECT id FROM')) {
              const [hex, version] = args;
              return rows.find((row) => row.hex === hex && row.version === version) ?? null;
            }
            return rows.find((row) => row.id === args[0]) ?? null;
          },
        }),
      };
    },
  };
}

describe('createId', () => {
  test('шість символів з алфавіту без i, l, o, u', () => {
    for (let i = 0; i < 500; i++) assert.match(createId(), ID_PATTERN);
  });

  test('байт відображається на символ через & 31, усі 32 символи досяжні', () => {
    assert.equal(createId((bytes) => bytes.fill(0).map((_, i) => [0, 1, 31, 32, 33, 255][i])), '01z01z');

    const reachable = new Set();
    for (let byte = 0; byte < 256; byte++) {
      for (const char of createId((bytes) => bytes.fill(byte))) reachable.add(char);
    }
    assert.equal(reachable.size, 32);
    for (const banned of 'ilou') assert.ok(!reachable.has(banned), banned);
  });
});

describe('ID_PATTERN', () => {
  test('приймає лише шість символів з алфавіту', () => {
    for (const ok of ['abc234', 'zzzzzz', '000000', 'hjkmnp']) assert.match(ok, ID_PATTERN);
    for (const bad of ['abc12', 'abc1234', 'ABC234', 'abcil0', 'abc23!', '', 'abc 23', '../etc']) {
      assert.doesNotMatch(bad, ID_PATTERN, JSON.stringify(bad));
    }
  });
});

describe('readHex', () => {
  test('нормалізує hex: регістр, shorthand, без решітки', async () => {
    assert.deepEqual(await readHex(post({ hex: '#4f46e5' })), { hex: '#4F46E5' });
    assert.deepEqual(await readHex(post({ hex: 'fa0' })), { hex: '#FFAA00' });
    assert.deepEqual(await readHex(post({ hex: ' #FACC15 ' })), { hex: '#FACC15' });
  });

  test('невалідний hex це 400 invalid_hex', async () => {
    for (const hex of ['ZZZ', '#12345', '#1234567', '', '#GGGGGG', '#ff00ff00', 123, null, ['#FFFFFF'], { hex: '#FFFFFF' }]) {
      assert.deepEqual(await readHex(post({ hex })), { error: 'invalid_hex', status: 400 }, JSON.stringify(hex));
    }
    for (const body of [{}, [], null, 'text', 42]) {
      const raw = JSON.stringify(body); // валідний JSON, але не об'єкт з hex
      assert.deepEqual(await readHex(post(raw)), { error: 'invalid_hex', status: 400 }, raw);
    }
  });

  test('зламаний JSON це 400 invalid_json', async () => {
    assert.deepEqual(await readHex(post('{hex:')), { error: 'invalid_json', status: 400 });
    assert.deepEqual(await readHex(post('')), { error: 'invalid_json', status: 400 });
  });

  test('не JSON за content-type це 415', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      assert.deepEqual(await readHex(post({ hex: '#4F46E5' }, { type })), { error: 'unsupported_media_type', status: 415 }, type);
    }
    assert.deepEqual(await readHex(post({ hex: '#4F46E5' }, { type: 'application/json; charset=utf-8' })), { hex: '#4F46E5' });
  });

  test('завелике тіло це 413', async () => {
    assert.deepEqual(await readHex(post({ hex: '#4F46E5', pad: 'x'.repeat(2000) })), { error: 'payload_too_large', status: 413 });
    const lying = post({ hex: '#4F46E5' }, { headers: { 'content-length': '999999' } });
    assert.deepEqual(await readHex(lying), { error: 'payload_too_large', status: 413 });
  });
});

describe('json', () => {
  test('статус, content-type і no-store за замовчуванням', async () => {
    const response = json({ a: 1 }, 201);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { a: 1 });
    assert.equal(json({}, 200, { 'cache-control': 'public, max-age=60' }).headers.get('cache-control'), 'public, max-age=60');
  });
});

describe('POST /api/palettes', () => {
  test('нова палітра: 201, короткий id і абсолютне посилання', async () => {
    const DB = fakeDb();
    const response = await onRequestPost({ request: post({ hex: '#4f46e5' }), env: { DB } });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.match(body.id, ID_PATTERN);
    assert.equal(body.url, `${ORIGIN}/p/${body.id}`);
    assert.deepEqual(DB.rows.map(({ id, hex, version }) => ({ id, hex, version })), [
      { id: body.id, hex: '#4F46E5', version: PALETTE_VERSION },
    ]);
  });

  test('той самий hex повертає той самий id зі статусом 200, без дубліката', async () => {
    const DB = fakeDb();
    const first = await (await onRequestPost({ request: post({ hex: '#4F46E5' }), env: { DB } })).json();
    const again = await onRequestPost({ request: post({ hex: 'ABC' }), env: { DB } });
    const other = await onRequestPost({ request: post({ hex: '#4f46e5' }), env: { DB } });

    assert.equal(other.status, 200);
    assert.equal((await other.json()).id, first.id);
    assert.equal(again.status, 201);
    assert.equal(DB.rows.length, 2);
  });

  test('невалідний запит не торкається бази', async () => {
    const DB = fakeDb();
    for (const [request, status] of [
      [post({ hex: 'nope' }), 400],
      [post('{', {}), 400],
      [post({ hex: '#4F46E5' }, { type: 'text/plain' }), 415],
    ]) {
      const response = await onRequestPost({ request, env: { DB } });
      assert.equal(response.status, status);
      assert.ok((await response.json()).error);
    }
    assert.equal(DB.rows.length, 0);
  });

  test('зайнятий id: повторює спробу з новим', async () => {
    const DB = fakeDb();
    DB.conflictNext(2);
    const response = await onRequestPost({ request: post({ hex: '#0F766E' }), env: { DB } });
    assert.equal(response.status, 201);
    assert.equal(DB.rows.length, 1);
  });

  test('п’ять конфліктів поспіль це 503 id_collision', async () => {
    const DB = fakeDb();
    DB.conflictNext(5);
    const response = await onRequestPost({ request: post({ hex: '#0F766E' }), env: { DB } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'id_collision');
  });

  test('збій бази це 500 storage_error, без деталей назовні', async () => {
    const DB = { prepare: () => { throw new Error('D1 down: secret details'); } };
    const original = console.error;
    console.error = () => {};
    try {
      const response = await onRequestPost({ request: post({ hex: '#4F46E5' }), env: { DB } });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'storage_error' });
    } finally {
      console.error = original;
    }
  });

  test('інші методи це 405 з Allow: POST', async () => {
    const response = postFallback();
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });
});

describe('GET /api/palettes/:id', () => {
  test('знаходить збережену палітру і дозволяє кешування', async () => {
    const DB = fakeDb();
    const { id } = await (await onRequestPost({ request: post({ hex: '#FACC15' }), env: { DB } })).json();

    const response = await onRequestGet({ params: { id }, env: { DB } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id,
      hex: '#FACC15',
      version: PALETTE_VERSION,
      createdAt: '2026-10-26T12:00:00.000Z',
    });
    assert.match(response.headers.get('cache-control'), /^public, max-age=\d+$/);
  });

  test('невідомий або зіпсований id це 404 без звернення до бази', async () => {
    const DB = { prepare: () => { throw new Error('база не мала викликатись'); } };
    for (const id of ['abcdef', 'ABC123', '../x', 'abc', 'abcil0']) {
      const response = await onRequestGet({ params: { id }, env: { DB: id === 'abcdef' ? fakeDb() : DB } });
      assert.equal(response.status, 404, id);
      assert.deepEqual(await response.json(), { error: 'not_found' });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
});

describe('/api/* без власного маршруту', () => {
  test('віддає JSON 404, а не сторінку застосунку', async () => {
    const response = apiNotFound();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await response.json(), { error: 'not_found' });
  });
});
