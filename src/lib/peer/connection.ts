'use client';

import Peer, { DataConnection } from 'peerjs';

// Generate a random 4-digit PIN
export function generatePIN(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Create peer ID from PIN
function getPeerId(pin: string): string {
  return `dartcounter-${pin}`;
}

export interface PeerConnection {
  peer: Peer;
  connection: DataConnection | null;
}

/**
 * Create a peer as Master (host)
 * Returns the PIN that Slave needs to enter
 */
export function createMasterPeer(
  pin: string,
  onConnect: (conn: DataConnection) => void,
  onError: (error: Error) => void
): Peer {
  const peerId = getPeerId(pin);
  
  const peer = new Peer(peerId, {
    debug: 0, // No debug logs
  });
  
  peer.on('open', (id) => {
    console.log('[PeerJS] Master ready with ID:', id);
  });
  
  peer.on('connection', (conn) => {
    console.log('[PeerJS] Slave connected');
    conn.on('open', () => {
      onConnect(conn);
    });
  });
  
  peer.on('error', (err) => {
    console.error('[PeerJS] Error:', err);
    onError(err);
  });
  
  return peer;
}

/**
 * Connect to Master as Slave
 */
export function connectToMaster(
  pin: string,
  onConnect: (conn: DataConnection) => void,
  onData: (data: unknown) => void,
  onError: (error: Error) => void
): Peer {
  const masterPeerId = getPeerId(pin);
  
  const peer = new Peer({
    debug: 0,
  });
  
  peer.on('open', () => {
    console.log('[PeerJS] Slave connecting to:', masterPeerId);
    
    const conn = peer.connect(masterPeerId, {
      reliable: true,
    });
    
    conn.on('open', () => {
      console.log('[PeerJS] Connected to Master');
      onConnect(conn);
    });
    
    conn.on('data', (data) => {
      onData(data);
    });
    
    conn.on('error', (err) => {
      onError(err as Error);
    });
  });
  
  peer.on('error', (err) => {
    console.error('[PeerJS] Error:', err);
    onError(err);
  });
  
  return peer;
}

/**
 * Send data through connection
 */
export function sendData(conn: DataConnection, data: unknown): void {
  if (conn.open) {
    conn.send(data);
  }
}

