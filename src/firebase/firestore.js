import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// ─────────────────────────────────────────────────────────
//  META / STATS
// ─────────────────────────────────────────────────────────

/**
 * Subscribe to live stats (totalImages, totalVotes).
 * Returns an unsubscribe function.
 */
export function subscribeToStats(callback) {
  return onSnapshot(doc(db, 'meta', 'stats'), (snap) => {
    if (snap.exists()) callback(snap.data());
    else callback({ totalImages: 0, totalVotes: 0 });
  });
}

export async function getStats() {
  const snap = await getDoc(doc(db, 'meta', 'stats'));
  return snap.exists() ? snap.data() : { totalImages: 0, totalVotes: 0 };
}

// ─────────────────────────────────────────────────────────
//  RANDOM PAIR  —  O(1) index-based lookup
// ─────────────────────────────────────────────────────────

/**
 * Fetches two different random images using index fields.
 * O(1) — never scans the whole collection.
 *
 * @param {Set<string>} seenPairs  — Set of pair keys already seen this session
 * @param {number}      attempt    — internal retry counter (do not pass manually)
 */
export async function getRandomPair(seenPairs = new Set(), attempt = 0) {
  const stats = await getStats();
  const total = stats.totalImages || 0;

  if (total < 2) return null;

  // How many possible unique pairs exist?
  const maxUniquePairs = (total * (total - 1)) / 2;
  // If user has seen most/all pairs, reset gracefully rather than infinite-loop
  const exhausted = seenPairs.size >= maxUniquePairs * 0.9;

  // Cap retries: after 8 attempts just return whatever we find
  const MAX_ATTEMPTS = 8;

  // Pick two distinct random indices
  let idx1 = Math.floor(Math.random() * total);
  let idx2;
  let picks = 0;
  do {
    idx2 = Math.floor(Math.random() * total);
    picks++;
  } while (idx2 === idx1 && picks < 20);

  // Fetch both in parallel
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, 'images'), where('index', '==', idx1), limit(1))),
    getDocs(query(collection(db, 'images'), where('index', '==', idx2), limit(1))),
  ]);

  if (snap1.empty || snap2.empty) return null;

  const img1 = { id: snap1.docs[0].id, ...snap1.docs[0].data() };
  const img2 = { id: snap2.docs[0].id, ...snap2.docs[0].data() };

  // Guard against same doc
  if (img1.id === img2.id) return null;

  const key = [img1.id, img2.id].sort().join('_');

  // If this pair was seen before, retry — unless exhausted or max retries hit
  if (seenPairs.has(key) && !exhausted && attempt < MAX_ATTEMPTS) {
    return getRandomPair(seenPairs, attempt + 1);
  }

  return [img1, img2];
}

// ─────────────────────────────────────────────────────────
//  BATCH VOTE FLUSH
// ─────────────────────────────────────────────────────────

/**
 * Write a batch of accumulated votes to Firestore in one round-trip.
 * Aggregates multiple votes for the same image before writing.
 */
export async function flushVotesToFirestore(votes) {
  if (!votes || votes.length === 0) return;

  const batch = writeBatch(db);

  // Aggregate per image
  const agg = {};
  const ensure = (id) => {
    if (!agg[id]) agg[id] = { wins: 0, losses: 0, ratingDelta: 0, votes: 0 };
  };

  for (const v of votes) {
    ensure(v.winnerId);
    ensure(v.loserId);

    agg[v.winnerId].wins      += 1;
    agg[v.winnerId].ratingDelta += v.ratingChange.winner;
    agg[v.winnerId].votes     += 1;

    agg[v.loserId].losses     += 1;
    agg[v.loserId].ratingDelta += v.ratingChange.loser;
    agg[v.loserId].votes      += 1;
  }

  for (const [imageId, data] of Object.entries(agg)) {
    batch.update(doc(db, 'images', imageId), {
      wins:   increment(data.wins),
      losses: increment(data.losses),
      rating: increment(data.ratingDelta),
      votes:  increment(data.votes),
    });
  }

  // Bump global vote counter
  batch.update(doc(db, 'meta', 'stats'), {
    totalVotes: increment(votes.length),
  });

  await batch.commit();
}

/**
 * Update streaks immediately (not batched) — winner streak +1, loser streak reset.
 * This is a separate lightweight write because streak order matters.
 */
export async function updateStreaks(winnerId, loserId) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'images', winnerId), { streak: increment(1) });
  batch.update(doc(db, 'images', loserId),  { streak: 0 });
  await batch.commit();
}

