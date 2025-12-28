import type { Throw, GameConfig } from '@/types/game.types';
import { calculatePoints } from './scoring';

/**
 * Check if a throw would result in a bust
 * Bust occurs when:
 * - Score goes below 0
 * - Score equals 1 (cannot finish on single)
 * - Score is 0 but not finished on double (if double-out required)
 */
export function wouldBust(
  currentScore: number,
  throwPoints: number,
  config: GameConfig
): boolean {
  const newScore = currentScore - throwPoints;
  
  // Below zero = bust
  if (newScore < 0) return true;
  
  // Exactly 1 = bust (cannot finish)
  if (newScore === 1) return true;
  
  // If double-out required and score would be 0, check if it's a double
  if (config.doubleOut && newScore === 0) {
    // Check if the throw is a double (or bullseye which counts as double)
    const isDouble = throwPoints === 50 || throwPoints === 25 * 2;
    // Actually, we need to check the throw itself, not just points
    // This will be checked in validateThrow
    return false; // Will be validated separately
  }
  
  return false;
}

/**
 * Validate if a throw is legal (not a bust)
 */
export function validateThrow(
  currentScore: number,
  throwData: Throw,
  config: GameConfig
): { valid: boolean; reason?: string } {
  const throwPoints = throwData.points;
  const newScore = currentScore - throwPoints;
  
  // Below zero
  if (newScore < 0) {
    return { valid: false, reason: 'Bust: Score below zero' };
  }
  
  // Exactly 1
  if (newScore === 1) {
    return { valid: false, reason: 'Bust: Cannot finish on 1' };
  }
  
  // Double-out check
  if (config.doubleOut && newScore === 0) {
    // Must finish on double (or bullseye)
    const isDouble = throwData.multiplier === 2;
    const isBullseye = throwData.segment === 50;
    
    if (!isDouble && !isBullseye) {
      return { valid: false, reason: 'Bust: Must finish on double' };
    }
  }
  
  return { valid: true };
}

/**
 * Check if player won the leg (score is 0 and finished correctly)
 */
export function checkLegWin(
  currentScore: number,
  lastThrow: Throw,
  config: GameConfig
): boolean {
  if (currentScore !== 0) return false;
  
  if (config.doubleOut) {
    // Must finish on double or bullseye
    return lastThrow.multiplier === 2 || lastThrow.segment === 50;
  }
  
  return true;
}

/**
 * Get checkout suggestions for remaining score (≤170)
 */
