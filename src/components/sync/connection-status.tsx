'use client';

import { Wifi, WifiOff, Radio } from 'lucide-react';
import { useSyncStore } from '@/lib/stores/sync-store';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  className?: string;
}

export function ConnectionStatus({ className }: ConnectionStatusProps): JSX.Element {
  const { isConnected, connectionMethod, lastSyncTime, isMaster } = useSyncStore();
  
  const timeSinceSync = lastSyncTime
    ? Math.floor((Date.now() - lastSyncTime) / 1000)
    : null;
  
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1 text-xs',
        isConnected
          ? 'bg-green-500/20 text-green-400'
          : 'bg-zinc-800 text-zinc-500',
        className
      )}
    >
      {isConnected ? (
        <>
          <Radio className="h-3 w-3 animate-pulse" />
          <span>
            {isMaster ? 'Broadcasting' : 'Receiving'}
            {connectionMethod && ` (${connectionMethod})`}
          </span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
        </>
      )}
    </div>
  );
}

