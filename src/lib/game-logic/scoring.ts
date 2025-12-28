import type { Throw } from '@/types/game.types';

/**
 * Calculate points for a throw
 */
export function calculatePoints(segment: number, multiplier: 1 | 2 | 3): number {
  if (segment === 25 || segment === 50) {
    // Bull and Bullseye don't have multipliers
    return segment;
  }
  return segment * multiplier;
}

/**
 * Format throw for display (e.g., "T20", "D18", "S5", "Bull")
 */
export function formatThrow(throwData: Throw): string {
  if (throwData.segment === 50) return 'Bull';
  if (throwData.segment === 25) return '25';
  
  const prefix = throwData.multiplier === 3 ? 'T' : throwData.multiplier === 2 ? 'D' : 'S';
  return `${prefix}${throwData.segment}`;
}

/**
 * Format throw for display with points (e.g., "T20 (60)")
 */
export function formatThrowWithPoints(throwData: Throw): string {
  const formatted = formatThrow(throwData);
  return `${formatted} (${throwData.points})`;
}

