import type { Database } from '../database.js';
import type { ParsedTournamentSummary } from '../../types/tournament.js';

export interface TournamentRepository {
  upsertTournament(summary: ParsedTournamentSummary, heroAccount: string): void;
  insertIfMissing(summary: ParsedTournamentSummary, heroAccount: string): void;
  countTournaments(): number;
}

export function createTournamentRepository(db: Database): TournamentRepository {
  const upsert = db.prepare(`
    INSERT INTO tournaments (
      tournament_id, name, buy_in, rake, registered_players,
      mode, type, speed, prizepool, start_time, duration,
      hero_finish_position, hero_winnings, hero_account
    ) VALUES (
      @tournament_id, @name, @buy_in, @rake, @registered_players,
      @mode, @type, @speed, @prizepool, @start_time, @duration,
      @hero_finish_position, @hero_winnings, @hero_account
    )
    ON CONFLICT(tournament_id) DO UPDATE SET
      name = excluded.name,
      buy_in = excluded.buy_in,
      rake = excluded.rake,
      registered_players = excluded.registered_players,
      mode = excluded.mode,
      type = excluded.type,
      speed = excluded.speed,
      prizepool = excluded.prizepool,
      start_time = excluded.start_time,
      duration = excluded.duration,
      hero_finish_position = excluded.hero_finish_position,
      hero_winnings = excluded.hero_winnings
  `);

  const insertOnly = db.prepare(`
    INSERT OR IGNORE INTO tournaments (
      tournament_id, name, buy_in, rake, registered_players,
      mode, type, speed, prizepool, start_time, duration,
      hero_finish_position, hero_winnings, hero_account
    ) VALUES (
      @tournament_id, @name, @buy_in, @rake, @registered_players,
      @mode, @type, @speed, @prizepool, @start_time, @duration,
      @hero_finish_position, @hero_winnings, @hero_account
    )
  `);

  const count = db.prepare('SELECT COUNT(*) as n FROM tournaments');

  function rowFor(s: ParsedTournamentSummary, heroAccount: string): Record<string, unknown> {
    return {
      tournament_id: s.tournamentId,
      name: s.tournamentName,
      buy_in: s.buyIn,
      rake: s.rake,
      registered_players: s.registeredPlayers,
      mode: s.mode,
      type: s.type,
      speed: s.speed,
      prizepool: s.prizepool,
      start_time: s.startTime,
      duration: s.duration,
      hero_finish_position: s.finishPosition,
      hero_winnings: s.winnings,
      hero_account: heroAccount
    };
  }

  function upsertTournament(s: ParsedTournamentSummary, heroAccount: string): void {
    upsert.run(rowFor(s, heroAccount));
  }

  function insertIfMissing(s: ParsedTournamentSummary, heroAccount: string): void {
    insertOnly.run(rowFor(s, heroAccount));
  }

  function countTournaments(): number {
    const row = count.get() as { n: number };
    return row.n;
  }

  return { upsertTournament, insertIfMissing, countTournaments };
}
