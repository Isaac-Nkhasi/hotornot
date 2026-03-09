import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getLeaderboard } from '../firebase/firestore';
import { winRate } from '../utils/eloRating';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Rankings() {
  const [board,   setBoard]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getLeaderboard(50);
        setBoard(data);
      } catch (err) {
        setError('Failed to load rankings.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="rankings-page">
        <div className="state-center">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rankings-page">
        <div className="state-center">
          <h3>Oops</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (board.length === 0) {
    return (
      <div className="rankings-page">
        <div className="state-center">
          <h3>No rankings yet</h3>
          <p>Cast some votes first 🔥</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rankings-page">
      {/* Header */}
      <motion.div
        className="rankings-header"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="rankings-title">
          <span className="trophy">🏆 </span>
          <span className="label">Rankings</span>
        </h1>
        <p className="rankings-meta">sorted by ELO · top {board.length} images</p>
      </motion.div>

      {/* Leaderboard */}
      <div className="leaderboard">
        {board.map((img, i) => {
          const rank   = i + 1;
          const wr     = winRate(img.wins, img.losses);
          const wrNum  = parseInt(wr);

          return (
            <motion.div
              key={img.id}
              className={`lb-card${rank <= 3 ? ` rank-${rank}` : ''}`}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
                delay: Math.min(i * 0.04, 0.6),
              }}
            >
              {/* Rank */}
              <div className="lb-rank">
                {rank <= 3 ? MEDALS[rank - 1] : String(rank).padStart(2, '0')}
              </div>

              {/* Thumbnail */}
              <img
                className="lb-img"
                src={img.imageURL}
                alt={`rank ${rank}`}
                loading="lazy"
              />

              {/* Info */}
              <div className="lb-info">
                <div className="lb-rating">
                  {img.rating} ELO
                  {img.streak >= 3 && (
                    <span className="lb-streak">🔥 {img.streak}</span>
                  )}
                </div>
                <div className="lb-wl">
                  {img.wins}W · {img.losses}L · {img.votes} votes · {wr} win rate
                </div>
                <div className="lb-winbar">
                  <motion.div
                    className="lb-winbar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${wrNum}%` }}
                    transition={{ duration: 0.6, delay: Math.min(i * 0.04, 0.6) + 0.15 }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
