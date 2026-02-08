from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
print('POST raw true ->', c.post('/mt5/armed', json=True).status_code, c.post('/mt5/armed', json=True).json())
print('POST obj ->', c.post('/mt5/armed', json={'armed': False}).status_code, c.post('/mt5/armed', json={'armed': False}).json())
print('POST query ->', c.post('/mt5/armed?armed=1').status_code, c.post('/mt5/armed?armed=1').json())
print('POST missing ->', c.post('/mt5/armed').status_code, c.post('/mt5/armed').json())