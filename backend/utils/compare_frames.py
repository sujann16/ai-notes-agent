import sys
import os
from PIL import Image
import numpy as np

def main():
    if len(sys.argv) < 3:
        print("true")
        sys.exit(0)
    
    img_path1 = sys.argv[1]
    img_path2 = sys.argv[2]
    
    if not os.path.exists(img_path1) or not os.path.exists(img_path2):
        print("true")
        sys.exit(0)
        
    try:
        # Resize to 32x32 greyscale for noise-resilient comparison
        img1 = Image.open(img_path1).convert('L').resize((32, 32))
        img2 = Image.open(img_path2).convert('L').resize((32, 32))
        
        arr1 = np.array(img1, dtype=np.float32)
        arr2 = np.array(img2, dtype=np.float32)
        
        mae = np.mean(np.abs(arr1 - arr2)) / 255.0
        
        # Threshold: 0.015 (from original deduplicate_slides.py)
        if mae > 0.015:
            print("true")
        else:
            print("false")
    except Exception as e:
        # Fallback to true (images are different) in case of error
        print("true")

if __name__ == "__main__":
    main()
