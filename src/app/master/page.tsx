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
import { BoardOverlay } from '@/components/camera/board-overlay';
import { useGameStore } from '@/lib/stores/game-store';
import { DartTracker } from '@/lib/vision/dart-tracker';
import type { DataConnection } from 'peerjs';
import type { Point } from '@/lib/vision/types';

const VERSION = 'v1.5.0';

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
  
  // Camera/detection state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef<DartTracker | null>(null);
  const [trackerState, setTrackerState] = useState<'idle' | 'no-board' | 'waiting-dart-1' | 'waiting-dart-2' | 'waiting-dart-3' | 'turn-complete' | 'waiting-removal'>('idle');
  const [detectedDartCount, setDetectedDartCount] = useState(0);
  const [lastDetectedDart, setLastDetectedDart] = useState<{ segment: number; multiplier: number; points: number } | null>(null);
  const [boardDetected, setBoardDetected] = useState(false);
  const [motionStatus, setMotionStatus] = useState<string>('');
  
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
    
    // Initialize tracker
    initializeTracker(video, canvas);
  }, []);
  
  // Initialize dart tracker
  const initializeTracker = useCallback((
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ) => {
    if (trackerRef.current) {
      trackerRef.current.stop();
    }
    
    const tracker = new DartTracker({
      onDartDetected: (dart, dartNumber) => {
        console.log(`[Master] Dart ${dartNumber} detected:`, dart);
        setDetectedDartCount(dartNumber);
        setLastDetectedDart({
          segment: dart.segment,
          multiplier: dart.multiplier,
          points: dart.points,
        });
        
        // Automatically add throw
        addThrow({
          segment: dart.segment,
          multiplier: dart.multiplier,
        });
        
        // Send state
        setTimeout(() => sendGameState(), 50);
      },
      onTurnComplete: (darts) => {
        console.log('[Master] Turn complete:', darts);
        setTrackerState('turn-complete');
      },
      onStateChange: (state) => {
        setTrackerState(state);
        console.log('[Master] Tracker state:', state);
      },
      onBoardDetected: (detected) => {
        setBoardDetected(detected);
      },
      onMotionStatus: (status) => {
        setMotionStatus(status);
      },
    });
    
    tracker.initialize(video, canvas);
    trackerRef.current = tracker;
    
    // Start continuous detection
    tracker.start();
    
    // Start first turn
    tracker.startTurn();
  }, [addThrow, sendGameState]);
  
  // Initialize tracker when camera is ready
  useEffect(() => {
    if (videoRef.current && canvasRef.current) {
      initializeTracker(videoRef.current, canvasRef.current);
    }
    
    return () => {
      if (trackerRef.current) {
        trackerRef.current.stop();
      }
    };
  }, [initializeTracker]);
  
  // Reset tracker when turn completes or player changes
  useEffect(() => {
    if (trackerRef.current && currentTurn.length === 0 && trackerState === 'waiting-removal') {
      // Turn was completed, tracker will auto-start next turn
      setDetectedDartCount(0);
      setLastDetectedDart(null);
    }
  }, [currentTurn.length, trackerState]);

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
    <div className="container mx-auto max-w-2xl p-4 py-6 w-full">
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
            <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 min-h-[300px] w-full">
              <CameraPreview
                onVideoReady={handleVideoReady}
                showOverlay={true}
              >
                {/* Board overlay - show detected board */}
                {videoRef.current && trackerRef.current && (
                  <BoardOverlay
                    calibration={trackerRef.current.getCurrentBoard() ? {
                      center: trackerRef.current.getCurrentBoard()!.center,
                      radius: trackerRef.current.getCurrentBoard()!.radius,
                      referenceFrame: null,
                      timestamp: Date.now(),
                    } : null}
                    videoWidth={videoRef.current.videoWidth || 1920}
                    videoHeight={videoRef.current.videoHeight || 1080}
                    highlightedSegment={lastDetectedDart ? {
                      segment: lastDetectedDart.segment,
                      multiplier: lastDetectedDart.multiplier,
                    } : null}
                  />
                )}
              </CameraPreview>
              
              {/* Status overlay */}
              <div className="absolute top-4 left-4 right-4 bg-zinc-900/90 backdrop-blur-sm rounded-lg p-3 z-30">
                {/* Board status */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${boardDetected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-xs font-medium text-zinc-300">
                    {boardDetected ? 'Board detected' : 'Position camera at board'}
                  </span>
                </div>
                
                {/* Tracker status */}
                {boardDetected && trackerState !== 'idle' && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-semibold text-zinc-300">
                        {trackerState === 'no-board' && 'Waiting for board...'}
                        {trackerState === 'waiting-dart-1' && 'Waiting for Dart 1/3...'}
                        {trackerState === 'waiting-dart-2' && 'Waiting for Dart 2/3...'}
                        {trackerState === 'waiting-dart-3' && 'Waiting for Dart 3/3...'}
                        {trackerState === 'turn-complete' && 'Turn Complete!'}
                        {trackerState === 'waiting-removal' && 'Remove darts to continue...'}
                      </div>
                      <div className="text-lg font-bold text-green-400">
                        {detectedDartCount}/3
                      </div>
                    </div>
                    
                    {/* Motion status */}
                    {motionStatus && (
                      <div className="text-xs text-zinc-400 mt-1">
                        {motionStatus}
                      </div>
                    )}
                    
                    {/* Last detected dart */}
                    {lastDetectedDart && (
                      <div className="text-xs text-zinc-400 mt-1">
                        Last: {lastDetectedDart.segment > 0 
                          ? `${lastDetectedDart.multiplier === 3 ? 'T' : lastDetectedDart.multiplier === 2 ? 'D' : 'S'}${lastDetectedDart.segment}` 
                          : 'Miss'} ({lastDetectedDart.points} pts)
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            {/* Camera controls */}
            <div className="flex gap-4 mt-4 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  if (trackerRef.current) {
                    trackerRef.current.reset();
                    trackerRef.current.startTurn();
                  }
                }}
              >
                <Settings className="w-4 h-4 mr-2" />
                Reset Turn
              </Button>
            </div>
            
            {/* Manual controls for camera mode (fallback) */}
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
