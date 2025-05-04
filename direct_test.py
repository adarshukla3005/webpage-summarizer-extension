import requests
import json
import time

# Test sending a summary directly to the API
def test_direct_summary():
    # API endpoint
    api_url = "http://localhost:8000/api/summarize"
    
    # Test data
    test_data = {
        "url": "https://test-direct-summary.com",
        "title": "Direct Test Summary",
        "content": "This is a test content that is being sent directly to the API through a test script. " * 10,
        "length": "short",
        "save_history": True,
        "isSelection": False
    }
    
    print(f"Sending direct test to API: {api_url}")
    print(f"Test data: URL={test_data['url']}, Title={test_data['title']}")
    
    try:
        # Send the request
        response = requests.post(api_url, json=test_data)
        
        if response.status_code == 200:
            print("✅ Test summary successfully sent to API")
            try:
                response_json = response.json()
                print(f"Response title: {response_json.get('title')}")
                print(f"Response main length: {len(response_json.get('main', ''))}")
            except:
                print(f"Raw response: {response.text[:200]}...")
                
            # Check if it was saved in history
            time.sleep(2)  # Wait for the save to complete
            print("\nChecking if summary was saved to history...")
            
            history_response = requests.get("http://localhost:8000/api/history")
            if history_response.status_code == 200:
                history = history_response.json()
                print(f"Found {len(history)} summaries in history")
                
                # Check if our test summary is in the history
                found = False
                for summary in history:
                    if summary.get("url") == test_data["url"]:
                        found = True
                        print(f"✅ Test summary found in history with ID: {summary.get('id')}")
                        break
                
                if not found:
                    print("❌ Test summary NOT found in history!")
            else:
                print(f"❌ Failed to get history: {history_response.status_code}")
        else:
            print(f"❌ API request failed: {response.status_code}")
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"❌ Error during API request: {str(e)}")

if __name__ == "__main__":
    test_direct_summary() 