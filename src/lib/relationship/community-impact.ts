// Community Impact Programs — veteran assistance, senior support, volunteering,
// disaster recovery, nonprofit partnerships. Tenant-configurable and opt-in.

export type CommunityProgramType =
  | "veteran_assistance" | "senior_support" | "community_volunteering"
  | "disaster_recovery" | "nonprofit_partnership";

export type ContributorType = "provider" | "franchise" | "customer";

export interface CommunityProgram {
  id: string;
  tenantId: string;
  programType: CommunityProgramType;
  name: string;
  description: string;
  isActive: boolean;
  participantCount: number;
  jobsCompleted: number;
  totalValueUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityContribution {
  id: string;
  tenantId: string;
  programId: string;
  contributorId: string;
  contributorType: ContributorType;
  jobId?: string;
  valueUsd: number;
  description: string;
  recordedAt: string;
}

const PROGRAMS = new Map<string, CommunityProgram>(); // id → program
const CONTRIBUTIONS: CommunityContribution[] = [];
const PROGRAM_CAP = 100;
const CONTRIBUTION_CAP = 2000;

export function createProgram(params: {
  tenantId: string;
  programType: CommunityProgramType;
  name: string;
  description: string;
}): CommunityProgram {
  if (PROGRAMS.size >= PROGRAM_CAP) {
    const firstKey = Array.from(PROGRAMS.keys())[0];
    if (firstKey) PROGRAMS.delete(firstKey);
  }
  const now = new Date().toISOString();
  const program: CommunityProgram = {
    id: `prog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
    isActive: true,
    participantCount: 0,
    jobsCompleted: 0,
    totalValueUsd: 0,
    createdAt: now,
    updatedAt: now,
  };
  PROGRAMS.set(program.id, program);
  return program;
}

export function toggleProgram(id: string, isActive: boolean): CommunityProgram | null {
  const prog = PROGRAMS.get(id);
  if (!prog) return null;
  prog.isActive = isActive;
  prog.updatedAt = new Date().toISOString();
  return prog;
}

export function recordContribution(params: {
  tenantId: string;
  programId: string;
  contributorId: string;
  contributorType: ContributorType;
  jobId?: string;
  valueUsd: number;
  description: string;
}): CommunityContribution | null {
  const prog = PROGRAMS.get(params.programId);
  if (!prog || !prog.isActive || prog.tenantId !== params.tenantId) return null;

  prog.jobsCompleted++;
  prog.totalValueUsd = Math.round((prog.totalValueUsd + params.valueUsd) * 100) / 100;
  prog.updatedAt = new Date().toISOString();

  const contrib: CommunityContribution = {
    id: `ctb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
    recordedAt: new Date().toISOString(),
  };

  if (CONTRIBUTIONS.length >= CONTRIBUTION_CAP) CONTRIBUTIONS.shift();
  CONTRIBUTIONS.push(contrib);
  return contrib;
}

export function addParticipant(programId: string): void {
  const prog = PROGRAMS.get(programId);
  if (prog) { prog.participantCount++; prog.updatedAt = new Date().toISOString(); }
}

export function getPrograms(tenantId: string, activeOnly = false): CommunityProgram[] {
  return Array.from(PROGRAMS.values()).filter(p => p.tenantId === tenantId && (!activeOnly || p.isActive));
}

export function getProgramById(id: string): CommunityProgram | null {
  return PROGRAMS.get(id) ?? null;
}

export function getContributions(tenantId: string, programId?: string, limit = 50): CommunityContribution[] {
  return CONTRIBUTIONS
    .filter(c => c.tenantId === tenantId && (!programId || c.programId === programId))
    .slice(-limit)
    .reverse();
}

export function getContributorHistory(contributorId: string, tenantId: string): CommunityContribution[] {
  return CONTRIBUTIONS.filter(c => c.tenantId === tenantId && c.contributorId === contributorId).slice().reverse();
}

export function getCommunityStats(tenantId: string) {
  const programs = Array.from(PROGRAMS.values()).filter(p => p.tenantId === tenantId);
  const contributions = CONTRIBUTIONS.filter(c => c.tenantId === tenantId);
  const totalValue = Math.round(programs.reduce((s, p) => s + p.totalValueUsd, 0) * 100) / 100;
  const byType: Record<string, number> = {};
  for (const p of programs) byType[p.programType] = (byType[p.programType] ?? 0) + 1;
  const uniqueContributors = new Set(contributions.map(c => c.contributorId)).size;

  return {
    totalPrograms: programs.length,
    activePrograms: programs.filter(p => p.isActive).length,
    byType,
    totalJobsCompleted: programs.reduce((s, p) => s + p.jobsCompleted, 0),
    totalCommunityValueUsd: totalValue,
    totalParticipants: programs.reduce((s, p) => s + p.participantCount, 0),
    uniqueContributors,
    totalContributions: contributions.length,
  };
}
