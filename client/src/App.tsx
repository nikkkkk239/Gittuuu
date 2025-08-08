// src/App.tsx
import React, { useEffect, useState } from 'react';
import { auth, provider, signInWithPopup, onAuthStateChanged, signOut } from './lib/firebase';

export default function App() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
  }, []);

  const login = () => signInWithPopup(auth, provider);
  const logout = () => signOut(auth);

  if (!user) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <button onClick={login}>Login with GitHub</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {user.displayName}</h1>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
