import pako from 'pako';

// Public STUN servers (free)
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface WebRTCConnection {
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
}

/**
 * Create a new RTCPeerConnection
 */
export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

/**
 * Create offer (Master side)
 */
export async function createOffer(pc: RTCPeerConnection): Promise<string> {
  // Create data channel before offer
  const dataChannel = pc.createDataChannel('darts-sync', {
    ordered: true,
  });
  
  // Create offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  // Wait for ICE gathering to complete
  await waitForIceGathering(pc);
  
  // Get the complete offer with ICE candidates
  const completeOffer = pc.localDescription;
  if (!completeOffer) throw new Error('No local description');
  
  // Compress and encode
  return compressSDP(JSON.stringify(completeOffer));
}

/**
 * Handle offer and create answer (Slave side)
 */
export async function handleOfferAndCreateAnswer(
  pc: RTCPeerConnection,
  compressedOffer: string
): Promise<string> {
  // Decompress offer
  const offerString = decompressSDP(compressedOffer);
  const offer = JSON.parse(offerString) as RTCSessionDescriptionInit;
  
  // Set remote description
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  
  // Create answer
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  
  // Wait for ICE gathering
  await waitForIceGathering(pc);
  
  // Get complete answer
  const completeAnswer = pc.localDescription;
  if (!completeAnswer) throw new Error('No local description');
  
  // Compress and encode
  return compressSDP(JSON.stringify(completeAnswer));
}

/**
 * Handle answer (Master side)
 */
export async function handleAnswer(
  pc: RTCPeerConnection,
  compressedAnswer: string
): Promise<void> {
  // Decompress answer
  const answerString = decompressSDP(compressedAnswer);
  const answer = JSON.parse(answerString) as RTCSessionDescriptionInit;
  
  // Set remote description
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

/**
 * Wait for ICE gathering to complete
 */
function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    
    const checkState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }
    };
    
    pc.addEventListener('icegatheringstatechange', checkState);
    
    // Timeout fallback (5 seconds)
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', checkState);
      resolve();
    }, 5000);
  });
}

/**
 * Minify SDP by removing unnecessary lines
 */
function minifySDP(sdpString: string): string {
  const sdp = JSON.parse(sdpString);
  const lines = (sdp.sdp as string).split('\r\n');
  
  // Keep only essential lines
  const essential = lines.filter((line: string) => {
    // Always keep these
    if (line.startsWith('v=')) return true;
    if (line.startsWith('o=')) return true;
    if (line.startsWith('s=')) return true;
    if (line.startsWith('t=')) return true;
    if (line.startsWith('m=')) return true;
    if (line.startsWith('c=')) return true;
    if (line.startsWith('a=ice-ufrag')) return true;
    if (line.startsWith('a=ice-pwd')) return true;
    if (line.startsWith('a=fingerprint')) return true;
    if (line.startsWith('a=setup')) return true;
    if (line.startsWith('a=mid')) return true;
    if (line.startsWith('a=sctp-port')) return true;
    if (line.startsWith('a=max-message-size')) return true;
    
    // Keep only host candidates (most reliable, smallest)
    if (line.startsWith('a=candidate')) {
      return line.includes('typ host');
    }
    
    return false;
  });
  
  return JSON.stringify({
    type: sdp.type,
    sdp: essential.join('\r\n') + '\r\n'
  });
}

/**
 * Compress SDP for QR code
 */
export function compressSDP(sdp: string): string {
  // First minify the SDP
  const minified = minifySDP(sdp);
  
  // Compress with pako (max compression)
  const compressed = pako.deflate(minified, { level: 9 });
  
  // Convert to base64
  const base64 = btoa(String.fromCharCode(...compressed));
  
  return base64;
}

/**
 * Decompress SDP from QR code
 */
export function decompressSDP(compressed: string): string {
  // Decode base64
  const binary = atob(compressed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  // Decompress
  const decompressed = pako.inflate(bytes, { to: 'string' });
  
  return decompressed;
}

