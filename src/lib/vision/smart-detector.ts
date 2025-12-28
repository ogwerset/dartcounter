/**
 * Smart multi-feature dart detection
 * Uses edge detection, shape analysis, and contrast instead of just color
 */

import type { Point, CalibrationData } from './types';
import { detectFrameDifference, loadImageFromDataURL } from './frame-diff';
import { captureFrame } from './camera';
import { normalizePoint, distanceFromCenter } from './calibration';

// Detection thresholds
const MIN_CONTOUR_AREA = 50;
const MAX_CONTOUR_AREA = 5000;
const MIN_ASPECT_RATIO = 2.0; // Dart is longer than wide
const MAX_ASPECT_RATIO = 10.0;
const MIN_CONTRAST = 30; // Minimum contrast with background

interface DartFeatures {
  hasLinearEdge: boolean;
  edgeAngle: number;
  aspectRatio: number;
  contrastWithBackground: number;
  tipPosition: Point;
  confidence: number;
}

interface SmartDetectionResult {
  detected: boolean;
  dartTip: Point | null;
  normalizedPosition: Point | null;
  confidence: number;
  features?: DartFeatures;
}

/**
 * Detect edges using Sobel operator (simplified)
 */
function detectEdges(imageData: ImageData): Uint8Array {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const edges = new Uint8Array(width * height);
  
  // Convert to grayscale first
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  // Simple edge detection (gradient magnitude)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = gray[(y - 1) * width + (x + 1)] - gray[(y - 1) * width + (x - 1)] +
                2 * (gray[y * width + (x + 1)] - gray[y * width + (x - 1)]) +
                gray[(y + 1) * width + (x + 1)] - gray[(y + 1) * width + (x - 1)];
      const gy = gray[(y + 1) * width + (x - 1)] - gray[(y - 1) * width + (x - 1)] +
                2 * (gray[(y + 1) * width + x] - gray[(y - 1) * width + x]) +
                gray[(y + 1) * width + (x + 1)] - gray[(y - 1) * width + (x + 1)];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = magnitude > 50 ? 255 : 0;
    }
  }
  
  return edges;
}

/**
 * Calculate aspect ratio of a contour
 */
function calculateAspectRatio(contour: Point[]): number {
  if (contour.length < 4) return 0;
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const p of contour) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  if (width === 0 || height === 0) return 0;
  
  return Math.max(width / height, height / width);
}

/**
 * Calculate contrast with background
 */
function calculateContrast(
  contour: Point[],
  currentFrame: ImageData,
  referenceFrame: ImageData
): number {
  let totalDiff = 0;
  let count = 0;
  
  for (const p of contour) {
    if (p.x >= 0 && p.x < currentFrame.width && p.y >= 0 && p.y < currentFrame.height) {
      const currIdx = (p.y * currentFrame.width + p.x) * 4;
      const refIdx = (p.y * referenceFrame.width + p.x) * 4;
      
      const currGray = 0.299 * currentFrame.data[currIdx] + 
                      0.587 * currentFrame.data[currIdx + 1] + 
                      0.114 * currentFrame.data[currIdx + 2];
      const refGray = 0.299 * referenceFrame.data[refIdx] + 
                     0.587 * referenceFrame.data[refIdx + 1] + 
                     0.114 * referenceFrame.data[refIdx + 2];
      
      totalDiff += Math.abs(currGray - refGray);
      count++;
    }
  }
  
  return count > 0 ? totalDiff / count : 0;
}

/**
 * Find linear edge in contour (dart shaft)
 */
function findLinearEdge(contour: Point[]): { hasEdge: boolean; angle: number } {
  if (contour.length < 10) return { hasEdge: false, angle: 0 };
  
  // Find longest edge segment
  let maxLength = 0;
  let bestAngle = 0;
  
  for (let i = 0; i < contour.length - 5; i++) {
    const p1 = contour[i];
    const p2 = contour[i + 5];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > maxLength) {
      maxLength = length;
      bestAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    }
  }
  
  return {
    hasEdge: maxLength > 20,
    angle: bestAngle,
  };
}

/**
 * Smart detection using multiple features
 */
export async function smartDetectDart(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  calibration: CalibrationData,
  referenceFrame: ImageData | string | null
): Promise<SmartDetectionResult> {
  const currentFrame = captureFrame(video, canvas);
  if (!currentFrame) {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
    };
  }
  
  // Load reference frame if it's a data URL
  let refFrame: ImageData;
  if (typeof referenceFrame === 'string') {
    const refCanvas = document.createElement('canvas');
    try {
      refFrame = await loadImageFromDataURL(referenceFrame, refCanvas);
    } catch {
      return {
        detected: false,
        dartTip: null,
        normalizedPosition: null,
        confidence: 0,
      };
    }
  } else if (referenceFrame) {
    refFrame = referenceFrame;
  } else {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
    };
  }
  
  // Frame difference
  const diffResult = detectFrameDifference(currentFrame, refFrame);
  
  if (!diffResult.largestContour || diffResult.changeArea < MIN_CONTOUR_AREA) {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
    };
  }
  
  const contour = diffResult.largestContour;
  
  // Feature extraction
  const aspectRatio = calculateAspectRatio(contour);
  const contrast = calculateContrast(contour, currentFrame, refFrame);
  const edgeInfo = findLinearEdge(contour);
  
  // Find tip (point closest to board center)
  let tip: Point | null = null;
  let minDist = Infinity;
  
  for (const p of contour) {
    const dist = distanceFromCenter(p, calibration);
    if (dist < minDist) {
      minDist = dist;
      tip = p;
    }
  }
  
  if (!tip) {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
    };
  }
  
  // Calculate confidence based on features
  let confidence = 0;
  
  // Aspect ratio score (dart should be elongated)
  if (aspectRatio >= MIN_ASPECT_RATIO && aspectRatio <= MAX_ASPECT_RATIO) {
    confidence += 0.3;
  }
  
  // Contrast score
  if (contrast >= MIN_CONTRAST) {
    confidence += Math.min(0.3, contrast / 100);
  }
  
  // Edge score
  if (edgeInfo.hasEdge) {
    confidence += 0.2;
  }
  
  // Position score (should be within board)
  const normalizedDist = minDist / calibration.radius;
  if (normalizedDist <= 1.1) {
    confidence += 0.2;
  }
  
  const features: DartFeatures = {
    hasLinearEdge: edgeInfo.hasEdge,
    edgeAngle: edgeInfo.angle,
    aspectRatio,
    contrastWithBackground: contrast,
    tipPosition: tip,
    confidence,
  };
  
  return {
    detected: confidence >= 0.4, // Lower threshold for multi-feature
    dartTip: tip,
    normalizedPosition: normalizePoint(tip, calibration),
    confidence,
    features,
  };
}

