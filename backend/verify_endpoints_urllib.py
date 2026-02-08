import urllib.request
import urllib.error
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
    
    req = urllib.request.Request(full_url, method=method)
    if 'json' in ep:
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(ep['json']).encode('utf-8')
    else:
        data = None

    try:
        with urllib.request.urlopen(req, data=data) as response:
            status = response.getcode()
            body = response.read().decode('utf-8')
            print(f"Status: {status}")
            try:
                print(f"Response: {json.dumps(json.loads(body), indent=2)}")
            except:
                print(f"Response (text): {body}")
    except urllib.error.HTTPError as e:
        print(f"Status: {e.code}")
        body = e.read().decode('utf-8')
        try:
            print(f"Response: {json.dumps(json.loads(body), indent=2)}")
        except:
            print(f"Response (text): {body}")
    except Exception as e:
        print(f"Error: {e}")
    
    print("-" * 40)
