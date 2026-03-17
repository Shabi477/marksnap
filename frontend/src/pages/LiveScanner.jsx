import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { scanAPI, testsAPI } from '../services/api';
import jsQR from 'jsqr';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  Users, Volume2, VolumeX, Camera, CameraOff,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SCAN_INTERVAL = 400;   // ms between QR detection attempts
const COOLDOWN_MS = 2500;    // ms pause after a successful scan before re-scanning

export default function LiveScanner() {
  const { testId } = useParams();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const cooldownRef = useRef(false);
  const audioCtxRef = useRef(null);

  const [test, setTest] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [qrDetected, setQrDetected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastResult, setLastResult] = useState(null);
  const [scannedStudents, setScannedStudents] = useState([]);
  const [scannedCodes, setScannedCodes] = useState(new Set());

  /* ── Load test info ──────────────────────────────────────────── */
  useEffect(() => {
    testsAPI.get(testId).then((r) => setTest(r.data)).catch(() => setCameraError('Test not found'));
  }, [testId]);

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

  /* ── Start camera ────────────────────────────────────────────── */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : 'Could not access camera. Try closing other apps using the camera.';
      setCameraError(msg);
    }
  }, []);

  /* ── Stop camera ─────────────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  /* ── Cleanup on unmount ──────────────────────────────────────── */
  useEffect(() => {
    return () => {
      stopCamera();
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, [stopCamera]);

  /* ── Auto-start camera ───────────────────────────────────────── */
  useEffect(() => {
    if (test) startCamera();
  }, [test, startCamera]);

  /* ── Capture frame and send to backend ───────────────────────── */
  const captureAndSend = useCallback(async (qrData) => {
    if (processing || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    setProcessing(true);
    setQrDetected(false);
    cooldownRef.current = true;

    try {
      // Convert canvas to blob
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      const qrString = JSON.stringify(qrData);
      const res = await scanAPI.scanLive(testId, blob, qrString);
      const data = res.data;

      playBeep(true);
      if (navigator.vibrate) navigator.vibrate(100);

      setLastResult(data);

      // Track scanned students
      setScannedStudents((prev) => {
        if (data.student_code && prev.some((s) => s.student_code === data.student_code)) {
          return prev.map((s) =>
            s.student_code === data.student_code ? { ...data, time: new Date() } : s
          );
        }
        return [{ ...data, time: new Date() }, ...prev];
      });

      // Track this student code so we don't scan the same sheet twice
      if (data.student_code) {
        setScannedCodes((prev) => new Set(prev).add(data.student_code));
      }

    } catch (err) {
      const msg = err.response?.data?.detail || 'Scan failed';
      playBeep(false);
      toast.error(msg);
    } finally {
      setProcessing(false);
      // Cooldown before scanning next sheet
      setTimeout(() => {
        cooldownRef.current = false;
        setLastResult(null);
      }, COOLDOWN_MS);
    }
  }, [testId, processing, playBeep]);

  /* ── Continuous QR scanning loop ─────────────────────────────── */
  useEffect(() => {
    if (!cameraActive) return;

    scanTimerRef.current = setInterval(() => {
      if (processing || cooldownRef.current || !videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      if (video.readyState < video.HAVE_ENOUGH_DATA) return;

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code) {
        try {
          const qrData = JSON.parse(code.data);
          // Validate it's a MarkSnap QR for this test (no sid — student shades their number)
          if (qrData.tid && String(qrData.tid) === String(testId)) {
            setQrDetected(true);
            // Auto-capture after brief lock-on
            setTimeout(() => captureAndSend(qrData), 200);
            return;
          }
        } catch { /* not a valid JSON QR */ }
      }

      setQrDetected(false);
    }, SCAN_INTERVAL);

    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, [cameraActive, processing, testId, captureAndSend, scannedCodes]);

  /* ── Manual capture fallback ─────────────────────────────────── */
  const manualCapture = useCallback(() => {
    if (processing || cooldownRef.current || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Try to read QR from this frame
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    let qrData = null;
    if (code) {
      try { qrData = JSON.parse(code.data); } catch { /* ignore */ }
    }

    captureAndSend(qrData);
  }, [processing, captureAndSend]);

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

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera view */}
      {!cameraError && (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* QR detected overlay */}
          {qrDetected && (
            <div className="absolute inset-0 border-4 border-emerald-400 rounded-xl pointer-events-none animate-pulse">
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                Sheet detected — capturing...
              </div>
            </div>
          )}

          {/* Processing overlay */}
          {processing && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="bg-white rounded-xl px-6 py-4 text-center">
                <div className="w-8 h-8 border-3 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Processing...</p>
              </div>
            </div>
          )}

          {/* Result overlay */}
          {lastResult && !processing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className={`bg-white rounded-xl p-5 text-center mx-4 max-w-sm w-full shadow-xl ${
                lastResult.percentage >= 50 ? 'ring-2 ring-emerald-400' : 'ring-2 ring-red-400'
              }`}>
                <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center ${
                  lastResult.percentage >= 50 ? 'bg-emerald-100' : 'bg-red-100'
                }`}>
                  {lastResult.percentage >= 50
                    ? <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                    : <XCircle className="w-7 h-7 text-red-500" />
                  }
                </div>
                <p className="font-bold text-gray-900 text-lg">
                  {lastResult.student_name || lastResult.student_code || 'Unknown'}
                </p>
                <p className="text-3xl font-black text-brand-600 my-1">
                  {lastResult.score}<span className="text-lg text-gray-400">/{lastResult.total}</span>
                  <span className="text-base ml-2 text-gray-500">({lastResult.percentage}%)</span>
                </p>
                {lastResult.flagged_count > 0 && (
                  <p className="text-xs text-amber-600 flex items-center justify-center gap-1 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {lastResult.flagged_count} need review
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-2">Next sheet will scan automatically...</p>
              </div>
            </div>
          )}

          {/* Scanning status bar */}
          {!processing && !lastResult && cameraActive && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-4">
              <div className="flex items-center justify-between">
                <p className="text-white text-sm font-medium">
                  {qrDetected ? '📋 Sheet found!' : '📷 Point at an answer sheet...'}
                </p>
                <button
                  onClick={manualCapture}
                  className="bg-white/20 backdrop-blur text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/30 transition-colors"
                >
                  Manual Capture
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Camera error */}
      {cameraError && (
        <div className="card bg-red-50 border-red-200 text-center py-8">
          <CameraOff className="w-12 h-12 text-red-300 mx-auto mb-3" />
          <p className="font-medium text-red-700 mb-3">{cameraError}</p>
          <button onClick={startCamera} className="btn-primary">
            Try Again
          </button>
        </div>
      )}

      {/* Camera controls */}
      {cameraActive && (
        <div className="flex gap-2">
          <button onClick={stopCamera} className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <CameraOff className="w-4 h-4" /> Stop Camera
          </button>
          <button
            onClick={() => { setScannedCodes(new Set()); toast.success('Duplicate filter cleared'); }}
            className="btn-secondary text-xs px-3"
          >
            Reset Filter
          </button>
        </div>
      )}

      {/* Stats bar */}
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

      {/* Scanned students list */}
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
