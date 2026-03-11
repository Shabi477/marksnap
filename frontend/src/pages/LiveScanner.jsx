import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { scanAPI, testsAPI } from '../services/api';
import jsQR from 'jsqr';
import {
  ArrowLeft, Camera, CameraOff, CheckCircle2, XCircle, AlertTriangle,
  Users, Pause, Play, Volume2, VolumeX,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SCAN_INTERVAL = 150; // ms between QR detection attempts
const QR_STABLE_COUNT = 3; // frames QR must be stable before capture
const COOLDOWN_MS = 2000; // pause after processing before next scan

export default function LiveScanner() {
  const { testId } = useParams();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const lastQrRef = useRef(null);
  const stableCountRef = useRef(0);
  const cooldownRef = useRef(false);
  const audioCtxRef = useRef(null);

  const [test, setTest] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastResult, setLastResult] = useState(null);
  const [scannedStudents, setScannedStudents] = useState([]);
  const [error, setError] = useState(null);

  // Load test info
  useEffect(() => {
    testsAPI.get(testId).then((res) => setTest(res.data)).catch(() => setError('Test not found'));
  }, [testId]);

  // Beep sound
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

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setError(null);
    } catch (err) {
      setError('Camera access denied. Please allow camera permission and try again.');
      setCameraActive(false);
    }
  }, []);

  // Stop camera
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, [stopCamera]);

  // Capture frame as blob
  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return { ctx, width: canvas.width, height: canvas.height };
  }, []);

  // Process a detected sheet
  const processSheet = useCallback(async () => {
    if (processing || cooldownRef.current) return;
    setProcessing(true);

    const canvas = canvasRef.current;
    if (!canvas) { setProcessing(false); return; }

    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) { setProcessing(false); return; }

      const res = await scanAPI.scanLive(testId, blob);
      const data = res.data;

      playBeep(true);
      if (navigator.vibrate) navigator.vibrate(100);

      setLastResult(data);
      setScannedStudents((prev) => {
        // Don't add duplicate
        if (data.student_code && prev.some((s) => s.student_code === data.student_code)) {
          return prev.map((s) =>
            s.student_code === data.student_code ? { ...data, time: new Date() } : s
          );
        }
        return [{ ...data, time: new Date() }, ...prev];
      });

      // Cooldown before next scan
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
        lastQrRef.current = null;
        stableCountRef.current = 0;
        setLastResult(null);
      }, COOLDOWN_MS);

    } catch (err) {
      const msg = err.response?.data?.detail || 'Scan failed';
      playBeep(false);
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  }, [testId, processing, playBeep]);

  // QR scanning loop
  useEffect(() => {
    if (!cameraActive || paused) {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      return;
    }

    scanTimerRef.current = setInterval(() => {
      if (processing || cooldownRef.current) return;

      const frame = captureFrame();
      if (!frame) return;

      const imageData = frame.ctx.getImageData(0, 0, frame.width, frame.height);
      const code = jsQR(imageData.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });

      if (code && code.data) {
        if (code.data === lastQrRef.current) {
          stableCountRef.current++;
          if (stableCountRef.current >= QR_STABLE_COUNT) {
            processSheet();
          }
        } else {
          lastQrRef.current = code.data;
          stableCountRef.current = 1;
        }
      } else {
        lastQrRef.current = null;
        stableCountRef.current = 0;
      }
    }, SCAN_INTERVAL);

    return () => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, [cameraActive, paused, processing, captureFrame, processSheet]);

  // Stats
  const totalScanned = scannedStudents.length;
  const avgScore = totalScanned > 0
    ? Math.round(scannedStudents.reduce((s, r) => s + r.percentage, 0) / totalScanned)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={`/tests/${testId}`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="page-title">Live Scanner</h1>
          <p className="page-subtitle">{test?.name || 'Loading...'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title={soundEnabled ? 'Mute' : 'Unmute'}
          >
            {soundEnabled
              ? <Volume2 className="w-5 h-5 text-gray-600" />
              : <VolumeX className="w-5 h-5 text-gray-400" />
            }
          </button>
        </div>
      </div>

      {/* Camera view */}
      <div className="card p-0 overflow-hidden relative">
        <div className="relative bg-gray-900 aspect-video flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            style={{ display: cameraActive ? 'block' : 'none' }}
          />
          <canvas ref={canvasRef} className="hidden" />

          {!cameraActive && (
            <div className="text-center p-8">
              <Camera className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Camera not active</p>
              <button onClick={startCamera} className="btn-primary text-lg px-8 py-3">
                Start Camera
              </button>
            </div>
          )}

          {/* Processing overlay */}
          {processing && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="bg-white rounded-2xl p-6 text-center shadow-xl">
                <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="font-semibold text-gray-700">Processing...</p>
              </div>
            </div>
          )}

          {/* Result overlay */}
          {lastResult && !processing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-white rounded-2xl p-6 text-center shadow-xl max-w-sm mx-4 animate-in fade-in zoom-in duration-200">
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

          {/* Scanning guide overlay */}
          {cameraActive && !processing && !lastResult && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-8 border-2 border-white/30 rounded-xl" />
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <span className="bg-black/50 text-white text-sm px-4 py-2 rounded-full">
                  Point at answer sheet QR code
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Camera controls */}
        {cameraActive && (
          <div className="flex items-center justify-center gap-4 p-3 bg-gray-50 border-t">
            <button
              onClick={() => setPaused(!paused)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                paused
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={stopCamera}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              <CameraOff className="w-4 h-4" />
              Stop Camera
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
    </div>
  );
}
