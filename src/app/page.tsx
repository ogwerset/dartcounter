'use client';

import Link from 'next/link';
import { Camera, Monitor, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const VERSION = 'v1.0.6';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Darts Scorer</h1>
          <p className="text-zinc-400">Choose your mode</p>
        </div>

        <div className="grid gap-4">
          <Link href="/master">
            <Card className="cursor-pointer transition-all hover:border-primary hover:bg-zinc-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Camera className="h-8 w-8 text-primary" />
                  Master
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400">
                  Scan & Score - Input points manually or use camera (Phase 3)
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/slave">
            <Card className="cursor-pointer transition-all hover:border-primary hover:bg-zinc-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Monitor className="h-8 w-8 text-primary" />
                  Slave
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-400">
                  Live Display - Mega scoreboard visible from 2-3 meters
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="pt-4 space-y-3">
          <Link href="/setup">
            <Button variant="outline" className="w-full">
              New Game Setup
            </Button>
          </Link>
          <Link href="/pair">
            <Button variant="ghost" className="w-full">
              <Link2 className="mr-2 h-4 w-4" />
              Pair Devices
            </Button>
          </Link>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          {VERSION}
        </p>
      </div>
    </div>
  );
}

