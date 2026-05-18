import type { Database } from '../db/database.js';
import { runSql } from '../db/database.js';

/**
 * Walk all hands in DB and compute raw player stat counters.
 * Idempotent: clears player_stats and rebuilds from scratch.
 */
export function rebuildPlayerStats(db: Database, heroAccount: string): void {
  runSql(db, `DELETE FROM player_stats WHERE hero_account = '${heroAccount.replace(/'/g, "''")}';`);

  // Get all hands ordered by date
  const hands = db
    .prepare(
      `SELECT hand_id, played_at FROM hands WHERE hero_account = ? ORDER BY played_at ASC`
    )
    .all(heroAccount) as { hand_id: string; played_at: string }[];

  const handPlayersStmt = db.prepare(
    `SELECT player_name, position FROM hand_players WHERE hand_id = ?`
  );
  const actionsStmt = db.prepare(
    `SELECT street, action_order, player_name, action_type, amount FROM actions WHERE hand_id = ? ORDER BY action_order ASC`
  );

  type Counters = {
    handsPlayed: number;
    vpipOpps: number;
    vpipActs: number;
    pfrOpps: number;
    pfrActs: number;
    threeBetOpps: number;
    threeBetActs: number;
    foldTo3betOpps: number;
    foldTo3betActs: number;
    cbetOpps: number;
    cbetActs: number;
    foldToCbetOpps: number;
    foldToCbetActs: number;
    totalBets: number;
    totalRaises: number;
    totalCalls: number;
    wtsd: number;
    wsd: number;
    firstSeen: string | null;
    lastSeen: string | null;
  };

  const counters = new Map<string, Counters>();

  function bumpCounter(name: string): Counters {
    let c = counters.get(name);
    if (!c) {
      c = {
        handsPlayed: 0,
        vpipOpps: 0,
        vpipActs: 0,
        pfrOpps: 0,
        pfrActs: 0,
        threeBetOpps: 0,
        threeBetActs: 0,
        foldTo3betOpps: 0,
        foldTo3betActs: 0,
        cbetOpps: 0,
        cbetActs: 0,
        foldToCbetOpps: 0,
        foldToCbetActs: 0,
        totalBets: 0,
        totalRaises: 0,
        totalCalls: 0,
        wtsd: 0,
        wsd: 0,
        firstSeen: null,
        lastSeen: null
      };
      counters.set(name, c);
    }
    return c;
  }

  for (const hand of hands) {
    const players = handPlayersStmt.all(hand.hand_id) as {
      player_name: string;
      position: string;
    }[];
    const actions = actionsStmt.all(hand.hand_id) as {
      street: string;
      action_order: number;
      player_name: string;
      action_type: string;
      amount: number;
    }[];

    // Pre-flop analysis
    const preflopActions = actions.filter((a) => a.street === 'PRE-FLOP');
    const voluntaryActions = preflopActions.filter(
      (a) => a.action_type !== 'posts_sb' && a.action_type !== 'posts_bb' && a.action_type !== 'posts_ante'
    );

    // Track each player's pre-flop journey
    const seenPlayers = new Set<string>();
    let raiseCount = 0; // number of raises so far in pre-flop
    let lastRaiser: string | null = null;
    const playerActedPF = new Set<string>();

    for (const a of voluntaryActions) {
      const c = bumpCounter(a.player_name);
      if (!seenPlayers.has(a.player_name)) {
        seenPlayers.add(a.player_name);
        c.handsPlayed++;
        if (!c.firstSeen) c.firstSeen = hand.played_at;
        c.lastSeen = hand.played_at;
        // VPIP opportunity (everyone who acts has the opportunity to vpip)
        c.vpipOpps++;
        c.pfrOpps++;
      }

      // VPIP / PFR detection: first voluntary action
      const isFirstAction = !playerActedPF.has(a.player_name);
      if (isFirstAction) {
        playerActedPF.add(a.player_name);
        if (a.action_type === 'call' || a.action_type === 'bet' || a.action_type === 'raise') {
          c.vpipActs++;
        }
        if (a.action_type === 'raise' || a.action_type === 'bet') {
          c.pfrActs++;
        }
      }

      // 3-bet detection: a "raise" when there has already been at least 1 raise
      if (a.action_type === 'raise') {
        if (raiseCount >= 1) {
          c.threeBetOpps++;
          c.threeBetActs++;
        }
        raiseCount++;
        lastRaiser = a.player_name;
      } else if (a.action_type === 'fold' && lastRaiser && raiseCount >= 2) {
        // Folding to a 3-bet
        c.foldTo3betOpps++;
        c.foldTo3betActs++;
      }

      // Aggregate counters
      if (a.action_type === 'bet') c.totalBets++;
      else if (a.action_type === 'raise') c.totalRaises++;
      else if (a.action_type === 'call') c.totalCalls++;
    }

    // Track pre-flop aggressor for c-bet detection
    const preflopAggressor = lastRaiser;

    // Flop c-bet
    const flopActions = actions.filter((a) => a.street === 'FLOP');
    if (preflopAggressor && flopActions.length > 0) {
      const c = bumpCounter(preflopAggressor);
      const aggressorFirstFlop = flopActions.find((a) => a.player_name === preflopAggressor);
      if (aggressorFirstFlop) {
        c.cbetOpps++;
        if (aggressorFirstFlop.action_type === 'bet') {
          c.cbetActs++;
          // Track fold-to-cbet for other players who acted after
          let cbetFound = false;
          for (const fa of flopActions) {
            if (fa.player_name === preflopAggressor && fa.action_type === 'bet') {
              cbetFound = true;
              continue;
            }
            if (!cbetFound) continue;
            if (fa.action_type === 'fold') {
              const other = bumpCounter(fa.player_name);
              other.foldToCbetOpps++;
              other.foldToCbetActs++;
            } else if (fa.action_type === 'call' || fa.action_type === 'raise') {
              const other = bumpCounter(fa.player_name);
              other.foldToCbetOpps++;
            }
          }
        }
      }
    }

    // Showdown stats
    const reachedShowdown = actions.some((a) => a.street === 'RIVER') && players.length > 1;
    if (reachedShowdown) {
      for (const p of players) {
        const c = bumpCounter(p.player_name);
        c.wtsd++;
      }
    }

    // Aggregate flop/turn/river bets/raises/calls
    for (const a of actions.filter((a) => a.street !== 'PRE-FLOP')) {
      const c = bumpCounter(a.player_name);
      if (a.action_type === 'bet') c.totalBets++;
      else if (a.action_type === 'raise') c.totalRaises++;
      else if (a.action_type === 'call') c.totalCalls++;
    }
  }

  // Money totals from hand_players
  const moneyStmt = db.prepare(
    `SELECT player_name, SUM(won) as total_won FROM hand_players GROUP BY player_name`
  );
  const moneyRows = moneyStmt.all() as { player_name: string; total_won: number }[];
  const moneyByPlayer = new Map(moneyRows.map((r) => [r.player_name, r.total_won]));

  // Persist
  const insert = db.prepare(`
    INSERT INTO player_stats (
      player_name, hero_account, hands_played,
      vpip_opportunities, vpip_actions,
      pfr_opportunities, pfr_actions,
      three_bet_opportunities, three_bet_actions,
      fold_to_3bet_opportunities, fold_to_3bet_actions,
      cbet_opportunities, cbet_actions,
      fold_to_cbet_opportunities, fold_to_cbet_actions,
      total_bets, total_raises, total_calls,
      went_to_showdown, won_at_showdown,
      total_won, total_invested,
      first_seen, last_seen
    ) VALUES (
      @player_name, @hero_account, @hands_played,
      @vpip_opportunities, @vpip_actions,
      @pfr_opportunities, @pfr_actions,
      @three_bet_opportunities, @three_bet_actions,
      @fold_to_3bet_opportunities, @fold_to_3bet_actions,
      @cbet_opportunities, @cbet_actions,
      @fold_to_cbet_opportunities, @fold_to_cbet_actions,
      @total_bets, @total_raises, @total_calls,
      @went_to_showdown, @won_at_showdown,
      @total_won, @total_invested,
      @first_seen, @last_seen
    )
  `);

  const trx = db.transaction(() => {
    for (const [player, c] of counters) {
      insert.run({
        player_name: player,
        hero_account: heroAccount,
        hands_played: c.handsPlayed,
        vpip_opportunities: c.vpipOpps,
        vpip_actions: c.vpipActs,
        pfr_opportunities: c.pfrOpps,
        pfr_actions: c.pfrActs,
        three_bet_opportunities: c.threeBetOpps,
        three_bet_actions: c.threeBetActs,
        fold_to_3bet_opportunities: c.foldTo3betOpps,
        fold_to_3bet_actions: c.foldTo3betActs,
        cbet_opportunities: c.cbetOpps,
        cbet_actions: c.cbetActs,
        fold_to_cbet_opportunities: c.foldToCbetOpps,
        fold_to_cbet_actions: c.foldToCbetActs,
        total_bets: c.totalBets,
        total_raises: c.totalRaises,
        total_calls: c.totalCalls,
        went_to_showdown: c.wtsd,
        won_at_showdown: c.wsd,
        total_won: moneyByPlayer.get(player) ?? 0,
        total_invested: 0,
        first_seen: c.firstSeen,
        last_seen: c.lastSeen
      });
    }
  });
  trx();
}
