/**
 * Dart tracker - manages continuous detection of 3 darts per turn
 * Uses dynamic board detection and motion-based dart detection
 */

import type { Point } from './types';
import { captureFrame, captureFrameAsDataURL } from './camera';
import { detectBoard, BoardDetectorSmoother } from './board-detector';
import { 
  updateMotionState, 
  createMotionState, 
  detectNewDart,
  type MotionState 
} from './motion-detector';
import { loadImageFromDataURL } from './frame-diff';
import { mapToSegment } from './board-mapper';
import { setReferenceFrame, saveCalibration, loadCalibration } from './calibration';

export interface DartDetection {
  segment: number;
  multiplier: 1 | 2 | 3;
  points: number;
  confidence: number;
  dartPosition: Point;
}

type TrackerState = 
  | 'idle'           // Waiting to start turn
  | 'no-board'       // Board not detected - need to position camera
  | 'waiting-dart-1' // Waiting for first dart
  | 'waiting-dart-2' // Waiting for second dart
  | 'waiting-dart-3' // Waiting for third dart
  | 'turn-complete'  // All 3 darts detected
  | 'waiting-removal'; // Waiting for darts to be removed

export interface TrackerCallbacks {
  onDartDetected: (dart: DartDetection, dartNumber: number) => void;
  onTurnComplete: (darts: DartDetection[]) => void;
  onStateChange: (state: TrackerState) => void;
  onBoardDetected: (detected: boolean) => void;
  onMotionStatus: (status: string) => void;
}

export class DartTracker {
  private state: TrackerState = 'idle';
  private referenceFrame: ImageData | null = null;
  private referenceFrameDataURL: string | null = null;
  private previousFrame: ImageData | null = null;
  private detectedDarts: DartDetection[] = [];
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private callbacks: TrackerCallbacks;
  private detectionInterval: number | null = null;
  private isRunning = false;
  
  // Board detection
  private boardSmoother = new BoardDetectorSmoother();
  private currentBoard: { center: Point; radius: number } | null = null;
  
  // Motion detection
  private motionState: MotionState = createMotionState();
  
  // Debouncing
  private lastDetectionTime = 0;
  private readonly DETECTION_DEBOUNCE_MS = 1500; // 1.5 seconds between detections
  private readonly REMOVAL_THRESHOLD = 100; // Minimum change area to consider removal
  
  constructor(callbacks: TrackerCallbacks) {
    this.callbacks = callbacks;
  }
  
  /**
   * Initialize tracker with video and canvas
   */
  initialize(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ): void {
    this.video = video;
    this.canvas = canvas;
    
    // Load existing reference frame if available
    const savedCalibration = loadCalibration();
    if (savedCalibration?.referenceFrame) {
      this.referenceFrameDataURL = savedCalibration.referenceFrame;
    }
  }
  
  /**
   * Start a new turn - capture reference frame
   */
  async startTurn(): Promise<void> {
    if (!this.video || !this.canvas) {
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
      const savedCalibration = loadCalibration();
      if (savedCalibration) {
        const updated = setReferenceFrame(savedCalibration, dataURL);
        saveCalibration(updated);
      }
    }
    
    this.detectedDarts = [];
    this.motionState = createMotionState();
    this.previousFrame = null;
    this.state = 'no-board'; // Will change to waiting-dart-1 once board is detected
    this.callbacks.onStateChange(this.state);
    
    console.log('[DartTracker] Turn started, waiting for board detection');
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
      if (!this.video || !this.canvas) {
        this.detectionInterval = requestAnimationFrame(() => this.detectLoop());
        return;
      }
      
      // Capture current frame
      const currentFrame = captureFrame(this.video, this.canvas);
      if (!currentFrame) {
        this.detectionInterval = requestAnimationFrame(() => this.detectLoop());
        return;
      }
      
      // Step 1: Detect board
      const boardDetection = detectBoard(currentFrame);
      
      if (boardDetection) {
        this.boardSmoother.addDetection(boardDetection);
        const smoothed = this.boardSmoother.getSmoothed();
        
        if (smoothed) {
          this.currentBoard = {
            center: smoothed.center,
            radius: smoothed.radius,
          };
          
          this.callbacks.onBoardDetected(true);
          
          // If we were in no-board state, move to waiting for dart
          if (this.state === 'no-board') {
            this.state = 'waiting-dart-1';
            this.callbacks.onStateChange(this.state);
          }
        }
      } else {
        this.callbacks.onBoardDetected(false);
        
        if (this.state !== 'idle' && this.state !== 'waiting-removal') {
          this.state = 'no-board';
          this.callbacks.onStateChange(this.state);
        }
      }
      
      // Step 2: Motion detection (only if board is detected and we have reference)
      if (this.currentBoard && this.referenceFrame && this.state.startsWith('waiting-dart-')) {
        // Update motion state
        this.motionState = updateMotionState(
          this.motionState,
          currentFrame,
          this.previousFrame
        );
        
        // Update motion status
        if (this.motionState.hasMotion) {
          this.callbacks.onMotionStatus('Motion detected...');
        } else if (this.motionState.isStable) {
          this.callbacks.onMotionStatus('Dart landed!');
          
          // Motion has stabilized - check for new dart
          await this.detectStabilizedDart(currentFrame);
        } else {
          this.callbacks.onMotionStatus('Waiting for dart...');
        }
      }
      
      // Step 3: Check for dart removal (if turn complete)
      if (this.state === 'waiting-removal' && this.referenceFrame) {
        await this.checkRemoval(currentFrame);
      }
      
      // Update previous frame
      this.previousFrame = currentFrame;
      
    } catch (error) {
      console.error('[DartTracker] Detection error:', error);
    }
    
