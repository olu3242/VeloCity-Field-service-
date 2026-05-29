export interface Provider {
  id: string;
  userId: string;
  tenantId: string;
  businessName: string;
  status: "pending" | "under_review" | "approved" | "suspended" | "rejected";
  categories: string[];
  serviceRadiusMiles: number;
  hourlyRateCents: number;
  trustScore: number;
  completedJobs: number;
  acceptRate: number;
  avgRating: number;
  isOnline: boolean;
}

export interface ProviderDocument {
  id: string;
  providerId: string;
  type: "insurance" | "license" | "background_check" | "certification";
  status: "pending" | "verified" | "expired" | "rejected";
  expiresAt?: string;
}
