-- Poker Coach SQLite Schema
-- All tables use INTEGER for booleans and REAL for money (euros and chip counts).

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS import_state (
  file_path TEXT PRIMARY KEY,
  file_size INTEGER NOT NULL DEFAULT 0,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  hands_imported INTEGER NOT NULL DEFAULT 0,
  last_imported_at TEXT NOT NULL,
  file_kind TEXT NOT NULL  -- 'hand' or 'summary'
);

CREATE TABLE IF NOT EXISTS tournaments (
  tournament_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  buy_in REAL NOT NULL,
  rake REAL NOT NULL,
  registered_players INTEGER,
  mode TEXT,
  type TEXT,
  speed TEXT,
  prizepool REAL,
  start_time TEXT,
  duration TEXT,
  hero_finish_position INTEGER,
  hero_winnings REAL,
  hero_account TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hands (
  hand_id TEXT PRIMARY KEY,
  tournament_id TEXT,
  game_type TEXT NOT NULL,
  tournament_name TEXT,
  level INTEGER,
  ante REAL NOT NULL DEFAULT 0,
  small_blind REAL NOT NULL,
  big_blind REAL NOT NULL,
  table_name TEXT,
  table_size INTEGER NOT NULL,
  button_seat INTEGER NOT NULL,
  board TEXT,
  total_pot REAL NOT NULL,
  rake REAL NOT NULL DEFAULT 0,
  played_at TEXT NOT NULL,
  hero_account TEXT NOT NULL,
  hero_cards TEXT,
  hero_position TEXT,
  hero_won REAL NOT NULL DEFAULT 0,
  hero_invested REAL NOT NULL DEFAULT 0,
  hero_equity_preflop REAL,
  hero_equity_flop REAL,
  hero_equity_turn REAL,
  hero_equity_river REAL,
  equity_computed_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id)
);

CREATE TABLE IF NOT EXISTS hand_players (
  hand_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  seat INTEGER NOT NULL,
  position TEXT NOT NULL,
  stack_start REAL NOT NULL,
  is_hero INTEGER NOT NULL DEFAULT 0,
  cards TEXT,
  won REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (hand_id, player_name),
  FOREIGN KEY (hand_id) REFERENCES hands(hand_id)
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id TEXT NOT NULL,
  street TEXT NOT NULL,
  action_order INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  is_all_in INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (hand_id) REFERENCES hands(hand_id)
);

CREATE TABLE IF NOT EXISTS player_stats (
  player_name TEXT NOT NULL,
  hero_account TEXT NOT NULL,
  hands_played INTEGER NOT NULL DEFAULT 0,
  vpip_opportunities INTEGER NOT NULL DEFAULT 0,
  vpip_actions INTEGER NOT NULL DEFAULT 0,
  pfr_opportunities INTEGER NOT NULL DEFAULT 0,
  pfr_actions INTEGER NOT NULL DEFAULT 0,
  three_bet_opportunities INTEGER NOT NULL DEFAULT 0,
  three_bet_actions INTEGER NOT NULL DEFAULT 0,
  fold_to_3bet_opportunities INTEGER NOT NULL DEFAULT 0,
  fold_to_3bet_actions INTEGER NOT NULL DEFAULT 0,
  cbet_opportunities INTEGER NOT NULL DEFAULT 0,
  cbet_actions INTEGER NOT NULL DEFAULT 0,
  fold_to_cbet_opportunities INTEGER NOT NULL DEFAULT 0,
  fold_to_cbet_actions INTEGER NOT NULL DEFAULT 0,
  total_bets INTEGER NOT NULL DEFAULT 0,
  total_raises INTEGER NOT NULL DEFAULT 0,
  total_calls INTEGER NOT NULL DEFAULT 0,
  went_to_showdown INTEGER NOT NULL DEFAULT 0,
  won_at_showdown INTEGER NOT NULL DEFAULT 0,
  total_won REAL NOT NULL DEFAULT 0,
  total_invested REAL NOT NULL DEFAULT 0,
  first_seen TEXT,
  last_seen TEXT,
  PRIMARY KEY (player_name, hero_account)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  hero_account TEXT NOT NULL,
  session_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  tournaments_played INTEGER DEFAULT 0,
  hands_played INTEGER DEFAULT 0,
  total_buy_ins REAL DEFAULT 0,
  total_winnings REAL DEFAULT 0,
  net_result REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hands_tournament ON hands(tournament_id);
CREATE INDEX IF NOT EXISTS idx_hands_played_at ON hands(played_at);
CREATE INDEX IF NOT EXISTS idx_hands_hero ON hands(hero_account);
CREATE INDEX IF NOT EXISTS idx_hand_players_player ON hand_players(player_name);
CREATE INDEX IF NOT EXISTS idx_actions_hand ON actions(hand_id);
CREATE INDEX IF NOT EXISTS idx_actions_player ON actions(player_name);
CREATE INDEX IF NOT EXISTS idx_player_stats_hands ON player_stats(hands_played DESC);
CREATE INDEX IF NOT EXISTS idx_tournaments_start ON tournaments(start_time);
CREATE INDEX IF NOT EXISTS idx_tournaments_hero ON tournaments(hero_account);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_actions_player_allin ON actions(player_name, is_all_in, street);
CREATE INDEX IF NOT EXISTS idx_hands_invested ON hands(hero_account, hero_invested, hero_won);

CREATE TABLE IF NOT EXISTS hand_reviews (
  hand_id TEXT PRIMARY KEY,
  verdict TEXT NOT NULL,
  overall TEXT,
  key_moments_json TEXT,
  alternative_line TEXT,
  lessons_json TEXT,
  raw_response TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_reviews (
  tournament_id TEXT PRIMARY KEY,
  tournament_verdict TEXT NOT NULL,
  summary TEXT,
  phase_analysis_json TEXT,
  pivot_hand_json TEXT,
  key_decisions_json TEXT,
  lessons_json TEXT,
  raw_response TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_reviews (
  session_date TEXT NOT NULL,
  hero_account TEXT NOT NULL,
  session_verdict TEXT NOT NULL,
  summary TEXT,
  patterns_json TEXT,
  biggest_mistake_json TEXT,
  biggest_win_json TEXT,
  lessons_json TEXT,
  next_session_focus TEXT,
  raw_response TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_date, hero_account)
);

CREATE INDEX IF NOT EXISTS idx_hand_reviews_verdict ON hand_reviews(verdict);
CREATE INDEX IF NOT EXISTS idx_tournament_reviews_verdict ON tournament_reviews(tournament_verdict);
