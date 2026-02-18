# MT5 Risk-Based POI Trade Planner & Executor — SPECIFICATION

Last updated: 2026-02-18

---

## 1. Overview

### 1.1 What This Tool Does

A local Windows application for **POI-based trading**. Traders analyze their charts in MetaTrader 5, identify Points of Interest (Fair Value Gaps, Order Blocks, liquidity sweeps, supply/demand zones), and use this tool to:

1. **Calculate** the correct lot size for a given risk percentage and stop distance.
2. **Place** market or pending orders at POI levels with proper risk management.
3. **Manage** open trades: automated TP1 partial close, SL move to break-even, and manual partial close at any time.
4. **Monitor** positions with real-time price streaming and toast notifications for TP1/SL events.

The tool does **not** detect or draw POIs — the trader performs the chart analysis; this tool handles execution and risk management.

### 1.2 Primary Instruments

| Instrument | Pip Size | Default SL | Default TP1 | Max SL |
|------------|----------|------------|-------------|--------|
| XAUUSD     | 0.10     | 50 pips    | 30 pips     | 50 pips |
| BTCUSD     | 1.00     | 500 pips   | 300 pips    | 1000 pips |
| Forex      | 0.0001   | 50 pips    | 30 pips     | 50 pips |

Secondary: any symbol available in the trader's MT5 terminal.

---

## 2. Trading Strategy & Rules

### 2.1 Entry

The trader identifies a POI on the chart and enters:

- **Entry price** — the POI level (or current market price for immediate entry).
- **Direction** — buy or sell.
- **Stop-loss distance in pips** — distance from entry to the invalidation level.
- **Risk percentage** — how much of the account to risk on this trade.

The tool calculates the lot size and shows the full trade plan before execution.

### 2.2 Stop-Loss Constraints

Each instrument has a **maximum allowed stop-loss** enforced by the strategy:

| Instrument | Max Stop-Loss |
|------------|---------------|
| XAUUSD     | 50 pips       |
| BTCUSD     | 1000 pips     |
| Forex      | 50 pips       |

If the trader enters a stop distance **exceeding the max**, the UI:

- Shows a **warning banner** that this stop is too large for the strategy.
- Marks the trade as **not allowed** (`allowed = false`).
- The execute button is **disabled/blocked** — the order cannot be sent.

This enforces discipline — if the POI requires a wider stop, the trader should skip the trade or find a tighter entry.

### 2.3 TP1 — Automatic Partial Close + Break-Even

Once a trade is open, the **TP1 rule** activates:

| Instrument | TP1 Distance | Action at TP1 |
|------------|-------------|---------------|
| XAUUSD     | +30 pips    | Close 50% of position, move SL to break-even |
| BTCUSD     | +300 pips   | Close 50% of position, move SL to break-even |
| Forex      | +30 pips    | Close 50% of position, move SL to break-even |

**How it works:**

