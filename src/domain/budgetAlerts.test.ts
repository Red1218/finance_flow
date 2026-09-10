import { nextAlertThreshold } from './budgetAlerts';

describe('nextAlertThreshold', () => {
  it('returns null when spend is below both thresholds', () => {
    expect(nextAlertThreshold(50, null)).toBeNull();
  });

  it('returns 80 the first time spend crosses 80%, never alerted before', () => {
    expect(nextAlertThreshold(85, null)).toBe(80);
  });

  it('skips straight to 100 when spend jumps past both thresholds in one save', () => {
    expect(nextAlertThreshold(110, null)).toBe(100);
  });

  it('returns null for a second crossing of 80% after it was already alerted', () => {
    expect(nextAlertThreshold(90, 80)).toBeNull();
  });

  it('returns 100 when spend crosses over budget after 80 was already alerted', () => {
    expect(nextAlertThreshold(105, 80)).toBe(100);
  });

  it('returns null once 100 has already been alerted, no matter how far over', () => {
    expect(nextAlertThreshold(150, 100)).toBeNull();
  });

  it('returns null when an edit pushes spend back below 80 (no re-alert, no reset)', () => {
    expect(nextAlertThreshold(70, 80)).toBeNull();
  });

  it('returns null when an edit pushes spend back down after 100 was alerted', () => {
    expect(nextAlertThreshold(60, 100)).toBeNull();
  });
});
