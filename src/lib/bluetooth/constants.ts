// Web Bluetooth GATT Service UUIDs
// Custom UUIDs for Darts Scorer PWA

export const DARTS_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
export const GAME_STATE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';

// BLE connection parameters
export const BLE_CONFIG = {
  // Name prefix for device discovery
  namePrefix: 'DartsScorer',
  
  // Reconnection settings
  maxReconnectAttempts: 3,
  reconnectDelayMs: 1000,
  
  // Heartbeat interval for connection monitoring
  heartbeatIntervalMs: 5000,
} as const;

