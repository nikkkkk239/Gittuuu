import React, { createContext, useContext, useEffect, useState } from 'react';
import { upsertUserProfile } from '../lib/deploymentHistory';
import {
  auth,
  provider,
} from '../lib/firebase';
import {
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  GithubAuthProvider,
  User,
} from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  githubAccessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loading : boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [githubAccessToken, setGithubAccessToken] = useState<string | null>(null);
  const [loading , setLoading] = useState(true);

  useEffect(() => {
    const savedGitHubToken = localStorage.getItem("githubAccessToken");
    if (savedGitHubToken) {
      setGithubAccessToken(savedGitHubToken);
    }

    onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false)

      if (user) {
        upsertUserProfile(user).catch((error) => {
          console.error("Failed to upsert user profile in Firestore:", error);
        });
      }

    });
  }, []);

  const login = async () => {
    await setPersistence(auth, browserLocalPersistence);
    const result = await signInWithPopup(auth, provider);
    const credential = GithubAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || null;

    setGithubAccessToken(accessToken);
    if (accessToken) {
      localStorage.setItem("githubAccessToken", accessToken);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setGithubAccessToken(null);
    localStorage.removeItem("githubAccessToken");
  };

  return (
    <AuthContext.Provider value={{ user, githubAccessToken, login, logout ,loading}}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
