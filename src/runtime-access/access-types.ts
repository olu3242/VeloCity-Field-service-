export interface RouteGuardResult {
  allowed: boolean;
  redirectTo?: string;
  reason?: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  roles: string[];
  description: string;
}
