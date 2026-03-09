// ── Session Vote Tracker ──────────────────────────────────
// Prevents voting on the same pair twice in one session.
// Uses sessionStorage so it resets when the tab closes.

const SESSION_KEY = 'hon_voted_pairs';

function getVotedSet() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveVotedSet(set) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — silent fail
  }
}

/**
 * Canonical pair key — order-independent.
 * e.g. pairKey('b','a') === pairKey('a','b') === 'a_b'
 */
export function pairKey(id1, id2) {
  return [id1, id2].sort().join('_');
}

/** Returns true if this pair has already been voted on this session. */
export function hasVotedPair(key) {
  return getVotedSet().has(key);
}

/** Record that this pair has been voted on. */
export function markPairVoted(key) {
  const set = getVotedSet();
  set.add(key);
  saveVotedSet(set);
}
