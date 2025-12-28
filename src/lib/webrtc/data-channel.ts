import type { GameSyncPayload } from '@/types/bluetooth.types';

export type DataChannelMessageHandler = (payload: GameSyncPayload) => void;

/**
 * Setup data channel event handlers
 */
export function setupDataChannel(
  dataChannel: RTCDataChannel,
  onMessage: DataChannelMessageHandler,
  onOpen?: () => void,
  onClose?: () => void
): void {
  dataChannel.onopen = () => {
    console.log('[WebRTC] DataChannel opened');
    onOpen?.();
  };
  
  dataChannel.onclose = () => {
    console.log('[WebRTC] DataChannel closed');
    onClose?.();
  };
  
  dataChannel.onerror = (error) => {
    console.error('[WebRTC] DataChannel error:', error);
  };
  
  dataChannel.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as GameSyncPayload;
      onMessage(payload);
    } catch (error) {
      console.error('[WebRTC] Failed to parse message:', error);
    }
  };
}

/**
 * Send payload via data channel
 */
export function sendViaDataChannel(
  dataChannel: RTCDataChannel | null,
  payload: GameSyncPayload
): boolean {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    console.warn('[WebRTC] DataChannel not ready');
    return false;
  }
  
  try {
    dataChannel.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('[WebRTC] Failed to send:', error);
    return false;
  }
}

