-- Cloudflare D1 / SQLite oriented draft schema
PRAGMA foreign_keys = ON;

CREATE TABLE guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  note TEXT,
  is_sentinel INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  tier INTEGER,
  legacy_group_code TEXT,
  fortress TEXT,
  capacity INTEGER,
  max_battle_count INTEGER,
  effect TEXT,
  legacy_time_code INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Schedule is separated from nodes because schedule/day/slot may change by version.
CREATE TABLE node_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL REFERENCES nodes(id),
  weekday_key TEXT NOT NULL CHECK (weekday_key IN ('mon','tue','wed','thu','fri','sat','sun')),
  slot TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  UNIQUE(node_id, effective_from)
);

-- Explicit completion avoids using #N/A as flow control.
CREATE TABLE battle_days (
  battle_date TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','complete','locked')),
  note TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE node_war_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_date TEXT NOT NULL REFERENCES battle_days(battle_date),
  node_id INTEGER NOT NULL REFERENCES nodes(id),
  slot TEXT NOT NULL,
  winner_guild_id INTEGER REFERENCES guilds(id),
  winner_raw TEXT, -- preserves sentinel or unresolved legacy text during migration
  battle_count INTEGER,
  unified INTEGER NOT NULL DEFAULT 0,
  banquet INTEGER NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(battle_date, node_id)
);

CREATE TABLE siege_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  battle_date TEXT NOT NULL REFERENCES battle_days(battle_date),
  territory TEXT NOT NULL CHECK (territory IN ('カルフェオン','バレンシア')),
  winner_guild_id INTEGER REFERENCES guilds(id),
  winner_raw TEXT,
  attacker1_guild_id INTEGER REFERENCES guilds(id),
  attacker1_raw TEXT,
  attacker2_guild_id INTEGER REFERENCES guilds(id),
  attacker2_raw TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(battle_date, territory)
);

-- Optional materialized legacy-compatible calculation cache.
-- Prefer recomputing from source records unless performance demands caching.
CREATE TABLE occupation_calculations (
  result_id INTEGER PRIMARY KEY REFERENCES node_war_results(id) ON DELETE CASCADE,
  release_date TEXT,
  holding_days INTEGER,
  tax_days INTEGER,
  calc_status TEXT NOT NULL CHECK (calc_status IN ('resolved','pending','sentinel','error')),
  calc_version TEXT NOT NULL,
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_node_war_date ON node_war_results(battle_date);
CREATE INDEX idx_node_war_winner ON node_war_results(winner_guild_id, battle_date);
CREATE INDEX idx_node_war_node ON node_war_results(node_id, battle_date);
CREATE INDEX idx_siege_winner ON siege_results(winner_guild_id, battle_date);
CREATE INDEX idx_schedule_lookup ON node_schedule(weekday_key, slot, effective_from, effective_to);