// ─────────────────────────────────────────────────────────
//  PAIR COMMENTS & REACTIONS
// ─────────────────────────────────────────────────────────

const MAX_COMMENTS = 40; // cap stored per pair

/**
 * Increment the vote count on a pair doc.
 * Called alongside the regular vote flow.
 */
export async function incrementPairVotes(pairKey) {
  const ref = doc(db, 'pair_comments', pairKey);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { pairVotes: increment(1) });
  } else {
    await setDoc(ref, { pairVotes: 1, totalReactions: 0, comments: [] });
  }
}

/**
 * Fetch comments + meta for a pair.
 * Returns null if pairVotes <= 5 (not enough heat yet).
 */
export async function getPairComments(pairKey) {
  const snap = await getDoc(doc(db, 'pair_comments', pairKey));
  if (!snap.exists()) return null;
  const data = snap.data();
  if ((data.pairVotes || 0) <= 5) return null;
  return {
    pairVotes:      data.pairVotes      || 0,
    totalReactions: data.totalReactions || 0,
    comments:       data.comments       || [],
  };
}

/**
 * Add a text comment to a pair.
 * Keeps only the latest MAX_COMMENTS entries.
 */
export async function addPairComment(pairKey, text, uid) {
  const ref     = doc(db, 'pair_comments', pairKey);
  const snap    = await getDoc(ref);
  const existing = snap.exists() ? (snap.data().comments || []) : [];

  const newComment = { text, uid, createdAt: Date.now() };
  const updated   = [...existing, newComment].slice(-MAX_COMMENTS);

  if (snap.exists()) {
    await updateDoc(ref, { comments: updated });
  } else {
    await setDoc(ref, { pairVotes: 0, totalReactions: 0, comments: updated });
  }
}

/**
 * Add a reaction (emoji) to a pair.
 */
export async function addPairReaction(pairKey, emoji, uid) {
  const ref  = doc(db, 'pair_comments', pairKey);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data().reactions || []) : [];

  const newReaction = { emoji, uid, createdAt: Date.now() };
  const updated     = [...existing, newReaction].slice(-MAX_COMMENTS);

  if (snap.exists()) {
    await updateDoc(ref, {
      totalReactions: increment(1),
      reactions:      updated,
    });
  } else {
    await setDoc(ref, {
      pairVotes: 0, totalReactions: 1, comments: [], reactions: updated,
    });
  }
}

// ─────────────────────────────────────────────────────────
//  RESET (admin only)
// ─────────────────────────────────────────────────────────

/**
 * Resets every image's votes, wins, losses, streak back to 0
 * and rating back to 1000. Also zeroes out totalVotes in meta/stats.
 * Processes in batches of 500 (Firestore batch write limit).
 */
export async function resetAllVotes() {
  const snap = await getDocs(collection(db, 'images'));
  if (snap.empty) return 0;

  const docs   = snap.docs;
  const CHUNK  = 499; // stay under 500 limit
  let   count  = 0;

  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + CHUNK);

    chunk.forEach((d) => {
      batch.update(d.ref, {
        rating: 1000,
        wins:   0,
        losses: 0,
        votes:  0,
        streak: 0,
      });
      count++;
    });

    await batch.commit();
  }

  // Reset global vote counter
  await updateDoc(doc(db, 'meta', 'stats'), { totalVotes: 0 });

  return count;
}

// ─────────────────────────────────────────────────────────
//  LEADERBOARD  —  simple sorted query
// ─────────────────────────────────────────────────────────

export async function getLeaderboard(n = 50) {
  const q = query(
    collection(db, 'images'),
    orderBy('rating', 'desc'),
    limit(n)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────────────────
//  SEEDING (admin only)
// ─────────────────────────────────────────────────────────

/**
 * Add a new image to Firestore.
 * Assigns the next available index from meta/stats.totalImages.
 */
export async function seedImage(imageURL) {
  const stats = await getStats();
  const nextIndex = stats.totalImages || 0;

  const newRef = doc(collection(db, 'images'));
  await setDoc(newRef, {
    imageURL,
    index:     nextIndex,
    rating:    1000,
    wins:      0,
    losses:    0,
    votes:     0,
    streak:    0,
    createdAt: serverTimestamp(),
  });

  // Upsert the meta/stats counter
  const metaRef = doc(db, 'meta', 'stats');
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists()) {
    await updateDoc(metaRef, { totalImages: increment(1) });
  } else {
    await setDoc(metaRef, { totalImages: 1, totalVotes: 0 });
  }

  return newRef.id;
}