// LandingPage.tsx
import React, { useState } from "react";
import { FolderOpen, File, GitBranch } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface popss{
    onOpenFolder:()=>void;
    onOpenFile:()=>void;
    onCloneRepo:(repoUrl : string)=>void;

}

export default function LandingPage({ onOpenFolder , onOpenFile, onCloneRepo } : popss) {
  const [repoUrl, setRepoUrl] = useState("");
  const {user} = useAuth();
  const [showCloneInput, setShowCloneInput] = useState(false);

  return (
    <div className="bg-black text-white h-screen flex flex-col items-center ">
        <div className="mt-10 w-full px-20 py-5">
            <h1 className="text-4xl font-extrabold museoModerno">DevDock</h1>
            <p>Hi, {user?.displayName} !</p>
        </div>
      <div className="max-w-md w-full text-center mt-[10%] space-y-8">
        <h1 className="text-3xl font-bold">Welcome to Your IDE</h1>
        <p className="text-gray-400">Select a folder, file, or clone a repository to get started</p>

        <div className="space-y-4">
          <button
            onClick={onOpenFolder}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
          >
            <FolderOpen size={20} /> Open Folder
          </button>

          <button
            onClick={onOpenFile}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
          >
            <File size={20} /> Open File
          </button>

          <button
            onClick={() => setShowCloneInput(!showCloneInput)}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
          >
            <GitBranch size={20} /> Clone Git Repository
          </button>
        </div>

        {showCloneInput && (
          <div className="mt-4 space-y-2">
            <input
              type="text"
              placeholder="Enter repository URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-900 text-white border border-gray-700 focus:outline-none"
            />
            <button
              onClick={() => onCloneRepo(repoUrl)}
              className="w-full px-4 py-2 bg-white text-black rounded hover:bg-gray-300 transition"
            >
              Clone
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
