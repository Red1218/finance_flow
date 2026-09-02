import { budgetProgress } from './budget';

describe('budgetProgress', () => {
  it('computes remaining and percentage under budget', () => {
    expect(budgetProgress(400, 1000)).toEqual({
      spent: 400,
      limit: 1000,
      remaining: 600,
      pct: 40,
      isOver: false,
    });
  });

  it('flags over-budget spend and lets remaining go negative', () => {
    const result = budgetProgress(1200, 1000);
    expect(result.remaining).toBe(-200);
    expect(result.pct).toBe(120);
    expect(result.isOver).toBe(true);
  });

  it('is not over budget when spend exactly equals the limit', () => {
    expect(budgetProgress(1000, 1000).isOver).toBe(false);
  });

  it('treats a zero limit as 0% rather than dividing by zero', () => {
    const result = budgetProgress(0, 0);
    expect(result.pct).toBe(0);
    expect(result.isOver).toBe(false);
  });

  it('rounds the percentage to the nearest whole number', () => {
    expect(budgetProgress(1, 3).pct).toBe(33);
  });
});
