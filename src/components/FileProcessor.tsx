import React, { useState } from 'react';
import { Upload, FileJson, FolderTree, Download, File, Folder, Layers, Terminal, ChevronRight, ChevronDown } from 'lucide-react';
import JSZip from 'jszip';
import Tar from 'tar-js';
import { ProcessingStatus } from '../types';

interface FileProcessorProps {
  onStatusChange: (status: ProcessingStatus) => void;
  onError: (error: string | null) => void;
}

interface FolderStats {
  name: string;
  fileCount: number;
  insertCount: number;
  updateCount: number;
  files: Array<{
    name: string;
    operation: 'insert' | 'update';
  }>;
}

interface TreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  path: string;
  fileStats?: {
    empty: number;
    nonEmpty: number;
    total: number;
  };
  size?: number;
}

type TabType = 'input' | 'output' | 'logs';

const FileProcessor: React.FC<FileProcessorProps> = ({ onStatusChange, onError }) => {
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [processedZip, setProcessedZip] = useState<Blob | null>(null);
  const [debug, setDebug] = useState<string[]>([]);
  const [batchId, setBatchId] = useState<string>('');
  const [folderStats, setFolderStats] = useState<FolderStats[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('input');
  const [showBatchIdModal, setShowBatchIdModal] = useState(false);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [expandedOutputFolders, setExpandedOutputFolders] = useState<Set<string>>(new Set(['processed_files']));

  const addDebugLog = (message: string) => {
    setDebug(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const calculateFileStats = async (file: JSZip.JSZipObject): Promise<{ isEmpty: boolean; size: number }> => {
    const content = await file.async('uint8array');
    return {
      isEmpty: content.length === 0,
      size: content.length
    };
  };

  const updateFolderStats = (node: TreeNode) => {
    if (node.type === 'folder' && node.children) {
      let empty = 0;
      let nonEmpty = 0;
      let total = 0;

      const processNode = (n: TreeNode) => {
        if (n.type === 'file') {
          total++;
          if (n.size === 0) {
            empty++;
          } else {
            nonEmpty++;
          }
        } else if (n.children) {
          n.children.forEach(processNode);
        }
      };

      node.children.forEach(processNode);

      node.fileStats = {
        empty,
        nonEmpty,
        total
      };

      // Recursively update stats for child folders
      node.children
          .filter(child => child.type === 'folder')
          .forEach(updateFolderStats);
    }
  };

  const buildFileTree = async (file: File) => {
    addDebugLog(`Building file tree for ${file.name}`);
    const tree: TreeNode[] = [];

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const files = Object.keys(zip.files);

        const processNode = async (path: string, currentLevel: TreeNode[]) => {
          const parts = path.split('/');
          let currentPath = '';

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            currentPath += (currentPath ? '/' : '') + part;
            const isFile = i === parts.length - 1 && !path.endsWith('/');

            let node = currentLevel.find(n => n.name === part);
            if (!node) {
              node = {
                name: part,
                type: isFile ? 'file' : 'folder',
                path: currentPath,
                ...(isFile ? {} : {
                  children: [],
                  fileStats: { empty: 0, nonEmpty: 0, total: 0 }
                })
              };

              if (isFile) {
                const zipFile = zip.files[path];
                const { isEmpty, size } = await calculateFileStats(zipFile);
                node.size = size;
              }

              currentLevel.push(node);
            }

            if (!isFile) {
              currentLevel = node.children!;
            }
          }
        };

        for (const path of files) {
          await processNode(path, tree);
        }

        // Update folder statistics after all files are processed
        tree.forEach(updateFolderStats);

        addDebugLog(`Successfully built tree structure with ${files.length} entries`);
      }

      setFileTree(tree);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`Error building file tree: ${errorMessage}`);
      onError(`Failed to process file structure: ${errorMessage}`);
    }
  };

  const toggleOutputFolder = (folderName: string) => {
    setExpandedOutputFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  };

  const determineOperation = (link: string): 'insert' | 'update' => {
    const lowerLink = link.toLowerCase();
    return lowerLink.includes('update') || lowerLink.includes('modify') ? 'update' : 'insert';
  };

  const isValidArchive = (file: File): boolean => {
    const fileName = file.name.toLowerCase();
    return (
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed' ||
        file.type === 'application/x-tar' ||
        fileName.endsWith('.zip') ||
        fileName.endsWith('.tar')
    );
  };

  const isTarFile = (file: File): boolean => {
    return file.name.toLowerCase().endsWith('.tar') || file.type === 'application/x-tar';
  };

  const handleArchiveChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidArchive(file)) {
      setArchiveFile(file);
      setProcessedZip(null);
      setDebug([]);
      setFileTree([]);
      onError(null);
      addDebugLog(`Selected archive file: ${file.name}`);
      await buildFileTree(file);
    } else {
      onError('Please select a valid ZIP or TAR file');
      addDebugLog('Invalid archive file selected');
    }
  };

  const handleJsonChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      setJsonFile(file);
      setProcessedZip(null);
      setDebug([]);
      onError(null);
    } else {
      onError('Please select a valid JSON file');
    }
  };

  const normalizeFilePath = (path: string): string => {
    return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  };

  const findFileInZip = (zip: JSZip, searchPath: string): JSZip.JSZipObject | null => {
    const normalizedSearchPath = normalizeFilePath(searchPath);

    let file = zip.file(normalizedSearchPath);
    if (file) return file;

    const allFiles = Object.keys(zip.files).map(normalizeFilePath);

    const matchingFile = allFiles.find(f => {
      const parts = f.split('/');
      const searchParts = normalizedSearchPath.split('/');

      for (let i = 1; i <= searchParts.length; i++) {
        if (parts[parts.length - i] !== searchParts[searchParts.length - i]) {
          return false;
        }
      }
      return true;
    });

    return matchingFile ? zip.file(matchingFile) : null;
  };

  const findFileInTar = async (tar: ArrayBuffer, searchPath: string): Promise<Uint8Array | null> => {
    const tarReader = new Tar(new Uint8Array(tar));
    const normalizedSearchPath = normalizeFilePath(searchPath);

    while (tarReader.hasNext()) {
      const entry = tarReader.next();
      if (!entry || !entry.name) continue;

      const entryPath = normalizeFilePath(entry.name);
      const searchParts = normalizedSearchPath.split('/');
      const entryParts = entryPath.split('/');

      let matches = true;
      for (let i = 1; i <= searchParts.length; i++) {
        if (entryParts[entryParts.length - i] !== searchParts[searchParts.length - i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return entry.buffer;
      }
    }
    return null;
  };

  const processFiles = async () => {
    if (!archiveFile || !jsonFile) {
      onError('Please upload both archive and JSON files');
      return;
    }

    try {
      onStatusChange('processing');
      addDebugLog('Starting file processing');
      const newFolderStats: FolderStats[] = [];

      const jsonContent = await jsonFile.text();
      const config = JSON.parse(jsonContent);
      addDebugLog('JSON configuration loaded successfully');

      if (!Array.isArray(config)) {
        throw new Error('Invalid JSON format: expected an array');
      }

      const processedZip = new JSZip();
      const sourceZip = await JSZip.loadAsync(archiveFile);

      for (const folderConfig of config) {
        if (!folderConfig || typeof folderConfig !== 'object') continue;

        const folderName = folderConfig['Review Text'];
        addDebugLog(`Processing folder: ${folderName}`);

        const folderStat: FolderStats = {
          name: folderName,
          fileCount: 0,
          insertCount: 0,
          updateCount: 0,
          files: []
        };

        for (const link of folderConfig.Links || []) {
          addDebugLog(`Processing file: ${link}`);
          const file = findFileInZip(sourceZip, link);
          if (file) {
            folderStat.fileCount++;
            const fileName = link.split('/').pop() || link;
            const operation = determineOperation(link);

            if (operation === 'insert') {
              folderStat.insertCount++;
            } else {
              folderStat.updateCount++;
            }

            folderStat.files.push({
              name: fileName,
              operation
            });

            const content = await file.async('uint8array');
            processedZip.folder(folderName)?.file(fileName, content);
            addDebugLog(`Successfully processed file: ${fileName} (${operation})`);
          } else {
            addDebugLog(`Warning: File not found: ${link}`);
          }
        }

        newFolderStats.push(folderStat);
      }

      setFolderStats(newFolderStats);
      const processedBlob = await processedZip.generateAsync({ type: 'blob' });
      setProcessedZip(processedBlob);
      onStatusChange('success');
      addDebugLog('File processing completed successfully');
    } catch (error) {
      console.error('Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing the files';
      onError(errorMessage);
      onStatusChange('error');
      addDebugLog(`Error during processing: ${errorMessage}`);
    }
  };

  const handleDownloadClick = () => {
    if (!processedZip) return;
    setShowBatchIdModal(true);
  };

  const handleDownload = () => {
    if (processedZip && batchId.trim()) {
      const url = URL.createObjectURL(processedZip);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed_files_${batchId.trim()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowBatchIdModal(false);
    } else {
      onError('Please enter a Batch ID before downloading');
    }
  };

  const TreeView: React.FC<{ nodes: TreeNode[], level?: number }> = ({ nodes, level = 0 }) => {
    return (
        <div style={{ marginLeft: level ? '1.5rem' : '0' }}>
          {nodes.map((node, index) => (
              <div key={`${node.path}-${index}`}>
                <div
                    className="flex items-center gap-2 py-1 px-2 hover:bg-gray-50 rounded cursor-pointer"
                    onClick={() => node.type === 'folder' && toggleNode(node.path)}
                >
                  {node.type === 'folder' ? (
                      <>
                        {expandedNodes.has(node.path) ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <Folder className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-700">{node.name}</span>
                        {node.fileStats && (
                            <span className="text-xs text-gray-500">
                      ({node.fileStats.total} files: {node.fileStats.nonEmpty} non-empty, {node.fileStats.empty} empty)
                    </span>
                        )}
                      </>
                  ) : (
                      <>
                        <span className="w-4" />
                        <File className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">{node.name}</span>
                        {node.size !== undefined && (
                            <span className="text-xs text-gray-500">
                      ({node.size === 0 ? 'empty' : `${node.size} bytes`})
                    </span>
                        )}
                      </>
                  )}
                </div>
                {node.type === 'folder' && expandedNodes.has(node.path) && node.children && (
                    <TreeView nodes={node.children} level={level + 1} />
                )}
              </div>
          ))}
        </div>
    );
  };

  const OutputTreeView: React.FC<{
    folders: FolderStats[]
  }> = ({ folders }) => {
    const totalFiles = folders.reduce((sum, folder) => sum + folder.fileCount, 0);
    const totalInserts = folders.reduce((sum, folder) => sum + folder.insertCount, 0);
    const totalUpdates = folders.reduce((sum, folder) => sum + folder.updateCount, 0);

    return (
        <div className="border border-gray-100 rounded-lg p-4">
          <div className="space-y-2">
            <div className="border border-gray-100 rounded-lg">
              <div
                  className="flex items-center gap-2 cursor-pointer p-4"
                  onClick={() => toggleOutputFolder('processed_files')}
              >
                {expandedOutputFolders.has('processed_files') ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <Folder className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-gray-800">Processed Files</span>
                <span className="text-sm text-gray-500">
                ({totalFiles} files: {totalInserts} inserts, {totalUpdates} updates)
              </span>
              </div>

              {expandedOutputFolders.has('processed_files') && (
                  <div className="border-t border-gray-100">
                    {folders.map((folder, index) => (
                        <div key={index} className="border-b border-gray-100 last:border-b-0">
                          <div className="p-4 pl-8">
                            <div
                                className="flex items-center gap-2 cursor-pointer"
                                onClick={() => toggleOutputFolder(folder.name)}
                            >
                              {expandedOutputFolders.has(folder.name) ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                              ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                              )}
                              <Folder className="w-5 h-5 text-blue-500" />
                              <span className="font-medium text-gray-800">{folder.name}</span>
                              <span className="text-sm text-gray-500">
                          ({folder.fileCount} files: {folder.insertCount} inserts, {folder.updateCount} updates)
                        </span>
                            </div>
                            {expandedOutputFolders.has(folder.name) && (
                                <div className="ml-6 mt-2 space-y-1">
                                  {folder.files.map((file, fileIndex) => (
                                      <div key={fileIndex} className="flex items-center gap-2 text-sm text-gray-600 py-1">
                                        <File className="w-4 h-4 text-gray-400" />
                                        <span>{file.name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            file.operation === 'insert'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-blue-100 text-blue-700'
                                        }`}>
                                {file.operation}
                              </span>
                                      </div>
                                  ))}
                                </div>
                            )}
                          </div>
                        </div>
                    ))}
                  </div>
              )}
            </div>
          </div>
        </div>
    );
  };

  const TabButton: React.FC<{
    tab: TabType;
    icon: React.ReactNode;
    label: string;
  }> = ({ tab, icon, label }) => (
      <button
          onClick={() => setActiveTab(tab)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
        ${activeTab === tab
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
      >
        {icon}
        {label}
      </button>
  );

  return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
              <input
                  type="file"
                  accept=".zip,.tar"
                  onChange={handleArchiveChange}
                  className="hidden"
                  id="archiveInput"
              />
              <label
                  htmlFor="archiveInput"
                  className="cursor-pointer block"
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                <span className="block text-sm font-medium text-gray-700 mb-1">
                Upload ZIP or TAR File
              </span>
                <span className="text-xs text-gray-500">
                {archiveFile ? archiveFile.name : 'Click to browse'}
              </span>
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
              <input
                  type="file"
                  accept=".json"
                  onChange={handleJsonChange}
                  className="hidden"
                  id="jsonInput"
              />
              <label
                  htmlFor="jsonInput"
                  className="cursor-pointer block"
              >
                <FileJson className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                <span className="block text-sm font-medium text-gray-700 mb-1">
                Upload JSON File
              </span>
                <span className="text-xs text-gray-500">
                {jsonFile ? jsonFile.name : 'Click to browse'}
              </span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
              onClick={processFiles}
              disabled={!archiveFile || !jsonFile}
              className={`flex-1 py-3 px-4 rounded-lg text-white font-medium flex items-center justify-center gap-2
            ${archiveFile && jsonFile
                  ? 'bg-blue-500 hover:bg-blue-600'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
          >
            <FolderTree className="w-5 h-5" />
            Process Files
          </button>

          {processedZip && (
              <button
                  onClick={handleDownloadClick}
                  className="flex-1 py-3 px-4 rounded-lg text-white font-medium bg-green-500 hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Processed Files
              </button>
          )}
        </div>

        {(fileTree.length > 0 || folderStats.length > 0 || debug.length > 0) && (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="border-b border-gray-200 p-4">
                <div className="flex gap-4">
                  <TabButton
                      tab="input"
                      icon={<FolderTree className="w-5 h-5" />}
                      label="Input Structure"
                  />
                  <TabButton
                      tab="logs"
                      icon={<Terminal className="w-5 h-5" />}
                      label="Logs"
                  />
                  <TabButton
                      tab="output"
                      icon={<Layers className="w-5 h-5" />}
                      label="Output Structure"
                  />
                </div>
              </div>

              <div className="p-6">
                {activeTab === 'input' && archiveFile && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FolderTree className="w-5 h-5 text-blue-500" />
                        Input File: {archiveFile.name}
                      </h3>
                      <div className="border border-gray-100 rounded-lg p-4">
                        <TreeView nodes={fileTree} />
                      </div>
                    </div>
                )}

                {activeTab === 'output' && folderStats.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-blue-500" />
                        Output Structure
                      </h3>
                      <OutputTreeView folders={folderStats} />
                    </div>
                )}

                {activeTab === 'logs' && debug.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-blue-500" />
                        Processing Logs
                      </h3>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="font-mono text-sm text-gray-600 space-y-1">
                          {debug.map((log, index) => (
                              <div key={index} className="border-l-2 border-gray-300 pl-2">
                                {log}
                              </div>
                          ))}
                        </div>
                      </div>
                    </div>
                )}
              </div>
            </div>
        )}

        {showBatchIdModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Enter Batch ID</h3>
                <input
                    type="text"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                    placeholder="Enter batch ID for download"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
                />
                <div className="flex gap-4">
                  <button
                      onClick={() => setShowBatchIdModal(false)}
                      className="flex-1 py-2 px-4 rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                      onClick={handleDownload}
                      disabled={!batchId.trim()}
                      className={`flex-1 py-2 px-4 rounded-lg text-white font-medium
                  ${batchId.trim()
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : 'bg-gray-300 cursor-not-allowed'
                      }`}
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
        )}
      </div>
  );
};

export default FileProcessor;