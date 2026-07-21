import { RoomServiceClient, SipClient, AgentDispatchClient } from 'livekit-server-sdk';
import path from 'path';
import dotenv from 'dotenv';

// Load .env from root directory
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

function getLiveKitCredentials() {
  const LIVEKIT_URL = process.env.LIVEKIT_URL;
  const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
  const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error("Missing LiveKit Credentials");
  }

  return { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET };
}

// Lazy-initialized singletons
let _roomService: RoomServiceClient | null = null;
let _sipClient: SipClient | null = null;
let _agentDispatchClient: AgentDispatchClient | null = null;

export function getRoomService(): RoomServiceClient {
  if (!_roomService) {
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = getLiveKitCredentials();
    _roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return _roomService;
}

export function getSipClient(): SipClient {
  if (!_sipClient) {
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = getLiveKitCredentials();
    _sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return _sipClient;
}

export function getAgentDispatchClient(): AgentDispatchClient {
  if (!_agentDispatchClient) {
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = getLiveKitCredentials();
    _agentDispatchClient = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return _agentDispatchClient;
}

// Keep backward-compatible exports (lazy getters)
export const roomService = new Proxy({} as RoomServiceClient, {
  get(_, prop) {
    return (getRoomService() as any)[prop];
  },
});

export const sipClient = new Proxy({} as SipClient, {
  get(_, prop) {
    return (getSipClient() as any)[prop];
  },
});

export const agentDispatchClient = new Proxy({} as AgentDispatchClient, {
  get(_, prop) {
    return (getAgentDispatchClient() as any)[prop];
  },
});
