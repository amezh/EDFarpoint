# ED Farpoint — Claude Code Guide

## What This Is

Elite Dangerous companion app for exploration and exobiology. Reads game journal files in real-time, calculates cartographic and bio values, predicts species, tracks trip/lifetime stats. Built with **Tauri 2 (Rust) + Svelte 5 + UnoCSS**.

## Project Structure

```
ed-companion/
├── src-tauri/src/           # Rust backend
│   ├── lib.rs               # Tauri commands, app setup, wires everything together
│   ├── journal/             # Journal file watcher + event type definitions
│   │   ├── watcher.rs       # Reads ALL journal files, finds last dock, serves history
│   │   └── events.rs        # Serde structs for every ED journal event type
│   ├── status/mod.rs        # Polls Status.json + NavRoute.json every 1s
│   ├── bio/predictor.rs     # Canonn dataset species prediction engine
│   ├── edsm/mod.rs          # EDSM API client with LRU cache
│   ├── stats/mod.rs         # TripStats + LifetimeStats Rust structs
│   ├── remote/mod.rs        # axum HTTP/WS server for tablet/remote access
│   ├── window/mod.rs        # Overlay window create/close/toggle
│   └── config.rs            # AppConfig with all settings
├── src-tauri/assets/        # Canonn biostats, prices, clonal ranges (JSON)
├── src/                     # Svelte 5 frontend
│   ├── App.svelte           # Main app — event routing, stats accumulation, tab layout
│   ├── lib/stores/          # Reactive stores (*.svelte.ts — MUST use .svelte.ts for $state)
│   │   ├── journal.svelte.ts
│   │   ├── system.svelte.ts # Current system + body list
│   │   ├── trip.svelte.ts   # Trip stats since last dock (individual $state vars)
│   │   ├── lifetime.svelte.ts
│   │   ├── bio.svelte.ts    # Per-planet species tracking
│   │   ├── route.svelte.ts  # NavRoute data
│   │   └── status.svelte.ts # Status.json flags
│   ├── lib/components/      # UI components
│   │   ├── SystemView.svelte    # Action-oriented: bio targets → carto targets → other
│   │   ├── BioTracker/          # On-foot species sampling with progress dots
│   │   ├── RouteView/           # Plotted route with scoopable/neutron highlights
│   │   ├── TripStats/           # Since last dock
│   │   ├── LifetimeStats/       # All-time stats with FSS/DSS/bio breakdown
│   │   ├── Settings/            # Config panel
│   │   └── overlay/             # Compact HUD widget
│   └── lib/utils/
│       ├── valueCalc.ts     # Official ED exploration value formulae (post-3.3)
│       └── bioValues.ts     # Vista Genomics species → credit lookup table
├── data/                    # Source Canonn/Vista data files (not in assets)
└── ED_COMPANION_SPEC.md     # Full product specification
```

## Key Architecture Decisions

### Journal History Loading
- Rust reads ALL journal files on startup, sorted by **modification time** (not filename — ED uses two naming formats that don't sort lexically)
- Finds the last `Docked` event to split trip vs lifetime boundary
- Frontend pulls history via `invoke("get_journal_history")` — returns `{ allEvents, tripStartIdx, lastDockTimestamp, lastDockStation }`
- **Trip events** (post-dock) processed immediately → UI shows fast
- **Lifetime events** (all files) processed in background chunks via `requestAnimationFrame`
- The user hasn't docked since Feb 2025 — trip spans ~170 systems across many sessions

### Svelte 5 Reactivity Rules
- **Stores MUST be `.svelte.ts` files** — `$state` rune only works in `.svelte` and `.svelte.ts`
- **Don't use `$state` on a single object then return it from a getter** — `$derived(store.current)` won't re-derive if the same object reference is returned. Instead, use individual `$state` variables and build a fresh object in the getter.
- All imports use `$lib/stores/foo.svelte` (not `$lib/stores/foo`)

### Value Calculations
- Cartographic values use the official post-3.3 formulae with proper k-values, mass scaling, and mapping multipliers
- `estimateStarValue(starType, solarMass, wasDiscovered)`
- `estimateCartoValue({ bodyType, terraformable, wasDiscovered, wasMapped, massEM, withDSS })`
- Bio values from static Vista Genomics price table; first-discovery bonus = 4x base (total 5x)
- Stats split: FSS value vs DSS bonus, bio base vs bio first-discovery bonus

### Event Flow
- Rust emits `journal-event` (live), `status-update`, `navroute-update` via Tauri IPC
- `App.svelte.handleJournalEvent()` routes events to stores + trip stats
- `App.svelte.handleLifetimeEvent()` is a lightweight handler for lifetime accumulation only
- `bodyDiscoveryMap` tracks which bodies were undiscovered for bio first-discovery bonus

## User Context

- CMDR "Lazy Cat" — deep exploration trip, Mandalay ship, ~71 LY jump range
- Currently ~8000 LY from Sol, hasn't docked since Feb 2025
- Primarily interested in exobiology — the bio prediction and tracking features matter most
- Journal files at `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous\`
- 136 journal files, ~35MB total

## Game Loop the UI Should Follow

1. **Route** — where am I going, how many jumps, which stars are scoopable/neutron
2. **Discovery** — arrive in system, FSS scan, see action list: bio targets to DSS, valuable bodies to map
3. **Bio Scan** — approach planet, land, track species sampling (3 samples each, clonal range distance)

Tab order reflects this: Route → Discovery → Bio → Stats → Settings

## What Works
- Journal watcher reads all history since last dock
- Real-time tailing of latest journal + Status.json polling
- Trip stats with FSS/DSS/bio value breakdown
- Lifetime stats processing in background
- System view with action-oriented body categorization
- Bio tracker with sample progress and clonal range
- Route view with star class highlighting
- Overlay window (toggle open/close)
- Settings panel (EDSM key, bio threshold, overlay, remote server)
- axum remote server with REST + WebSocket

## What Needs Work
- Bio species prediction (Canonn dataset loaded in Rust but not wired to frontend predictions)
- EDSM enrichment (client exists but not called on system entry)
- Persistence (lifetime stats not saved to disk between app restarts)
- Remote web client (server exists but no dedicated touch-optimized layout)
- Column configurability in body table
- Auto-switch view logic based on game events
- Overlay compact widgets per-context

## Dev Commands
```bash
cd ed-companion
pnpm tauri dev      # Dev mode with hot reload
pnpm build          # Frontend only
cargo check         # Rust only (from src-tauri/)
```

## Design Philosophy
- **Show the best info we have right now, and refine as more data arrives.** Start with predictions/estimates, then update with confirmed values as the player scans. Players should get a dopamine hit as numbers become more accurate and totals grow.
- Always prefer actual scan data over predictions when available.
- Values should be as accurate as possible at every moment in time.

## Don't
- Don't sort journal files by filename — use modification time
- Don't use `$state` in plain `.ts` files — must be `.svelte.ts`
- Don't emit batch events from Rust setup() — frontend won't be listening yet, use invoke pull pattern
- Don't process all historical events synchronously — chunk with requestAnimationFrame
- Don't use `"plugins": { "store": {} }` in tauri.conf.json — store plugin doesn't want config
