export interface Throw {
  segment: number; // 1-20, 25 (outer bull), 50 (bullseye)
  multiplier: 1 | 2 | 3; // Single, Double, Triple
  points: number; // Calculated: segment * multiplier
  timestamp: number;
}

export interface Turn {
  playerId: string;
  throws: Throw[]; // Max 3 throws
  totalPoints: number;
  isBust: boolean;
  timestamp: number;
}

export interface Player {
  id: string;
  name: string;
  color: string; // Tailwind color class (e.g., 'red-500', 'blue-500')
  currentScore: number; // Remaining points in current leg
  legsWon: number;
  throws: Throw[]; // All throws in current leg
}

export interface GameConfig {
  startingScore: 301;
  legsToWin: number; // "First to X"
  doubleOut: boolean;
}

export interface GameState {
  config: GameConfig;
  players: [Player, Player]; // Exactly 2 players
  currentPlayerIndex: 0 | 1;
  currentTurn: Throw[]; // 0-3 throws in current turn
  currentLeg: number; // Which leg we're on (1-indexed)
  turnHistory: Turn[]; // All completed turns
  matchWinner: Player | null;
  isGameActive: boolean;
}

export type GameMode = 'master' | 'slave';

