/**
 * Board mapper - converts (x,y) position to dartboard segment and multiplier
 */

import type { Point, DetectionResult } from './types';
import { SEGMENT_ORDER, RING_BOUNDARIES } from './types';

/**
 * Convert Cartesian coordinates to polar
 * Returns angle in degrees (0 = up, clockwise) and normalized distance
 */
function toPolar(point: Point): { angle: number; distance: number } {
  const distance = Math.sqrt(point.x * point.x + point.y * point.y);
  
  // atan2 returns angle from positive X axis, counter-clockwise
  // We want angle from positive Y axis (up), clockwise
  let angle = Math.atan2(point.x, -point.y) * (180 / Math.PI);
  
  // Normalize to 0-360
  if (angle < 0) {
    angle += 360;
  }
  
  return { angle, distance };
}

/**
 * Get segment number from angle
 * Each segment spans 18 degrees
 * Segment 20 is centered at 0 degrees (12 o'clock)
 */
function getSegmentFromAngle(angle: number): number {
  // Adjust so that segment 20 is centered at 0 degrees
  // Each segment is 18 degrees wide, so offset by 9 degrees
  let adjustedAngle = angle + 9;
  if (adjustedAngle >= 360) {
    adjustedAngle -= 360;
  }
  
  // Calculate segment index
  const segmentIndex = Math.floor(adjustedAngle / 18);
  
  return SEGMENT_ORDER[segmentIndex];
}

/**
 * Get ring type and multiplier from normalized distance
 */
function getRingFromDistance(normalizedDistance: number): {
  ring: 'bullseye' | 'bull' | 'triple' | 'double' | 'single' | 'miss';
  multiplier: 1 | 2 | 3;
  isBull: boolean;
} {
  if (normalizedDistance <= RING_BOUNDARIES.bullseye.outer) {
    return { ring: 'bullseye', multiplier: 1, isBull: true };
  }
  
  if (normalizedDistance <= RING_BOUNDARIES.bull.outer) {
    return { ring: 'bull', multiplier: 1, isBull: true };
  }
  
  if (normalizedDistance <= RING_BOUNDARIES.triple.inner) {
    return { ring: 'single', multiplier: 1, isBull: false };
  }
  
  if (normalizedDistance <= RING_BOUNDARIES.triple.outer) {
    return { ring: 'triple', multiplier: 3, isBull: false };
  }
  
  if (normalizedDistance <= RING_BOUNDARIES.double.inner) {
    return { ring: 'single', multiplier: 1, isBull: false };
  }
  
  if (normalizedDistance <= RING_BOUNDARIES.double.outer) {
    return { ring: 'double', multiplier: 2, isBull: false };
  }
  
  return { ring: 'miss', multiplier: 1, isBull: false };
}

/**
 * Map a normalized point to a dartboard detection result
 * @param normalizedPoint Point relative to board center, where radius = 1.0
 * @param dartPosition Original dart position in video coordinates
 * @param confidence Detection confidence (0-1)
 */
export function mapToSegment(
  normalizedPoint: Point,
  dartPosition: Point,
  confidence: number
): DetectionResult {
  const polar = toPolar(normalizedPoint);
  const ringInfo = getRingFromDistance(polar.distance);
  
  // Handle miss
  if (ringInfo.ring === 'miss') {
    return {
      segment: 0,
      multiplier: 1,
      points: 0,
      confidence,
      dartPosition,
      normalizedPosition: normalizedPoint,
    };
  }
  
  // Handle bull/bullseye
  if (ringInfo.isBull) {
    const points = ringInfo.ring === 'bullseye' ? 50 : 25;
    return {
      segment: points,
      multiplier: 1,
      points,
      confidence,
      dartPosition,
      normalizedPosition: normalizedPoint,
    };
  }
  
  // Regular segment
  const segment = getSegmentFromAngle(polar.angle);
  const points = segment * ringInfo.multiplier;
  
  return {
    segment,
    multiplier: ringInfo.multiplier,
    points,
    confidence,
    dartPosition,
    normalizedPosition: normalizedPoint,
  };
}

/**
 * Format detection result as string (e.g., "T20", "D16", "S5", "Bull", "Bullseye")
 */
export function formatDetectionResult(result: DetectionResult): string {
  if (result.points === 0) {
    return 'Miss';
  }
  
  if (result.segment === 50) {
    return 'Bullseye';
  }
  
  if (result.segment === 25) {
    return 'Bull';
  }
  
  const prefix = result.multiplier === 3 ? 'T' : result.multiplier === 2 ? 'D' : 'S';
  return `${prefix}${result.segment}`;
}

/**
 * Validate that a detection makes sense
 * (sanity check for obviously wrong detections)
 */
export function validateDetection(result: DetectionResult): boolean {
  // Check segment is valid
  if (result.segment < 0 || (result.segment > 20 && result.segment !== 25 && result.segment !== 50)) {
    return false;
  }
  
  // Check multiplier is valid
  if (result.multiplier < 1 || result.multiplier > 3) {
    return false;
  }
  
  // Check points calculation
  if (result.segment <= 20 && result.segment > 0) {
    if (result.points !== result.segment * result.multiplier) {
      return false;
    }
  }
  
  // Bull/bullseye shouldn't have multipliers
  if ((result.segment === 25 || result.segment === 50) && result.multiplier !== 1) {
    return false;
  }
  
  return true;
}

