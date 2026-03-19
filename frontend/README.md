# Shōbu - Web3 Gaming & Betting Dashboard

A sleek, dark-mode Web3 gaming dashboard for Starknet betting platform with a cyberpunk aesthetic.

## 🎮 Features

### Dashboard Page (`/`)
- **Top Navigation Bar**: Futuristic Shōbu branding with "Connect Cartridge" button
- **Responsive Sidebar**: Navigation for Live Games, My Bets, Leaderboard, and Docs
- **Hero Banner**: Featured live game showcase with visual callouts
- **Active Games Grid**: Responsive grid displaying:
  - Game thumbnails
  - Player/faction names
  - Pulsing "Live" badges
  - Betting pools in STRK

### Live Match Page (`/match`)
Split-screen interface optimized for spectating and betting:

#### Left Panel (60%)
- **Video/Canvas Placeholder**: Game spectator view with live indicator overlay
- **Tabbed Interface** with dynamic content:
  - **Live Stats Tab**: Real-time player metrics
    - Health progress bars (neon purple)
    - Resource progress bars (electric blue)
    - Kill counts and scores
    - Dual player cards with live updates
  - **Match History Tab**: Previous match data
  - **Game Rules Tab**: Platform rules and betting mechanics

#### Right Panel (40%)
- **Live Odds Display**: Dynamic odds for each competing player
  - Player A (Champion): Higher odds, lower risk
  - Player B (Challenger): Underdog odds, higher payout
  - Interactive selection buttons
- **Bet Slip Card** with:
  - Selected player display
  - ETH/STRK currency toggle
  - Bet amount input with MAX button
  - Real-time potential payout calculation
  - Net profit display
  - Vibrant gradient "Place Bet" button
  - Cartridge Session Keys note

## 🎨 Design System

### Color Palette
- **Background**: Deep slate (#0f1419)
- **Cards**: Mid-slate (#1a1f2e)
- **Primary**: Neon purple (#a855f7)
- **Secondary**: Electric blue (#06b6d4)
- **Accents**: Bright magenta (#d946ef)

### Animations
- **Neon Glow**: Text shadow effects on headers
- **Live Pulse**: Pulsing animation for live badges
- **Gradient Borders**: Card borders with purple-to-blue gradients
- **Hover Effects**: Interactive element transitions with shadow glows

## 🛠️ Tech Stack

- **Framework**: Next.js 16 with App Router
- **UI Components**: shadcn/ui with Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom theme tokens
- **Icons**: lucide-react
- **State Management**: React hooks with client-side state
- **Image Optimization**: Next.js Image component

## 📁 Project Structure

```
/app
  /match          # Live match betting page
  page.tsx        # Dashboard home page
  layout.tsx      # Root layout with metadata
  globals.css     # Theme tokens and animations

/components
  /ui             # shadcn/ui components
  top-nav-bar.tsx     # Navigation header
  sidebar.tsx         # Navigation sidebar
  hero-banner.tsx     # Featured game showcase
  game-grid.tsx       # Active games grid
  match-spectator.tsx # Game view + tabs
  live-stats.tsx      # Real-time player metrics
  betting-panel.tsx   # Odds display
  bet-slip.tsx        # Betting interface

/public
  game-thumbnail.jpg   # Game spectator placeholder
  shobu-logo.jpg       # Shōbu branding
```

## 🚀 Getting Started

### Installation
```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

The application will start at `http://localhost:3000`

### EGS Discovery & Live Events
Shōbu discovers EGS-standard games via the Denshokan `/games` API, then uses Torii to stream
live gameplay events and read session token ownership.

Configure these in `.env` (see `.env.example` for Dark-Waters reference values). If
`NEXT_PUBLIC_EGS_GAMES_API` is unset, Shōbu defaults to the Denshokan API:
`https://denshokan-api-production.up.railway.app/games?network=sepolia`.

- `NEXT_PUBLIC_EGS_GAMES_API`
- `NEXT_PUBLIC_EGS_EVENT_HASHES`
- `NEXT_PUBLIC_EGS_POLL_MS`
- `NEXT_PUBLIC_EGS_GAME_ID_INDEX`
- `NEXT_PUBLIC_EGS_TORII_URL` (optional fallback if the games payload omits `torii_url`)

The Denshokan `/games` payload should include:
- `world_address` (or equivalent)
- `token_address` for the EGS ERC-721 session token
- `torii_url` (or equivalent Torii endpoint)

If `torii_url` is missing, Shōbu will fall back to `NEXT_PUBLIC_EGS_TORII_URL`.

### Pool Manager Bot
For tournament-grade deployments, run the pool manager bot to create pools from the Fun Factory
feed on schedule. It uses the same feed as EGS discovery by default, or `FUN_FACTORY_FEED_URL`
if provided.

1. Set the bot env vars in `.env.local` (see `frontend/.env.example`):
`POOL_MANAGER_ACCOUNT`, `POOL_MANAGER_PRIVATE_KEY`, and optionally `POOL_MANAGER_*` tuning values.
2. Start the bot:
`pnpm pool-manager`

Use `pnpm pool-manager:once` (or set `POOL_MANAGER_ONCE=true`) for a single polling cycle.

### Pool Admin CLI
Use the admin CLI to grant pool managers or create pools manually.

```bash
pnpm pool-admin set-pool-manager --account 0x... --enabled true
pnpm pool-admin is-pool-manager --account 0x...
pnpm pool-admin create-pool --game-world 0x... --game-id 42 --token 0x... --deadline 1712345678
pnpm pool-admin create-egs-pool --game-world 0x... --game-id 42 --token 0x... --deadline 1712345678 --p1-token 0x... --p2-token 0x...
```

### Navigation
- **Home**: Dashboard with active games
- **Live Games → Match**: Full match spectating and betting interface
- Click any game card to view live match details

## 🔐 Features

- **Responsive Design**: Mobile-first, adapts to all screen sizes
- **Real-Time Updates**: Live stats with simulated dynamic data
- **Gasless Transactions**: Powered by Cartridge Session Keys
- **Dark Mode**: Cyberpunk aesthetic with neon accents
- **Accessibility**: Semantic HTML, ARIA labels, screen reader support

## 🎯 Interactive Elements

### Betting Panel
1. **Select Player**: Click odds cards to choose betting side
2. **Toggle Currency**: Switch between ETH and STRK
3. **Set Amount**: Enter bet amount or click MAX
4. **View Payout**: Real-time calculation of potential winnings
5. **Place Bet**: Gasless transaction via Cartridge

### Live Stats
- Health and resource bars update every 2 seconds
- Kill/score counters increment as action happens
- Dual-player comparison view for match dynamics

## 📝 Notes

- Game data and odds are simulated for demonstration
- Real betting functionality would require blockchain integration
- This template is ready for Starknet smart contract integration
- All colors use custom CSS tokens for easy theming

---

Built with ⚔️ for the Web3 gaming community
