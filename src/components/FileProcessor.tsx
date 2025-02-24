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

  const handleZipChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/zip') {
      setZipFile(file);
      setProcessedZip(null);
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
      onError(null);
    } else {
      onError('Please select a valid JSON file');
    }
  };

  const processFiles = async () => {
    if (!zipFile || !jsonFile) {
      onError('Please upload both ZIP and JSON files');
      return;
    }

    try {
      onStatusChange('processing');
      
      // Read the JSON file
      const jsonContent = await jsonFile.text();
      const config = JSON.parse(jsonContent);

      // Read the ZIP file
      const sourceZip = new JSZip();
      const processedZip = new JSZip();
      
      await sourceZip.loadAsync(zipFile);

      // Process each folder configuration
      for (const folderConfig of config) {
        const folderName = folderConfig['Review Test'].replace(/[^a-zA-Z0-9-_]/g, '_');
        const links = folderConfig.Links;

        for (const link of links) {
          const file = sourceZip.file(link);
          console.log(file)
          if (file) {
            const content = await file.async('uint8array');
            const fileName = link.split('/').pop();
            processedZip.folder(folderName)?.file(fileName, content);
          }
        }
      }

      // Generate the processed ZIP file
      const processedBlob = await processedZip.generateAsync({ type: 'blob' });
      setProcessedZip(processedBlob);
      onStatusChange('success');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'An error occurred');
      onStatusChange('error');
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
    </div>
  );
};

export default FileProcessor;