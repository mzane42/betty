/** Tooltips text for all metrics and columns. Centralized for consistency. */
export const TIPS = {
  // Bankroll
  allTimeNet: "Total gain/perte depuis ta toute première main. Total mis (buy-ins) vs total récupéré (prizes). Vert = gagnant. Rouge = perdant.",
  currentYearNet: "Net (gain/perte) de l'année calendaire en cours uniquement.",
  currentMonthNet: "Net du mois calendaire en cours uniquement.",
  bestMonth: "Le meilleur mois de ton historique (montant + date).",
  worstMonth: "Le pire mois de ton historique.",
  tournaments: "Nombre de tournois joués (sample size pour la fiabilité des stats).",
  hands: "Nombre total de mains jouées.",
  buyIns: "Total payé en buy-ins (buy-in + rake/frais) en €.",
  winnings: "Total des prizes encaissés en €.",
  netResult: "Profit/perte = Winnings - Buy-ins.",
  roi: "Return On Investment = (Net / Buy-ins) × 100. >+10%/200 tournois = solide. <-10% = leak grave.",
  bankrollAfter: "Ton bankroll cumulé depuis le début après cette session. Photo de ton solde à la fin de ce jour-là.",
  sessionDate: "Une ligne = tous les tournois joués le même jour calendaire.",

  // Player stats
  vpip:
    "Voluntarily Put $ In Pot. % de mains où il met volontairement de la thune pré-flop (hors blindes obligatoires).\n<20% tight · 20-30% normal · >35% loose · >50% fish",
  pfr:
    "Pre-Flop Raise. % de mains où il raise pré-flop. Mesure agressivité pré-flop.\n<8% passif · 10-20% normal · >25% aggro",
  threeBet:
    "% du temps où il re-raise face à un raise pré-flop. Mesure agressivité face aux raises.\n<3% jamais · 5-8% normal · >10% aggro",
  af:
    "Aggression Factor = (bets + raises) / calls post-flop. Mesure agression après le flop.\n<1 passif · 1-2 normal · >2 aggro · >3 maniac",
  tendency:
    "Tag auto basé sur VPIP + PFR + AF. tight-aggressive = bon · loose-passive = fish · maniac = aggro fou · nit = ultra-tight.",
  handsSeen:
    "Nombre de mains où tu l'as croisé. Plus c'est gros, plus les stats sont fiables.\n<30 pas fiable · 30-100 OK · 100+ solide",
  wonVsYou:
    "Combien il a gagné/perdu contre toi en chips cumulés. Vert = il te bat. Rouge = tu le bats.",

  // Leaks
  leakSeverity:
    "Gravité de la fuite. HIGH = à corriger en priorité. MEDIUM = à surveiller.",
  leakCost: "Combien cette fuite t'a coûté au total (chips ou €).",

  // Games
  confidence:
    "Fiabilité de la stat. HIGH >200 tournois (très fiable) · MEDIUM 50-200 · LOW <50 (peu fiable).",
  recommendation:
    "Conseil auto: play more (profitable, continue) · keep playing (OK) · investigate (suspect) · avoid (arrête).",
  stake: "Niveau de buy-in (1€, 2€, 5€, 10€). Sert à voir où tu es profitable.",

  // Progress
  period: "Période agrégée: trimestre (2018-Q3) ou mois (2018-08).",
  itm:
    "In The Money. % de tournois finis dans les places payées (peu importe le rang). Bon joueur Expresso ~33% ITM.",

  // Positions
  position:
    "Position à la table. BTN (button) = meilleure position · SB/BB = blindes · UTG/CO/HJ = positions intermédiaires."
} as const;
