# ED Companion — Product Specification v2

## Overview

A fast, lightweight Elite Dangerous companion app built with **Tauri 2 + Svelte**. Focused on exploration and exobiology: reads local game data in real-time, enriches it with EDSM + Canonn bio data, and presents it in a flicker-free UI. Runs as a side panel, transparent overlay, or both simultaneously. Optional remote mode lets a tablet or Steam Deck connect to the running instance over the network.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | **Tauri 2** (Rust) | Native OS windows, tiny binary, proper overlay support |
| Frontend | **Svelte 5** | Fine-grained reactivity, minimal runtime, no VDOM flicker |
| Styling | **UnoCSS** (atomic) | Fast, tree-shaken, ED-themed dark palette |
| File watching | Rust `notify` crate | Low-latency cross-platform file watching |
| HTTP | Rust `reqwest` | Async, non-blocking |
| Remote API | `axum` (Rust HTTP server) | Lightweight, async, embedded in Tauri backend |
| Remote client | Browser (tablet/Steam Deck) | Connects via LAN, no install needed |
| State | Svelte stores + Tauri events | Rust pushes typed events to frontend via IPC |
| Persistence | `tauri-plugin-store` (JSON) | Config, lifetime stats, trip history |
| Bio prediction data | Canonn Research dataset (bundled JSON) | Offline-capable species prediction |

---

## Core Data Sources

| Source | What it provides |
|---|---|
| ED Journal `.log` files | All game events: jumps, scans, bio samples, docking, loadout |
| `Status.json` | Real-time: fuel, flags, GUI focus, coordinates, altitude |
| `NavRoute.json` | Current plotted route with all waypoints |
| EDSM API | System info, body details, first-discovery status, coordinates |
| Canonn bio dataset | Species spawn conditions (atmosphere, gravity, star class, temp, volcanism) |
| Vista Genomics values | Bundled static table of all bio species values (updated with app releases) |

---

## Feature Areas

---

### 1. Journal Watcher & Status Poller

