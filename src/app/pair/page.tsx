'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Smartphone, Monitor, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Lazy load QR components
const QRDisplay = dynamic(() => import('@/components/pairing/qr-display').then((mod) => ({ default: mod.QRDisplay })), {
  loading: () => (
    <div className="flex items-center justify-center w-64 h-64 rounded-xl bg-zinc-900">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
  ssr: false,
});

const QRScanner = dynamic(() => import('@/components/pairing/qr-scanner').then((mod) => ({ default: mod.QRScanner })), {
  loading: () => (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-sm aspect-square rounded-xl bg-zinc-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  ),
  ssr: false,
});
import {
  createPeerConnection,
  createOffer,
  handleOfferAndCreateAnswer,
  handleAnswer,
} from '@/lib/webrtc/connection';
import { setupDataChannel } from '@/lib/webrtc/data-channel';
import { useWebRTCStore, type PairingStep } from '@/lib/stores/webrtc-store';
import { useGameStore } from '@/lib/stores/game-store';
import { createSyncPayload } from '@/lib/bluetooth/utils';
import type { GameSyncPayload } from '@/types/bluetooth.types';

export default function PairPage() {
  const router = useRouter();
  const {
    pairingStep,
    offerData,
    answerData,
    error,
    isConnected,
    setPc,
    setDataChannel,
    setConnected,
    setMaster,
    setPairingStep,
    setOfferData,
    setAnswerData,
    setError,
    reset,
  } = useWebRTCStore();

  const gameState = useGameStore();
  const [pc, setLocalPc] = useState<RTCPeerConnection | null>(null);

  // Handle incoming messages (Slave)
  const handleMessage = useCallback((payload: GameSyncPayload) => {
    console.log('[Pair] Received:', payload.type);
    
    const { data } = payload;
    useGameStore.setState({
      players: data.players.map((p, idx) => ({
        ...gameState.players[idx],
        ...p,
        throws: gameState.players[idx]?.throws || [],
      })) as [typeof gameState.players[0], typeof gameState.players[1]],
      currentPlayerIndex: data.currentPlayerIndex as 0 | 1,
      currentTurn: data.currentTurn.map((t) => ({
        ...t,
        multiplier: t.multiplier as 1 | 2 | 3,
        timestamp: Date.now(),
      })),
      currentLeg: data.currentLeg,
      isGameActive: true,
    });
  }, [gameState.players]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pc) {
        pc.close();
      }
    };
  }, [pc]);

  // Start as Master
  const startAsMaster = async () => {
    try {
      setMaster(true);
      setPairingStep('master-show-offer');
      
      const peerConnection = createPeerConnection();
      setLocalPc(peerConnection);
      setPc(peerConnection);
      
      // Setup data channel event for Master
      // Master creates channel, so we don't need to listen for incoming channels
      
      // Create offer
      const offer = await createOffer(peerConnection);
      setOfferData(offer);
      
      // Get data channel (created in createOffer)
      const dc = (peerConnection as any)._dataChannel;
      
      // Setup connection state monitoring with timeout
      const timeout = setTimeout(() => {
        if (peerConnection.connectionState !== 'connected') {
          setError('Connection timeout. Please try again.');
          setPairingStep('error');
        }
      }, 30000); // 30 second timeout
      
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
          clearTimeout(timeout);
          setConnected(true);
          setPairingStep('connected');
        } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          clearTimeout(timeout);
          setError('Connection failed. Please try again.');
          setPairingStep('error');
        }
      };
      
    } catch (err) {
      console.error('Master setup error:', err);
      setError('Failed to create offer. Please try again.');
    }
  };

  // Start as Slave
  const startAsSlave = () => {
    setMaster(false);
    setPairingStep('slave-scan-offer');
  };

  // Handle scanned offer (Slave)
  const handleOfferScanned = async (scannedOffer: string) => {
    try {
      setPairingStep('connecting');
      
      const peerConnection = createPeerConnection();
      setLocalPc(peerConnection);
      setPc(peerConnection);
      
      // Setup data channel handler for Slave
      peerConnection.ondatachannel = (event) => {
        const dc = event.channel;
        setDataChannel(dc);
        setupDataChannel(
          dc,
          handleMessage,
          () => {
            setConnected(true);
            setPairingStep('connected');
          }
        );
      };
      
      // Create answer
      const answer = await handleOfferAndCreateAnswer(peerConnection, scannedOffer);
      setAnswerData(answer);
      setPairingStep('slave-show-answer');
      
    } catch (err) {
      console.error('Slave setup error:', err);
      setError('Failed to process offer. Please try again.');
    }
  };

  // Handle scanned answer (Master)
  const handleAnswerScanned = async (scannedAnswer: string) => {
    try {
      setPairingStep('connecting');
      
      if (!pc) {
        throw new Error('No peer connection');
      }
      
      await handleAnswer(pc, scannedAnswer);
      
      // Setup connection state monitoring with timeout
      const timeout = setTimeout(() => {
        if (pc.connectionState !== 'connected') {
          setError('Connection timeout. Please try again.');
          setPairingStep('error');
        }
      }, 30000); // 30 second timeout
      
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          clearTimeout(timeout);
          setConnected(true);
          setPairingStep('connected');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          clearTimeout(timeout);
          setError('Connection failed. Please try again.');
          setPairingStep('error');
        }
      };
      
    } catch (err) {
      console.error('Answer handling error:', err);
      setError('Failed to process answer. Please try again.');
      setPairingStep('error');
    }
  };

  // Navigate after connection
  const goToGame = useCallback(() => {
    const isMaster = useWebRTCStore.getState().isMaster;
    // Use replace to avoid back button issues
    router.replace(isMaster ? '/master' : '/slave');
  }, [router]);

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
      {pairingStep === 'select-role' && (
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

      {/* Step: Master shows offer QR */}
      {pairingStep === 'master-show-offer' && offerData && (
        <div className="space-y-6">
          <QRDisplay
            data={offerData}
            size={320}
            label="Step 1: Slave scans this QR code"
          />
          
          <div className="text-center">
            <p className="text-sm text-zinc-400 mb-4">
              After Slave scans, they will show a QR code for you to scan
            </p>
            <Button onClick={() => setPairingStep('master-scan-answer')}>
              Continue to scan answer
            </Button>
          </div>
        </div>
      )}

      {/* Step: Master scans answer QR */}
      {pairingStep === 'master-scan-answer' && (
        <div className="space-y-6">
          <QRScanner
            onScan={handleAnswerScanned}
            label="Step 2: Scan the QR code from Slave"
          />
        </div>
      )}

      {/* Step: Slave scans offer QR */}
      {pairingStep === 'slave-scan-offer' && (
        <div className="space-y-6">
          <QRScanner
            onScan={handleOfferScanned}
            label="Step 1: Scan the QR code from Master"
          />
        </div>
      )}

      {/* Step: Slave shows answer QR */}
      {pairingStep === 'slave-show-answer' && answerData && (
        <div className="space-y-6">
          <QRDisplay
            data={answerData}
            size={320}
            label="Step 2: Master scans this QR code"
          />
          
          <p className="text-center text-sm text-zinc-400">
            Waiting for Master to scan...
          </p>
        </div>
      )}

      {/* Step: Connecting */}
      {pairingStep === 'connecting' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-zinc-400">Establishing connection...</p>
        </div>
      )}

      {/* Step: Connected */}
      {pairingStep === 'connected' && (
        <div className="flex flex-col items-center gap-6 py-12">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20">
            <Check className="h-8 w-8 text-green-400" />
          </div>
          <p className="text-xl font-semibold text-green-400">Connected!</p>
          <p className="text-zinc-400 text-center">
            Devices are now paired via WebRTC
          </p>
          <Button onClick={goToGame} size="lg">
            Start Game
          </Button>
        </div>
      )}

      {/* Step: Error */}
      {pairingStep === 'error' && (
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
    </div>
  );
}

