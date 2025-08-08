// src/App.tsx
import React from 'react';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';

export default function App() {
  const { user, logout ,loading} = useAuth();

  if(loading) return <div>Loading....</div>

  if (!user) return <Login />;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-4">Welcome, {user.displayName}</h1>
      <button
        onClick={logout}
        className="bg-red-500 cursor-pointer text-white px-4 py-2 rounded hover:bg-red-600"
      >
        Logout
      </button>
    </div>
  );
}
