import { defaultDbPath, openDatabase } from '../db/index.js';
import { readMemoryExcerpt } from '../reviewer/coach-memory.js';

const HERO = 'mzane42';
const db = openDatabase({ dbPath: defaultDbPath() });

const bankroll = db
  .prepare(
    `SELECT
      COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in+rake),0) as net,
      COUNT(*) as tournaments
     FROM tournaments WHERE hero_account = ?`
  )
  .get(HERO) as { net: number; tournaments: number };

const todayDate = new Date().toISOString().slice(0, 10);
const today = db
  .prepare(
    `SELECT
      COUNT(*) as n,
      COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in+rake),0) as net
     FROM tournaments WHERE hero_account = ? AND DATE(start_time) = ?`
  )
  .get(HERO, todayDate) as { n: number; net: number };

const latestSession = db
  .prepare(
    `SELECT DATE(start_time) as date, COUNT(*) as n,
      COALESCE(SUM(hero_winnings),0) - COALESCE(SUM(buy_in+rake),0) as net
     FROM tournaments WHERE hero_account = ?
     GROUP BY date ORDER BY date DESC LIMIT 1`
  )
  .get(HERO) as { date: string; n: number; net: number };

const latestReview = db
  .prepare(
    `SELECT session_date, session_verdict, summary, next_session_focus
     FROM session_reviews WHERE hero_account = ?
     ORDER BY created_at DESC LIMIT 1`
  )
  .get(HERO) as
  | { session_date: string; session_verdict: string; summary: string; next_session_focus: string }
  | undefined;

const lines: string[] = [];
lines.push(`# Brief Poker Coach — ${todayDate}`);
lines.push('');
lines.push(`**Joueur:** ${HERO} (Winamax, surtout Expresso 3-max)`);
lines.push(`**Bankroll all-time:** ${bankroll.net.toFixed(2)}€ sur ${bankroll.tournaments} tournois`);
if (today.n > 0) {
  lines.push(`**Aujourd'hui:** ${today.n} tournois, net ${today.net.toFixed(2)}€`);
}
if (latestSession) {
  lines.push(
    `**Dernière session:** ${latestSession.date} — ${latestSession.n} tournois, net ${latestSession.net.toFixed(2)}€`
  );
}
if (latestReview) {
  lines.push('');
  lines.push(`**Dernière review IA (${latestReview.session_date}):** ${latestReview.session_verdict}`);
  lines.push(`> ${latestReview.summary}`);
  if (latestReview.next_session_focus) {
    lines.push(`> Focus prochaine session: ${latestReview.next_session_focus}`);
  }
}
lines.push('');
lines.push('Voir CLAUDE.md à la racine pour le contexte coaching complet (style, vocab, référentiel chiffres).');
lines.push('');
lines.push('## Memory récente (sessions déjà analysées)');
lines.push('');
lines.push(readMemoryExcerpt(2500));
lines.push('');
lines.push('---');
lines.push('Sur quoi tu veux travailler aujourd\'hui ?');

process.stdout.write(lines.join('\n') + '\n');
