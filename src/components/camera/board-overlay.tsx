'use client';

import { SEGMENT_ORDER, RING_BOUNDARIES } from '@/lib/vision/types';
import type { CalibrationData, Point } from '@/lib/vision/types';

interface BoardOverlayProps {
  calibration: CalibrationData;
  videoWidth: number;
  videoHeight: number;
  detectedPoint?: Point | null;
  highlightedSegment?: { segment: number; multiplier: number } | null;
}

// Helper to find segment index safely
function findSegmentIndex(segment: number): number {
  const idx = (SEGMENT_ORDER as readonly number[]).indexOf(segment);
  return idx >= 0 ? idx : 0;
}

export function BoardOverlay({
  calibration,
  videoWidth,
  videoHeight,
  detectedPoint,
  highlightedSegment,
}: BoardOverlayProps) {
  const { center, radius } = calibration;
  
  // Generate segment paths
  const generateSegmentPath = (
    segmentIndex: number,
    innerRadius: number,
    outerRadius: number
  ): string => {
    const startAngle = (segmentIndex * 18 - 9 - 90) * (Math.PI / 180);
    const endAngle = ((segmentIndex + 1) * 18 - 9 - 90) * (Math.PI / 180);
    
    const inner1X = center.x + Math.cos(startAngle) * innerRadius * radius;
    const inner1Y = center.y + Math.sin(startAngle) * innerRadius * radius;
    const inner2X = center.x + Math.cos(endAngle) * innerRadius * radius;
    const inner2Y = center.y + Math.sin(endAngle) * innerRadius * radius;
    const outer1X = center.x + Math.cos(startAngle) * outerRadius * radius;
    const outer1Y = center.y + Math.sin(startAngle) * outerRadius * radius;
    const outer2X = center.x + Math.cos(endAngle) * outerRadius * radius;
    const outer2Y = center.y + Math.sin(endAngle) * outerRadius * radius;
    
    return `M ${inner1X} ${inner1Y} 
            A ${innerRadius * radius} ${innerRadius * radius} 0 0 1 ${inner2X} ${inner2Y}
            L ${outer2X} ${outer2Y}
            A ${outerRadius * radius} ${outerRadius * radius} 0 0 0 ${outer1X} ${outer1Y}
            Z`;
  };
  
  // Check if segment is highlighted
  const isHighlighted = (segment: number, multiplier: number) => {
    if (!highlightedSegment) return false;
    return highlightedSegment.segment === segment && highlightedSegment.multiplier === multiplier;
  };
  
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${videoWidth} ${videoHeight}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Board outline */}
      <circle
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="none"
        stroke="#00ff88"
        strokeWidth="2"
        opacity="0.5"
      />
      
      {/* Double ring */}
      <circle
        cx={center.x}
        cy={center.y}
        r={radius * RING_BOUNDARIES.double.inner}
        fill="none"
        stroke="#a855f7"
        strokeWidth="1"
        opacity="0.3"
      />
      
      {/* Triple ring */}
      <circle
        cx={center.x}
        cy={center.y}
        r={radius * RING_BOUNDARIES.triple.outer}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1"
        opacity="0.3"
      />
      <circle
        cx={center.x}
        cy={center.y}
        r={radius * RING_BOUNDARIES.triple.inner}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1"
        opacity="0.3"
      />
      
      {/* Bull */}
      <circle
        cx={center.x}
        cy={center.y}
        r={radius * RING_BOUNDARIES.bull.outer}
        fill="none"
        stroke="#22c55e"
        strokeWidth="1"
        opacity="0.3"
      />
      
      {/* Bullseye */}
      <circle
        cx={center.x}
        cy={center.y}
        r={radius * RING_BOUNDARIES.bullseye.outer}
        fill="none"
        stroke="#fbbf24"
        strokeWidth="1"
        opacity="0.3"
      />
      
      {/* Segment lines */}
      {Array.from({ length: 20 }).map((_, i) => {
        const angle = (i * 18 - 9 - 90) * (Math.PI / 180);
        const x1 = center.x + Math.cos(angle) * radius * RING_BOUNDARIES.bull.outer;
        const y1 = center.y + Math.sin(angle) * radius * RING_BOUNDARIES.bull.outer;
        const x2 = center.x + Math.cos(angle) * radius;
        const y2 = center.y + Math.sin(angle) * radius;
        
        return (
          <line
            key={`line-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#666"
            strokeWidth="1"
            opacity="0.3"
          />
        );
      })}
      
      {/* Segment numbers */}
      {SEGMENT_ORDER.map((segment, i) => {
        const angle = (i * 18 - 90) * (Math.PI / 180);
        const x = center.x + Math.cos(angle) * radius * 0.85;
        const y = center.y + Math.sin(angle) * radius * 0.85;
        
        return (
          <text
            key={`num-${segment}`}
            x={x}
            y={y}
            fill="#fff"
            fontSize={radius * 0.06}
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
            opacity="0.6"
          >
            {segment}
          </text>
        );
      })}
      
      {/* Highlighted segment */}
      {highlightedSegment && highlightedSegment.segment <= 20 && (
        <>
          {/* Highlight triple */}
          {highlightedSegment.multiplier === 3 && (
            <path
              d={generateSegmentPath(
                findSegmentIndex(highlightedSegment.segment),
                RING_BOUNDARIES.triple.inner,
                RING_BOUNDARIES.triple.outer
              )}
              fill="#3b82f6"
              opacity="0.5"
            />
          )}
          {/* Highlight double */}
          {highlightedSegment.multiplier === 2 && (
            <path
              d={generateSegmentPath(
                findSegmentIndex(highlightedSegment.segment),
                RING_BOUNDARIES.double.inner,
                RING_BOUNDARIES.double.outer
              )}
              fill="#a855f7"
              opacity="0.5"
            />
          )}
          {/* Highlight single */}
          {highlightedSegment.multiplier === 1 && (
            <path
              d={generateSegmentPath(
                findSegmentIndex(highlightedSegment.segment),
                RING_BOUNDARIES.bull.outer,
                RING_BOUNDARIES.triple.inner
              )}
              fill="#00ff88"
              opacity="0.3"
            />
          )}
        </>
      )}
      
      {/* Highlighted bull/bullseye */}
      {highlightedSegment && highlightedSegment.segment === 25 && (
        <circle
          cx={center.x}
          cy={center.y}
          r={radius * RING_BOUNDARIES.bull.outer}
          fill="#22c55e"
          opacity="0.5"
        />
      )}
      {highlightedSegment && highlightedSegment.segment === 50 && (
        <circle
          cx={center.x}
          cy={center.y}
          r={radius * RING_BOUNDARIES.bullseye.outer}
          fill="#fbbf24"
          opacity="0.5"
        />
      )}
      
      {/* Detected dart position */}
      {detectedPoint && (
        <>
          <circle
            cx={detectedPoint.x}
            cy={detectedPoint.y}
            r="8"
            fill="#ef4444"
          />
          <circle
            cx={detectedPoint.x}
            cy={detectedPoint.y}
            r="20"
            fill="none"
            stroke="#ef4444"
            strokeWidth="3"
            opacity="0.8"
          >
            <animate
              attributeName="r"
              values="15;25;15"
              dur="1s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.8;0.4;0.8"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}
      
      {/* Center crosshair */}
      <line
        x1={center.x - 15}
        y1={center.y}
        x2={center.x + 15}
        y2={center.y}
        stroke="#00ff88"
        strokeWidth="2"
        opacity="0.7"
      />
      <line
        x1={center.x}
        y1={center.y - 15}
        x2={center.x}
        y2={center.y + 15}
        stroke="#00ff88"
        strokeWidth="2"
        opacity="0.7"
      />
    </svg>
  );
}

