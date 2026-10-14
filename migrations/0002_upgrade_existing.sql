-- Apply each ALTER statement ONE AT A TIME in D1 Console for the existing king_test database.
ALTER TABLE players ADD COLUMN next_harvest_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN flag TEXT NOT NULL DEFAULT '🌍';
ALTER TABLE players ADD COLUMN frame TEXT NOT NULL DEFAULT 'none';
ALTER TABLE players ADD COLUMN nick_color TEXT NOT NULL DEFAULT '#49301f';
ALTER TABLE players ADD COLUMN vip INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN premium INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN days_played INTEGER NOT NULL DEFAULT 1;
ALTER TABLE players ADD COLUMN plot_data TEXT NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS task_claims (user_id INTEGER NOT NULL, task_key TEXT NOT NULL, claimed_at INTEGER NOT NULL, PRIMARY KEY(user_id,task_key));
CREATE TABLE IF NOT EXISTS action_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_players_xp ON players(xp DESC,level DESC,hall_level DESC);
CREATE INDEX IF NOT EXISTS idx_action_events_user_time ON action_events(user_id,created_at);
