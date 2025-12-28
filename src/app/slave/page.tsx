'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MegaScore } from '@/components/game/mega-score';
import { CurrentTurn } from '@/components/game/current-turn';
import { PlayerIndicator } from '@/components/game/player-indicator';
import { LegIndicator } from '@/components/game/leg-indicator';
import { TurnHistory } from '@/components/game/turn-history';
import { useGameStore } from '@/lib/stores/game-store';
import { getCheckoutOptions } from '@/lib/game-logic/rules';

const VERSION = 'v1.0.0';

export default function SlavePage() {
  const router = useRouter();
  const { players, currentPlayerIndex, currentTurn, turnHistory, isGameActive, config } =
    useGameStore();
  
  // Get PeerJS connection status from window (set during pairing)
  const isConnected = typeof window !== 'undefined' && !!(window as any).__dartConnection;

  if (!isGameActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="text-center">
          <p className="mb-4 text-xl">No active game</p>
          <Button onClick={() => router.push('/setup')}>Setup Game</Button>
        </div>
      </div>
    );
  }

  const currentPlayer = players[currentPlayerIndex];
  const checkoutOptions = getCheckoutOptions(currentPlayer.currentScore);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      {/* Header with back button and sync status */}
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
          className="text-zinc-500"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2 text-sm">
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-400" />
              <span className="text-green-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-zinc-500" />
              <span className="text-zinc-500">Offline</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center space-y-6">
        {/* Current Player Name */}
        <div className="text-center">
          <div className="text-[clamp(2rem,8vw,5rem)] font-bold mb-2">
            {currentPlayer.name.toUpperCase()}
          </div>
          <PlayerIndicator
            player={currentPlayer}
            isActive={true}
            className="justify-center"
          />
        </div>

        {/* MEGA Score */}
        <div className="w-full text-center">
          <MegaScore score={currentPlayer.currentScore} />
        </div>

        {/* Current Turn */}
        {currentTurn.length > 0 && (
          <div className="w-full max-w-md">
            <div className="mb-2 text-center text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
              Current Turn
            </div>
            <div className="flex justify-center">
              <CurrentTurn throws={currentTurn} />
            </div>
          </div>
        )}

        {/* Checkout Suggestions */}
        {checkoutOptions.length > 0 && currentPlayer.currentScore <= 170 && (
          <div className="w-full max-w-md text-center">
            <div className="mb-2 text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
              Checkout:
            </div>
            <div className="text-[clamp(1.2rem,5vw,2rem)] font-semibold text-primary">
              {checkoutOptions.join(' • ')}
            </div>
          </div>
        )}

        {/* Leg Indicator */}
        <div className="w-full">
          <LegIndicator players={players} legsToWin={config.legsToWin} />
        </div>

        {/* Player Scores */}
        <div className="grid w-full max-w-md grid-cols-2 gap-4">
          {players.map((player, idx) => (
            <div
              key={player.id}
              className={`rounded-lg border p-4 text-center ${
                idx === currentPlayerIndex
                  ? 'border-primary bg-zinc-900'
                  : 'border-zinc-800 bg-zinc-950'
              }`}
            >
              <div className="text-[clamp(1.5rem,6vw,3rem)] font-bold">
                {player.currentScore}
              </div>
              <div className="text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
                {player.name}
              </div>
            </div>
          ))}
        </div>

        {/* Turn History */}
        {turnHistory.length > 0 && (
          <div className="w-full max-w-md">
            <div className="mb-2 text-center text-[clamp(1rem,4vw,1.5rem)] text-zinc-400">
              Recent Throws
            </div>
            <TurnHistory turns={turnHistory} players={players} maxTurns={3} />
          </div>
        )}

        {/* Version */}
        <p className="text-xs text-zinc-600 mt-6">
          {VERSION}
        </p>
      </div>
    </div>
  );
}

