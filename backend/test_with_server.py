import subprocess
import time
import sys
import os
import urllib.request
import urllib.error
import json

BASE_URL = "http://localhost:8000"

def run_tests():
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

def main():
    # Path to run.py
    run_script = os.path.join("backend", "run.py")
    
    # Start server
    print("Starting server...")
    process = subprocess.Popen(
        [sys.executable, run_script],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    try:
        # Wait for server to start
        print("Waiting for server to initialize...")
        time.sleep(5)
        
        # Check if process died
        if process.poll() is not None:
             stdout, stderr = process.communicate()
             print(f"Server started but exited immediately with code {process.returncode}")
             print("STDOUT:", stdout)
             print("STDERR:", stderr)
             return

        # Run tests
        run_tests()
        
    finally:
        print("Stopping server...")
        try:
            # Terminate gracefully
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
        except:
            pass

if __name__ == "__main__":
    main()