- Monitors `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous\` (Windows)
- Linux: configurable path (Steam/Proton journal location)
- Tails the most recently modified `.log` file; detects new session files automatically
- Polls `Status.json` every 1s; diffs before emitting (no spurious re-renders)
- Polls `NavRoute.json` on file-change
- Key journal events parsed: `FSDJump`, `Location`, `Scan`, `SAASignalsFound`, `ScanOrganic`, `FSSDiscoveryScan`, `FSSBodySignals`, `ApproachBody`, `LeaveBody`, `Touchdown`, `Liftoff`, `Docked`, `Undocked`, `Loadout`, `Shutdown`

---

### 2. Trip Stats (Since Last Dock)

Tracks everything since the last `Docked` event. Resets on dock or manually.

**Cartographic value:**
- Systems visited
- Bodies FSS scanned
- Bodies DSS mapped
- Estimated cartographic value (using known multipliers: ELW ×9, WW ×5.3, AW ×11.4, TF bonus, first-discovery bonus ×2.6 if unvisited in EDSM)
- First discoveries count

**Exobiology value:**
- Species samples collected (per body, per system)
- Species fully analysed (3/3 samples complete)
- Estimated bio value (using bundled Vista Genomics table)
- First Logged bonus flag if system not in EDSM (×5 value)
- Total trip value = cartographic + bio estimated

**Display:**
- Always visible in status bar (compact: `⛏ 42.3M  🧬 18.7M  Σ 61M`)
- Full breakdown in Trip Stats tab
- Manual reset button ("I just docked / sold")

---

### 3. Lifetime Stats

Persisted across sessions in local store. Never resets automatically.

- Total credits earned from exploration (cartographic)
- Total credits earned from exobiology
- Total systems visited
- Total bodies scanned / mapped
- Total bio species found / analysed
- Total distance travelled (LY)
- Rarest species ever found (highest value)
- Longest trip (LY from dock to dock)
- Most valuable single trip

Displayed in a **Stats** tab with sparklines for recent sessions.

---

### 4. System View

Triggered on `FSDJump` / `Location`. Shows current system.

**System header:**
- Name, star class(es), permit locked flag
- Distance from Sol / distance from nearest inhabited system
- First discovered by / already visited (EDSM)
- Body count (FSS: discovered / total)
- System estimated value (sum of all bodies)

**Body list (configurable columns):**

Default columns:

| Column | Notes |
|---|---|
| Name | Body designation |
| Type | Star / Rocky / HMC / ELW / WW / AW / Icy / Gas giant / etc. |
| Distance | LS from arrival star |
| Radius | km |
| Gravity | g |
| Atmosphere | Type (None / Thin CO₂ / Thick N₂ / etc.) |
| Temp | K |
| Volcanism | None / Minor / Major + type |
| Landable | ✓ / — |
| Terraformable | ✓ / — |
| Mapped | ✓ (DSS done) / — |
| Est. carto value | Cr |
| Bio signals | Count (from FSS/SAA) |
| Bio predicted | Species list (see §5) |
| Bio value min | Cr (lowest possible species if signals present) |
| Bio value max | Cr (highest possible species if signals present) |
| Geo signals | Count |
| First discovery | ✓ if not in EDSM |
| Personal status | Unvisited / FSS / DSS / Landed / Bio complete |

Optional columns (user-selectable):
- Star luminosity class
- Orbital period
- Semi-major axis
- Axial tilt
- Surface pressure
- Ring types (icy / metallic / rocky / MRB)
- Rotation period

Columns are drag-to-reorder, toggle visibility, persist in config. Rows are sortable. Rows with bio signals above value threshold highlighted (default 8M Cr, configurable).

---

### 5. Exobiology / On-Foot Panel

The most important panel for on-foot exploration.

**Planet bio prediction** (runs on `SAASignalsFound` + body scan data):

Uses Canonn Research spawn condition dataset (bundled, updated periodically):
- Atmosphere type + subtype
- Body class (Rocky / HMC / Icy)
- Gravity (g)
- Surface temperature (K)
- Volcanism presence + type
- Distance from primary star (AU)
- Star class of primary / nearest star

Output per planet:
- List of **possible species** (narrowed after DSS)
- Per species: name, Vista Genomics value, clonal colony range (m), first-logged bonus eligible?
- Confidence: "confirmed" (post-DSS signal count matches) vs "predicted" (pre-DSS)
- **Minimum guaranteed value** = sum of lowest-value possible species × signal count
- **Maximum possible value** = sum of highest-value possible species × signal count

**Value threshold filter:**
- Configurable in settings (default: 8,000,000 Cr)
- Planets with max bio value below threshold are visually dimmed in body list
- Threshold applies to: highlight colour, notification, overlay indicator
- Can be set per-session or persisted

**Active bio tracking** (while on foot / in SRV):

Triggered on `ApproachBody`:
- Shows current planet's bio list
- Per species: samples collected (0/1/2/3), analysed (✓)
- Clonal range reminder: distance required between samples (shown in meters)
- Analysis progress bar per species
- "Done" flag when all species on planet are 3/3 analysed

**Organism tracker:**
- Tracks `ScanOrganic` events: `Log` (first), `Sample` (second), `Analyse` (third = done)
- Shows which species are complete vs in-progress per body

**Auto-switch trigger:** `ApproachBody` → switches to Planetary/Bio view automatically

---

### 6. Route View

Reads `NavRoute.json` on change.

- Remaining jumps + total remaining LY
- Next 5 systems in route (expandable to full list)
- Per system: name, star class, distance (LY), estimated value if previously visited in EDSM
- Neutron stars highlighted — boostable jump indicator
- White dwarfs flagged
- Fuel scoopable stars marked (KGBFOAM classes)
- Destination system + total route distance

Auto-switch: `FSDJump` → route view for 3s → back to system view

---

### 7. Auto-Switch View Logic

Context-aware tab switching (can be disabled; fixed view selectable per window):

| Game event | Switch to |
|---|---|
| `FSDJump` | Route strip (3s) → System view |
| `FSSDiscoveryScan` body count update | System view |
| `SAASignalsFound` (DSS done) | System view, highlight that body |
| `ApproachBody` (with bio signals) | Planetary / Bio view |
| `Touchdown` | Bio tracker |
| `Liftoff` | Bio tracker (summary) |
| `Docked` | Trip stats summary |

In overlay mode, auto-switch affects the compact widget shown. Side panel and overlay switch independently — overlay auto-switches, panel stays on user's chosen tab (or also auto-switches if preferred).

---

### 8. UI Modes

#### Side Panel Mode
- Normal OS window, ~420px wide
- Always-on-top toggle
- Tabs: **System | Route | Bio | Stats | Log**
- Full body table with configurable columns
- Trip stats bar always visible at top

#### Overlay Mode (compact HUD)
- Transparent borderless window, always on top
- Click-through by default; hotkey to unlock for interaction
- Opacity: 0.3–1.0 (slider in settings)
- Shows context-sensitive widget, auto-switches based on game state
- Compact bio list on body approach
- Compact route strip in supercruise
- System summary when in system

#### Both Active Simultaneously
- Side panel and overlay are **independent windows**
- Both share the same Rust backend state (same event stream)
- No extra cost; overlay just consumes the same events
- Each can show different views at the same time

#### Remote Mode (tablet / Steam Deck)
- Enable in settings → starts embedded `axum` HTTP server (default port `7821`)
- Serves the Svelte app as static files at `http://<host>:7821/`
- WebSocket at `ws://<host>:7821/ws` — streams all typed events
- REST API at `http://<host>:7821/api/`
- Browser on tablet/Steam Deck = full app, no install
- Optional auth: shared token (URL query param or `X-Auth-Token` header)
- Settings panel shows LAN URL + QR code for easy connection

