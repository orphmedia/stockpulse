"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [refreshRate, setRefreshRate] = useState("10s");
  const [notifications, setNotifications] = useState(true);
  const [signalAlerts, setSignalAlerts] = useState(true);
  const [newsAlerts, setNewsAlerts] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voices, setVoices] = useState([]);
  const [phone, setPhone] = useState("");
  const [alertWebhook, setAlertWebhook] = useState("");
  const [saved, setSaved] = useState(false);
  const [testPlaying, setTestPlaying] = useState(false);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const v = window.speechSynthesis.getVoices();
      const english = v.filter((voice) => voice.lang.startsWith("en"));
      setVoices(english);
    };
    loadVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Load saved settings
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem("stockpulse_settings") || "{}");
      if (saved.refreshRate) setRefreshRate(saved.refreshRate);
      if (saved.voiceEnabled !== undefined) setVoiceEnabled(saved.voiceEnabled);
      if (saved.selectedVoice) setSelectedVoice(saved.selectedVoice);
      if (saved.phone) setPhone(saved.phone);
      if (saved.alertWebhook) setAlertWebhook(saved.alertWebhook);
      if (saved.notifications !== undefined) setNotifications(saved.notifications);
      if (saved.signalAlerts !== undefined) setSignalAlerts(saved.signalAlerts);
      if (saved.newsAlerts !== undefined) setNewsAlerts(saved.newsAlerts);
    } catch {}
  }, []);

  const testVoice = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      "Hey, this is your StockPulse AI assistant. NVDA is up 3 percent today with strong bullish sentiment on Reddit."
    );
    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    if (selectedVoice) {
      const voice = voices.find((v) => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }
    utterance.onstart = () => setTestPlaying(true);
    utterance.onend = () => setTestPlaying(false);
    utterance.onerror = () => setTestPlaying(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopTest = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setTestPlaying(false);
  };

  const handleSave = async () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("stockpulse_settings", JSON.stringify({
        refreshRate, voiceEnabled, selectedVoice, phone, alertWebhook,
        notifications, signalAlerts, newsAlerts,
      }));
    }

    // Save phone to Supabase user record
    if (phone) {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, alert_webhook: alertWebhook }),
        });
      } catch (e) { console.error("Save settings error:", e); }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Toggle = ({ value, onChange }) => (
    <button onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-all relative ${value ? "bg-primary" : "bg-accent"}`}>
      <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow-sm"
        style={{ left: value ? "22px" : "2px" }} />
    </button>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your dashboard and AI assistant</p>
      </div>

      {/* Account */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">ACCOUNT</h2>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Name</div>
              <div className="text-sm text-muted-foreground">{session?.user?.name || "—"}</div>
            </div>
          </div>
          <div className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Email</div>
              <div className="text-sm text-muted-foreground font-mono">{session?.user?.email || "—"}</div>
            </div>
          </div>
          <div className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Role</div>
              <div className="text-sm text-muted-foreground capitalize">{session?.user?.role || "user"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Voice Settings */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">AI VOICE</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Voice Responses</div>
              <div className="text-xs text-muted-foreground">AI speaks its answers out loud</div>
            </div>
            <Toggle value={voiceEnabled} onChange={setVoiceEnabled} />
          </div>

          {voiceEnabled && (
            <>
              <div className="border-t border-border pt-4">
                <label className="text-sm font-medium mb-2 block">Voice Selection</label>
                <p className="text-xs text-muted-foreground mb-3">Choose male, female, or any available voice</p>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Auto (system default)</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-border pt-4 flex items-center gap-3">
                <button
                  onClick={testPlaying ? stopTest : testVoice}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    testPlaying
                      ? "bg-red-500/10 text-red-500 border border-red-500/20"
                      : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                  }`}
                >
                  {testPlaying ? "⏹ Stop" : "▶ Test Voice"}
                </button>
                <span className="text-xs text-muted-foreground">
                  {selectedVoice || "Default voice"}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SMS Alerts */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">SMS ALERTS</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Phone Number</label>
            <p className="text-xs text-muted-foreground mb-3">
              Receive urgent AI alerts via text message
            </p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="border-t border-border pt-4">
            <div className="bg-background rounded-xl p-4">
              <h4 className="text-xs font-mono font-semibold text-muted-foreground mb-2">HOW IT WORKS</h4>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>1. Enter your phone number above and save</p>
                <p>2. Tell the AI: &quot;Text me if NVDA has big news&quot; or &quot;Alert me about Tesla&quot;</p>
                <p>3. You&apos;ll receive an SMS within seconds via Twilio</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Refresh */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">DATA REFRESH</h2>
        <div>
          <label className="text-sm font-medium mb-2 block">Default Refresh Rate</label>
          <div className="flex items-center bg-background border border-border rounded-lg overflow-hidden w-fit">
            {["5s", "10s", "30s", "1m"].map((rate) => (
              <button key={rate} onClick={() => setRefreshRate(rate)}
                className={`px-4 py-2.5 text-xs font-mono transition-all ${
                  refreshRate === rate ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>{rate}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">NOTIFICATIONS</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Enable Notifications</div>
              <div className="text-xs text-muted-foreground">Browser push alerts</div>
            </div>
            <Toggle value={notifications} onChange={setNotifications} />
          </div>
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Signal Alerts</div>
              <div className="text-xs text-muted-foreground">Alert on signal changes (HOLD → BUY)</div>
            </div>
            <Toggle value={signalAlerts} onChange={setSignalAlerts} />
          </div>
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">News Alerts</div>
              <div className="text-xs text-muted-foreground">High-impact news for watchlist stocks</div>
            </div>
            <Toggle value={newsAlerts} onChange={setNewsAlerts} />
          </div>
        </div>
      </div>

      {/* API Connections */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">API CONNECTIONS</h2>
        <div className="space-y-3">
          {[
            { name: "Alpaca Market Data", desc: "Real-time stock prices", status: "Connected", ok: true },
            { name: "RSS News Feeds", desc: "Reuters, CNBC, Yahoo, MarketWatch", status: "Active", ok: true },
            { name: "Social Sentiment", desc: "Reddit, X/Twitter, TikTok, Instagram", status: "Active", ok: true },
            { name: "Claude AI Analysis", desc: "AI-powered chat & recommendations", status: "Configured", ok: true },
            { name: "Supabase Database", desc: "Data storage & user management", status: "Connected", ok: true },
          ].map((api) => (
            <div key={api.name} className="flex items-center justify-between p-3 bg-background rounded-xl">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${api.ok ? "bg-bullish" : "bg-neutral"}`} />
                <div>
                  <div className="text-sm font-medium">{api.name}</div>
                  <div className="text-xs text-muted-foreground">{api.desc}</div>
                </div>
              </div>
              <span className={`text-xs font-mono ${api.ok ? "text-bullish" : "text-muted-foreground"}`}>{api.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button onClick={handleSave}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-all">
          Save Settings
        </button>
        {saved && <span className="text-sm text-bullish font-medium">Settings saved!</span>}
      </div>
    </div>
  );
}
