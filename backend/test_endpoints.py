from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
print('/health ->', c.get('/health').json())
print('/mt5/status ->', c.get('/mt5/status').json())
print('/mt5/diagnostics keys ->', list(c.get('/mt5/diagnostics').json().keys()))