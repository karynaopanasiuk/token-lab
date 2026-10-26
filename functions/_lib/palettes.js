// Спільне для функцій палітр: валідація запиту, короткий id, JSON-відповіді.
// Файл без onRequest* не є маршрутом, Pages його ігнорує.
import { normalizeHex } from '../../public/color.js';

// Версія алгоритму шкали. Зберігається разом з hex.
export const PALETTE_VERSION = 1;

// 32 символи без i, l, o, u: не плутаються між собою, а байт & 31 не дає перекосу.
const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const ID_LENGTH = 6;
export const ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{6}$/;

const MAX_BODY_BYTES = 1024;

export function createId(fill = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = fill(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte & 31]).join('');
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
}

/** Читає тіло POST. Повертає { hex } з нормалізованим '#RRGGBB' або { error, status }. */
export async function readHex(request) {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    return { error: 'unsupported_media_type', status: 415 };
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) {
    return { error: 'payload_too_large', status: 413 };
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'payload_too_large', status: 413 };

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: 'invalid_json', status: 400 };
  }

  const hex = body !== null && typeof body === 'object' ? normalizeHex(body.hex) : null;
  return hex ? { hex } : { error: 'invalid_hex', status: 400 };
}
