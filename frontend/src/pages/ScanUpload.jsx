import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { scanAPI, classesAPI, testsAPI } from '../services/api';
import { ArrowLeft, Upload, ScanLine, CheckCircle2, AlertCircle, Image, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ScanUpload() {
  const { testId } = useParams();
  const [test, setTest] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    Promise.all([
      testsAPI.get(testId),
      classesAPI.list(),
      scanAPI.listBatches(testId),
    ]).then(([testRes, classRes, batchRes]) => {
      setTest(testRes.data);
      setClasses(classRes.data);
      setBatches(batchRes.data);
    });
  }, [testId]);

  const handleFileSelect = (newFiles) => {
    const fileList = Array.from(newFiles);
    const validFiles = fileList.filter((f) => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'pdf', 'tiff', 'tif'].includes(ext);
    });
    setFiles((prev) => [...prev, ...validFiles]);

    // Generate previews for images
    validFiles.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviews((prev) => [...prev, { name: file.name, src: e.target.result }]);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviews((prev) => [...prev, { name: file.name, src: null }]);
      }
    });
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    handleFileSelect(e.dataTransfer.files);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const removeFile = (idx) => {
    setFiles(files.filter((_, i) => i !== idx));
    setPreviews(previews.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    setUploading(true);
    try {
      const res = await scanAPI.upload(
        testId,
        files,
        selectedClass || null,
      );
      toast.success(`Batch processed! ${res.data.processed_pages} pages scanned.`);
      setFiles([]);
      setPreviews([]);
      // Refresh batches
      const batchRes = await scanAPI.listBatches(testId);
      setBatches(batchRes.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Scan processing failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={`/tests/${testId}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="page-title">Scan Answers</h1>
          <p className="page-subtitle">{test?.name || 'Loading...'}</p>
        </div>
      </div>

      {/* Class selector */}
      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Class (optional — helps match students)
        </label>
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="input-field max-w-xs"
        >
          <option value="">All classes</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>{cls.name}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`card border-2 border-dashed rounded-xl text-center py-12 transition-all cursor-pointer ${
          dragActive
            ? 'border-brand-400 bg-brand-50'
            : 'border-gray-300 hover:border-brand-300 hover:bg-gray-50'
        }`}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.pdf,.tiff,.tif"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <Upload className={`w-12 h-12 mx-auto mb-4 ${dragActive ? 'text-brand-500' : 'text-gray-400'}`} />
        <h3 className="text-lg font-medium text-gray-900">
          {dragActive ? 'Drop files here' : 'Upload scanned answer sheets'}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Drag & drop or click to select • JPG, PNG, PDF, TIFF
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Upload phone photos or multi-page PDFs from a photocopier
        </p>
      </div>

      {/* File previews */}
      {files.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{files.length} file(s) selected</h3>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="btn-primary flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ScanLine className="w-4 h-4" />
                  Process & Grade
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {previews.map((preview, idx) => (
              <div key={idx} className="relative group">
                <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                  {preview.src ? (
                    <img src={preview.src} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <FileText className="w-8 h-8 mb-1" />
                      <span className="text-[10px]">PDF</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
                <p className="text-[10px] text-gray-500 mt-1 truncate">{preview.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous batches */}
      {batches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Scan History</h2>
          <div className="space-y-2">
            {batches.map((batch) => (
              <div key={batch.id} className="card flex items-center gap-4 py-4">
                {batch.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : batch.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <div className="w-5 h-5 border-2 border-brand-300 border-t-brand-500 rounded-full animate-spin" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Batch #{batch.id} — {batch.processed_pages}/{batch.total_pages} pages
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(batch.uploaded_at).toLocaleString()}
                    {batch.error_message && (
                      <span className="text-red-500 ml-2">{batch.error_message}</span>
                    )}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  batch.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : batch.status === 'error'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                }`}>
                  {batch.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
