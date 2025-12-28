/**
 * Enhanced board detection using multi-color segmentation
 * Detects blue + white segments + red rings for better accuracy
 */

import type { Point } from './types';

export interface BoardDetection {
  center: Point;
  radius: number;
  confidence: number;
  blueContours: Point[][];
  whiteContours: Point[][];
  redContours: Point[][];
}

// HSV ranges for board colors
const BLUE_HSV = {
  hMin: 200,
  hMax: 240,
  sMin: 50,
  sMax: 255,
  vMin: 50,
  vMax: 255,
};

const RED_HSV = {
  hMin: 0,
  hMax: 15,
  sMin: 100,
  sMax: 255,
  vMin: 100,
  vMax: 255,
};

const WHITE_HSV = {
  hMin: 0,
  hMax: 360,
  sMin: 0,
  sMax: 30,
  vMin: 200,
  vMax: 255,
};

// Board ring boundaries (normalized to radius = 1.0)
const TRIPLE_RING = { inner: 0.582, outer: 0.629 };
const DOUBLE_RING = { inner: 0.953, outer: 1.0 };

// Minimum board radius (pixels)
const MIN_BOARD_RADIUS = 100;
const MAX_BOARD_RADIUS = 2000;

// Minimum confidence threshold
const MIN_CONFIDENCE = 0.5;

/**
 * Convert RGB to HSV
 */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  
  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  
  return {
    h: h * 360,
    s: s * 255,
    v: v * 255,
  };
}

/**
 * Check if pixel matches color HSV range
 */
function isColorPixel(r: number, g: number, b: number, range: typeof BLUE_HSV): boolean {
  const hsv = rgbToHsv(r, g, b);
  
  let h = hsv.h;
  if (h < 0) h += 360;
  
  // Special handling for red (wraps around)
  if (range.hMin === 0 && range.hMax === 15) {
    return (
      (h >= range.hMin && h <= range.hMax) || (h >= 345 && h <= 360) &&
      hsv.s >= range.sMin &&
      hsv.s <= range.sMax &&
      hsv.v >= range.vMin &&
      hsv.v <= range.vMax
    );
  }
  
  return (
    h >= range.hMin &&
    h <= range.hMax &&
    hsv.s >= range.sMin &&
    hsv.s <= range.sMax &&
    hsv.v >= range.vMin &&
    hsv.v <= range.vMax
  );
}

/**
 * Find contours in binary mask using flood fill
 */
function findContours(mask: Uint8Array, width: number, height: number, minSize = 50): Point[][] {
  const visited = new Uint8Array(width * height);
  const contours: Point[][] = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      if (mask[idx] === 255 && visited[idx] === 0) {
        const contour: Point[] = [];
        const stack: Point[] = [{ x, y }];
        
        while (stack.length > 0) {
          const p = stack.pop()!;
          const pIdx = p.y * width + p.x;
          
          if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
          if (visited[pIdx] === 1 || mask[pIdx] === 0) continue;
          
          visited[pIdx] = 1;
          contour.push(p);
          
          // 4-connected neighbors
          stack.push({ x: p.x + 1, y: p.y });
          stack.push({ x: p.x - 1, y: p.y });
          stack.push({ x: p.x, y: p.y + 1 });
          stack.push({ x: p.x, y: p.y - 1 });
        }
        
        if (contour.length >= minSize) {
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
}

/**
 * Fit circle to points using weighted least squares
 * Red ring points have higher weight (more reliable)
 */
function fitCircle(
  allPoints: Point[],
  redPoints: Point[],
  center: Point,
  radius: number
): { center: Point; radius: number } | null {
  if (allPoints.length < 10) return null;
  
  // Use red ring points to refine center and radius
  // Red rings should be at specific distances from center
  let tripleRingPoints = 0;
  let doubleRingPoints = 0;
  
  for (const p of redPoints) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normalizedDist = dist / radius;
    
    if (normalizedDist >= TRIPLE_RING.inner && normalizedDist <= TRIPLE_RING.outer) {
      tripleRingPoints++;
    } else if (normalizedDist >= DOUBLE_RING.inner && normalizedDist <= DOUBLE_RING.outer) {
      doubleRingPoints++;
    }
  }
  
  // If we have red ring points, use them to validate/refine
  if (redPoints.length > 20) {
    // Calculate expected radius from red rings
    let sumRadius = 0;
    let count = 0;
    
    for (const p of redPoints) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Check if it's in triple or double ring
      const normalizedDist = dist / radius;
      if (normalizedDist >= TRIPLE_RING.inner && normalizedDist <= TRIPLE_RING.outer) {
        // Triple ring should be at ~60% of radius
        sumRadius += dist / 0.605; // Average of inner and outer
        count++;
      } else if (normalizedDist >= DOUBLE_RING.inner && normalizedDist <= DOUBLE_RING.outer) {
        // Double ring should be at ~97% of radius
        sumRadius += dist / 0.9765; // Average of inner and outer
        count++;
      }
    }
    
    if (count > 0) {
      radius = sumRadius / count;
    }
  }
  
  // Refine center using all points
  let refinedX = center.x;
  let refinedY = center.y;
  
  for (let iter = 0; iter < 5; iter++) {
    let sumDx = 0, sumDy = 0, sumD = 0;
    
    for (const p of allPoints) {
      const dx = p.x - refinedX;
      const dy = p.y - refinedY;
      const d = Math.sqrt(dx * dx + dy * dy);
      
      if (d > 0) {
        const error = d - radius;
        sumDx += (dx / d) * error;
        sumDy += (dy / d) * error;
        sumD += 1;
      }
    }
    
    if (sumD > 0) {
      refinedX += sumDx / sumD;
      refinedY += sumDy / sumD;
    }
  }
  
  return {
    center: { x: refinedX, y: refinedY },
    radius,
  };
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  blueContours: Point[][],
  whiteContours: Point[][],
  redContours: Point[][],
  circle: { center: Point; radius: number } | null,
  width: number,
  height: number
): number {
  if (!circle) return 0;
  
  let confidence = 0;
  
  // More segments = higher confidence
  const totalSegments = blueContours.length + whiteContours.length;
  const segmentScore = Math.min(1.0, totalSegments / 20); // Expect ~20 segments
  confidence += segmentScore * 0.3;
  
  // Red rings validation - bonus if found
  if (redContours.length > 0) {
    confidence += Math.min(0.3, redContours.length / 10);
  }
  
  // Circle fit quality
  const allPoints: Point[] = [];
  for (const c of blueContours) allPoints.push(...c);
  for (const c of whiteContours) allPoints.push(...c);
  
  let fitError = 0;
  let totalPoints = 0;
  
  for (const p of allPoints) {
    const dx = p.x - circle.center.x;
    const dy = p.y - circle.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const error = Math.abs(dist - circle.radius);
    fitError += error;
    totalPoints++;
  }
  
  if (totalPoints > 0) {
    const avgError = fitError / totalPoints;
    const normalizedError = avgError / circle.radius;
    const fitScore = Math.max(0, 1 - normalizedError * 2);
    confidence += fitScore * 0.3;
  }
  
  // Size check
  const sizeScore = circle.radius >= MIN_BOARD_RADIUS && circle.radius <= MAX_BOARD_RADIUS ? 1.0 : 0.5;
  confidence += sizeScore * 0.1;
  
  return Math.min(1.0, confidence);
}

