import type { Database } from '../database.js';
import type { ParsedHand } from '../../types/hand.js';

export interface HandRepository {
  insertHand(hand: ParsedHand, heroAccount: string): void;
  insertHandBatch(hands: ParsedHand[], heroAccount: string): number;
  handExists(handId: string): boolean;
  countHands(): number;
}

export function createHandRepository(db: Database): HandRepository {
  const insertHandStmt = db.prepare(`
    INSERT OR IGNORE INTO hands (
      hand_id, tournament_id, game_type, tournament_name, level,
      ante, small_blind, big_blind, table_name, table_size, button_seat,
      board, total_pot, rake, played_at, hero_account, hero_cards, hero_position,
      hero_won, hero_invested
    ) VALUES (
      @hand_id, @tournament_id, @game_type, @tournament_name, @level,
      @ante, @small_blind, @big_blind, @table_name, @table_size, @button_seat,
      @board, @total_pot, @rake, @played_at, @hero_account, @hero_cards, @hero_position,
      @hero_won, @hero_invested
    )
  `);

  const insertPlayerStmt = db.prepare(`
    INSERT OR IGNORE INTO hand_players (
      hand_id, player_name, seat, position, stack_start, is_hero, cards, won
    ) VALUES (
      @hand_id, @player_name, @seat, @position, @stack_start, @is_hero, @cards, @won
    )
  `);

  const insertActionStmt = db.prepare(`
    INSERT INTO actions (
      hand_id, street, action_order, player_name, action_type, amount, is_all_in
    ) VALUES (
      @hand_id, @street, @action_order, @player_name, @action_type, @amount, @is_all_in
    )
  `);

  const handExistsStmt = db.prepare('SELECT 1 FROM hands WHERE hand_id = ? LIMIT 1');
  const countHandsStmt = db.prepare('SELECT COUNT(*) as n FROM hands');

  function insertHand(hand: ParsedHand, heroAccount: string): void {
    const heroPlayer = hand.players.find((p) => p.name === hand.heroName) ?? null;
    const heroWon = computePlayerWon(hand, hand.heroName);
    const heroInvested = computePlayerInvested(hand, hand.heroName);

    insertHandStmt.run({
      hand_id: hand.handId,
      tournament_id: hand.tournamentId,
      game_type: hand.gameType,
      tournament_name: hand.tournamentName,
      level: hand.level,
      ante: hand.blinds.ante,
      small_blind: hand.blinds.smallBlind,
      big_blind: hand.blinds.bigBlind,
      table_name: hand.tableName,
      table_size: hand.tableSize,
      button_seat: hand.buttonSeat,
      board: JSON.stringify(hand.board),
      total_pot: hand.pot.total,
      rake: hand.pot.rake,
      played_at: hand.date,
      hero_account: heroAccount,
      hero_cards: hand.heroCards ? JSON.stringify(hand.heroCards) : null,
      hero_position: heroPlayer?.position ?? null,
      hero_won: heroWon,
      hero_invested: heroInvested
    });

    for (const p of hand.players) {
      const won = computePlayerWon(hand, p.name);
      const cards = findShownCards(hand, p.name);
      insertPlayerStmt.run({
        hand_id: hand.handId,
        player_name: p.name,
        seat: p.seat,
        position: p.position,
        stack_start: p.stack,
        is_hero: p.name === hand.heroName ? 1 : 0,
        cards: cards ? JSON.stringify(cards) : null,
        won
      });
    }

    let order = 0;
    for (const street of hand.streets) {
      for (const action of street.actions) {
        insertActionStmt.run({
          hand_id: hand.handId,
          street: street.name,
          action_order: order++,
          player_name: action.player,
          action_type: action.type,
          amount: action.amount,
          is_all_in: action.isAllIn ? 1 : 0
        });
      }
    }
  }

  function insertHandBatch(hands: ParsedHand[], heroAccount: string): number {
    const trx = db.transaction((items: ParsedHand[]) => {
      let inserted = 0;
      for (const h of items) {
        if (!handExists(h.handId)) {
          insertHand(h, heroAccount);
          inserted++;
        }
      }
      return inserted;
    });
    return trx(hands);
  }

  function handExists(handId: string): boolean {
    return handExistsStmt.get(handId) !== undefined;
  }

  function countHands(): number {
    const row = countHandsStmt.get() as { n: number };
    return row.n;
  }

  return { insertHand, insertHandBatch, handExists, countHands };
}

function computePlayerWon(hand: ParsedHand, player: string): number {
  let won = 0;
  for (const w of hand.winners) {
    if (w.player === player) won += w.amount;
  }
  return won;
}

function computePlayerInvested(hand: ParsedHand, player: string): number {
  let invested = 0;
  for (const street of hand.streets) {
    for (const action of street.actions) {
      if (action.player !== player) continue;
      if (action.type === 'call' || action.type === 'bet') {
        invested += action.amount;
      } else if (action.type === 'raise') {
        invested += action.amount;
      } else if (action.type === 'posts_sb' || action.type === 'posts_bb' || action.type === 'posts_ante') {
        invested += action.amount;
      }
    }
  }
  return invested;
}

function findShownCards(hand: ParsedHand, player: string): [string, string] | null {
  if (hand.showdown) {
    const entry = hand.showdown.find((s) => s.player === player);
    if (entry) return entry.cards;
  }
  const summaryEntry = hand.summary.find((s) => s.player === player && s.cards);
  if (summaryEntry && summaryEntry.cards) return summaryEntry.cards;
  return null;
}
