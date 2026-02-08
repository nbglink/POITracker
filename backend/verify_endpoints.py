import requests
import json

BASE_URL = "http://localhost:8000"

endpoints = [
    {"method": "GET", "url": "/mt5/status"},
    {"method": "GET", "url": "/mt5/armed"},
    {"method": "POST", "url": "/mt5/armed", "json": {"armed": True}},
    {"method": "POST", "url": "/mt5/execution-enable", "json": {"armed": True}}
]

print(f"Testing endpoints on {BASE_URL}...\n")

for ep in endpoints:
    full_url = f"{BASE_URL}{ep['url']}"
    method = ep['method']
    print(f"Testing {method} {ep['url']}...")
    
    try:
        if method == "GET":
            response = requests.get(full_url)
        elif method == "POST":
            response = requests.post(full_url, json=ep.get('json'))
        
        print(f"Status: {response.status_code}")
        try:
            print(f"Response: {json.dumps(response.json(), indent=2)}")
        except:
            print(f"Response (text): {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    print("-" * 40)
