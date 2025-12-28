'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Numpad } from '@/components/game/numpad';
import { CurrentTurn } from '@/components/game/current-turn';
import { PlayerIndicator } from '@/components/game/player-indicator';
import { TurnHistory } from '@/components/game/turn-history';
import { SyncIndicator } from '@/components/sync/sync-indicator';
import { useGameStore } from '@/lib/stores/game-store';
import { useSync } from '@/hooks/useSync';

export default function MasterPage() {
  const router = useRouter();
  const {
    players,
    currentPlayerIndex,
    currentTurn,
    turnHistory,
    isGameActive,
    addThrow,
    completeTurn,
    nextPlayer,
    clearCurrentTurn,
  } = useGameStore();
  
  // Initialize sync as master (broadcaster)
  const { isConnected } = useSync({ mode: 'master' });

  if (!isGameActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="mb-4">No active game. Please setup a new game.</p>
            <Button onClick={() => router.push('/setup')}>Go to Setup</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPlayer = players[currentPlayerIndex];
  const canConfirm = currentTurn.length > 0;

  const handleThrow = (segment: number, multiplier: 1 | 2 | 3): void => {
    if (currentTurn.length >= 3) return;
    addThrow({ segment, multiplier });
  };

  const handleMiss = (): void => {
    if (currentTurn.length >= 3) return;
    addThrow({ segment: 0, multiplier: 1 });
  };

  const handleNext = (): void => {
    completeTurn();
    // Auto-switch to next player after a short delay
    setTimeout(() => {
      nextPlayer();
    }, 500);
  };

  return (
    <div className="container mx-auto max-w-2xl p-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <SyncIndicator />
      </div>

      {/* Current Player */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <PlayerIndicator
            player={currentPlayer}
            isActive={true}
            className="mb-4"
          />
          <div className="text-center">
            <div className="text-4xl font-bold mb-2">
              {currentPlayer.currentScore}
            </div>
            <div className="text-sm text-zinc-400">Remaining</div>
          </div>
        </CardContent>
      </Card>

      {/* Current Turn */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="mb-2 text-sm font-medium text-zinc-400">
            Current Turn ({currentTurn.length}/3)
          </div>
          <CurrentTurn throws={currentTurn} />
        </CardContent>
      </Card>

      {/* Numpad */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <Numpad
            onThrow={handleThrow}
            onMiss={handleMiss}
            onClear={clearCurrentTurn}
            onNext={handleNext}
            canConfirm={canConfirm}
          />
        </CardContent>
      </Card>

      {/* Turn History */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 text-sm font-medium text-zinc-400">
            Recent Throws
          </div>
          <TurnHistory turns={turnHistory} players={players} />
        </CardContent>
      </Card>
    </div>
  );
}

