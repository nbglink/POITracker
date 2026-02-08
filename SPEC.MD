MT5 Risk-Based Trade Planner & Executor — SPECIFICATION
1. Purpose
Design and implement a local Windows application that:


Calculates trade volume (lot size) based on a defined risk percentage.


Applies configurable rules for stop distance, partial close, and break-even management.


Respects broker constraints (minimum lot 0.01).


Allows real BUY/SELL order execution in MetaTrader 5 (MT5) directly from the application.


Displays the difference between target risk and actual risk when minimum lot constraints increase exposure.


Primary instruments:


XAUUSD


BTCUSD


Secondary:


Forex pairs



2. System Overview
Architecture:
Frontend (React) → Backend API (FastAPI) → MT5 Terminal
Flow:


User enters trade parameters in UI.


Frontend calls /calc to generate trade plan.


User reviews risk and confirms.


Backend sends execution commands to MT5.



3. Technology Stack
Frontend


React (Vite)


TypeScript


LocalStorage for settings


Backend


Python 3.11+


FastAPI


Uvicorn


Pydantic


MetaTrader5 Python package (required)


Persistence


MVP: no database required


Settings stored in localStorage and optional backend JSON



4. Core Trade Inputs (Per Trade)


account_balance


risk_percent


symbol


direction (buy/sell)


stop_pips


max_stop_pips


tp1_pips


partial_percent


move_to_be_enabled


be_buffer_pips


pip_value_per_1_lot (manual for MVP)


entry_price



5. Risk and Volume Calculation
5.1 Target Risk
target_risk_amount = account_balance × risk_percent / 100
5.2 Stop Constraint
Trade is allowed only if:
stop_pips ≤ max_stop_pips
5.3 Raw Volume
volume_raw = target_risk_amount / (stop_pips × pip_value_per_1_lot)
5.4 Broker Volume Constraints


min_volume = 0.01


volume_step = 0.01


volume_step_applied = floor(volume_raw / volume_step) × volume_step
If volume_step_applied < 0.01 → volume = 0.01
5.5 Actual Risk
actual_risk_amount = volume × stop_pips × pip_value_per_1_lot
actual_risk_percent = (actual_risk_amount / account_balance) × 100
Both target and actual risk must be shown to the user.

6. Trade Management Rules
All parameters configurable:


tp1_pips


partial_percent


move_to_be_enabled


be_buffer_pips


At TP1:


Close partial_percent of volume


remaining_volume = volume × (1 − partial_percent/100)


If BE enabled → SL moves to entry_price ± be_buffer_pips



7. User Interface Requirements
Calculator Screen
Inputs:


Balance, Risk %


Symbol, Direction


Stop pips, Max stop


TP1 pips, Partial %


Break-even toggle, buffer


Pip value


Entry price


Outputs:


Trade allowed status


Volume


Target vs Actual risk


TP1 plan


Break-even plan


Risk warning if actual risk exceeds target


Settings Screen
Editable defaults:


max_stop_pips


tp1_pips


partial_percent


move_to_be_enabled


be_buffer_pips


min_volume (default 0.01)


volume_step (default 0.01)



8. Backend API
Base URL: http://localhost:8000
GET /health
Returns service status.
POST /calc
Returns:


allowed


volume_raw


volume


target_risk_amount


actual_risk_amount


target_risk_percent


actual_risk_percent


tp1_pips


partial_percent


remaining_volume


warnings


GET /mt5/status
Returns MT5 connection and trading status.
POST /mt5/order
Places market or limit order.
POST /mt5/partial-close
Closes a percentage of an open position.
POST /mt5/modify-sl
Modifies stop-loss level.

9. Execution Safety
Execution must be protected by:


UI “ARMED” toggle


Backend EXECUTION_ENABLED flag


Orders cannot be sent when disabled.

10. Acceptance Criteria
✔ All risk and management parameters are configurable
✔ Volume never below 0.01
✔ Target vs actual risk is displayed
✔ Orders can be executed via MT5
✔ Runs locally on Windows