import React, { useEffect, useState } from "react";
import { useFolder } from "../context/FolderContext";
import { useAuth } from "../context/AuthContext";

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
  const { folderPath } = useFolder(); // ✅ Get from context
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const {logout} = useAuth();

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
  const handleClick = async()=>{
    logout();
    await window.electronAPI.signUserOut();
  }


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

  const FileTree: React.FC<{ items: FileItem[] }> = ({ items }) => (
    <ul className="pl-4">
      {items.map((item) => (
        <li key={item.path}>
          {item.isDirectory ? (
            <>
              <div className="font-bold">📁 {item.name}</div>
              <FileTree items={item.children || []} />
            </>
          ) : (
            <div
              className="cursor-pointer hover:bg-gray-700 px-1"
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
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <div onClick={handleClick}>Logout</div>
      <div className="w-64 overflow-auto border-r border-gray-700 p-2">
        {fileTree.length > 0 ? (
          <FileTree items={fileTree} />
        ) : (
          
<div className="w-full bg-gray-200 rounded-full h-1 dark:bg-gray-700">
  <div className="bg-white h-1 rounded-full w-[45%]" ></div>
</div>

        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-800">
          {openTabs.map((tab) => (
            <div
              key={tab.path}
              className={`flex items-center px-3 py-1 cursor-pointer ${
                activeTab === tab.path
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
              onClick={() => setActiveTab(tab.path)}
            >
              <p className="max-w-[100px] overflow-x-scroll">{tab.name}</p>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.path);
                }}
                className="ml-2 text-red-400 hover:text-red-600"
              >
                ❌
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
