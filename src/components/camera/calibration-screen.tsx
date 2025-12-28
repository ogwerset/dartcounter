'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Check, RotateCcw, Camera, Move, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CameraPreview } from './camera-preview';
import {
  getDefaultCalibration,
  saveCalibration,
  loadCalibration,
  updateCenter,
  updateRadius,
  setReferenceFrame,
} from '@/lib/vision/calibration';
import { captureFrameAsDataURL, getVideoCoordinates } from '@/lib/vision/camera';
import type { CalibrationData, Point } from '@/lib/vision/types';

type CalibrationStep = 'center' | 'radius' | 'reference' | 'complete';

interface CalibrationScreenProps {
  onComplete: (calibration: CalibrationData) => void;
  onCancel: () => void;
}

export function CalibrationScreen({ onComplete, onCancel }: CalibrationScreenProps) {
  const [step, setStep] = useState<CalibrationStep>('center');
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; radius: number } | null>(null);

  // Load existing calibration on mount
  useEffect(() => {
    const existing = loadCalibration();
    if (existing) {
      setCalibration(existing);
    }
  }, []);

  // Handle video ready
  const handleVideoReady = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    videoRef.current = video;
    canvasRef.current = canvas;
    
    // Initialize calibration if not loaded
    if (!calibration) {
      setCalibration(getDefaultCalibration(video.videoWidth, video.videoHeight));
    }
  }, [calibration]);

  // Handle tap to set center
  const handleTapCenter = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!videoRef.current || !calibration || step !== 'center') return;

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    const point = getVideoCoordinates({ clientX, clientY }, videoRef.current);
    const updated = updateCenter(calibration, point);
    setCalibration(updated);
  }, [calibration, step]);

  // Handle drag to set radius
  const handleDragStart = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!videoRef.current || !calibration || step !== 'radius') return;
    
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      radius: calibration.radius,
    };
  }, [calibration, step]);

  const handleDragMove = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !dragStartRef.current || !calibration || !videoRef.current) return;

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;
    const delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Determine if expanding or contracting
    const rect = videoRef.current.getBoundingClientRect();
    const centerScreenX = rect.left + (calibration.center.x / videoRef.current.videoWidth) * rect.width;
    const centerScreenY = rect.top + (calibration.center.y / videoRef.current.videoHeight) * rect.height;
    
    const distStart = Math.sqrt(
      (dragStartRef.current.x - centerScreenX) ** 2 +
      (dragStartRef.current.y - centerScreenY) ** 2
    );
    const distCurrent = Math.sqrt(
      (clientX - centerScreenX) ** 2 +
      (clientY - centerScreenY) ** 2
    );
    
    const scale = videoRef.current.videoWidth / rect.width;
    const newRadius = dragStartRef.current.radius + (distCurrent - distStart) * scale;
    
    setCalibration(updateRadius(calibration, Math.max(50, newRadius)));
  }, [isDragging, calibration]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Capture reference frame
  const handleCaptureReference = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !calibration) return;

    const dataUrl = captureFrameAsDataURL(videoRef.current, canvasRef.current, 0.9);
    if (dataUrl) {
      const updated = setReferenceFrame(calibration, dataUrl);
      setCalibration(updated);
      saveCalibration(updated);
      setStep('complete');
    }
  }, [calibration]);

  // Complete calibration
  const handleComplete = useCallback(() => {
    if (calibration) {
      saveCalibration(calibration);
      onComplete(calibration);
    }
  }, [calibration, onComplete]);

  // Reset calibration
  const handleReset = useCallback(() => {
    if (videoRef.current) {
      setCalibration(getDefaultCalibration(videoRef.current.videoWidth, videoRef.current.videoHeight));
    }
    setStep('center');
  }, []);

  // Next step
  const handleNextStep = useCallback(() => {
    if (step === 'center') setStep('radius');
    else if (step === 'radius') setStep('reference');
  }, [step]);

  const stepInstructions: Record<CalibrationStep, string> = {
    center: 'Tap the CENTER of the dartboard',
    radius: 'Drag outward to set the board EDGE',
    reference: 'Remove all darts and capture REFERENCE',
    complete: 'Calibration complete!',
  };

  return (
    <div 
      className="relative w-full bg-zinc-950"
      style={{ height: '100dvh' }}
    >
      {/* Camera with overlay */}
      <div 
        className="relative w-full h-full"
        onClick={step === 'center' ? handleTapCenter : undefined}
        onMouseDown={step === 'radius' ? handleDragStart : undefined}
        onMouseMove={step === 'radius' ? handleDragMove : undefined}
        onMouseUp={step === 'radius' ? handleDragEnd : undefined}
        onMouseLeave={step === 'radius' ? handleDragEnd : undefined}
        onTouchStart={step === 'center' ? handleTapCenter : step === 'radius' ? handleDragStart : undefined}
        onTouchMove={step === 'radius' ? handleDragMove : undefined}
        onTouchEnd={step === 'radius' ? handleDragEnd : undefined}
      >
        <CameraPreview
          onVideoReady={handleVideoReady}
          showOverlay={true}
        />
      </div>

      {/* Instructions bar */}
      <div className="absolute top-0 left-0 right-0 bg-zinc-900/90 backdrop-blur-sm p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          {step === 'center' && <Move className="w-5 h-5 text-green-400" />}
          {step === 'radius' && <Maximize2 className="w-5 h-5 text-green-400" />}
          {step === 'reference' && <Camera className="w-5 h-5 text-green-400" />}
          {step === 'complete' && <Check className="w-5 h-5 text-green-400" />}
          <span>{stepInstructions[step]}</span>
        </div>
        
        {/* Step indicators */}
        <div className="flex justify-center gap-2 mt-2">
          {(['center', 'radius', 'reference', 'complete'] as CalibrationStep[]).map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full ${
                s === step ? 'bg-green-400' : 
                ['center', 'radius', 'reference', 'complete'].indexOf(s) < ['center', 'radius', 'reference', 'complete'].indexOf(step)
                  ? 'bg-green-600' : 'bg-zinc-600'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Bottom controls */}
      <div 
        className="absolute left-0 right-0 bottom-0 p-4 flex gap-4 justify-center bg-zinc-900/90 backdrop-blur-sm"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Button
          variant="outline"
          size="lg"
          onClick={step === 'center' ? onCancel : handleReset}
        >
          {step === 'center' ? 'Cancel' : <><RotateCcw className="w-4 h-4 mr-2" /> Reset</>}
        </Button>

        {step === 'center' && (
          <Button size="lg" onClick={handleNextStep} disabled={!calibration}>
            <Check className="w-4 h-4 mr-2" />
            Set Center
          </Button>
        )}

        {step === 'radius' && (
          <Button size="lg" onClick={handleNextStep}>
            <Check className="w-4 h-4 mr-2" />
            Set Radius
          </Button>
        )}

        {step === 'reference' && (
          <Button size="lg" onClick={handleCaptureReference}>
            <Camera className="w-4 h-4 mr-2" />
            Capture Reference
          </Button>
        )}

        {step === 'complete' && (
          <Button size="lg" onClick={handleComplete} className="bg-green-600 hover:bg-green-700">
            <Check className="w-4 h-4 mr-2" />
            Done
          </Button>
        )}
      </div>
    </div>
  );
}

