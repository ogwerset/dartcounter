'use client';

import { cn } from '@/lib/utils';

interface MegaScoreProps {
  score: number;
  className?: string;
}

export function MegaScore({ score, className }: MegaScoreProps): JSX.Element {
  return (
    <div
      className={cn(
        'text-center font-black tabular-nums',
        'text-[clamp(5rem,25vw,15rem)]',
        'text-[#00ff88]',
        'drop-shadow-[0_0_20px_rgba(0,255,136,0.5)]',
        className
      )}
    >
      {score}
    </div>
  );
}

