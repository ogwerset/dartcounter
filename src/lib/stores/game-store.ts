import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, Player, Throw, Turn, GameConfig } from '@/types/game.types';
import { calculatePoints } from '@/lib/game-logic/scoring';
import { validateThrow, checkLegWin } from '@/lib/game-logic/rules';

interface GameStore extends GameState {
  // Actions
  initializeGame: (player1: Omit<Player, 'id' | 'currentScore' | 'legsWon' | 'throws'>, player2: Omit<Player, 'id' | 'currentScore' | 'legsWon' | 'throws'>, config: GameConfig) => void;
  addThrow: (throwData: Omit<Throw, 'points' | 'timestamp'>) => void;
  completeTurn: () => void;
  nextPlayer: () => void;
  resetLeg: () => void;
  resetGame: () => void;
  clearCurrentTurn: () => void;
}

const defaultConfig: GameConfig = {
  startingScore: 301,
  legsToWin: 3,
  doubleOut: true,
};

const createInitialState = (): GameState => ({
  config: defaultConfig,
  players: [
    {
      id: 'player1',
      name: 'Player 1',
      color: 'blue-500',
      currentScore: 301,
      legsWon: 0,
      throws: [],
    },
    {
      id: 'player2',
      name: 'Player 2',
      color: 'red-500',
      currentScore: 301,
      legsWon: 0,
      throws: [],
    },
  ],
  currentPlayerIndex: 0,
  currentTurn: [],
  currentLeg: 1,
  turnHistory: [],
  matchWinner: null,
  isGameActive: false,
});

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      initializeGame: (player1, player2, config) => {
        const newState: GameState = {
          config,
          players: [
            {
              id: 'player1',
              name: player1.name,
              color: player1.color,
              currentScore: config.startingScore,
              legsWon: 0,
              throws: [],
            },
            {
              id: 'player2',
              name: player2.name,
              color: player2.color,
              currentScore: config.startingScore,
              legsWon: 0,
              throws: [],
            },
          ],
          currentPlayerIndex: 0,
          currentTurn: [],
          currentLeg: 1,
          turnHistory: [],
          matchWinner: null,
          isGameActive: true,
        };
        set(newState);
      },

      addThrow: (throwData) => {
        const state = get();
        if (!state.isGameActive) return;
        if (state.currentTurn.length >= 3) return;

        const points = calculatePoints(throwData.segment, throwData.multiplier);
        const throwWithPoints: Throw = {
          ...throwData,
          points,
          timestamp: Date.now(),
        };

        const currentPlayer = state.players[state.currentPlayerIndex];
        const validation = validateThrow(currentPlayer.currentScore, throwWithPoints, state.config);

        if (!validation.valid) {
          // Still add the throw but mark turn as bust
          set({
            currentTurn: [...state.currentTurn, throwWithPoints],
          });
          return;
        }

        set({
          currentTurn: [...state.currentTurn, throwWithPoints],
        });
      },

      completeTurn: () => {
        const state = get();
        if (!state.isGameActive) return;
        if (state.currentTurn.length === 0) return;

        const currentPlayer = state.players[state.currentPlayerIndex];
        const totalPoints = state.currentTurn.reduce((sum, t) => sum + t.points, 0);
        const newScore = currentPlayer.currentScore - totalPoints;

        // Check for bust
        let isBust = false;
        if (newScore < 0 || newScore === 1) {
          isBust = true;
        } else if (state.config.doubleOut && newScore === 0) {
          const lastThrow = state.currentTurn[state.currentTurn.length - 1];
          if (lastThrow.multiplier !== 2 && lastThrow.segment !== 50) {
            isBust = true;
          }
        }

        const turn: Turn = {
          playerId: currentPlayer.id,
          throws: [...state.currentTurn],
          totalPoints,
          isBust,
          timestamp: Date.now(),
        };

        const updatedPlayers = [...state.players];
        if (!isBust) {
          updatedPlayers[state.currentPlayerIndex] = {
            ...currentPlayer,
            currentScore: newScore,
            throws: [...currentPlayer.throws, ...state.currentTurn],
          };

          // Check for leg win
          if (newScore === 0) {
            const lastThrow = state.currentTurn[state.currentTurn.length - 1];
            if (checkLegWin(0, lastThrow, state.config)) {
              updatedPlayers[state.currentPlayerIndex] = {
                ...updatedPlayers[state.currentPlayerIndex],
                legsWon: updatedPlayers[state.currentPlayerIndex].legsWon + 1,
              };

              // Check for match win
              if (updatedPlayers[state.currentPlayerIndex].legsWon >= state.config.legsToWin) {
                set({
                  players: updatedPlayers,
                  turnHistory: [...state.turnHistory, turn],
                  currentTurn: [],
                  matchWinner: updatedPlayers[state.currentPlayerIndex],
                  isGameActive: false,
                });
                return;
              }
            }
          }
        }

        set({
          players: updatedPlayers,
          turnHistory: [...state.turnHistory, turn],
          currentTurn: [],
        });
      },

      nextPlayer: () => {
        const state = get();
        if (!state.isGameActive) return;

        set({
          currentPlayerIndex: state.currentPlayerIndex === 0 ? 1 : 0,
          currentTurn: [],
        });
      },

      resetLeg: () => {
        const state = get();
        if (!state.isGameActive) return;

        set({
          players: state.players.map((p) => ({
            ...p,
            currentScore: state.config.startingScore,
            throws: [],
          })),
          currentPlayerIndex: 0,
          currentTurn: [],
          currentLeg: state.currentLeg + 1,
          turnHistory: [],
        });
      },

      resetGame: () => {
        set(createInitialState());
      },

      clearCurrentTurn: () => {
        set({ currentTurn: [] });
      },
    }),
    {
      name: 'darts-game-storage',
      partialize: (state) => ({
        config: state.config,
        players: state.players,
        currentPlayerIndex: state.currentPlayerIndex,
        currentLeg: state.currentLeg,
        turnHistory: state.turnHistory,
        matchWinner: state.matchWinner,
        isGameActive: state.isGameActive,
        // Don't persist currentTurn - reset on reload
      }),
    }
  )
);

