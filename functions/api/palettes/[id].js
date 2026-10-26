// GET /api/palettes/:id  ->  { id, hex, version, createdAt }
import { ID_PATTERN, json } from '../../_lib/palettes.js';

export async function onRequestGet({ params, env }) {
  const id = String(params.id);
  if (!ID_PATTERN.test(id)) return json({ error: 'not_found' }, 404);

  try {
    const row = await env.DB.prepare('SELECT id, hex, version, created_at FROM palettes WHERE id = ?1')
      .bind(id)
      .first();
    if (!row) return json({ error: 'not_found' }, 404);

    // Палітра за id не змінюється, її можна кешувати.
    return json(
      { id: row.id, hex: row.hex, version: row.version, createdAt: row.created_at },
      200,
      { 'cache-control': 'public, max-age=86400' },
    );
  } catch (err) {
    console.error(err);
    return json({ error: 'storage_error' }, 500);
  }
}

export const onRequest = () => json({ error: 'method_not_allowed' }, 405, { allow: 'GET' });
