import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { scanAPI, testsAPI } from '../services/api';
import {
  ArrowLeft, Camera, CheckCircle2, XCircle, AlertTriangle,
  Users, Volume2, VolumeX, RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function LiveScanner() {
  const { testId } = useParams();
  const fileInputRef = useRef(null);
  const audioCtxRef = useRef(null);

  const [test, setTest] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastResult, setLastResult] = useState(null);
  const [scannedStudents, setScannedStudents] = useState([]);
  const [error, setError] = useState(null);

  /* ── Load test info ──────────────────────────────────────────── */
  useEffect(() => {
    testsAPI.get(testId).then((r) => setTest(r.data)).catch(() => setError('Test not found'));
  }, [testId]);

  /* ── Cleanup ─────────────────────────────────────────────────── */
  useEffect(() => {
    return () => { if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {}); };
  }, []);

  /* ── Audio feedback ──────────────────────────────────────────── */
  const playBeep = useCallback((success = true) => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 880 : 300;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.15 : 0.3));
    } catch { /* audio not supported */ }
  }, [soundEnabled]);

  /* ── Open native camera ──────────────────────────────────────── */
  const openCamera = useCallback(() => {
    if (processing) return;
    setLastResult(null);
    fileInputRef.current?.click();
  }, [processing]);

  /* ── Process captured photo ──────────────────────────────────── */
  const handleCapture = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-captured

    setProcessing(true);
    setLastResult(null);
    setError(null);

    try {
      const res = await scanAPI.scanLive(testId, file, null);
      const data = res.data;

      playBeep(true);
      if (navigator.vibrate) navigator.vibrate(100);

      setLastResult(data);
      setScannedStudents((prev) => {
        if (data.student_code && prev.some((s) => s.student_code === data.student_code)) {
          return prev.map((s) =>
            s.student_code === data.student_code ? { ...data, time: new Date() } : s
          );
        }
        return [{ ...data, time: new Date() }, ...prev];
      });
    } catch (err) {
      const msg = err.response?.data?.detail || 'Scan failed';
      playBeep(false);
      setError(msg);
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  }, [testId, playBeep]);

  /* ── Stats ───────────────────────────────────────────────────── */
  const totalScanned = scannedStudents.length;
  const avgScore = totalScanned > 0
    ? Math.round(scannedStudents.reduce((s, r) => s + r.percentage, 0) / totalScanned)
    : 0;
  const passCount = scannedStudents.filter((s) => s.percentage >= 50).length;

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/tests/${testId}`} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">Scan Sheets</h1>
          <p className="text-xs text-gray-500 truncate">{test?.name || 'Loading...'}</p>
        </div>
        {totalScanned > 0 && (
          <span className="text-xs font-semibold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
            {totalScanned} done
          </span>
        )}
        <button onClick={() => setSoundEnabled(!soundEnabled)} className="p-1.5 rounded-lg hover:bg-gray-100">
          {soundEnabled ? <Volume2 className="w-4 h-4 text-gray-600" /> : <VolumeX className="w-4 h-4 text-gray-400" />}
        </button>
      </div>

      {/* Hidden file input — opens native camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      {/* ── Main scan area ──────────────────────────────────────── */}
      {!lastResult && !processing && (
        <div className="card text-center py-8">
          <div className="w-20 h-20 bg-brand-50 rounded-full mx-auto mb-5 flex items-center justify-center">
            <Camera className="w-10 h-10 text-brand-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {totalScanned === 0 ? 'Ready to Scan' : 'Scan Next Sheet'}
          </h2>
          <p className="text-gray-500 mb-6 max-w-xs mx-auto text-sm">
            Tap the button below — your camera will open.
            Take a clear photo of the answer sheet.
          </p>
          <button
            onClick={openCamera}
            className="btn-primary text-lg px-10 py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
          >
            <Camera className="w-5 h-5 inline mr-2 -mt-0.5" />
            Scan Sheet
          </button>
        </div>
      )}

      {/* ── Processing state ────────────────────────────────────── */}
      {processing && (
        <div className="card text-center py-10">
          <div className="w-16 h-16 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="font-semibold text-gray-700 text-lg">Processing...</p>
          <p className="text-sm text-gray-400 mt-1">Reading answers from your photo</p>
        </div>
      )}

      {/* ── Result card ─────────────────────────────────────────── */}
      {lastResult && !processing && (
        <div className="card overflow-hidden">
          {/* Result header with color bar */}
          <div className={`-mx-6 -mt-6 px-6 py-4 mb-4 ${
            lastResult.percentage >= 50 ? 'bg-emerald-50' : 'bg-red-50'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
                lastResult.percentage >= 50 ? 'bg-emerald-100' : 'bg-red-100'
              }`}>
                {lastResult.percentage >= 50
                  ? <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  : <XCircle className="w-8 h-8 text-red-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-gray-900 truncate">
                  {lastResult.student_name || lastResult.student_code || 'Unknown Student'}
                </p>
                <p className="text-3xl font-black text-brand-600">
                  {lastResult.score}<span className="text-lg text-gray-400">/{lastResult.total}</span>
                  <span className="text-lg ml-2 text-gray-500">({lastResult.percentage}%)</span>
                </p>
              </div>
            </div>
          </div>

          {lastResult.flagged_count > 0 && (
            <div className="flex items-center gap-2 text-amber-600 text-sm mb-4 bg-amber-50 -mx-6 px-6 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>{lastResult.flagged_count} answer(s) need review</p>
            </div>
          )}

          <button
            onClick={openCamera}
            className="btn-primary w-full text-lg py-3 rounded-xl active:scale-[0.98] transition-transform"
          >
            <Camera className="w-5 h-5 inline mr-2 -mt-0.5" />
            Scan Next Sheet
          </button>
        </div>
      )}

      {/* ── Error with retry ────────────────────────────────────── */}
      {error && !processing && !lastResult && (
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center gap-3 text-red-700 mb-3">
            <XCircle className="w-5 h-5 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
          <button
            onClick={() => { setError(null); openCamera(); }}
            className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )}

      {/* ── Stats bar ───────────────────────────────────────────── */}
      {totalScanned > 0 && (
        <div className="card flex items-center justify-around text-center">
          <div>
            <p className="text-2xl font-bold text-brand-600">{totalScanned}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Scanned</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-2xl font-bold text-gray-800">{avgScore}%</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Class Avg</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <p className="text-2xl font-bold text-emerald-600">{passCount}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Passed</p>
          </div>
        </div>
      )}

      {/* ── Scanned students list ───────────────────────────────── */}
      {totalScanned > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-brand-500" />
            <h2 className="text-lg font-semibold text-gray-900">Scanned Students</h2>
            <span className="ml-auto text-sm text-gray-500">{totalScanned} total</span>
          </div>
          <div className="divide-y">
            {scannedStudents.map((s, i) => (
              <div key={s.student_code || i} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {s.student_name || s.student_code || `Student ${i + 1}`}
                  </p>
                  {s.student_code && s.student_name && (
                    <p className="text-xs text-gray-400">{s.student_code}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    s.percentage >= 50 ? 'text-emerald-600' : 'text-red-500'
                  }`}>
                    {s.score}/{s.total}
                  </p>
                  <p className="text-xs text-gray-400">{s.percentage}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
