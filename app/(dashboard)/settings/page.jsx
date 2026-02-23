"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [refreshRate, setRefreshRate] = useState("10s");
  const [theme, setTheme] = useState("dark");
  const [notifications, setNotifications] = useState(true);
  const [signalAlerts, setSignalAlerts] = useState(true);
  const [newsAlerts, setNewsAlerts] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Save to localStorage for now — could persist to Supabase later
    if (typeof window !== "undefined") {
      localStorage.setItem("stockpulse_settings", JSON.stringify({
        refreshRate,
        theme,
        notifications,
        signalAlerts,
        newsAlerts,
      }));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your dashboard preferences
        </p>
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

      {/* Data Refresh */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">DATA REFRESH</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Default Refresh Rate</label>
            <p className="text-xs text-muted-foreground mb-3">How often the dashboard polls for new price data</p>
            <div className="flex items-center bg-background border border-border rounded-lg overflow-hidden w-fit">
              {["5s", "10s", "30s", "1m"].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setRefreshRate(rate)}
                  className={`px-4 py-2.5 text-xs font-mono transition-all ${
                    refreshRate === rate
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {rate}
                </button>
              ))}
            </div>
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
              <div className="text-xs text-muted-foreground">Get alerts for important events</div>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`w-11 h-6 rounded-full transition-all relative ${
                notifications ? "bg-primary" : "bg-accent"
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${
                notifications ? "left-5.5 translate-x-0" : "left-0.5"
              }`}
              style={{ left: notifications ? "22px" : "2px" }}
              />
            </button>
          </div>
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Signal Alerts</div>
              <div className="text-xs text-muted-foreground">Alert when a stock changes signal (e.g. HOLD → BUY)</div>
            </div>
            <button
              onClick={() => setSignalAlerts(!signalAlerts)}
              className={`w-11 h-6 rounded-full transition-all relative ${
                signalAlerts ? "bg-primary" : "bg-accent"
              }`}
            >
              <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow-sm"
              style={{ left: signalAlerts ? "22px" : "2px" }}
              />
            </button>
          </div>
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">News Alerts</div>
              <div className="text-xs text-muted-foreground">Alert when high-impact news is detected for watchlist stocks</div>
            </div>
            <button
              onClick={() => setNewsAlerts(!newsAlerts)}
              className={`w-11 h-6 rounded-full transition-all relative ${
                newsAlerts ? "bg-primary" : "bg-accent"
              }`}
            >
              <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow-sm"
              style={{ left: newsAlerts ? "22px" : "2px" }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* API Connections */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-sm font-mono font-semibold text-muted-foreground mb-4">API CONNECTIONS</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-background rounded-xl">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-bullish" />
              <div>
                <div className="text-sm font-medium">Alpaca Market Data</div>
                <div className="text-xs text-muted-foreground">Real-time stock prices</div>
              </div>
            </div>
            <span className="text-xs font-mono text-bullish">Connected</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-background rounded-xl">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-bullish" />
              <div>
                <div className="text-sm font-medium">RSS News Feeds</div>
                <div className="text-xs text-muted-foreground">Reuters, CNBC, Yahoo Finance, MarketWatch</div>
              </div>
            </div>
            <span className="text-xs font-mono text-bullish">Active</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-background rounded-xl">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${process.env.NEXT_PUBLIC_HAS_ANTHROPIC ? "bg-bullish" : "bg-neutral"}`} />
              <div>
                <div className="text-sm font-medium">Claude AI Analysis</div>
                <div className="text-xs text-muted-foreground">AI-powered stock recommendations</div>
              </div>
            </div>
            <span className="text-xs font-mono text-muted-foreground">Configured in env</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-background rounded-xl">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-bullish" />
              <div>
                <div className="text-sm font-medium">Supabase Database</div>
                <div className="text-xs text-muted-foreground">Data storage and history</div>
              </div>
            </div>
            <span className="text-xs font-mono text-bullish">Connected</span>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-all"
        >
          Save Settings
        </button>
        {saved && (
          <span className="text-sm text-bullish font-medium">Settings saved!</span>
        )}
      </div>
    </div>
  );
}
