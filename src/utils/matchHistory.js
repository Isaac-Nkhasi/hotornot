import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';

// ── Config ────────────────────────────────────────────────
// How many recent pairs to keep in Firestore per user.
// After this cap, oldest pairs are dropped (they can resurface — that's fine).
const MAX_HISTORY = 500;

// How many pairs to batch before writing to Firestore
const BATCH_SIZE  = 5;

// ── In-memory Set ─────────────────────────────────────────
// This is the source of truth during a session — O(1) lookups,
// no DB read on every pair selection.
const seenPairs = new Set();

// Pending pairs not yet written to Firestore
let pendingWrites = [];
let flushTimer    = null;

// ── Init: load from Firestore on first call ───────────────
let initialized   = false;
let initPromise   = null;

/**
 * Load this user's match history from Firestore into the local Set.
 * Call once at app start. Safe to call multiple times (idempotent).
 */
export async function initMatchHistory() {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, 'match_history', uid));
      if (snap.exists()) {
        const pairs = snap.data().pairs || [];
        pairs.forEach((k) => seenPairs.add(k));
      }
    } catch (err) {
      // Non-fatal — worst case they see a repeat pair
      console.warn('[MatchHistory] Could not load history:', err);
    } finally {
      initialized = true;
    }
  })();

  return initPromise;
}

// ── Public API ────────────────────────────────────────────

/**
 * Canonical, order-independent pair key.
 * pairKey('b','a') === pairKey('a','b') === 'a_b'
 */
export function pairKey(id1, id2) {
  return [id1, id2].sort().join('_');
}

/** Has this pair been seen this session or in Firestore history? */
export function hasSeenPair(key) {
  return seenPairs.has(key);
}

/** How many pairs have been seen total? */
export function seenCount() {
  return seenPairs.size;
}

/**
 * Record a new pair as seen.
 * Updates in-memory Set immediately, queues Firestore write.
 */
export function recordPairSeen(key) {
  if (seenPairs.has(key)) return;
  seenPairs.add(key);
  pendingWrites.push(key);

  if (pendingWrites.length >= BATCH_SIZE) {
    flushHistory();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushHistory, 15_000);
  }
}

// ── Firestore flush ───────────────────────────────────────
async function flushHistory() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (pendingWrites.length === 0) return;

  const uid = auth.currentUser?.uid;
  if (!uid) { pendingWrites = []; return; }

  const toWrite = [...pendingWrites];
  pendingWrites = [];

  try {
    const ref  = doc(db, 'match_history', uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        pairs:       toWrite,
        updatedAt:   serverTimestamp(),
      });
    } else {
      const existing = snap.data().pairs || [];
      // Merge, dedupe, cap at MAX_HISTORY (keep most recent)
      const merged = [...new Set([...existing, ...toWrite])];
      const capped = merged.slice(-MAX_HISTORY);

      await updateDoc(ref, {
        pairs:     capped,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    // Re-queue failed writes
    pendingWrites = [...toWrite, ...pendingWrites];
    console.warn('[MatchHistory] Flush failed:', err);
  }
}

/** Force flush on tab close / component unmount */
export function forceFlushHistory() {
  return flushHistory();
}

// Flush on tab close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (pendingWrites.length > 0) flushHistory().catch(() => {});
  });
}