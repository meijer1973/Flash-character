export type CardField = 'characters' | 'pinyin' | 'meaning';

export interface Card {
  id: string;
  characters: string;
  pinyin?: string;
  meaning: string;
  status: number;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt?: string;
  lastAnswerMs?: number;
  streak: number;
  lapses: number;
}

export interface Review {
  id: string;
  cardId: string;
  reviewedAt: string;
  answerMs: number;
  resultType: 'correct' | 'wrong';
  statusBefore: number;
  statusAfter: number;
  attemptNumber: number;
  fastEligible: boolean;
}

export interface StepConfig {
  step: number;
  intervalHours: number;
  speedThresholdSec: number;
  slowCorrectCapMode: 'stay' | 'demoteOne' | 'custom';
  slowCorrectTarget?: number;
}

export interface InfiniteRuleConfig {
  startStep: number;
  fastThresholdSec: number;
  baseIntervalDays: number;
  growthFactor: number;
  maxIntervalDays: number;
}

export interface Settings {
  frontFields: CardField[];
  backFields: CardField[];
  steps: StepConfig[];
  wrongBehavior: 'none' | 'lapseOne' | 'resetZero';
  infiniteRule: InfiniteRuleConfig;
  ttsVoiceName?: string;
  ttsRate: number;
  ttsPitch: number;
  dedupeImportMode: 'merge' | 'keepBoth';
}

export interface SessionCardState {
  attemptsThisSession: number;
  wasWrongThisSession: boolean;
}
