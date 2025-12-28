'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGameStore } from '@/lib/stores/game-store';
import type { GameConfig } from '@/types/game.types';

const COLORS = [
  { name: 'Blue', value: 'blue-500', hex: '#3b82f6' },
  { name: 'Red', value: 'red-500', hex: '#ef4444' },
  { name: 'Green', value: 'green-500', hex: '#22c55e' },
  { name: 'Yellow', value: 'yellow-500', hex: '#eab308' },
  { name: 'Purple', value: 'purple-500', hex: '#a855f7' },
  { name: 'Pink', value: 'pink-500', hex: '#ec4899' },
] as const;

export default function SetupPage(): JSX.Element {
  const router = useRouter();
  const initializeGame = useGameStore((state) => state.initializeGame);

  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player1Color, setPlayer1Color] = useState(COLORS[0].value);
  const [player2Name, setPlayer2Name] = useState('Player 2');
  const [player2Color, setPlayer2Color] = useState(COLORS[1].value);
  const [legsToWin, setLegsToWin] = useState(3);

  const handleStart = (): void => {
    const config: GameConfig = {
      startingScore: 301,
      legsToWin,
      doubleOut: true,
    };

    initializeGame(
      { name: player1Name, color: player1Color },
      { name: player2Name, color: player2Color },
      config
    );

    router.push('/master');
  };

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">Game Setup</h1>

      <div className="space-y-6">
        {/* Player 1 */}
        <Card>
          <CardHeader>
            <CardTitle>Player 1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={player1Name}
                onChange={(e) => setPlayer1Name(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setPlayer1Color(color.value)}
                    className={`h-10 w-10 rounded-full border-2 transition-all ${
                      player1Color === color.value
                        ? 'border-primary scale-110'
                        : 'border-zinc-700'
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Player 2 */}
        <Card>
          <CardHeader>
            <CardTitle>Player 2</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={player2Name}
                onChange={(e) => setPlayer2Name(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setPlayer2Color(color.value)}
                    className={`h-10 w-10 rounded-full border-2 transition-all ${
                      player2Color === color.value
                        ? 'border-primary scale-110'
                        : 'border-zinc-700'
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Game Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                First to (legs)
              </label>
              <select
                value={legsToWin}
                onChange={(e) => setLegsToWin(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-50 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {[1, 2, 3, 4, 5, 7, 9].map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-sm text-zinc-400">
              <p>• Starting score: 301</p>
              <p>• Double-out required</p>
            </div>
          </CardContent>
        </Card>

        {/* Start Button */}
        <Button onClick={handleStart} className="w-full" size="lg">
          Start Game
        </Button>
      </div>
    </div>
  );
}

