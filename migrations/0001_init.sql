-- Initial D1 schema for migration testing only.
-- It is NOT an automatic conversion of the original SQLite database.
CREATE TABLE IF NOT EXISTS players (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  coins INTEGER NOT NULL DEFAULT 80,
  wood INTEGER NOT NULL DEFAULT 20,
  wheat INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  hall_level INTEGER NOT NULL DEFAULT 1,
  harvests INTEGER NOT NULL DEFAULT 0,
  diamonds INTEGER NOT NULL DEFAULT 0,
  carrots INTEGER NOT NULL DEFAULT 0,
  potatoes INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'ru',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS redemption_uses (
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, code)
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  amount_rub INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
