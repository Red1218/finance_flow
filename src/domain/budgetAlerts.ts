// Compares current spend against the highest threshold already alerted for
// this budget, rather than an "old pct vs new pct" delta — this handles a
// create, an amount edit, a category-change edit, and an archive uniformly
// (an edit that moves a transaction to a different category only ever needs
// the *new* category checked; the old one can only have gone down, which
// never fires — see the design spec's "Implementation refinements" section).
export function nextAlertThreshold(currentPct: number, lastAlerted: 80 | 100 | null): 80 | 100 | null {
  if (currentPct >= 100) return lastAlerted === 100 ? null : 100;
  if (currentPct >= 80) return lastAlerted === null ? 80 : null;
  return null;
}
