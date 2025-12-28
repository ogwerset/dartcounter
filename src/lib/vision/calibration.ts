/**
 * Calibration module - store and retrieve dartboard calibration data
 */

import type { CalibrationData, Point } from './types';

const STORAGE_KEY = 'dart-calibration';

/**
 * Get default calibration (centered, reasonable defaults)
 */
export function getDefaultCalibration(videoWidth: number, videoHeight: number): CalibrationData {
  return {
    center: {
      x: videoWidth / 2,
      y: videoHeight / 2,
    },
    radius: Math.min(videoWidth, videoHeight) * 0.4,
    referenceFrame: null,
    timestamp: 0,
  };
}

/**
 * Save calibration data to localStorage
 */
export function saveCalibration(data: CalibrationData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save calibration:', error);
  }
}

/**
 * Load calibration data from localStorage
 */
export function loadCalibration(): CalibrationData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const data = JSON.parse(stored) as CalibrationData;
    
    // Validate required fields
    if (!data.center || typeof data.radius !== 'number') {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to load calibration:', error);
    return null;
  }
}

/**
 * Clear stored calibration
 */
export function clearCalibration(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear calibration:', error);
  }
}

/**
 * Check if calibration is complete (has reference frame)
 */
export function isCalibrationComplete(data: CalibrationData | null): boolean {
  return data !== null && data.referenceFrame !== null && data.timestamp > 0;
}

/**
 * Update calibration center
 */
export function updateCenter(current: CalibrationData, center: Point): CalibrationData {
  return {
    ...current,
    center,
    timestamp: Date.now(),
  };
}

/**
 * Update calibration radius
 */
export function updateRadius(current: CalibrationData, radius: number): CalibrationData {
  return {
    ...current,
    radius: Math.max(50, radius), // Minimum 50px radius
    timestamp: Date.now(),
  };
}

/**
 * Set reference frame
 */
export function setReferenceFrame(current: CalibrationData, referenceFrame: string): CalibrationData {
  return {
    ...current,
    referenceFrame,
    timestamp: Date.now(),
  };
}

/**
 * Calculate distance from center point to calibration center
 */
export function distanceFromCenter(point: Point, calibration: CalibrationData): number {
  const dx = point.x - calibration.center.x;
  const dy = point.y - calibration.center.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize a point relative to calibration (center = 0,0, edge = 1.0)
 */
export function normalizePoint(point: Point, calibration: CalibrationData): Point {
  return {
    x: (point.x - calibration.center.x) / calibration.radius,
    y: (point.y - calibration.center.y) / calibration.radius,
  };
}

