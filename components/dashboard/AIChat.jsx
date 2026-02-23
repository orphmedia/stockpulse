"use client";

import { useState, useRef, useEffect } from "react";

export default function AIChat({ prices, news, signals, watchlist, socialData, onWatchlistUpdate, onPortfolioUpdate }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hey! I'm your StockPulse AI. I can manage your watchlist, portfolio, and give market insights. Try:\n\n→ \"Add Cisco to my watchlist\"\n→ \"Add 50 shares of AAPL at $185 to my portfolio\"\n→ \"Monitor NVDA and alert me on changes\"\n→ \"Build me a top 10 watchlist\"\n→ \"What's the social sentiment on Tesla?\"\n\n🎙️ Tap the mic button to use voice input!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setUnread(0);
    }
  }, [isOpen]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          setInput(transcript);

          // Auto-submit on final result
          if (event.results[event.results.length - 1].isFinal) {
            setIsRecording(false);
            // Small delay to ensure state updates
            setTimeout(() => {
              if (transcript.trim()) {
                submitMessage(transcript.trim());
              }
            }, 300);
          }
        };

        recognition.onerror = (event) => {
          console.error("Speech error:", event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Voice input is not supported in this browser. Try Chrome or Safari.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setInput("");
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const submitMessage = async (msg) => {
    const userMsg = msg || input.trim();
    if (!userMsg || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          prices,
          news: (news || []).slice(0, 15),
          signals,
          watchlist,
          socialData,
        }),
      });

      const data = await res.json();

      if (data.response) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response,
            actions: data.actions,
          },
        ]);
        if (!isOpen) setUnread((u) => u + 1);

        // Execute actions
        if (data.actions?.length > 0) {
          for (const action of data.actions) {
            if (action.type === "add_to_watchlist") {
              await fetch("/api/watchlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  symbol: action.symbol,
                  name: action.name || action.symbol,
                  sector: action.sector || "Unknown",
                }),
              });
            } else if (action.type === "remove_from_watchlist") {
              await fetch("/api/watchlist", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: action.symbol }),
              });
            } else if (action.type === "add_to_portfolio") {
              await fetch("/api/portfolio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  symbol: action.symbol,
                  shares: action.shares || 0,
                  avg_cost: action.avg_cost || action.price || 0,
                  name: action.name || action.symbol,
                  sector: action.sector || "Unknown",
                }),
              });
              if (onPortfolioUpdate) onPortfolioUpdate();
            } else if (action.type === "remove_from_portfolio") {
              await fetch("/api/portfolio", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: action.symbol }),
              });
              if (onPortfolioUpdate) onPortfolioUpdate();
            } else if (action.type === "monitor") {
              // Add to watchlist as monitoring
              await fetch("/api/watchlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  symbol: action.symbol,
                  name: action.name || action.symbol,
                  sector: action.sector || "Unknown",
                }),
              });
            }
          }
          if (onWatchlistUpdate) onWatchlistUpdate();
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Something went wrong." },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to connect to AI. Check your API key." },
      ]);
    }

    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMessage();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 hover:scale-105 transition-transform z-50"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[420px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-card border border-border rounded-2xl shadow-2xl shadow-black/30 flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-blue-600/10 to-cyan-500/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-sm">StockPulse AI</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-bullish" />
              <span className="text-[10px] text-muted-foreground">Voice + Actions</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-accent rounded-bl-md"
              }`}
            >
              {msg.content}
              {msg.actions?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                  {msg.actions.map((action, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                        action.type.includes("add") || action.type === "monitor"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {action.type === "add_to_watchlist" && "✓ Watchlist"}
                        {action.type === "remove_from_watchlist" && "✗ Removed"}
                        {action.type === "add_to_portfolio" && "✓ Portfolio"}
                        {action.type === "remove_from_portfolio" && "✗ Portfolio"}
                        {action.type === "monitor" && "👁 Monitoring"}
                      </span>
                      <span className="font-mono font-semibold">{action.symbol}</span>
                      {action.shares && <span className="text-muted-foreground">{action.shares} shares</span>}
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
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          {/* Voice Button */}
          <button
            type="button"
            onClick={toggleRecording}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all flex-shrink-0 ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-accent hover:bg-accent/80 text-muted-foreground"
            }`}
          >
            {isRecording ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRecording ? "🎙️ Listening..." : "Type or tap mic..."}
            className={`flex-1 px-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
              isRecording ? "border-red-500/50 bg-red-500/5" : "border-border"
            }`}
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {isRecording && (
          <p className="text-[10px] text-red-500 mt-1.5 text-center font-mono animate-pulse">
            ● Recording — speak your command...
          </p>
        )}
      </form>
    </div>
  );
}
