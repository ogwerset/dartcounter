'use client';

import { useRef, useEffect, useState } from 'react';
import { Camera, CameraOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestCameraAccess, stopCamera } from '@/lib/vision/camera';
import type { CalibrationData, Point } from '@/lib/vision/types';

interface CameraPreviewProps {
  onVideoReady?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void;
  calibration?: CalibrationData | null;
  showOverlay?: boolean;
  detectedPoint?: Point | null;
  children?: React.ReactNode;
}

export function CameraPreview({
  onVideoReady,
  calibration,
  showOverlay = true,
  detectedPoint,
  children,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Start camera on mount
  useEffect(() => {
    let mounted = true;
    let currentStream: MediaStream | null = null;
    let videoElement: HTMLVideoElement | null = null;

    const startCamera = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API not available. Please use HTTPS or localhost.');
        }
        
        const mediaStream = await requestCameraAccess();
        currentStream = mediaStream;
        
        if (!mounted) {
          stopCamera(mediaStream);
          return;
        }

        setStream(mediaStream);

        if (videoRef.current) {
          videoElement = videoRef.current;
          videoRef.current.srcObject = mediaStream;
          
          // Wait for video to be ready
          const handleLoadedMetadata = () => {
            if (!mounted || !videoElement) return;
            
            console.log('[CameraPreview] Video metadata loaded', {
              width: videoElement.videoWidth,
              height: videoElement.videoHeight,
              readyState: videoElement.readyState,
            });
            
            videoElement.play()
              .then(() => {
                console.log('[CameraPreview] Video playing');
                if (mounted && onVideoReady && canvasRef.current && videoElement) {
                  onVideoReady(videoElement, canvasRef.current);
                }
                if (mounted) {
                  setIsLoading(false);
                }
              })
              .catch((playErr) => {
                console.error('[CameraPreview] Video play error:', playErr);
                if (mounted) {
                  setError(`Failed to play video: ${playErr.message}`);
                  setIsLoading(false);
                }
              });
          };
          
          const handleError = (e: Event) => {
            console.error('[CameraPreview] Video error:', e);
            if (mounted) {
              setError('Video stream error occurred');
              setIsLoading(false);
            }
          };
          
          // If already loaded, call handler immediately
          if (videoElement.readyState >= 2) {
            handleLoadedMetadata();
          } else {
            videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
          }
          videoElement.addEventListener('error', handleError);
        } else {
          console.warn('[CameraPreview] Video ref not available');
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Camera access error:', err);
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to access camera';
          setError(errorMessage);
          setIsLoading(false);
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (currentStream) {
        stopCamera(currentStream);
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry camera access
  const handleRetry = async () => {
    if (stream) {
      stopCamera(stream);
      setStream(null);
    }
    setError(null);
    setIsLoading(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Please use HTTPS or localhost.');
      }
      
      const mediaStream = await requestCameraAccess();
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        const handleLoadedMetadata = () => {
          if (videoRef.current) {
            videoRef.current.play()
              .then(() => {
                if (onVideoReady && canvasRef.current && videoRef.current) {
                  onVideoReady(videoRef.current, canvasRef.current);
                }
                setIsLoading(false);
              })
              .catch((playErr) => {
                console.error('Video play error:', playErr);
                setError('Failed to play video stream');
                setIsLoading(false);
              });
          }
        };
        
        videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
      }
    } catch (err) {
      console.error('Camera retry error:', err);
      setError(err instanceof Error ? err.message : 'Failed to access camera');
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-red-400 mb-4">{error}</p>
        <Button onClick={handleRetry} variant="outline">
          <CameraOff className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 rounded-xl p-6">
        <Camera className="w-12 h-12 text-zinc-500 animate-pulse mb-4" />
        <p className="text-zinc-400">Starting camera...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Video feed */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover rounded-xl"
        playsInline
        muted
        autoPlay
        style={{ transform: 'scaleX(-1)' }} // Mirror for better UX
      />

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Calibration overlay */}
      {showOverlay && calibration && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${videoRef.current?.videoWidth || 1920} ${videoRef.current?.videoHeight || 1080}`}
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Board circle */}
          <circle
            cx={calibration.center.x}
            cy={calibration.center.y}
            r={calibration.radius}
            fill="none"
            stroke="#00ff88"
            strokeWidth="3"
            strokeDasharray="10,5"
            opacity="0.7"
          />
          
          {/* Center crosshair */}
          <line
            x1={calibration.center.x - 20}
            y1={calibration.center.y}
            x2={calibration.center.x + 20}
            y2={calibration.center.y}
            stroke="#00ff88"
            strokeWidth="2"
          />
          <line
            x1={calibration.center.x}
            y1={calibration.center.y - 20}
            x2={calibration.center.x}
            y2={calibration.center.y + 20}
            stroke="#00ff88"
            strokeWidth="2"
          />

          {/* Detected dart position */}
          {detectedPoint && (
            <>
              <circle
                cx={detectedPoint.x}
                cy={detectedPoint.y}
                r="15"
                fill="#ef4444"
                opacity="0.8"
              />
              <circle
                cx={detectedPoint.x}
                cy={detectedPoint.y}
                r="25"
                fill="none"
                stroke="#ef4444"
                strokeWidth="3"
                opacity="0.6"
              />
            </>
          )}
        </svg>
      )}

      {/* Children (e.g., calibration controls) */}
      {children}
    </div>
  );
}

