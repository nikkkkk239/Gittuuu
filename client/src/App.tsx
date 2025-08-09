// src/App.tsx
import React from "react";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";

export default function App() {
  const { user, logout, loading } = useAuth();

  if (loading) return <div>Loading....</div>;

  if (!user) return <Login />;

  // Handlers for LandingPage actions
  const handleOpenFolder = async() => {
     const folder = await window.electronAPI.openFolder();
    console.log("Renderer got folder:", folder);
  };

  const handleOpenFile = async () => {
    const folder = await window.electronAPI.openFile();
    console.log("Renderer got folder:", folder);
  };

  const handleCloneRepo = async (repoUrl: string) => {
    const folder = await window.electronAPI.cloneRepo(repoUrl);
    console.log("Renderer got folder:", folder);
  };

  return (
    <LandingPage
      onOpenFolder={handleOpenFolder}
      onOpenFile={handleOpenFile}
      onCloneRepo={handleCloneRepo}
    />
  );
}
