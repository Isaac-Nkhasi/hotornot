import { motion } from 'framer-motion';

/**
 * Props:
 *  image       — Firestore image object { id, imageURL, rating, wins, losses, streak }
 *  side        — 'left' | 'right'  (controls entrance direction)
 *  onVote      — () => void
 *  canVote     — bool  (false while animating)
 *  isWinner    — bool
 *  isLoser     — bool
 */
export default function ImageCard({ image, side, onVote, canVote, isWinner, isLoser }) {
  const fromX = side === 'left' ? -80 : 80;

  // Drive the card animation based on vote state
  const cardAnimate =
    isWinner ? { scale: 1.04, opacity: 1, x: 0 }
    : isLoser  ? { scale: 0.96, opacity: 0.45, x: 0 }
    : { scale: 1, opacity: 1, x: 0 };

  const cardExit =
    isWinner ? { scale: 1.08, y: -30, opacity: 0 }
    : isLoser  ? { scale: 0.88, y: 20,  opacity: 0 }
    : { opacity: 0 };

  return (
    <div className="image-card-wrap">
      <motion.div
        className="image-card"
        initial={{ x: fromX, opacity: 0, scale: 0.97 }}
        animate={cardAnimate}
        exit={cardExit}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => canVote && onVote(image)}
        style={{ cursor: canVote ? 'pointer' : 'default' }}
        whileHover={canVote ? { y: -6, transition: { duration: 0.2 } } : {}}
      >
        {/* Image */}
        <img
          src={image.imageURL}
          alt="vote candidate"
          loading="lazy"
          draggable={false}
        />

        {/* Streak badge */}
        {image.streak >= 3 && (
          <motion.div
            className="streak-badge"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
          >
            🔥 {image.streak} streak
          </motion.div>
        )}

        {/* Stats bar */}
        <div className="card-stats">
          <span className="card-elo">{image.rating} ELO</span>
          <span className="card-wl">
            {image.wins}W &nbsp;/&nbsp; {image.losses}L
          </span>
        </div>

        {/* Vote result overlay */}
        {isWinner && (
          <motion.div
            className="vote-overlay winner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <span className="vote-icon">✓</span>
          </motion.div>
        )}
        {isLoser && (
          <motion.div
            className="vote-overlay loser"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <span className="vote-icon">✕</span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
