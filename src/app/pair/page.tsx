'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Smartphone, Monitor, Loader2, Check, X, Copy, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { generatePIN, createMasterPeer, connectToMaster, sendData } from '@/lib/peer/connection';
import { useGameStore } from '@/lib/stores/game-store';
import type { DataConnection } from 'peerjs';
import type Peer from 'peerjs';

const VERSION = 'v1.0.2';

type Step = 'select-role' | 'master-waiting' | 'slave-enter-pin' | 'connecting' | 'connected' | 'error';

export default function PairPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('select-role');
  const [pin, setPin] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  
  const gameState = useGameStore();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connRef.current) {
        connRef.current.close();
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  // Start as Master
  const startAsMaster = useCallback(() => {
    const newPin = generatePIN();
    setPin(newPin);
    setIsMaster(true);
    setStep('master-waiting');
    
    const peer = createMasterPeer(
      newPin,
      (conn) => {
        connRef.current = conn;
        setStep('connected');
        
        // Setup data listener for Master
        conn.on('data', (data) => {
          console.log('[Master] Received:', data);
        });
        
        console.log('[Pair] Master connection opened, storing in window');
        // Store connection in window for later use
        (window as any).__dartConnection = conn;
        (window as any).__dartIsMaster = true;
        
        // Ensure connection is ready
        conn.on('open', () => {
          console.log('[Pair] Master connection confirmed open');
        });
      },
      (err) => {
        if (err.message.includes('unavailable')) {
          setError('PIN already in use. Try again.');
        } else {
          setError('Connection failed. Check your internet.');
        }
        setStep('error');
      }
    );
    
    peerRef.current = peer;
  }, []);

  // Start as Slave
  const startAsSlave = useCallback(() => {
    setIsMaster(false);
    setStep('slave-enter-pin');
  }, []);

  // Connect as Slave
  const connectAsSlave = useCallback(() => {
    if (inputPin.length !== 4) {
      setError('PIN must be 4 digits');
      return;
    }
    
    setStep('connecting');
    
    const peer = connectToMaster(
      inputPin,
      (conn) => {
        connRef.current = conn;
        setStep('connected');
        
        console.log('[Pair] Slave connection opened, storing in window');
        // Store connection in window for later use
        (window as any).__dartConnection = conn;
        (window as any).__dartIsMaster = false;
        
        // Ensure connection is ready
        conn.on('open', () => {
          console.log('[Pair] Slave connection confirmed open');
        });
      },
      (data: unknown) => {
        console.log('[Slave] Received:', data);
        // Handle game state updates
        if (data && typeof data === 'object' && 'type' in data) {
          const payload = data as { type: string; data: unknown };
          if (payload.type === 'game-sync') {
            // Update local state
            const gameData = payload.data as {
              players: Array<{ currentScore: number; legsWon: number }>;
              currentPlayerIndex: number;
              currentTurn: Array<{ segment: number; multiplier: number; points: number }>;
              currentLeg: number;
            };
            
            useGameStore.setState({
              players: gameState.players.map((p, idx) => ({
                ...p,
                currentScore: gameData.players[idx]?.currentScore ?? p.currentScore,
                legsWon: gameData.players[idx]?.legsWon ?? p.legsWon,
              })) as [typeof gameState.players[0], typeof gameState.players[1]],
              currentPlayerIndex: gameData.currentPlayerIndex as 0 | 1,
              currentTurn: gameData.currentTurn.map((t) => ({
                ...t,
                multiplier: t.multiplier as 1 | 2 | 3,
                timestamp: Date.now(),
              })),
              currentLeg: gameData.currentLeg,
              isGameActive: true,
            });
          }
        }
      },
      (err) => {
        if (err.message.includes('not found') || err.message.includes('Could not connect')) {
          setError('Master not found. Check the PIN.');
        } else {
          setError('Connection failed. Try again.');
        }
        setStep('error');
      }
    );
    
    peerRef.current = peer;
    
    // Timeout
    setTimeout(() => {
      if (step === 'connecting') {
        setError('Connection timeout. Check the PIN and try again.');
        setStep('error');
      }
    }, 15000);
  }, [inputPin, gameState.players, step]);

  // Copy PIN
  const copyPin = useCallback(() => {
    navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [pin]);

  // Go to game
  const goToGame = useCallback(() => {
    router.replace(isMaster ? '/master' : '/slave');
  }, [router, isMaster]);

  // Reset
  const reset = useCallback(() => {
    if (connRef.current) {
      connRef.current.close();
    }
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    setStep('select-role');
    setPin('');
    setInputPin('');
    setError(null);
  }, []);

  return (
    <div className="container mx-auto max-w-lg p-4 py-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            router.push('/');
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-center">
        Pair Devices
      </h1>

      {/* Step: Select Role */}
      {step === 'select-role' && (
        <div className="space-y-4">
          <p className="text-center text-zinc-400 mb-6">
            Choose this device&apos;s role
          </p>
          
          <Card
            className="cursor-pointer transition-all hover:border-primary"
            onClick={startAsMaster}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Smartphone className="h-6 w-6 text-primary" />
                Master (Input)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400">
                This phone will input scores and broadcast to Slave
              </p>
            </CardContent>
          </Card>
          
          <Card
            className="cursor-pointer transition-all hover:border-primary"
            onClick={startAsSlave}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Monitor className="h-6 w-6 text-primary" />
                Slave (Display)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400">
                This phone will display the live scoreboard
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Master waiting */}
      {step === 'master-waiting' && (
        <div className="space-y-8 text-center">
          <div>
            <p className="text-zinc-400 mb-4">Your PIN code:</p>
            <div className="flex items-center justify-center gap-4">
              <div className="text-6xl font-mono font-bold tracking-[0.3em] text-primary">
                {pin}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={copyPin}
                className="h-12 w-12"
              >
                {copied ? (
                  <CheckCheck className="h-5 w-5 text-green-400" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Waiting for Slave to connect...</span>
          </div>
          
          <p className="text-sm text-zinc-500">
            Enter this PIN on the other device
          </p>
          
          <Button variant="outline" onClick={reset}>
            Cancel
          </Button>
        </div>
      )}

      {/* Step: Slave enter PIN */}
      {step === 'slave-enter-pin' && (
        <div className="space-y-6 text-center">
          <p className="text-zinc-400">Enter the PIN from Master:</p>
          
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={inputPin}
            onChange={(e) => setInputPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            className="w-full max-w-xs mx-auto text-center text-5xl font-mono font-bold tracking-[0.5em] bg-zinc-900 border border-zinc-700 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>
            <Button 
              onClick={connectAsSlave}
              disabled={inputPin.length !== 4}
            >
              Connect
            </Button>
          </div>
        </div>
      )}

      {/* Step: Connecting */}
      {step === 'connecting' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-zinc-400">Connecting...</p>
        </div>
      )}

      {/* Step: Connected */}
      {step === 'connected' && (
        <div className="flex flex-col items-center gap-6 py-12">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20">
            <Check className="h-8 w-8 text-green-400" />
          </div>
          <p className="text-xl font-semibold text-green-400">Connected!</p>
          <p className="text-zinc-400 text-center">
            Devices are now paired
          </p>
          <Button onClick={goToGame} size="lg">
            Start Game
          </Button>
        </div>
      )}

      {/* Step: Error */}
      {step === 'error' && (
        <div className="flex flex-col items-center gap-6 py-12">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20">
            <X className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-xl font-semibold text-red-400">Error</p>
          <p className="text-zinc-400 text-center">{error}</p>
          <Button onClick={reset} variant="outline">
            Try Again
          </Button>
        </div>
      )}

      {/* Version */}
      <p className="text-center text-xs text-zinc-600 mt-12">
        {VERSION}
      </p>
    </div>
  );
}
