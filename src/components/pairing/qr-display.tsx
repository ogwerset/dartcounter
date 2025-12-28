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
  size = 256,
  className,
  label,
}: QRDisplayProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {label && (
        <p className="text-sm text-zinc-400 text-center">{label}</p>
      )}
      <div className="rounded-xl bg-white p-4">
        <QRCodeSVG
          value={data}
          size={size}
          level="L" // Low error correction for smaller QR
          includeMargin={false}
        />
      </div>
      <p className="text-xs text-zinc-500 text-center max-w-xs">
        Data size: {data.length} characters
      </p>
    </div>
  );
}

