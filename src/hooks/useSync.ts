'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '@/lib/stores/game-store';
import {
  useSyncStore,
  initBroadcastChannel,
  sendViaBroadcast,
  closeBroadcastChannel,
} from '@/lib/stores/sync-store';
import { createSyncPayload } from '@/lib/bluetooth/utils';
import type { GameSyncPayload } from '@/types/bluetooth.types';

interface UseSyncOptions {
  mode: 'master' | 'slave';
  autoConnect?: boolean;
}

export function useSync({ mode, autoConnect = true }: UseSyncOptions) {
  const gameState = useGameStore();
  const {
    isConnected,
    setConnectionState,
    setMasterMode,
    setError,
    updateSyncTime,
  } = useSyncStore();
  
  const previousStateRef = useRef<string>('');
  const isMaster = mode === 'master';

  // Initialize connection
  useEffect(() => {
    if (!autoConnect) return;
    
    setMasterMode(isMaster);
    
    const handleMessage = (payload: GameSyncPayload) => {
      if (isMaster) return; // Master doesn't receive, only sends
      
      // Update game state from received payload
      updateSyncTime();
      
      // Apply received state to store
      const { data } = payload;
      
      // We need to update the game store with received data
      // This is a simplified update - in production you'd want more granular control
      useGameStore.setState({
        players: data.players.map((p, idx) => ({
          ...gameState.players[idx],
          ...p,
          throws: gameState.players[idx]?.throws || [],
        })) as [typeof gameState.players[0], typeof gameState.players[1]],
        currentPlayerIndex: data.currentPlayerIndex as 0 | 1,
        currentTurn: data.currentTurn.map((t) => ({
          ...t,
          multiplier: t.multiplier as 1 | 2 | 3,
          timestamp: Date.now(),
        })),
        currentLeg: data.currentLeg,
        matchWinner: data.matchWinner
          ? gameState.players.find((p) => p.id === data.matchWinner) || null
          : null,
      });
    };
    
    const success = initBroadcastChannel(handleMessage);
    if (success) {
      setConnectionState(true, 'broadcast');
    } else {
      setError('BroadcastChannel not supported');
    }
    
    return () => {
      closeBroadcastChannel();
      setConnectionState(false);
    };
  }, [autoConnect, isMaster, setConnectionState, setMasterMode, setError, updateSyncTime]);

  // Auto-send state changes (Master only)
  useEffect(() => {
    if (!isMaster || !isConnected) return;
    
    // Create a serialized version of relevant state for comparison
    const currentState = JSON.stringify({
      players: gameState.players.map((p) => ({
        currentScore: p.currentScore,
        legsWon: p.legsWon,
      })),
      currentPlayerIndex: gameState.currentPlayerIndex,
      currentTurn: gameState.currentTurn,
      currentLeg: gameState.currentLeg,
      matchWinner: gameState.matchWinner?.id,
    });
    
    // Only send if state changed
    if (currentState !== previousStateRef.current) {
      previousStateRef.current = currentState;
      const payload = createSyncPayload(gameState, 'game_state');
      sendViaBroadcast(payload);
      updateSyncTime();
    }
  }, [
    isMaster,
    isConnected,
    gameState.players,
    gameState.currentPlayerIndex,
    gameState.currentTurn,
    gameState.currentLeg,
    gameState.matchWinner,
    updateSyncTime,
  ]);

  // Manual send function
  const sendUpdate = useCallback(
    (type: GameSyncPayload['type'] = 'game_state') => {
      if (!isMaster || !isConnected) return false;
      
      const payload = createSyncPayload(gameState, type);
      const success = sendViaBroadcast(payload);
      if (success) {
        updateSyncTime();
      }
      return success;
    },
    [isMaster, isConnected, gameState, updateSyncTime]
  );

  return {
    isConnected,
    isMaster,
    sendUpdate,
  };
}

