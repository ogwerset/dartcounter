'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MegaScore } from '@/components/game/mega-score';
import { CurrentTurn } from '@/components/game/current-turn';
import { PlayerIndicator } from '@/components/game/player-indicator';
import { LegIndicator } from '@/components/game/leg-indicator';
import { TurnHistory } from '@/components/game/turn-history';
import { useGameStore } from '@/lib/stores/game-store';
import { getCheckoutOptions } from '@/lib/game-logic/rules';
import type { DataConnection } from 'peerjs';

const VERSION = 'v1.0.3';

export default function SlavePage() {
  const router = useRouter();
  const { players, currentPlayerIndex, currentTurn, turnHistory, isGameActive, config } =
    useGameStore();
  
  // Get PeerJS connection from window (set during pairing)
  const getConnection = (): DataConnection | null => {
    if (typeof window !== 'undefined') {
      return (window as any).__dartConnection || null;
    }
    return null;
  };
  
  const isConnected = typeof window !== 'undefined' && !!(window as any).__dartConnection;
  
  // Setup data listener when component mounts
  useEffect(() => {
    const conn = getConnection();
    if (!conn) {
      console.warn('[Slave] No connection available');
      return;
    }
    
    console.log('[Slave] Setting up data listener, connection open:', conn.open);
    
    // Setup listener for incoming data
    const handleData = (data: unknown) => {
      console.log('[Slave] Received data:', data);
      
      if (data && typeof data === 'object' && 'type' in data) {
        const payload = data as { type: string; data: unknown };
        if (payload.type === 'game-sync') {
          console.log('[Slave] Processing game-sync payload');
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
          console.log('[Slave] State updated, game active:', true);
        }
      }
    };
    
    // Also handle game-start message
    const handleGameStart = (data: unknown) => {
      if (data && typeof data === 'object' && 'type' in data) {
        const payload = data as { type: string; data: unknown };
        if (payload.type === 'game-start') {
          console.log('[Slave] Game start received, updating state');
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
          console.log('[Slave] Game started');
        }
      }
    };
    
    // Listen for both game-sync and game-start
    const combinedHandler = (data: unknown) => {
      handleData(data);
      handleGameStart(data);
    };
    
    // Remove any existing listeners first
    conn.off('data');
    // Add new listener
    conn.on('data', combinedHandler);
    
    // Also listen for connection state changes
    conn.on('open', () => {
      console.log('[Slave] Connection opened');
    });
    
    conn.on('close', () => {
      console.log('[Slave] Connection closed');
    });
    
    conn.on('error', (err) => {
      console.error('[Slave] Connection error:', err);
    });
    
    return () => {
      conn.off('data', handleData);
      conn.off('open');
      conn.off('close');
      conn.off('error');
    };
  }, []);

  if (!isGameActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="text-center">
          <p className="mb-4 text-xl">No active game</p>
          <Button onClick={() => router.push('/setup')}>Setup Game</Button>
        </div>
      </div>
    );
  }

  const currentPlayer = players[currentPlayerIndex];
  const checkoutOptions = getCheckoutOptions(currentPlayer.currentScore);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      {/* Header with back button and sync status */}
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
          className="text-zinc-500"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
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
              <span className="text-zinc-500">Offline - Tap to pair</span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-col items-center space-y-6">
        {/* Current Player Name */}
        <div className="text-center">
          <div className="text-[clamp(2rem,8vw,5rem)] font-bold mb-2">
            {currentPlayer.name.toUpperCase()}
          </div>
          <PlayerIndicator
            player={currentPlayer}
            isActive={true}
            className="justify-center"
          />
        </div>

        {/* MEGA Score */}
        <div className="w-full text-center">
          <MegaScore score={currentPlayer.currentScore} />
        </div>

        {/* Current Turn */}
        {currentTurn.length > 0 && (
          <div className="w-full max-w-md">
            <div className="mb-2 text-center text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
              Current Turn
            </div>
            <div className="flex justify-center">
              <CurrentTurn throws={currentTurn} />
            </div>
          </div>
        )}

        {/* Checkout Suggestions */}
        {checkoutOptions.length > 0 && currentPlayer.currentScore <= 170 && (
          <div className="w-full max-w-md text-center">
            <div className="mb-2 text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
              Checkout:
            </div>
            <div className="text-[clamp(1.2rem,5vw,2rem)] font-semibold text-primary">
              {checkoutOptions.join(' • ')}
            </div>
          </div>
        )}

        {/* Leg Indicator */}
        <div className="w-full">
          <LegIndicator players={players} legsToWin={config.legsToWin} />
        </div>

        {/* Player Scores */}
        <div className="grid w-full max-w-md grid-cols-2 gap-4">
          {players.map((player, idx) => (
            <div
              key={player.id}
              className={`rounded-lg border p-4 text-center ${
                idx === currentPlayerIndex
                  ? 'border-primary bg-zinc-900'
                  : 'border-zinc-800 bg-zinc-950'
              }`}
            >
              <div className="text-[clamp(1.5rem,6vw,3rem)] font-bold">
                {player.currentScore}
              </div>
              <div className="text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
                {player.name}
              </div>
            </div>
          ))}
        </div>

        {/* Turn History */}
        {turnHistory.length > 0 && (
          <div className="w-full max-w-md">
            <div className="mb-2 text-center text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
              Recent Throws
            </div>
            <TurnHistory turns={turnHistory} players={players} maxTurns={3} />
          </div>
        )}

        {/* Version */}
        <p className="text-xs text-zinc-600 mt-6">
          {VERSION}
        </p>
      </div>
    </div>
  );
}

