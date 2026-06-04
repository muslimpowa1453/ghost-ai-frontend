"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Monitor, 
  Smartphone, 
  ArrowRight, 
  Activity, 
  Settings, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  LogIn,
  Users,
  Tv
} from "lucide-react";

interface ActiveRoom {
  roomId: string;
  hasSubscriber: boolean;
  subscriberCount: number;
}

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  
  // Settings & Active Rooms State
  const [serverUrl, setServerUrl] = useState("http://localhost:3001");
  const [showSettings, setShowSettings] = useState(false);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [serverOnline, setServerOnline] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Initialize and check for URL parameters (e.g. ?server=https://...)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const queryServer = params.get("server");
      
      let resolvedUrl = "";
      if (queryServer) {
        resolvedUrl = queryServer.trim().replace(/\/$/, "");
        window.localStorage.setItem("ghost_ai_server_url", resolvedUrl);
        setServerUrl(resolvedUrl);
      } else {
        const savedUrl = window.localStorage.getItem("ghost_ai_server_url");
        const isLocalhost = window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1");
        const isPoisoned = savedUrl && (
          savedUrl.includes("vercel.app") || 
          (savedUrl.includes(window.location.hostname) && !isLocalhost)
        );

        if (isPoisoned) {
          window.localStorage.removeItem("ghost_ai_server_url");
        }

        if (savedUrl && !isPoisoned) {
          resolvedUrl = savedUrl;
          setServerUrl(savedUrl);
        } else if (process.env.NEXT_PUBLIC_SOCKET_URL) {
          resolvedUrl = process.env.NEXT_PUBLIC_SOCKET_URL.trim().replace(/\/$/, "");
          setServerUrl(resolvedUrl);
          window.localStorage.setItem("ghost_ai_server_url", resolvedUrl);
        } else {
          // If on localhost, default to localhost:3001. If on production (Vercel), default to http://localhost:3001 but do not save to localStorage
          resolvedUrl = isLocalhost ? `http://${window.location.hostname}:3001` : "http://localhost:3001";
          setServerUrl(resolvedUrl);
          if (isLocalhost) {
            window.localStorage.setItem("ghost_ai_server_url", resolvedUrl);
          }
        }
      }
      fetchActiveRooms(resolvedUrl);
    }
  }, []);

  // Fetch active rooms from server
  const fetchActiveRooms = async (currentUrl: string) => {
    if (!currentUrl) return;
    setLoadingRooms(true);
    try {
      const res = await fetch(`${currentUrl}/api/rooms`, {
        signal: AbortSignal.timeout(3000) // 3s timeout
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRooms(data.rooms || []);
        setServerOnline(true);
      } else {
        setServerOnline(false);
      }
    } catch (err) {
      setServerOnline(false);
      setActiveRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  // Poll active rooms list
  useEffect(() => {
    fetchActiveRooms(serverUrl);
    const interval = setInterval(() => {
      fetchActiveRooms(serverUrl);
    }, 4000);
    return () => clearInterval(interval);
  }, [serverUrl]);

  // Handle server URL save
  const handleSaveSettings = (newUrl: string) => {
    const cleanUrl = newUrl.trim().replace(/\/$/, ""); // Remove trailing slash
    setServerUrl(cleanUrl);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ghost_ai_server_url", cleanUrl);
    }
    fetchActiveRooms(cleanUrl);
  };

  // Helper to generate a random 6-character room code
  const generateRoomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleHost = () => {
    const newCode = generateRoomCode();
    router.push(`/publisher/${newCode}`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setError("Oda kodu 6 haneli olmalıdır.");
      return;
    }
    setError("");
    router.push(`/subscriber/${cleanCode}`);
  };

  const joinRoomDirect = (code: string) => {
    router.push(`/subscriber/${code}`);
  };

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-6 bg-[#08070b] text-[#f4f4f7] overflow-hidden select-none">
      {/* Background Neon Blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-violet-600/10 blur-[100px] animate-pulse-glow pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-pink-500/10 blur-[100px] animate-pulse-glow pointer-events-none" style={{ animationDelay: "-4s" }} />

      {/* Top Bar: Connection & Settings */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-20 max-w-lg mx-auto w-[calc(100%-3rem)]">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${serverOnline ? "bg-emerald-400" : "bg-red-400"}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${serverOnline ? "bg-emerald-500" : "bg-red-500"}`}></span>
          </span>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
            {serverOnline ? "Sunucu Aktif" : "Sunucu Çevrimdışı"}
          </span>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-xl border border-zinc-800/80 bg-zinc-900/30 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all duration-200 ${
            showSettings ? "bg-zinc-800 text-white" : ""
          }`}
        >
          <Settings size={16} />
        </button>
      </div>

      <div className="w-full max-w-md z-10 space-y-6 text-center mt-8">
        
        {/* Settings Panel */}
        {showSettings && (
          <div className="glass-panel rounded-2xl p-5 border border-white/5 space-y-3 text-left shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
            <h4 className="text-zinc-300 text-xs font-bold uppercase tracking-wider pl-0.5">Sunucu Konfigürasyonu</h4>
            <div className="space-y-2">
              <label className="block text-[10px] font-medium text-zinc-500 pl-0.5">
                Backend Server URL (Render, Railway veya Localhost)
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => handleSaveSettings(e.target.value)}
                placeholder="Örn: http://localhost:3001"
                className="w-full font-mono text-xs py-2 px-3 rounded-lg bg-zinc-950/80 border border-zinc-850 focus:border-violet-500/50 focus:outline-none text-zinc-300 placeholder:text-zinc-600 transition-all"
              />
            </div>
            <p className="text-[10px] text-zinc-500 leading-normal pl-0.5">
              * Farklı ağlardan (örn. 4G/kablolu) bağlanabilmek için backend sunucusunun adresini buraya girmelisiniz veya parametre olarak (`?server=https://...`) açmalısınız.
            </p>
          </div>
        )}

        {/* Logo and Header */}
        <div className="space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-1">
            <Activity size={12} className="animate-pulse" /> Live Screen Solver
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 drop-shadow-[0_0_30px_rgba(168,85,247,0.2)]">
            Ghost AI
          </h1>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
            Masaüstü ekranındaki soruları yapay zekaya okutun, cevapları anlık olarak mobil cihazınızdan takip edin.
          </p>
        </div>

        {/* Active Lobby Sessions Panel - Chess style (Primary Focus for Mobile) */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5 text-left shadow-xl space-y-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tv size={14} className="text-violet-400" />
              <h4 className="text-zinc-300 text-xs font-bold uppercase tracking-wider">Aktif Oturum Lobisi</h4>
            </div>
            {loadingRooms ? (
              <RefreshCw size={12} className="animate-spin text-zinc-500" />
            ) : (
              <button 
                onClick={() => fetchActiveRooms(serverUrl)} 
                className="text-[10px] text-zinc-500 hover:text-zinc-300 font-semibold transition-colors flex items-center gap-1"
              >
                <RefreshCw size={10} /> Yenile
              </button>
            )}
          </div>

          <div className="space-y-2 pt-1">
            {!serverOnline ? (
              <div className="text-center py-6 bg-zinc-950/40 rounded-xl border border-zinc-900/60 text-zinc-500 text-xs px-4 leading-relaxed">
                Sunucu bağlantısı kurulamadığından açık oturumlar listelenemiyor. Sağ üstten sunucu adresini doğrulayın.
              </div>
            ) : activeRooms.length === 0 ? (
              <div className="text-center py-8 bg-zinc-950/40 rounded-xl border border-zinc-900/60 text-zinc-500 text-xs px-4 leading-relaxed">
                <span className="block text-zinc-400 font-medium mb-1">Aktif yayın odası bulunmuyor.</span>
                Bilgisayarınızdan yeni bir oturum başlattığınızda burada listelenecektir.
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto space-y-2.5 pr-1">
                {activeRooms.map((room) => (
                  <div
                    key={room.roomId}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-850 bg-zinc-950/50 hover:border-violet-500/30 hover:bg-zinc-950 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </div>
                      
                      <div className="flex flex-col gap-0.5">
                        <span className="text-base font-mono font-bold tracking-[0.15em] text-white">
                          {room.roomId}
                        </span>
                        <span className="text-[10px] text-zinc-500 flex items-center gap-1.5 font-medium">
                          <Users size={10} /> İzleyici: {room.subscriberCount}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => joinRoomDirect(room.roomId)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all duration-150 shadow-lg shadow-violet-600/10 hover:shadow-violet-600/30 hover:scale-[1.03] active:scale-[0.97]"
                    >
                      <LogIn size={13} />
                      <span>Katıl</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Console / Host Panel */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5 space-y-4 shadow-2xl relative overflow-hidden">
          <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-wider text-left pl-0.5">PC / Yayıncı Paneli</h4>
          <button
            onClick={handleHost}
            className="w-full group relative flex items-center justify-center gap-3 py-3.5 px-5 rounded-xl font-semibold bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all duration-150"
          >
            <Monitor size={18} className="group-hover:rotate-6 transition-transform" />
            <span>Yeni Oturum Başlat (PC)</span>
            <ArrowRight size={16} className="absolute right-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
          </button>
        </div>

        {/* Manual Join Panel (Fallback) */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5 text-left shadow-xl space-y-3">
          <details className="group cursor-pointer select-none">
            <summary className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest flex items-center justify-between list-none">
              <span>Manuel Oda Kodu Bağlantısı</span>
              <span className="transition-transform group-open:rotate-180 text-zinc-400 font-bold">&#9662;</span>
            </summary>
            
            <form onSubmit={handleJoin} className="space-y-3 pt-3">
              <div className="space-y-2">
                <input
                  type="text"
                  maxLength={6}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="6 Haneli Oda Kodu"
                  className="w-full text-center tracking-[0.25em] font-mono text-base py-2.5 px-4 rounded-xl bg-zinc-950/50 border border-zinc-800 focus:border-violet-500/50 focus:outline-none text-[#f4f4f7] placeholder:text-zinc-600 transition-all"
                />
                {error && <p className="text-red-400 text-[11px] text-left pl-1">{error}</p>}
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-5 rounded-xl font-semibold border border-zinc-800 bg-zinc-900/20 hover:bg-zinc-900/60 text-zinc-400 hover:text-white transition-all text-xs"
              >
                <Smartphone size={14} />
                <span>Koda Katıl</span>
              </button>
            </form>
          </details>
        </div>

        {/* Footer */}
        <p className="text-[9px] text-zinc-600 tracking-wider">
          GHOST AI &copy; {new Date().getFullYear()} &bull; Real-time AI Assistant
        </p>
      </div>
    </main>
  );
}
