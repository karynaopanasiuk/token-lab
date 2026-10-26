// POST /api/palettes  { "hex": "#4F46E5" }  ->  { id, url }
// 201 для нової палітри, 200 якщо такий hex уже збережений.
import { PALETTE_VERSION, createId, json, readHex } from '../_lib/palettes.js';

const ID_ATTEMPTS = 5;

export async function onRequestPost({ request, env }) {
  const { hex, error, status } = await readHex(request);
  if (error) return json({ error }, status);

  const origin = new URL(request.url).origin;
  const reply = (id, code) => json({ id, url: `${origin}/p/${id}` }, code);

  try {
    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
      const id = createId();
      const inserted = await env.DB.prepare(
        'INSERT INTO palettes (id, hex, version) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING',
      )
        .bind(id, hex, PALETTE_VERSION)
        .run();
      if (inserted.meta.changes === 1) return reply(id, 201);

      // Конфлікт: або цей hex уже є (в тому числі від паралельного запиту), або випав зайнятий id.
      const existing = await env.DB.prepare('SELECT id FROM palettes WHERE hex = ?1 AND version = ?2')
        .bind(hex, PALETTE_VERSION)
        .first();
      if (existing) return reply(existing.id, 200);
    }
    return json({ error: 'id_collision' }, 503);
  } catch (err) {
    console.error(err);
    return json({ error: 'storage_error' }, 500);
  }
}

export const onRequest = () => json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
