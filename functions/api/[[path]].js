// Усе під /api/, що не має власного маршруту, віддає JSON 404, а не сторінку застосунку.
import { json } from '../_lib/palettes.js';

export const onRequest = () => json({ error: 'not_found' }, 404);
