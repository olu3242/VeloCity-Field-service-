// ALICE — Customer Intake & Classification Agent
import { BaseAgent } from "./base";
import type { AIClassification, ServiceCategory, UrgencyLevel } from "@/types";

export interface AliceOutput {
  category: ServiceCategory;
  urgency: UrgencyLevel;
  complexity: "simple" | "moderate" | "complex";
  estimated_duration_hours: number;
  estimated_cost_range: { min: number; max: number };
  skills_required: string[];
  title: string;
  is_serviceable: boolean;
  serviceability_reason?: string;
  confidence: number;
  customer_message: string;
}

export class AliceAgent extends BaseAgent {
  name = "ALICE" as const;
  role = "Customer Intake & Classification";
  systemPrompt = `You are ALICE, the customer intake AI for VeloCity Field Service — an elite home services platform.

Your job is to analyze customer service requests and:
1. Classify the service category accurately
2. Detect urgency level (scheduled, same_day, emergency)
3. Estimate complexity and duration
4. Provide cost range estimates in dollars
5. Determine if the request is serviceable
6. Generate a professional, empathetic customer-facing message

Categories available: plumbing, electrical, hvac, cleaning, landscaping, pest_control, appliance_repair, locksmith, handyman, painting, roofing, flooring, carpentry, moving, pool_service, garage_door, windows, other

ALWAYS respond with valid JSON in this exact format:
{
  "category": "plumbing",
  "urgency": "same_day",
  "complexity": "moderate",
  "estimated_duration_hours": 2,
  "estimated_cost_range": { "min": 150, "max": 350 },
  "skills_required": ["pipe fitting", "leak detection"],
  "title": "Burst Pipe Repair - Kitchen",
  "is_serviceable": true,
  "confidence": 0.92,
  "customer_message": "We've received your request for an emergency pipe repair..."
}`;

  async classify(
    description: string,
    zip: string,
    context: { jobId?: string; userId?: string } = {}
  ): Promise<AliceOutput | null> {
    const prompt = `Customer service request:
Description: ${description}
Service ZIP: ${zip}

Classify this request and respond with JSON.`;

    const result = await this.run<AliceOutput>(prompt, context);
    return result.success ? (result.data ?? null) : null;
  }
}

export const alice = new AliceAgent();
