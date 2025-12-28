'use client';

import type { Player } from '@/types/game.types';
import { cn } from '@/lib/utils';

interface PlayerIndicatorProps {
  player: Player;
  isActive: boolean;
  className?: string;
}

export function PlayerIndicator({
  player,
  isActive,
  className,
}: PlayerIndicatorProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-3',
        'text-[clamp(1.2rem,5vw,2.5rem)]',
        className
      )}
    >
      <div
        className={cn(
          'h-4 w-4 rounded-full',
          isActive ? 'bg-primary' : 'bg-zinc-600',
          'transition-colors'
        )}
      />
      <span className={cn('font-semibold', isActive && 'text-primary')}>
        {player.name}
      </span>
    </div>
  );
}

