'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useGameStore } from '@/lib/stores/game-store';
import { getCheckoutOptions } from '@/lib/game-logic/rules';
import { formatThrow } from '@/lib/game-logic/scoring';
import type { DataConnection } from 'peerjs';
import type { Turn } from '@/types/game.types';

const VERSION = 'v1.0.5';

// Duration to show last turn summary (in ms)
const TURN_DISPLAY_DURATION = 4000;

export default function SlavePage() {
  const router = useRouter();
  const { players, currentPlayerIndex, currentTurn, turnHistory, isGameActive, config } =
    useGameStore();
  
  // State for showing last completed turn
  const [showLastTurn, setShowLastTurn] = useState(false);
  const [lastTurn, setLastTurn] = useState<Turn | null>(null);
  const [lastTurnPlayer, setLastTurnPlayer] = useState<string>('');
  const lastTurnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousTurnCountRef = useRef(turnHistory.length);
  
  // Get PeerJS connection from window
  const getConnection = (): DataConnection | null => {
    if (typeof window !== 'undefined') {
      return (window as any).__dartConnection || null;
    }
    return null;
  };
  
  const isConnected = typeof window !== 'undefined' && !!(window as any).__dartConnection;
  
  // Detect when a turn is completed and show summary
  useEffect(() => {
    if (turnHistory.length > previousTurnCountRef.current) {
      // New turn was added
      const newTurn = turnHistory[turnHistory.length - 1];
      const player = players.find(p => p.id === newTurn.playerId);
      
      setLastTurn(newTurn);
      setLastTurnPlayer(player?.name || 'Player');
      setShowLastTurn(true);
      
      // Clear any existing timer
      if (lastTurnTimerRef.current) {
        clearTimeout(lastTurnTimerRef.current);
      }
      
      // Hide after duration
      lastTurnTimerRef.current = setTimeout(() => {
        setShowLastTurn(false);
      }, TURN_DISPLAY_DURATION);
    }
    previousTurnCountRef.current = turnHistory.length;
  }, [turnHistory, players]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (lastTurnTimerRef.current) {
        clearTimeout(lastTurnTimerRef.current);
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
    
    return () => {
      conn.off('data', handleData);
    };
  }, []);

  if (!isGameActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-zinc-950">
        <div className="text-center">
          <p className="mb-4 text-[clamp(1.5rem,5vw,3rem)]">Waiting for game...</p>
          <button 
            onClick={() => router.push('/pair')}
            className="text-primary underline text-[clamp(1rem,3vw,1.5rem)]"
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

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* Connection status - small corner indicator */}
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={() => !isConnected && router.push('/pair')}
          className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
          disabled={isConnected}
        >
          {isConnected ? (
            <Wifi className="h-3 w-3 text-green-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-400" />
          )}
        </button>
      </div>

      {/* Last Turn Summary Overlay */}
      {showLastTurn && lastTurn && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/95 animate-in fade-in duration-300">
          <div className="text-center space-y-4">
            <div className="text-[clamp(1.5rem,6vw,3rem)] text-zinc-400">
              {lastTurnPlayer}
            </div>
            <div className={`text-[clamp(4rem,20vw,12rem)] font-black ${lastTurn.isBust ? 'text-red-500' : 'text-[#00ff88]'}`}>
              {lastTurn.isBust ? 'BUST!' : lastTurn.totalPoints}
            </div>
            <div className="flex justify-center gap-4 text-[clamp(1.2rem,5vw,2.5rem)]">
              {lastTurn.throws.map((t, i) => (
                <span key={i} className="text-zinc-300">
                  {formatThrow(t)}
                </span>
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
            className="text-[clamp(1.5rem,6vw,4rem)] font-bold tracking-wide"
            style={{ color: `var(--${currentPlayer.color}, #00ff88)` }}
          >
            {currentPlayer.name.toUpperCase()}
          </div>
          
          {/* MEGA Score - The main attraction */}
          <div
            className="text-center font-black tabular-nums leading-none text-[clamp(6rem,30vw,20rem)] text-[#00ff88] drop-shadow-[0_0_30px_rgba(0,255,136,0.6)]"
          >
            {currentPlayer.currentScore}
          </div>
          
          {/* Current Turn Throws */}
          {currentTurn.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              {currentTurn.map((t, i) => (
                <div 
                  key={i} 
                  className="bg-zinc-800 rounded-lg px-4 py-2 text-[clamp(1.5rem,5vw,3rem)] font-bold"
                >
                  {formatThrow(t)}
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: 3 - currentTurn.length }).map((_, i) => (
                <div 
                  key={`empty-${i}`}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-[clamp(1.5rem,5vw,3rem)] text-zinc-600"
                >
                  —
                </div>
              ))}
            </div>
          )}
          
          {/* Turn Total */}
          {currentTurn.length > 0 && (
            <div className="mt-2 text-[clamp(1.2rem,4vw,2rem)] text-zinc-400">
              Turn: <span className="text-white font-bold">
                {currentTurn.reduce((sum, t) => sum + t.points, 0)}
              </span>
            </div>
          )}
          
          {/* Checkout Options */}
          {checkoutOptions.length > 0 && currentPlayer.currentScore <= 170 && (
            <div className="mt-4 text-center">
              <div className="text-[clamp(0.8rem,3vw,1.2rem)] text-zinc-500 mb-1">
                CHECKOUT
              </div>
              <div className="text-[clamp(1rem,4vw,1.8rem)] font-semibold text-yellow-400">
                {checkoutOptions.slice(0, 3).join(' • ')}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Bar - Other player + Legs */}
        <div className="w-full max-w-2xl px-2">
          <div className="flex items-center justify-between bg-zinc-900/50 rounded-xl p-3">
            {/* Other Player */}
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: `var(--${otherPlayer.color}, #666)` }}
              />
              <span className="text-[clamp(1rem,3vw,1.5rem)] text-zinc-400">
                {otherPlayer.name}
              </span>
              <span className="text-[clamp(1.2rem,4vw,2rem)] font-bold text-zinc-300">
                {otherPlayer.currentScore}
              </span>
            </div>
            
            {/* Legs */}
            <div className="flex items-center gap-2 text-[clamp(0.9rem,3vw,1.3rem)]">
              <span className="text-zinc-500">Legs:</span>
              <span className="font-bold text-white">
                {players[0].legsWon} - {players[1].legsWon}
              </span>
              <span className="text-zinc-600">
                (FT{config.legsToWin})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Version - tiny */}
      <div className="absolute bottom-1 left-1 text-[0.6rem] text-zinc-700">
        {VERSION}
      </div>
    </div>
  );
}
