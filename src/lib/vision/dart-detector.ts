/**
 * Dart detector - finds black darts in the frame difference
 */

import type { Point, CalibrationData } from './types';
import { detectFrameDifference, findDartTip, loadImageFromDataURL } from './frame-diff';
import { captureFrame } from './camera';
import { normalizePoint, distanceFromCenter } from './calibration';

// HSV range for black dart detection
const BLACK_H_MIN = 0;
const BLACK_H_MAX = 360;
const BLACK_S_MAX = 100; // Low saturation
const BLACK_V_MAX = 80;  // Low value (dark)

// Minimum confidence threshold
const MIN_CONFIDENCE = 0.3;
const MIN_CHANGE_AREA = 100; // Minimum pixels changed to consider a dart

interface DartDetectionResult {
  detected: boolean;
  dartTip: Point | null;
  normalizedPosition: Point | null;
  confidence: number;
  debugInfo?: {
    changeArea: number;
    contourSize: number;
  };
}

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
  
  return { h: h * 360, s: s * 100, v: v * 100 };
}

/**
 * Check if a pixel is black (dart color)
 */
function isBlackPixel(r: number, g: number, b: number): boolean {
  const hsv = rgbToHsv(r, g, b);
  return hsv.s <= BLACK_S_MAX && hsv.v <= BLACK_V_MAX;
}

/**
 * Filter contour points to only include black pixels
 * Returns the refined dart tip
 */
function refineDartPosition(
  contour: Point[],
  imageData: ImageData
): Point | null {
  const blackPoints: Point[] = [];
  const width = imageData.width;
  const data = imageData.data;
  
  for (const p of contour) {
    const idx = (p.y * width + p.x) * 4;
    if (isBlackPixel(data[idx], data[idx + 1], data[idx + 2])) {
      blackPoints.push(p);
    }
  }
  
  if (blackPoints.length < 5) {
    // Not enough black pixels, use original contour
    return findDartTip(contour);
  }
  
  return findDartTip(blackPoints);
}

/**
 * Detect dart in current frame compared to reference
 */
export async function detectDart(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  calibration: CalibrationData
): Promise<DartDetectionResult> {
  // Check for reference frame
  if (!calibration.referenceFrame) {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
    };
  }
  
  // Capture current frame
  const currentFrame = captureFrame(video, canvas);
  if (!currentFrame) {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
    };
  }
  
  // Load reference frame
  const referenceCanvas = document.createElement('canvas');
  let referenceFrame: ImageData;
  try {
    referenceFrame = await loadImageFromDataURL(calibration.referenceFrame, referenceCanvas);
  } catch {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
    };
  }
  
  // Compute frame difference
  const diffResult = detectFrameDifference(currentFrame, referenceFrame);
  
  // Check if there's enough change
  if (diffResult.changeArea < MIN_CHANGE_AREA || !diffResult.largestContour) {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
      debugInfo: {
        changeArea: diffResult.changeArea,
        contourSize: 0,
      },
    };
  }
  
  // Refine dart position using color filtering
  const dartTip = refineDartPosition(diffResult.largestContour, currentFrame);
  
  if (!dartTip) {
    return {
      detected: false,
      dartTip: null,
      normalizedPosition: null,
      confidence: 0,
      debugInfo: {
        changeArea: diffResult.changeArea,
        contourSize: diffResult.largestContour.length,
      },
    };
  }
  
  // Check if dart is within the board
  const distance = distanceFromCenter(dartTip, calibration);
  const normalizedDistance = distance / calibration.radius;
  
  if (normalizedDistance > 1.1) {
    // Dart is outside the board (with 10% margin)
    return {
      detected: false,
      dartTip,
      normalizedPosition: normalizePoint(dartTip, calibration),
      confidence: 0,
      debugInfo: {
        changeArea: diffResult.changeArea,
        contourSize: diffResult.largestContour.length,
      },
    };
  }
  
  // Calculate confidence based on contour size and position
  const sizeConfidence = Math.min(1, diffResult.largestContour.length / 500);
  const positionConfidence = normalizedDistance <= 1 ? 1 : Math.max(0, 1 - (normalizedDistance - 1) * 10);
  const confidence = (sizeConfidence + positionConfidence) / 2;
  
  return {
    detected: confidence >= MIN_CONFIDENCE,
    dartTip,
    normalizedPosition: normalizePoint(dartTip, calibration),
    confidence,
    debugInfo: {
      changeArea: diffResult.changeArea,
      contourSize: diffResult.largestContour.length,
    },
  };
}

/**
 * Continuous detection with debouncing
 */
export function createDartDetector(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  calibration: CalibrationData,
  onDetection: (result: DartDetectionResult) => void,
  debounceMs: number = 500
) {
  let lastDetectionTime = 0;
  let animationFrameId: number | null = null;
  let isRunning = false;
  
  const detect = async () => {
    if (!isRunning) return;
    
    const now = Date.now();
    if (now - lastDetectionTime >= debounceMs) {
      const result = await detectDart(video, canvas, calibration);
      
      if (result.detected) {
        lastDetectionTime = now;
        onDetection(result);
      }
    }
    
    animationFrameId = requestAnimationFrame(detect);
  };
  
  return {
    start: () => {
      isRunning = true;
      detect();
    },
    stop: () => {
      isRunning = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
    isRunning: () => isRunning,
  };
}

