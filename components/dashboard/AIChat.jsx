"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import StockCard from "./StockCard";

export default function AIChat({ prices, news, signals, watchlist, portfolio, socialData, onWatchlistUpdate, onPortfolioUpdate }) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [activeStock, setActiveStock] = useState(null); // stock card above chat
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const voiceModeRef = useRef(false);
  const welcomeSent = useRef(false);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { if (!voiceMode) inputRef.current?.focus(); }, [voiceMode]);

  // ═══ WELCOME ═══
  useEffect(() => {
    if (welcomeSent.current) return;
    welcomeSent.current = true;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const h = portfolio?.length || 0;
    const w = watchlist?.length || 0;
    let text = `${greeting}, ${firstName}! `;
    if (h > 0) text += `You have ${h} stocks in your portfolio${w > 0 ? ` and ${w} on your watchlist` : ""}. What do you want to look at today?`;
    else text += `What stocks or crypto are you interested in? I can analyze anything for you.`;
    setMessages([{ role: "assistant", content: text }]);
  }, [firstName, portfolio, watchlist]);

  // ═══ VOICE SETTINGS ═══
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("stockpulse_settings") || "{}"); if (s.voiceEnabled === false) setVoiceEnabled(false); } catch {}
  }, []);

  // ═══ EXTRACT STOCK FROM AI RESPONSE ═══
  const extractStockFromActions = (actions, response) => {
    // Check for explicit show_stock action
    if (actions?.length > 0) {
      const showStock = actions.find((a) => a.type === "show_stock");
      if (showStock) {
        return {
          symbol: showStock.symbol,
          name: showStock.name,
          price: showStock.price || prices?.[showStock.symbol]?.price || 0,
          change: showStock.change,
          changePct: showStock.changePct,
          sector: showStock.sector,
          confidence: showStock.confidence,
          targetPrice: showStock.targetPrice,
          dividend: showStock.dividend,
          catalyst: showStock.catalyst,
        };
      }
      // Fallback to any action with a symbol
      const withSymbol = actions.find((a) => a.symbol);
      if (withSymbol) {
        const p = prices?.[withSymbol.symbol];
        return { symbol: withSymbol.symbol, name: withSymbol.name, price: p?.price || 0, sector: withSymbol.sector };
      }
    }
    return null;
  };

  // ═══ SPEECH SYNTHESIS ═══
  const speak = async (text) => {
    if (typeof window === "undefined" || !voiceEnabled) {
      if (voiceModeRef.current) startListening();
      return;
    }
    const clean = text.replace(/[→📊💼🔍🎙️●✓✗👁🔴♪📷🔥⚠️▲▼⭐]/g, "")
      .replace(/\$([A-Z]+)/g, "$1").replace(/\*\*/g, "")
      .replace(/\+/g, " plus ").replace(/-(\d)/g, " minus $1")
      .replace(/\n+/g, ". ").trim();
    if (!clean) { if (voiceModeRef.current) startListening(); return; }
    stopSpeaking();

    try {
      const res = await fetch("/api/ai/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }) });
      if (res.ok && res.headers.get("content-type")?.includes("audio")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.playbackRate = 1.15;
        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; if (voiceModeRef.current) setTimeout(startListening, 400); };
        audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; if (voiceModeRef.current) startListening(); };
        await audio.play();
        return;
      }
    } catch {}

    if (!window.speechSynthesis) { if (voiceModeRef.current) startListening(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.15; u.pitch = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const pref = voices.find((v) => v.name.includes("Daniel") || v.name.includes("Google UK English Male")) || voices.find((v) => v.lang.startsWith("en")) || voices[0];
    if (pref) u.voice = pref;
    u.onstart = () => setIsSpeaking(true);
    u.onend = () => { setIsSpeaking(false); if (voiceModeRef.current) setTimeout(startListening, 400); };
    u.onerror = () => { setIsSpeaking(false); if (voiceModeRef.current) startListening(); };
    window.speechSynthesis.speak(u);
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // ═══ SPEECH RECOGNITION ═══
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = "en-US";
    r.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInput(t);
      if (e.results[0].isFinal) { setIsRecording(false); setTimeout(() => submitMessage(t), 200); }
    };
    r.onerror = (e) => { setIsRecording(false); if (voiceModeRef.current && e.error === "no-speech") setTimeout(startListening, 500); };
    r.onend = () => setIsRecording(false);
    recognitionRef.current = r;
  }, []);

  const startListening = () => {
    if (!recognitionRef.current || isRecording || isSpeaking || loading) return;
    try { stopSpeaking(); setInput(""); recognitionRef.current.start(); setIsRecording(true); } catch {}
  };
  const stopListening = () => { if (recognitionRef.current && isRecording) { recognitionRef.current.stop(); setIsRecording(false); } };

  const toggleVoiceMode = () => {
    const n = !voiceMode; setVoiceMode(n); voiceModeRef.current = n;
    if (n) startListening(); else { stopListening(); stopSpeaking(); }
  };

  const tapMic = () => { if (voiceMode) toggleVoiceMode(); else if (isRecording) stopListening(); else startListening(); };

  // ═══ SUBMIT ═══
  const submitMessage = async (msg) => {
    const userMsg = msg || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = messages.slice(1).filter((m) => (m.role === "user" || m.role === "assistant") && !m.isError).slice(-20).map((m) => ({ role: m.role, content: m.content }));

      console.log("[StockPulse] Sending chat:", userMsg, "history:", history.length);

      const res = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history, prices, news: (news || []).slice(0, 15), signals, watchlist, portfolio, socialData }),
      });

      console.log("[StockPulse] Response status:", res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("[StockPulse] HTTP error:", res.status, errorText.slice(0, 200));
        setMessages((prev) => [...prev, { role: "assistant", content: `Error ${res.status}: ${res.statusText}. Check your API key and Vercel logs.`, isError: true }]);
        setLoading(false);
        if (voiceModeRef.current) setTimeout(startListening, 1000);
        return;
      }

      const data = await res.json();
      console.log("[StockPulse] Got response:", data.response?.slice(0, 80), "actions:", data.actions?.length || 0);

      if (data.response) {
        // Typewriter
        const words = data.response.split(" ");
        setMessages((prev) => [...prev, { role: "assistant", content: "", actions: data.actions, _typing: true }]);
        let cur = "";
        for (let i = 0; i < words.length; i++) {
          cur += (i ? " " : "") + words[i];
          const snap = cur;
          await new Promise((r) => setTimeout(r, 25));
          setMessages((prev) => { const u = [...prev]; const l = u[u.length - 1]; if (l?._typing) u[u.length - 1] = { ...l, content: snap }; return u; });
        }
        setMessages((prev) => { const u = [...prev]; const l = u[u.length - 1]; if (l?._typing) u[u.length - 1] = { ...l, _typing: false }; return u; });

        // Extract stock for card
        const stock = extractStockFromActions(data.actions, data.response);
        if (stock) setActiveStock(stock);

        speak(data.response);

        // Execute actions
        if (data.actions?.length > 0) {
          for (const a of data.actions) {
            if (a.type === "add_to_watchlist" || a.type === "monitor") {
              await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: a.symbol, name: a.name || a.symbol, sector: a.sector || "Unknown" }) });
            } else if (a.type === "remove_from_watchlist") {
              await fetch("/api/watchlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: a.symbol }) });
            } else if (a.type === "add_to_portfolio") {
              await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: a.symbol, shares: a.shares || 0, avg_cost: a.avg_cost || 0, name: a.name || a.symbol, sector: a.sector || "Unknown" }) });
              if (onPortfolioUpdate) onPortfolioUpdate();
            } else if (a.type === "remove_from_portfolio") {
              await fetch("/api/portfolio", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: a.symbol }) });
              if (onPortfolioUpdate) onPortfolioUpdate();
            } else if (a.type === "send_alert") {
              await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: a.symbol, message: a.message, urgency: a.urgency || "normal" }) });
            }
          }
          if (onWatchlistUpdate) onWatchlistUpdate();
        }
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Something went wrong.", isError: true }]);
        if (voiceModeRef.current) setTimeout(startListening, 1000);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection issue. Try again.", isError: true }]);
      if (voiceModeRef.current) setTimeout(startListening, 1000);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => { e.preventDefault(); submitMessage(); };
  const addStockToWatchlist = async () => {
    if (!activeStock) return;
    await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: activeStock.symbol, name: activeStock.name || activeStock.symbol, sector: activeStock.sector || "Unknown" }) });
    if (onWatchlistUpdate) onWatchlistUpdate();
  };

  // ═══ VOICE STATE ═══
  const voiceState = isSpeaking ? "speaking" : isRecording ? "listening" : loading ? "thinking" : voiceMode ? "ready" : "idle";

  // ═══ RENDER ═══
  return (
    <div className="space-y-4">
      {/* Active Stock Card — full width above chat */}
      {activeStock && (
        <StockCard
          symbol={activeStock.symbol}
          name={activeStock.name}
          price={activeStock.price || prices?.[activeStock.symbol]?.price}
          change={activeStock.change}
          changePct={activeStock.changePct}
          sector={activeStock.sector}
          confidence={activeStock.confidence}
          targetPrice={activeStock.targetPrice}
          dividend={activeStock.dividend}
          catalyst={activeStock.catalyst}
          onAddWatchlist={addStockToWatchlist}
          onDismiss={() => setActiveStock(null)}
        />
      )}

      {/* Main Voice/Chat Interface */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(6,182,212,0.08) 50%, rgba(59,130,246,0.06) 100%)" }}>

        {/* Animated border glow */}
        <div className={`absolute inset-0 rounded-2xl transition-all duration-700 pointer-events-none ${
          voiceState === "listening" ? "shadow-[inset_0_0_30px_rgba(239,68,68,0.15)]"
          : voiceState === "speaking" ? "shadow-[inset_0_0_30px_rgba(59,130,246,0.2)]"
          : voiceState === "thinking" ? "shadow-[inset_0_0_30px_rgba(168,85,247,0.15)]"
          : voiceMode ? "shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]"
          : ""
        }`} />

        {/* Gradient border */}
        <div className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            border: voiceMode
              ? `2px solid ${voiceState === "listening" ? "rgba(239,68,68,0.4)" : voiceState === "speaking" ? "rgba(59,130,246,0.5)" : voiceState === "thinking" ? "rgba(168,85,247,0.4)" : "rgba(59,130,246,0.25)"}`
              : "1px solid rgba(59,130,246,0.15)",
            transition: "all 0.5s ease",
          }} />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                voiceState === "listening" ? "bg-red-500 shadow-lg shadow-red-500/30"
                : voiceState === "speaking" ? "bg-blue-500 shadow-lg shadow-blue-500/30 animate-pulse"
                : voiceState === "thinking" ? "bg-purple-500 shadow-lg shadow-purple-500/30"
                : "bg-gradient-to-br from-blue-500 to-cyan-400"
              }`}>
                {voiceState === "thinking" ? (
                  <div className="flex gap-0.5">
                    <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: "100ms" }} />
                    <div className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: "200ms" }} />
                  </div>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  </svg>
                )}
              </div>
              <div>
                <span className="font-semibold text-sm">StockPulse AI</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    voiceState === "listening" ? "bg-red-500 animate-pulse"
                    : voiceState === "speaking" ? "bg-blue-500 animate-pulse"
                    : voiceState === "thinking" ? "bg-purple-500 animate-pulse"
                    : voiceMode ? "bg-blue-400" : "bg-emerald-500"
                  }`} />
                  <span className="text-[10px] text-muted-foreground">
                    {voiceState === "listening" ? "Listening..."
                    : voiceState === "speaking" ? "Speaking..."
                    : voiceState === "thinking" ? "Thinking..."
                    : voiceMode ? "Speak anytime" : `Ready, ${firstName}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTranscript(!showTranscript)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all ${showTranscript ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {showTranscript ? "Hide chat" : "Show chat"}
              </button>
              <button onClick={toggleVoiceMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  voiceMode ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-accent/80 text-muted-foreground hover:text-foreground"
                }`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                </svg>
                {voiceMode ? "End" : "Voice"}
              </button>
              <button onClick={() => { setVoiceEnabled(!voiceEnabled); if (isSpeaking) stopSpeaking(); }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${voiceEnabled ? "text-blue-400" : "text-muted-foreground"}`}>
                {voiceEnabled ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
                )}
              </button>
            </div>
          </div>

          {/* Voice Mode — centered waveform */}
          {voiceMode && (
            <div className="flex flex-col items-center py-8 px-6">
              {/* Waveform */}
              <div className="flex items-center justify-center gap-[3px] h-16 mb-4">
                {[...Array(28)].map((_, i) => {
                  const baseH = voiceState === "listening" || voiceState === "speaking" ? 32 : voiceState === "thinking" ? 16 : 4;
                  const variance = voiceState === "listening" || voiceState === "speaking" ? 28 : voiceState === "thinking" ? 12 : 0;
                  return (
                    <div key={i}
                      className={`w-[3px] rounded-full ${
                        voiceState === "listening" ? "bg-red-400" : voiceState === "speaking" ? "bg-blue-400" : voiceState === "thinking" ? "bg-purple-400" : "bg-blue-300/20"
                      }`}
                      style={{
                        height: `${baseH}px`,
                        animation: voiceState !== "idle" ? `waveBar 0.6s ease-in-out ${i * 40}ms infinite alternate` : "none",
                      }}
                    />
                  );
                })}
              </div>
              <style jsx>{`
                @keyframes waveBar {
                  0% { transform: scaleY(0.3); }
                  100% { transform: scaleY(1); }
                }
              `}</style>
              <p className="text-sm text-center text-muted-foreground max-w-md">
                {voiceState === "listening" ? <span className="text-red-400 font-medium">Listening...</span>
                : voiceState === "speaking" ? <span className="text-blue-400 font-medium">Speaking...</span>
                : voiceState === "thinking" ? <span className="text-purple-400 font-medium">Analyzing...</span>
                : "Say something like \"Tell me about NVDA\" or \"What should I buy?\""}
              </p>
              {messages.length > 1 && (
                <div className="mt-4 max-w-lg text-center">
                  <p className="text-xs text-muted-foreground/60 line-clamp-2">
                    {messages[messages.length - 1]?.content}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Text Input — always visible */}
          {!voiceMode && (
            <form onSubmit={handleSubmit} className="px-5 pb-4">
              <div className="flex items-center gap-2">
                <button type="button" onClick={tapMic}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all flex-shrink-0 ${
                    isRecording ? "bg-red-500 text-white animate-pulse" : "bg-accent/80 hover:bg-accent text-muted-foreground"
                  }`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
                <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={isRecording ? "Listening..." : `Ask about any stock or crypto, ${firstName}...`}
                  className={`flex-1 px-4 py-2.5 bg-background/80 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                    isRecording ? "border-red-500/50" : "border-border/50"
                  }`} disabled={loading} />
                <button type="submit" disabled={loading || !input.trim()}
                  className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 transition-all flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </form>
          )}

          {/* Transcript / Chat History */}
          {showTranscript && (
            <div className="border-t border-border/30 max-h-[400px] overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user" ? "bg-blue-500 text-white rounded-br-md"
                    : msg.isError ? "bg-red-500/10 text-red-400 rounded-bl-md"
                    : "bg-accent/80 rounded-bl-md"
                  }`}>
                    {msg.content}
                    {msg.actions?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                        {msg.actions.map((a, j) => (
                          <div key={j} className="flex items-center gap-2 text-[11px]">
                            <span className={`px-1.5 py-0.5 rounded font-mono font-bold ${a.type.includes("add") || a.type === "monitor" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                              {a.type === "add_to_watchlist" && "✓ Watchlist"}{a.type === "remove_from_watchlist" && "✗ Removed"}{a.type === "add_to_portfolio" && "✓ Portfolio"}
                              {a.type === "remove_from_portfolio" && "✗ Portfolio"}{a.type === "monitor" && "👁 Watch"}{a.type === "send_alert" && "📱 Alert"}
                            </span>
                            <span className="font-mono font-semibold">{a.symbol}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-accent/80 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Always show last message when transcript is hidden */}
          {!showTranscript && !voiceMode && messages.length > 0 && (
            <div className="px-5 pb-4">
              <div className="bg-accent/50 rounded-xl px-4 py-3">
                <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {messages[messages.length - 1]?.content}
                </p>
                {messages.length > 2 && (
                  <button onClick={() => setShowTranscript(true)} className="text-[10px] text-blue-400 font-semibold mt-2 hover:underline">
                    View full conversation →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
