import Editor from "@monaco-editor/react";
import React, { useEffect, useState } from "react";
import { useFolder } from "../context/FolderContext";
import { useAuth } from "../context/AuthContext";
import path from "path";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FilePlus,
  FolderPlus,
  LogOut,
  LogOutIcon,
  Settings,
} from "lucide-react";

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
  const { folderPath, filePath, setFolderPath, setFilePath } = useFolder();
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [openingFile, setOpeningFile] = useState<boolean>(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(folderPath);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [unsaved, setUnsaved] = useState<Record<string, boolean>>({});
  const [autoSave, setAutoSave] = useState<boolean>(true); // default ON


  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const { logout } = useAuth();
  const [isSideBarOpen , setIsSideBarOpen] = useState(true);

  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [isFolder, setIsFolder] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "file" | "folder";
    item: any | null;
  } | null>(null);

  const handleRightClick = (e: React.MouseEvent, item: any) => {
     console.log("Deleting item:", item); 

    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: item.isDirectory ? "folder" : "file",
      item,
    });
  };

  const closeContextMenu = () => setContextMenu(null);

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

  // Load folder tree OR single file
  useEffect(() => {
    setActiveTab(null);
    setOpenTabs([]);
    if (folderPath) {
      readDirectoryRecursive(folderPath).then(setFileTree);
    } else if (filePath) {
      // directly open the single file as a tab
      (async () => {
        const content = await window.electronAPI.readFile(filePath);
        setOpenTabs([
          {
            name: filePath.split(/[/\\]/).pop() || "Untitled",
            path: filePath,
            content,
          },
        ]);
        setActiveTab(filePath);
      })();
    }
  }, [folderPath, filePath]);

  useEffect(() => {
    if (!activeTab || !unsaved[activeTab] || !autoSave) return;

    const timer = setTimeout(() => {
      handleSaveFile(activeTab);
    }, 2000); // 2s debounce

    return () => clearTimeout(timer);
  }, [openTabs, activeTab, unsaved, autoSave]);


  const handleFileClick = async (file: FileItem) => {
    setOpeningFile(true);
    const content = await window.electronAPI.readFile(file.path);
    if (!openTabs.find((tab) => tab.path === file.path)) {
      setOpenTabs((prev) => [...prev, { ...file, content }]);
    }
    setActiveTab(file.path);
    setOpeningFile(false);
  };

  const closeTab = (path: string) => {
    setOpenTabs((prev) => prev.filter((tab) => tab.path !== path));
    if (activeTab === path) {
      const remaining = openTabs.filter((tab) => tab.path !== path);
      setActiveTab(remaining.length > 0 ? remaining[0].path : null);
    }
  };

  const handleLogout = async () => {
    logout();
    await window.electronAPI.signUserOut();
    localStorage.clear();
    setFolderPath(null);
    setFilePath(null);
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

  

   const handleAddFile = (basePath?: string) => {
    const target = basePath || activeFolder;
    if (!target) return;
    setIsFolder(false);
    setNewName("");
    setActiveFolder(target); // ensure input attaches to right folder
    setShowInput(true);
  };

  const handleAddFolder = (basePath?: string) => {
    const target = basePath || activeFolder;
    if (!target) return;
    setIsFolder(true);
    setNewName("");
    setActiveFolder(target);
    setShowInput(true);
  };


  // When user presses Enter in the input field
  const handleCreate = async () => {
    if (!newName.trim() || !activeFolder) {
      setShowInput(false);
      return;
    }

    try {
      if (isFolder) {
        await window.electronAPI.addFolder(`${activeFolder}/${newName}`);
      } else {
        await window.electronAPI.addFile(`${activeFolder}/${newName}`, "");
      }
      const updatedTree = await readDirectoryRecursive(folderPath!);
      setFileTree(updatedTree);
    } catch (error) {
      console.error("Error creating item:", error);
    }

    setShowInput(false);
    setNewName("");
  };

  const handleSaveFile = async (filePath: string) => {
    const file = openTabs.find((tab) => tab.path === filePath);
    if (!file) return;

    try {
      await window.electronAPI.writeFile(filePath, file.content);
      setUnsaved((prev) => {
        const updated = { ...prev };
        delete updated[filePath];
        return updated;
      });
      console.log(`File saved: ${filePath}`);
    } catch (err) {
      console.error("Error saving file:", err);
    }
  };


  const detectLanguage = (filePath: string) => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "json":
      return "json";
    case "md":
      return "markdown";
    case "html":
      return "html";
    case "css":
      return "css";
    case "py":
      return "python";
    case "java":
      return "java";
    case "cpp":
    case "cc":
    case "c":
      return "cpp";
    default:
      return "plaintext";
  }
};


  const handleRenameConfirm = async () => {
  if (!renamingPath || !renameValue.trim()) {
    setRenamingPath(null);
    setRenameValue("");
    return;
  }

  const pathParts = renamingPath.split(/[/\\]/);
pathParts.pop();
const newPath = [...pathParts, renameValue.trim()].join("/");


  try {
    await window.electronAPI.renameItem(renamingPath, newPath);
    const updatedTree = await readDirectoryRecursive(folderPath!);
    setFileTree(updatedTree);
  } catch (err) {
    console.error("Rename failed:", err);
  }

  setRenamingPath(null);
  setRenameValue("");
};


