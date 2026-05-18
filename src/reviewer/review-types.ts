export type HandVerdict = 'good' | 'okay' | 'mistake' | 'blunder';

export interface KeyMoment {
  street: 'PRE-FLOP' | 'FLOP' | 'TURN' | 'RIVER';
  issue: string;
  suggestion: string;
}

export interface HandReviewResult {
  verdict: HandVerdict;
  overall: string;
  keyMoments: KeyMoment[];
  alternativeLine: string;
  lessons: string[];
  rawResponse: string;
}

export type SessionVerdict = 'winning' | 'even' | 'losing';

export interface SessionPattern {
  pattern: string;
  impact: 'negative' | 'positive';
  advice: string;
}

export interface SessionReviewResult {
  sessionVerdict: SessionVerdict;
  summary: string;
  patterns: SessionPattern[];
  biggestMistake: { handId: string; description: string } | null;
  biggestWin: { handId: string; description: string } | null;
  lessons: string[];
  nextSessionFocus: string;
  rawResponse: string;
}

export type TournamentVerdict = 'won' | 'deep' | 'early-bust';

export interface PhaseAnalysis {
  phase: 'early' | 'mid' | 'late' | 'heads-up';
  stack_range: string;
  play_quality: 'good' | 'okay' | 'leaky';
  comment: string;
}

export interface KeyDecision {
  hand_number: string;
  decision: string;
  verdict: HandVerdict;
  lesson: string;
}

export interface TournamentReviewResult {
  tournamentVerdict: TournamentVerdict;
  summary: string;
  phaseAnalysis: PhaseAnalysis[];
  pivotHand: { hand_number: string; description: string } | null;
  keyDecisions: KeyDecision[];
  lessons: string[];
  rawResponse: string;
}