    this.detectionInterval = requestAnimationFrame(() => this.detectLoop());
  }
  
  /**
   * Detect dart after motion has stabilized
   */
  private async detectStabilizedDart(currentFrame: ImageData): Promise<void> {
    if (!this.currentBoard || !this.referenceFrame) return;
    
    const now = Date.now();
    if (now - this.lastDetectionTime < this.DETECTION_DEBOUNCE_MS) {
      return;
    }
    
    // Load reference frame if needed
    let refFrame: ImageData;
    if (this.referenceFrameDataURL && !this.referenceFrame) {
      const refCanvas = document.createElement('canvas');
      try {
        refFrame = await loadImageFromDataURL(this.referenceFrameDataURL, refCanvas);
      } catch {
        return;
      }
    } else if (this.referenceFrame) {
      refFrame = this.referenceFrame;
    } else {
      return;
    }
    
    // Detect new dart
    const boardDetection = {
      center: this.currentBoard.center,
      radius: this.currentBoard.radius,
      confidence: 1.0,
      blueContours: [],
    };
    
    const dartCandidate = detectNewDart(currentFrame, refFrame, boardDetection);
    
    if (dartCandidate && dartCandidate.confidence > 0.5) {
      // Map to segment
      const normalizedPoint = {
        x: (dartCandidate.tip.x - this.currentBoard.center.x) / this.currentBoard.radius,
        y: (dartCandidate.tip.y - this.currentBoard.center.y) / this.currentBoard.radius,
      };
      
      const mapped = mapToSegment(
        normalizedPoint,
        dartCandidate.tip,
        dartCandidate.confidence
      );
      
      const dart: DartDetection = {
        segment: mapped.segment,
        multiplier: mapped.multiplier,
        points: mapped.points,
        confidence: mapped.confidence,
        dartPosition: dartCandidate.tip,
      };
      
      this.detectedDarts.push(dart);
      const dartNumber = this.detectedDarts.length;
      
      this.lastDetectionTime = now;
      this.callbacks.onDartDetected(dart, dartNumber);
      
      // Update reference frame to include this dart
      this.referenceFrame = captureFrame(this.video!, this.canvas!);
      if (this.referenceFrame) {
        const dataURL = captureFrameAsDataURL(this.video!, this.canvas!, 0.9);
        if (dataURL) {
          this.referenceFrameDataURL = dataURL;
        }
      }
      
      // Reset motion state
      this.motionState = createMotionState();
      
      // Move to next state
      if (dartNumber === 1) {
        this.state = 'waiting-dart-2';
      } else if (dartNumber === 2) {
        this.state = 'waiting-dart-3';
      } else if (dartNumber === 3) {
        this.state = 'turn-complete';
        this.callbacks.onTurnComplete(this.detectedDarts);
        // Auto-transition to waiting-removal
        setTimeout(() => {
          this.state = 'waiting-removal';
          this.callbacks.onStateChange(this.state);
        }, 1000);
      }
      
      this.callbacks.onStateChange(this.state);
      
      console.log(`[DartTracker] Dart ${dartNumber} detected: ${mapped.segment > 0 ? (mapped.multiplier === 3 ? 'T' : mapped.multiplier === 2 ? 'D' : 'S') + mapped.segment : 'Miss'} (${mapped.points} pts)`);
    }
  }
  
  /**
   * Check if darts have been removed
   */
  private async checkRemoval(currentFrame: ImageData): Promise<void> {
    if (!this.referenceFrame || !this.currentBoard) return;
    
    // Compare with original reference (empty board)
    // If difference is small, darts have been removed
    const { detectFrameDifference } = await import('./frame-diff');
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
    this.previousFrame = null;
    this.currentBoard = null;
    this.motionState = createMotionState();
    this.boardSmoother.reset();
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
  
  /**
   * Get current board detection
   */
  getCurrentBoard(): { center: Point; radius: number } | null {
    return this.currentBoard;
  }
}