const handleRunFile = async (filePath: string | null) => {
  // Run button kept but functionality removed
  console.log("Run button clicked for:", filePath);
};




  
  const handleDelete = async (item: any) => {
    await window.electronAPI.deleteItem(item.path);

    const updatedTree = await readDirectoryRecursive(folderPath!);
    setFileTree(updatedTree);
  };

  const FileTree: React.FC<{ items: FileItem[] }> = ({ items }) => {
    useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);
    
  return <ul className="pl-2 overflow-y-scroll max-h-[87vh]">
    {items.map((item) => (
      <li key={item.path} >
        {item.isDirectory ? (
          <>
            <div
              className={`flex items-center justify-between group font-bold cursor-pointer ${activeFolder == item.path && "bg-white/45"} hover:bg-white/20 px-1`}
              onContextMenu={(e) => handleRightClick(e, item)}
              onClick={() => {
                toggleFolder(item.path);
                setActiveFolder(item.path); // mark this as current target
              }}
            >
              <div className="flex items-center">
                <span className="mr-1">
                  {expandedFolders.has(item.path) ? <ChevronDown /> : <ChevronRight />}
                </span>
                {renamingPath === item.path ? (
                  <input
                    type="text"
                    value={renameValue}
                    autoFocus
                    className="bg-gray-800 text-white px-2 py-1 rounded"
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRenameConfirm}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameConfirm();
                      if (e.key === "Escape") {
                        setRenamingPath(null);
                        setRenameValue("");
                      }
                    }}
                  />
                ) : (
                  <span>📁 {item.name}</span>
                )}
              </div>
            </div>
            {showInput && activeFolder == item.path && (
              <div className="p-1">
                <input
                  type="text"
                  value={newName}
                  onBlur={()=>{
                    setShowInput(false);
                  }}
                  onChange={(e) => setNewName(e.target.value)}
                 onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") setShowInput(false);
                  }}
                  placeholder={isFolder ? "New Folder Name" : "New File Name"}
                  className="w-full bg-gray-800 text-white px-2 py-1 rounded"
                  autoFocus
                />
              </div>
            )}

            {expandedFolders.has(item.path) && (
              <FileTree items={item.children || []} />
            )}
          </>
        ) : (
          <div
            className="cursor-pointer hover:bg-white/20 px-1"
            onClick={() => handleFileClick(item)}
            onContextMenu={(e) => handleRightClick(e, item)}
          >
            {renamingPath === item.path ? (
              <input
                type="text"
                value={renameValue}
                autoFocus
                className="bg-gray-800 text-white px-2 py-1 rounded"
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameConfirm}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameConfirm();
                  if (e.key === "Escape") {
                    setRenamingPath(null);
                    setRenameValue("");
                  }
                }}
              />
            ) : (
              <span>📄 {item.name}</span>
            )}
          </div>
        )}
      </li>
    ))}
  </ul>
}


  return (
    <div className="flex w-full h-screen bg-black text-white">
      {/* Sidebar */}
      <div className={`${isSideBarOpen ? "w-[18%]":"w-[3%]" } scrollbar-thin transition-all duration-150 overflow-auto flex justify-between gap-3 flex-col border-r border-gray-700 p-2`}>
          {contextMenu && (
            <div
              className="absolute bg-[#333] border-white/30 shadow-lg rounded-xl overflow-hidden text-sm w-40 z-50"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={closeContextMenu}
            >
              {contextMenu.type === "file" ? (
                <>
                  <button
                    className="block cursor-pointer w-full text-left px-3 py-2 hover:bg-blue-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingPath(contextMenu.item.path);
                      setRenameValue(contextMenu.item.name);
                      closeContextMenu();
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="block w-full cursor-pointer text-left px-3 py-2 hover:bg-blue-500 text-white"
                    onClick={(e) => {

                      handleDelete(contextMenu.item)

                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="block w-full cursor-pointer text-left px-3 py-2 hover:bg-blue-500"
                    // onClick={() => handleNewFile(contextMenu.item)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddFile(contextMenu.item.path);
                      closeContextMenu();
                    }}
                  >
                    New File
                  </button>
                  <button
                    className="block w-full cursor-pointer text-left px-3 py-2 hover:bg-blue-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddFolder(contextMenu.item.path);
                      closeContextMenu();
                    }}
                    // onClick={() => handleNewFolder(contextMenu.item)}
                  >
                    New Folder
                  </button>
                  <button
                    className="block w-full cursor-pointer text-left px-3 py-2 hover:bg-blue-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingPath(contextMenu.item.path);
                      setRenameValue(contextMenu.item.name);
                      closeContextMenu();
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="block w-full cursor-pointer text-left px-3 py-2 hover:bg-blue-500 text-white"
                    onClick={(e) => {

                      handleDelete(contextMenu.item)
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}

          <div>
          <div  title={isSideBarOpen ? "Close" : "Open"} className="w-full flex  justify-end">{isSideBarOpen ?  <ChevronsLeft onClick={()=>setIsSideBarOpen(!isSideBarOpen)} className="cursor-pointer"/>:<ChevronsRight className="cursor-pointer" onClick={()=>setIsSideBarOpen(!isSideBarOpen)}/>}</div>
          {!isSideBarOpen ?<div></div> : folderPath? (
            <>
              {/* Root folder name */}
              <div
                className="flex items-center justify-between group cursor-pointer"
                onClick={() => {
                  toggleFolder(folderPath);
                  setActiveFolder(folderPath); // mark this as current target
                }}
              >
                <div className="flex items-center font-medium text-lg cursor-pointer p-1">
                  <span className="mr-1">
                    {expandedFolders.has(folderPath) ? <ChevronDown /> : <ChevronRight />}
                  </span>
                  <p>📂 {folderPath.split(/[/\\]/).pop()?.substring(0 , 10)}</p>
                </div>
                <div className="hidden group-hover:flex gap-1 mr-2">
                  <div
                    title="New File"
                    className="p-1 hover:bg-white/20 cursor-pointer rounded" onClick={(e) => {
                      e.stopPropagation();
                      handleAddFile();
                      
                    }}  
                  >
                    <FilePlus strokeWidth={1.2} size={19} />
                  </div>
                  <div
                    title="New Folder"
                    className="p-1 hover:bg-white/20 cursor-pointer rounded" onClick={(e) => {
                    e.stopPropagation();
                    handleAddFolder();
                  }}
                  >
                    <FolderPlus strokeWidth={1.2} size={19} />
                  </div>
                </div>
              </div>
              {showInput && activeFolder == folderPath && (
              <div className="p-1">
                <input
                  type="text"
                  value={newName}
                  onBlur={()=>{
                    setShowInput(false);
                  }}
                  onChange={(e) => setNewName(e.target.value)}
                 onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") setShowInput(false);
                  }}
                  placeholder={isFolder ? "New Folder Name" : "New File Name"}
                  className="w-full bg-gray-800 text-white px-2 py-1 rounded"
                  autoFocus
                />
              </div>
            )}

              {expandedFolders.has(folderPath) && <FileTree items={fileTree} />}
            </>
          ) : filePath ? (
            <div className="font-medium text-white/20 text-xl p-1">
              {/* 📄 {filePath.split(/[/\\]/).pop()} */}
              Open a Folder To view Explorer
            </div>
          ) :  (
            <p>No folder or file selected</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setAutoSave(!autoSave)}
            className={` transition-all duration-150  py-2 ${isSideBarOpen && "bg-white/10 hover:bg-white/20"} rounded-4xl cursor-pointer`}
          >
            {isSideBarOpen ? autoSave ? "Auto Save: ON" : "Auto Save: OFF" : autoSave && <input type="checkbox" name="AutoSave" title="AutoSave" onChange={(e)=>setAutoSave(!autoSave)} checked={autoSave} id="" /> }

          </button>

          <button
            onClick={handleLogout} title="Logout"
            className={` transition-all duration-150  py-2 ${isSideBarOpen && "bg-white/10 hover:bg-white/20"} rounded-4xl cursor-pointer`}
          >
            {isSideBarOpen ? "Logout":<LogOutIcon size={16} className="m-auto"/> }
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className={`flex-1 ${isSideBarOpen ? "w-[82%]" : "w-[97%]"}  flex flex-col`}>
        {/* Tabs */}
        <div className="flex ">
          <div className={`flex w-full scrollbar-thin overflow-x-scroll  border-b border-gray-700 bg-white/20`}>
            {openTabs.map((tab) => (
              <div
                key={tab.path}
                className={`flex group items-center px-3 py-1 border-white/10 border-[1px] cursor-pointer ${
                  activeTab === tab.path
                    ? "bg-white/10 text-white border-b-0 border-t-2 border-t-blue-500"
                    : "bg-white/10 text-white/30"
                }`}
                onClick={() => setActiveTab(tab.path)}
              >
                <p className="whitespace-nowrap">
                  {tab.name}{unsaved[tab.path] ? " *" : ""}
                </p>

                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.path);
                  }}
                  className={`ml-2 ${
                    activeTab == tab.path ? "opacity-100" : "opacity-0"
                  } group-hover:opacity-100 cursor-pointer`}
                >
                  x
                </span>
              </div>
            ))}
          </div>
          <div className="flex px-1 ">
            <button className="cursor-pointer hover:bg-white/25 rounded-sm transition-all duration-150 px-2" onClick={() => handleRunFile(activeTab)} disabled={!activeTab}>Run</button>
          </div>
        </div>

        {/* Editor Area */}

      <div className="flex-1 overflow-hidden w-full bg-black">
        {activeTab ? (
          <Editor
            height="100%"
            width="100%"
            defaultLanguage={detectLanguage(activeTab)}
            value={openTabs.find((tab) => tab.path === activeTab)?.content || ""}
            theme="vs-dark"
            onChange={(value) => {
              setOpenTabs((prev) =>
                prev.map((tab) =>
                  tab.path === activeTab ? { ...tab, content: value || "" } : tab
                )
              );
              setUnsaved((prev) => ({ ...prev, [activeTab]: true }));
            }}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16, bottom: 8 }
            }}
            onMount={(editor, monaco) => {
          monaco.editor.defineTheme('custom-vscode-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: '', foreground: 'C0C0C0', background: '000000' }, // Default text gray, background black
            { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
            { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
            { token: 'identifier', foreground: '4FC1FF' }, // Variables/functions blue
            { token: 'number', foreground: 'B5CEA8' },
            { token: 'string', foreground: 'CE9178' },
            { token: 'type', foreground: '4EC9B0' },
            { token: 'delimiter', foreground: 'D4D4D4' },
            { token: 'operator', foreground: 'D4D4D4' },
            { token: 'constant', foreground: '4FC1FF' },
            { token: 'function', foreground: 'DCDCAA' },
            { token: 'class', foreground: '4EC9B0' },
            { token: 'interface', foreground: 'B8D7A3' },
            { token: 'namespace', foreground: '4EC9B0' },
            { token: 'typeParameter', foreground: '4EC9B0' },
            { token: 'regexp', foreground: 'D16969' },
            { token: 'annotation', foreground: 'C586C0' },
            { token: 'import', foreground: 'DCDCAA' }, // Import statements
            { token: 'literal', foreground: 'CE9178' }, // Literals
          ],
          colors: {
            'editor.background': '#000000', // Full black
            'editor.foreground': '#C0C0C0', // Default soft gray
            'editorLineNumber.foreground': '#858585',
            'editorLineNumber.activeForeground': '#A0A0A0',
            'editorCursor.foreground': '#FFFFFF',
            'editor.selectionBackground': '#264F78',
            'editor.inactiveSelectionBackground': '#3A3D41',
            'editorIndentGuide.background': '#404040',
            'editorIndentGuide.activeBackground': '#707070',
            'editor.selectionHighlightBackground': '#264F78',
            'editor.wordHighlightBackground': '#575757',
            'editor.wordHighlightStrongBackground': '#454545',
            'editor.findMatchBackground': '#555555',
            'editor.findMatchHighlightBackground': '#444444',
            'editor.hoverHighlightBackground': '#2A2D2E',
            'editor.lineHighlightBackground': '#1A1A1A',
          },
        });

        monaco.editor.setTheme('custom-vscode-dark');

          // Ctrl+S / Cmd+S → save
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            handleSaveFile(activeTab);
          });
        }}
          />

        ) : (
          <p className="text-gray-500">Select a file to view its content</p>
        )}
      </div>

      </div>
    </div>
  );
};

export default HomePage;
