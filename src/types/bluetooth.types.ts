export interface BluetoothState {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string | null;
  error: string | null;
}

export interface GameSyncPayload {
  type: 'game_state' | 'throw' | 'turn_complete' | 'leg_win' | 'match_win';
  timestamp: number;
  data: {
    players: {
      id: string;
      name: string;
      color: string;
      currentScore: number;
      legsWon: number;
    }[];
    currentPlayerIndex: number;
    currentTurn: {
      segment: number;
      multiplier: number;
      points: number;
    }[];
    currentLeg: number;
    matchWinner: string | null;
  };
}

// Web Bluetooth GATT Service UUIDs
export const DARTS_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
export const GAME_STATE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';

