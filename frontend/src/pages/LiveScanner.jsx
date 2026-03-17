import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { scanAPI, testsAPI } from '../services/api';
import Spinner from '../components/Spinner';
import jsQR from 'jsqr';
import {
  ArrowLeft, Camera, CameraOff, CheckCircle2, XCircle, AlertTriangle,
  Users, Volume2, VolumeX, Zap, ZapOff,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ── Tuning constants ─────────────────────────────────────────── */
const QR_STABLE_COUNT = 3;   // consecutive identical QR reads before auto-capture
const RESULT_DISPLAY_MS = 2500; // show result overlay then auto-resume
const SCAN_FPS = 15;         // QR detection frames per second

export default function LiveScanner() {
  const { testId } = useParams();

  /* Refs */
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const imageCaptureRef = useRef(null);
  const rafRef = useRef(null);
  const lastQrRef = useRef(null);
  const stableCountRef = useRef(0);
  const busyRef = useRef(false);        // true while processing or showing result
  const audioCtxRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const processedQrCodesRef = useRef(new Set()); // prevent re-scanning same sheet

  /* State */
  const [test, setTest] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [qrDetected, setQrDetected] = useState(false); // green border indicator
  const [scannedStudents, setScannedStudents] = useState([]);
  const [error, setError] = useState(null);
  const [scanCount, setScanCount] = useState(0); // total successful scans

  /* ── Load test info ──────────────────────────────────────────── */
  useEffect(() => {
    testsAPI.get(testId).then((r) => setTest(r.data)).catch(() => setError('Test not found'));
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

  /* ── Torch toggle ────────────────────────────────────────────── */
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch { /* torch not supported */ }
  }, [torchOn]);

  /* ── Start camera ────────────────────────────────────────────── */
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 2560 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];

      // Request continuous autofocus
      try {
        const caps = track.getCapabilities?.();
        if (caps?.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
        // Check torch support
        if (caps?.torch) setTorchAvailable(true);
      } catch { /* constraints not supported */ }

      // Set up ImageCapture API if available (for high-res photo capture)
      if (typeof ImageCapture !== 'undefined') {
        imageCaptureRef.current = new ImageCapture(track);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setError(null);
    } catch {
      setError('Camera access denied. Please allow camera permission and try again.');
      setCameraActive(false);
    }
  }, []);

  /* ── Stop camera ─────────────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    imageCaptureRef.current = null;
    setCameraActive(false);
    setQrDetected(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  /* ── Cleanup on unmount ──────────────────────────────────────── */
  useEffect(() => {
    return () => {
      stopCamera();
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, [stopCamera]);

  /* ── Capture high-res image ──────────────────────────────────── */
  const captureHighRes = useCallback(async () => {
    // Try ImageCapture API first (full sensor resolution)
    if (imageCaptureRef.current) {
      try {
        const blob = await imageCaptureRef.current.takePhoto({ imageWidth: 2560 });
        return blob;
      } catch { /* fall through to canvas */ }
    }
    // Fallback: canvas capture from video
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  }, []);

  /* ── Process a detected sheet ────────────────────────────────── */
  const processSheet = useCallback(async (qrData) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setProcessing(true);
    setQrDetected(false);

    try {
      const blob = await captureHighRes();
      if (!blob) { busyRef.current = false; setProcessing(false); return; }

      const res = await scanAPI.scanLive(testId, blob, qrData);
      const data = res.data;

      playBeep(true);
      if (navigator.vibrate) navigator.vibrate(100);

      setLastResult(data);
      setScanCount((c) => c + 1);
      setScannedStudents((prev) => {
        if (data.student_code && prev.some((s) => s.student_code === data.student_code)) {
          return prev.map((s) =>
            s.student_code === data.student_code ? { ...data, time: new Date() } : s
          );
        }
        return [{ ...data, time: new Date() }, ...prev];
      });

      setProcessing(false);

      // Show result then auto-resume
      setTimeout(() => {
        setLastResult(null);
        lastQrRef.current = null;
        stableCountRef.current = 0;
        busyRef.current = false;
      }, RESULT_DISPLAY_MS);

    } catch (err) {
      const msg = err.response?.data?.detail || 'Scan failed';
      playBeep(false);
      toast.error(msg);
      setProcessing(false);
      // Brief pause before resuming scanning after error
      setTimeout(() => {
        lastQrRef.current = null;
        stableCountRef.current = 0;
        busyRef.current = false;
      }, 1500);
    }
  }, [testId, playBeep, captureHighRes]);

  /* ── QR scanning loop (requestAnimationFrame) ────────────────── */
  useEffect(() => {
    if (!cameraActive) return;

    const minInterval = 1000 / SCAN_FPS;

    const scanFrame = (timestamp) => {
      rafRef.current = requestAnimationFrame(scanFrame);

      // Throttle to SCAN_FPS
      if (timestamp - lastFrameTimeRef.current < minInterval) return;
      lastFrameTimeRef.current = timestamp;

      if (busyRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      // Use a smaller analysis canvas for faster QR detection
      const scale = Math.min(1, 800 / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });

      if (code && code.data) {
        setQrDetected(true);

        if (code.data === lastQrRef.current) {
          stableCountRef.current++;
          if (stableCountRef.current >= QR_STABLE_COUNT) {
            // Check if we already scanned this exact QR recently
            if (!processedQrCodesRef.current.has(code.data)) {
              processedQrCodesRef.current.add(code.data);
              // Clear old entries after 30s to allow re-scanning
              setTimeout(() => processedQrCodesRef.current.delete(code.data), 30000);
              processSheet(code.data);
            }
          }
        } else {
          lastQrRef.current = code.data;
          stableCountRef.current = 1;
        }
      } else {
        setQrDetected(false);
        lastQrRef.current = null;
        stableCountRef.current = 0;
      }
    };

    rafRef.current = requestAnimationFrame(scanFrame);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [cameraActive, processSheet]);

  /* ── Stats ───────────────────────────────────────────────────── */
  const totalScanned = scannedStudents.length;
  const avgScore = totalScanned > 0
    ? Math.round(scannedStudents.reduce((s, r) => s + r.percentage, 0) / totalScanned)
    : 0;

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="space-y-2">
      {/* Compact header */}
      <div className="flex items-center gap-3">
        <Link to={`/tests/${testId}`} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">Live Scanner</h1>
          <p className="text-xs text-gray-500 truncate">{test?.name || 'Loading...'}</p>
        </div>
        {totalScanned > 0 && (
          <span className="text-xs font-semibold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
            {totalScanned} scanned
          </span>
        )}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {soundEnabled
            ? <Volume2 className="w-4 h-4 text-gray-600" />
            : <VolumeX className="w-4 h-4 text-gray-400" />
          }
        </button>
      </div>

      {/* Camera view — full width, cancel layout padding */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden relative">
        <div
          className="relative bg-black flex items-center justify-center"
          style={{
            height: cameraActive ? 'calc(100vh - 120px)' : 'auto',
            minHeight: cameraActive ? 0 : 300,
          }}
        >
          {/* QR detection border – animated green glow */}
          {cameraActive && qrDetected && !processing && !lastResult && (
            <div
              className="absolute inset-0 z-20 pointer-events-none"
              style={{
                border: '4px solid #22c55e',
                boxShadow: '0 0 30px rgba(34, 197, 94, 0.5), inset 0 0 30px rgba(34, 197, 94, 0.15)',
                animation: 'pulse 0.8s ease-in-out infinite alternate',
              }}
            />
          )}

          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            style={{ display: cameraActive ? 'block' : 'none' }}
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Start screen */}
          {!cameraActive && (
            <div className="text-center p-8">
              <Camera className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">Point your camera at an answer sheet</p>
              <p className="text-gray-500 text-sm mb-6">
                Scanning is fully automatic — just hold the sheet steady
              </p>
              <button onClick={startCamera} className="btn-primary text-lg px-8 py-3">
                Start Scanning
              </button>
            </div>
          )}

          {/* Processing overlay */}
          {processing && (
            <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center">
              <div className="bg-white rounded-2xl p-6 text-center shadow-xl">
                <Spinner size="lg" className="mx-auto mb-3" />
                <p className="font-semibold text-gray-700">Processing...</p>
              </div>
            </div>
          )}

          {/* Result overlay */}
          {lastResult && !processing && (
            <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center">
              <div className="bg-white rounded-2xl p-6 text-center shadow-xl max-w-sm mx-4">
                <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${
                  lastResult.percentage >= 50 ? 'bg-emerald-100' : 'bg-red-100'
                }`}>
                  {lastResult.percentage >= 50
                    ? <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                    : <XCircle className="w-10 h-10 text-red-500" />
                  }
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {lastResult.student_name || lastResult.student_code || 'Unknown Student'}
                </p>
                <p className="text-3xl font-black text-brand-600 my-2">
                  {lastResult.score} / {lastResult.total}
                </p>
                <p className="text-gray-500">{lastResult.percentage}%</p>
                {lastResult.flagged_count > 0 && (
                  <p className="text-amber-600 text-sm mt-2 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {lastResult.flagged_count} answer(s) need review
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Scanning status indicator */}
          {cameraActive && !processing && !lastResult && (
            <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center pointer-events-none">
              <div className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                qrDetected
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-black/60 text-white/80'
              }`}>
                {qrDetected ? '✓ QR Code detected — hold steady...' : 'Point camera at answer sheet'}
              </div>
            </div>
          )}
        </div>

        {/* Top controls overlay */}
        {cameraActive && (
          <div className="absolute top-2 right-2 z-30 flex gap-2">
            {torchAvailable && (
              <button
                onClick={toggleTorch}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                  torchOn
                    ? 'bg-yellow-400/90 text-yellow-900'
                    : 'bg-black/50 text-white hover:bg-black/70'
                }`}
              >
                {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                {torchOn ? 'Light On' : 'Light'}
              </button>
            )}
            <button
              onClick={stopCamera}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-red-500/80 text-white text-sm hover:bg-red-600 transition-colors"
            >
              <CameraOff className="w-4 h-4" />
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card bg-red-50 border-red-200 text-red-700 flex items-center gap-3">
          <XCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
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
            <p className="text-2xl font-bold text-emerald-600">
              {scannedStudents.filter((s) => s.percentage >= 50).length}
            </p>
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

      {/* CSS animation for QR detection pulse */}
      <style>{`
        @keyframes pulse {
          from { box-shadow: 0 0 20px rgba(34,197,94,0.4), inset 0 0 20px rgba(34,197,94,0.1); }
          to   { box-shadow: 0 0 40px rgba(34,197,94,0.7), inset 0 0 40px rgba(34,197,94,0.2); }
        }
      `}</style>
    </div>
  );
}