1. Price moves **+30 pips** (XAUUSD) or **+300 pips** (BTCUSD) in the trade's favor.
2. The tool **closes 50%** of the position (volume normalized to broker's volume_step).
3. The tool **moves SL to the entry price** (break-even), locking in a risk-free remainder.
4. The remaining 50% runs with zero risk — the trader manages the exit manually or lets it hit SL at BE.

**TP1 can be triggered two ways:**

- **Automatically** — via the background TP1 Watcher (polls every 500ms, no screen-watching needed).
- **Manually** — via the "TP1" button in the PostOrderPanel UI.

### 2.4 Manual Partial Close (Any Time)

While a position is open, the trader can **manually close a portion** at any time using the PostOrderPanel:

| Button | Action |
|--------|--------|
| **25%** | Close 25% of the current position volume |
| **50%** | Close 50% of the current position volume |
| **75%** | Close 75% of the current position volume |
| **100%** | Close the entire position |

The backend normalizes the close volume to the broker's `volume_step` and **blocks** the close if:

- The remaining volume would fall **below `min_lot`** (would create an un-closeable micro-position).
- The close volume itself is below `min_lot`.

This prevents the trader from accidentally leaving a tiny position that the broker won't allow to close.

### 2.5 When a Trade Goes Against You

If the trade moves against the trader and hits the stop-loss:

- The **maximum loss** is limited to the pre-calculated risk amount (e.g., 1% of account balance).
- The TP1 Watcher detects the position disappearance, looks up the deal history, and displays a **toast notification** with the realized loss amount.
- If TP1 had **already been triggered** (SL moved to BE), the loss is **zero** — the trade was risk-free.

### 2.6 Strategy Summary

```
Entry at POI Level (FVG / Order Block / Supply-Demand Zone)
│
├─── Price moves IN FAVOR (+30 pips XAUUSD / +300 pips BTCUSD)
│    ├── ✅ Close 50% of position (lock profit)
│    ├── ✅ Move SL → Break-Even (trade is now risk-free)
│    └── Remaining 50% runs freely — manage exit manually
│
├─── Price moves AGAINST and hits Stop-Loss (before TP1)
│    └── ❌ Lose the pre-calculated risk amount (e.g., 1% of account)
│
└─── At ANY TIME while position is open
     └── 🔧 Manual partial close: 25% / 50% / 75% / 100%
```

---

## 3. Architecture

```
┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│  React/Vite (5173)  │──HTTP─▶  FastAPI (8000)      │──MT5──▶  MT5 Terminal   │
│  TypeScript         │──WS───▶  Python              │  API  │  (Windows)      │
│  Tailwind CSS       │       │  Pydantic            │       │                 │
└─────────────────────┘       └──────────────────────┘       └─────────────────┘
```

### 3.1 Technology Stack

| Layer        | Technology                                    |
|--------------|-----------------------------------------------|
| Frontend     | React 18, TypeScript, Vite 5, Tailwind CSS    |
| State        | React Context + localStorage persistence      |
| HTTP Client  | Axios (base URL `localhost:8000`, 10s timeout) |
| Backend      | Python 3.11+, FastAPI, Pydantic               |
| Broker API   | MetaTrader5 Python package                    |
| Config       | pydantic-settings, `.env` file                |
| OS           | Windows-only (MT5 Python API constraint)      |

### 3.2 End-to-End Trade Flow

```
1. Trader identifies POI on MT5 chart (FVG, Order Block, etc.)
         │
2. Enters entry price, stop distance, risk %, direction
         │
3. UI calls POST /calc
   └── Backend auto-derives pip value from MT5
   └── risk_engine computes lot size (pure math, Decimal)
         │
4. UI displays: volume, target vs actual risk, warnings, TP1 plan
         │
5. Trader arms toggle → clicks "Execute"
         │
6. UI calls POST /mt5/order
   └── Dual authorization check (backend flag + UI armed)
   └── Order placed in MT5 (market or pending)
         │
7. PostOrderPanel appears with trade management controls
   ├── TP1 button (manual)
   ├── Partial close buttons: 25% / 50% / 75% / 100%
   ├── Move SL to BE button
   └── Auto TP1 Watcher toggle
         │
8. Background: TP1 Watcher polls positions every 500ms
         │
9. Toast notifications on TP1 hit (profit) or SL hit (loss)
```

---

## 4. Risk & Volume Calculation

All calculation logic lives in `risk_engine.py` — **pure math, zero MT5 imports**, fully unit-testable in isolation.

### 4.1 Core Formula

```
target_risk   = account_balance × risk_percent / 100
volume_raw    = target_risk / (stop_pips × pip_value_per_1_lot)
```

### 4.2 Broker Constraints (Decimal Arithmetic)

1. **Floor** `volume_raw` to the nearest `volume_step` (never round up — never risk more than intended).
2. **Enforce minimum**: if floored volume < `min_volume`, use `min_volume` (ceil-aligned to step).
3. All arithmetic uses Python `Decimal` to avoid floating-point step bugs.

### 4.3 Actual vs Target Risk

Because minimum lot enforcement can push volume above what the formula produced:

```
actual_risk_amount  = volume × stop_pips × pip_value_per_1_lot
actual_risk_percent = (actual_risk_amount / account_balance) × 100
```

The UI displays **both** target and actual risk side-by-side so the trader always sees real exposure.

### 4.4 Warnings

| Condition | Warning | Effect |
|-----------|---------|--------|
| `stop_pips > max_stop_pips` | "Stop exceeds maximum for this strategy" | Trade **blocked** |
| Volume forced to min_lot | "Volume rounded to minimum — actual risk exceeds target" | Trade allowed, warning shown |
| `actual_risk > 110% of target` | "Actual risk significantly exceeds target" | Trade allowed, warning shown |

### 4.5 Trade Plan Output

The calculation also returns the full TP1 management plan:

- **TP1 price** — entry ± tp1_pips (direction-aware)
- **Partial close volume** — 50% of position, normalized to volume_step
- **Break-even SL price** — entry price ± optional buffer
- **Remaining volume** — what stays open after TP1

---

## 5. Pip Value Derivation

The backend automatically computes `pip_value_per_1_lot` from MT5 symbol data. Located in `pip_specs.py`.

### 5.1 Preferred Method

Use `mt5.order_calc_profit()` to simulate a 1-lot position moving +1 pip. Handles cross-currency conversion to the account currency automatically.

### 5.2 Fallback Formula

```
pip_value_per_1_lot = (pip_in_price / tick_size) × tick_value
```

### 5.3 Pip Definitions

| Instrument Type  | `pip_in_price` | Example |
|-----------------|----------------|---------|
| XAU / Gold      | 0.10           | XAUUSD  |
| BTC             | 1.00           | BTCUSD  |
| Forex (5-digit) | 0.0001         | EURUSD  |
| Forex (3-digit) | 0.01           | USDJPY  |

### 5.4 Fallback Chain

MT5 available → use `order_calc_profit()` → if that fails → use tick formula → if MT5 unavailable entirely → use client-provided `pip_value_per_1_lot` from symbol preset.

---

## 6. Execution Safety — Dual Authorization

**ALL order execution requires BOTH checks to pass. Never bypass this pattern.**

### 6.1 Two Independent Guards

| Guard | Source | Default |
|-------|--------|---------|
| Backend flag | `MT5_EXECUTION_ENABLED` environment variable | `false` |
| UI armed state | Frontend toggle + `ui_armed` request parameter | `false` |

### 6.2 Authorization Matrix

| Backend Flag | UI Armed | Result |
|:------------:|:--------:|:------:|
| ❌ | ❌ | **Denied** |
| ✅ | ❌ | **Denied** |
| ❌ | ✅ | **Denied** |
| ✅ | ✅ | **✅ Allowed** |

### 6.3 Enforcement Points

Every mutation endpoint in `api/mt5.py` calls `check_execution_auth()`:

- `POST /mt5/order` — place order
- `POST /mt5/partial-close` — close 25/50/75/100%
- `POST /mt5/modify-sl` — change stop-loss
- `POST /mt5/move-to-be` — move SL to break-even
- `POST /mt5/tp1` — combined TP1 action
- `POST /mt5/tp1/watcher` — start watcher (start only)

Also checked **per tick** inside the TP1 Watcher background thread — if the trader disarms mid-run, the watcher stops executing but keeps monitoring.

---

## 7. Backend API Reference

Base URL: `http://localhost:8000`

### 7.1 Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | `{ "status": "ok" }` |
| GET | `/mt5/status` | Terminal + account connectivity snapshot |
| GET | `/mt5/diagnostics` | Python version, MT5 init, terminal/account info |
| GET | `/mt5/symbols` | All symbols with derived pip/tick/pip_value fields |

### 7.2 Calculation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/calc` | Calculate volume, risk, warnings, and TP1 plan |
| GET | `/calc/defaults/{symbol}` | Symbol-specific default SL/TP/pip_value |

### 7.3 Arming & Execution Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mt5/armed` | Current armed state |
| POST | `/mt5/armed` | Set UI armed state `{ armed: bool }` |
| POST | `/mt5/execution-enable` | Set backend execution flag `{ armed: bool }` |

### 7.4 Order & Position Operations *(execution-guarded)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mt5/order` | Place market or pending order at POI level |
| POST | `/mt5/partial-close` | Close 25/50/75/100% of a position |
| POST | `/mt5/modify-sl` | Modify stop-loss for a position |
| POST | `/mt5/move-to-be` | Move SL to break-even (entry price) |
| GET | `/mt5/position/{ticket}` | Resolve a position snapshot |
| GET | `/mt5/positions` | List open positions (MAGIC-filtered) |

**Partial close payload:**
- Preferred: `{ position_ticket, percent, ui_armed }`
- Legacy: `{ ticket, volume, ui_armed }`
- Backend normalizes volume to broker step and blocks unsafe closes.

### 7.5 TP1 Management *(execution-guarded)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mt5/tp1` | Combined: partial close (50%) + move SL to BE |
| POST | `/mt5/tp1/watcher` | Start/stop background watcher `{ enabled, ui_armed }` |
| GET | `/mt5/tp1/watcher/status` | Watcher diagnostics (running, watched positions, last events) |

### 7.6 WebSocket — Live Data

**Endpoint:** `WS /ws/live`

Client → Server:

| Message Type | Payload | Action |
|-------------|---------|--------|
| `subscribe` | `{ symbol }` | Start tick streaming for symbol |
| `unsubscribe` | — | Stop tick streaming |
| `toggle_account` | `{ enabled }` | Start/stop account balance updates |
| `ping` | — | Keepalive |

Server → Client:

| Message Type | Payload |
|-------------|---------|
| `tick` | `{ symbol, bid, ask, spread, time }` |
| `account` | `{ balance, equity, margin, free_margin, currency }` |

REST fallbacks: `GET /live/price/{symbol}`, `GET /live/account`

---

## 8. TP1 Watcher — Background Automation

### 8.1 Purpose

Monitors open positions in the background and fires TP1 automatically — the trader doesn't need to watch the screen.

### 8.2 Behavior

1. Runs as a **background thread** inside the FastAPI process.
2. Polls MT5 every **500ms** for position price updates.
3. Filters to app-owned positions only (`MAGIC = 123456`, comment prefix `POI-Tracker`).
4. When price reaches TP1 level:
   - Close 50% of the position.
   - Move SL to break-even.
   - Mark the position as "TP1 done".
5. When a tracked position disappears:
   - Look up deal history for realized P&L.
   - Report SL hit event with profit/loss amount.

### 8.3 Safety

- **Cross-process file lock** (`.tp1_watcher.lock`) with PID-based stale detection prevents duplicate watchers.
- **Dual authorization checked per tick** — disarming the UI stops execution immediately.

### 8.4 Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `tp1_pips_default` | 30.0 | Pips to TP1 |
| `tp1_percent_default` | 50.0 | % of position to close at TP1 |
| `tp1_be_buffer_pips` | 0.0 | Buffer pips above BE when moving SL |
| `tp1_poll_interval_s` | 0.5 | Poll interval in seconds |

---

## 9. Frontend Components

### 9.1 Component Map

| Component | Purpose |
|-----------|---------|
| `Calculator.tsx` | Main page — orchestrates the entire trade flow |
| `InputForm.tsx` | Account, symbol, direction, entry price, stop distance, risk % |
| `VolumeHero.tsx` | Large lot-size display with READY / CAUTION / BLOCKED status |
| `WarningBanner.tsx` | Strategy warnings (stop too large, min-lot enforced) |
| `RiskVisualizer.tsx` | Bar chart comparing target vs actual risk in $ and % |
| `TradePreview.tsx` | TP1 plan: partial close details, BE price, remaining volume |
| `ArmedToggle.tsx` | Dual-auth toggle with visual armed / disarmed state |
| `ExecuteTradeButton.tsx` | Sends order — disabled when not armed or trade not allowed |
| `PostOrderPanel.tsx` | Trade management: TP1, partial close (25/50/75/100%), BE, close all |
| `SymbolsPanel.tsx` | Browse MT5 symbols, select favorites, apply as presets |
| `Toast.tsx` | Notifications for TP1 hit (profit) and SL hit (loss) |

### 9.2 State Management

- **SettingsContext** — persists user settings (risk %, symbol presets) to `localStorage`.
- **useCalculation** — hook wrapping `POST /calc` with loading/error/result state.
- **useLiveData** — WebSocket hook with auto-reconnect, provides live bid/ask and account balance.

### 9.3 Live Data Integration

InputForm supports **"Live Balance"** and **"Live Price"** toggles:

- When enabled, fields auto-update from WebSocket data in real time.
- Fields become read-only (grayed out) to indicate they are streaming.

---

## 10. Configuration

Backend loads `.env` with prefix `MT5_` via pydantic-settings.

| Variable | Default | Description |
|----------|---------|-------------|
| `MT5_EXECUTION_ENABLED` | `false` | Global execution safety flag |
| `MT5_LOGIN` | — | MT5 account login (optional auto-login) |
| `MT5_PASSWORD` | — | MT5 account password |
| `MT5_SERVER` | — | MT5 broker server name |
| `MT5_PATH` | — | Path to MT5 terminal executable |
| `MT5_DEBUG` | `false` | Enable debug logging |

---

## 11. Acceptance Criteria

- [ ] Trader enters a POI entry price and stop distance → tool calculates the correct lot size.
- [ ] Stop-loss exceeding the max for the instrument shows a warning and **blocks execution**.
- [ ] Risk calculation uses `Decimal` arithmetic and respects broker `min_volume` and `volume_step`.
- [ ] UI displays both target and actual risk amounts side by side.
- [ ] Dual authorization (UI armed + backend flag) is enforced on **all** execution endpoints.
- [ ] Market and pending orders can be placed at POI levels.
- [ ] TP1 auto-fires at +30 pips (XAUUSD) / +300 pips (BTCUSD): closes 50%, moves SL to BE.
- [ ] TP1 can also be triggered manually via the PostOrderPanel button.
- [ ] Manual partial close available at **25%, 50%, 75%, 100%** at any time while a position is open.
- [ ] Partial close respects `volume_step` and blocks unsafe closes (remainder < `min_lot`).
- [ ] TP1 Watcher runs in background with cross-process lock and per-tick auth check.
- [ ] Toast notifications display on TP1 hit (profit taken) and SL hit (loss realized).
- [ ] Live price and account data stream via WebSocket with auto-reconnect.
- [ ] Pip value is auto-derived from MT5; falls back to client-provided value when unavailable.
