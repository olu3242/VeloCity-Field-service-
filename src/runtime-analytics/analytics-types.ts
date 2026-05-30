export interface MarketplaceKPI {
  period: string;
  totalJobs: number;
  completedJobs: number;
  completionRate: number;
  avgJobValueCents: number;
  totalRevenueCents: number;
  activeProviders: number;
  activeCustomers: number;
  avgTimeToMatchMinutes: number;
}

export interface ProviderKPI {
  providerId: string;
  period: string;
  jobsCompleted: number;
  avgRating: number;
  earningsCents: number;
  acceptRate: number;
  avgResponseMinutes: number;
  trustScore: number;
}

export interface TerritoryKPI {
  territoryId: string;
  period: string;
  jobCount: number;
  revenueCents: number;
  providerCount: number;
  customerCount: number;
  marketPenetrationRate: number;
}