---

### 9. Remote / RPC API

```
GET  /api/status          → current Status.json snapshot
GET  /api/system          → current system + body list with predictions
GET  /api/route           → current NavRoute snapshot
GET  /api/trip            → current trip stats
GET  /api/stats           → lifetime stats
GET  /api/bio/current     → current planet bio tracker state
POST /api/config          → update settings (threshold, columns, etc.)
POST /api/trip/reset      → reset trip stats
WS   /ws                  → real-time event stream
```

WebSocket message format:
```json
{ "type": "journal:event" | "status:update" | "edsm:system" | ..., "payload": { ... }, "ts": 1234567890 }
```

---

### 10. Comparison: What Other Tools Have

| Feature | Exploration Buddy | EDDiscovery | OD Explorer | **ED Companion** |
|---|---|---|---|---|
| Body list with values | ✓ | ✓ | ✓ | ✓ |
| Bio species prediction (Canonn) | ✓ | via plugin | ✓ | ✓ |
| Bio value min/max per planet | partial | partial | ✓ | ✓ |
| Value threshold filter | ✗ | ✗ | ✗ | **✓ configurable** |
| Per-species clonal range | ✓ | ✗ | ✗ | ✓ |
| Bio sample tracker (0/3) | ✓ | partial | ✓ | ✓ |
| Trip stats since dock | ✓ | ✓ | partial | ✓ |
| Lifetime stats | ✓ | ✓ | ✗ | ✓ |
| Configurable columns | ✗ | partial | ✗ | **✓ drag-reorder** |
| Overlay mode | ✓ HUD window | ✗ | ✗ | ✓ |
| Panel + overlay simultaneously | ✗ | ✗ | ✗ | **✓** |
| Remote access (tablet/phone) | ✗ | ✗ | ✗ | **✓ LAN web app** |
| Auto-switch views | ✓ configurable | ✗ | ✗ | ✓ |
| Neutron stars in route | partial | ✓ | ✗ | ✓ |
| Fast launch / low RAM | ✗ JVM | ✗ .NET | ✗ Python | **✓ Rust + Svelte** |

---

## Configuration (persisted)

