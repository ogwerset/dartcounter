'use client';

import { useEffect, useState } from 'react';
import { Radio, Wifi, WifiOff } from 'lucide-react';
import { useSyncStore } from '@/lib/stores/sync-store';
import { cn } from '@/lib/utils';

interface SyncIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function SyncIndicator({
  className,
  showLabel = true,
}: SyncIndicatorProps): JSX.Element {
  const { isConnected, lastSyncTime, isMaster } = useSyncStore();
  const [pulse, setPulse] = useState(false);
  
  // Pulse animation when sync happens
  useEffect(() => {
    if (lastSyncTime) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 500);
      return () => clearTimeout(timer);
    }
  }, [lastSyncTime]);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        isConnected ? 'text-green-400' : 'text-zinc-500',
        className
      )}
    >
      <div className={cn('relative', pulse && 'animate-ping')}>
        {isConnected ? (
          <Radio className={cn('h-4 w-4', pulse && 'text-green-300')} />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
      </div>
      {showLabel && (
        <span className="text-xs">
          {isConnected
            ? isMaster
              ? 'Live'
              : 'Synced'
            : 'Offline'}
        </span>
      )}
    </div>
  );
}

