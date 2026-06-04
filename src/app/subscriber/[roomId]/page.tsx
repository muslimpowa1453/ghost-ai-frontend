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
  Play,
  Pause
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
  const [showFullSolution, setShowFullSolution] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const togglePauseResume = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    if (socketRef.current) {
      socketRef.current.emit("toggle_pause", { roomId: cleanRoomId, paused: nextPaused });
    }
  };

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setShowFullSolution(false);
  }, [answer]);

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

    socket.on("publisher_status", ({ online }) => {
      setPublisherOnline(online);
    });

    socket.on("new_answer", (data) => {
      if (isPausedRef.current) return;
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
      if (isPausedRef.current) return;
      setStatus(newStatus);
      setStatusMessage(message);
      if (newStatus === "solving") {
        setError("");
      }
    });

    return () => {
      socket.disconnect();
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
      "for (", "while (", "return ", "print(", "console.log"
    ];
    const lines = text.split("\n");
    if (lines.length > 2) {
      return codeKeywords.some(keyword => text.includes(keyword)) || text.includes("{") || text.includes(";");
    }
    return false;
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

  // Parse CODE_TRACKER response
  const parseCodeTracker = (text: string) => {
    const lines = text.split("\n");
    let solution = "";
    let typed = "";
    let hasError = false;

    lines.forEach((line) => {
      if (line.startsWith("FULL_SOLUTION:")) {
        solution = line.slice("FULL_SOLUTION:".length);
      } else if (line.startsWith("TYPED:")) {
        typed = line.slice("TYPED:".length);
      } else if (line.startsWith("ERROR:")) {
        hasError = line.slice("ERROR:".length).trim().toLowerCase() === "true";
      }
    });

    return { solution, typed, hasError };
  };

  // Typing simulation tracker calculations for Code Answers
  const isCodeTracker = answer.includes("CODE_TRACKER");
  let targetCode = formattedAnswer || "";
  let userTyped = "";
  let apiHasError = false;

  if (isCodeTracker) {
    const parsed = parseCodeTracker(answer);
    targetCode = parsed.solution;
    userTyped = parsed.typed;
    apiHasError = parsed.hasError;
  }

  // Mismatch calculation (double safety check)
  let firstMismatchIndex = -1;
  for (let i = 0; i < userTyped.length; i++) {
    if (i >= targetCode.length || userTyped[i] !== targetCode[i]) {
      firstMismatchIndex = i;
      break;
    }
  }

  const hasError = apiHasError || firstMismatchIndex !== -1;
  const correctLen = (firstMismatchIndex !== -1) ? firstMismatchIndex : userTyped.length;

  const char1 = correctLen < targetCode.length ? targetCode[correctLen] : "";
  const char2 = correctLen + 1 < targetCode.length ? targetCode[correctLen + 1] : "";
  const char3 = correctLen + 2 < targetCode.length ? targetCode[correctLen + 2] : "";
  const char4 = correctLen + 3 < targetCode.length ? targetCode[correctLen + 3] : "";

  const renderCharBox = (char: string, isActive: boolean, isError: boolean) => {
    if (!char) {
      return (
        <div className="w-14 h-16 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/10 flex items-center justify-center text-zinc-750 text-xs font-mono">
          -
        </div>
      );
    }

    const isSpecial = char === " " || char === "\n" || char === "\t";
    const label = char === " " ? "SPC" : char === "\n" ? "ENT" : char === "\t" ? "TAB" : char;

    let boxClass = "w-14 h-16 rounded-xl border flex flex-col items-center justify-center font-mono transition-all duration-200 ";
    if (isActive) {
      if (isError) {
        boxClass += "border-red-500 bg-red-950/20 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-shake";
      } else {
        boxClass += "border-violet-500 bg-violet-950/20 text-violet-400 shadow-[0_0_15px_rgba(168,85,247,0.3)] scale-105";
      }
    } else {
      boxClass += "border-zinc-850 bg-zinc-950/40 text-zinc-650 opacity-60";
    }

    return (
      <div className={boxClass}>
        <span className={isSpecial ? "text-[10px] font-bold tracking-wider" : "text-2xl font-bold"}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#060508] text-[#f4f4f7] flex flex-col p-4 select-none relative overflow-hidden">
      {/* Permanent Pause/Resume button in the top right */}
      <button
        onClick={togglePauseResume}
        title={isPaused ? "Akışı Başlat" : "Akışı Durdur"}
        className={`fixed top-3.5 right-3.5 z-50 w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-300 ${
          isPaused
            ? "border-red-500 bg-red-950/40 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse"
            : "border-violet-500/40 bg-violet-950/20 text-violet-400 shadow-[0_0_15px_rgba(168,85,247,0.25)] hover:border-violet-400"
        }`}
      >
        {isPaused ? <Play size={20} /> : <Pause size={20} />}
      </button>

      {/* Dynamic Background Glows */}
      {status === "solving" && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-violet-600/10 blur-[80px] animate-pulse pointer-events-none" />
      )}

      {/* Header bar with padding right for the floating button */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-900 z-10 pr-16">
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

      {/* Main Content Area - Shifted to the very top */}
      <div className="flex-grow flex flex-col items-center justify-start pt-2 pb-6 px-2 z-10 w-full max-w-lg mx-auto">
        
        {/* Error message */}
        {error && (
          <div className="w-full glass-panel border-red-500/10 bg-red-950/10 text-red-400 rounded-xl p-4 text-center text-xs leading-relaxed mb-4">
            {error}
          </div>
        )}

        {/* Solving / Loading state */}
        {status === "solving" && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-violet-400" size={32} />
            <span className="text-zinc-500 text-xs font-semibold uppercase tracking-widest animate-pulse">
              {statusMessage || "Çözümleniyor..."}
            </span>
          </div>
        )}

        {/* Answer displays */}
        {status !== "solving" && !error && (
          <>
            {/* 1. Empty State */}
            {!answer && (
              <div className="text-center space-y-2 p-6">
                <div className="inline-flex p-3 rounded-full bg-zinc-950 border border-zinc-900 text-zinc-600 mb-2">
                  <Smartphone size={24} />
                </div>
                <h4 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Cevap Ekranı</h4>
                <p className="text-zinc-600 text-xs max-w-[240px] mx-auto">
                  Ekrandaki soru değiştiğinde, yapay zekanın cevabı anında bu ekrana yansıtılacaktır.
                </p>
              </div>
            )}

            {/* 2. Short text / Option Answer - Huge Render (No Copy Button) */}
            {answer && !isAnswerCode && (
              <div className="w-full flex flex-col items-center justify-start text-center space-y-8 py-8">
                <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 bg-zinc-950/40 px-3 py-1 rounded-full border border-zinc-900">
                  <FileText size={10} className="text-violet-400" /> Nihai Cevap
                </div>
                
                <h2 className="text-7xl md:text-9xl font-black tracking-tight text-white select-text break-words max-w-full drop-shadow-[0_0_35px_rgba(255,255,255,0.15)] leading-none px-2">
                  {formattedAnswer}
                </h2>
              </div>
            )}

            {/* 3. Code Answer View */}
            {answer && isAnswerCode && (
              <>
                {/* 3a. Display full code block if not in tracking mode or clicked "Show Full Solution" */}
                {(!isCodeTracker || showFullSolution) ? (
                  <div className="w-full flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 bg-zinc-950/40 px-3 py-1 rounded-full border border-zinc-900">
                        <FileCode2 size={10} className="text-violet-400" /> Tam Çözüm
                      </div>
                      {isCodeTracker && (
                        <button
                          onClick={() => setShowFullSolution(false)}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 font-bold uppercase tracking-wider underline transition-colors"
                        >
                          Takip Moduna Dön
                        </button>
                      )}
                    </div>

                    <div className="w-full rounded-2xl border border-zinc-850 bg-zinc-950/30 p-5 shadow-2xl relative">
                      <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-violet-500/25 to-transparent" />
                      <pre className="text-2xl font-bold font-mono text-zinc-200 overflow-x-auto leading-relaxed select-text text-left whitespace-pre-wrap break-all max-h-[75vh] pr-1">
                        <code>{targetCode}</code>
                      </pre>
                    </div>
                  </div>
                ) : (
                  /* 3b. Display 4-symbol tracker */
                  <div className="w-full flex flex-col space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 bg-zinc-950/40 px-3 py-1 rounded-full border border-zinc-900">
                        <FileCode2 size={10} className="text-violet-400" /> Kod Takip
                      </div>
                    </div>

                    <div className="w-full rounded-2xl border border-zinc-850 bg-zinc-950/30 p-6 flex flex-col items-center space-y-6 shadow-2xl relative">
                      <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-violet-500/25 to-transparent" />
                      
                      {/* The 4 boxes */}
                      <div className="flex items-center gap-3 justify-center py-2">
                        {renderCharBox(char1, true, hasError)}
                        {renderCharBox(char2, false, false)}
                        {renderCharBox(char3, false, false)}
                        {renderCharBox(char4, false, false)}
                      </div>

                      {/* Feedback of typed text from the PC screen */}
                      {userTyped && (
                        <div className="text-[10px] font-mono bg-zinc-950/60 px-3.5 py-2 rounded-xl border border-zinc-850 max-w-xs text-center leading-normal break-all">
                          <span className="text-zinc-500 uppercase font-bold tracking-wider mr-1.5">Ekrandaki:</span>
                          <span className="text-violet-400 font-semibold">{userTyped}</span>
                        </div>
                      )}

                      {/* Progress and show full solution toggle */}
                      <div className="w-full flex flex-col items-center gap-3 pt-2 border-t border-zinc-900/50">
                        <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                          Karakter: {correctLen} / {targetCode.length}
                        </div>
                        <button
                          onClick={() => setShowFullSolution(true)}
                          className="text-[10px] text-zinc-650 hover:text-zinc-400 font-bold uppercase tracking-wider underline transition-colors"
                        >
                          Tüm Çözümü Göster
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
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
