import { describe, expect, it } from 'vitest';
import { defaultSettings, getIntervalHoursForStatus, isFastEligible, nextStatusOnCorrect } from '../lib/srs';

describe('speed eligibility', () => {
  it('blocks fast eligibility if was wrong this session', () => {
    expect(isFastEligible(true, 0.5, 1)).toBe(false);
  });

  it('allows fast eligibility only under threshold', () => {
    expect(isFastEligible(false, 0.9, 1)).toBe(true);
    expect(isFastEligible(false, 1.1, 1)).toBe(false);
  });

  it('step 1 slow correct caps at same status', () => {
    expect(nextStatusOnCorrect(1, false, defaultSettings)).toBe(1);
  });
});

describe('interval scheduling', () => {
  it('uses configured fixed interval for known step', () => {
    expect(getIntervalHoursForStatus(3, defaultSettings)).toBe(48);
  });

  it('scales interval after infinite start step', () => {
    expect(getIntervalHoursForStatus(13, defaultSettings)).toBe(365 * 24);
    expect(getIntervalHoursForStatus(14, defaultSettings)).toBe(Math.round(365 * 1.3) * 24);
  });
});
