import React, { useEffect, useState } from "react";
import { useFolder } from "../context/FolderContext";
import { useAuth } from "../context/AuthContext";
import { ChevronDown, ChevronRight, FilePlus, FilePlus2, FolderPlus } from "lucide-react";

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileItem[];
}

interface Tab {
  name: string;
  path: string;
  content: string;
}

const HomePage: React.FC = () => {
  const { folderPath } = useFolder();
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set()); 
  const { logout } = useAuth();

  const readDirectoryRecursive = async (path: string): Promise<FileItem[]> => {
    const items = await window.electronAPI.readDirectory(path);
    const results: FileItem[] = [];

    for (const item of items) {
      if (item.isDirectory) {
        results.push({
          ...item,
          children: await readDirectoryRecursive(item.path),
        });
      } else {
        results.push(item);
      }
    }
    return results;
  };

  useEffect(() => {
    if (folderPath) {
      readDirectoryRecursive(folderPath).then(setFileTree);
    }
  }, [folderPath]);

  const handleFileClick = async (file: FileItem) => {
    const content = await window.electronAPI.readFile(file.path);
    if (!openTabs.find((tab) => tab.path === file.path)) {
      setOpenTabs((prev) => [...prev, { ...file, content }]);
    }
    setActiveTab(file.path);
  };

  const closeTab = (path: string) => {
    setOpenTabs((prev) => prev.filter((tab) => tab.path !== path));
    if (activeTab === path) {
      const remaining = openTabs.filter((tab) => tab.path !== path);
      setActiveTab(remaining.length > 0 ? remaining[0].path : null);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const FileTree: React.FC<{ items: FileItem[] }> = ({ items }) => (
    <ul className="pl-2">
      {items.map((item) => (
        <li key={item.path}>
          {item.isDirectory ? (
            <>
              <div
                className="flex items-center font-bold cursor-pointer hover:bg-white/20 px-1"
                onClick={() => toggleFolder(item.path)}
              >
                <span className="mr-1">
                  {expandedFolders.has(item.path) ? <ChevronDown/> : <ChevronRight/>}
                </span>
                📁 {item.name}
              </div>
              {expandedFolders.has(item.path) && (
                <FileTree items={item.children || []} />
              )}
            </>
          ) : (
            <div
              className="cursor-pointer hover:bg-white/20 px-1"
              onClick={() => handleFileClick(item)}
            >
              📄 {item.name}
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar */}
      <div className="w-64 overflow-auto border-r border-gray-700 p-2">
        {folderPath ? (
          <>
            {/* Root folder name */}
            <div className="flex items-center justify-between group cursor-pointer" onClick={() => toggleFolder(folderPath)}>
              <div
                className="flex items-center font-medium text-lg cursor-pointer p-1"
                
              >
                <span className="mr-1">
                  {expandedFolders.has(folderPath) ? <ChevronDown/> : <ChevronRight/>}
                </span>
                📂 {folderPath.split(/[/\\]/).pop()}
              </div>
              <div className="hidden group-hover:flex gap-1 mr-2">
                <div title="New File" className="p-1 hover:bg-white/20  cursor-pointer rounded"><FilePlus strokeWidth={1.2} size={19} className="cursor-pointer"/></div>
                <div title="New File" className="p-1 hover:bg-white/20  cursor-pointer rounded"><FolderPlus strokeWidth={1.2} size={19} className="cursor-pointer"/></div>
              </div>
            </div>

            {expandedFolders.has(folderPath) && (
              <FileTree items={fileTree} />
            )}
          </>
        ) : (
          <p>No folder selected</p>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Tabs */}
        <div className="flex max-w-[1180px] overflow-x-scroll border-b border-gray-700 bg-white/20">
          {openTabs.map((tab) => (
            <div
              key={tab.path}
              className={`flex items-center px-3 py-1 border-white/10 border-[1px] cursor-pointer ${
                activeTab === tab.path
                  ? "bg-white/10 text-white"
                  : "bg-white/10 text-white/30"
              }`}
              onClick={() => setActiveTab(tab.path)}
            >
              <p className="">{tab.name}</p>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className="ml-2 cursor-pointer"
              >
                x
              </span>
            </div>
          ))}
        </div>

        {/* Editor Area */}
        <div className="flex-1 p-4 overflow-x-scroll max-w-[1180px] bg-black">
          {activeTab ? (
            <pre className="whitespace-pre-wrap">
              {openTabs.find((tab) => tab.path === activeTab)?.content}
            </pre>
          ) : (
            <p className="text-gray-500">Select a file to view its content</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;