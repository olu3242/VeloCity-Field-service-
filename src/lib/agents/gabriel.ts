// GABRIEL — Governance, Compliance & Audit Agent
import { BaseAgent } from "./base";

export interface GabrielComplianceOutput {
  compliant: boolean;
  violations: Array<{
    rule: string;
    severity: "info" | "warning" | "violation" | "critical";
    description: string;
    action_required: string;
  }>;
  audit_trail_complete: boolean;
  missing_documentation: string[];
  risk_score: number;
  recommendations: string[];
  regulatory_flags: string[];
}

export interface GabrielProviderScreenOutput {
  approved: boolean;
  flags: string[];
  missing_documents: string[];
  expiring_documents: string[];
  compliance_score: number;
  notes: string;
  requires_admin_review: boolean;
}

export class GabrielAgent extends BaseAgent {
  name = "GABRIEL" as const;
  role = "Governance & Compliance";
  systemPrompt = `You are GABRIEL, the governance and compliance AI for VeloCity Field Service.

You ensure the platform operates within legal and policy boundaries by:
1. Screening provider documentation for completeness and validity
2. Auditing job records for policy compliance
3. Flagging regulatory risks (contractor laws, insurance gaps)
4. Maintaining audit trails for disputes and financial transactions
5. Enforcing platform terms of service

Compliance requirements for providers:
- Valid business license (state-specific)
- General liability insurance (min $1M coverage)
- Workers comp (if employees)
- Background check (within 12 months)
- Category-specific licenses (electricians, plumbers, etc.)

Platform policy enforcement:
- No off-platform payment solicitation
- No contact info sharing before job acceptance
- Service areas must be maintained accurately
- Response to offers within SLA

ALWAYS respond with valid JSON. Be thorough — compliance protects customers, providers, and the platform.`;

  async screenProvider(
    providerData: {
      business_name: string;
      categories: string[];
      documents: Array<{ type: string; uploaded_at: string; verified: boolean; expiry?: string }>;
      years_experience: number;
      completed_jobs: number;
    },
    context: { userId?: string } = {}
  ): Promise<GabrielProviderScreenOutput | null> {
    const prompt = `Provider compliance screening:
Business: ${providerData.business_name}
Categories: ${providerData.categories.join(", ")}
Experience: ${providerData.years_experience} years
Completed jobs: ${providerData.completed_jobs}

Documents submitted:
${providerData.documents
  .map((d) => `- ${d.type}: verified=${d.verified}, uploaded=${d.uploaded_at}${d.expiry ? `, expires=${d.expiry}` : ""}`)
  .join("\n")}

Is this provider compliant for approval? Respond with JSON.`;

    const result = await this.run<GabrielProviderScreenOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }

  async auditJob(
    jobSummary: {
      id: string;
      status: string;
      has_signed_quote: boolean;
      has_payment_record: boolean;
      has_checkin_record: boolean;
      has_completion_photos: boolean;
      has_customer_confirmation: boolean;
      dispute_count: number;
    },
    context: { jobId?: string } = {}
  ): Promise<GabrielComplianceOutput | null> {
    const prompt = `Job compliance audit:
Job ID: ${jobSummary.id}
Final status: ${jobSummary.status}
Audit checklist:
- Signed quote: ${jobSummary.has_signed_quote}
- Payment record: ${jobSummary.has_payment_record}
- Check-in record: ${jobSummary.has_checkin_record}
- Completion photos: ${jobSummary.has_completion_photos}
- Customer confirmation: ${jobSummary.has_customer_confirmation}
- Disputes: ${jobSummary.dispute_count}

Is this job record compliant? Respond with JSON.`;

    const result = await this.run<GabrielComplianceOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const gabriel = new GabrielAgent();
