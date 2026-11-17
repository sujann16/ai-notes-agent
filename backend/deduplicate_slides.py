import os
import sys
import json
from PIL import Image
import numpy as np

def are_images_different(img_path1, img_path2, threshold=0.015):
    try:
        # Open as greyscale ('L') and resize to 32x32 for high performance and noise resilience
        img1 = Image.open(img_path1).convert('L').resize((32, 32))
        img2 = Image.open(img_path2).convert('L').resize((32, 32))
        
        arr1 = np.array(img1, dtype=np.float32)
        arr2 = np.array(img2, dtype=np.float32)
        
        # Calculate Mean Absolute Error (MAE) normalized between 0.0 and 1.0
        mae = np.mean(np.abs(arr1 - arr2)) / 255.0
        return mae > threshold
    except Exception as e:
        # In case of error (e.g. corrupt image), assume different to keep it safe
        return True

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 deduplicate_slides.py <frames_dir> <start_time>")
        sys.exit(1)
        
    frames_dir = sys.argv[1]
    start_time = int(sys.argv[2])
    
    # Read files in the frames directory
    files = []
    if os.path.exists(frames_dir):
        for f in os.listdir(frames_dir):
            if f.startswith("frame_") and f.endswith(".jpg"):
                try:
                    # filename format: frame_timestamp.jpg
                    ts_str = f.replace("frame_", "").replace(".jpg", "")
                    ts = int(ts_str)
                    files.append((ts, f))
                except ValueError:
                    pass
                    
    # Sort chronologically by absolute timestamp
    files.sort(key=lambda x: x[0])
    
    unique_slides = []
    prev_path = None
    
    for ts, f in files:
        full_path = os.path.join(frames_dir, f)
        # Compute relative seconds offset from session start time
        relative_sec = max(0, (ts - start_time) // 1000)
        
        if prev_path is None or are_images_different(prev_path, full_path):
            unique_slides.append({
                "slide": f,
                "timestamp": relative_sec
            })
            prev_path = full_path
            
    print(json.dumps(unique_slides))

if __name__ == "__main__":
    main()
