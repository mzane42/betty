export interface BankrollSummary {
  allTimeNet: number;
  currentYearNet: number;
  currentMonthNet: number;
  totalBuyIns: number;
  totalWinnings: number;
  tournamentsPlayed: number;
  handsPlayed: number;
  bestMonth: { month: string; net: number } | null;
  worstMonth: { month: string; net: number } | null;
  bestYear: { year: number; net: number } | null;
  worstYear: { year: number; net: number } | null;
}

export interface YearlyBankroll {
  year: number;
  net: number;
  buyIns: number;
  winnings: number;
  tournamentsPlayed: number;
  handsPlayed: number;
}

export interface MonthlyBankroll {
  year: number;
  month: number;
  net: number;
  buyIns: number;
  winnings: number;
  tournamentsPlayed: number;
}

export interface RoiByFormat {
  format: string;
  tournamentsPlayed: number;
  totalBuyIns: number;
  totalWinnings: number;
  net: number;
  roi: number;
}

export interface RoiByStake {
  buyInRange: string;
  minBuyIn: number;
  maxBuyIn: number;
  tournamentsPlayed: number;
  totalBuyIns: number;
  totalWinnings: number;
  net: number;
  roi: number;
}

export interface BankrollPoint {
  date: string;
  cumulativeNet: number;
  sessionNet: number;
}
