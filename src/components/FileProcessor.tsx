import React, { useCallback, useState } from 'react';
import { Upload, FileJson, FolderTree, Download } from 'lucide-react';
import JSZip from 'jszip';
import { ProcessingStatus } from '../types';

interface FileProcessorProps {
  onStatusChange: (status: ProcessingStatus) => void;
  onError: (error: string | null) => void;
}

const FileProcessor: React.FC<FileProcessorProps> = ({ onStatusChange, onError }) => {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [processedZip, setProcessedZip] = useState<Blob | null>(null);
  const [debug, setDebug] = useState<string[]>([]);

  const isZipFile = (file: File): boolean => {
    // Check both MIME type and file extension
    return (
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed' ||
        file.name.toLowerCase().endsWith('.zip')
    );
  };

  const handleZipChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isZipFile(file)) {
      setZipFile(file);
      setProcessedZip(null);
      setDebug([]);
      onError(null);
    } else {
      onError('Please select a valid ZIP file');
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
    // Convert Windows backslashes to forward slashes and ensure proper path format
    return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  };

  const findFileInZip = (zip: JSZip, searchPath: string): JSZip.JSZipObject | null => {
    const normalizedSearchPath = normalizeFilePath(searchPath);

    // Try direct path
    let file = zip.file(normalizedSearchPath);
    if (file) return file;

    // Try with MainTestFolder prefix
    file = zip.file(`MainTestFolder/${normalizedSearchPath}`);
    if (file) return file;

    // Try without MainTestFolder prefix if it exists in the path
    if (normalizedSearchPath.startsWith('MainTestFolder/')) {
      file = zip.file(normalizedSearchPath.replace('MainTestFolder/', ''));
      if (file) return file;
    }

    // Search through all files in the ZIP
    const allFiles = Object.keys(zip.files).map(normalizeFilePath);
    const matchingFile = allFiles.find(f => f.endsWith(normalizedSearchPath));
    return matchingFile ? zip.file(matchingFile) : null;
  };

  const processFiles = async () => {
    if (!zipFile || !jsonFile) {
      onError('Please upload both ZIP and JSON files');
      return;
    }

    try {
      onStatusChange('processing');
      setDebug([]);

      // Read the JSON file
      const jsonContent = await jsonFile.text();
      const config = JSON.parse(jsonContent);

      setDebug(prev => [...prev, 'JSON config loaded successfully']);

      // Read the ZIP file
      const sourceZip = await JSZip.loadAsync(zipFile);
      const processedZip = new JSZip();

      // Log available files for debugging
      const availableFiles = Object.keys(sourceZip.files).map(normalizeFilePath);
      setDebug(prev => [...prev, `ZIP file loaded. Available files: ${availableFiles.join(', ')}`]);

      // Process each folder configuration
      for (const folderConfig of config) {
        const folderName = folderConfig['Review Test'].replace(/[^a-zA-Z0-9-_]/g, '_');
        const links = folderConfig.Links;

        setDebug(prev => [...prev, `Processing folder: ${folderName}`]);
        setDebug(prev => [...prev, `Looking for files: ${links.join(', ')}`]);

        // Process all files for this folder
        for (const link of links) {
          const normalizedLink = normalizeFilePath(link);
          const file = findFileInZip(sourceZip, normalizedLink);

          if (file) {
            setDebug(prev => [...prev, `Found file: ${file.name}`]);
            try {
              const content = await file.async('uint8array');
              const fileName = normalizedLink.split('/').pop();
              if (fileName) {
                processedZip.folder(folderName)?.file(fileName, content);
                setDebug(prev => [...prev, `Successfully processed: ${fileName} into ${folderName}`]);
              }
            } catch (err) {
              setDebug(prev => [...prev, `Error processing file ${normalizedLink}: ${err}`]);
            }
          } else {
            setDebug(prev => [...prev, `File not found: ${normalizedLink}`]);
          }
        }
      }

      // Generate the processed ZIP file
      const processedBlob = await processedZip.generateAsync({ type: 'blob' });
      setProcessedZip(processedBlob);
      onStatusChange('success');
      setDebug(prev => [...prev, 'ZIP file generated successfully']);
    } catch (error) {
      console.error('Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing the files';
      onError(errorMessage);
      onStatusChange('error');
      setDebug(prev => [...prev, `Error: ${errorMessage}`]);
    }
  };

  const handleDownload = () => {
    if (processedZip) {
      const url = URL.createObjectURL(processedZip);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed_files.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
              <input
                  type="file"
                  accept=".zip"
                  onChange={handleZipChange}
                  className="hidden"
                  id="zipInput"
              />
              <label
                  htmlFor="zipInput"
                  className="cursor-pointer block"
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                <span className="block text-sm font-medium text-gray-700 mb-1">
                Upload ZIP File
              </span>
                <span className="text-xs text-gray-500">
                {zipFile ? zipFile.name : 'Click to browse'}
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
              disabled={!zipFile || !jsonFile}
              className={`flex-1 py-3 px-4 rounded-lg text-white font-medium flex items-center justify-center gap-2
            ${zipFile && jsonFile
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
                  className="flex-1 py-3 px-4 rounded-lg text-white font-medium bg-green-500 hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Processed Files
              </button>
          )}
        </div>

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