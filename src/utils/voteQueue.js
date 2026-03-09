import { flushVotesToFirestore } from '../firebase/firestore';

// ── Config ────────────────────────────────────────────────
const BATCH_SIZE     = 10;
const FLUSH_INTERVAL = 10_000; // ms

// ── State ─────────────────────────────────────────────────
let queue  = [];
let timer  = null;
let flushing = false;

// ── Core flush ────────────────────────────────────────────
async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (queue.length === 0 || flushing) return;

  flushing = true;
  const toFlush = [...queue];
  queue = [];

  try {
    await flushVotesToFirestore(toFlush);
  } catch (err) {
    // Re-queue failed votes so they're not lost
    queue = [...toFlush, ...queue];
    console.error('[VoteQueue] Flush failed:', err);
  } finally {
    flushing = false;
  }
}

// ── Public API ────────────────────────────────────────────

/**
 * Add a vote to the local queue.
 * Flushes immediately if BATCH_SIZE is reached,
 * otherwise schedules a flush after FLUSH_INTERVAL.
 */
export function enqueueVote(vote) {
  queue.push(vote);

  if (queue.length >= BATCH_SIZE) {
    flush();
  } else if (!timer) {
    timer = setTimeout(flush, FLUSH_INTERVAL);
  }
}

/** Force an immediate flush (e.g. on page unload or component unmount). */
export function forceFlush() {
  return flush();
}

/** How many votes are currently waiting to be sent. */
export function pendingCount() {
  return queue.length;
}

// ── Flush on tab close ────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (queue.length > 0) {
      flushVotesToFirestore(queue).catch(() => {});
    }
  });
}
