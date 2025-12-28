'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/lib/stores/game-store';
import { getCheckoutOptions } from '@/lib/game-logic/rules';
import { formatThrow } from '@/lib/game-logic/scoring';
import type { DataConnection } from 'peerjs';
import type { Turn } from '@/types/game.types';

const VERSION = 'v1.1.0';

// Duration to show last turn summary (in ms)
const TURN_DISPLAY_DURATION = 5000;

// Color mapping for player colors
const COLOR_MAP: Record<string, string> = {
  'blue-500': '#3b82f6',
  'red-500': '#ef4444',
  'green-500': '#22c55e',
  'yellow-500': '#eab308',
  'purple-500': '#a855f7',
  'pink-500': '#ec4899',
};

// Generate glow shadow for a color
const getGlowStyle = (color: string) => ({
  textShadow: `
    0 0 20px ${color}60,
    0 0 40px ${color}40,
    0 0 80px ${color}20,
    0 0 120px ${color}10
  `.trim(),
});

export default function SlavePage() {
  const router = useRouter();
  const { players, currentPlayerIndex, currentTurn, turnHistory, isGameActive, config } =
    useGameStore();
  
  // State for showing last completed turn
  const [showLastTurn, setShowLastTurn] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [lastTurn, setLastTurn] = useState<Turn | null>(null);
  const [lastTurnPlayer, setLastTurnPlayer] = useState<string>('');
  const [lastTurnPlayerColor, setLastTurnPlayerColor] = useState<string>('#00ff88');
  const [turnProgress, setTurnProgress] = useState(100);
  const lastTurnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousTurnCountRef = useRef(turnHistory.length);
  
  // Connection monitoring
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get PeerJS connection from window
  const getConnection = useCallback((): DataConnection | null => {
    if (typeof window !== 'undefined') {
      return (window as any).__dartConnection || null;
    }
    return null;
  }, []);
  
  // Monitor connection status
  useEffect(() => {
    const checkConnection = () => {
      const conn = getConnection();
      if (conn && conn.open) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    };
    
    checkConnection();
    connectionCheckIntervalRef.current = setInterval(checkConnection, 2000);
    
    return () => {
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
      }
    };
  }, [getConnection]);
  
  // Detect when a turn is completed and show summary
  useEffect(() => {
    if (turnHistory.length > previousTurnCountRef.current) {
      // New turn was added
      const newTurn = turnHistory[turnHistory.length - 1];
      const player = players.find(p => p.id === newTurn.playerId);
      
      setLastTurn(newTurn);
      setLastTurnPlayer(player?.name || 'Player');
      setLastTurnPlayerColor(COLOR_MAP[player?.color || 'green-500'] || '#00ff88');
      setShowLastTurn(true);
      setIsExiting(false);
      setTurnProgress(100);
      
      // Clear any existing timers
      if (lastTurnTimerRef.current) {
        clearTimeout(lastTurnTimerRef.current);
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
      
      // Animate progress bar
      const startTime = Date.now();
      progressTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / TURN_DISPLAY_DURATION) * 100);
        setTurnProgress(remaining);
      }, 16); // ~60fps
      
      // Start exit animation before hiding
      lastTurnTimerRef.current = setTimeout(() => {
        setIsExiting(true);
        // Actually hide after exit animation
        setTimeout(() => {
          setShowLastTurn(false);
          setIsExiting(false);
          setTurnProgress(100);
        }, 300);
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
        }
      }, TURN_DISPLAY_DURATION);
    }
    previousTurnCountRef.current = turnHistory.length;
  }, [turnHistory, players]);
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (lastTurnTimerRef.current) {
        clearTimeout(lastTurnTimerRef.current);
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);
  
  // Setup data listener when component mounts
  useEffect(() => {
    const conn = getConnection();
    if (!conn) {
      console.warn('[Slave] No connection available');
      return;
    }
    
    console.log('[Slave] Setting up data listener');
    
    const handleData = (data: unknown) => {
      if (data && typeof data === 'object' && 'type' in data) {
        const payload = data as { type: string; data: unknown };
        if (payload.type === 'game-sync') {
          const gameData = payload.data as {
            players: Array<{ currentScore: number; legsWon: number }>;
            currentPlayerIndex: number;
            currentTurn: Array<{ segment: number; multiplier: number; points: number }>;
            turnHistory?: Array<{
              playerId: string;
              throws: Array<{ segment: number; multiplier: number; points: number }>;
              totalPoints: number;
              isBust: boolean;
              timestamp: number;
            }>;
            currentLeg: number;
          };
          
          const currentState = useGameStore.getState();
          useGameStore.setState({
            players: currentState.players.map((p, idx) => ({
              ...p,
              currentScore: gameData.players[idx]?.currentScore ?? p.currentScore,
              legsWon: gameData.players[idx]?.legsWon ?? p.legsWon,
            })) as [typeof currentState.players[0], typeof currentState.players[1]],
            currentPlayerIndex: gameData.currentPlayerIndex as 0 | 1,
            currentTurn: gameData.currentTurn.map((t) => ({
              ...t,
              multiplier: t.multiplier as 1 | 2 | 3,
              timestamp: Date.now(),
            })),
            turnHistory: gameData.turnHistory ? gameData.turnHistory.map((turn) => ({
              playerId: turn.playerId,
              throws: turn.throws.map((t) => ({
                segment: t.segment,
                multiplier: t.multiplier as 1 | 2 | 3,
                points: t.points,
                timestamp: Date.now(),
              })),
              totalPoints: turn.totalPoints,
              isBust: turn.isBust,
              timestamp: turn.timestamp,
            })) : currentState.turnHistory,
            currentLeg: gameData.currentLeg,
            isGameActive: true,
          });
        }
        
        if (payload.type === 'game-start') {
          const gameData = payload.data as {
            players: Array<{ currentScore: number; legsWon: number; name: string; color: string }>;
            currentPlayerIndex: number;
            currentLeg: number;
            config: { startingScore: number; legsToWin: number; doubleOut: boolean };
          };
          
          const currentState = useGameStore.getState();
          useGameStore.setState({
            players: gameData.players.map((p, idx) => ({
              ...currentState.players[idx],
              currentScore: p.currentScore,
              legsWon: p.legsWon,
              name: p.name,
              color: p.color,
            })) as [typeof currentState.players[0], typeof currentState.players[1]],
            currentPlayerIndex: gameData.currentPlayerIndex as 0 | 1,
            currentLeg: gameData.currentLeg,
            config: {
              startingScore: 301,
              legsToWin: gameData.config.legsToWin,
              doubleOut: gameData.config.doubleOut,
            },
            isGameActive: true,
            currentTurn: [],
            turnHistory: [],
          });
        }
      }
    };
    
    conn.off('data');
    conn.on('data', handleData);
    
    // Monitor connection state
    conn.on('open', () => {
      setConnectionStatus('connected');
    });
    
    conn.on('close', () => {
      setConnectionStatus('disconnected');
    });
    
    conn.on('error', () => {
      setConnectionStatus('disconnected');
    });
    
    return () => {
      conn.off('data', handleData);
      conn.off('open');
      conn.off('close');
      conn.off('error');
    };
  }, [getConnection]);

  if (!isGameActive) {
    return (
      <div 
        className="flex flex-col items-center justify-center p-4 bg-zinc-950"
        style={{ minHeight: '100dvh' }}
      >
        <div className="text-center">
          <p className="mb-4 text-[clamp(2rem,10vw,6rem)] font-bold">Waiting for game...</p>
          <button 
            onClick={() => router.push('/pair')}
            className="text-primary underline text-[clamp(1.5rem,5vw,2.5rem)]"
          >
            Go to pairing
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = players[currentPlayerIndex];
  const otherPlayer = players[currentPlayerIndex === 0 ? 1 : 0];
  const checkoutOptions = getCheckoutOptions(currentPlayer.currentScore);
  const playerColor = COLOR_MAP[currentPlayer.color] || '#00ff88';
  const otherPlayerColor = COLOR_MAP[otherPlayer.color] || '#666';
  const turnTotal = currentTurn.reduce((sum, t) => sum + t.points, 0);

  return (
    <div 
      className="bg-zinc-950 flex flex-col overflow-hidden"
      style={{ 
        minHeight: '100dvh',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* Connection status with reconnect button */}
      <div 
        className="absolute right-2 z-10 flex items-center gap-2"
        style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        {connectionStatus === 'disconnected' && (
          <Button
            onClick={() => router.push('/pair')}
            size="sm"
            variant="destructive"
            className="text-sm font-bold"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Reconnect
          </Button>
        )}
        <div className={`flex items-center gap-1 ${connectionStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
          {connectionStatus === 'connected' ? (
            <Wifi className="h-5 w-5" />
          ) : (
            <WifiOff className="h-5 w-5" />
          )}
        </div>
      </div>

      {/* Last Turn Summary Overlay with Progress Bar */}
      {showLastTurn && lastTurn && (
        <div 
          className={`absolute inset-0 z-20 flex flex-col items-center justify-center transition-all duration-300 ${
            isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
          style={{
            background: `radial-gradient(ellipse at center, rgba(9, 9, 11, 0.97) 0%, rgba(9, 9, 11, 0.99) 100%)`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {/* Progress bar at bottom - thicker */}
          <div 
            className="absolute left-0 right-0 h-3 bg-zinc-800"
            style={{ bottom: 'env(safe-area-inset-bottom)' }}
          >
            <div 
              className="h-full transition-all duration-100 ease-linear"
              style={{ 
                width: `${turnProgress}%`,
                backgroundColor: lastTurn.isBust ? '#ef4444' : lastTurnPlayerColor,
                boxShadow: `0 0 20px ${lastTurn.isBust ? '#ef4444' : lastTurnPlayerColor}`,
              }}
            />
          </div>
          
          <div className="text-center space-y-4 sm:space-y-8 px-4">
            {/* Player name - animated */}
            <div 
              className="text-[clamp(2.5rem,10vw,7rem)] font-black tracking-wider animate-in slide-in-from-top-4 fade-in duration-500"
              style={{ 
                color: lastTurnPlayerColor,
                textWrap: 'balance',
              }}
            >
              {lastTurnPlayer.toUpperCase()}
            </div>
            
            {/* Score/BUST - animated with glow */}
            <div 
              className={`text-[clamp(10rem,50vw,35rem)] font-black leading-none animate-in zoom-in-95 fade-in duration-500 delay-150 ${lastTurn.isBust ? 'text-red-500' : ''}`}
              style={!lastTurn.isBust ? { 
                color: lastTurnPlayerColor,
                ...getGlowStyle(lastTurnPlayerColor),
              } : {
                textShadow: '0 0 40px #ef444480, 0 0 80px #ef444440',
              }}
            >
              {lastTurn.isBust ? 'BUST!' : lastTurn.totalPoints}
            </div>
            
            {/* Throws - staggered animation */}
            <div className="flex justify-center gap-4 sm:gap-8">
              {lastTurn.throws.map((t, i) => (
                <div 
                  key={i} 
                  className="bg-zinc-900/80 backdrop-blur-sm rounded-2xl px-4 py-2 sm:px-8 sm:py-4 border-2 animate-in slide-in-from-bottom-4 fade-in duration-500"
                  style={{ 
                    animationDelay: `${200 + i * 100}ms`,
                    borderColor: lastTurnPlayerColor,
                    color: lastTurnPlayerColor,
                  }}
                >
                  <span className="text-[clamp(2.5rem,10vw,6rem)] font-black">
                    {formatThrow(t)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Display */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4">
        
        {/* Current Player Section - Takes most of the screen */}
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {/* Player Name */}
          <div 
            className="text-[clamp(2.5rem,10vw,8rem)] font-black tracking-wider mb-2"
            style={{ 
              color: playerColor,
              textWrap: 'balance',
            }}
          >
            {currentPlayer.name.toUpperCase()}
          </div>
          
          {/* MEGA Score - MAXIMUM SIZE with dynamic glow */}
          <div
            className="text-center font-black tabular-nums leading-none text-[clamp(12rem,55vw,40rem)]"
            style={{ 
              color: playerColor,
              ...getGlowStyle(playerColor),
            }}
          >
            {currentPlayer.currentScore}
          </div>
          
          {/* Current Turn Throws - with player color */}
          {currentTurn.length > 0 && (
            <div className="flex items-center gap-3 sm:gap-6 mt-4 sm:mt-8">
              {currentTurn.map((t, i) => (
                <div 
                  key={i} 
                  className="bg-zinc-800/80 backdrop-blur-sm rounded-2xl px-4 py-2 sm:px-8 sm:py-4 text-[clamp(2.5rem,10vw,6rem)] font-black border-3"
                  style={{ 
                    borderColor: playerColor,
                    borderWidth: '3px',
                    color: playerColor,
                    boxShadow: `0 0 20px ${playerColor}40`,
                  }}
                >
                  {formatThrow(t)}
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: 3 - currentTurn.length }).map((_, i) => (
                <div 
                  key={`empty-${i}`}
                  className="bg-zinc-900/50 border-3 border-zinc-700 rounded-2xl px-4 py-2 sm:px-8 sm:py-4 text-[clamp(2.5rem,10vw,6rem)] text-zinc-600"
                  style={{ borderWidth: '3px' }}
                >
                  —
                </div>
              ))}
            </div>
          )}
          
          {/* Turn Total - with player color and glow */}
          {currentTurn.length > 0 && (
            <div 
              className="mt-4 sm:mt-6 text-[clamp(2rem,8vw,4rem)] font-black"
              style={{ 
                color: playerColor,
                textShadow: `0 0 20px ${playerColor}60`,
              }}
            >
              Turn: {turnTotal}
            </div>
          )}
          
          {/* Checkout Options */}
          {checkoutOptions.length > 0 && currentPlayer.currentScore <= 170 && (
            <div className="mt-4 sm:mt-8 text-center">
              <div className="text-[clamp(1.2rem,5vw,2rem)] text-zinc-500 mb-2 font-bold tracking-wider">
                CHECKOUT
              </div>
              <div className="text-[clamp(1.5rem,6vw,3rem)] font-bold text-yellow-400">
                {checkoutOptions.slice(0, 3).join(' • ')}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Bar - Other player + Legs - BIGGER & STICKY */}
        <div 
          className="w-full max-w-5xl px-2 sm:px-4"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between bg-zinc-900/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-3 sm:p-6">
            {/* Other Player */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div 
                className="w-4 h-4 sm:w-6 sm:h-6 rounded-full"
                style={{ 
                  backgroundColor: otherPlayerColor,
                  boxShadow: `0 0 10px ${otherPlayerColor}`,
                }}
              />
              <span 
                className="text-[clamp(1.5rem,5vw,2.5rem)] font-bold"
                style={{ color: otherPlayerColor }}
              >
                {otherPlayer.name}
              </span>
              <span 
                className="text-[clamp(2rem,8vw,4rem)] font-black"
                style={{ 
                  color: otherPlayerColor,
                  textShadow: `0 0 15px ${otherPlayerColor}60`,
                }}
              >
                {otherPlayer.currentScore}
              </span>
            </div>
            
            {/* Legs */}
            <div className="flex items-center gap-2 sm:gap-4 text-[clamp(1.5rem,5vw,2.5rem)]">
              <span className="text-zinc-500 font-bold">Legs:</span>
              <span className="font-black text-white">
                {players[0].legsWon} - {players[1].legsWon}
              </span>
              <span className="text-zinc-600 text-[clamp(1rem,4vw,1.8rem)]">
                (FT{config.legsToWin})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Version - tiny */}
      <div 
        className="absolute left-1 text-[0.6rem] text-zinc-700"
        style={{ bottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
      >
        {VERSION}
      </div>
    </div>
  );
}
