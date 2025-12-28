'use client';

import type { Throw } from '@/types/game.types';
import { formatThrow } from '@/lib/game-logic/scoring';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CurrentTurnProps {
  throws: Throw[];
  className?: string;
}

export function CurrentTurn({ throws, className }: CurrentTurnProps): JSX.Element {
  const totalPoints = throws.reduce((sum, t) => sum + t.points, 0);
  const slots = [0, 1, 2] as const;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex gap-2">
        {slots.map((i) => {
          const throwData = throws[i];
          return (
            <Badge
              key={i}
              variant="outline"
              className={cn(
                'min-w-[3rem] text-center',
                'text-[clamp(1rem,4vw,1.5rem)]',
                'px-3 py-1.5',
                throwData ? 'bg-zinc-800' : 'bg-zinc-900/30'
              )}
            >
              {throwData ? formatThrow(throwData) : '-'}
            </Badge>
          );
        })}
      </div>
      {throws.length > 0 && (
        <span className={cn('text-[clamp(1.5rem,6vw,3rem)] font-bold', 'ml-2')}>
          = {totalPoints}
        </span>
      )}
    </div>
  );
}

