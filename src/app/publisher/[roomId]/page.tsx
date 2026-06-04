"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import io, { Socket } from "socket.io-client";
import { 
  Play, 
  Square, 
  Copy, 
  Check, 
  ArrowLeft, 
  RefreshCw, 
  Terminal as TerminalIcon,
  HelpCircle,
  Link,
  Laptop
} from "lucide-react";

interface PageProps {
  params: Promise<{ roomId: string }>;
}

interface LogEntry {
  time: string;
  type: "info" | "success" | "error" | "warn";
  text: string;
}

export default function PublisherPage({ params }: PageProps) {
  const { roomId } = use(params);
  const router = useRouter();
  const cleanRoomId = roomId.toUpperCase();

  // State variables
  const [socketConnected, setSocketConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [subscriberOnline, setSubscriberOnline] = useState(false);
  const [aiStatus, setAiStatus] = useState("idle"); // idle | solving | error
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Refs for video, canvas & socket
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const highResCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<any>(null);
  const imageCaptureRef = useRef<any>(null);

  const startKeepAliveAudio = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0; // Completely silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      audioCtxRef.current = ctx;
      addLog("Arka plan uyku önleyici ses dalgası aktif edildi.", "info");
    } catch (e: any) {
      console.error("Keep-alive audio failed", e);
    }
  };

  const stopKeepAliveAudio = () => {
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }
  };

  // Helper to add logs to the console simulator
  const addLog = (text: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, type, text }, ...prev].slice(0, 50)); // Keep last 50
  };

  // Helper to get socket connection URL
  const getSocketUrl = () => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("ghost_ai_server_url");
      const isLocalhost = window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1");
      const isPoisoned = saved && (
        saved.includes("vercel.app") || 
        (saved.includes(window.location.hostname) && !isLocalhost)
      );
      if (saved && !isPoisoned) return saved;
      if (isPoisoned) {
        window.localStorage.removeItem("ghost_ai_server_url");
      }
    }
    if (process.env.NEXT_PUBLIC_SOCKET_URL) {
      return process.env.NEXT_PUBLIC_SOCKET_URL;
    }
    if (typeof window !== "undefined") {
      const isLocalhost = window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1");
      return isLocalhost ? `http://${window.location.hostname}:3001` : "http://localhost:3001";
    }
    return "http://localhost:3001";
  };

  // Handle socket.io connection
  useEffect(() => {
    const socketUrl = getSocketUrl();
    addLog(`Sunucu bağlantısı başlatılıyor: ${socketUrl}`, "info");

    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      addLog("Sunucuya başarıyla bağlanıldı.", "success");
      socket.emit("join_room", { roomId: cleanRoomId, role: "publisher" });
    });

    socket.on("connect_error", () => {
      addLog("Sunucu bağlantı hatası. Backend açık mı?", "error");
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
      addLog("Sunucu bağlantısı kesildi.", "warn");
    });

    socket.on("publisher_status", ({ online }) => {
      // Not relevant for publisher itself, but can keep sync
    });

    socket.on("request_capture", () => {
      addLog("Mobil cihazdan ekran çözme talebi alındı. Çözüm başlatılıyor...", "info");
      captureAndSendFrame();
    });

    socket.on("room_joined", ({ roomId: joinedRoom, role }) => {
      addLog(`Odaya katılma başarılı: ${joinedRoom} (${role})`, "success");
    });

    socket.on("new_answer", (data) => {
      if (data.error) {
        setAiStatus("error");
        addLog(`AI Hata Bildirdi: ${data.error}`, "error");
      } else {
        setAiStatus("idle");
        addLog(`AI Cevabı Alındı: ${data.answer.substring(0, 30)}...`, "success");
      }
    });

    socket.on("status_update", ({ status, message }) => {
      if (status === "solving") {
        setAiStatus("solving");
        addLog(`AI Çözümleme İşlemi: ${message}`, "info");
      } else if (status === "idle") {
        setAiStatus("idle");
      }
    });

    // Simple listener to detect if subscribers join our room
    socket.on("subscriber_joined", () => {
      setSubscriberOnline(true);
      addLog("İzleyici (telefon) odaya giriş yaptı.", "success");
    });

    socket.on("subscriber_left", () => {
      setSubscriberOnline(false);
      addLog("İzleyici (telefon) odadan ayrıldı.", "warn");
    });

    return () => {
      socket.disconnect();
      stopSharing();
    };
  }, [cleanRoomId]);

  // Copy mobile link to clipboard
  const copyMobileLink = () => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/subscriber/${cleanRoomId}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      addLog(`İzleyici linki kopyalandı: ${url}`, "info");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Screen sharing logic
  const startSharing = async () => {
    try {
      addLog("Ekran yakalama izni isteniyor...", "info");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 5 }
        },
        audio: false
      });

      streamRef.current = stream;
      setIsSharing(true);
      startKeepAliveAudio();
      
      const videoTrack = stream.getVideoTracks()[0];
      const ImageCaptureClass = (window as any).ImageCapture;
      if (ImageCaptureClass) {
        imageCaptureRef.current = new ImageCaptureClass(videoTrack);
        addLog("Arka plan görsel yakalayıcı (ImageCapture) aktif edildi.", "info");
      }

      addLog("Ekran paylaşımı başarıyla başlatıldı.", "success");

      // Handle stream end (user clicks "Stop sharing" native chrome banner)
      videoTrack.onended = () => {
        stopSharing();
      };

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play()
          .catch((err) => {
            addLog(`Görüntü başlatılamadı: ${err.message}`, "error");
          });
      }
    } catch (err: any) {
      addLog(`Ekran paylaşımı başlatılamadı: ${err.message}`, "error");
      setIsSharing(false);
    }
  };

  const stopSharing = () => {
    stopKeepAliveAudio();
    imageCaptureRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsSharing(false);
    addLog("Ekran paylaşımı durduruldu.", "warn");
  };

  // Capture screen and send to AI
  const captureAndSendFrame = async () => {
    try {
      const video = videoRef.current;
      const highResCanvas = highResCanvasRef.current;

      const isVideoActive = video && video.srcObject !== null;
      if (!video || !highResCanvas || !isVideoActive) {
        addLog("Hata: Video yayını veya kanvas aktif değil.", "error");
        return;
      }

      const highResCtx = highResCanvas.getContext("2d");
      if (!highResCtx) {
        addLog("Kanvas context alınamadı.", "error");
        return;
      }

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        addLog("Görüntü boyutları yükleniyor, lütfen tekrar deneyin.", "warn");
        return;
      }

      highResCanvas.width = video.videoWidth;
      highResCanvas.height = video.videoHeight;

      let drawSuccess = false;
      if (imageCaptureRef.current) {
        try {
          const imageBitmap = await imageCaptureRef.current.grabFrame();
          highResCtx.drawImage(imageBitmap, 0, 0, highResCanvas.width, highResCanvas.height);
          imageBitmap.close();
          drawSuccess = true;
        } catch (captureErr) {
          // Fallback to video drawing if grabFrame fails
        }
      }

      if (!drawSuccess) {
        highResCtx.drawImage(video, 0, 0, highResCanvas.width, highResCanvas.height);
      }

      addLog("Ekran görüntüsü başarıyla alındı. AI'a iletiliyor...", "info");
      sendFrameToAI(highResCanvas);
    } catch (err: any) {
      addLog(`Ekran yakalamada hata: ${err.message}`, "error");
    }
  };

  const sendFrameToAI = (canvas: HTMLCanvasElement) => {
    if (!socketRef.current || !socketRef.current.connected) {
      addLog("Frame gönderilemedi: Socket bağlı değil.", "error");
      return;
    }

    try {
      // Convert high-res canvas to compressed jpeg base64
      const base64Image = canvas.toDataURL("image/jpeg", 0.85);
      socketRef.current.emit("new_frame", { roomId: cleanRoomId, image: base64Image });
      addLog("Ekran karesi AI'a gönderildi.", "info");
    } catch (err: any) {
      addLog(`Görüntü dönüştürme/gönderme hatası: ${err.message}`, "error");
    }
  };

  return (
    <main className="min-h-screen bg-[#08070b] text-[#f4f4f7] flex flex-col p-6 select-none relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-8 z-10">
        <button
          onClick={() => {
            stopSharing();
            router.push("/");
          }}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} /> Geri Dön
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-2.5 w-2.5 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${socketConnected ? "bg-emerald-400" : "bg-red-400"}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${socketConnected ? "bg-emerald-500" : "bg-red-500"}`}></span>
          </span>
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
            {socketConnected ? "Sunucu Bağlı" : "Bağlantı Kesik"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-grow z-10 max-w-7xl w-full mx-auto">
        {/* Left Side: Controller Panel */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl p-6 border border-white/5 space-y-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
            <div>
              <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-widest pl-0.5">Yayıncı Odası</h2>
              <h3 className="text-3xl font-extrabold tracking-tight mt-1 text-white">Ghost Console</h3>
            </div>

            {/* Room Code Showcase */}
            <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-1.5">
              <span className="text-xs text-zinc-500 font-medium">ODA KODU</span>
              <span className="text-4xl font-mono font-bold tracking-[0.2em] text-violet-400 pl-[0.2em]">
                {cleanRoomId}
              </span>
              <button
                onClick={copyMobileLink}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 text-zinc-400 hover:text-white text-xs transition-all duration-200"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copied ? "Kopyalandı!" : "Telefon Bağlantı Linki"}</span>
              </button>
            </div>

            {/* Controls */}
            <div className="space-y-3">
              {!isSharing ? (
                <button
                  onClick={startSharing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/10 transition-all duration-200 hover:scale-[1.01]"
                >
                  <Play size={16} />
                  <span>Yayını Başlat (Ekran Paylaş)</span>
                </button>
              ) : (
                <button
                  onClick={stopSharing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold bg-red-950/50 border border-red-500/20 hover:border-red-500/40 text-red-300 transition-all duration-200"
                >
                  <Square size={16} />
                  <span>Yayını Durdur</span>
                </button>
              )}

              <button
                onClick={captureAndSendFrame}
                disabled={!isSharing}
                className={`w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold transition-all duration-200 ${
                  isSharing
                    ? "bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
                    : "bg-zinc-900/20 border border-zinc-800/30 text-zinc-600 cursor-not-allowed"
                }`}
              >
                <RefreshCw size={16} className={aiStatus === "solving" ? "animate-spin" : ""} />
                <span>Ekranı Şimdi Çöz (Manuel)</span>
              </button>
            </div>
          </div>

          {/* Sync status card */}
          <div className="glass-panel rounded-2xl p-5 border border-white/5 space-y-4">
            <h4 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider pl-0.5">Durum Tablosu</h4>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-900/50">
                <span className="text-zinc-500">Ekran Yakalama</span>
                <span className={`font-semibold ${isSharing ? "text-emerald-400" : "text-zinc-500"}`}>
                  {isSharing ? "Aktif" : "Kapalı"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-900/50">
                <span className="text-zinc-500">Mobil Cihaz</span>
                <span className={`font-semibold ${subscriberOnline ? "text-emerald-400" : "text-zinc-500"}`}>
                  {subscriberOnline ? "Bağlandı" : "Bekleniyor..."}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-zinc-500">AI Durumu</span>
                <span className={`font-semibold ${
                  aiStatus === "solving" ? "text-amber-400" : aiStatus === "error" ? "text-red-400" : "text-zinc-400"
                }`}>
                  {aiStatus === "solving" ? "Çözümleniyor..." : aiStatus === "error" ? "Hata Oluştu" : "Boşta"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Stream Preview & Logs Terminal */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Stream Preview Card */}
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-xl flex-grow flex flex-col min-h-[300px]">
            <div className="px-6 py-4 border-b border-zinc-900 bg-zinc-950/20 flex items-center gap-2">
              <Laptop size={16} className="text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-300">Ekran Akışı Önizleme</h3>
            </div>
            
            <div className="relative flex-grow flex items-center justify-center bg-zinc-950/40 p-4">
              {!isSharing && (
                <div className="text-center space-y-2 p-8 max-w-sm">
                  <div className="inline-flex p-3 rounded-full bg-zinc-900 text-zinc-500 mb-2">
                    <Laptop size={24} />
                  </div>
                  <h4 className="text-zinc-300 text-sm font-semibold">Aktif Akış Bulunmamaktadır</h4>
                  <p className="text-zinc-500 text-xs">
                    Ekran yakalamayı başlattığınızda, AI'a gönderilen ekranın canlı görüntüsü burada görüntülenecektir.
                  </p>
                </div>
              )}

              {/* Secret HTML5 video element for capture */}
              <video 
                ref={videoRef} 
                className={`max-w-full max-h-[400px] rounded-lg border border-zinc-800 ${isSharing ? "block" : "hidden"}`}
                muted 
                playsInline
              />

              {/* Hidden diff comparison canvases */}
              <canvas ref={highResCanvasRef} width={1280} height={720} className="hidden" />
            </div>
          </div>

          {/* Logs Console Terminal */}
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-xl h-[240px] flex flex-col">
            <div className="px-6 py-3 border-b border-zinc-900 bg-zinc-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TerminalIcon size={16} className="text-violet-400" />
                <h3 className="text-sm font-semibold text-zinc-300">Ghost Console Logs</h3>
              </div>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase font-bold tracking-wider"
              >
                Konsolu Temizle
              </button>
            </div>
            <div className="p-4 font-mono text-[11px] overflow-y-auto flex-grow flex flex-col-reverse gap-1 bg-zinc-950/30">
              {logs.length === 0 ? (
                <div className="text-zinc-600 text-center my-auto">Log kaydı bulunmamaktadır.</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="flex gap-2.5 leading-relaxed">
                    <span className="text-zinc-600 select-none">[{log.time}]</span>
                    <span className={
                      log.type === "success" ? "text-emerald-400" :
                      log.type === "error" ? "text-red-400" :
                      log.type === "warn" ? "text-amber-400" : "text-zinc-400"
                    }>
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
