'use client';

import type { Turn, Player } from '@/types/game.types';
import { formatThrow } from '@/lib/game-logic/scoring';
import { cn } from '@/lib/utils';

interface TurnHistoryProps {
  turns: Turn[];
  players: [Player, Player];
  maxTurns?: number;
  className?: string;
}

export function TurnHistory({
  turns,
  players,
  maxTurns = 5,
  className,
}: TurnHistoryProps) {
  const recentTurns = turns.slice(-maxTurns).reverse();
  const playerMap = new Map(players.map((p) => [p.id, p]));

  if (recentTurns.length === 0) {
    return (
      <div className={cn('text-zinc-500 text-center', className)}>
        No throws yet
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {recentTurns.map((turn, idx) => {
        const player = playerMap.get(turn.playerId);
        if (!player) return null;

        return (
          <div
            key={`${turn.timestamp}-${idx}`}
            className="flex items-center gap-2 text-sm"
          >
            <span className="font-semibold w-20 truncate">{player.name}:</span>
            <div className="flex gap-1">
              {turn.throws.map((t, i) => (
                <span key={i} className="text-zinc-400">
                  {formatThrow(t)}
                  {i < turn.throws.length - 1 && ' •'}
                </span>
              ))}
            </div>
            <span className={cn('ml-auto', turn.isBust && 'text-accent')}>
              {turn.isBust ? 'BUST' : `= ${turn.totalPoints}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

