"""
Wrapper around MetaTrader5 Python API.

Handles:
- initialize connection
- place order
- partial close
- modify SL
- TP1 background watcher
"""
import MetaTrader5 as mt5
import threading
import os
import sys
import time
import json
import logging
from typing import Optional, Dict, Any
from app.models import (
    MT5Status,
    OrderRequest,
    PartialCloseRequest,
    PartialCloseResponse,
    OrderResponse,
    PositionInfo,
    PositionResponse,
    MoveToBERequest,
    TradeDirection,
)
from app.config import settings
from app.services.pip_specs import pip_in_price_for_symbol, pip_spec_from_mt5
from app.services.volume_normalizer import floor_to_step
from datetime import datetime, timedelta


MAGIC = 123456
ORDER_COMMENT = "POI-Tracker"

logger = logging.getLogger("tp1_watcher")


class MT5Service:
    """MT5 API wrapper service."""

    def __init__(self):
        self._connected = False

    def connect(self) -> bool:
        """
        Initialize MT5 connection.

        Returns:
            True if connection successful, False otherwise
        """
        if not mt5.initialize():
            print(f"MT5 initialization failed: {mt5.last_error()}")
            return False

        # Login if credentials provided
        if settings.mt5_login and settings.mt5_password and settings.mt5_server:
            if not mt5.login(settings.mt5_login, settings.mt5_password, settings.mt5_server):
                print(f"MT5 login failed: {mt5.last_error()}")
                return False

        self._connected = True
        return True

    def disconnect(self):
        """Shutdown MT5 connection."""
        if self._connected:
            mt5.shutdown()
            self._connected = False

    def is_connected(self) -> bool:
        """Check if MT5 is connected."""
        # Check if terminal info is available (implies initialized)
        return mt5.terminal_info() is not None

    def get_status(self) -> MT5Status:
        """Get MT5 connection and account status."""
        # 1) Lazy init
        mt5.initialize()
        
        # 3) Check last error immediately
        last_error = str(mt5.last_error())
        
        # 2) Fetch info
        terminal_info = mt5.terminal_info()
        account_info = mt5.account_info()
        
        # Determine strict connection status
        connected = bool(terminal_info) and terminal_info.connected == True
        
        return MT5Status(
            connected=connected,
            terminal_connected=terminal_info.connected if terminal_info else False,
            terminal_trade_allowed=terminal_info.trade_allowed if terminal_info else False,
            account_trade_allowed=account_info.trade_allowed if account_info else False,
            account_info=account_info._asdict() if account_info else None,
            terminal_info=terminal_info._asdict() if terminal_info else None,
            last_error=last_error
        )

    def _map_mt5_error(self, retcode: int) -> str:
        """Map MT5 return codes to user-friendly error messages."""
        error_map = {
            10004: "Requote - Price changed, try again",
            10006: "Order rejected by broker",
            10014: "Invalid volume - Check minimum lot size",
            10015: "Invalid price - Check symbol specifications",
            10016: "Invalid stops - Check stop levels",
            10019: "Not enough money - Insufficient account balance",
            10020: "Prices changed - Market conditions changed",
            10021: "Too many requests - Slow down order placement",
            10025: "No changes made - Order already in requested state",
            10026: "Auto trading disabled - Enable auto trading in MT5",
            10027: "Client disabled - Contact broker",
            10030: "Invalid request - Check order parameters",
            10031: "Market closed - Trading hours restriction",
        }
        return error_map.get(retcode, f"MT5 Error {retcode}")

    def _ensure_connected(self) -> bool:
        if not self.is_connected():
            return self.connect()
        return True

    def _symbol_volume_specs(self, symbol: str) -> tuple[float, float, float]:
        info = mt5.symbol_info(symbol)
        if not info:
            return (0.0, 0.0, 0.0)
        volume_min = float(getattr(info, "volume_min", 0.0) or 0.0)
        volume_step = float(getattr(info, "volume_step", 0.0) or 0.0)
        volume_max = float(getattr(info, "volume_max", 0.0) or 0.0)
        return (volume_min, volume_step, volume_max)

    def normalize_close_volume(self, symbol: str, position_volume: float, percent: float) -> Dict[str, Any]:
        """Compute broker-safe close volume for a partial close.

        Never rounds up (floors to step). Blocks unsafe cases.
        """
        volume_min, volume_step, _ = self._symbol_volume_specs(symbol)
        pos_vol = float(position_volume)
        pct = float(percent)

        requested_volume = pos_vol * (pct / 100.0)
        if pct >= 100.0:
            close_volume = pos_vol
        else:
            close_volume = floor_to_step(requested_volume, float(volume_step or 0.0))

        remaining_volume = pos_vol - float(close_volume)
        blocked_reason: Optional[str] = None

        if pos_vol <= 0:
            blocked_reason = "position_volume_invalid"
        elif float(volume_min or 0.0) <= 0 or float(volume_step or 0.0) <= 0:
            blocked_reason = "symbol_specs_unavailable"
        elif pct < 100.0 and close_volume < float(volume_min or 0.0):
            blocked_reason = "requested_close_below_min_lot"
        elif remaining_volume > 0 and remaining_volume < float(volume_min or 0.0):
            blocked_reason = "remaining_below_min_lot"
        elif pct < 100.0 and close_volume >= pos_vol:
            blocked_reason = "would_close_full_position"

        return {
            "requested_volume": float(requested_volume),
            "close_volume": float(close_volume),
            "remaining_volume": float(max(0.0, remaining_volume)),
            "blocked_reason": blocked_reason,
            "volume_min": float(volume_min or 0.0),
            "volume_step": float(volume_step or 0.0),
        }

    def _resolve_position(self, ticket: int):
        """Resolve an open position from either a position ticket or an order ticket."""
        pos = mt5.positions_get(ticket=ticket)
        if pos:
            return pos[0]

        # If this is an order ticket, find the most recent deal for it and use its position_id.
        now = datetime.now()
        start = now - timedelta(hours=6)
        try:
            deals = mt5.history_deals_get(start, now)
        except Exception:
            deals = None

        if deals:
            # Prefer entry-in deals when available.
            matching = [d for d in deals if getattr(d, "order", None) == ticket]
            if matching:
                # Pick latest by time_msc if present, else by time.
                def _key(d):
                    return getattr(d, "time_msc", 0) or int(getattr(d, "time", 0) or 0)

                matching.sort(key=_key, reverse=True)
                position_id = getattr(matching[0], "position_id", None)
                if position_id:
                    pos2 = mt5.positions_get(ticket=int(position_id))
                    if pos2:
                        return pos2[0]

        return None

    def get_position(self, ticket: int) -> PositionResponse:
        if not self._ensure_connected():
            return PositionResponse(success=False, error="MT5 not connected")

        position = self._resolve_position(ticket)
        if not position:
            return PositionResponse(success=False, error=f"Position not found for ticket {ticket}")

        symbol = str(position.symbol)
        info = mt5.symbol_info(symbol)
        digits = int(getattr(info, "digits", 5) or 5) if info else 5
        pip_in_price = float(pip_in_price_for_symbol(symbol, digits))
        volume_min, volume_step, _ = self._symbol_volume_specs(symbol)

        # MT5-derived pip value (account currency per pip per 1.0 lot) so the UI
        # can show live money P&L. 0.0 when specs are unavailable.
        pip_spec = pip_spec_from_mt5(symbol)
        pip_value_per_1_lot = float(pip_spec.pip_value_per_1_lot) if pip_spec and pip_spec.pip_value_per_1_lot > 0 else 0.0

        direction = TradeDirection.BUY if int(position.type) == mt5.POSITION_TYPE_BUY else TradeDirection.SELL

        return PositionResponse(
            success=True,
            position=PositionInfo(
                position_ticket=int(position.ticket),
                symbol=symbol,
                direction=direction,
                volume=float(position.volume),
                price_open=float(position.price_open),
                sl=float(position.sl) if position.sl else None,
                tp=float(position.tp) if position.tp else None,
                digits=digits,
                pip_in_price=pip_in_price,
                pip_value_per_1_lot=pip_value_per_1_lot,
                volume_min=float(volume_min or 0.0),
                volume_step=float(volume_step or 0.0),
            ),
        )

    def list_positions(self):
        """List open MT5 positions filtered by MAGIC."""
        if not self._ensure_connected():
            return []

        positions = mt5.positions_get()
        if not positions:
            return []

        from app.models import OpenPositionInfo

        out: list[OpenPositionInfo] = []
        for p in positions:
            try:
                if int(getattr(p, "magic", 0) or 0) != MAGIC:
                    continue

                out.append(
                    OpenPositionInfo(
                        ticket=int(getattr(p, "ticket")),
                        symbol=str(getattr(p, "symbol")),
                        type=int(getattr(p, "type")),
                        volume=float(getattr(p, "volume")),
                        price_open=float(getattr(p, "price_open")),
                        sl=float(getattr(p, "sl")) if getattr(p, "sl", None) else None,
                        tp=float(getattr(p, "tp")) if getattr(p, "tp", None) else None,
                        magic=int(getattr(p, "magic", 0) or 0),
                        comment=str(getattr(p, "comment", None)) if getattr(p, "comment", None) is not None else None,
                        time=int(getattr(p, "time", 0) or 0) if getattr(p, "time", None) is not None else None,
                    )
                )
            except Exception:
                continue

        return out

    # Map MT5 pending order types → (human label, direction).
    _PENDING_TYPE_MAP = {
        2: ("BUY LIMIT", TradeDirection.BUY),
        3: ("SELL LIMIT", TradeDirection.SELL),
        4: ("BUY STOP", TradeDirection.BUY),
        5: ("SELL STOP", TradeDirection.SELL),
        6: ("BUY STOP LIMIT", TradeDirection.BUY),
        7: ("SELL STOP LIMIT", TradeDirection.SELL),
    }

    def list_orders(self):
        """List working (pending) MT5 orders filtered by MAGIC."""
        if not self._ensure_connected():
            return []

        orders = mt5.orders_get()
        if not orders:
            return []

        from app.models import OpenOrderInfo

        out: list[OpenOrderInfo] = []
        for o in orders:
            try:
                if int(getattr(o, "magic", 0) or 0) != MAGIC:
                    continue

                otype = int(getattr(o, "type"))
                label, direction = self._PENDING_TYPE_MAP.get(otype, ("PENDING", TradeDirection.BUY))

                out.append(
                    OpenOrderInfo(
                        ticket=int(getattr(o, "ticket")),
                        symbol=str(getattr(o, "symbol")),
                        type=otype,
                        type_label=label,
                        direction=direction,
                        volume=float(getattr(o, "volume_current", 0.0) or 0.0),
                        price_open=float(getattr(o, "price_open", 0.0) or 0.0),
                        sl=float(getattr(o, "sl")) if getattr(o, "sl", None) else None,
                        tp=float(getattr(o, "tp")) if getattr(o, "tp", None) else None,
                        magic=int(getattr(o, "magic", 0) or 0),
                        comment=str(getattr(o, "comment", None)) if getattr(o, "comment", None) is not None else None,
                        time=int(getattr(o, "time_setup", 0) or 0) if getattr(o, "time_setup", None) is not None else None,
                    )
                )
            except Exception:
                continue

        return out

    def cancel_order(self, order_ticket: int) -> OrderResponse:
        """Cancel (remove) a working pending order by ticket."""
        if not self._ensure_connected():
            return OrderResponse(success=False, error="MT5 not connected")

        request = {
            "action": mt5.TRADE_ACTION_REMOVE,
            "order": int(order_ticket),
        }
        result = mt5.order_send(request)
        if result is None:
            return OrderResponse(success=False, error=f"order_send returned None ({mt5.last_error()})")
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return OrderResponse(success=False, ticket=int(order_ticket), error=self._map_mt5_error(result.retcode))

        return OrderResponse(success=True, ticket=int(order_ticket), order_ticket=int(order_ticket))

    def resolve_position_ticket(self, symbol: str, direction: TradeDirection) -> Optional[int]:
        """Resolve newest open position ticket by (symbol, side, MAGIC).

        Hedging accounts can have multiple positions per symbol, so we pick the newest.
        Falls back to deal history if no open position matches (fast fill + close).
        """
        if not self._ensure_connected():
            return None

        positions = mt5.positions_get(symbol=symbol)
        want_type = mt5.POSITION_TYPE_BUY if direction == TradeDirection.BUY else mt5.POSITION_TYPE_SELL

        if positions:
            filtered = [
                p
                for p in positions
                if int(getattr(p, "magic", 0) or 0) == MAGIC and int(getattr(p, "type", -1)) == int(want_type)
            ]
            if filtered:
                newest = max(filtered, key=lambda p: int(getattr(p, "time", 0) or 0))
                return int(getattr(newest, "ticket"))

        # Fallback: check deal history for recently opened positions (last 60s)
        # Covers fast-fill-and-close scenarios where the position is already gone
        try:
            now = datetime.now()
            start = now - timedelta(seconds=60)
            deals = mt5.history_deals_get(start, now)
            if deals:
                matching = [
                    d for d in deals
                    if str(getattr(d, "symbol", "")) == symbol
                    and int(getattr(d, "magic", 0) or 0) == MAGIC
                    and getattr(d, "entry", -1) == 0  # DEAL_ENTRY_IN
                ]
                if matching:
                    matching.sort(
                        key=lambda d: int(getattr(d, "time_msc", 0) or getattr(d, "time", 0) or 0),
                        reverse=True,
                    )
                    pos_id = getattr(matching[0], "position_id", None)
                    if pos_id:
                        return int(pos_id)
        except Exception:
            pass

        return None

    def move_to_be(self, request: MoveToBERequest) -> OrderResponse:
        """Move SL to BE derived from MT5 position.price_open (position ticket required)."""
        if not self._ensure_connected():
            return OrderResponse(success=False, error="MT5 not connected")

        pos = mt5.positions_get(ticket=int(request.position_ticket))
        if not pos:
            return OrderResponse(success=False, error=f"Position not found for ticket {request.position_ticket}")

        position = pos[0]
        symbol = str(position.symbol)
        info = mt5.symbol_info(symbol)
        digits = int(getattr(info, "digits", 5) or 5) if info else 5
        pip_in_price = float(pip_in_price_for_symbol(symbol, digits))

        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return OrderResponse(success=False, error=f"No tick data for {symbol}")

        point = float(getattr(info, "point", 0.0) or 0.0) if info else 0.0
        stops_level = int(getattr(info, "trade_stops_level", 0) or 0) if info else 0
        freeze_level = int(getattr(info, "trade_freeze_level", 0) or 0) if info else 0
        min_level_points = max(stops_level, freeze_level)
        min_distance = float(min_level_points) * float(point) if point > 0 else 0.0

        entry = float(position.price_open)
        buffer_price = float(request.buffer_pips) * pip_in_price
        if int(position.type) == mt5.POSITION_TYPE_BUY:
            sl_price = entry + buffer_price
        else:
            sl_price = entry - buffer_price

        # Broker constraints: keep SL far enough from current price.
        # BUY: SL must be <= bid - min_distance
        # SELL: SL must be >= ask + min_distance
        if min_distance > 0:
            if int(position.type) == mt5.POSITION_TYPE_BUY:
                max_sl = float(tick.bid) - min_distance
                sl_price = min(sl_price, max_sl)
            else:
                min_sl = float(tick.ask) + min_distance
                sl_price = max(sl_price, min_sl)

        sl_price = round(sl_price, digits)

        modify_request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": symbol,
            "sl": sl_price,
            "tp": position.tp,
            "position": int(position.ticket),
        }

        result = mt5.order_send(modify_request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return OrderResponse(success=False, error=self._map_mt5_error(result.retcode))

        return OrderResponse(success=True, ticket=int(position.ticket))

    def partial_close(self, request: PartialCloseRequest) -> PartialCloseResponse:
        """Partially close an open position (opposite DEAL with explicit volume).

        Strategy path: uses {position_ticket, percent} and broker-safe normalization.
        Legacy path: accepts {ticket, volume} but still resolves by live position ticket.
        """
        if not self._ensure_connected():
            return PartialCloseResponse(success=False, error="MT5 not connected")

        position_ticket = int(request.position_ticket or request.ticket or 0)
        if position_ticket <= 0:
            return PartialCloseResponse(success=False, error="partial-close requires position_ticket")

        pos = mt5.positions_get(ticket=int(position_ticket))
        if not pos:
            return PartialCloseResponse(success=False, position_ticket=position_ticket, error=f"Position not found for ticket {position_ticket}")

        position = pos[0]
        symbol = str(position.symbol)
        pos_volume = float(position.volume)

        percent: Optional[float] = float(request.percent) if request.percent is not None else None
        if percent is None and request.volume is not None and pos_volume > 0:
            percent = (float(request.volume) / pos_volume) * 100.0

        if percent is None:
            return PartialCloseResponse(success=False, position_ticket=position_ticket, symbol=symbol, position_volume=pos_volume, error="partial-close requires percent or volume")

        norm = self.normalize_close_volume(symbol, pos_volume, float(percent))
        requested_volume = float(norm["requested_volume"])
        close_volume = float(norm["close_volume"])
        remaining_volume = float(norm["remaining_volume"])
        blocked_reason = norm.get("blocked_reason")
        volume_min = float(norm["volume_min"])
        volume_step = float(norm["volume_step"])

        # Safety: never allow closing the full position unless percent was explicitly 100.
        if request.percent is None and close_volume >= pos_volume:
            blocked_reason = blocked_reason or "would_close_full_position"

        if blocked_reason is not None:
            return PartialCloseResponse(
                success=False,
                position_ticket=position_ticket,
                symbol=symbol,
                position_volume=pos_volume,
                percent=float(percent),
                requested_volume=requested_volume,
                close_volume=close_volume,
                remaining_volume=remaining_volume,
                blocked_reason=str(blocked_reason),
                volume_min=volume_min,
                volume_step=volume_step,
                error=f"Partial close blocked: {blocked_reason}",
            )

        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return PartialCloseResponse(
                success=False,
                position_ticket=position_ticket,
                symbol=symbol,
                position_volume=pos_volume,
                percent=float(percent),
                requested_volume=requested_volume,
                close_volume=close_volume,
                remaining_volume=remaining_volume,
                volume_min=volume_min,
                volume_step=volume_step,
                error=f"No tick data for {symbol}",
            )

        close_type = mt5.ORDER_TYPE_SELL if int(position.type) == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
        close_price = float(tick.bid) if close_type == mt5.ORDER_TYPE_SELL else float(tick.ask)

        close_request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(close_volume),
            "type": close_type,
            "position": int(position_ticket),
            "price": close_price,
            "deviation": 10,
            "magic": MAGIC,
            "comment": f"{ORDER_COMMENT}|PartialClose",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        result = mt5.order_send(close_request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return PartialCloseResponse(
                success=False,
                ticket=int(getattr(result, "order", 0) or 0) or None,
                order_ticket=int(getattr(result, "order", 0) or 0) or None,
                position_ticket=position_ticket,
                symbol=symbol,
                position_volume=pos_volume,
                percent=float(percent),
                requested_volume=requested_volume,
                close_volume=close_volume,
                remaining_volume=remaining_volume,
                blocked_reason=None,
                volume_min=volume_min,
                volume_step=volume_step,
                mt5_retcode=int(getattr(result, "retcode", 0) or 0),
                mt5_comment=str(getattr(result, "comment", "") or ""),
                error=self._map_mt5_error(result.retcode),
            )

        order_ticket = int(getattr(result, "order", 0) or 0)
        return PartialCloseResponse(
            success=True,
            ticket=order_ticket or None,
            order_ticket=order_ticket or None,
            position_ticket=position_ticket,
            symbol=symbol,
            position_volume=pos_volume,
            percent=float(percent),
            requested_volume=requested_volume,
            close_volume=close_volume,
            remaining_volume=remaining_volume,
            blocked_reason=None,
            volume_min=volume_min,
            volume_step=volume_step,
            mt5_retcode=int(getattr(result, "retcode", 0) or 0),
            mt5_comment=str(getattr(result, "comment", "") or ""),
            error=None,
        )

    def place_order(self, request: OrderRequest) -> OrderResponse:
        """
        Place a market or limit order.

        Args:
            request: Order parameters

        Returns:
            OrderResponse with success status and ticket/error
        """
        if not self._ensure_connected():
            return OrderResponse(success=False, error="MT5 not connected")

        # Determine market vs pending.
        is_pending = request.price is not None

        # Prepare default order type (market)
        order_type = mt5.ORDER_TYPE_BUY if request.direction.value == "buy" else mt5.ORDER_TYPE_SELL

        # Get symbol info for proper pricing
        symbol_info = mt5.symbol_info(request.symbol)
        if not symbol_info:
            return OrderResponse(success=False, error=f"Symbol {request.symbol} not found")

        # Ensure symbol is visible and can be traded
        if not symbol_info.visible:
            mt5.symbol_select(request.symbol, True)

        # For pending orders, choose LIMIT vs STOP based on current price.
        if is_pending:
            tick = mt5.symbol_info_tick(request.symbol)
            if not tick:
                return OrderResponse(success=False, error=f"No tick data for {request.symbol}")

            if request.direction.value == "buy":
                current = float(tick.ask)
                order_type = mt5.ORDER_TYPE_BUY_STOP if float(request.price) >= current else mt5.ORDER_TYPE_BUY_LIMIT
            else:
                current = float(tick.bid)
                order_type = mt5.ORDER_TYPE_SELL_STOP if float(request.price) <= current else mt5.ORDER_TYPE_SELL_LIMIT

        # Decide SL strategy. Market orders with stop_pips defer SL to a
        # post-fill modify so the stop is anchored to the broker's actual fill
        # price (not a stale frontend snapshot).
        post_fill_sl = (not is_pending) and request.stop_pips is not None and request.stop_pips > 0

        # For pending orders we can compute SL up-front from the configured price.
        if is_pending:
            action = mt5.TRADE_ACTION_PENDING
            price = float(request.price)
            filling = mt5.ORDER_FILLING_RETURN
            initial_sl = request.sl_price
            if initial_sl is None and request.stop_pips and request.stop_pips > 0:
                digits = int(getattr(symbol_info, "digits", 5) or 5)
                pip_in_price = float(pip_in_price_for_symbol(request.symbol, digits))
                if request.direction.value == "buy":
                    initial_sl = round(price - request.stop_pips * pip_in_price, digits)
                else:
                    initial_sl = round(price + request.stop_pips * pip_in_price, digits)
        else:
            action = mt5.TRADE_ACTION_DEAL
            price = float(symbol_info.ask) if request.direction.value == "buy" else float(symbol_info.bid)
            filling = mt5.ORDER_FILLING_IOC
            initial_sl = None if post_fill_sl else request.sl_price

        order_request = {
            "action": action,
            "symbol": request.symbol,
            "volume": request.volume,
            "type": order_type,
            "price": price,
            "sl": initial_sl if initial_sl is not None else 0.0,
            "tp": 0.0,  # TP1 is internal — never set broker-side TP
            "deviation": 10,
            "magic": MAGIC,
            "comment": ORDER_COMMENT,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling,
        }

        result = mt5.order_send(order_request)

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            error_msg = self._map_mt5_error(result.retcode)
            return OrderResponse(success=False, error=error_msg)

        order_ticket = int(getattr(result, "order", 0) or 0)
        position_ticket = None if is_pending else self.resolve_position_ticket(request.symbol, request.direction)

        # Post-fill: anchor SL to the broker's actual fill price.
        if post_fill_sl and position_ticket:
            self._apply_post_fill_sl(position_ticket, request.symbol, request.direction, float(request.stop_pips))

        return OrderResponse(
            success=True,
            ticket=order_ticket,
            order_ticket=order_ticket,
            position_ticket=position_ticket,
        )

    def _apply_post_fill_sl(self, position_ticket: int, symbol: str, direction: TradeDirection, stop_pips: float) -> None:
        """Set SL based on the position's actual fill price. Best-effort: logs on failure."""
        position = self._resolve_position(position_ticket)
        if not position:
            logger.warning("post-fill SL: position %d not found", position_ticket)
            return

        info = mt5.symbol_info(symbol)
        if not info:
            logger.warning("post-fill SL: symbol_info missing for %s", symbol)
            return

        digits = int(getattr(info, "digits", 5) or 5)
        pip_in_price = float(pip_in_price_for_symbol(symbol, digits))
        fill_price = float(position.price_open)

        if direction == TradeDirection.BUY:
            sl_price = fill_price - stop_pips * pip_in_price
        else:
            sl_price = fill_price + stop_pips * pip_in_price
        sl_price = round(sl_price, digits)

        modify_request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": symbol,
            "sl": sl_price,
            "tp": position.tp,
            "position": int(position.ticket),
        }
        result = mt5.order_send(modify_request)
        if getattr(result, "retcode", None) != mt5.TRADE_RETCODE_DONE:
            logger.warning(
                "post-fill SL modify failed for %d: retcode=%s sl=%s",
                position_ticket, getattr(result, "retcode", None), sl_price,
            )

# Singleton instance
mt5_service = MT5Service()


# ---------------------------------------------------------------------------
# TP1 Watcher — background thread + cross-process file lock
# ---------------------------------------------------------------------------

_LOCK_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".tp1_watcher.lock")


