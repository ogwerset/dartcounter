import { create } from 'zustand';
import type { GameSyncPayload } from '@/types/bluetooth.types';

interface SyncState {
  // Connection state
  isConnected: boolean;
  isMaster: boolean;
  connectionMethod: 'broadcast' | 'webrtc' | null;
  lastSyncTime: number | null;
  error: string | null;
  
  // Actions
  setConnectionState: (connected: boolean, method?: 'broadcast' | 'webrtc') => void;
  setMasterMode: (isMaster: boolean) => void;
  setError: (error: string | null) => void;
  updateSyncTime: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isConnected: false,
  isMaster: false,
  connectionMethod: null,
  lastSyncTime: null,
  error: null,
  
  setConnectionState: (connected, method) => 
    set({ isConnected: connected, connectionMethod: method || null }),
  
  setMasterMode: (isMaster) => set({ isMaster }),
  
  setError: (error) => set({ error }),
  
  updateSyncTime: () => set({ lastSyncTime: Date.now() }),
}));

// BroadcastChannel singleton
let broadcastChannel: BroadcastChannel | null = null;
let messageHandler: ((payload: GameSyncPayload) => void) | null = null;

/**
 * Initialize BroadcastChannel for same-origin sync
 */
export function initBroadcastChannel(
  onMessage: (payload: GameSyncPayload) => void
): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    if (broadcastChannel) {
      broadcastChannel.close();
    }
    
    broadcastChannel = new BroadcastChannel('darts-scorer-sync');
    messageHandler = onMessage;
    
    broadcastChannel.onmessage = (event) => {
      if (event.data && messageHandler) {
        messageHandler(event.data as GameSyncPayload);
      }
    };
    
    return true;
  } catch (error) {
    console.error('BroadcastChannel not supported:', error);
    return false;
  }
}

/**
 * Send game state via BroadcastChannel
 */
export function sendViaBroadcast(payload: GameSyncPayload): boolean {
  if (!broadcastChannel) return false;
  
  try {
    broadcastChannel.postMessage(payload);
    return true;
  } catch (error) {
    console.error('Failed to send via BroadcastChannel:', error);
    return false;
  }
}

/**
 * Close BroadcastChannel
 */
export function closeBroadcastChannel(): void {
  if (broadcastChannel) {
    broadcastChannel.close();
    broadcastChannel = null;
    messageHandler = null;
  }
}

