'use client';

import type { Player } from '@/types/game.types';
import { cn } from '@/lib/utils';

interface LegIndicatorProps {
  players: [Player, Player];
  legsToWin: number;
  className?: string;
}

export function LegIndicator({
  players,
  legsToWin,
  className,
}: LegIndicatorProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-4',
        'text-[clamp(1.2rem,5vw,2.5rem)]',
        className
      )}
    >
      <span className="font-semibold">
        Legs: {players[0].legsWon} - {players[1].legsWon}
      </span>
      <span className="text-zinc-500">(First to {legsToWin})</span>
    </div>
  );
}

