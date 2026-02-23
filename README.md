# StockPulse — Real-Time AI Stock Recommendation Engine

Private, authenticated stock analysis dashboard built with Next.js, deployed on Vercel.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: Shadcn/UI + Tailwind CSS
- **Auth**: NextAuth.js (credentials provider)
- **Database**: Supabase PostgreSQL
- **Market Data**: Alpaca API (free tier)
- **News Sentiment**: RSS feeds + AI sentiment analysis
- **Charts**: Recharts
- **Deployment**: Vercel

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/stockpulse.git
cd stockpulse
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

### 3. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL migration in `supabase/migrations/001_initial.sql`
3. Copy your project URL and anon key to `.env.local`

### 4. Alpaca Setup

1. Create a free account at [alpaca.markets](https://alpaca.markets)
2. Generate API keys (use paper trading keys first)
3. Add keys to `.env.local`

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 6. Deploy to Vercel

1. Push repo to GitHub
2. Connect repo at [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

## Project Structure

```
stockpulse/
├── app/
│   ├── layout.jsx              # Root layout with providers
│   ├── page.jsx                # Landing/login redirect
│   ├── globals.css             # Tailwind + custom styles
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.jsx        # Login page
│   │   └── layout.jsx          # Auth layout (no sidebar)
│   ├── (dashboard)/
│   │   ├── layout.jsx          # Dashboard layout with sidebar
│   │   ├── dashboard/
│   │   │   └── page.jsx        # Main dashboard overview
│   │   ├── watchlist/
│   │   │   └── page.jsx        # Watchlist management
│   │   ├── analysis/
│   │   │   └── page.jsx        # Deep analysis view
│   │   └── settings/
│   │       └── page.jsx        # User settings
│   └── api/
│       ├── auth/[...nextauth]/
│       │   └── route.js        # NextAuth config
│       ├── stocks/
│       │   ├── prices/
│       │   │   └── route.js    # Alpaca price data
│       │   └── historical/
│       │       └── route.js    # Historical data
│       ├── news/
│       │   └── route.js        # RSS feed aggregation
│       ├── sentiment/
│       │   └── route.js        # Sentiment analysis
│       └── cron/
│           └── aggregate/
│               └── route.js    # Scheduled data aggregation
├── components/
│   ├── ui/                     # Shadcn/UI components
│   ├── dashboard/
│   │   ├── PriceChart.jsx      # Main price chart
│   │   ├── TickerStrip.jsx     # Horizontal ticker scroller
│   │   ├── SignalCard.jsx      # Buy/Sell/Hold signal
│   │   ├── IndicatorPanel.jsx  # RSI, MACD, Sentiment
│   │   ├── NewsFeed.jsx        # Live news with sentiment
│   │   ├── WatchlistTable.jsx  # Watchlist management
│   │   └── Sidebar.jsx         # Navigation sidebar
│   └── providers/
│       └── SessionProvider.jsx # NextAuth session wrapper
├── lib/
│   ├── auth.js                 # NextAuth configuration
│   ├── supabase.js             # Supabase client
│   ├── alpaca.js               # Alpaca API client
│   ├── rss.js                  # RSS feed parser
│   ├── sentiment.js            # Sentiment analysis engine
│   ├── indicators.js           # Technical indicators (RSI, MACD, SMA)
│   └── signals.js              # Signal generation engine
├── supabase/
│   └── migrations/
│       └── 001_initial.sql     # Database schema
├── .env.example                # Environment variable template
├── next.config.js              # Next.js config
├── tailwind.config.js          # Tailwind config
├── package.json
└── README.md
```

## Data Pipeline

```
RSS Feeds (Reuters, CNBC, Bloomberg)
        │
        ▼
  News Aggregator ──► Sentiment Analysis ──► Supabase DB
        │                                       │
Alpaca API ──► Price Data ──────────────────────►│
        │                                       │
Historical Data ──► Technical Indicators ───────►│
                                                │
                                        Analysis Engine
                                                │
                                        Buy/Sell Signals
                                                │
                                          Dashboard UI
```

## Cron Schedule (Vercel)

Configure in `vercel.json`:
- `/api/cron/aggregate` — runs every 5 minutes during market hours

## License

Private — Personal Use Only
