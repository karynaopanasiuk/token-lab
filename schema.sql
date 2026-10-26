-- Збережені палітри. Палітра відтворюється з hex, тому зберігаємо тільки його
-- і версію алгоритму (щоб старі посилання можна було мігрувати, якщо шкала зміниться).
CREATE TABLE IF NOT EXISTS palettes (
  id         TEXT    PRIMARY KEY,
  hex        TEXT    NOT NULL
             CHECK (hex GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (hex, version)
);
