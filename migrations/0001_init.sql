-- 拠点戦・税収管理ボード / D1 スキーマ

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guilds (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  note   TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

-- 拠点の等級・曜日・枠は今後変わる前提。計算ロジックから切り離してここで管理する。
CREATE TABLE IF NOT EXISTS nodes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  tier           TEXT NOT NULL,          -- '1' / '2' / '3' / 'castle'
  weekday        TEXT NOT NULL,          -- mon / thu / fri / sat / sun
  slot           TEXT NOT NULL,          -- 3A / 3B / 2A ... / 攻城
  time_code      INTEGER,                -- 19 / 21（攻城戦はNULL）
  fortress       INTEGER NOT NULL DEFAULT 0,
  capacity       INTEGER,
  bid_slots      INTEGER,
  effect         TEXT NOT NULL DEFAULT '',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT NOT NULL
);

-- 1戦 = 1レコード
CREATE TABLE IF NOT EXISTS battles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_date     TEXT NOT NULL,
  node_id         INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  unified         INTEGER NOT NULL DEFAULT 0,
  banquet         INTEGER NOT NULL DEFAULT 0,
  winner_guild_id INTEGER REFERENCES guilds(id),
  updated_at      TEXT,
  UNIQUE(battle_date, node_id)
);

-- 対戦ギルド（攻城戦の攻城1/攻城2は position 1/2）
CREATE TABLE IF NOT EXISTS battle_participants (
  battle_id INTEGER NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  guild_id  INTEGER NOT NULL REFERENCES guilds(id),
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (battle_id, guild_id)
);

-- 運用開始時点の保有状況（過去データを引き継がないための起点）
CREATE TABLE IF NOT EXISTS initial_holdings (
  node_id            INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  guild_id           INTEGER REFERENCES guilds(id),
  acquired_date      TEXT,
  last_released_date TEXT
);

CREATE INDEX IF NOT EXISTS idx_battles_date   ON battles(battle_date);
CREATE INDEX IF NOT EXISTS idx_battles_node   ON battles(node_id, battle_date);
CREATE INDEX IF NOT EXISTS idx_battles_winner ON battles(winner_guild_id, battle_date);
