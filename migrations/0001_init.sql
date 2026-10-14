-- Fresh-install schema. For the already-created king_test database, apply 0002_upgrade_existing.sql instead.
CREATE TABLE IF NOT EXISTS players (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '',
  coins INTEGER NOT NULL DEFAULT 80, wood INTEGER NOT NULL DEFAULT 20, wheat INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, hall_level INTEGER NOT NULL DEFAULT 1,
  harvests INTEGER NOT NULL DEFAULT 0, next_harvest_at INTEGER NOT NULL DEFAULT 0,
  diamonds INTEGER NOT NULL DEFAULT 0, carrots INTEGER NOT NULL DEFAULT 0, potatoes INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT 'ru',
  flag TEXT NOT NULL DEFAULT '🌍', frame TEXT NOT NULL DEFAULT 'none', nick_color TEXT NOT NULL DEFAULT '#49301f',
  vip INTEGER NOT NULL DEFAULT 0, premium INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
  days_played INTEGER NOT NULL DEFAULT 1, plot_data TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS redemption_uses (user_id INTEGER NOT NULL, code TEXT NOT NULL, used_at INTEGER NOT NULL, PRIMARY KEY(user_id,code));
CREATE TABLE IF NOT EXISTS payment_orders (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, sku TEXT NOT NULL, amount_rub INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS task_claims (user_id INTEGER NOT NULL, task_key TEXT NOT NULL, claimed_at INTEGER NOT NULL, PRIMARY KEY(user_id,task_key));
CREATE TABLE IF NOT EXISTS action_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_players_xp ON players(xp DESC,level DESC,hall_level DESC);
CREATE INDEX IF NOT EXISTS idx_action_events_user_time ON action_events(user_id,created_at);
