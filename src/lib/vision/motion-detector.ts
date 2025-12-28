/**
 * Motion detection and stabilization
 * Detects when dart motion stops (dart has landed)
 */

import type { Point } from './types';
import type { BoardDetection } from './board-detector';
import { detectFrameDifference } from './frame-diff';

// Multi-feature detection thresholds
const MIN_ASPECT_RATIO = 2.0;
const MAX_ASPECT_RATIO = 15.0;
const MIN_CONTRAST = 30;

// Motion detection thresholds
const MOTION_THRESHOLD = 500; // Minimum pixels changed to consider motion
const STABILITY_FRAMES_REQUIRED = 15; // Frames of stability before considering dart landed (500ms at 30fps)
const MIN_DART_AREA = 100; // Minimum area for dart detection
const MAX_DART_AREA = 5000; // Maximum area (filter out large objects)

export interface MotionState {
  isStable: boolean;
  stabilityFrames: number;
  lastMotionArea: number;
  hasMotion: boolean;
}

export interface DartCandidate {
  tip: Point;
  contour: Point[];
  area: number;
  aspectRatio: number;
  confidence: number;
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
 * Find dart tip - point closest to board center
 */
function findDartTip(contour: Point[], board: BoardDetection): Point {
  let minDist = Infinity;
  let tip = contour[0];
  
  for (const p of contour) {
    const dx = p.x - board.center.x;
    const dy = p.y - board.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < minDist) {
      minDist = dist;
      tip = p;
    }
  }
  
  return tip;
}

/**
 * Validate if contour could be a dart
 */
function validateDartCandidate(
  contour: Point[],
  board: BoardDetection
): { isValid: boolean; confidence: number; aspectRatio: number } {
  if (contour.length < MIN_DART_AREA || contour.length > MAX_DART_AREA) {
    return { isValid: false, confidence: 0, aspectRatio: 0 };
  }
  
  // Check if within board bounds
  const center = {
    x: contour.reduce((sum, p) => sum + p.x, 0) / contour.length,
    y: contour.reduce((sum, p) => sum + p.y, 0) / contour.length,
  };
  
  const dx = center.x - board.center.x;
  const dy = center.y - board.center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Should be within board radius (with some margin)
  if (dist > board.radius * 1.2) {
    return { isValid: false, confidence: 0, aspectRatio: 0 };
  }
  
  // Check aspect ratio - dart should be elongated
  const aspectRatio = calculateAspectRatio(contour);
  if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
    return { isValid: false, confidence: 0, aspectRatio };
  }
  
  // Calculate confidence based on:
  // - Aspect ratio (closer to 5-8 is ideal)
  // - Position (closer to center is better)
  // - Size (reasonable size)
  
  let confidence = 0.3;
  
  // Aspect ratio score
  if (aspectRatio >= 3 && aspectRatio <= 10) {
    confidence += 0.2;
  }
  
  // Position score (closer to center = better)
  const normalizedDist = dist / board.radius;
  if (normalizedDist < 0.8) {
    confidence += 0.15;
  }
  
  return { isValid: true, confidence, aspectRatio };
}

/**
 * Detect motion between two frames
 */
export function detectMotion(
  currentFrame: ImageData,
  previousFrame: ImageData | null
): { hasMotion: boolean; motionArea: number } {
  if (!previousFrame) {
    return { hasMotion: false, motionArea: 0 };
  }
  
  const diffResult = detectFrameDifference(currentFrame, previousFrame);
  
  return {
    hasMotion: diffResult.changeArea > MOTION_THRESHOLD,
    motionArea: diffResult.changeArea,
  };
}

/**
 * Update motion state based on current frame
 */
export function updateMotionState(
  state: MotionState,
  currentFrame: ImageData,
  previousFrame: ImageData | null
): MotionState {
  const motion = detectMotion(currentFrame, previousFrame);
  
  if (motion.hasMotion) {
    // Motion detected - reset stability counter
    return {
      isStable: false,
      stabilityFrames: 0,
      lastMotionArea: motion.motionArea,
      hasMotion: true,
    };
  } else {
    // No motion - increment stability counter
    const newStabilityFrames = state.stabilityFrames + 1;
    
    return {
      isStable: newStabilityFrames >= STABILITY_FRAMES_REQUIRED,
      stabilityFrames: newStabilityFrames,
      lastMotionArea: motion.motionArea,
      hasMotion: false,
    };
  }
}

/**
 * Detect new dart object in current frame vs reference
 * Only called when motion has stabilized
 * Uses multi-feature validation: frame diff + shape + edge + contrast
 */
export function detectNewDart(
  currentFrame: ImageData,
  referenceFrame: ImageData,
  board: BoardDetection
): DartCandidate | null {
  const diffResult = detectFrameDifference(currentFrame, referenceFrame);
  
  if (!diffResult.largestContour) {
    return null;
  }
  
  const contour = diffResult.largestContour;
  
  // Stage 1: Basic validation (size, position, aspect ratio)
  const validation = validateDartCandidate(contour, board);
  
  if (!validation.isValid) {
    return null;
  }
  
  // Stage 2: Multi-feature validation
  const contrast = calculateContrast(contour, currentFrame, referenceFrame);
  const edgeInfo = findLinearEdge(contour);
  
  // Enhanced confidence calculation
  let confidence = validation.confidence;
  
  // Contrast score (high contrast = new object)
  if (contrast >= MIN_CONTRAST) {
    confidence += Math.min(0.2, contrast / 100);
  }
  
  // Edge score (dart has linear edge from shaft)
  if (edgeInfo.hasEdge) {
    confidence += 0.15;
  }
  
  // Find tip
  const tip = findDartTip(contour, board);
  
  return {
    tip,
    contour,
    area: contour.length,
    aspectRatio: validation.aspectRatio,
    confidence: Math.min(1.0, confidence),
  };
}

/**
 * Create initial motion state
 */
export function createMotionState(): MotionState {
  return {
    isStable: false,
    stabilityFrames: 0,
    lastMotionArea: 0,
    hasMotion: false,
  };
}

