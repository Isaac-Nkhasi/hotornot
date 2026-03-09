// ── ELO Rating System ─────────────────────────────────────
// K-factor: how much a single match can shift the rating.
// Higher K = more volatile. 32 is standard for new players.
const K_FACTOR = 32;
export const DEFAULT_RATING = 1000;

/**
 * Expected score for player A against player B.
 * Returns a probability 0–1.
 */
export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Given the current ratings of winner and loser,
 * returns the new ratings after the match.
 */
export function calculateNewRatings(winnerRating, loserRating) {
  const expWinner = expectedScore(winnerRating, loserRating);
  const expLoser  = expectedScore(loserRating, winnerRating);

  const newWinnerRating = Math.round(winnerRating + K_FACTOR * (1 - expWinner));
  const newLoserRating  = Math.round(loserRating  + K_FACTOR * (0 - expLoser));

  return {
    newWinnerRating,
    newLoserRating,
    winnerDelta: newWinnerRating - winnerRating,   // always positive
    loserDelta:  newLoserRating  - loserRating,    // always negative
  };
}

/**
 * Win rate as a percentage string e.g. "73%"
 */
export function winRate(wins, losses) {
  const total = wins + losses;
  if (total === 0) return '0%';
  return `${Math.round((wins / total) * 100)}%`;
}
