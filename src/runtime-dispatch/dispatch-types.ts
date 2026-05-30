export interface DispatchJob {
  id: string;
  tenantId: string;
  customerId: string;
  category: string;
  status: string;
  latitude: number;
  longitude: number;
  urgency: "scheduled" | "same_day" | "emergency";
  scheduledAt?: string;
  createdAt: string;
}

export interface ProviderCandidate {
  providerId: string;
  userId: string;
  score: number;
  distanceMiles: number;
  etaMinutes: number;
  trustScore: number;
  acceptRate: number;
  isOnline: boolean;
}

export interface DispatchDecision {
  jobId: string;
  selectedProviderId: string | null;
  candidates: ProviderCandidate[];
  confidence: number;
  reason: string;
  dispatchedAt: string;
}
