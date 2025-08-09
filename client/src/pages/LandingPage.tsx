// LandingPage.tsx
import React, { useState } from "react";
import { FolderOpen, File, GitBranch } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { LogOut } from "lucide-react";

interface popss{
    onOpenFolder:()=>void;
    onOpenFile:()=>void;
    onCloneRepo:(repoUrl : string)=>void;

}

export default function LandingPage({ onOpenFolder , onOpenFile, onCloneRepo } : popss) {
  const [repoUrl, setRepoUrl] = useState("");
  const {user , logout} = useAuth();
  const [showCloneInput, setShowCloneInput] = useState(false);

  const handleClick = async()=>{
    logout();
    await window.electronAPI.signUserOut();
  }

  return (
    <div className="bg-black text-white h-screen flex jus flex-col items-center ">
        <div className="mt-10 w-full md:px-20 flex justify-between items-center px-10 py-5">
            <div>
                <h1 className="text-4xl font-extrabold museoModerno">DevDock</h1>
                <p>Hi, {user?.displayName} !</p>
            </div>
            <div className="cursor-pointer hover:bg-white/20 bg-black p-2 md:p-4 rounded-full transition-all duration-200 flex items-center justify-center" title="logout" onClick={handleClick}><LogOut /></div>
            
        </div>
        <div className="w-full flex items-center justify-center h-full max-h-[70vh]">
      <div className="max-w-md w-full text-center   space-y-8">
        <h1 className="text-3xl font-bold">Welcome to Your IDE</h1>
        <p className="text-gray-400">Select a folder, file, or clone a repository to get started</p>

        <div className="space-y-4">
          <button
            onClick={onOpenFolder}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition cursor-pointer"
          >
            <FolderOpen size={20} /> Open Folder
          </button>

          <button
            onClick={onOpenFile}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition cursor-pointer"
          >
            <File size={20} /> Open File
          </button>

          <button
            onClick={() => setShowCloneInput(!showCloneInput)}
            className="flex items-center gap-3 w-full px-4 py-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition cursor-pointer"
          >

            <GitBranch size={20} /> Clone Git Repository
          </button>
        </div>

          <div className={`mt-4 space-y-4  ${showCloneInput ? "translate-x-0" : "-translate-x-300"} transition-all duration-500`}>
            <input
              type="text"
              placeholder="Enter repository URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full px-3 py-2 rounded bg-gray-900 text-white border border-gray-700 focus:outline-none"
            />
            <button
              onClick={() => onCloneRepo(repoUrl)}
              className="w-full px-4 py-2 cursor-pointer bg-white text-black rounded hover:bg-gray-300 transition"
            >
              Clone
            </button>
          </div>
      </div>
      </div>
    </div>
  );
}
