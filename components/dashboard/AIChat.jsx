"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import StockCard from "./StockCard";

// Parse SSE stream from Anthropic API
async function* streamChat(reader) {
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "content_block_delta" && evt.delta?.text) {
            yield evt.delta.text;
          }
        } catch {}
      }
    }
  }
}

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
  const [activeStock, setActiveStock] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const voiceModeRef = useRef(false);
  const welcomeSent = useRef(false);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { if (!voiceMode) inputRef.current?.focus(); }, [voiceMode]);

  // Welcome
  useEffect(() => {
    if (welcomeSent.current) return;
    welcomeSent.current = true;
    const h = new Date().getHours();
    const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    const pc = portfolio?.length || 0;
    let t = `${g}, ${firstName}! `;
    t += pc > 0 ? `You've got ${pc} stocks in your portfolio. What do you want to look at?` : `What stocks or crypto are you interested in?`;
    setMessages([{ role: "assistant", content: t }]);
  }, [firstName, portfolio]);

  // Voice settings + preload voices
  const voicesRef = useRef([]);
  useEffect(() => {
    try { if (JSON.parse(localStorage.getItem("stockpulse_settings") || "{}").voiceEnabled === false) setVoiceEnabled(false); } catch {}
    // Preload browser voices
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // ═══ SPEECH — ElevenLabs with browser TTS fallback ═══
  const speak = async (text) => {
    if (!voiceEnabled || typeof window === "undefined") { if (voiceModeRef.current) startListening(); return; }
    const clean = text.replace(/[→📊💼🔍✓✗▲▼⭐]/g, "").replace(/\$([A-Z]+)/g, "$1").replace(/\*\*/g, "").replace(/\n+/g, ". ").trim();
    if (!clean) { if (voiceModeRef.current) startListening(); return; }
    stopSpeaking();

    // Try ElevenLabs first (better quality voice)
    try {
      console.log("[Voice] Calling ElevenLabs...");
      const r = await fetch("/api/ai/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }) });
      console.log("[Voice] ElevenLabs response:", r.status, r.headers.get("content-type"));
      if (r.ok && r.headers.get("content-type")?.includes("audio")) {
        const blob = await r.blob(); const url = URL.createObjectURL(blob);
        const a = new Audio(url); audioRef.current = a; a.playbackRate = 1.15;
        a.onplay = () => setIsSpeaking(true);
        a.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; if (voiceModeRef.current) setTimeout(startListening, 300); };
        a.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); audioRef.current = null; if (voiceModeRef.current) startListening(); };
        await a.play(); return;
      }
    } catch (e) { console.log("[Voice] ElevenLabs failed, using browser TTS:", e.message); }

    // Browser TTS fallback
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean); u.rate = 1.1; u.pitch = 0.95;
      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const pref = voices.find((x) => x.name.includes("Samantha") || x.name.includes("Daniel") || x.name.includes("Google UK"))
        || voices.find((x) => x.lang.startsWith("en") && x.name.includes("Google"))
        || voices.find((x) => x.lang.startsWith("en")) || voices[0];
      if (pref) u.voice = pref;
      u.onstart = () => setIsSpeaking(true);
      u.onend = () => { setIsSpeaking(false); if (voiceModeRef.current) setTimeout(startListening, 300); };
      u.onerror = () => { setIsSpeaking(false); if (voiceModeRef.current) startListening(); };
      window.speechSynthesis.speak(u);
    } else if (voiceModeRef.current) {
      startListening();
    }
  };
  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // ═══ RECOGNITION ═══
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    const r = new SR(); r.continuous = false; r.interimResults = true; r.lang = "en-US";
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(""); setInput(t); if (e.results[0].isFinal) { setIsRecording(false); setTimeout(() => submitMessage(t), 150); } };
    r.onerror = (e) => { setIsRecording(false); if (voiceModeRef.current && e.error === "no-speech") setTimeout(startListening, 400); };
    r.onend = () => setIsRecording(false);
    recognitionRef.current = r;
  }, []);
  const startListening = () => { if (!recognitionRef.current || isRecording || isSpeaking || loading) return; try { stopSpeaking(); setInput(""); recognitionRef.current.start(); setIsRecording(true); } catch {} };
  const stopListening = () => { if (recognitionRef.current && isRecording) { recognitionRef.current.stop(); setIsRecording(false); } };
  const toggleVoiceMode = () => { const n = !voiceMode; setVoiceMode(n); voiceModeRef.current = n; if (n) startListening(); else { stopListening(); stopSpeaking(); } };
  const tapMic = () => { if (voiceMode) toggleVoiceMode(); else if (isRecording) stopListening(); else startListening(); };

  // ═══ PARSE ACTIONS FROM TEXT ═══
  const parseActions = (text) => {
    const actions = [];
    const re = /<action\s+([^/>]+)\/?\s*>/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const attrs = {};
      const ar = /(\w+)="([^"]*)"/g;
      let am;
      while ((am = ar.exec(m[1])) !== null) attrs[am[1]] = am[2];
      if (attrs.type) {
        ["price", "targetPrice", "dividend", "shares", "avg_cost"].forEach((k) => { if (attrs[k]) attrs[k] = parseFloat(attrs[k]); });
        actions.push(attrs);
      }
    }
    const clean = text.replace(/<action\s+[^>]*\/?\s*>/gi, "")
      .replace(/<\/?antml:cite[^>]*>/gi, "").replace(/<\/?cite[^>]*>/gi, "")
      .replace(/<[^>]*>/g, "").replace(/\[\d+\]/g, "").replace(/&[a-z]+;/gi, " ").trim();
    return { clean, actions };
  };

  // ═══ EXECUTE ACTIONS ═══
  const execActions = async (actions) => {
    for (const a of actions) {
      if (a.type === "show_stock") {
        setActiveStock({ symbol: a.symbol, name: a.name, price: a.price || prices?.[a.symbol]?.price, sector: a.sector, confidence: a.confidence, targetPrice: a.targetPrice, dividend: a.dividend, catalyst: a.catalyst });
      } else if (a.type === "add_to_watchlist" || a.type === "monitor") {
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
        await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: a.symbol, message: a.message || `Alert for ${a.symbol}`, urgency: a.urgency || "normal" }) });
      }
    }
    if (actions.some((a) => a.type.includes("watchlist") || a.type === "monitor") && onWatchlistUpdate) onWatchlistUpdate();
  };

  // ═══ SUBMIT WITH STREAMING ═══
  const submitMessage = async (msg) => {
    const userMsg = msg || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    const history = messages.slice(1).filter((m) => (m.role === "user" || m.role === "assistant") && !m.isError).slice(-20).map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history, prices, watchlist, portfolio, userName: session?.user?.name || "" }),
      });

      if (!res.ok) {
        let errMsg = `Error ${res.status}`;
        try { const e = await res.json(); errMsg = e.error || errMsg; } catch {}
        setMessages((prev) => [...prev, { role: "assistant", content: errMsg, isError: true }]);
        setLoading(false);
        if (voiceModeRef.current) setTimeout(startListening, 800);
        return;
      }

      // Stream tokens
      const reader = res.body.getReader();
      let fullText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "", _streaming: true }]);

      for await (const chunk of streamChat(reader)) {
        fullText += chunk;
        // Show text without action tags as it streams
        const display = fullText.replace(/<action\s+[^>]*\/?\s*>/gi, "").replace(/<\/?[^>]+>/g, "");
        setMessages((prev) => {
          const u = [...prev]; const l = u[u.length - 1];
          if (l?._streaming) u[u.length - 1] = { ...l, content: display };
          return u;
        });
      }

      // Done streaming — parse actions and finalize
      const { clean, actions } = parseActions(fullText);
      setMessages((prev) => {
        const u = [...prev]; const l = u[u.length - 1];
        if (l?._streaming) u[u.length - 1] = { role: "assistant", content: clean, actions: actions.filter((a) => a.type !== "show_stock") };
        return u;
      });

      if (actions.length) await execActions(actions);
      console.log("[StockPulse] Speaking:", clean.slice(0, 60), "voiceEnabled:", voiceEnabled);
      speak(clean);

    } catch (e) {
      console.error("[Chat]", e);
      setMessages((prev) => [...prev, { role: "assistant", content: "Connection issue. Try again.", isError: true }]);
      if (voiceModeRef.current) setTimeout(startListening, 800);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => { e.preventDefault(); submitMessage(); };
  const addStockToWatchlist = async () => {
    if (!activeStock) return;
    await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: activeStock.symbol, name: activeStock.name || activeStock.symbol, sector: activeStock.sector || "Unknown" }) });
    if (onWatchlistUpdate) onWatchlistUpdate();
  };

  const voiceState = isSpeaking ? "speaking" : isRecording ? "listening" : loading ? "thinking" : voiceMode ? "ready" : "idle";

  return (
    <div className="space-y-4">
      {activeStock && (
        <StockCard {...activeStock}
          price={activeStock.price || prices?.[activeStock.symbol]?.price}
          onAddWatchlist={addStockToWatchlist} onDismiss={() => setActiveStock(null)} />
      )}

      <div className="relative rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(6,182,212,0.08) 50%, rgba(59,130,246,0.06) 100%)" }}>
        <div className={`absolute inset-0 rounded-2xl transition-all duration-500 pointer-events-none ${
          voiceState === "listening" ? "shadow-[inset_0_0_30px_rgba(239,68,68,0.15)]"
          : voiceState === "speaking" ? "shadow-[inset_0_0_30px_rgba(59,130,246,0.2)]"
          : voiceState === "thinking" ? "shadow-[inset_0_0_30px_rgba(168,85,247,0.15)]" : ""
        }`} />
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
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
                voiceState === "listening" ? "bg-red-500" : voiceState === "speaking" ? "bg-blue-500 animate-pulse" : voiceState === "thinking" ? "bg-purple-500" : "bg-gradient-to-br from-blue-500 to-cyan-400"
              }`}>
                {voiceState === "thinking" ? (
                  <div className="flex gap-0.5">{[0,1,2].map((i) => <div key={i} className="w-1 h-1 bg-white rounded-full animate-bounce" style={{ animationDelay: `${i*100}ms` }} />)}</div>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                )}
              </div>
              <div>
                <span className="font-semibold text-sm">StockPulse AI</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${voiceState === "listening" ? "bg-red-500 animate-pulse" : voiceState === "speaking" ? "bg-blue-500 animate-pulse" : voiceState === "thinking" ? "bg-purple-500 animate-pulse" : "bg-emerald-500"}`} />
                  <span className="text-[10px] text-muted-foreground">
                    {voiceState === "listening" ? "Listening..." : voiceState === "speaking" ? "Speaking..." : voiceState === "thinking" ? "Thinking..." : voiceMode ? "Speak anytime" : `Ready, ${firstName}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTranscript(!showTranscript)} className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${showTranscript ? "bg-accent text-foreground" : "text-muted-foreground"}`}>
                {showTranscript ? "Hide" : "Chat"}
              </button>
              <button onClick={toggleVoiceMode} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${voiceMode ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-accent/80 text-muted-foreground"}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                {voiceMode ? "End" : "Voice"}
              </button>
              <button onClick={() => { setVoiceEnabled(!voiceEnabled); if (isSpeaking) stopSpeaking(); }} className={`w-8 h-8 flex items-center justify-center rounded-lg ${voiceEnabled ? "text-blue-400" : "text-muted-foreground"}`}>
                {voiceEnabled ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>}
              </button>
            </div>
          </div>

          {/* Voice mode waveform */}
          {voiceMode && (
            <div className="flex flex-col items-center py-8 px-6">
              <div className="flex items-center justify-center gap-[3px] h-16 mb-4">
                {[...Array(28)].map((_, i) => (
                  <div key={i} className={`w-[3px] rounded-full ${voiceState === "listening" ? "bg-red-400" : voiceState === "speaking" ? "bg-blue-400" : voiceState === "thinking" ? "bg-purple-400" : "bg-blue-300/20"}`}
                    style={{ height: "32px", animation: voiceState !== "idle" ? `waveBar 0.6s ease-in-out ${i*40}ms infinite alternate` : "none" }} />
                ))}
              </div>
              <style jsx>{`@keyframes waveBar { 0% { transform: scaleY(0.3); } 100% { transform: scaleY(1); } }`}</style>
              <p className="text-sm text-center text-muted-foreground">
                {voiceState === "listening" ? <span className="text-red-400 font-medium">Listening...</span>
                : voiceState === "speaking" ? <span className="text-blue-400 font-medium">Speaking...</span>
                : voiceState === "thinking" ? <span className="text-purple-400 font-medium">Analyzing...</span>
                : "Say something like \"Tell me about NVDA\""}
              </p>
              {messages.length > 1 && <p className="mt-3 text-xs text-muted-foreground/50 line-clamp-2 max-w-lg text-center">{messages[messages.length - 1]?.content}</p>}
            </div>
          )}

          {/* Text input */}
          {!voiceMode && (
            <form onSubmit={handleSubmit} className="px-5 pb-4">
              <div className="flex items-center gap-2">
                <button type="button" onClick={tapMic} className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-accent/80 text-muted-foreground"}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
                <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={isRecording ? "Listening..." : `Ask about any stock, ${firstName}...`}
                  className={`flex-1 px-4 py-2.5 bg-background/80 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${isRecording ? "border-red-500/50" : "border-border/50"}`} disabled={loading} />
                <button type="submit" disabled={loading || !input.trim()} className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center disabled:opacity-50 flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </form>
          )}

          {/* Transcript */}
          {showTranscript && (
            <div className="border-t border-border/30 max-h-[400px] overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user" ? "bg-blue-500 text-white rounded-br-md" : msg.isError ? "bg-red-500/10 text-red-400 rounded-bl-md" : "bg-accent/80 rounded-bl-md"
                  }`}>{msg.content}
                    {msg.actions?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                        {msg.actions.map((a, j) => (
                          <div key={j} className="flex items-center gap-2 text-[11px]">
                            <span className={`px-1.5 py-0.5 rounded font-mono font-bold ${a.type.includes("add") || a.type === "monitor" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                              {a.type.includes("watchlist") ? "✓ Watch" : a.type.includes("portfolio") ? "✓ Portfolio" : "📱 Alert"}
                            </span>
                            <span className="font-mono font-semibold">{a.symbol}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && <div className="flex justify-start"><div className="bg-accent/80 rounded-2xl px-4 py-3"><div className="flex gap-1.5">{[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay:`${i*150}ms`}} />)}</div></div></div>}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Last message preview */}
          {!showTranscript && !voiceMode && messages.length > 0 && (
            <div className="px-5 pb-4">
              <div className="bg-accent/50 rounded-xl px-4 py-3">
                <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap line-clamp-4">{messages[messages.length - 1]?.content}</p>
                {messages.length > 2 && <button onClick={() => setShowTranscript(true)} className="text-[10px] text-blue-400 font-semibold mt-2 hover:underline">View full conversation →</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
