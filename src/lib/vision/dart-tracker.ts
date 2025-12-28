/**
 * Dart tracker - manages continuous detection of 3 darts per turn
 * Auto-resets when darts are removed
 */

import type { Point, CalibrationData } from './types';
import { captureFrame, captureFrameAsDataURL } from './camera';
import { smartDetectDart } from './smart-detector';
import { detectFrameDifference } from './frame-diff';
import { mapToSegment } from './board-mapper';
import { saveCalibration, setReferenceFrame } from './calibration';

export interface DartDetection {
  segment: number;
  multiplier: 1 | 2 | 3;
  points: number;
  confidence: number;
  dartPosition: Point;
}

type TrackerState = 
  | 'idle'           // Waiting to start turn
  | 'waiting-dart-1' // Waiting for first dart
  | 'waiting-dart-2' // Waiting for second dart
  | 'waiting-dart-3' // Waiting for third dart
  | 'turn-complete'  // All 3 darts detected
  | 'waiting-removal'; // Waiting for darts to be removed

export interface TrackerCallbacks {
  onDartDetected: (dart: DartDetection, dartNumber: number) => void;
  onTurnComplete: (darts: DartDetection[]) => void;
  onStateChange: (state: TrackerState) => void;
}

export class DartTracker {
  private state: TrackerState = 'idle';
  private referenceFrame: ImageData | null = null;
  private referenceFrameDataURL: string | null = null;
  private detectedDarts: DartDetection[] = [];
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private calibration: CalibrationData | null = null;
  private callbacks: TrackerCallbacks;
  private detectionInterval: number | null = null;
  private isRunning = false;
  
  // Debouncing
  private lastDetectionTime = 0;
  private readonly DETECTION_DEBOUNCE_MS = 1000; // 1 second between detections
  private readonly REMOVAL_THRESHOLD = 50; // Minimum change area to consider removal
  
  constructor(callbacks: TrackerCallbacks) {
    this.callbacks = callbacks;
  }
  
  /**
   * Initialize tracker with video, canvas, and calibration
   */
  initialize(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    calibration: CalibrationData
  ): void {
    this.video = video;
    this.canvas = canvas;
    this.calibration = calibration;
    
    // Load existing reference frame if available
    if (calibration.referenceFrame) {
      this.referenceFrameDataURL = calibration.referenceFrame;
    }
  }
  
  /**
   * Start a new turn - capture reference frame
   */
  async startTurn(): Promise<void> {
    if (!this.video || !this.canvas || !this.calibration) {
      console.error('[DartTracker] Not initialized');
      return;
    }
    
    // Wait a bit for board to be empty
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Capture reference frame
    this.referenceFrame = captureFrame(this.video, this.canvas);
    if (!this.referenceFrame) {
      console.error('[DartTracker] Failed to capture reference frame');
      return;
    }
    
    // Save reference frame to calibration
    const dataURL = captureFrameAsDataURL(this.video, this.canvas, 0.9);
    if (dataURL) {
      this.referenceFrameDataURL = dataURL;
      const updated = setReferenceFrame(this.calibration, dataURL);
      saveCalibration(updated);
      this.calibration = updated;
    }
    
    this.detectedDarts = [];
    this.state = 'waiting-dart-1';
    this.callbacks.onStateChange(this.state);
    
    console.log('[DartTracker] Turn started, waiting for dart 1');
  }
  
  /**
   * Start continuous detection
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.detectLoop();
  }
  
  /**
   * Stop continuous detection
   */
  stop(): void {
    this.isRunning = false;
    if (this.detectionInterval) {
      cancelAnimationFrame(this.detectionInterval);
      this.detectionInterval = null;
    }
  }
  
