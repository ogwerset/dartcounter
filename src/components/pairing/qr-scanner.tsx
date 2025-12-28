'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QRScannerProps {
  onScan: (data: string) => void;
  className?: string;
  label?: string;
}

export function QRScanner({
  onScan,
  className,
  label,
}: QRScannerProps): JSX.Element {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const startScanning = async () => {
    if (!containerRef.current) return;
    
    try {
      setError(null);
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // Success - stop scanning and return data
          stopScanning();
          onScan(decodedText);
        },
        () => {
          // Ignore scan errors (no QR found yet)
        }
      );
      
      setIsScanning(true);
    } catch (err) {
      console.error('Scanner error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowedError')) {
        setError('Camera permission denied. Use manual input instead.');
      } else if (errorMessage.includes('NotFoundError') || errorMessage.includes('DevicesNotFoundError')) {
        setError('No camera found. Use manual input instead.');
      } else {
        setError('Camera not available. Use manual input instead.');
      }
      setIsScanning(false);
    }
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
      setShowManualInput(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Ignore stop errors
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {label && (
        <p className="text-sm text-zinc-400 text-center">{label}</p>
      )}
      
      <div
        ref={containerRef}
        className="relative w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-zinc-900"
      >
        <div id="qr-reader" className="w-full h-full" />
        
        {!isScanning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button onClick={startScanning} size="lg">
              <Camera className="mr-2 h-5 w-5" />
              Start Camera
            </Button>
          </div>
        )}
      </div>
      
      {isScanning && (
        <Button variant="outline" onClick={stopScanning} size="sm">
          <CameraOff className="mr-2 h-4 w-4" />
          Stop Camera
        </Button>
      )}
      
      {error && (
        <div className="space-y-2">
          <p className="text-sm text-red-400 text-center">{error}</p>
          {!showManualInput && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowManualInput(true)}
              className="w-full"
            >
              <Keyboard className="mr-2 h-4 w-4" />
              Enter QR Code Manually
            </Button>
          )}
        </div>
      )}

      {showManualInput && (
        <div className="w-full max-w-sm space-y-2">
          <p className="text-sm text-zinc-400 text-center">
            Paste or type the QR code data:
          </p>
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Paste QR code data here..."
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary"
            rows={4}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowManualInput(false);
                setManualInput('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="flex-1"
            >
              Submit
            </Button>
          </div>
        </div>
      )}

      {!error && !isScanning && !showManualInput && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowManualInput(true)}
          className="text-zinc-500"
        >
          <Keyboard className="mr-2 h-4 w-4" />
          Or enter manually
        </Button>
      )}
    </div>
  );
}

