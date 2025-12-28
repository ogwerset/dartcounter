/**
 * Dynamic board detection via color-based segmentation
 * Detects dartboard center and radius by finding blue segments
 */

import type { Point } from './types';

export interface BoardDetection {
  center: Point;
  radius: number;
  confidence: number;
  blueContours: Point[][];
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

// Minimum board radius (pixels) - reject too small detections
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
 * Check if pixel matches blue HSV range
 */
function isBluePixel(r: number, g: number, b: number): boolean {
  const hsv = rgbToHsv(r, g, b);
  
  // Handle hue wrap-around (red is at both ends)
  let h = hsv.h;
  if (h < 0) h += 360;
  
  return (
    h >= BLUE_HSV.hMin &&
    h <= BLUE_HSV.hMax &&
    hsv.s >= BLUE_HSV.sMin &&
    hsv.s <= BLUE_HSV.sMax &&
    hsv.v >= BLUE_HSV.vMin &&
    hsv.v <= BLUE_HSV.vMax
  );
}

/**
 * Find contours in binary mask using flood fill
 */
function findContours(mask: Uint8Array, width: number, height: number): Point[][] {
  const visited = new Uint8Array(width * height);
  const contours: Point[][] = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      if (mask[idx] === 255 && visited[idx] === 0) {
        // New contour found - flood fill
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
        
        if (contour.length > 50) { // Minimum contour size
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
}

/**
 * Fit circle to points using least squares
 * Returns center and radius
 */
function fitCircle(points: Point[]): { center: Point; radius: number } | null {
  if (points.length < 3) return null;
  
  // Calculate centroid
  let sumX = 0, sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const centerX = sumX / points.length;
  const centerY = sumY / points.length;
  
  // Calculate average radius
  let sumR = 0;
  for (const p of points) {
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    sumR += Math.sqrt(dx * dx + dy * dy);
  }
  const radius = sumR / points.length;
  
  // Refine center using least squares
  let refinedX = centerX;
  let refinedY = centerY;
  
  for (let iter = 0; iter < 5; iter++) {
    let sumDx = 0, sumDy = 0, sumD = 0;
    
    for (const p of points) {
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
 * Calculate confidence score based on:
 * - Number of blue segments found
 * - Circle fit quality
 * - Size consistency
 */
function calculateConfidence(
  contours: Point[][],
  circle: { center: Point; radius: number } | null,
  width: number,
  height: number
): number {
  if (!circle || contours.length === 0) return 0;
  
  let confidence = 0;
  
  // More segments = higher confidence (expect ~20 segments visible)
  const segmentScore = Math.min(1.0, contours.length / 15);
  confidence += segmentScore * 0.4;
  
  // Circle fit quality - check how well points fit the circle
  let fitError = 0;
  let totalPoints = 0;
  
  for (const contour of contours) {
    for (const p of contour) {
      const dx = p.x - circle.center.x;
      const dy = p.y - circle.center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const error = Math.abs(dist - circle.radius);
      fitError += error;
      totalPoints++;
    }
  }
  
  if (totalPoints > 0) {
    const avgError = fitError / totalPoints;
    const normalizedError = avgError / circle.radius;
    const fitScore = Math.max(0, 1 - normalizedError * 2);
    confidence += fitScore * 0.4;
  }
  
  // Size check - board should be reasonable size
  const sizeScore = circle.radius >= MIN_BOARD_RADIUS && circle.radius <= MAX_BOARD_RADIUS ? 1.0 : 0.5;
  confidence += sizeScore * 0.2;
  
  return Math.min(1.0, confidence);
}

/**
 * Detect dartboard in frame using color-based segmentation
 */
export function detectBoard(frame: ImageData): BoardDetection | null {
  const width = frame.width;
  const height = frame.height;
  const data = frame.data;
  
  // Create binary mask for blue pixels
  const blueMask = new Uint8Array(width * height);
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    if (isBluePixel(r, g, b)) {
      blueMask[j] = 255;
    }
  }
  
  // Find contours of blue regions
  const blueContours = findContours(blueMask, width, height);
  
  if (blueContours.length < 5) {
    // Not enough blue segments found
    return null;
  }
  
  // Combine all blue points
  const allBluePoints: Point[] = [];
  for (const contour of blueContours) {
    allBluePoints.push(...contour);
  }
  
  // Fit circle to all blue points
  const circle = fitCircle(allBluePoints);
  
  if (!circle) {
    return null;
  }
  
  // Validate radius
  if (circle.radius < MIN_BOARD_RADIUS || circle.radius > MAX_BOARD_RADIUS) {
    return null;
  }
  
  // Calculate confidence
  const confidence = calculateConfidence(blueContours, circle, width, height);
  
  if (confidence < MIN_CONFIDENCE) {
    return null;
  }
  
  return {
    center: circle.center,
    radius: circle.radius,
    confidence,
    blueContours,
  };
}

/**
 * Smooth board detection over multiple frames
 * Returns average of last N detections
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
    
    return {
      center: {
        x: sumX / n,
        y: sumY / n,
      },
      radius: sumR / n,
      confidence: sumConf / n,
      blueContours: this.detections[this.detections.length - 1].blueContours, // Use latest
    };
  }
  
  reset(): void {
    this.detections = [];
  }
}

