import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, File, X, ChevronRight } from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileItem[];
}

interface FlowVisualizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFolder: () => void;
  onSelectFile: (filePath: string) => void;
  fileTree: FileItem[];
  folderPath?: string | null;
}

const FlowVisualizationModal: React.FC<FlowVisualizationModalProps> = ({
  isOpen,
  onClose,
  onSelectFolder,
  onSelectFile,
  fileTree,
  folderPath,
}) => {
  const [mode, setMode] = useState<'choose' | 'file-list'>('choose');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

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

  const getSupportedFiles = (items: FileItem[]): FileItem[] => {
    const files: FileItem[] = [];
    
    const traverse = (item: FileItem) => {
      if (!item.isDirectory) {
        const ext = item.path.split('.').pop()?.toLowerCase();
        if (['js', 'jsx', 'ts', 'tsx'].includes(ext || '')) {
          files.push(item);
        }
      } else if (item.children) {
        item.children.forEach(traverse);
      }
    };

    items.forEach(traverse);
    return files;
  };

  const supportedFiles = folderPath ? getSupportedFiles(fileTree) : [];

  const handleFileClick = (filePath: string) => {
    onSelectFile(filePath);
    onClose();
  };

  const FileTreeItem: React.FC<{ item: FileItem; level?: number }> = ({ item, level = 0 }) => {
    if (item.isDirectory) {
      return (
        <>
          <div
            className="flex items-center gap-2 px-2 py-1 hover:bg-gray-700 cursor-pointer rounded"
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => toggleFolder(item.path)}
          >
            <ChevronRight
              size={14}
              className={`transition-transform ${
                expandedFolders.has(item.path) ? 'rotate-90' : ''
              }`}
            />
            <Folder size={14} className="text-blue-400" />
            <span className="text-sm">{item.name}</span>
          </div>
          {expandedFolders.has(item.path) && item.children && (
            <div>
              {item.children
                .filter((child) => child.isDirectory || 
                  ['js', 'jsx', 'ts', 'tsx'].includes(child.path.split('.').pop()?.toLowerCase() || ''))
                .map((child) => (
                  <FileTreeItem key={child.path} item={child} level={level + 1} />
                ))}
            </div>
          )}
        </>
      );
    }

    return (
      <div
        className="flex items-center gap-2 px-2 py-1 hover:bg-gray-700 cursor-pointer rounded"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => handleFileClick(item.path)}
      >
        <File size={14} className="text-green-400" />
        <span className="text-sm">{item.name}</span>
      </div>
    );
  };

  useEffect(() => {
    if (isOpen) {
      setMode('choose');
      setSelectedFiles([]);
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#252526] border border-gray-700 rounded-lg shadow-2xl z-50 w-[600px] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white">
                {mode === 'choose' ? 'Visualize Code Flow' : 'Select File'}
              </h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-700 rounded transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {mode === 'choose' ? (
                <div className="space-y-4">
                  <p className="text-gray-400 mb-6">
                    Choose how you want to visualize your code flow:
                  </p>

                  {/* Complete Folder Option */}
                  {folderPath && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        onSelectFolder();
                        onClose();
                      }}
                      className="w-full p-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-left hover:from-blue-500 hover:to-purple-500 transition-all shadow-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-lg">
                          <Folder size={24} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">
                            Complete Folder
                          </h3>
                          <p className="text-sm text-white/80">
                            Analyze all files in the current folder
                          </p>
                        </div>
                        <ChevronRight size={20} className="text-white" />
                      </div>
                    </motion.button>
                  )}

                  {/* Single File Option */}
                  {folderPath && supportedFiles.length > 0 && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setMode('file-list')}
                      className="w-full p-4 bg-gradient-to-r from-green-600 to-cyan-600 rounded-lg text-left hover:from-green-500 hover:to-cyan-500 transition-all shadow-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-lg">
                          <File size={24} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">
                            Single File
                          </h3>
                          <p className="text-sm text-white/80">
                            Choose a specific file to analyze
                          </p>
                          <p className="text-xs text-white/60 mt-1">
                            {supportedFiles.length} supported file(s) found
                          </p>
                        </div>
                        <ChevronRight size={20} className="text-white" />
                      </div>
                    </motion.button>
                  )}

                  {!folderPath && (
                    <div className="text-center py-8 text-gray-400">
                      <p>Please open a folder first to visualize code flow</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setMode('choose')}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      ← Back
                    </button>
                  </div>

                  <div className="bg-[#1e1e1e] rounded-lg border border-gray-700 max-h-[400px] overflow-auto">
                    {supportedFiles.length > 0 ? (
                      <div className="p-2">
                        {fileTree.map((item) => (
                          <FileTreeItem key={item.path} item={item} />
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-gray-400">
                        <p>No supported files found (JS/TS only)</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default FlowVisualizationModal;

