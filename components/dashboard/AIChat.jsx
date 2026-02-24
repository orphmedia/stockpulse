"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

export default function AIChat({ prices, news, signals, watchlist, portfolio, socialData, onWatchlistUpdate, onPortfolioUpdate, inline }) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const speakingSourceRef = useRef(null);
  const welcomeSent = useRef(false);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // ═══ WELCOME MESSAGE ═══
  useEffect(() => {
    if (welcomeSent.current) return;
    welcomeSent.current = true;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const holdingsCount = portfolio?.length || 0;
    const watchCount = watchlist?.length || 0;

    let welcomeText = `${greeting}, ${firstName}! I'm your StockPulse AI assistant. `;

    if (holdingsCount > 0 && watchCount > 0) {
      welcomeText += `You have ${holdingsCount} stocks in your portfolio and ${watchCount} on your watchlist. Ask me anything — how your portfolio is doing, what to buy, analysis on any stock, or just tell me to add something to your watchlist.`;
    } else if (holdingsCount > 0) {
      welcomeText += `You have ${holdingsCount} stocks in your portfolio. Ask me how they're doing, what to buy next, or tell me to watch a stock.`;
    } else {
      welcomeText += `Let's get started! Tell me what stocks you're interested in, and I'll help you build your watchlist and portfolio. Try saying "add NVDA to my watchlist" or "what's a good tech stock to buy?"`;
    }

    setMessages([{ role: "assistant", content: welcomeText }]);
  }, [firstName, portfolio, watchlist]);

  // ═══ VOICE SETTINGS ═══
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("stockpulse_settings") || "{}");
      if (s.voiceEnabled === false) setVoiceEnabled(false);
    } catch {}
  }, []);

  // ═══ SPEECH SYNTHESIS — ElevenLabs or browser fallback ═══
  const speak = async (text) => {
    if (typeof window === "undefined" || !voiceEnabled) return;

    const cleanText = text
      .replace(/[→📊💼🔍🎙️●✓✗👁🔴♪📷🔥⚠️▲▼⭐]/g, "")
      .replace(/\$([A-Z]+)/g, "$1")
      .replace(/\*\*/g, "")
      .replace(/\+/g, " plus ")
      .replace(/-(\d)/g, " minus $1")
      .replace(/\n+/g, ". ")
      .trim();

    if (!cleanText) return;
    stopSpeaking();

    try {
      const res = await fetch("/api/ai/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText }),
      });

      if (res.ok && res.headers.get("content-type")?.includes("audio")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
        audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; };
        await audio.play();
        return;
      }
    } catch {}

    // Fallback: browser voice
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => v.name.includes("Daniel") || v.name.includes("Google UK English Male"))
      || voices.find((v) => v.lang.startsWith("en")) || voices[0];
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; audioRef.current = null; }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // ═══ SPEECH RECOGNITION ═══
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((r) => r[0].transcript).join("");
      setInput(transcript);
      if (event.results[0].isFinal) {
        setIsRecording(false);
        setTimeout(() => submitMessage(transcript), 200);
      }
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      stopSpeaking();
      setInput("");
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  // ═══ SUBMIT MESSAGE ═══
  const submitMessage = async (msg) => {
    const userMsg = msg || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = messages
        .slice(1)
        .filter((m) => (m.role === "user" || m.role === "assistant") && !m.isError)
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history,
          prices,
          news: (news || []).slice(0, 15),
          signals, watchlist, portfolio, socialData,
        }),
      });
      const data = await res.json();

      if (data.response) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response, actions: data.actions }]);
        speak(data.response);

        if (data.actions?.length > 0) {
          for (const action of data.actions) {
            if (action.type === "add_to_watchlist" || action.type === "monitor") {
              await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: action.symbol, name: action.name || action.symbol, sector: action.sector || "Unknown" }) });
            } else if (action.type === "remove_from_watchlist") {
              await fetch("/api/watchlist", { method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: action.symbol }) });
            } else if (action.type === "add_to_portfolio") {
              await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: action.symbol, shares: action.shares || 0, avg_cost: action.avg_cost || action.price || 0, name: action.name || action.symbol, sector: action.sector || "Unknown" }) });
              if (onPortfolioUpdate) onPortfolioUpdate();
            } else if (action.type === "remove_from_portfolio") {
              await fetch("/api/portfolio", { method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: action.symbol }) });
              if (onPortfolioUpdate) onPortfolioUpdate();
            } else if (action.type === "send_alert") {
              await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: action.symbol, message: action.message, urgency: action.urgency || "normal" }) });
            }
          }
          if (onWatchlistUpdate) onWatchlistUpdate();
        }
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Something went wrong.", isError: true }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection issue. Try again.", isError: true }]);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => { e.preventDefault(); submitMessage(); };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: "520px", maxHeight: "75vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-gradient-to-r from-blue-600/10 to-cyan-500/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-sm">StockPulse AI</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? "bg-blue-500 animate-pulse" : isRecording ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
              <span className="text-[10px] text-muted-foreground">
                {isSpeaking ? "Speaking..." : isRecording ? "Listening..." : `Ready for you, ${firstName}`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => {
            const newVal = !voiceEnabled;
            setVoiceEnabled(newVal);
            if (isSpeaking) stopSpeaking();
            try { const s = JSON.parse(localStorage.getItem("stockpulse_settings") || "{}"); s.voiceEnabled = newVal; localStorage.setItem("stockpulse_settings", JSON.stringify(s)); } catch {}
          }}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${voiceEnabled ? "text-blue-400 hover:bg-blue-500/10" : "text-muted-foreground hover:bg-accent"}`}
            title={voiceEnabled ? "Voice on" : "Voice off"}>
            {voiceEnabled ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
            )}
          </button>
          {isSpeaking && (
            <button onClick={stopSpeaking} className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : msg.isError
                ? "bg-red-500/10 text-red-400 rounded-bl-md"
                : "bg-accent rounded-bl-md"
            }`}>
              {msg.content}
              {msg.actions?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
                  {msg.actions.map((action, j) => (
                    <div key={j} className="flex items-center gap-2 text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                        action.type.includes("add") || action.type === "monitor"
                          ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {action.type === "add_to_watchlist" && "✓ Watchlist"}
                        {action.type === "remove_from_watchlist" && "✗ Removed"}
                        {action.type === "add_to_portfolio" && "✓ Portfolio"}
                        {action.type === "remove_from_portfolio" && "✗ Portfolio"}
                        {action.type === "monitor" && "👁 Monitoring"}
                        {action.type === "send_alert" && "📱 Alert Sent"}
                      </span>
                      <span className="font-mono font-semibold">{action.symbol}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-accent rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleRecording}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all flex-shrink-0 ${
              isRecording ? "bg-red-500 text-white animate-pulse" : "bg-accent hover:bg-accent/80 text-muted-foreground"
            }`}>
            {isRecording ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={isRecording ? "Listening..." : `Ask me anything, ${firstName}...`}
            className={`flex-1 px-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
              isRecording ? "border-red-500/50 bg-red-500/5" : "border-border"
            }`} disabled={loading} />
          <button type="submit" disabled={loading || !input.trim()}
            className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {isRecording && <p className="text-[10px] text-red-500 mt-1.5 text-center font-mono animate-pulse">● Listening — speak now...</p>}
      </form>
    </div>
  );
}
