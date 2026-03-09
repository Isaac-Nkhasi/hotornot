import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase/firebaseConfig';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Rankings from './pages/Rankings';
import Seed from './pages/Seed';

export default function App() {
  // Sign in anonymously so Firestore write rules pass
  useEffect(() => {
    signInAnonymously(auth).catch((err) =>
      console.error('Anonymous auth failed:', err)
    );
  }, []);

  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"         element={<Home />} />
        <Route path="/rankings" element={<Rankings />} />
        <Route path="/seed"     element={<Seed />} />
      </Routes>
    </BrowserRouter>
  );
}