export function getCheckoutOptions(remaining: number): string[] {
  if (remaining > 170) return [];
  if (remaining < 2) return [];
  
  // Common checkout combinations
  const checkouts: Record<number, string[]> = {
    170: ['T20', 'T20', 'Bull'],
    167: ['T20', 'T19', 'Bull'],
    164: ['T20', 'T18', 'Bull'],
    161: ['T20', 'T17', 'Bull'],
    160: ['T20', 'T20', 'D20'],
    158: ['T20', 'T20', 'D19'],
    157: ['T20', 'T19', 'D20'],
    156: ['T20', 'T20', 'D18'],
    155: ['T20', 'T19', 'D19'],
    154: ['T20', 'T18', 'D20'],
    153: ['T20', 'T19', 'D18'],
    152: ['T20', 'T20', 'D16'],
    151: ['T20', 'T17', 'D20'],
    150: ['T20', 'T18', 'D18'],
    149: ['T20', 'T19', 'D16'],
    148: ['T20', 'T20', 'D14'],
    147: ['T20', 'T17', 'D18'],
    146: ['T20', 'T18', 'D16'],
    145: ['T20', 'T19', 'D14'],
    144: ['T20', 'T20', 'D12'],
    143: ['T20', 'T17', 'D16'],
    142: ['T20', 'T18', 'D14'],
    141: ['T20', 'T19', 'D12'],
    140: ['T20', 'T20', 'D10'],
    139: ['T19', 'T14', 'D20'],
    138: ['T20', 'T18', 'D12'],
    137: ['T20', 'T19', 'D10'],
    136: ['T20', 'T20', 'D8'],
    135: ['T20', 'T17', 'D12'],
    134: ['T20', 'T18', 'D10'],
    133: ['T20', 'T19', 'D8'],
    132: ['T20', 'T20', 'D6'],
    131: ['T20', 'T17', 'D10'],
    130: ['T20', 'T20', 'D5'],
    129: ['T19', 'T16', 'D12'],
    128: ['T18', 'T14', 'D16'],
    127: ['T20', 'T17', 'D8'],
    126: ['T19', 'T19', 'D6'],
    125: ['T20', 'T19', 'D4'],
    124: ['T20', 'T16', 'D8'],
    123: ['T19', 'T16', 'D9'],
    122: ['T18', 'T18', 'D7'],
    121: ['T20', 'T11', 'D14'],
    120: ['T20', 'S20', 'D20'],
    119: ['T19', 'T12', 'D13'],
    118: ['T20', 'T18', 'D2'],
    117: ['T20', 'T15', 'D6'],
    116: ['T20', 'T16', 'D4'],
    115: ['T20', 'T15', 'D5'],
    114: ['T20', 'T14', 'D6'],
    113: ['T19', 'T16', 'D3'],
    112: ['T20', 'T12', 'D8'],
    111: ['T20', 'T13', 'D6'],
    110: ['T20', 'T10', 'D10'],
    109: ['T20', 'T9', 'D11'],
    108: ['T20', 'T16', 'D2'],
    107: ['T19', 'T18', 'D1'],
    106: ['T20', 'T14', 'D2'],
    105: ['T20', 'T13', 'D3'],
    104: ['T20', 'T12', 'D4'],
    103: ['T19', 'T18', 'D1'],
    102: ['T20', 'T10', 'D6'],
    101: ['T20', 'T9', 'D7'],
    100: ['T20', 'D20'],
    99: ['T19', 'D21'],
    98: ['T20', 'D19'],
    97: ['T19', 'D20'],
    96: ['T20', 'D18'],
    95: ['T19', 'D19'],
    94: ['T18', 'D20'],
    93: ['T19', 'D18'],
    92: ['T20', 'D16'],
    91: ['T17', 'D20'],
    90: ['T20', 'D15'],
    89: ['T19', 'D16'],
    88: ['T20', 'D14'],
    87: ['T17', 'D18'],
    86: ['T18', 'D16'],
    85: ['T19', 'D14'],
    84: ['T20', 'D12'],
    83: ['T17', 'D16'],
    82: ['T18', 'D14'],
    81: ['T19', 'D12'],
    80: ['T20', 'D10'],
    79: ['T19', 'D11'],
    78: ['T18', 'D12'],
    77: ['T19', 'D10'],
    76: ['T20', 'D8'],
    75: ['T17', 'D12'],
    74: ['T18', 'D10'],
    73: ['T19', 'D8'],
    72: ['T20', 'D6'],
    71: ['T17', 'D10'],
    70: ['T18', 'D8'],
    69: ['T19', 'D6'],
    68: ['T20', 'D4'],
    67: ['T17', 'D8'],
    66: ['T18', 'D6'],
    65: ['T19', 'D4'],
    64: ['T16', 'D8'],
    63: ['T17', 'D6'],
    62: ['T18', 'D4'],
    61: ['T15', 'D8'],
    60: ['T20', 'D0'], // S20
    59: ['T19', 'D1'],
    58: ['T18', 'D2'],
    57: ['T19', 'D0'], // S19
    56: ['T16', 'D4'],
    55: ['T17', 'D2'],
    54: ['T18', 'D0'], // S18
    53: ['T15', 'D4'],
    52: ['T20', 'D0'], // S12
    51: ['T17', 'D0'], // S17
    50: ['Bull'],
    49: ['T17', 'D0'], // S17
    48: ['T16', 'D0'], // S16
    47: ['T15', 'D1'],
    46: ['T14', 'D2'],
    45: ['T15', 'D0'], // S15
    44: ['T12', 'D4'],
    43: ['T13', 'D2'],
    42: ['T14', 'D0'], // S14
    41: ['T13', 'D1'],
    40: ['D20'],
    39: ['T13', 'D0'], // S13
    38: ['D19'],
    37: ['T11', 'D2'],
    36: ['D18'],
    35: ['T11', 'D1'],
    34: ['D17'],
    33: ['T11', 'D0'], // S11
    32: ['D16'],
    31: ['T9', 'D2'],
    30: ['D15'],
    29: ['T9', 'D1'],
    28: ['D14'],
    27: ['T9', 'D0'], // S9
    26: ['D13'],
    25: ['Bull'],
    24: ['D12'],
    23: ['T7', 'D1'],
    22: ['D11'],
    21: ['T7', 'D0'], // S7
    20: ['D10'],
    19: ['T5', 'D2'],
    18: ['D9'],
    17: ['T5', 'D1'],
    16: ['D8'],
    15: ['T5', 'D0'], // S5
    14: ['D7'],
    13: ['T3', 'D2'],
    12: ['D6'],
    11: ['T3', 'D1'],
    10: ['D5'],
    9: ['T3', 'D0'], // S3
    8: ['D4'],
    7: ['T1', 'D2'],
    6: ['D3'],
    5: ['T1', 'D1'],
    4: ['D2'],
    3: ['T1', 'D0'], // S1
    2: ['D1'],
  };
  
  return checkouts[remaining] || [];
}

