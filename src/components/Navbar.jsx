import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { subscribeToStats } from '../firebase/firestore';

export default function Navbar() {
  const [stats, setStats] = useState({ totalImages: 0, totalVotes: 0 });

  useEffect(() => {
    const unsub = subscribeToStats(setStats);
    return unsub;
  }, []);

  const fmt = (n) =>
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <NavLink to="/" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <span className="hot">HOT</span>
          <span className="or"> or </span>
          <span className="not">NOT</span>
        </NavLink>

        {/* Navigation */}
        <div className="navbar-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Vote
          </NavLink>
          <NavLink
            to="/rankings"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            Rankings
          </NavLink>
        </div>

        {/* Live stats */}
        <div className="navbar-votes">
          <span>total votes</span>
          {fmt(stats.totalVotes)}
        </div>
      </div>
    </nav>
  );
}
