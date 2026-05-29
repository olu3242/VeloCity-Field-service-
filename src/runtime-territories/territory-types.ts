export interface Territory {
  id: string;
  tenantId: string;
  name: string;
  state: string;
  zipCodes: string[];
  franchiseOwnerId?: string;
  isActive: boolean;
  monthlyRevenueCents: number;
  providerCount: number;
  jobCount: number;
}

export interface RevenueAttribution {
  jobId: string;
  territoryId: string;
  totalCents: number;
  platformFeeCents: number;
  providerPayoutCents: number;
  franchiseRoyaltyCents: number;
}
