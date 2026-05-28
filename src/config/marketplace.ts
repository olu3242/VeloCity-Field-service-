import type { ServiceCategory } from "@/types";

export type MarketplaceService = {
  category: ServiceCategory;
  slug: string;
  label: string;
  icon: string;
  summary: string;
  description: string;
  startingAtCents: number;
  eta: string;
  emergency: boolean;
  trustSignals: string[];
  intakePrompts: string[];
};

export const marketplaceServices: MarketplaceService[] = [
  {
    category: "plumbing",
    slug: "plumbing",
    label: "Plumbing",
    icon: "Wrench",
    summary: "Leaks, drains, fixtures, water heaters, and urgent repairs.",
    description: "AI-assisted plumbing dispatch for leaks, clogs, fixture installs, water heaters, and emergency shutoff triage.",
    startingAtCents: 8900,
    eta: "45-90 min",
    emergency: true,
    trustSignals: ["Licensed technicians", "Leak triage", "Parts-ready matching"],
    intakePrompts: ["Where is the leak or blockage?", "Is water actively running?", "Do you know the fixture brand?"],
  },
  {
    category: "electrical",
    slug: "electrical",
    label: "Electrical",
    icon: "Zap",
    summary: "Breakers, outlets, panels, lighting, and diagnostics.",
    description: "Qualified electrical pros routed by license coverage, urgency, job complexity, and local availability.",
    startingAtCents: 9900,
    eta: "60-120 min",
    emergency: true,
    trustSignals: ["License-aware routing", "Safety triage", "Code-focused quotes"],
    intakePrompts: ["Is power out in one area or the full property?", "Do you smell burning?", "What changed before the issue started?"],
  },
  {
    category: "hvac",
    slug: "hvac",
    label: "HVAC",
    icon: "Snowflake",
    summary: "AC, heat, thermostats, maintenance, and system diagnostics.",
    description: "HVAC dispatch that weighs weather, equipment type, parts likelihood, and provider response windows.",
    startingAtCents: 11900,
    eta: "Same day",
    emergency: true,
    trustSignals: ["Certified HVAC pros", "Weather-aware urgency", "Equipment triage"],
    intakePrompts: ["Is the system heating, cooling, or neither?", "What thermostat reading do you see?", "When was the last maintenance visit?"],
  },
  {
    category: "cleaning",
    slug: "cleaning",
    label: "Cleaning",
    icon: "Sparkles",
    summary: "Standard, deep, move-out, and recurring cleaning.",
    description: "Matched cleaning crews for home resets, recurring service, move-outs, and short-turnaround needs.",
    startingAtCents: 7900,
    eta: "24 hrs",
    emergency: false,
    trustSignals: ["Background checked", "Recurring-ready", "Room-based estimates"],
    intakePrompts: ["How many rooms need service?", "Is this standard or deep cleaning?", "Any pets or access notes?"],
  },
  {
    category: "landscaping",
    slug: "landscaping",
    label: "Landscaping",
    icon: "Leaf",
    summary: "Lawn care, cleanup, irrigation checks, and seasonal work.",
    description: "Local outdoor service matching for mowing, cleanup, planting, irrigation inspection, and recurring maintenance.",
    startingAtCents: 6900,
    eta: "24-48 hrs",
    emergency: false,
    trustSignals: ["Zone-aware routing", "Recurring plans", "Weather windows"],
    intakePrompts: ["What is the approximate yard size?", "Do you need one-time or recurring service?", "Any gate or equipment access notes?"],
  },
  {
    category: "pest_control",
    slug: "pest-control",
    label: "Pest Control",
    icon: "ShieldCheck",
    summary: "Inspection, treatment, exclusion, and prevention.",
    description: "Pest pros matched by pest type, treatment certification, household constraints, and service radius.",
    startingAtCents: 10900,
    eta: "Same day",
    emergency: false,
    trustSignals: ["Treatment certified", "Pet-safe options", "Follow-up tracking"],
    intakePrompts: ["What pest are you seeing?", "Where is the activity concentrated?", "Are children or pets present?"],
  },
  {
    category: "appliance_repair",
    slug: "appliance-repair",
    label: "Appliance Repair",
    icon: "Plug",
    summary: "Refrigerators, washers, dryers, ovens, and dishwashers.",
    description: "Appliance repair routing by appliance type, brand, symptom, warranty constraints, and likely parts.",
    startingAtCents: 9500,
    eta: "24 hrs",
    emergency: false,
    trustSignals: ["Brand-aware matching", "Parts intelligence", "Diagnostic quotes"],
    intakePrompts: ["What appliance needs service?", "What brand and model is it?", "What error code or symptom do you see?"],
  },
  {
    category: "locksmith",
    slug: "locksmith",
    label: "Locksmith",
    icon: "KeyRound",
    summary: "Lockouts, rekeys, deadbolts, smart locks, and access repair.",
    description: "Fast locksmith routing for lockouts, rekeys, smart lock installs, and access-control issues.",
    startingAtCents: 8500,
    eta: "30-75 min",
    emergency: true,
    trustSignals: ["Identity-safe workflow", "Fast ETA routing", "Smart lock ready"],
    intakePrompts: ["Are you locked out now?", "What type of lock is involved?", "Can you verify property access on arrival?"],
  },
  {
    category: "handyman",
    slug: "handyman",
    label: "Handyman",
    icon: "Hammer",
    summary: "General repairs, mounting, assembly, doors, and fixes.",
    description: "Multi-skill provider matching for small repairs, installations, punch lists, and household projects.",
    startingAtCents: 7500,
    eta: "24 hrs",
    emergency: false,
    trustSignals: ["Skill-based matching", "Punch-list friendly", "Hourly or fixed quote"],
    intakePrompts: ["How many tasks are on the list?", "Do you already have materials?", "Any ladder or mounting requirements?"],
  },
  {
    category: "painting",
    slug: "painting",
    label: "Painting",
    icon: "Paintbrush",
    summary: "Interior, exterior, touch-ups, prep, and finish work.",
    description: "Painting crews matched by project size, prep complexity, finish expectations, and schedule window.",
    startingAtCents: 14900,
    eta: "48 hrs",
    emergency: false,
    trustSignals: ["Surface prep review", "Color-ready intake", "Crew-size matching"],
    intakePrompts: ["Interior or exterior?", "How many rooms or surfaces?", "Do you have paint selected?"],
  },
  {
    category: "roofing",
    slug: "roofing",
    label: "Roofing",
    icon: "Home",
    summary: "Leak checks, repair, inspection, gutters, and estimates.",
    description: "Roofing triage that prioritizes active leaks, weather exposure, access conditions, and certified crews.",
    startingAtCents: 12900,
    eta: "Same day",
    emergency: true,
    trustSignals: ["Storm-aware triage", "Inspection-first", "Photo intake"],
    intakePrompts: ["Is water entering the property?", "What roof type do you have?", "Can you upload photos from inside or outside?"],
  },
  {
    category: "flooring",
    slug: "flooring",
    label: "Flooring",
    icon: "Layers",
    summary: "Repair, install, refinish, tile, vinyl, and hardwood.",
    description: "Flooring specialists routed by material, square footage, substrate condition, and installation scope.",
    startingAtCents: 15900,
    eta: "48 hrs",
    emergency: false,
    trustSignals: ["Material-specific pros", "Square-foot estimates", "Install planning"],
    intakePrompts: ["What flooring material is involved?", "Approximate square footage?", "Repair or new installation?"],
  },
  {
    category: "carpentry",
    slug: "carpentry",
    label: "Carpentry",
    icon: "Ruler",
    summary: "Trim, doors, framing, custom builds, and repairs.",
    description: "Carpentry providers matched by finish level, material requirements, measurements, and project complexity.",
    startingAtCents: 11500,
    eta: "48 hrs",
    emergency: false,
    trustSignals: ["Finish-grade matching", "Measurement intake", "Custom quote support"],
    intakePrompts: ["What needs to be built or repaired?", "Do you have measurements?", "Is this structural or finish work?"],
  },
  {
    category: "moving",
    slug: "moving",
    label: "Moving",
    icon: "Package",
    summary: "Labor, local moves, heavy items, packing, and hauling.",
    description: "Move support matched by crew size, stairs, distance, item weight, and truck requirements.",
    startingAtCents: 13900,
    eta: "24-48 hrs",
    emergency: false,
    trustSignals: ["Crew sizing", "Heavy-item routing", "Time-window planning"],
    intakePrompts: ["How many rooms or items?", "Are there stairs or elevators?", "Do you need a truck or labor only?"],
  },
  {
    category: "pool_service",
    slug: "pool-service",
    label: "Pool Service",
    icon: "Waves",
    summary: "Cleaning, chemistry, pumps, inspection, and repairs.",
    description: "Pool service matching by equipment type, chemical state, recurring needs, and repair complexity.",
    startingAtCents: 8900,
    eta: "24-48 hrs",
    emergency: false,
    trustSignals: ["Chemistry-aware intake", "Equipment routing", "Recurring plans"],
    intakePrompts: ["Cleaning or equipment repair?", "What does the water look like?", "What pump/filter system do you have?"],
  },
  {
    category: "garage_door",
    slug: "garage-door",
    label: "Garage Door",
    icon: "Car",
    summary: "Springs, openers, tracks, panels, and safety checks.",
    description: "Garage door pros matched for spring risk, opener type, stuck-door urgency, and parts readiness.",
    startingAtCents: 9900,
    eta: "Same day",
    emergency: true,
    trustSignals: ["Spring-safety triage", "Opener-aware matching", "Parts-ready routing"],
    intakePrompts: ["Is the door stuck open or closed?", "Did a spring or cable break?", "What opener brand do you have?"],
  },
  {
    category: "windows",
    slug: "windows",
    label: "Windows",
    icon: "PanelTop",
    summary: "Glass, locks, seals, screens, and replacement estimates.",
    description: "Window service routing for broken glass, failed seals, stuck sashes, screens, and replacement planning.",
    startingAtCents: 9500,
    eta: "24-48 hrs",
    emergency: false,
    trustSignals: ["Glass-safe triage", "Measurement support", "Security-priority routing"],
    intakePrompts: ["Is glass broken?", "What window type is it?", "Do you need repair or replacement?"],
  },
  {
    category: "other",
    slug: "other",
    label: "Other",
    icon: "Settings",
    summary: "Not sure where it fits? ALICE will classify it.",
    description: "A flexible intake path for local service requests that need AI classification before dispatch.",
    startingAtCents: 7500,
    eta: "Varies",
    emergency: false,
    trustSignals: ["AI classification", "Fallback routing", "Human escalation"],
    intakePrompts: ["What outcome do you need?", "Is there an urgent safety issue?", "Can you upload a photo?"],
  },
];

