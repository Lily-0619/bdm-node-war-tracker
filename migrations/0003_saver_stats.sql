CREATE TABLE IF NOT EXISTS saver_stats_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server TEXT NOT NULL CHECK (server IN ('ASIA', 'EUROPE', 'AMERICA')),
  captured_date TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  total_players INTEGER NOT NULL,
  active_players INTEGER NOT NULL,
  total_guilds INTEGER NOT NULL,
  active_guilds INTEGER NOT NULL,
  source_url TEXT NOT NULL DEFAULT 'https://dbonk.com/bdmbsmv2/index.php',
  UNIQUE(server, captured_date)
);

CREATE TABLE IF NOT EXISTS saver_stats_classes (
  snapshot_id INTEGER NOT NULL REFERENCES saver_stats_snapshots(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  player_count INTEGER NOT NULL CHECK (player_count >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_id, class_name)
);

CREATE INDEX IF NOT EXISTS idx_saver_stats_date
  ON saver_stats_snapshots(captured_date, server);