```toml
[paths]
journal_dir = ""          # auto-detected if empty

[window]
panel_enabled = true
overlay_enabled = false   # both can be true simultaneously
panel_width = 420
panel_always_on_top = true
overlay_opacity = 0.75
overlay_click_through = true

[remote]
enabled = false
port = 7821
auth_token = ""           # empty = no auth

[bio]
value_threshold = 8000000   # Cr — planets below this are dimmed
highlight_color = "#e88c00"
dim_below_threshold = true

[autoswitch]
enabled = true
panel_autoswitch = false  # panel stays on user tab by default
overlay_autoswitch = true # overlay always context-switches

[ui]
body_columns = ["name", "type", "distance_ls", "gravity", "atmosphere", "landable", "bio_signals", "bio_value_max", "est_carto_value", "personal_status"]
```

---

## Performance Targets

| Metric | Target |
|---|---|
| Cold launch to ready | < 1.5s |
| Journal event → UI update | < 50ms |
| Status.json poll lag | ≤ 1s |
| Bio prediction (local, Canonn) | < 10ms |
| EDSM enrichment (cached) | < 5ms |
| EDSM enrichment (network) | < 2s non-blocking |
| Memory footprint | < 100MB |
| CPU idle | < 0.5% |
| Remote WS event lag | < 100ms on LAN |

---

## Platform Support

| Platform | Status |
|---|---|
| Windows 10/11 | ✅ Primary |
| Linux (Steam/Proton) | ✅ Supported |
| macOS | ❌ Out of scope |

Remote client (tablet / Steam Deck browser) works on any OS with a modern browser.

---

## Out of Scope (v1)

- Trading / combat / mining
- EDDN integration
- Spansh neutron plotter (v2)
- Voice recognition / TTS
- Multi-CMDR support
- Cloud sync
- Powerplay / BGS

---

## Project Structure

```
ed-companion/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── journal/          # watcher, parser, event types
│   │   ├── status/           # Status.json + NavRoute pollers
│   │   ├── edsm/             # API client + LRU cache
│   │   ├── bio/              # Canonn dataset loader, species predictor
│   │   ├── stats/            # trip accumulator, lifetime store
│   │   ├── remote/           # axum server, WS broadcaster, REST handlers
│   │   ├── window/           # mode switching, overlay, opacity
│   │   └── config.rs
│   ├── assets/
│   │   └── canonn_bio.json   # bundled Canonn spawn conditions
│   └── Cargo.toml
├── src/
│   ├── lib/
│   │   ├── stores/           # journal, status, edsm, route, bio, stats, trip
│   │   ├── components/
│   │   │   ├── Header.svelte
│   │   │   ├── StatusBar.svelte
│   │   │   ├── BodyTable/    # configurable column table
│   │   │   ├── BioTracker/   # planet bio panel + sample progress
│   │   │   ├── TripStats/
│   │   │   ├── LifetimeStats/
│   │   │   ├── RouteView/
│   │   │   └── overlay/      # compact HUD widget
│   │   └── utils/
│   │       ├── valueCalc.ts  # carto + bio value estimation
│   │       └── bioPredict.ts # species prediction from body params
│   ├── App.svelte
│   └── main.ts
├── SPEC.md
└── README.md
```

---

## Build Order for Claude Code

1. **`journal/`** — watcher + parser. Test with real log files. Get all event types typed.
2. **`status/`** — Status.json + NavRoute polling. Validate bitfield parsing.
3. **`stats/`** — trip accumulator wired to journal events. Test reset logic.
4. **Svelte stores + basic panel UI** — get data flowing before styling.
5. **`bio/`** — Canonn JSON loader, predictor, wire to `SAASignalsFound`.
6. **`edsm/`** — API client + LRU cache. Non-blocking enrichment.
7. **Value calculations** — carto multipliers, bio table, threshold highlighting.
8. **Column config** — drag-reorder, persist, restore.
9. **Overlay window** — transparent borderless, click-through, opacity.
10. **`remote/`** — axum server, WS broadcaster, REST endpoints. QR code in settings.
11. **Remote web client** — touch layout, WS event stream.

**When starting each Claude Code session:** paste real ED journal event JSON for the module you're implementing. The parser needs real data — the journal format has undocumented quirks that are much easier to handle from examples than docs.