export type AgentPage = {
  slug: "alice" | "max" | "quinn" | "rex";
  name: "ALICE" | "MAX" | "QUINN" | "REX";
  role: string;
  route: string;
  summary: string;
  metrics: Array<{ label: string; value: string }>;
  flow: string[];
};

export const aiAgentPages: AgentPage[] = [
  {
    slug: "alice",
    name: "ALICE",
    role: "Intake",
    route: "/ai/alice",
    summary: "Classifies customer requests, checks serviceability, and turns messy issue descriptions into dispatch-ready jobs.",
    metrics: [
      { label: "INTAKE CONFIDENCE", value: "94%" },
      { label: "AVG TRIAGE", value: "18s" },
      { label: "SERVICEABILITY", value: "ONLINE" },
    ],
    flow: ["Capture service intent", "Classify category and urgency", "Validate ZIP coverage", "Emit service_request_created"],
  },
  {
    slug: "max",
    name: "MAX",
    role: "Dispatch",
    route: "/ai/max",
    summary: "Ranks providers by skill, proximity, trust score, live availability, SLA risk, and fallback coverage.",
    metrics: [
      { label: "MATCH ENGINE", value: "ACTIVE" },
      { label: "AVG ROUTING", value: "42s" },
      { label: "SLA RISK", value: "LOW" },
    ],
    flow: ["Score available providers", "Rank trust and distance", "Issue provider offers", "Fallback if offer expires"],
  },
  {
    slug: "quinn",
    name: "QUINN",
    role: "Quotes",
    route: "/ai/quinn",
    summary: "Structures diagnostics, quote line items, estimate bands, and customer-facing pricing explanations.",
    metrics: [
      { label: "QUOTE GUARD", value: "ON" },
      { label: "FAIRNESS", value: "97%" },
      { label: "ESCROW READY", value: "YES" },
    ],
    flow: ["Analyze diagnosis", "Generate line items", "Validate fairness", "Prepare approval workflow"],
  },
  {
    slug: "rex",
    name: "REX",
    role: "Quality",
    route: "/ai/rex",
    summary: "Monitors completion proof, customer satisfaction, dispute signals, and provider quality loops.",
    metrics: [
      { label: "QUALITY SCAN", value: "LIVE" },
      { label: "DISPUTE RISK", value: "3.2%" },
      { label: "PROOF CHECKS", value: "READY" },
    ],
    flow: ["Review completion proof", "Score outcome quality", "Watch dispute risk", "Feed provider trust score"],
  },
];

export const marketplaceNavGroups = [
  {
    label: "Explore",
    links: [
      { label: "Home Services", href: "/services" },
      { label: "Providers", href: "/providers" },
      { label: "Service Areas", href: "/service-areas" },
      { label: "Community", href: "/community" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    label: "Partner Portal",
    links: [
      { label: "Become a Provider", href: "/provider/apply" },
      { label: "Provider Dashboard", href: "/provider/dashboard" },
      { label: "Business Solutions", href: "/business-solutions" },
      { label: "Territory Operators", href: "/territory-operators" },
    ],
  },
  {
    label: "AI System",
    links: aiAgentPages.map((agent) => ({
      label: `${agent.name} - ${agent.role}`,
      href: agent.route,
    })),
  },
  {
    label: "Support",
    links: [
      { label: "Help Center", href: "/support" },
      { label: "Contact Us", href: "/support#contact" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

export function getServiceBySlug(slug: string) {
  return marketplaceServices.find((service) => service.slug === slug);
}

export function getServiceByCategory(category: ServiceCategory) {
  return marketplaceServices.find((service) => service.category === category);
}

export function getAgentBySlug(slug: string) {
  return aiAgentPages.find((agent) => agent.slug === slug);
}
