import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { seedImage, getStats, resetAllVotes } from '../firebase/firestore';

// ── Simple PIN gate — change this to whatever you want ──
const ADMIN_PIN = 'hotornot';

export default function Seed() {
  const [pinInput,   setPinInput]   = useState('');
  const [pinError,   setPinError]   = useState(false);
  const [unlocked,   setUnlocked]   = useState(false);

  const [url,        setUrl]        = useState('');
  const [preview,    setPreview]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [success,    setSuccess]    = useState(null);
  const [error,      setError]      = useState(null);
  const [stats,      setStats]      = useState(null);

  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting,    setResetting]    = useState(false);

  // ── PIN check ───────────────────────────────────────
  function handlePinSubmit(e) {
    e.preventDefault();
    if (pinInput.trim().toLowerCase() === ADMIN_PIN) {
      setUnlocked(true);
      loadStats();
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 1500);
    }
  }

  async function loadStats() {
    const s = await getStats();
    setStats(s);
  }

  // ── URL input → preview ─────────────────────────────
  function handleUrlChange(e) {
    const val = e.target.value.trim();
    setUrl(val);
    setSuccess(null);
    setError(null);
    if (val.startsWith('http')) {
      setPreview(val);
    } else {
      setPreview(null);
    }
  }

  // ── Submit to Firestore ─────────────────────────────
  async function handleAdd() {
    if (!url || !preview) return;
    setLoading(true);
    setSuccess(null);
    setError(null);

    try {
      const id = await seedImage(url);
      setSuccess(`✅ Added! Document ID: ${id}`);
      setUrl('');
      setPreview(null);
      loadStats();
    } catch (err) {
      setError(`❌ Failed: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── Reset all votes ─────────────────────────────────
  async function handleReset() {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    setResetting(true);
    setSuccess(null);
    setError(null);
    try {
      const count = await resetAllVotes();
      setSuccess(`✅ Reset complete — ${count} images back to 1000 ELO, all votes cleared.`);
      setResetConfirm(false);
      loadStats();
    } catch (err) {
      setError(`❌ Reset failed: ${err.message}`);
    } finally {
      setResetting(false);
    }
  }

  // ── PIN gate ────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="pin-gate">
        <h2>Admin Zone 🔐</h2>
        <p>Enter the admin PIN to continue</p>
        <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <input
            className="pin-input"
            type="password"
            placeholder="••••••••"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            autoFocus
          />
          <motion.button
            type="submit"
            className="seed-btn"
            style={{ width: 200 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Unlock
          </motion.button>
          <AnimatePresence>
            {pinError && (
              <motion.p
                className="pin-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                Wrong PIN
              </motion.p>
            )}
          </AnimatePresence>
        </form>
      </div>
    );
  }

  // ── Seed form ────────────────────────────────────────
  return (
    <div className="seed-page">
      <motion.div
        className="seed-header"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="seed-title">Seed Images</h1>
        <p className="seed-subtitle">admin panel — paste cloudinary URLs below</p>

        {stats && (
          <div className="seed-stats-pill" style={{ marginTop: 14 }}>
            <span>📸 {stats.totalImages} images</span>
            <span>🗳️ {stats.totalVotes} votes</span>
          </div>
        )}
      </motion.div>

      <motion.div
        className="seed-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {/* Preview */}
        <div className="seed-preview">
          {preview ? (
            <img
              src={preview}
              alt="preview"
              onError={() => { setPreview(null); setError('Could not load that URL — double check it.'); }}
            />
          ) : (
            <div className="seed-preview-placeholder">
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}>🖼️</span>
              Paste a Cloudinary URL below<br />
              <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>to preview the image here</span>
            </div>
          )}
        </div>

        {/* URL input */}
        <div>
          <p className="seed-label">Cloudinary Image URL</p>
          <input
            className="seed-input"
            type="url"
            placeholder="https://res.cloudinary.com/..."
            value={url}
            onChange={handleUrlChange}
          />
        </div>

        {/* Feedback */}
        <AnimatePresence>
          {success && (
            <motion.div className="seed-success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {success}
            </motion.div>
          )}
          {error && (
            <motion.div className="seed-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <motion.button
          className="seed-btn"
          onClick={handleAdd}
          disabled={loading || !preview}
          whileHover={!loading && preview ? { scale: 1.01 } : {}}
          whileTap={!loading && preview ? { scale: 0.98 } : {}}
        >
          {loading ? 'Adding…' : 'Add to HOT or NOT'}
        </motion.button>
      </motion.div>

      {/* ── Danger Zone ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        style={{
          marginTop: 32,
          background: 'var(--card)',
          border: '1px solid rgba(255,23,68,0.2)',
          borderRadius: 'var(--radius)',
          padding: 24,
        }}
      >
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: 'var(--accent)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          ⚠️ Danger Zone
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Reset all votes, wins, losses and streaks. Every image goes back to 1000 ELO.
          This cannot be undone.
        </p>

        <AnimatePresence mode="wait">
          {!resetConfirm ? (
            <motion.button
              key="reset-init"
              onClick={handleReset}
              disabled={resetting}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                width: '100%',
                padding: '12px',
                background: 'transparent',
                border: '1px solid rgba(255,23,68,0.4)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              whileHover={{ background: 'rgba(255,23,68,0.08)' }}
            >
              Reset All Votes
            </motion.button>
          ) : (
            <motion.div
              key="reset-confirm"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <p style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text)',
                textAlign: 'center',
                padding: '10px',
                background: 'rgba(255,23,68,0.08)',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid rgba(255,23,68,0.25)',
              }}>
                You sure? This wipes ALL vote data permanently.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setResetConfirm(false)}
                  style={{
                    flex: 1, padding: '11px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  style={{
                    flex: 1, padding: '11px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: '#fff',
                    fontFamily: 'var(--font-display)',
                    fontSize: '1rem',
                    letterSpacing: '0.06em',
                    cursor: resetting ? 'not-allowed' : 'pointer',
                    opacity: resetting ? 0.6 : 1,
                  }}
                >
                  {resetting ? 'Resetting…' : 'Yes, Reset Everything'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <p style={{ marginTop: 20, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        This page is not linked in the nav. Keep the URL private.
      </p>
    </div>
  );
}