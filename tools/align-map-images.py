import argparse
import json
import os
import sys

sys.path.insert(0, os.path.abspath(".discovery-temp/pydeps"))
import cv2
import numpy as np


parser = argparse.ArgumentParser(description="Estimate a private discovery homography between reference and Racooze map images.")
parser.add_argument("reference")
parser.add_argument("target")
parser.add_argument("--output-json")
parser.add_argument("--diagnostic")
args = parser.parse_args()

reference = cv2.imread(args.reference, cv2.IMREAD_GRAYSCALE)
target = cv2.imread(args.target, cv2.IMREAD_GRAYSCALE)
if reference is None or target is None:
    raise SystemExit("Unable to read one or both images.")

clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
reference = clahe.apply(reference)
target = clahe.apply(target)
sift = cv2.SIFT_create(nfeatures=20000, contrastThreshold=0.015, edgeThreshold=20)
keypoints_a, descriptors_a = sift.detectAndCompute(reference, None)
keypoints_b, descriptors_b = sift.detectAndCompute(target, None)
matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=8), dict(checks=100))
raw_matches = matcher.knnMatch(descriptors_a, descriptors_b, k=2)
good = [first for first, second in raw_matches if first.distance < 0.72 * second.distance]

result = {
    "reference": args.reference,
    "target": args.target,
    "referenceSize": [int(reference.shape[1]), int(reference.shape[0])],
    "targetSize": [int(target.shape[1]), int(target.shape[0])],
    "referenceKeypoints": len(keypoints_a),
    "targetKeypoints": len(keypoints_b),
    "candidateMatches": len(good),
    "homography": None,
    "inliers": 0,
    "inlierRatio": 0
}

mask = None
if len(good) >= 8:
    source_points = np.float32([keypoints_a[match.queryIdx].pt for match in good]).reshape(-1, 1, 2)
    target_points = np.float32([keypoints_b[match.trainIdx].pt for match in good]).reshape(-1, 1, 2)
    homography, mask = cv2.findHomography(source_points, target_points, cv2.RANSAC, 5.0)
    if homography is not None:
        inliers = int(mask.sum())
        result.update({
            "homography": homography.tolist(),
            "inliers": inliers,
            "inlierRatio": inliers / len(good)
        })

text = json.dumps(result, indent=2)
if args.output_json:
    os.makedirs(os.path.dirname(os.path.abspath(args.output_json)), exist_ok=True)
    with open(args.output_json, "w", encoding="utf8") as handle:
        handle.write(text + "\n")
else:
    print(text)

if args.diagnostic and mask is not None:
    inlier_matches = [match for match, keep in zip(good, mask.ravel()) if keep][:200]
    diagnostic = cv2.drawMatches(reference, keypoints_a, target, keypoints_b, inlier_matches, None, flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
    os.makedirs(os.path.dirname(os.path.abspath(args.diagnostic)), exist_ok=True)
    cv2.imwrite(args.diagnostic, diagnostic)