def _is_pid_alive(pid: int) -> bool:
    """Check if a PID is still running (Windows-safe)."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        SYNCHRONIZE = 0x00100000
        handle = kernel32.OpenProcess(SYNCHRONIZE, False, pid)
        if handle:
            kernel32.CloseHandle(handle)
            return True
        return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


class _FileLock:
    """Cross-process exclusive lock using OS-level file locking (Windows + Linux)."""

    def __init__(self, path: str):
        self._path = os.path.abspath(path)
        self._fd: Optional[int] = None

    def acquire(self) -> bool:
        """Try to acquire lock. Returns True on success, False if held elsewhere."""
        # Stale-lock cleanup
        if os.path.exists(self._path):
            try:
                with open(self._path, "r") as f:
                    data = json.loads(f.read())
                old_pid = int(data.get("pid", 0))
                if old_pid > 0 and not _is_pid_alive(old_pid):
                    os.remove(self._path)
            except Exception:
                try:
                    os.remove(self._path)
                except OSError:
                    pass

        try:
            fd = os.open(self._path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except (FileExistsError, OSError):
            return False

        # OS-level lock for belt-and-suspenders safety
        try:
            if sys.platform == "win32":
                import msvcrt
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except Exception:
            os.close(fd)
            try:
                os.remove(self._path)
            except OSError:
                pass
            return False

        info = json.dumps({"pid": os.getpid(), "ts": time.time()})
        os.write(fd, info.encode())
        self._fd = fd
        return True

    def release(self):
        """Release lock and clean up."""
        if self._fd is not None:
            try:
                if sys.platform == "win32":
                    import msvcrt
                    try:
                        msvcrt.locking(self._fd, msvcrt.LK_UNLCK, 1)
                    except Exception:
                        pass
                else:
                    import fcntl
                    try:
                        fcntl.flock(self._fd, fcntl.LOCK_UN)
                    except Exception:
                        pass
                os.close(self._fd)
            except OSError:
                pass
            self._fd = None
        try:
            os.remove(self._path)
        except OSError:
            pass

    def read_info(self) -> Optional[dict]:
        """Read lock file diagnostics (if file exists)."""
        try:
            with open(self._path, "r") as f:
                return json.loads(f.read())
        except Exception:
            return None


class TP1WatcherManager:
    """Singleton manager for the TP1 background watcher thread."""

    def __init__(self):
        self._lock = _FileLock(_LOCK_PATH)
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._tp1_done: Dict[int, bool] = {}
        self._ui_armed = False
        self._running = False
        self._last_error: Optional[str] = None
        self._started_at: Optional[float] = None
        self._last_tp1_event: Optional[Dict[str, Any]] = None
        self._last_sl_event: Optional[Dict[str, Any]] = None
        self._tracked_positions: Dict[int, Dict[str, Any]] = {}
        self._consecutive_connect_failures: int = 0
        self._MAX_CONNECT_FAILURES_LOG: int = 30  # log error after ~15s at 0.5s poll
        # Per-call overrides for TP1 parameters. None ⇒ fall back to config defaults.
        self._tp1_pips_override: Optional[float] = None
        self._tp1_percent_override: Optional[float] = None
        self._be_buffer_override: Optional[float] = None

    def start(
        self,
        ui_armed: bool,
        tp1_pips: Optional[float] = None,
        tp1_percent: Optional[float] = None,
        be_buffer_pips: Optional[float] = None,
    ) -> dict:
        """Start the watcher if not already running and lock acquired.

        Override fields are kept up to date even when the watcher is already
        running, so the UI can adjust TP1 distance / percent without restarting.
        """
        # Always update overrides; the loop reads them per tick.
        self._tp1_pips_override = tp1_pips
        self._tp1_percent_override = tp1_percent
        self._be_buffer_override = be_buffer_pips

        if self._running and self._thread and self._thread.is_alive():
            return {"running": True, "locked": True, "pid": os.getpid(), "message": "already_running"}

        if not self._lock.acquire():
            return {"running": False, "locked": False, "reason": "already_running_elsewhere"}

        self._ui_armed = ui_armed
        self._stop_event.clear()
        self._last_error = None
        self._started_at = time.time()
        self._running = True

        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="tp1-watcher")
        self._thread.start()

        return {"running": True, "locked": True, "pid": os.getpid()}

    def stop(self) -> dict:
        """Stop the watcher and release the lock."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        self._running = False
        self._consecutive_connect_failures = 0
        try:
            self._lock.release()
        except Exception:
            pass
        return {"running": False, "locked": False}

    def status(self) -> dict:
        lock_info = self._lock.read_info()
        thread_alive = self._thread is not None and self._thread.is_alive()
        actually_running = self._running and thread_alive

        # Auto-cleanup: if we think we're running but thread died, fix the state
        if self._running and not thread_alive:
            logger.warning("TP1 watcher thread died unexpectedly, cleaning up")
            self._running = False
            self._consecutive_connect_failures = 0
            try:
                self._lock.release()
            except Exception:
                pass

        return {
            "running": actually_running,
            "lock_owner_pid": int(lock_info["pid"]) if lock_info and "pid" in lock_info else None,
            "lock_age_seconds": round(time.time() - lock_info["ts"], 1) if lock_info and "ts" in lock_info else None,
            "watched_positions": len([k for k, v in self._tp1_done.items() if not v]),
            "tp1_done_count": len([k for k, v in self._tp1_done.items() if v]),
            "last_error": self._last_error,
            "last_tp1_event": self._last_tp1_event,
            "last_sl_event": self._last_sl_event,
            "mt5_connected": self._consecutive_connect_failures == 0,
            "consecutive_connect_failures": self._consecutive_connect_failures,
            "ui_armed": self._ui_armed,
        }

    def set_ui_armed(self, armed: bool):
        self._ui_armed = armed

    # ---- watcher loop ------------------------------------------------------

    def _run_loop(self):
        """Background loop: poll positions, check TP1 triggers, execute."""
        from app.services.execution_guard import execution_guard

        poll_s = float(settings.tp1_poll_interval_s)
        logger.info("TP1 watcher started (poll=%.1fs, override_pips=%s, override_pct=%s)",
                    poll_s, self._tp1_pips_override, self._tp1_percent_override)

        try:
            while not self._stop_event.is_set():
                # Resolve effective parameters per tick so live UI overrides take effect.
                tp1_pips = float(self._tp1_pips_override) if self._tp1_pips_override and self._tp1_pips_override > 0 else float(settings.tp1_pips_default)
                tp1_percent = float(self._tp1_percent_override) if self._tp1_percent_override and self._tp1_percent_override > 0 else float(settings.tp1_percent_default)
                be_buffer = float(self._be_buffer_override) if self._be_buffer_override is not None else float(settings.tp1_be_buffer_pips)

                try:
                    self._tick(execution_guard, tp1_pips, tp1_percent, be_buffer)
                except Exception as exc:
                    self._last_error = str(exc)
                    logger.exception("TP1 watcher tick error: %s", exc)

                self._stop_event.wait(poll_s)
        except Exception as exc:
            self._last_error = f"Watcher loop crashed: {exc}"
            logger.exception("TP1 watcher loop crashed: %s", exc)
        finally:
            self._running = False
            self._consecutive_connect_failures = 0
            try:
                self._lock.release()
            except Exception:
                pass
            logger.info("TP1 watcher stopped")

    @staticmethod
    def _calc_profit(symbol: str, order_type_mt5: int, volume: float,
                     price_open: float, price_close: float) -> Optional[float]:
        """Compute realized profit in account currency via MT5 order_calc_profit."""
        try:
            profit = mt5.order_calc_profit(order_type_mt5, symbol, volume,
                                           price_open, price_close)
            if profit is not None:
                return round(float(profit), 2)
        except Exception:
            pass
        return None

    @staticmethod
    def _lookup_deal_profit(position_ticket: int) -> Optional[float]:
        """Look up realized P&L from MT5 deal history for a closed position."""
        try:
            now = datetime.now()
            start = now - timedelta(hours=24)
            deals = mt5.history_deals_get(position=position_ticket)
            if not deals:
                deals = mt5.history_deals_get(start, now)
            if not deals:
                return None
            # Sum profit from all deals belonging to this position
            total = 0.0
            for d in deals:
                if int(getattr(d, "position_id", 0) or 0) == position_ticket:
                    total += float(getattr(d, "profit", 0.0) or 0.0)
            return round(total, 2) if total != 0.0 else None
        except Exception:
            return None

    def _tick(self, execution_guard, tp1_pips: float, tp1_percent: float, be_buffer: float):
        if not mt5_service._ensure_connected():
            self._consecutive_connect_failures += 1
            if self._consecutive_connect_failures == 1 or self._consecutive_connect_failures % self._MAX_CONNECT_FAILURES_LOG == 0:
                self._last_error = f"MT5 disconnected for {self._consecutive_connect_failures} consecutive ticks"
                logger.error("TP1 watcher: MT5 unreachable for %d consecutive ticks", self._consecutive_connect_failures)
            return

        # Connection restored — reset counter
        if self._consecutive_connect_failures > 0:
            logger.info("TP1 watcher: MT5 connection restored after %d failed ticks", self._consecutive_connect_failures)
            self._consecutive_connect_failures = 0

        positions = mt5.positions_get()
        if not positions:
            # Detect SL closures for any tracked positions before clearing
            for t in list(self._tp1_done.keys()):
                self._detect_sl_closure(t)
            self._tp1_done.clear()
            self._tracked_positions.clear()
            return

        live_tickets: set[int] = set()

        for p in positions:
            ticket = int(getattr(p, "ticket", 0) or 0)
            magic = int(getattr(p, "magic", 0) or 0)
            comment = str(getattr(p, "comment", "") or "")

            # Filter: app-owned only
            if magic != MAGIC:
                continue
            if not comment.startswith(ORDER_COMMENT):
                continue

            live_tickets.add(ticket)

            # Cache position metadata for SL detection on disappearance
            symbol = str(getattr(p, "symbol", ""))
            pos_type = int(getattr(p, "type", -1))
            is_buy = pos_type == mt5.POSITION_TYPE_BUY
            entry = float(getattr(p, "price_open", 0.0))
            sl = float(getattr(p, "sl", 0.0) or 0.0)
            volume = float(getattr(p, "volume", 0.0))

            info = mt5.symbol_info(symbol)
            digits = int(getattr(info, "digits", 5) or 5) if info else 5
            pip_in_price = float(pip_in_price_for_symbol(symbol, digits))

            self._tracked_positions[ticket] = {
                "ticket": ticket,
                "symbol": symbol,
                "direction": "BUY" if is_buy else "SELL",
                "is_buy": is_buy,
                "entry": entry,
                "sl": sl,
                "volume": volume,
                "pip_in_price": pip_in_price,
                "digits": digits,
                "mt5_type": pos_type,
            }

            # Already done?
            if self._tp1_done.get(ticket, False):
                continue

            # Ensure this ticket is tracked
            if ticket not in self._tp1_done:
                self._tp1_done[ticket] = False

            # Compute TP1 price
            tp1_price = entry + (tp1_pips * pip_in_price) if is_buy else entry - (tp1_pips * pip_in_price)

            # Read tick
            tick = mt5.symbol_info_tick(symbol)
            if not tick:
                continue

            # Spread-safe trigger: BUY uses bid, SELL uses ask
            hit = (float(tick.bid) >= tp1_price) if is_buy else (float(tick.ask) <= tp1_price)
            if not hit:
                continue

            # Dual-auth check per action
            allowed, reason = execution_guard.is_execution_allowed(self._ui_armed)
            if not allowed:
                logger.warning("TP1 trigger for %d blocked: %s", ticket, reason)
                continue

            logger.info("TP1 triggered for position %d (%s %s @ %.5f, tp1=%.5f)",
                        ticket, symbol, "BUY" if is_buy else "SELL", entry, tp1_price)

            # Step 1: partial close
            pc_req = PartialCloseRequest(position_ticket=ticket, percent=tp1_percent, ui_armed=self._ui_armed)
            pc_res = mt5_service.partial_close(pc_req)

            if not pc_res.success:
                logger.error("TP1 partial close failed for %d: %s", ticket, pc_res.error)
                self._last_error = f"Partial close failed #{ticket}: {pc_res.error}"
                continue

            close_volume = float(pc_res.close_volume or 0)
            close_price = float(tick.bid) if is_buy else float(tick.ask)
            pip_profit = ((close_price - entry) / pip_in_price) if is_buy else ((entry - close_price) / pip_in_price)

            # Compute exact monetary profit via MT5
            calc_type = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
            profit_money = self._calc_profit(symbol, calc_type, close_volume, entry, close_price)

            logger.info("TP1 partial close OK for %d: closed %.2f lots, +%.1f pips, profit=%s",
                        ticket, close_volume, pip_profit, profit_money)

            # Step 2: move SL to BE
            be_req = MoveToBERequest(position_ticket=ticket, buffer_pips=be_buffer, ui_armed=self._ui_armed)
            be_res = mt5_service.move_to_be(be_req)

            be_status = "ok"
            if not be_res.success:
                logger.warning("TP1 BE move failed for %d: %s (partial close already done)", ticket, be_res.error)
                self._last_error = f"BE move failed #{ticket}: {be_res.error}"
                be_status = f"failed: {be_res.error}"

            # Mark done — never fire again for this ticket
            self._tp1_done[ticket] = True

            # Store event for UI notification
            self._last_tp1_event = {
                "ticket": ticket,
                "symbol": symbol,
                "direction": "BUY" if is_buy else "SELL",
                "entry": entry,
                "tp1_price": tp1_price,
                "close_price": close_price,
                "close_volume": close_volume,
                "pips_profit": round(pip_profit, 1),
                "profit_money": profit_money,
                "be_status": be_status,
                "timestamp": time.time(),
            }

        # Detect SL closures: positions that disappeared and were NOT closed by TP1
        gone = set(self._tp1_done.keys()) - live_tickets
        for t in gone:
            self._detect_sl_closure(t)
            del self._tp1_done[t]
            self._tracked_positions.pop(t, None)

    @staticmethod
    def _closing_deal_reason(position_ticket: int) -> Optional[int]:
        """Reason code of the position's closing (DEAL_ENTRY_OUT) deal, if any.

        MT5 DEAL_REASON_*: 0=client, 1=mobile, 2=web, 3=expert, 4=SL, 5=TP, 6=SO.
        """
        try:
            deals = mt5.history_deals_get(position=position_ticket)
            if not deals:
                return None
            out_entry = getattr(mt5, "DEAL_ENTRY_OUT", 1)
            outs = [d for d in deals if int(getattr(d, "entry", -1)) == out_entry]
            if not outs:
                return None
            latest = max(outs, key=lambda d: int(getattr(d, "time_msc", 0) or getattr(d, "time", 0) or 0))
            return int(getattr(latest, "reason", -1))
        except Exception:
            return None

    def _detect_sl_closure(self, ticket: int):
        """Emit an SL event only if a disappeared position was actually closed by
        its stop loss (or a stop-out) — not by a manual/app close or TP1."""
        was_tp1 = self._tp1_done.get(ticket, False)
        cached = self._tracked_positions.get(ticket)

        if not cached or was_tp1:
            return

        # Only report a real SL / stop-out. Manual or app-initiated closes have a
        # different deal reason and get their own UI feedback, so skip those to
        # avoid a misleading "SL Hit" toast.
        reason = self._closing_deal_reason(ticket)
        sl_reasons = {getattr(mt5, "DEAL_REASON_SL", 4), getattr(mt5, "DEAL_REASON_SO", 6)}
        if reason not in sl_reasons:
            logger.info("Position %d closed (deal reason=%s) — not an SL; no SL event emitted", ticket, reason)
            return

        sl_price = cached["sl"]
        entry = cached["entry"]
        pip_in_price = cached["pip_in_price"]
        is_buy = cached["is_buy"]
        volume = cached["volume"]
        symbol = cached["symbol"]

        # Try to get exact profit from deal history
        deal_profit = self._lookup_deal_profit(ticket)

        # Fallback: estimate via order_calc_profit if deal history unavailable
        if deal_profit is None and sl_price > 0:
            calc_type = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
            deal_profit = self._calc_profit(symbol, calc_type, volume, entry, sl_price)

        # Compute pip loss
        if sl_price > 0 and pip_in_price > 0:
            sl_pips = ((entry - sl_price) / pip_in_price) if is_buy else ((sl_price - entry) / pip_in_price)
        else:
            sl_pips = 0.0

        self._last_sl_event = {
            "ticket": ticket,
            "symbol": symbol,
            "direction": cached["direction"],
            "entry": entry,
            "sl_price": sl_price,
            "volume": volume,
            "pips_loss": round(abs(sl_pips), 1),
            "profit_money": deal_profit,
            "timestamp": time.time(),
        }

        logger.info("SL hit detected for position %d (%s %s, entry=%.5f, sl=%.5f, profit=%s)",
                    ticket, symbol, cached["direction"], entry, sl_price, deal_profit)


# Singleton watcher instance
tp1_watcher = TP1WatcherManager()