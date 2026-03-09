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
 */
export async function getRandomPair(excludePairKey = null) {
  const stats = await getStats();
  const total = stats.totalImages || 0;

  if (total < 2) return null;

  // Pick two distinct random indices
  let idx1 = Math.floor(Math.random() * total);
  let idx2;
  let attempts = 0;
  do {
    idx2 = Math.floor(Math.random() * total);
    attempts++;
  } while (idx2 === idx1 && attempts < 20);

  // Fetch both in parallel
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, 'images'), where('index', '==', idx1), limit(1))),
    getDocs(query(collection(db, 'images'), where('index', '==', idx2), limit(1))),
  ]);

  if (snap1.empty || snap2.empty) return null;

  const img1 = { id: snap1.docs[0].id, ...snap1.docs[0].data() };
  const img2 = { id: snap2.docs[0].id, ...snap2.docs[0].data() };

  // Shouldn't happen, but guard against same doc
  if (img1.id === img2.id) return null;

  // If this pair was recently voted, try a fresh pull (simple check)
  const pairKey = [img1.id, img2.id].sort().join('_');
  if (pairKey === excludePairKey) {
    return getRandomPair(null); // one retry, no infinite loop
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
