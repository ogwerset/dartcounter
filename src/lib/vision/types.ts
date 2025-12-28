/**
 * Vision/CV type definitions
 */

export interface Point {
  x: number;
  y: number;
}

export interface CalibrationData {
  /** Center of the dartboard in video coordinates */
  center: Point;
  /** Radius of the dartboard in pixels */
  radius: number;
  /** Reference frame as base64 data URL */
  referenceFrame: string | null;
  /** Timestamp of calibration */
  timestamp: number;
}

export interface DetectionResult {
  /** Detected segment number (1-20, 25 for bull, 50 for bullseye) */
  segment: number;
  /** Multiplier (1 = single, 2 = double, 3 = triple) */
  multiplier: 1 | 2 | 3;
  /** Calculated points */
  points: number;
  /** Confidence score 0-1 */
  confidence: number;
  /** Position of detected dart tip */
  dartPosition: Point;
  /** Normalized position relative to board center */
  normalizedPosition: Point;
}

export interface CameraState {
  isActive: boolean;
  hasPermission: boolean;
  error: string | null;
  stream: MediaStream | null;
}

export interface FrameDiffResult {
  /** Binary mask of differences */
  diffMask: ImageData;
  /** Largest contour (potential dart) */
  largestContour: Point[] | null;
  /** Center of mass of largest contour */
  centerOfMass: Point | null;
  /** Area of change in pixels */
  changeArea: number;
}

// Dartboard segment order (clockwise from 12 o'clock)
export const SEGMENT_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;

// Dartboard ring boundaries (normalized to radius = 1.0)
export const RING_BOUNDARIES = {
  bullseye: { inner: 0, outer: 0.037 },      // 50 points
  bull: { inner: 0.037, outer: 0.093 },       // 25 points
  innerSingle: { inner: 0.093, outer: 0.582 }, // 1x
  triple: { inner: 0.582, outer: 0.629 },      // 3x
  outerSingle: { inner: 0.629, outer: 0.953 }, // 1x
  double: { inner: 0.953, outer: 1.0 },        // 2x
} as const;

