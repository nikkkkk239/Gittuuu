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
  Play,
  Settings,
  Terminal as TerminalIcon,
  GitBranch,
  Pencil,
} from "lucide-react";
import TerminalPanel from "../components/TerminalPanel";
import CodeFlowVisualizer from "../components/CodeFlowVisualizer";
import DrawPanel from "../components/DrawPanel";
import FlowVisualizationModal from "../components/FlowVisualizationModal";
import { CodeFlowAnalyzer, CodeFlowGraph } from "../lib/codeFlowAnalyzer";

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
  isBinary?: boolean;
  isVisualization?: boolean;
  isVisualizationLoading?: boolean;
  visualizationData?: {
    graph: CodeFlowGraph;
    sourceName: string;
  };
  visualizationError?: string;
  isDrawTab?: boolean;
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
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const analyzerRef = React.useRef(new CodeFlowAnalyzer());

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
      
      // Start watching the directory for changes
      window.electronAPI.watchDirectory(folderPath).then((result) => {
        if (result.success) {
          console.log("Started watching directory:", folderPath);
        }
      });
    } else if (filePath) {
      // directly open the single file as a tab
      (async () => {
        // Check if file is binary or unsupported
        if (isBinaryOrUnsupported(filePath)) {
          setOpenTabs([
            {
              name: filePath.split(/[/\\]/).pop() || "Untitled",
              path: filePath,
              content: "",
              isBinary: true,
            },
          ]);
          setActiveTab(filePath);
          return;
        }
        
        try {
          const content = await window.electronAPI.readFile(filePath);
          setOpenTabs([
            {
              name: filePath.split(/[/\\]/).pop() || "Untitled",
              path: filePath,
              content,
            },
          ]);
          setActiveTab(filePath);
        } catch (err) {
          // If reading fails, mark as binary/unsupported
          setOpenTabs([
            {
              name: filePath.split(/[/\\]/).pop() || "Untitled",
              path: filePath,
              content: "",
              isBinary: true,
            },
          ]);
          setActiveTab(filePath);
        }
      })();
    }
    
    // Cleanup: stop watching previous directory when folderPath changes
    return () => {
      if (folderPath) {
        window.electronAPI.stopWatching(folderPath);
      }
    };
  }, [folderPath, filePath]);

  // Listen for directory changes and refresh the tree
  useEffect(() => {
    if (!folderPath) return;
    
    const unsubscribe = window.electronAPI.onDirectoryChanged((dirPath) => {
      // Only refresh if the changed directory matches our current folder
      if (dirPath === folderPath) {
        console.log("Directory changed, refreshing tree:", dirPath);
        readDirectoryRecursive(dirPath).then(setFileTree);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [folderPath]);

  useEffect(() => {
    if (!activeTab || !unsaved[activeTab] || !autoSave) return;

    const timer = setTimeout(() => {
      handleSaveFile(activeTab);
    }, 2000); // 2s debounce

    return () => clearTimeout(timer);
  }, [openTabs, activeTab, unsaved, autoSave]);


  const handleFileClick = async (file: FileItem) => {
    setOpeningFile(true);
    
    // Check if file is binary or unsupported
    if (isBinaryOrUnsupported(file.path)) {
      // Don't try to read binary files - just mark as binary
      if (!openTabs.find((tab) => tab.path === file.path)) {
        setOpenTabs((prev) => [...prev, { 
          name: file.name, 
          path: file.path, 
          content: "", 
          isBinary: true 
        }]);
      }
      setActiveTab(file.path);
      setOpeningFile(false);
      return;
    }
    
    try {
      const content = await window.electronAPI.readFile(file.path);
      if (!openTabs.find((tab) => tab.path === file.path)) {
        setOpenTabs((prev) => [...prev, { 
          name: file.name, 
          path: file.path, 
          content 
        }]);
      }
      setActiveTab(file.path);
    } catch (err) {
      console.error("Error reading file:", err);
      // If reading fails, mark as binary/unsupported
      if (!openTabs.find((tab) => tab.path === file.path)) {
        setOpenTabs((prev) => [...prev, { 
          name: file.name, 
          path: file.path, 
          content: "", 
          isBinary: true 
        }]);
      }
      setActiveTab(file.path);
    }
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


  // Check if file is binary or unsupported format
  const isBinaryOrUnsupported = (filePath: string): boolean => {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() || "";
    
    // Executable/binary files
    const binaryExtensions = [
      "out", "exe", "dll", "so", "dylib", "o", "a", "bin",
      "class", "pyc", "pyo", "obj"
    ];
    
    // Archive files
    const archiveExtensions = [
      "zip", "tar", "gz", "bz2", "xz", "rar", "7z", "jar", "war"
    ];
    
    // Media files
    const mediaExtensions = [
      "jpg", "jpeg", "png", "gif", "bmp", "ico", "svg", "webp",
      "mp3", "mp4", "avi", "mov", "wmv", "flv", "mkv", "webm",
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"
    ];
    
    // Database files
    const databaseExtensions = [
      "db", "sqlite", "sqlite3", "mdb"
    ];
    
    // Check if file has no extension but is executable-like
    if (!ext && (fileName === "a.out" || fileName === "out" || fileName.startsWith("."))) {
      return true;
    }
    
    return (
      binaryExtensions.includes(ext) ||
      archiveExtensions.includes(ext) ||
      mediaExtensions.includes(ext) ||
      databaseExtensions.includes(ext)
    );
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
  if (!filePath) return;
  
  // Save the file first if it has unsaved changes
  const file = openTabs.find((tab) => tab.path === filePath);
  if (file && unsaved[filePath]) {
    await handleSaveFile(filePath);
  }
  
  const ext = filePath.split(".").pop()?.toLowerCase();
  const fileName = filePath.split(/[/\\]/).pop() || "";
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  
  // For HTML files, open in browser
  if (ext === "html" || ext === "htm") {
    try {
      await window.electronAPI.openInBrowser(filePath);
      console.log("Opened HTML file in browser:", filePath);
    } catch (err) {
      console.error("Error opening HTML file:", err);
    }
    return;
  }
  
  // For other files, run in terminal
  // Open terminal if not already open
  if (!isTerminalOpen) {
    setIsTerminalOpen(true);
    // Wait a bit for terminal to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Determine command based on file extension
  let command = "";
  switch (ext) {
    case "py":
      command = `python3 "${fileName}"`;
      break;
    case "js":
      command = `node "${fileName}"`;
      break;
    case "ts":
      command = `ts-node "${fileName}"`;  // Assumes ts-node is installed
      break;
    case "cpp":
    case "cc":
    case "cxx":
      // Compile and run C++
      const outputName = fileName.replace(/\.(cpp|cc|cxx)$/, "");
      command = `g++ "${fileName}" -o "${outputName}" && ./"${outputName}"`;
      break;
    case "c":
      // Compile and run C
      const cOutputName = fileName.replace(/\.c$/, "");
      command = `gcc "${fileName}" -o "${cOutputName}" && ./"${cOutputName}"`;
      break;
    case "java":
      // Compile and run Java (assumes class name matches file name without extension)
      const className = fileName.replace(/\.java$/, "");
      command = `javac "${fileName}" && java "${className}"`;
      break;
    default:
      console.log("File type not supported for running:", ext);
      return;
  }
  
  // Send command to terminal using custom event
  // TerminalPanel will listen for this and execute the command
  const workingDir = dir || folderPath || filePath.substring(0, filePath.lastIndexOf("/"));
  window.dispatchEvent(new CustomEvent('terminal:runCommand', { 
    detail: { command, cwd: workingDir }
  }));
};

  // Helper function to read all files recursively
  const readAllFiles = async (folderPath: string): Promise<Array<{ path: string; content: string }>> => {
    const files: Array<{ path: string; content: string }> = [];
    
    const traverse = async (items: FileItem[]) => {
      for (const item of items) {
        if (!item.isDirectory) {
          const ext = item.path.split('.').pop()?.toLowerCase();
          if (['js', 'jsx', 'ts', 'tsx'].includes(ext || '')) {
            try {
              const content = await window.electronAPI.readFile(item.path);
              files.push({ path: item.path, content });
            } catch (err) {
              console.error(`Error reading file ${item.path}:`, err);
            }
          }
        } else if (item.children) {
          await traverse(item.children);
        }
      }
    };
    
    await traverse(fileTree);
    return files;
  };

  // Handle folder visualization
  const handleVisualizeFolder = async () => {
    if (!folderPath) return;
    
    const folderName = folderPath.split(/[/\\]/).pop() || 'project';
    const tabPath = `flow:${folderName}`;
    const tabName = `${folderName}-visualization`;
    
    // Create loading tab immediately
    const loadingTab: Tab = {
      name: tabName,
      path: tabPath,
      content: '',
      isVisualization: true,
      isVisualizationLoading: true,
    };
    
    // Remove existing visualization tab if any and add loading tab
    setOpenTabs((prev) => {
      const filtered = prev.filter((tab) => !tab.isVisualization || tab.path !== tabPath);
      return [...filtered, loadingTab];
    });
    
    setActiveTab(tabPath);
    setShowFlowModal(false);
    
    // Do analysis in background
    (async () => {
      try {
        const allFiles = await readAllFiles(folderPath);
        const graph = await analyzerRef.current.analyzeFolder(folderPath, allFiles);
        
        // Check if graph has any functions
        if (graph.functions.size === 0) {
          setOpenTabs((prev) =>
            prev.map((tab) =>
              tab.path === tabPath
                ? {
                    ...tab,
                    isVisualizationLoading: false,
                    visualizationError: 'No functions found to visualize',
                  }
                : tab
            )
          );
          return;
        }
        
        // Update tab with graph data
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.path === tabPath
              ? {
                  ...tab,
                  isVisualizationLoading: false,
                  visualizationData: {
                    graph,
                    sourceName: folderName,
                  },
                }
              : tab
          )
        );
      } catch (error) {
        console.error('Error visualizing folder:', error);
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.path === tabPath
              ? {
                  ...tab,
                  isVisualizationLoading: false,
                  visualizationError: 'Failed to analyze folder. Please ensure you have valid JavaScript/TypeScript files.',
                }
              : tab
          )
        );
      }
    })();
  };

  // Handle single file visualization
  const handleVisualizeFile = async (filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop() || 'file';
    const tabPath = `flow:${filePath}`;
    const tabName = `${fileName}-visualization`;
    
    // Create loading tab immediately
    const loadingTab: Tab = {
      name: tabName,
      path: tabPath,
      content: '',
      isVisualization: true,
      isVisualizationLoading: true,
    };
    
    // Remove existing visualization tab if any and add loading tab
    setOpenTabs((prev) => {
      const filtered = prev.filter((tab) => !tab.isVisualization || tab.path !== tabPath);
      return [...filtered, loadingTab];
    });
    
    setActiveTab(tabPath);
    setShowFlowModal(false);
    
    // Do analysis in background
    (async () => {
      try {
        let graph: CodeFlowGraph;
        
        if (!folderPath) {
          // Single file mode - analyze just this file
          const content = await window.electronAPI.readFile(filePath);
          graph = await analyzerRef.current.analyzeFile(
            filePath,
            content,
            detectLanguage(filePath)
          );
        } else {
          // Hybrid mode - analyze file + imports
          const allFiles = await readAllFiles(folderPath);
          const fileContent = await window.electronAPI.readFile(filePath);
          graph = await analyzerRef.current.analyzeHybrid(
            filePath,
            fileContent,
            allFiles,
            folderPath
          );
        }
        
        // Check if graph has any functions
        if (graph.functions.size === 0) {
          setOpenTabs((prev) =>
            prev.map((tab) =>
              tab.path === tabPath
                ? {
                    ...tab,
                    isVisualizationLoading: false,
                    visualizationError: 'No functions found to visualize',
                  }
                : tab
            )
          );
          return;
        }
        
        // Update tab with graph data
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.path === tabPath
              ? {
                  ...tab,
                  isVisualizationLoading: false,
                  visualizationData: {
                    graph,
                    sourceName: fileName,
                  },
                }
              : tab
          )
        );
      } catch (error) {
        console.error('Error visualizing file:', error);
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.path === tabPath
              ? {
                  ...tab,
                  isVisualizationLoading: false,
                  visualizationError: 'Failed to analyze file.',
                }
              : tab
          )
        );
      }
    })();
  };

  // Handle node click - jump to code
  const handleNodeClick = async (functionId: string, node: any) => {
    if (!node.filePath) return;
    
    // Check if file is already open
    const existingTab = openTabs.find((tab) => tab.path === node.filePath && !tab.isVisualization);
    
    if (existingTab) {
      setActiveTab(node.filePath);
    } else {
      // Open the file
      try {
        const content = await window.electronAPI.readFile(node.filePath);
        const newTab: Tab = {
          name: node.filePath.split(/[/\\]/).pop() || 'Untitled',
          path: node.filePath,
          content,
        };
        
        setOpenTabs((prev) => {
          if (prev.find((tab) => tab.path === node.filePath)) {
            return prev;
          }
          return [...prev, newTab];
        });
        
        setActiveTab(node.filePath);
        
        // Scroll to function after a delay (editor needs to mount)
        setTimeout(() => {
          // This will be handled by Monaco editor integration if needed
        }, 500);
      } catch (error) {
        console.error('Error opening file:', error);
      }
    }
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
                  {tab.name}{!tab.isVisualization && !tab.isDrawTab && unsaved[tab.path] ? " *" : ""}
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
          <div className="flex px-1 gap-1">
            <button 
              className="cursor-pointer hover:bg-white/25 rounded-sm transition-all duration-150 px-3 py-2 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" 
              onClick={() => handleRunFile(activeTab)} 
              disabled={!activeTab}
              title="Run"
            >
              <Play size={16} />
            </button>
           <button className="cursor-pointer hover:bg-white/25 rounded-sm transition-all duration-150 px-3 py-2 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" disabled={!folderPath}
              onClick={async () => {
 // you can store this globally when folder opened
                if (!folderPath) {
                  alert("Please open a project first!");
                  return;
                } 
                const result = await window.electronAPI.deployProject(folderPath);
                if (result.success) alert(`Deployed! Visit: ${result.url}`);
                else alert("Deployment failed: " + result.error);
              }} title="Deploy Project"
            >
              🚀
            </button>
            <button 
              className="cursor-pointer hover:bg-white/25 rounded-sm transition-all duration-150 px-3 py-2 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed" 
              onClick={() => setShowFlowModal(true)}
              disabled={!folderPath}
              title="Show Code Flow"
            >
              <GitBranch size={16} />
            </button>
            <button 
              className="cursor-pointer hover:bg-white/25 rounded-sm transition-all duration-150 px-3 py-2 flex items-center justify-center" 
              onClick={() => {
                const drawTabPath = 'draw:canvas';
                const drawTab: Tab = {
                  name: 'Draw Canvas',
                  path: drawTabPath,
                  content: '',
                  isDrawTab: true,
                };
                
                // Remove existing draw tab if any and add new one
                setOpenTabs((prev) => {
                  const filtered = prev.filter((tab) => !tab.isDrawTab || tab.path !== drawTabPath);
                  return [...filtered, drawTab];
                });
                
                setActiveTab(drawTabPath);
              }}
              title="Open Draw Canvas"
            >
              <Pencil size={16} />
            </button>
            <button 
              className={`cursor-pointer hover:bg-white/25 rounded-sm transition-all duration-150 px-3 py-2 flex items-center justify-center ${isTerminalOpen ? 'bg-white/20' : ''}`} 
              onClick={() => setIsTerminalOpen(!isTerminalOpen)}
              title={isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
            >
              <TerminalIcon size={16} />
            </button>
          </div>
        </div>

        {/* Editor Area */}

      <div className={`flex-1 overflow-hidden w-full bg-black ${isTerminalOpen ? 'flex flex-col' : ''}`}>
        <div className={`${isTerminalOpen ? 'h-1/2' : 'h-full'} overflow-hidden`}>
        {activeTab ? (
          (() => {
            const currentTab = openTabs.find((tab) => tab.path === activeTab);
            
            // Check if it's a visualization tab
            // Check if it's a draw tab
            if (currentTab?.isDrawTab) {
              return (
                <DrawPanel
                  onClose={() => {
                    closeTab(activeTab);
                  }}
                />
              );
            }
            
            if (currentTab?.isVisualization) {
              // Show loading state
              if (currentTab.isVisualizationLoading) {
                return (
                  <div className="h-full w-full flex items-center justify-center bg-[#1e1e1e]">
                    <div className="flex flex-col items-center gap-4">
                      <svg
                        className="w-8 h-8 text-blue-500 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <p className="text-gray-400 text-lg">Preparing visualization...</p>
                    </div>
                  </div>
                );
              }
              
              // Show error state (including no functions)
              if (currentTab.visualizationError) {
                return (
                  <div className="h-full w-full flex items-center justify-center bg-[#1e1e1e]">
                    <div className="flex flex-col items-center gap-4">
                      <p className="text-gray-300 text-xl">{currentTab.visualizationError}</p>
                      <button
                        onClick={() => closeTab(activeTab)}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                );
              }
              
              // Show visualization
              if (currentTab.visualizationData) {
                return (
                  <CodeFlowVisualizer
                    graph={currentTab.visualizationData.graph}
                    sourceName={currentTab.visualizationData.sourceName}
                    onNodeClick={handleNodeClick}
                    onClose={() => {
                      // Close the tab
                      closeTab(activeTab);
                    }}
                  />
                );
              }
              
              return null;
            }
            
            if (currentTab?.isBinary) {
              return (
                <div className="h-full w-full flex items-center justify-center bg-black">
                  <p className="text-gray-400 text-lg">
                    The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding.
                  </p>
                </div>
              );
            }
            const language = detectLanguage(activeTab || "");
            return (
              <Editor
                key={activeTab}
                height="100%"
                width="100%"
                language={language}
                value={currentTab?.content || ""}
                theme="custom-vscode-dark"
                loading={<div className="h-full w-full flex items-center justify-center bg-black"><p className="text-gray-400">Loading editor...</p></div>}
                onChange={(value) => {
                  // Don't allow editing visualization tabs
                  if (currentTab?.isVisualization) return;
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
                  padding: { top: 16, bottom: 8 },
                  wordWrap: 'on',
                  tabSize: 2,
                  detectIndentation: true,
                }}
                beforeMount={(monaco) => {
                  // Define theme BEFORE editor mounts to prevent white text flash
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
                }}
                onMount={(editor, monaco) => {
                  // Set theme after mount
                  monaco.editor.setTheme('custom-vscode-dark');
                  
                  // Ensure language is set correctly (in case it wasn't detected properly)
                  const detectedLanguage = detectLanguage(activeTab || "");
                  const model = editor.getModel();
                  if (model && detectedLanguage) {
                    monaco.editor.setModelLanguage(model, detectedLanguage);
                  }

                  // Ctrl+S / Cmd+S → save
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    handleSaveFile(activeTab);
                  });
                }}
              />
            );
          })()
        ) : (
          <p className="text-gray-500">Select a file to view its content</p>
        )}
        </div>

        {/* Terminal Panel */}
        {isTerminalOpen && (
          <div className="h-1/2 border-t border-gray-700">
            <TerminalPanel 
              initialCwd={
                folderPath 
                  ? folderPath 
                  : activeTab 
                    ? activeTab.substring(0, activeTab.lastIndexOf('/'))
                    : undefined
              }
              onClose={() => setIsTerminalOpen(false)}
            />
          </div>
        )}

      </div>

      </div>
      
      {/* Flow Visualization Modal */}
      <FlowVisualizationModal
        isOpen={showFlowModal}
        onClose={() => setShowFlowModal(false)}
        onSelectFolder={handleVisualizeFolder}
        onSelectFile={handleVisualizeFile}
        fileTree={fileTree}
        folderPath={folderPath}
      />
    </div>
  );
};

export default HomePage;
