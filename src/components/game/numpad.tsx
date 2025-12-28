'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Multiplier = 1 | 2 | 3;
type Segment = number | 'bull' | 'miss';

interface NumpadProps {
  onThrow: (segment: number, multiplier: Multiplier) => void;
  onMiss: () => void;
  onClear: () => void;
  onNext: () => void;
  canConfirm: boolean;
  className?: string;
}

export function Numpad({
  onThrow,
  onMiss,
  onClear,
  onNext,
  canConfirm,
  className,
}: NumpadProps) {
  const [multiplier, setMultiplier] = useState<Multiplier>(1);

  const handleSegmentClick = (segment: Segment): void => {
    if (segment === 'miss') {
      onMiss();
      return;
    }
    if (segment === 'bull') {
      // Bullseye (50) - always 50 points, no multiplier
      onThrow(50, 1);
      return;
    }
    onThrow(segment, multiplier);
  };

  const segments = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  ];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Multiplier selector */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant={multiplier === 1 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMultiplier(1)}
        >
          Single
        </Button>
        <Button
          variant={multiplier === 2 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMultiplier(2)}
        >
          Double
        </Button>
        <Button
          variant={multiplier === 3 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMultiplier(3)}
        >
          Triple
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleSegmentClick('bull')}
        >
          Bull
        </Button>
      </div>

      {/* Number grid */}
      <div className="grid grid-cols-5 gap-2">
        {segments.map((num) => (
          <Button
            key={num}
            variant="outline"
            onClick={() => handleSegmentClick(num)}
            className="aspect-square text-lg font-semibold"
          >
            {num}
          </Button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onMiss} className="flex-1">
          Miss
        </Button>
        <Button variant="outline" onClick={onClear} className="flex-1">
          Clear
        </Button>
        <Button
          variant="default"
          onClick={onNext}
          disabled={!canConfirm}
          className="flex-1"
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

