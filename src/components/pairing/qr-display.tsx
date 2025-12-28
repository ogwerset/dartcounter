'use client';

import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';

interface QRDisplayProps {
  data: string;
  size?: number;
  className?: string;
  label?: string;
}

export function QRDisplay({
  data,
  size = 300,
  className,
  label,
}: QRDisplayProps) {
  // Warn if data is too large for reliable scanning
  const isTooLarge = data.length > 800;
  
  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {label && (
        <p className="text-sm text-zinc-400 text-center">{label}</p>
      )}
      <div className="rounded-xl bg-white p-6">
        <QRCodeSVG
          value={data}
          size={size}
          level="M" // Medium error correction for better scanning
          includeMargin={true}
        />
      </div>
      <p className={cn(
        "text-xs text-center max-w-xs",
        isTooLarge ? "text-yellow-500" : "text-zinc-500"
      )}>
        {data.length} chars {isTooLarge && "(may be hard to scan)"}
      </p>
    </div>
  );
}

