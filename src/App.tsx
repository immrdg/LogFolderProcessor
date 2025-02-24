import React, { useState } from 'react';
import { Upload, FolderTree, AlertCircle } from 'lucide-react';
import FileProcessor from './components/FileProcessor';
import { ProcessingStatus } from './types';

function App() {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              File Processor
            </h1>
            <p className="text-lg text-gray-600">
              Upload a ZIP file and JSON configuration to organize your files
            </p>
          </header>

          <div className="bg-white rounded-xl shadow-lg p-8">
            <FileProcessor 
              onStatusChange={setStatus}
              onError={setError}
            />

            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {status === 'processing' && (
              <div className="mt-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-gray-600">Processing files...</p>
              </div>
            )}

            {status === 'success' && (
              <div className="mt-6 p-4 bg-green-50 rounded-lg">
                <p className="text-green-700 text-center">
                  Files have been successfully processed and organized!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;