/**
 * Detect dartboard using multi-color segmentation
 */
export function detectBoard(frame: ImageData): BoardDetection | null {
  const width = frame.width;
  const height = frame.height;
  const data = frame.data;
  
  // Create binary masks for each color
  const blueMask = new Uint8Array(width * height);
  const whiteMask = new Uint8Array(width * height);
  const redMask = new Uint8Array(width * height);
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    if (isColorPixel(r, g, b, BLUE_HSV)) {
      blueMask[j] = 255;
    }
    if (isColorPixel(r, g, b, WHITE_HSV)) {
      whiteMask[j] = 255;
    }
    if (isColorPixel(r, g, b, RED_HSV)) {
      redMask[j] = 255;
    }
  }
  
  // Find contours for each color
  const blueContours = findContours(blueMask, width, height, 30);
  const whiteContours = findContours(whiteMask, width, height, 30);
  const redContours = findContours(redMask, width, height, 20); // Red rings are smaller
  
  // Need at least some segments
  if (blueContours.length + whiteContours.length < 5) {
    return null;
  }
  
  // Combine all segment points
  const allSegmentPoints: Point[] = [];
  for (const c of blueContours) allSegmentPoints.push(...c);
  for (const c of whiteContours) allSegmentPoints.push(...c);
  
  // Get red ring points
  const redPoints: Point[] = [];
  for (const c of redContours) redPoints.push(...c);
  
  // Initial circle fit (centroid + average radius)
  let sumX = 0, sumY = 0;
  for (const p of allSegmentPoints) {
    sumX += p.x;
    sumY += p.y;
  }
  const initialCenter = {
    x: sumX / allSegmentPoints.length,
    y: sumY / allSegmentPoints.length,
  };
  
  let sumR = 0;
  for (const p of allSegmentPoints) {
    const dx = p.x - initialCenter.x;
    const dy = p.y - initialCenter.y;
    sumR += Math.sqrt(dx * dx + dy * dy);
  }
  const initialRadius = sumR / allSegmentPoints.length;
  
  // Refined circle fit
  const circle = fitCircle(allSegmentPoints, redPoints, initialCenter, initialRadius);
  
  if (!circle) {
    return null;
  }
  
  // Validate radius
  if (circle.radius < MIN_BOARD_RADIUS || circle.radius > MAX_BOARD_RADIUS) {
    return null;
  }
  
  // Calculate confidence
  const confidence = calculateConfidence(blueContours, whiteContours, redContours, circle, width, height);
  
  if (confidence < MIN_CONFIDENCE) {
    return null;
  }
  
  return {
    center: circle.center,
    radius: circle.radius,
    confidence,
    blueContours,
    whiteContours,
    redContours,
  };
}

/**
 * Smooth board detection over multiple frames
 */
export class BoardDetectorSmoother {
  private detections: BoardDetection[] = [];
  private readonly maxHistory = 5;
  
  addDetection(detection: BoardDetection | null): void {
    if (detection) {
      this.detections.push(detection);
      if (this.detections.length > this.maxHistory) {
        this.detections.shift();
      }
    }
  }
  
  getSmoothed(): BoardDetection | null {
    if (this.detections.length === 0) return null;
    
    // Average center and radius
    let sumX = 0, sumY = 0, sumR = 0, sumConf = 0;
    
    for (const det of this.detections) {
      sumX += det.center.x;
      sumY += det.center.y;
      sumR += det.radius;
      sumConf += det.confidence;
    }
    
    const n = this.detections.length;
    const latest = this.detections[this.detections.length - 1];
    
    return {
      center: {
        x: sumX / n,
        y: sumY / n,
      },
      radius: sumR / n,
      confidence: sumConf / n,
      blueContours: latest.blueContours,
      whiteContours: latest.whiteContours,
      redContours: latest.redContours,
    };
  }
  
  reset(): void {
    this.detections = [];
  }
}

