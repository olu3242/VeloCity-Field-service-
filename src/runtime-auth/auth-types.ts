export interface AuthUser {
  id: string;
  email: string;
  role: "customer" | "provider" | "admin";
  tenantId: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface SignupInput {
  email: string;
  password: string;
  fullName?: string;
  tenantId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  session?: AuthSession;
  error?: string;
}
