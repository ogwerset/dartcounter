'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useState, useRef } from 'react';
import { ArrowLeft, Wifi, WifiOff, Camera, Keyboard, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Numpad } from '@/components/game/numpad';
import { CurrentTurn } from '@/components/game/current-turn';
import { PlayerIndicator } from '@/components/game/player-indicator';
import { TurnHistory } from '@/components/game/turn-history';
import { CameraPreview } from '@/components/camera/camera-preview';
import { CalibrationScreen } from '@/components/camera/calibration-screen';
import { DetectionResultDisplay } from '@/components/camera/detection-result';
import { BoardOverlay } from '@/components/camera/board-overlay';
import { useGameStore } from '@/lib/stores/game-store';
import { loadCalibration, isCalibrationComplete } from '@/lib/vision/calibration';
import { detectDart, createDartDetector } from '@/lib/vision/dart-detector';
import { mapToSegment } from '@/lib/vision/board-mapper';
import type { DataConnection } from 'peerjs';
import type { CalibrationData, DetectionResult, Point } from '@/lib/vision/types';

const VERSION = 'v1.1.0';

type InputMode = 'numpad' | 'camera';

export default function MasterPage() {
  const router = useRouter();
  const {
    players,
    currentPlayerIndex,
    currentTurn,
    turnHistory,
    currentLeg,
    isGameActive,
    addThrow,
    completeTurn,
    nextPlayer,
    clearCurrentTurn,
  } = useGameStore();
  
  // Input mode state
  const [inputMode, setInputMode] = useState<InputMode>('numpad');
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  
  // Camera/detection state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [detectedPoint, setDetectedPoint] = useState<Point | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const detectorRef = useRef<ReturnType<typeof createDartDetector> | null>(null);
  
  // Load calibration on mount
  useEffect(() => {
    const saved = loadCalibration();
    if (saved) {
      setCalibration(saved);
    }
  }, []);
  
  // Get PeerJS connection from window (set during pairing)
  const getConnection = useCallback((): DataConnection | null => {
    if (typeof window !== 'undefined') {
      return (window as any).__dartConnection || null;
    }
    return null;
  }, []);
  
  const isConnected = typeof window !== 'undefined' && !!(window as any).__dartConnection;
  
  // Send game state to Slave
  const sendGameState = useCallback(() => {
    const conn = getConnection();
    if (!conn) {
      console.warn('[Master] No connection available');
      return;
    }
    
    // Wait for connection to be open
    if (!conn.open) {
      console.log('[Master] Connection not open yet, waiting...');
      const handler = () => {
        console.log('[Master] Connection opened, sending state now');
        sendGameState();
        conn.off('open', handler);
      };
      conn.on('open', handler);
      return;
    }
    
    const state = useGameStore.getState();
    const payload = {
      type: 'game-sync',
      data: {
        players: state.players.map(p => ({
          currentScore: p.currentScore,
          legsWon: p.legsWon,
        })),
        currentPlayerIndex: state.currentPlayerIndex,
        currentTurn: state.currentTurn.map(t => ({
          segment: t.segment,
          multiplier: t.multiplier,
          points: t.points,
        })),
        turnHistory: state.turnHistory.map(turn => ({
          playerId: turn.playerId,
          throws: turn.throws.map(t => ({
            segment: t.segment,
            multiplier: t.multiplier,
            points: t.points,
          })),
          totalPoints: turn.totalPoints,
          isBust: turn.isBust,
          timestamp: turn.timestamp,
        })),
        currentLeg: state.currentLeg,
      },
    };
    
    try {
      conn.send(payload);
      console.log('[Master] Sent game state:', payload.data);
    } catch (err) {
      console.error('[Master] Error sending:', err);
    }
  }, [getConnection]);
  
  // Send game-start message when game becomes active
  useEffect(() => {
    if (!isGameActive) return;
    
    const conn = getConnection();
    if (!conn) return;
    
    const sendGameStart = () => {
      if (conn.open) {
        const state = useGameStore.getState();
        conn.send({
          type: 'game-start',
          data: {
            players: state.players.map(p => ({
              currentScore: p.currentScore,
              legsWon: p.legsWon,
              name: p.name,
              color: p.color,
            })),
            currentPlayerIndex: state.currentPlayerIndex,
            currentLeg: state.currentLeg,
            config: state.config,
          },
        });
        console.log('[Master] Sent game-start message');
      } else {
        const handler = () => {
          const state = useGameStore.getState();
          conn.send({
            type: 'game-start',
            data: {
              players: state.players.map(p => ({
                currentScore: p.currentScore,
                legsWon: p.legsWon,
                name: p.name,
                color: p.color,
              })),
              currentPlayerIndex: state.currentPlayerIndex,
              currentLeg: state.currentLeg,
              config: state.config,
            },
          });
          console.log('[Master] Sent game-start message (after connection opened)');
          conn.off('open', handler);
        };
        conn.on('open', handler);
      }
    };
    
    sendGameStart();
  }, [isGameActive, getConnection]);
  
  // Setup connection listener when component mounts
  useEffect(() => {
    const conn = getConnection();
    if (!conn) return;
    
    // Wait for connection to be open, then send initial state
    const sendWhenReady = () => {
      if (conn.open) {
        const state = useGameStore.getState();
        if (state.isGameActive) {
          sendGameState();
        }
      } else {
        // Wait for connection to open
        const handler = () => {
          console.log('[Master] Connection opened, sending initial state');
          const state = useGameStore.getState();
          if (state.isGameActive) {
            sendGameState();
          }
          conn.off('open', handler);
        };
        conn.on('open', handler);
      }
    };
    
    sendWhenReady();
  }, [getConnection, sendGameState]);
  
  // Send state whenever relevant state changes
  useEffect(() => {
    if (isGameActive) {
      sendGameState();
    }
  }, [players, currentPlayerIndex, currentTurn, turnHistory, currentLeg, isGameActive, sendGameState]);

  // Handle camera ready
  const handleVideoReady = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    videoRef.current = video;
    canvasRef.current = canvas;
  }, []);
  
  // Start/stop detection
  const startDetection = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !calibration) return;
    
    setIsDetecting(true);
    setDetectionResult(null);
    setDetectedPoint(null);
    
    detectorRef.current = createDartDetector(
      videoRef.current,
      canvasRef.current,
      calibration,
      async (result) => {
        if (result.detected && result.dartTip && result.normalizedPosition) {
          // Stop detection
          detectorRef.current?.stop();
          setIsDetecting(false);
          
          // Map to segment
          const mapped = mapToSegment(
            result.normalizedPosition,
            result.dartTip,
            result.confidence
          );
          
          setDetectionResult(mapped);
          setDetectedPoint(result.dartTip);
        }
      },
      1000 // 1 second debounce
    );
    
    detectorRef.current.start();
  }, [calibration]);
  
  const stopDetection = useCallback(() => {
    detectorRef.current?.stop();
    setIsDetecting(false);
  }, []);
  
  // Manual scan trigger
  const handleManualScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !calibration) return;
    
    setIsDetecting(true);
    
    const result = await detectDart(videoRef.current, canvasRef.current, calibration);
    
    setIsDetecting(false);
    
    if (result.detected && result.dartTip && result.normalizedPosition) {
      const mapped = mapToSegment(
        result.normalizedPosition,
        result.dartTip,
        result.confidence
      );
      
      setDetectionResult(mapped);
      setDetectedPoint(result.dartTip);
    }
  }, [calibration]);
  
  // Confirm detected throw
  const handleConfirmDetection = useCallback(() => {
    if (!detectionResult) return;
    
    addThrow({
      segment: detectionResult.segment,
      multiplier: detectionResult.multiplier,
    });
    
    setDetectionResult(null);
    setDetectedPoint(null);
    
    // Send state
    setTimeout(() => sendGameState(), 50);
  }, [detectionResult, addThrow, sendGameState]);
  
  // Retry detection
  const handleRetryDetection = useCallback(() => {
    setDetectionResult(null);
    setDetectedPoint(null);
  }, []);
  
  // Handle calibration complete
  const handleCalibrationComplete = useCallback((cal: CalibrationData) => {
    setCalibration(cal);
    setShowCalibration(false);
  }, []);

  if (!isGameActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="mb-4">No active game. Please setup a new game.</p>
            <Button onClick={() => router.push('/setup')}>Go to Setup</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Show calibration screen
  if (showCalibration) {
    return (
      <CalibrationScreen
        onComplete={handleCalibrationComplete}
        onCancel={() => setShowCalibration(false)}
      />
    );
  }

  const currentPlayer = players[currentPlayerIndex];
  const canConfirm = currentTurn.length > 0;

  const handleThrow = (segment: number, multiplier: 1 | 2 | 3): void => {
    if (currentTurn.length >= 3) return;
    addThrow({ segment, multiplier });
    // Send state immediately after throw
    setTimeout(() => sendGameState(), 50);
  };

  const handleMiss = (): void => {
    if (currentTurn.length >= 3) return;
    addThrow({ segment: 0, multiplier: 1 });
    // Send state immediately after miss
    setTimeout(() => sendGameState(), 50);
  };

  const handleNext = (): void => {
    completeTurn();
    // Send state after completing turn
    setTimeout(() => {
      sendGameState();
      // Auto-switch to next player
      nextPlayer();
      // Send state after switching player
      setTimeout(() => sendGameState(), 100);
    }, 100);
  };

  return (
    <div className="container mx-auto max-w-2xl p-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        
        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={inputMode === 'numpad' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setInputMode('numpad')}
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          <Button
            variant={inputMode === 'camera' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setInputMode('camera')}
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
        
        <button
          onClick={() => !isConnected && router.push('/pair')}
          className="flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
          disabled={isConnected}
        >
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-400" />
              <span className="text-green-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-500">Offline</span>
            </>
          )}
        </button>
      </div>

      {/* Current Player */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <PlayerIndicator
            player={currentPlayer}
            isActive={true}
            className="mb-4"
          />
          <div className="text-center">
            <div className="text-4xl font-bold mb-2">
              {currentPlayer.currentScore}
            </div>
            <div className="text-sm text-zinc-400">Remaining</div>
          </div>
        </CardContent>
      </Card>

      {/* Current Turn */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="mb-2 text-sm font-medium text-zinc-400">
            Current Turn ({currentTurn.length}/3)
          </div>
          <CurrentTurn throws={currentTurn} />
        </CardContent>
      </Card>

      {/* Input Area - Numpad or Camera */}
      {inputMode === 'numpad' ? (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <Numpad
              onThrow={handleThrow}
              onMiss={handleMiss}
              onClear={clearCurrentTurn}
              onNext={handleNext}
              canConfirm={canConfirm}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4">
          <CardContent className="pt-6">
            {/* Camera mode */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900">
              {isCalibrationComplete(calibration) ? (
                <>
                  <CameraPreview
                    onVideoReady={handleVideoReady}
                    calibration={calibration}
                    showOverlay={true}
                    detectedPoint={detectedPoint}
                  >
                    {/* Board overlay */}
                    {calibration && videoRef.current && (
                      <BoardOverlay
                        calibration={calibration}
                        videoWidth={videoRef.current.videoWidth || 1920}
                        videoHeight={videoRef.current.videoHeight || 1080}
                        detectedPoint={detectedPoint}
                        highlightedSegment={detectionResult ? {
                          segment: detectionResult.segment,
                          multiplier: detectionResult.multiplier,
                        } : null}
                      />
                    )}
                  </CameraPreview>
                  
                  {/* Detection result overlay */}
                  {detectionResult && (
                    <DetectionResultDisplay
                      result={detectionResult}
                      onConfirm={handleConfirmDetection}
                      onRetry={handleRetryDetection}
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <Camera className="w-12 h-12 text-zinc-500 mb-4" />
                  <p className="text-zinc-400 mb-4">Camera not calibrated</p>
                  <Button onClick={() => setShowCalibration(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    Calibrate
                  </Button>
                </div>
              )}
            </div>
            
            {/* Camera controls */}
            {isCalibrationComplete(calibration) && !detectionResult && (
              <div className="flex gap-4 mt-4 justify-center">
                <Button
                  variant="outline"
                  onClick={() => setShowCalibration(true)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Recalibrate
                </Button>
                <Button
                  onClick={handleManualScan}
                  disabled={isDetecting || currentTurn.length >= 3}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {isDetecting ? 'Scanning...' : 'Scan Dart'}
                </Button>
              </div>
            )}
            
            {/* Miss and Next buttons for camera mode */}
            <div className="flex gap-4 mt-4 justify-center">
              <Button
                variant="outline"
                onClick={handleMiss}
                disabled={currentTurn.length >= 3}
              >
                Miss
              </Button>
              <Button
                onClick={handleNext}
                disabled={!canConfirm}
              >
                Next Player
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Turn History */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 text-sm font-medium text-zinc-400">
            Recent Throws
          </div>
          <TurnHistory turns={turnHistory} players={players} />
        </CardContent>
      </Card>

      {/* Version */}
      <p className="text-center text-xs text-zinc-600 mt-6">
        {VERSION}
      </p>
    </div>
  );
}
