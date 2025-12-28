import { create } from 'zustand';

export type PairingStep = 
  | 'select-role'
  | 'master-show-offer'
  | 'master-scan-answer'
  | 'slave-scan-offer'
  | 'slave-show-answer'
  | 'connecting'
  | 'connected'
  | 'error';

interface WebRTCStore {
  // Connection state
  pc: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  isConnected: boolean;
  isMaster: boolean;
  
  // Pairing flow
  pairingStep: PairingStep;
  offerData: string | null;
  answerData: string | null;
  error: string | null;
  
  // Actions
  setPc: (pc: RTCPeerConnection | null) => void;
  setDataChannel: (dc: RTCDataChannel | null) => void;
  setConnected: (connected: boolean) => void;
  setMaster: (isMaster: boolean) => void;
  setPairingStep: (step: PairingStep) => void;
  setOfferData: (data: string | null) => void;
  setAnswerData: (data: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useWebRTCStore = create<WebRTCStore>((set) => ({
  pc: null,
  dataChannel: null,
  isConnected: false,
  isMaster: false,
  pairingStep: 'select-role',
  offerData: null,
  answerData: null,
  error: null,
  
  setPc: (pc) => set({ pc }),
  setDataChannel: (dataChannel) => set({ dataChannel }),
  setConnected: (isConnected) => set({ isConnected }),
  setMaster: (isMaster) => set({ isMaster }),
  setPairingStep: (pairingStep) => set({ pairingStep }),
  setOfferData: (offerData) => set({ offerData }),
  setAnswerData: (answerData) => set({ answerData }),
  setError: (error) => set({ error, pairingStep: error ? 'error' : 'select-role' }),
  reset: () => set({
    pc: null,
    dataChannel: null,
    isConnected: false,
    isMaster: false,
    pairingStep: 'select-role',
    offerData: null,
    answerData: null,
    error: null,
  }),
}));

