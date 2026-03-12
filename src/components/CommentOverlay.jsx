import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPairComments, addPairComment, addPairReaction } from '../firebase/firestore';

const COOLDOWN_MS  = 30_000;
const MAX_WORDS    = 10;
const REACTIONS    = ['🔥', '💀', '😭', '👀', '🤣'];
const COOLDOWN_KEY = 'hon_comment_cooldown';

// ── Cooldown helpers ──────────────────────────────────────
function getCooldownMap() {
  try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}'); }
  catch { return {}; }
}
function setCooldownMap(map) {
  try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map)); } catch {}
}
function getCooldownRemaining(pk) {
  const map  = getCooldownMap();
  const last = map[pk] || 0;
  const diff = Date.now() - last;
  return diff < COOLDOWN_MS ? Math.ceil((COOLDOWN_MS - diff) / 1000) : 0;
}
function stampCooldown(pk) {
  const map = getCooldownMap();
  map[pk] = Date.now();
  setCooldownMap(map);
}

function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

export default function CommentOverlay({ pairKey, uid, visible }) {
  const [comments,    setComments]    = useState([]);       // bubbles to show
  const [pairVotes,   setPairVotes]   = useState(0);
  const [totalRx,     setTotalRx]     = useState(0);
  const [shownBubbles,setShownBubbles]= useState([]);
  const [commentText, setCommentText] = useState('');
  const [cooldown,    setCooldown]    = useState(0);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitMsg,   setSubmitMsg]   = useState(null);
  const [reactionSent,setReactionSent]= useState(null);

  const cooldownTimer = useRef(null);
  const bubbleTimers  = useRef([]);

  // ── Load on pair change ───────────────────────────────
  useEffect(() => {
    if (!pairKey || !visible) return;

    // Reset state for new pair
    setComments([]);
    setShownBubbles([]);
    setReactionSent(null);
    setCommentText('');
    setSubmitMsg(null);
    bubbleTimers.current.forEach(clearTimeout);
    bubbleTimers.current = [];

    // Check cooldown
    setCooldown(getCooldownRemaining(pairKey));

    // Fetch data — show bubbles only if pairVotes > 5
    getPairComments(pairKey).then((result) => {
      if (!result) return; // pairVotes <= 5, no bubbles yet
      setPairVotes(result.pairVotes || 0);
      setTotalRx(result.totalReactions || 0);

      const recent = (result.comments || []).slice(-4);
      setComments(recent);

      // Stagger bubbles in
      recent.forEach((c, i) => {
        const t = setTimeout(() => {
          setShownBubbles((prev) =>
            prev.find((p) => p.createdAt === c.createdAt) ? prev : [...prev, c]
          );
        }, i * 260 + 200);
        bubbleTimers.current.push(t);
      });
    });

    return () => {
      bubbleTimers.current.forEach(clearTimeout);
      clearInterval(cooldownTimer.current);
    };
  }, [pairKey, visible]);

  // ── Countdown tick ────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownTimer.current); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(cooldownTimer.current);
  }, [cooldown]);

  // ── Submit comment ────────────────────────────────────
  async function handleSubmit() {
    const trimmed = commentText.trim();
    if (!trimmed || submitting || cooldown > 0 || wordCount(trimmed) > MAX_WORDS) return;

    setSubmitting(true);
    try {
      await addPairComment(pairKey, trimmed, uid);
      const newComment = { text: trimmed, uid, createdAt: Date.now() };
      setShownBubbles((prev) => [...prev, newComment]);
      setCommentText('');
      stampCooldown(pairKey);
      setCooldown(Math.ceil(COOLDOWN_MS / 1000));
      setSubmitMsg('dropped 🔥');
      setTimeout(() => setSubmitMsg(null), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Reaction tap ──────────────────────────────────────
  async function handleReaction(emoji) {
    if (reactionSent) return;
    setReactionSent(emoji);
    setTotalRx((n) => n + 1);
    addPairReaction(pairKey, emoji, uid).catch(console.error);
  }

  if (!visible || !pairKey) return null;

  const wc      = wordCount(commentText);
  const tooLong = wc > MAX_WORDS;

  return (
    <motion.div
      className="comment-overlay-wrap"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── Floating comment bubbles (only when pairVotes > 5) ── */}
      {shownBubbles.length > 0 && (
        <div className="comment-bubbles">
          <AnimatePresence>
            {shownBubbles.map((c) => (
              <motion.div
                key={c.createdAt}
                className="comment-bubble"
                initial={{ opacity: 0, x: -20, scale: 0.92 }}
                animate={{ opacity: 1, x: 0,   scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                💬 {c.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Reaction bar — ALWAYS visible after vote ── */}
      <div className="reaction-row">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            className={`reaction-btn${reactionSent === emoji ? ' sent' : ''}${reactionSent && reactionSent !== emoji ? ' dimmed' : ''}`}
            onClick={() => handleReaction(emoji)}
          >
            {emoji}
          </button>
        ))}
        {totalRx > 0 && (
          <span className="reaction-count">🔥 {totalRx}</span>
        )}
      </div>

      {/* ── Comment input — ALWAYS visible after vote ── */}
      <div className="comment-input-row">
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="comment-input"
            placeholder={
              cooldown > 0
                ? `cooldown ${cooldown}s…`
                : 'say something (max 10 words)…'
            }
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            disabled={cooldown > 0 || submitting}
            maxLength={120}
          />
          {commentText && (
            <span className={`word-count-badge${tooLong ? ' over' : ''}`}>
              {wc}/{MAX_WORDS}
            </span>
          )}
        </div>
        <button
          className="comment-send-btn"
          onClick={handleSubmit}
          disabled={!commentText.trim() || tooLong || cooldown > 0 || submitting}
        >
          {submitMsg || (cooldown > 0 ? `${cooldown}s` : '↑')}
        </button>
      </div>
    </motion.div>
  );
}


// ── Cooldown helpers (per pair, per user session) ─────────
function getCooldownMap() {
  try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}'); }
  catch { return {}; }
}
function setCooldownMap(map) {
  try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map)); } catch {}
}
function getCooldownRemaining(pairKey) {
  const map  = getCooldownMap();
  const last = map[pairKey] || 0;
  const diff = Date.now() - last;
  return diff < COOLDOWN_MS ? Math.ceil((COOLDOWN_MS - diff) / 1000) : 0;
}
function stampCooldown(pairKey) {
  const map = getCooldownMap();
  map[pairKey] = Date.now();
  setCooldownMap(map);
}

// ── Word counter ──────────────────────────────────────────
function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

export default function CommentOverlay({ pairKey, uid, visible }) {
  const [data,        setData]        = useState(null);   // { pairVotes, totalReactions, comments, reactions }
  const [shown,       setShown]       = useState([]);     // comments currently displayed as bubbles
  const [commentText, setCommentText] = useState('');
  const [cooldown,    setCooldown]    = useState(0);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitMsg,   setSubmitMsg]   = useState(null);
  const [reactionSent,setReactionSent]= useState(null);

  const cooldownTimer = useRef(null);
  const bubbleTimer   = useRef(null);

  // ── Load comments when pair changes ───────────────────
  useEffect(() => {
    if (!pairKey || !visible) return;
    setData(null);
    setShown([]);

    getPairComments(pairKey).then((result) => {
      if (!result) return;
      setData(result);

      // Stagger showing the last 4 comments as floating bubbles
      const recent = result.comments.slice(-4);
      recent.forEach((c, i) => {
        bubbleTimer.current = setTimeout(() => {
          setShown((prev) => {
            const already = prev.find((p) => p.createdAt === c.createdAt);
            return already ? prev : [...prev, c];
          });
        }, i * 280 + 300); // 300ms initial delay, 280ms stagger
      });
    });

    // Check cooldown for this pair
    const remaining = getCooldownRemaining(pairKey);
    setCooldown(remaining);

    return () => {
      clearTimeout(bubbleTimer.current);
      clearInterval(cooldownTimer.current);
    };
  }, [pairKey, visible]);

  // ── Countdown tick ────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownTimer.current); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(cooldownTimer.current);
  }, [cooldown]);

  // ── Submit comment ────────────────────────────────────
  async function handleSubmit() {
    const trimmed = commentText.trim();
    if (!trimmed || submitting || cooldown > 0) return;
    if (wordCount(trimmed) > MAX_WORDS) return;

    setSubmitting(true);
    try {
      await addPairComment(pairKey, trimmed, uid);
      const newComment = { text: trimmed, uid, createdAt: Date.now() };
      setShown((prev) => [...prev, newComment]);
      setData((d) => d ? { ...d, comments: [...(d.comments || []), newComment] } : d);
      setCommentText('');
      stampCooldown(pairKey);
      setCooldown(Math.ceil(COOLDOWN_MS / 1000));
      setSubmitMsg('dropped 🔥');
      setTimeout(() => setSubmitMsg(null), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Submit reaction ───────────────────────────────────
  async function handleReaction(emoji) {
    if (reactionSent) return;
    setReactionSent(emoji);
    try {
      await addPairReaction(pairKey, emoji, uid);
      setData((d) => d ? { ...d, totalReactions: (d.totalReactions || 0) + 1 } : d);
    } catch (err) { console.error(err); }
  }

  if (!visible || !data) return null;

  const wc    = wordCount(commentText);
  const tooLong = wc > MAX_WORDS;

  return (
    <div className="comment-overlay-wrap">
      {/* ── Floating comment bubbles ── */}
      <div className="comment-bubbles">
        <AnimatePresence>
          {shown.map((c, i) => (
            <motion.div
              key={c.createdAt}
              className="comment-bubble"
              initial={{ opacity: 0, x: -24, scale: 0.9 }}
              animate={{ opacity: 1, x: 0,   scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              💬 {c.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Reaction bar ── */}
      <motion.div
        className="reaction-row"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            className={`reaction-btn${reactionSent === emoji ? ' sent' : ''}${reactionSent && reactionSent !== emoji ? ' dimmed' : ''}`}
            onClick={() => handleReaction(emoji)}
          >
            {emoji}
          </button>
        ))}
        {data.totalReactions > 0 && (
          <span className="reaction-count">
            🔥 {data.totalReactions} reaction{data.totalReactions !== 1 ? 's' : ''}
          </span>
        )}
      </motion.div>

      {/* ── Comment input ── */}
      <motion.div
        className="comment-input-row"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="comment-input"
            placeholder={cooldown > 0 ? `cooldown ${cooldown}s…` : 'say something (max 10 words)…'}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            disabled={cooldown > 0 || submitting}
            maxLength={120}
          />
          {commentText && (
            <span className={`word-count-badge${tooLong ? ' over' : ''}`}>
              {wc}/{MAX_WORDS}
            </span>
          )}
        </div>
        <button
          className="comment-send-btn"
          onClick={handleSubmit}
          disabled={!commentText.trim() || tooLong || cooldown > 0 || submitting}
        >
          {submitMsg || (cooldown > 0 ? `${cooldown}s` : '↑')}
        </button>
      </motion.div>
    </div>
  );
}