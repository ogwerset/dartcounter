/**
 * Motion detection and stabilization
 * Detects when dart motion stops (dart has landed)
 */

import type { Point } from './types';
import type { BoardDetection } from './board-detector';
import { detectFrameDifference } from './frame-diff';

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
): { isValid: boolean; confidence: number } {
  if (contour.length < MIN_DART_AREA || contour.length > MAX_DART_AREA) {
    return { isValid: false, confidence: 0 };
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
    return { isValid: false, confidence: 0 };
  }
  
  // Check aspect ratio - dart should be elongated
  const aspectRatio = calculateAspectRatio(contour);
  if (aspectRatio < 2.0 || aspectRatio > 15.0) {
    return { isValid: false, confidence: 0 };
  }
  
  // Calculate confidence based on:
  // - Aspect ratio (closer to 5-8 is ideal)
  // - Position (closer to center is better)
  // - Size (reasonable size)
  
  let confidence = 0.5;
  
  // Aspect ratio score
  if (aspectRatio >= 3 && aspectRatio <= 10) {
    confidence += 0.3;
  }
  
  // Position score (closer to center = better)
  const normalizedDist = dist / board.radius;
  if (normalizedDist < 0.8) {
    confidence += 0.2;
  }
  
  return { isValid: true, confidence };
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
  
  // Validate as dart
  const validation = validateDartCandidate(contour, board);
  
  if (!validation.isValid) {
    return null;
  }
  
  // Find tip
  const tip = findDartTip(contour, board);
  const aspectRatio = calculateAspectRatio(contour);
  
  return {
    tip,
    contour,
    area: contour.length,
    aspectRatio,
    confidence: validation.confidence,
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

