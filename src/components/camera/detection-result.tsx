'use client';

import { Check, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDetectionResult } from '@/lib/vision/board-mapper';
import type { DetectionResult } from '@/lib/vision/types';

interface DetectionResultProps {
  result: DetectionResult;
  onConfirm: () => void;
  onRetry: () => void;
}

export function DetectionResultDisplay({ result, onConfirm, onRetry }: DetectionResultProps) {
  const formatted = formatDetectionResult(result);
  const isValidThrow = result.points > 0;
  
  // Determine color based on multiplier
  const getColor = () => {
    if (result.points === 0) return '#ef4444'; // Red for miss
    if (result.segment === 50) return '#fbbf24'; // Yellow for bullseye
    if (result.segment === 25) return '#22c55e'; // Green for bull
    if (result.multiplier === 3) return '#3b82f6'; // Blue for triple
    if (result.multiplier === 2) return '#a855f7'; // Purple for double
    return '#00ff88'; // Green for single
  };
  
  const color = getColor();
  
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300">
      {/* Detection result */}
      <div className="text-center mb-8">
        <div className="text-zinc-400 text-xl mb-2 font-semibold">
          Detected:
        </div>
        <div 
          className="text-[clamp(6rem,30vw,15rem)] font-black leading-none"
          style={{ 
            color,
            textShadow: `0 0 40px ${color}80, 0 0 80px ${color}40`,
          }}
        >
          {formatted}
        </div>
        <div 
          className="text-[clamp(2rem,10vw,5rem)] font-bold mt-4"
          style={{ color }}
        >
          {result.points} pts
        </div>
        
        {/* Confidence indicator */}
        <div className="mt-4 flex items-center justify-center gap-2 text-zinc-500">
          {result.confidence >= 0.7 ? (
            <Check className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-400" />
          )}
          <span className="text-sm">
            Confidence: {Math.round(result.confidence * 100)}%
          </span>
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="flex gap-6">
        <Button
          variant="outline"
          size="lg"
          onClick={onRetry}
          className="text-xl px-8 py-6"
        >
          <RotateCcw className="w-6 h-6 mr-2" />
          Retry
        </Button>
        <Button
          size="lg"
          onClick={onConfirm}
          className="text-xl px-8 py-6 bg-green-600 hover:bg-green-700"
          style={{ 
            boxShadow: `0 0 20px ${color}40`,
          }}
        >
          <Check className="w-6 h-6 mr-2" />
          Confirm
        </Button>
      </div>
    </div>
  );
}

