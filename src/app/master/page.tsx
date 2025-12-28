'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Numpad } from '@/components/game/numpad';
import { CurrentTurn } from '@/components/game/current-turn';
import { PlayerIndicator } from '@/components/game/player-indicator';
import { TurnHistory } from '@/components/game/turn-history';
import { useGameStore } from '@/lib/stores/game-store';
import type { DataConnection } from 'peerjs';

const VERSION = 'v1.0.4';

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

      {/* Numpad */}
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

