"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import io, { Socket } from "socket.io-client";
import { 
  ArrowLeft, 
  Smartphone, 
  Copy, 
  Check, 
  Loader2, 
  Wifi, 
  WifiOff, 
  HelpCircle,
  FileCode2,
  FileText,
  Camera
} from "lucide-react";

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default function SubscriberPage({ params }: PageProps) {
  const { roomId } = use(params);
  const router = useRouter();
  const cleanRoomId = roomId.toUpperCase();

  const [socketConnected, setSocketConnected] = useState(false);
  const [publisherOnline, setPublisherOnline] = useState(false);
  const [answer, setAnswer] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"idle" | "solving" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const triggerCapture = () => {
    if (status === "solving" || !publisherOnline) return;
    if (socketRef.current) {
      socketRef.current.emit("request_capture", { roomId: cleanRoomId });
    }
  };

  const socketRef = useRef<Socket | null>(null);

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

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      setError("");
      socket.emit("join_room", { roomId: cleanRoomId, role: "subscriber" });
    });

    socket.on("connect_error", () => {
      setSocketConnected(false);
      setError("Sunucuya bağlanılamadı. Lütfen sunucunun açık olduğundan emin olun.");
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    socket.on("room_joined", () => {
      setError("");
    });

    let offlineTimeout: NodeJS.Timeout | null = null;

    socket.on("publisher_status", ({ online }) => {
      if (online) {
        if (offlineTimeout) {
          clearTimeout(offlineTimeout);
          offlineTimeout = null;
        }
        setPublisherOnline(true);
      } else {
        // Wait 5 seconds before showing offline in case of temporary background sleep/reconnect
        if (!offlineTimeout) {
          offlineTimeout = setTimeout(() => {
            setPublisherOnline(false);
          }, 5000);
        }
      }
    });

    socket.on("new_answer", (data) => {
      setStatus("idle");
      if (data.error) {
        setStatus("error");
        setError(`Hata: ${data.error}`);
      } else {
        setAnswer(data.answer);
        setError("");
        // Vibrate phone if API is supported for alert
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      }
    });

    socket.on("status_update", ({ status: newStatus, message }) => {
      setStatus(newStatus);
      setStatusMessage(message);
      if (newStatus === "solving") {
        setError("");
      }
    });

    return () => {
      socket.disconnect();
      if (offlineTimeout) clearTimeout(offlineTimeout);
    };
  }, [cleanRoomId]);

  // Copy answer to clipboard
  const copyAnswer = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to analyze if the output is code
  const detectCode = (text: string) => {
    if (text.includes("```")) return true;
    const codeKeywords = [
      "def ", "function", "class ", "import ", "const ", "let ", "var ",
      "public class", "using System", "#include", "<html>", "&&", "||",
      "for (", "while (", "return ", "print(", "console.log", "=>"
    ];
    return codeKeywords.some(keyword => text.includes(keyword)) || text.includes("{") || text.includes("}") || text.includes(";");
  };

  // Extract content from markdown ticks if present
  const cleanContent = (text: string) => {
    if (!text) return "";
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      // Remove starting block
      cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "");
      // Remove ending block
      cleaned = cleaned.replace(/\n```$/, "");
    }
    return cleaned;
  };

  const isAnswerCode = detectCode(answer);
  const formattedAnswer = cleanContent(answer);

  return (
    <main className="min-h-screen bg-[#060508] text-[#f4f4f7] flex flex-col p-4 select-none relative overflow-hidden">
      {/* Dynamic Background Glows */}
      {status === "solving" && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-violet-600/10 blur-[80px] animate-pulse pointer-events-none" />
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-900 z-10">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-xs font-semibold"
        >
          <ArrowLeft size={14} /> Geri
        </button>

        <div className="flex items-center gap-1.5">
          <Smartphone size={14} className="text-violet-400" />
          <span className="font-mono text-sm font-bold tracking-widest text-zinc-300">
            ROOM: {cleanRoomId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {publisherOnline ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <Wifi size={10} /> PC AKTIF
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500 font-bold bg-zinc-950/30 px-2 py-0.5 rounded-full border border-zinc-800">
              <WifiOff size={10} /> PC BEKLENIYOR
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col items-center justify-between pt-4 pb-6 px-2 z-10 w-full max-w-lg mx-auto">
        {/* Error message */}
        {error && (
          <div className="w-full glass-panel border-red-500/10 bg-red-950/10 text-red-400 rounded-xl p-4 text-center text-xs leading-relaxed mb-4">
            {error}
          </div>
        )}

        {/* Dynamic Display of content or solving indicator */}
        <div className="w-full flex-grow flex flex-col justify-center items-center py-2">
          {status === "solving" ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-violet-400" size={32} />
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-widest animate-pulse">
                {statusMessage || "Çözümleniyor..."}
              </span>
            </div>
          ) : (
            <>
              {/* 1. Empty State */}
              {!answer && !error && (
                <div className="text-center space-y-2 p-6">
                  <div className="inline-flex p-3 rounded-full bg-zinc-950 border border-zinc-900 text-zinc-600 mb-2">
                    <Smartphone size={24} />
                  </div>
                  <h4 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Cevap Ekranı</h4>
                  <p className="text-zinc-600 text-xs max-w-[240px] mx-auto">
                    Ekrandaki soruyu çözmek için aşağıdaki kamera butonuna basın.
                  </p>
                </div>
              )}

              {/* 2. Short text / Option Answer - Huge Render (No Copy Button) */}
              {answer && !isAnswerCode && !error && (
                <div className="w-full flex flex-col items-center justify-center text-center space-y-4 py-2">
                  <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 bg-zinc-950/40 px-3 py-1 rounded-full border border-zinc-900">
                    <FileText size={10} className="text-violet-400" /> Nihai Cevap
                  </div>
                  
                  <h2 className="text-7xl md:text-9xl font-black tracking-tight text-white select-text break-words max-w-full drop-shadow-[0_0_35px_rgba(255,255,255,0.15)] leading-none px-2 py-4">
                    {formattedAnswer}
                  </h2>
                </div>
              )}

              {/* 3. Code Answer - Large and Readable (No Copy Button) */}
              {answer && isAnswerCode && !error && (
                <div className="w-full flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 bg-zinc-950/40 px-3 py-1 rounded-full border border-zinc-900">
                      <FileCode2 size={10} className="text-violet-400" /> Kod Çözümü
                    </div>
                  </div>

                  <div className="w-full rounded-2xl border border-zinc-850 bg-zinc-950/30 p-5 shadow-2xl relative">
                    <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-violet-500/25 to-transparent" />
                    <pre className="text-3xl sm:text-4xl font-black font-mono text-zinc-200 overflow-x-auto leading-normal select-text text-left whitespace-pre-wrap break-words max-h-[55vh] pr-1">
                      <code>{formattedAnswer}</code>
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Huge Camera Button at the bottom */}
        <div className="w-full pt-4 mt-auto">
          <button
            onClick={triggerCapture}
            disabled={status === "solving"}
            className={`w-full flex flex-col items-center justify-center gap-3 py-7 px-6 rounded-3xl border transition-all duration-300 ${
              status === "solving"
                ? "border-amber-500/30 bg-amber-950/20 text-amber-400 cursor-not-allowed"
                : "border-violet-500/30 bg-violet-950/10 hover:bg-violet-950/25 text-violet-400 hover:text-violet-300 shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:scale-[1.02] active:scale-[0.98]"
            }`}
          >
            {status === "solving" ? (
              <>
                <Loader2 className="animate-spin text-amber-400" size={44} />
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400 animate-pulse">
                  Ekran Analiz Ediliyor...
                </span>
              </>
            ) : (
              <>
                <Camera size={44} className="stroke-[1.5]" />
                <span className="text-xs font-extrabold uppercase tracking-widest">
                  Soruyu Çöz (Ekranı Çek)
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Connection warning */}
      {!socketConnected && (
        <div className="p-2 text-center text-[10px] text-zinc-600 tracking-wider">
          Sunucu bağlantısı aranıyor...
        </div>
      )}
    </main>
  );
}
