import React, { useState } from 'react';
import { Upload, FileJson, FolderTree, Download, File, Folder } from 'lucide-react';
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
  files: string[];
}

const FileProcessor: React.FC<FileProcessorProps> = ({ onStatusChange, onError }) => {
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [processedZip, setProcessedZip] = useState<Blob | null>(null);
  const [debug, setDebug] = useState<string[]>([]);
  const [batchId, setBatchId] = useState<string>('');
  const [folderStats, setFolderStats] = useState<FolderStats[]>([]);

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

  const handleArchiveChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidArchive(file)) {
      setArchiveFile(file);
      setProcessedZip(null);
      setDebug([]);
      onError(null);
    } else {
      onError('Please select a valid ZIP or TAR file');
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

    // First try direct match
    let file = zip.file(normalizedSearchPath);
    if (file) return file;

    // Get all files in the ZIP
    const allFiles = Object.keys(zip.files).map(normalizeFilePath);

    // Try to find the file by matching the end of the path
    const matchingFile = allFiles.find(f => {
      const parts = f.split('/');
      const searchParts = normalizedSearchPath.split('/');

      // Match from the end of the path
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

      // Match from the end of the path
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
      setDebug([]);
      const newFolderStats: FolderStats[] = [];

      // Read the JSON file
      const jsonContent = await jsonFile.text();
      const config = JSON.parse(jsonContent);

      if (!Array.isArray(config)) {
        throw new Error('Invalid JSON format: expected an array');
      }

      setDebug(prev => [...prev, 'JSON config loaded successfully']);

      const processedZip = new JSZip();

      if (isTarFile(archiveFile)) {
        // Handle TAR file
        const tarBuffer = await archiveFile.arrayBuffer();
        setDebug(prev => [...prev, 'TAR file loaded successfully']);

        for (const folderConfig of config) {
          if (!folderConfig || typeof folderConfig !== 'object') continue;

          const folderName = folderConfig['Review Test'];
          const folderStat: FolderStats = {
            name: folderName,
            fileCount: 0,
            files: []
          };

          for (const link of folderConfig.Links || []) {
            const fileContent = await findFileInTar(tarBuffer, link);
            if (fileContent) {
              folderStat.fileCount++;
              const fileName = link.split('/').pop() || link;
              folderStat.files.push(fileName);
              processedZip.folder(folderName)?.file(fileName, fileContent);
            }
          }

          newFolderStats.push(folderStat);
        }
      } else {
        const sourceZip = await JSZip.loadAsync(archiveFile);

        for (const folderConfig of config) {
          if (!folderConfig || typeof folderConfig !== 'object') continue;

          const folderName = folderConfig['Review Test'];
          const folderStat: FolderStats = {
            name: folderName,
            fileCount: 0,
            files: []
          };

          for (const link of folderConfig.Links || []) {
            const file = findFileInZip(sourceZip, link);
            if (file) {
              folderStat.fileCount++;
              const fileName = link.split('/').pop() || link;
              folderStat.files.push(fileName);
              const content = await file.async('uint8array');
              processedZip.folder(folderName)?.file(fileName, content);
            }
          }

          newFolderStats.push(folderStat);
        }
      }

      setFolderStats(newFolderStats);
      const processedBlob = await processedZip.generateAsync({ type: 'blob' });
      setProcessedZip(processedBlob);
      onStatusChange('success');
    } catch (error) {
      console.error('Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing the files';
      onError(errorMessage);
      onStatusChange('error');
      setDebug(prev => [...prev, `Error: ${errorMessage}`]);
    }
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
    } else {
      onError('Please enter a Batch ID before downloading');
    }
  };

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

        <div className="flex flex-col gap-4">
          {processedZip && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="mb-4">
                  <label htmlFor="batchId" className="block text-sm font-medium text-gray-700 mb-2">
                    Enter Batch ID
                  </label>
                  <input
                      type="text"
                      id="batchId"
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                      placeholder="Enter batch ID for download"
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
          )}

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
                    onClick={handleDownload}
                    disabled={!batchId.trim()}
                    className={`flex-1 py-3 px-4 rounded-lg text-white font-medium flex items-center justify-center gap-2
                ${batchId.trim()
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-gray-300 cursor-not-allowed'
                    }`}
                >
                  <Download className="w-5 h-5" />
                  Download Processed Files
                </button>
            )}
          </div>
        </div>

        {folderStats.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-blue-500" />
                File Structure
              </h3>
              <div className="space-y-4">
                {folderStats.map((folder, index) => (
                    <div key={index} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Folder className="w-5 h-5 text-blue-500" />
                        <span className="font-medium text-gray-800">{folder.name}</span>
                        <span className="text-sm text-gray-500">({folder.fileCount} files)</span>
                      </div>
                      <div className="ml-6 space-y-1">
                        {folder.files.map((file, fileIndex) => (
                            <div key={fileIndex} className="flex items-center gap-2 text-sm text-gray-600">
                              <File className="w-4 h-4 text-gray-400" />
                              {file}
                            </div>
                        ))}
                      </div>
                    </div>
                ))}
              </div>
            </div>
        )}

        {debug.length > 0 && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Processing Log:</h3>
              <div className="text-xs font-mono text-gray-600 space-y-1">
                {debug.map((log, index) => (
                    <div key={index} className="border-l-2 border-gray-300 pl-2">
                      {log}
                    </div>
                ))}
              </div>
            </div>
        )}
      </div>
  );
};

export default FileProcessor;