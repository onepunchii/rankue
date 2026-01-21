import os
import json
import time
import requests
import cv2
import numpy as np
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from urllib.parse import urljoin
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

class BilliardScraper:
    def __init__(self, base_url="https://billiard-bible.com/shot-list/0"):
        self.base_url = base_url
        self.data = []
        self.setup_driver()
        self.output_dir = "scripts/scraper/images"
        os.makedirs(self.output_dir, exist_ok=True)

    def setup_driver(self):
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        # Enable Performance Logging for Strategy 1
        chrome_options.set_capability("goog:loggingPrefs", {"performance": "ALL"})
        
        from selenium.webdriver.chrome.service import Service
        self.driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()), 
            options=chrome_options
        )

    def get_ball_coordinates(self, image_data=None, image_path=None):
        """
        OpenCV logic to detect circles of specific colors and return normalized coordinates.
        Supports both local file paths and raw image data.
        """
        if image_path:
            img = cv2.imread(image_path)
        elif image_data:
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            return None

        if img is None:
            return None

        h, w, _ = img.shape
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # Color ranges (HSV)
        color_ranges = {
            "white": ([0, 0, 180], [180, 70, 255]),
            "yellow": ([20, 100, 100], [40, 255, 255]),
            "red": ([0, 100, 100], [10, 255, 255])
        }
        red_range2 = ([160, 100, 100], [180, 255, 255])

        coords = {}
        for color, (lower, upper) in color_ranges.items():
            mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
            if color == "red":
                mask2 = cv2.inRange(hsv, np.array(red_range2[0]), np.array(red_range2[1]))
                mask = cv2.bitwise_or(mask, mask2)

            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            best_center, max_area = None, 0
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > 50:
                    M = cv2.moments(cnt)
                    if M["m00"] != 0:
                        cX, cY = int(M["m10"] / M["m00"]), int(M["m01"] / M["m00"])
                        if area > max_area:
                            max_area = area
                            best_center = {"x": round(cX / w, 4), "y": round(cY / h, 4)}
            if best_center: coords[color] = best_center
        return coords

    def extract_from_network(self):
        """Strategy 1: Network Interception"""
        logs = self.driver.get_log("performance")
        for entry in logs:
            log = json.loads(entry["message"])["message"]
            if log["method"] == "Network.responseReceived":
                resp_url = log["params"]["response"]["url"]
                if any(ext in resp_url for ext in [".json", "api", "getShot"]):
                    # In a real scenario, we might use Network.getResponseBody
                    # but for this script we will flag it or try common patterns.
                    pass
        return None

    def extract_from_js_vars(self):
        """Strategy 2: JS Global Variable Extraction"""
        candidate_vars = ['billiardData', 'shotData', 'gameInstance', 'currentShot']
        for var in candidate_vars:
            try:
                data = self.driver.execute_script(f"return window.{var};")
                if data: return data
            except: continue
        return None

    def extract_nextjs_data(self, url):
        """
        Extracts raw shot data from Next.js hydration payload.
        This bypasses the need for image processing.
        """
        self.driver.get(url)
        # Give it a moment to load the RSC payload
        time.sleep(2)
        
        scripts = self.driver.find_elements(By.TAG_NAME, "script")
        raw_json = None
        
        for script in scripts:
            content = script.get_attribute("innerHTML")
            if content and "shotDetailRawData" in content:
                # Use regex to find the shotDetailRawData object
                import re
                match = re.search(r'"shotDetailRawData":(\{.*?\})(?=,"|\}\]|$)', content)
                if match:
                    try:
                        raw_json = json.loads(match.group(1))
                        break
                    except:
                        continue
        
        if not raw_json:
            return None

        # Data Mapping & Normalization (Canvas is 500x274, Table is roughly 500x250)
        # We normalize to 0.0 ~ 1.0 range
        def parse_pos(pos_str):
            if not pos_str: return []
            parts = pos_str.split('|')
            points = []
            # Format: frame|x|y|frame|x|y...
            for i in range(0, len(parts), 3):
                if i+2 < len(parts):
                    points.append({
                        "f": int(parts[i]),
                        "x": round(float(parts[i+1]) / 500.0, 4),
                        "y": round(float(parts[i+2]) / 250.0, 4) # Standard 2:1 table
                    })
            return points

        white_path = parse_pos(raw_json.get("white_ball_positions", ""))
        yellow_path = parse_pos(raw_json.get("yellow_ball_positions", ""))
        red_path = parse_pos(raw_json.get("red_ball_positions", ""))

        # Initial positions (frame 0)
        balls = {
            "white": white_path[0] if white_path else None,
            "yellow": yellow_path[0] if yellow_path else None,
            "red": red_path[0] if red_path else None
        }

        # Extract spin/contact point (e.g., "9|1.5")
        spin_raw = raw_json.get("ball_contract_point", "0|0").split('|')
        
        return {
            "title": raw_json.get("description_arrangement", "Untitled"),
            "balls": balls,
            "solution": {
                "thickness": raw_json.get("ball_thickness", 0) / 8.0, # Convert to 0~1 range if needed
                "spin": {
                    "x": float(spin_raw[0]) if len(spin_raw) > 0 else 0,
                    "y": float(spin_raw[1]) if len(spin_raw) > 1 else 0
                },
                "power": raw_json.get("rail_speed", 0) * 20 # Map to 0-100
            },
            "tip": raw_json.get("description_tip", ""),
            "url": url,
            "full_paths": {
                "white": white_path,
                "yellow": yellow_path,
                "red": red_path
            },
            "extracted_via": "next_hydration"
        }

    def scrape_detail_page(self, url):
        print(f"Extracting data from {url}...")
        data = self.extract_nextjs_data(url)
        if data:
            return data
        
        # Fallback to old behavior if needed, but the spec prioritizes Next.js
        print("Next.js extraction failed, falling back to basic info...")
        self.driver.get(url)
        soup = BeautifulSoup(self.driver.page_source, "html.parser")
        return {
            "title": soup.select_one("h1").get_text(strip=True) if soup.select_one("h1") else "Untitled",
            "url": url,
            "extracted_via": "fallback"
        }

    def run(self):
        # We will crawl multiple categories to get everything
        categories = [0, 1, 2, 3, 4, 5] # Main categories on billiard-bible
        
        for cat in categories:
            cat_url = f"https://billiard-bible.com/shot-list/{cat}"
            print(f"--- Starting Category {cat}: {cat_url} ---")
            self.driver.get(cat_url)
            
            page_num = 1
            while True:
                print(f"Processing Category {cat}, Page {page_num}...")
                
                # Robustly find all detail links
                links = self.driver.find_elements(By.CSS_SELECTOR, 'a[href*="/shot-detail/"]')
                urls = []
                for link in links:
                    href = link.get_attribute("href")
                    if href and "/shot-detail/" in href and href not in [u['url'] for u in self.data]:
                        urls.append(href)
                
                # Remove duplicates from this page
                urls = list(set(urls))
                print(f"Found {len(urls)} new shots on this page.")

                for url in urls:
                    try:
                        result = self.scrape_detail_page(url)
                        if result:
                            self.data.append(result)
                            print(f"Saved: {result['title']}")
                    except Exception as e:
                        print(f"Error on {url}: {e}")
                    
                    time.sleep(0.5) # Fast but safe

                # Try to go to next page
                try:
                    # Look for next page button - often icons or text like ">"
                    # Next.js App router pagination usually has specific classes
                    next_btns = self.driver.find_elements(By.XPATH, "//a[contains(text(), '>') or contains(@class, 'next')]")
                    found_next = False
                    for btn in next_btns:
                        if btn.is_displayed() and btn.is_enabled():
                            btn.click()
                            time.sleep(2)
                            page_num += 1
                            found_next = True
                            break
                    
                    if not found_next:
                        print(f"No more pages in Category {cat}.")
                        break
                except:
                    break

        # Final Save
        output_path = "scripts/scraper/shot_data.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        
        print(f"--- CRAWLING COMPLETE ---")
        print(f"Total Items Collected: {len(self.data)}")
        print(f"Data saved to {output_path}")
        self.driver.quit()

        # Save result
        with open("scripts/scraper/billiards_data.json", "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        
        print(f"Scraping complete. Collected {len(self.data)} items.")
        self.driver.quit()

if __name__ == "__main__":
    scraper = BilliardScraper()
    scraper.run()