  /**
   * Main detection loop
   */
  private async detectLoop(): Promise<void> {
    if (!this.isRunning) return;
    
    try {
      if (this.state === 'idle') {
        // Check if we should start a turn
        // (This could be triggered manually or by game state)
      } else if (this.state.startsWith('waiting-dart-')) {
        await this.detectNextDart();
      } else if (this.state === 'turn-complete') {
        await this.waitForRemoval();
      } else if (this.state === 'waiting-removal') {
        await this.checkRemoval();
      }
    } catch (error) {
      console.error('[DartTracker] Detection error:', error);
    }
    
    this.detectionInterval = requestAnimationFrame(() => this.detectLoop());
  }
  
  /**
   * Detect next dart in sequence
   */
  private async detectNextDart(): Promise<void> {
    if (!this.video || !this.canvas || !this.calibration) {
      return;
    }
    
    const now = Date.now();
    if (now - this.lastDetectionTime < this.DETECTION_DEBOUNCE_MS) {
      return;
    }
    
    // Use reference frame (ImageData) or data URL
    const reference = this.referenceFrame || this.referenceFrameDataURL;
    if (!reference) {
      return;
    }
    
    const result = await smartDetectDart(
      this.video,
      this.canvas,
      this.calibration,
      reference
    );
    
    if (result.detected && result.dartTip && result.normalizedPosition) {
      // Map to segment
      const mapped = mapToSegment(
        result.normalizedPosition,
        result.dartTip,
        result.confidence
      );
      
      const dart: DartDetection = {
        segment: mapped.segment,
        multiplier: mapped.multiplier,
        points: mapped.points,
        confidence: mapped.confidence,
        dartPosition: result.dartTip,
      };
      
      this.detectedDarts.push(dart);
      const dartNumber = this.detectedDarts.length;
      
      this.lastDetectionTime = now;
      this.callbacks.onDartDetected(dart, dartNumber);
      
      // Update reference frame to include this dart
      this.referenceFrame = captureFrame(this.video, this.canvas);
      
      // Move to next state
      if (dartNumber === 1) {
        this.state = 'waiting-dart-2';
      } else if (dartNumber === 2) {
        this.state = 'waiting-dart-3';
      } else if (dartNumber === 3) {
        this.state = 'turn-complete';
        this.callbacks.onTurnComplete(this.detectedDarts);
      }
      
      this.callbacks.onStateChange(this.state);
      
      console.log(`[DartTracker] Dart ${dartNumber} detected: ${mapped.segment > 0 ? (mapped.multiplier === 3 ? 'T' : mapped.multiplier === 2 ? 'D' : 'S') + mapped.segment : 'Miss'} (${mapped.points} pts)`);
    }
  }
  
  /**
   * Wait for darts to be removed
   */
  private async waitForRemoval(): Promise<void> {
    this.state = 'waiting-removal';
    this.callbacks.onStateChange(this.state);
    console.log('[DartTracker] Waiting for darts to be removed...');
  }
  
  /**
   * Check if darts have been removed
   */
  private async checkRemoval(): Promise<void> {
    if (!this.video || !this.canvas || !this.referenceFrame) {
      return;
    }
    
    const currentFrame = captureFrame(this.video, this.canvas);
    if (!currentFrame) return;
    
    // Compare with original reference (empty board)
    // If difference is small, darts have been removed
    const diffResult = detectFrameDifference(currentFrame, this.referenceFrame);
    
    if (diffResult.changeArea < this.REMOVAL_THRESHOLD) {
      // Darts removed, ready for next turn
      console.log('[DartTracker] Darts removed, ready for next turn');
      this.state = 'idle';
      this.callbacks.onStateChange(this.state);
      
      // Auto-start next turn after a short delay
      setTimeout(() => {
        this.startTurn();
      }, 1000);
    }
  }
  
  /**
   * Reset tracker
   */
  reset(): void {
    this.stop();
    this.state = 'idle';
    this.detectedDarts = [];
    this.referenceFrame = null;
    this.lastDetectionTime = 0;
    this.callbacks.onStateChange(this.state);
  }
  
  /**
   * Get current state
   */
  getState(): TrackerState {
    return this.state;
  }
  
  /**
   * Get detected darts
   */
  getDetectedDarts(): DartDetection[] {
    return [...this.detectedDarts];
  }
}

