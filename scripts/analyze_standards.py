import json
import math
import os

def analyze_db(file_path):
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found.")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"--- HiQ Database Analysis Report ---")
    print(f"Total Shots: {len(data)}")

    # 1. Spin Analysis
    max_spin_x = 0
    max_spin_y = 0
    for shot in data:
        spin = shot.get("solution", {}).get("spin", {})
        max_spin_x = max(max_spin_x, abs(spin.get("x", 0)))
        max_spin_y = max(max_spin_y, abs(spin.get("y", 0)))
    
    data_max_radius = max(max_spin_x, max_spin_y)
    print(f"\n[1] Spin Normalization")
    print(f"Max Spin X: {max_spin_x}")
    print(f"Max Spin Y: {max_spin_y}")
    print(f"Recommended Data_Max_Radius: {data_max_radius}")

    # 2. Power vs Velocity Analysis
    # We calculate velocity as pixel_distance / 1_frame (assuming 60fps)
    power_stats = {1: [], 2: [], 3: [], 4: [], 5: []}
    
    for shot in data:
        power = shot.get("solution", {}).get("power_level", shot.get("solution", {}).get("power"))
        if not power or power not in range(1, 6):
            continue
            
        white_path = shot.get("balls", {}).get("white", [])
        if len(white_path) < 2:
            continue
            
        # Find first move
        v = 0
        for i in range(len(white_path) - 1):
            p1 = white_path[i]
            p2 = white_path[i+1]
            dx = p2['x'] - p1['x']
            dy = p2['y'] - p1['y']
            dist = math.sqrt(dx*dx + dy*dy)
            if dist > 0.1: # Significant move
                v = dist * 60 # Pixels per second
                break
        
        if v > 0:
            power_stats[power].append(v)

    print(f"\n[2] Power to Velocity Map (Pixels/sec on 500x250 table)")
    for p in range(1, 6):
        avg_v = sum(power_stats[p]) / len(power_stats[p]) if power_stats[p] else 0
        print(f"Power Level {p}: {avg_v:.2f} px/s (Matches: {len(power_stats[p])})")

    # 3. Shot Type Tagging
    tags = {}
    for shot in data:
        desc = shot.get("description", "")
        for keyword in ["뒤돌리기", "옆돌리기", "앞돌리기", "비껴치기", "세워치기", "뱅크샷"]:
            if keyword in desc:
                tags[keyword] = tags.get(keyword, 0) + 1
    
    print(f"\n[3] Shot Type Distribution")
    for tag, count in tags.items():
        print(f"[{tag}]: {count}")

if __name__ == "__main__":
    analyze_db("hiqdatabase/hiq_database.json")
