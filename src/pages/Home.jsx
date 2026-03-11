import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ImageCard from '../components/ImageCard';
import { getRandomPair, updateStreaks } from '../firebase/firestore';
import { calculateNewRatings } from '../utils/eloRating';
import { enqueueVote, forceFlush } from '../utils/voteQueue';
import { pairKey, hasVotedPair, markPairVoted } from '../utils/sessionVotes';

// How long (ms) the win/loss animation plays before next pair appears
const VOTE_ANIM_MS = 900;
// How long the crowd-reaction toast stays visible
const REACTION_MS  = 2200;

// Preload images so the browser caches them
function preload(pair) {
  if (!pair) return;
  pair.forEach((img) => {
    const el = new Image();
    el.src = img.imageURL;
  });
}

export default function Home() {
  const [displayPair, setDisplayPair]     = useState(null);
  const [nextPair,    setNextPair]        = useState(null);
  const [pairKey_val, setPairKeyVal]      = useState(0);   // AnimatePresence key
  const [voteState,   setVoteState]       = useState('idle'); // 'idle' | 'voted'
  const [voteResult,  setVoteResult]      = useState(null);   // { winnerId, loserId }
  const [reaction,    setReaction]        = useState(null);   // { text, winRate }
  const [loading,     setLoading]         = useState(true);
  const [error,       setError]           = useState(null);
  const [shareCopied, setShareCopied]     = useState(false); // clipboard feedback
  const [showShareMenu, setShowShareMenu] = useState(false);

  const reactionTimer = useRef(null);

  // ── Fetch a pair and optionally cache it as "next" ────
  const fetchPair = useCallback(async (asNext = false) => {
    try {
      const pair = await getRandomPair();
      if (asNext) {
        setNextPair(pair);
        preload(pair);
      } else {
        setDisplayPair(pair);
        preload(pair);
      }
    } catch (err) {
      if (!asNext) setError('Could not load images. Check your connection.');
      console.error(err);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchPair(false);
      setLoading(false);
      fetchPair(true); // prefetch next pair in background
    })();
  }, [fetchPair]);

  // ── Flush votes on unmount ────────────────────────────
  useEffect(() => () => { forceFlush(); }, []);

  // ── Share handlers ────────────────────────────────────
  const shareTimer = useRef(null);

  async function shareSite() {
    const data = {
      title: 'HOT or NOT 🔥',
      text:  'Rate pics and see who tops the leaderboard — come vote!',
      url:   window.location.origin,
    };
    if (navigator.share) {
      try { await navigator.share(data); } catch (_) {}
    } else {
      await copyToClipboard(window.location.origin);
    }
    setShowShareMenu(false);
  }

  async function sharePair() {
    const text = `🔥 HOT or NOT — who wins this matchup? Come vote: ${window.location.origin}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'HOT or NOT', text, url: window.location.origin }); } catch (_) {}
    } else {
      await copyToClipboard(text);
    }
    setShowShareMenu(false);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareCopied(false), 2000);
    } catch (_) {}
  }

  // ── Handle a vote ─────────────────────────────────────
  const handleVote = useCallback(async (chosenImage) => {
    if (voteState !== 'idle' || !displayPair) return;

    const other = displayPair.find((img) => img.id !== chosenImage.id);
    if (!other) return;

    // ── Spam guard ────────────────────────────────────
    const key = pairKey(chosenImage.id, other.id);
    if (hasVotedPair(key)) {
      // Skip to next pair silently
      advanceToNext();
      return;
    }
    markPairVoted(key);

    // ── ELO calculation ───────────────────────────────
    const { newWinnerRating, newLoserRating, winnerDelta, loserDelta } =
      calculateNewRatings(chosenImage.rating, other.rating);

    // ── Optimistic local update (so card stats look right immediately) ──
    chosenImage.rating = newWinnerRating;
    other.rating       = newLoserRating;

    // ── Animate ───────────────────────────────────────
    setVoteState('voted');
    setVoteResult({ winnerId: chosenImage.id, loserId: other.id });

    // ── Queue vote (batch flush) ──────────────────────
    enqueueVote({
      winnerId:    chosenImage.id,
      loserId:     other.id,
      ratingChange: { winner: winnerDelta, loser: loserDelta },
    });

    // ── Streak update (immediate, separate write) ─────
    updateStreaks(chosenImage.id, other.id).catch(console.error);

    // ── Crowd-consensus reaction toast ───────────────
    const totalVotes = chosenImage.wins + chosenImage.losses + 1;
    const newWins    = chosenImage.wins + 1;
    const wr         = Math.round((newWins / totalVotes) * 100);
    const agreed     = wr >= 50;
    setReaction({
      text:    agreed
        ? `🔥 ${wr}% of voters agree with you!`
        : `👀 Controversial pick — only ${wr}% chose this one`,
      winRate: wr,
    });
    clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => setReaction(null), REACTION_MS);

    // ── Advance to next pair after animation ──────────
    setTimeout(() => advanceToNext(), VOTE_ANIM_MS);
  }, [voteState, displayPair]); // eslint-disable-line

  function advanceToNext() {
    setVoteState('idle');
    setVoteResult(null);

    if (nextPair) {
      setDisplayPair(nextPair);
      setNextPair(null);
      setPairKeyVal((k) => k + 1);
      // Prefetch the one after
      fetchPair(true);
    } else {
      // Prefetch wasn't ready — fetch now
      setDisplayPair(null);
      fetchPair(false).then(() => fetchPair(true));
    }
  }

  // ── Skip pair ─────────────────────────────────────────
  const handleSkip = useCallback(() => {
    if (voteState !== 'idle') return;
    advanceToNext();
  }, [voteState, nextPair]); // eslint-disable-line

  // ── Render ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="home-page">
        <div className="state-center">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            loading the heat…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-page">
        <div className="state-center">
          <h3>Something's off</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!displayPair) {
    return (
      <div className="home-page">
        <div className="state-center">
          <h3>No images yet</h3>
          <p>The admin is loading up the fire 🔥</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Header */}
      <motion.div
        className="home-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="home-title">
          <span className="hot">HOT</span>
          <span className="or"> or </span>
          <span className="not">NOT</span>
        </h1>
        <p className="home-subtitle">click to cast your vote</p>
      </motion.div>

      {/* Vote Arena */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pairKey_val}
          className="vote-arena"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Left image */}
          <ImageCard
            image={displayPair[0]}
            side="left"
            onVote={handleVote}
            canVote={voteState === 'idle'}
            isWinner={voteResult?.winnerId === displayPair[0].id}
            isLoser={voteResult?.loserId   === displayPair[0].id}
          />

          {/* VS */}
          <div className="vs-wrap">
            <div className="vs-ring" />
            <div className="vs-ring" />
            <div className="vs-ring" />
            <span className="vs-text">VS</span>
          </div>

          {/* Right image */}
          <ImageCard
            image={displayPair[1]}
            side="right"
            onVote={handleVote}
            canVote={voteState === 'idle'}
            isWinner={voteResult?.winnerId === displayPair[1].id}
            isLoser={voteResult?.loserId   === displayPair[1].id}
          />
        </motion.div>
      </AnimatePresence>

      {/* Skip */}
      <motion.button
        className="skip-btn"
        onClick={handleSkip}
        initial={{ opacity: 0 }}
        animate={{ opacity: voteState === 'idle' ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        disabled={voteState !== 'idle'}
      >
        skip this pair →
      </motion.button>

      {/* Share button + menu */}
      <div style={{ position: 'relative', marginTop: 12 }}>
        <motion.button
          className="skip-btn"
          onClick={() => setShowShareMenu((v) => !v)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {shareCopied ? '✅ copied!' : '↗ share'}
        </motion.button>

        <AnimatePresence>
          {showShareMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 10px)',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--card)',
                border: '1px solid var(--border-hover)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minWidth: 200,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                zIndex: 50,
              }}
            >
              <button onClick={sharePair} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 16px', borderRadius: 'var(--radius-xs)',
                color: 'var(--text)', fontFamily: 'var(--font-body)',
                fontSize: '0.85rem', fontWeight: 500, textAlign: 'left',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.target.style.background = 'none'}
              >
                🔥 Share this matchup
              </button>
              <button onClick={shareSite} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 16px', borderRadius: 'var(--radius-xs)',
                color: 'var(--text)', fontFamily: 'var(--font-body)',
                fontSize: '0.85rem', fontWeight: 500, textAlign: 'left',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.target.style.background = 'none'}
              >
                🌐 Share the site
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Crowd consensus reaction toast */}
      <AnimatePresence>
        {reaction && (
          <motion.div
            className="vote-reaction"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="reaction-line1">{reaction.text}</p>
            <p className="reaction-line2">based on all-time matchup history</p>
            <div className="reaction-bar">
              <div className="reaction-bar-fill" style={{ width: `${reaction.winRate}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}