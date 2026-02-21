import { Settings, StepConfig } from './types';

export const defaultSteps: StepConfig[] = [
  { step: 0, intervalHours: 4, speedThresholdSec: Number.POSITIVE_INFINITY, slowCorrectCapMode: 'stay' },
  { step: 1, intervalHours: 12, speedThresholdSec: 8, slowCorrectCapMode: 'stay' },
  { step: 2, intervalHours: 24, speedThresholdSec: 3, slowCorrectCapMode: 'stay' },
  { step: 3, intervalHours: 48, speedThresholdSec: 2, slowCorrectCapMode: 'stay' },
  { step: 4, intervalHours: 72, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 5, intervalHours: 72, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 6, intervalHours: 168, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 7, intervalHours: 336, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 8, intervalHours: 720, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 9, intervalHours: 1440, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 10, intervalHours: 2880, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 11, intervalHours: 5760, speedThresholdSec: 1, slowCorrectCapMode: 'stay' },
  { step: 12, intervalHours: 8760, speedThresholdSec: 1, slowCorrectCapMode: 'stay' }
];

export const defaultSettings: Settings = {
  frontFields: ['characters'],
  backFields: ['pinyin', 'meaning'],
  steps: defaultSteps,
  wrongBehavior: 'none',
  infiniteRule: {
    startStep: 13,
    fastThresholdSec: 1,
    baseIntervalDays: 365,
    growthFactor: 1.3,
    maxIntervalDays: 3650
  },
  ttsRate: 1,
  ttsPitch: 1,
  dedupeImportMode: 'merge'
};

export function isFastEligible(wasWrongThisSession: boolean, flipTimeSec: number, thresholdSec: number): boolean {
  return !wasWrongThisSession && flipTimeSec <= thresholdSec;
}

export function getStepConfig(status: number, settings: Settings): StepConfig | undefined {
  return settings.steps.find((s) => s.step === status);
}

export function getIntervalHoursForStatus(status: number, settings: Settings): number {
  const step = getStepConfig(status, settings);
  if (step) {
    return step.intervalHours;
  }

  const { startStep, baseIntervalDays, growthFactor, maxIntervalDays } = settings.infiniteRule;
  if (status < startStep) {
    return 24;
  }

  const intervalDays = Math.min(
    maxIntervalDays,
    Math.round(baseIntervalDays * growthFactor ** (status - startStep))
  );
  return intervalDays * 24;
}

export function nextStatusOnCorrect(status: number, fastEligible: boolean, settings: Settings): number {
  const step = getStepConfig(status, settings);
  if (step) {
    if (step.step === 0) {
      return 1;
    }

    if (fastEligible) {
      return status + 1;
    }

    if (step.slowCorrectCapMode === 'demoteOne') {
      return Math.max(0, status - 1);
    }
    if (step.slowCorrectCapMode === 'custom' && step.slowCorrectTarget !== undefined) {
      return step.slowCorrectTarget;
    }
    return status;
  }

  if (status >= settings.infiniteRule.startStep) {
    return fastEligible ? status + 1 : status;
  }

  return status;
}

export function statusOnWrong(status: number, settings: Settings): number {
  if (settings.wrongBehavior === 'lapseOne') {
    return Math.max(0, status - 1);
  }
  if (settings.wrongBehavior === 'resetZero') {
    return 0;
  }
  return status;
}
