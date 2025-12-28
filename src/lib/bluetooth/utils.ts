import type { GameSyncPayload } from '@/types/bluetooth.types';
import type { GameState } from '@/types/game.types';

/**
 * Check if Web Bluetooth API is supported
 */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Convert GameState to sync payload
 */
export function createSyncPayload(
  state: GameState,
  type: GameSyncPayload['type'] = 'game_state'
): GameSyncPayload {
  return {
    type,
    timestamp: Date.now(),
    data: {
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        currentScore: p.currentScore,
        legsWon: p.legsWon,
      })),
      currentPlayerIndex: state.currentPlayerIndex,
      currentTurn: state.currentTurn.map((t) => ({
        segment: t.segment,
        multiplier: t.multiplier,
        points: t.points,
      })),
      currentLeg: state.currentLeg,
      matchWinner: state.matchWinner?.id || null,
    },
  };
}

/**
 * Encode payload to ArrayBuffer for BLE transmission
 */
export function encodePayload(payload: GameSyncPayload): ArrayBuffer {
  const jsonString = JSON.stringify(payload);
  const encoder = new TextEncoder();
  return encoder.encode(jsonString).buffer;
}

/**
 * Decode ArrayBuffer from BLE to payload
 */
export function decodePayload(buffer: ArrayBuffer): GameSyncPayload | null {
  try {
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(buffer);
    return JSON.parse(jsonString) as GameSyncPayload;
  } catch {
    console.error('Failed to decode BLE payload');
    return null;
  }
}

