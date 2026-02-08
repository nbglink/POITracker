"""
WebSocket endpoints for real-time MT5 data streaming.
Provides live price and account balance updates.
"""
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import MetaTrader5 as mt5

router = APIRouter()


async def get_live_price(symbol: str) -> dict:
    """Get current bid/ask price for a symbol."""
    if not mt5.initialize():
        return {"error": "MT5 not initialized", "symbol": symbol}
    
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return {"error": f"Symbol {symbol} not found", "symbol": symbol}
    
    return {
        "symbol": symbol,
        "bid": tick.bid,
        "ask": tick.ask,
        "spread": round(tick.ask - tick.bid, 5),
        "time": tick.time,
    }


async def get_account_balance() -> dict:
    """Get current account balance and equity."""
    if not mt5.initialize():
        return {"error": "MT5 not initialized"}
    
    account = mt5.account_info()
    if account is None:
        return {"error": "Account info not available"}
    
    return {
        "balance": account.balance,
        "equity": account.equity,
        "margin": account.margin,
        "free_margin": account.margin_free,
        "currency": account.currency,
    }


@router.websocket("/ws/live")
async def websocket_live_data(websocket: WebSocket):
    """
    WebSocket endpoint for streaming live price and account data.
    
    Client sends: {"type": "subscribe", "symbol": "XAUUSD-VIP"}
    Server sends: {"type": "tick", "symbol": "...", "bid": ..., "ask": ...}
    Server sends: {"type": "account", "balance": ..., "equity": ...}
    """
    await websocket.accept()
    
    subscribed_symbol: str | None = None
    send_account = True
    running = True
    
    async def send_updates():
        """Background task to send price/account updates."""
        nonlocal running, subscribed_symbol, send_account
        
        while running:
            try:
                # Send price update if subscribed to a symbol
                if subscribed_symbol:
                    price_data = await get_live_price(subscribed_symbol)
                    price_data["type"] = "tick"
                    await websocket.send_json(price_data)
                
                # Send account update
                if send_account:
                    account_data = await get_account_balance()
                    account_data["type"] = "account"
                    await websocket.send_json(account_data)
                
                # Update every 500ms
                await asyncio.sleep(0.5)
                
            except WebSocketDisconnect:
                running = False
                break
            except asyncio.CancelledError:
                running = False
                break
            except Exception as e:
                # Log error but continue
                print(f"[WS] Error in send_updates: {e}")
                try:
                    await websocket.send_json({"type": "error", "message": str(e)})
                except:
                    running = False
                    break
    
    # Start background update task
    update_task = asyncio.create_task(send_updates())
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "subscribe":
                subscribed_symbol = data.get("symbol")
                await websocket.send_json({
                    "type": "subscribed",
                    "symbol": subscribed_symbol
                })
            
            elif msg_type == "unsubscribe":
                subscribed_symbol = None
                await websocket.send_json({"type": "unsubscribed"})
            
            elif msg_type == "toggle_account":
                send_account = data.get("enabled", True)
                await websocket.send_json({
                    "type": "account_toggled",
                    "enabled": send_account
                })
            
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                
    except WebSocketDisconnect:
        pass
    finally:
        running = False
        update_task.cancel()
        try:
            await update_task
        except asyncio.CancelledError:
            pass


# REST endpoints for one-time fetches (fallback)
@router.get("/live/price/{symbol}")
async def get_price(symbol: str):
    """Get current price for a symbol (REST fallback)."""
    return await get_live_price(symbol)


@router.get("/live/account")
async def get_account():
    """Get current account info (REST fallback)."""
    return await get_account_balance()
