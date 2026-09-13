-- ギルドカルテ解析基盤。
-- 収集元の表記は履歴として保持し、人物の同一性は管理者の判断で確定する。

CREATE TABLE IF NOT EXISTS karte_guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS karte_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','collecting','analyzing','completed','partial','failed')),
  phase TEXT NOT NULL DEFAULT '待機中',
  total_guilds INTEGER NOT NULL DEFAULT 0,
  completed_guilds INTEGER NOT NULL DEFAULT 0,
  failed_guilds INTEGER NOT NULL DEFAULT 0,
  current_guild TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS karte_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  current_family_name TEXT NOT NULL,
  tracking_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS karte_person_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES karte_people(id) ON DELETE CASCADE,
  family_name TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  source TEXT NOT NULL DEFAULT 'guild_snapshot',
  UNIQUE(person_id, family_name)
);

CREATE TABLE IF NOT EXISTS karte_guild_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES karte_runs(id) ON DELETE SET NULL,
  guild_id INTEGER NOT NULL REFERENCES karte_guilds(id),
  retrieved_at TEXT NOT NULL,
  retrieved_date TEXT NOT NULL,
  member_count INTEGER,
  avg_cp REAL,
  total_cp REAL,
  total_fcp REAL,
  active_member_count INTEGER,
  low_member_cp INTEGER,
  high_member_cp INTEGER,
  declared_on_other_guild INTEGER,
  declared_by_other_guild INTEGER,
  total_war INTEGER,
  all_time_win_rate REAL,
  most_war_with_guild TEXT,
  total_node_wars INTEGER,
  node_won INTEGER,
  total_siege_wars INTEGER,
  siege_won INTEGER,
  currently_holding TEXT,
  raw_json TEXT,
  UNIQUE(guild_id, retrieved_at)
);

CREATE TABLE IF NOT EXISTS karte_member_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_snapshot_id INTEGER NOT NULL REFERENCES karte_guild_snapshots(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES karte_people(id) ON DELETE SET NULL,
  family_name TEXT NOT NULL,
  rank_no INTEGER,
  level INTEGER,
  cp REAL,
  fcp REAL,
  class_name_raw TEXT,
  class_name_normalized TEXT,
  class_name_version TEXT,
  raw_json TEXT,
  UNIQUE(guild_snapshot_id, family_name)
);

CREATE TABLE IF NOT EXISTS karte_review_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES karte_runs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('name_change','lost','guild_transfer','unresolved')),
  old_person_id INTEGER REFERENCES karte_people(id) ON DELETE SET NULL,
  old_family_name TEXT,
  old_guild_name TEXT,
  new_family_name TEXT,
  new_guild_name TEXT,
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','same_person','different_person','hold')),
  resolved_at TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS karte_run_failures (
  run_id INTEGER NOT NULL REFERENCES karte_runs(id) ON DELETE CASCADE,
  guild_name TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, guild_name)
);

CREATE TABLE IF NOT EXISTS karte_name_search_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES karte_runs(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES karte_people(id) ON DELETE CASCADE,
  searched_name TEXT NOT NULL,
  found_name TEXT,
  found_guild_name TEXT,
  result TEXT NOT NULL CHECK (result IN ('found','renamed','not_found','error')),
  searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_json TEXT,
  UNIQUE(run_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_karte_guild_snapshots_date
  ON karte_guild_snapshots(guild_id, retrieved_date);
CREATE INDEX IF NOT EXISTS idx_karte_member_person
  ON karte_member_snapshots(person_id, id);
CREATE INDEX IF NOT EXISTS idx_karte_member_name
  ON karte_member_snapshots(family_name);
CREATE INDEX IF NOT EXISTS idx_karte_review_status
  ON karte_review_items(status, detected_at);

INSERT OR IGNORE INTO karte_guilds (name, sort_order) VALUES
  ('AlmaVivaJP', 0), ('TRAITORs', 1), ('・殺戮・', 2), ('VainqueurJP', 3),
  ('PONYTAIL', 4), ('RaиkSS', 5), ('雪狼族', 6), ('PokemonGo', 7),
  ('氣噗噗讓玻璃心碎一地', 8), ('沙漠黑鷹', 9), ('Phoenix', 10),
  ('當惡魔遇到殺手貓', 11), ('Unity', 12), ('Maverickz', 13),
  ('一惡人谷一', 14), ('ーリベリオンー', 15), ('一SUN一', 16), ('黒の太陽', 17),
  ('xAEGISx', 18), ('Orzeca', 19), ('Revenant', 20), ('亗Luxúria亗', 21),
  ('Pandora', 22), ('Döraè่mön', 23), ('REGENCY彡', 24),
  ('黄昏のえりしおん', 25), ('一Arch', 26), ('シェイド', 27), ('ーEspoirー', 28);
