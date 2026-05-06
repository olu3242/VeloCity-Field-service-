"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import "./landing.css";

/* ────────────────────────────────────────────────────────────
   TYPE DEFINITIONS
   ──────────────────────────────────────────────────────────── */

interface Agent {
  name: string;
  role: string;
  icon: string;
}

interface Service {
  name: string;
  desc: string;
  price: string;
  responseTime: string;
  skinColor: string;
  hairColor: string;
  uniformColor: string;
  initials: string;
  tool: string;
}

interface Artisan {
  name: string;
  trade: string;
  rating: number;
  jobs: number;
  city: string;
  skinColor: string;
  hairColor: string;
  uniformColor: string;
  bgGradient: string;
  initials: string;
  tool: string;
}

interface TrustPoint {
  icon: string;
  title: string;
  desc: string;
}

interface HowStep {
  num: string;
  icon: string;
  agent: string;
  title: string;
  desc: string;
  json: string;
}

interface TimelineEvent {
  time: string;
  icon: string;
  event: string;
  detail: string;
}

interface ProviderBenefit {
  icon: string;
  title: string;
  desc: string;
}

interface AudienceCard {
  icon: string;
  title: string;
  desc: string;
  features: string[];
}

interface PricingPlan {
  role: string;
  amount: string;
  period: string;
  featured: boolean;
  features: string[];
  cta: string;
}

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  avatar: string;
  avatarBg: string;
  stars: number;
  featured: boolean;
}

interface FaqItem {
  question: string;
  answer: string;
}

/* ────────────────────────────────────────────────────────────
   ARTISAN SVG PORTRAIT
   ──────────────────────────────────────────────────────────── */

function ArtisanPortrait({ artisan }: { artisan: Artisan }) {
  const id = artisan.initials.replace(/\s/g, "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 220"
      width="100%"
      style={{ display: "block" }}
      aria-label={`Portrait of ${artisan.name}, ${artisan.trade}`}
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={artisan.bgGradient} stopOpacity="1" />
          <stop offset="100%" stopColor="#050505" stopOpacity="1" />
        </linearGradient>
        <radialGradient id={`amb-${id}`} cx="50%" cy="20%" r="60%">
          <stop offset="0%" stopColor={artisan.uniformColor} stopOpacity="0.35" />
          <stop offset="100%" stopColor="transparent" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`skin-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={artisan.skinColor} stopOpacity="1" />
          <stop offset="100%" stopColor={artisan.skinColor} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={`uni-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={artisan.uniformColor} stopOpacity="1" />
          <stop offset="100%" stopColor={artisan.uniformColor} stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="60%" stopColor="transparent" stopOpacity="0" />
          <stop offset="100%" stopColor="#0a0a0f" stopOpacity="0.85" />
        </linearGradient>
        <filter id={`shad-${id}`}>
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="160" height="220" fill={`url(#bg-${id})`} />
      <rect width="160" height="220" fill={`url(#amb-${id})`} />

      {/* Subtle grid lines */}
      <line x1="0" y1="55" x2="160" y2="55" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      <line x1="0" y1="110" x2="160" y2="110" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
      <line x1="80" y1="0" x2="80" y2="220" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />

      {/* Body / Uniform */}
      <rect x="38" y="140" width="84" height="80" rx="4" fill={`url(#uni-${id})`} />

      {/* Arms */}
      <rect x="16" y="145" width="28" height="52" rx="10" fill={`url(#uni-${id})`} />
      <rect x="116" y="145" width="28" height="52" rx="10" fill={`url(#uni-${id})`} />

      {/* Hands */}
      <ellipse cx="30" cy="197" rx="11" ry="9" fill={`url(#skin-${id})`} />
      <ellipse cx="130" cy="197" rx="11" ry="9" fill={`url(#skin-${id})`} />

      {/* Tool hint — right hand */}
      <text x="133" y="201" fontSize="10" textAnchor="middle" opacity="0.85">
        {artisan.tool}
      </text>

      {/* Neck */}
      <rect x="70" y="125" width="20" height="22" rx="4" fill={`url(#skin-${id})`} />

      {/* Head */}
      <ellipse
        cx="80"
        cy="103"
        rx="32"
        ry="35"
        fill={`url(#skin-${id})`}
        filter={`url(#shad-${id})`}
      />

      {/* Ears */}
      <ellipse cx="48" cy="103" rx="6" ry="8" fill={artisan.skinColor} />
      <ellipse cx="112" cy="103" rx="6" ry="8" fill={artisan.skinColor} />

      {/* Hair */}
      <ellipse cx="80" cy="73" rx="32" ry="18" fill={artisan.hairColor} />
      <rect x="48" y="73" width="64" height="12" fill={artisan.hairColor} />

      {/* Side hair sweep */}
      <ellipse cx="52" cy="83" rx="8" ry="14" fill={artisan.hairColor} />
      <ellipse cx="108" cy="83" rx="8" ry="14" fill={artisan.hairColor} />

      {/* Eyebrows */}
      <path
        d="M63 92 Q69 88 75 91"
        stroke={artisan.hairColor}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M85 91 Q91 88 97 92"
        stroke={artisan.hairColor}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Eyes */}
      <ellipse cx="69" cy="98" rx="6" ry="5" fill="white" />
      <ellipse cx="91" cy="98" rx="6" ry="5" fill="white" />
      <ellipse cx="69" cy="99" rx="3.5" ry="3.5" fill="#1a0a00" />
      <ellipse cx="91" cy="99" rx="3.5" ry="3.5" fill="#1a0a00" />
      {/* Eye shine */}
      <ellipse cx="70.5" cy="97.5" rx="1" ry="1" fill="white" opacity="0.8" />
      <ellipse cx="92.5" cy="97.5" rx="1" ry="1" fill="white" opacity="0.8" />

      {/* Nose */}
      <path
        d="M80 104 Q77 110 74 112 Q80 114 86 112 Q83 110 80 104"
        fill={artisan.skinColor}
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="0.5"
      />

      {/* Smile */}
      <path
        d="M70 119 Q80 126 90 119"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Collar / shirt detail */}
      <path
        d="M60 142 L80 155 L100 142"
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1.5"
      />

      {/* Logo badge on uniform */}
      <rect x="68" y="158" width="24" height="16" rx="2" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      <text x="80" y="169" fontSize="7" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontFamily="monospace">V·OS</text>

      {/* Bottom overlay gradient */}
      <rect width="160" height="220" fill={`url(#fade-${id})`} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   SERVICE ARTISAN SVG (smaller, trade-specific)
   ──────────────────────────────────────────────────────────── */

function ServiceArtisan({ s }: { s: Service }) {
  const id = `svc-${s.initials.replace(/\s/g, "")}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 72 72"
      width="72"
      height="72"
      aria-label={s.name}
    >
      <defs>
        <radialGradient id={`sbg-${id}`} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor={s.uniformColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0a0a0f" stopOpacity="1" />
        </radialGradient>
        <linearGradient id={`ssk-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={s.skinColor} />
          <stop offset="100%" stopColor={s.skinColor} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" fill={`url(#sbg-${id})`} rx="4" />
      {/* Uniform body */}
      <rect x="18" y="44" width="36" height="28" rx="3" fill={s.uniformColor} opacity="0.9" />
      {/* Arms */}
      <rect x="7" y="46" width="13" height="20" rx="5" fill={s.uniformColor} opacity="0.85" />
      <rect x="52" y="46" width="13" height="20" rx="5" fill={s.uniformColor} opacity="0.85" />
      {/* Neck */}
      <rect x="32" y="38" width="8" height="10" rx="3" fill={`url(#ssk-${id})`} />
      {/* Head */}
      <ellipse cx="36" cy="28" rx="14" ry="15" fill={`url(#ssk-${id})`} />
      {/* Hair */}
      <ellipse cx="36" cy="16" rx="14" ry="8" fill={s.hairColor} />
      <rect x="22" y="16" width="28" height="6" fill={s.hairColor} />
      {/* Eyes */}
      <ellipse cx="31" cy="27" rx="2.5" ry="2" fill="white" />
      <ellipse cx="41" cy="27" rx="2.5" ry="2" fill="white" />
      <ellipse cx="31" cy="27.5" rx="1.5" ry="1.5" fill="#1a0a00" />
      <ellipse cx="41" cy="27.5" rx="1.5" ry="1.5" fill="#1a0a00" />
      {/* Smile */}
      <path d="M30 33 Q36 37 42 33" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Tool icon */}
      <text x="36" y="63" fontSize="12" textAnchor="middle">{s.tool}</text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────────── */

const AGENTS: Agent[] = [
  { name: "ALICE", role: "Intake", icon: "🎙" },
  { name: "MAX", role: "Dispatch", icon: "📡" },
  { name: "QUINN", role: "Pricing", icon: "💬" },
  { name: "NOVA", role: "Workflow", icon: "🔄" },
  { name: "FINN", role: "Finance", icon: "💳" },
  { name: "REX", role: "Quality", icon: "🛡" },
  { name: "IVY", role: "Disputes", icon: "⚖️" },
  { name: "LENA", role: "Retention", icon: "💎" },
  { name: "TESS", role: "Territory", icon: "🗺" },
  { name: "GABRIEL", role: "Compliance", icon: "📋" },
];

const HOW_STEPS: HowStep[] = [
  {
    num: "01",
    icon: "💬",
    agent: "ALICE",
    title: "Tell us what's wrong",
    desc: "Describe your issue in plain language. ALICE, our intake agent, classifies the problem, detects urgency, and prepares the job brief — no forms required.",
    json: `{ "agent": "ALICE",\n  "urgency": "high",\n  "category": "plumbing",\n  "job_id": "JB-4821" }`,
  },
  {
    num: "02",
    icon: "📡",
    agent: "MAX",
    title: "Get matched with a trusted pro",
    desc: "MAX scans verified local providers, ranks by proximity, skill, trust score, and availability. Your match arrives in under 8 minutes on average.",
    json: `{ "agent": "MAX",\n  "match": "Diego A.",\n  "trust": 4.9,\n  "eta_min": 22 }`,
  },
  {
    num: "03",
    icon: "🔒",
    agent: "NOVA + FINN",
    title: "Track, approve, and pay safely",
    desc: "Watch your pro arrive in real-time. NOVA manages the workflow. FINN holds payment in escrow until the job is done and you approve — no surprises.",
    json: `{ "agent": "FINN",\n  "escrow": "$185",\n  "status": "held",\n  "release": "on_approval" }`,
  },
];

const SERVICES: Service[] = [
  {
    name: "Plumbing",
    desc: "Leaks, clogs, pipe repairs, faucet installs, water heaters, emergency shutoffs.",
    price: "FROM $75 · SAME DAY",
    responseTime: "~6 min avg",
    skinColor: "#C8815A",
    hairColor: "#1a0800",
    uniformColor: "#1E4D8C",
    initials: "PL",
    tool: "🔧",
  },
  {
    name: "Electrical",
    desc: "Wiring, outlets, lighting, breaker panels, EV charger installs, safety inspections.",
    price: "FROM $90 · LICENSED PROS",
    responseTime: "~8 min avg",
    skinColor: "#7B4C2A",
    hairColor: "#050505",
    uniformColor: "#92400E",
    initials: "EL",
    tool: "⚡",
  },
  {
    name: "HVAC / AC",
    desc: "AC not cooling, tune-ups, filter changes, duct cleaning, seasonal maintenance.",
    price: "FROM $120 · CERTIFIED",
    responseTime: "~9 min avg",
    skinColor: "#B87050",
    hairColor: "#0a0500",
    uniformColor: "#0D6D6E",
    initials: "HV",
    tool: "❄️",
  },
  {
    name: "Cleaning",
    desc: "Deep cleans, move-in/move-out, recurring weekly or bi-weekly home cleaning.",
    price: "FROM $65 · RECURRING",
    responseTime: "~5 min avg",
    skinColor: "#C07840",
    hairColor: "#1a0800",
    uniformColor: "#1D4ED8",
    initials: "CL",
    tool: "🧹",
  },
  {
    name: "Handyman",
    desc: "TV mounting, furniture assembly, drywall, minor repairs, door & window fixes.",
    price: "FROM $50 · SAME DAY",
    responseTime: "~7 min avg",
    skinColor: "#E8A882",
    hairColor: "#3D2010",
    uniformColor: "#374151",
    initials: "HM",
    tool: "🔨",
  },
  {
    name: "Lawn Care",
    desc: "Mowing, edging, seasonal cleanup, leaf removal, landscaping maintenance.",
    price: "FROM $60 · WEEKLY PLANS",
    responseTime: "~10 min avg",
    skinColor: "#C07840",
    hairColor: "#1a0800",
    uniformColor: "#15803D",
    initials: "LC",
    tool: "🌿",
  },
];

const ARTISANS: Artisan[] = [
  {
    name: "Diego A.",
    trade: "Licensed Plumber",
    rating: 4.9,
    jobs: 247,
    city: "San Antonio",
    skinColor: "#C8815A",
    hairColor: "#1a0800",
    uniformColor: "#1E4D8C",
    bgGradient: "#0a1628",
    initials: "DA",
    tool: "🔧",
  },
  {
    name: "Maria C.",
    trade: "HVAC Technician",
    rating: 4.8,
    jobs: 183,
    city: "Stone Oak",
    skinColor: "#B87050",
    hairColor: "#0a0500",
    uniformColor: "#0D6D6E",
    bgGradient: "#051818",
    initials: "MC",
    tool: "❄️",
  },
  {
    name: "James T.",
    trade: "Master Electrician",
    rating: 4.9,
    jobs: 312,
    city: "Alamo Heights",
    skinColor: "#7B4C2A",
    hairColor: "#050505",
    uniformColor: "#92400E",
    bgGradient: "#1a0a00",
    initials: "JT",
    tool: "⚡",
  },
  {
    name: "Rosa M.",
    trade: "Home Cleaning Pro",
    rating: 5.0,
    jobs: 428,
    city: "Helotes",
    skinColor: "#C07840",
    hairColor: "#1a0800",
    uniformColor: "#1D4ED8",
    bgGradient: "#050e28",
    initials: "RM",
    tool: "🧹",
  },
  {
    name: "Sam K.",
    trade: "Handyman Expert",
    rating: 4.7,
    jobs: 156,
    city: "Leon Valley",
    skinColor: "#E8A882",
    hairColor: "#3D2010",
    uniformColor: "#374151",
    bgGradient: "#0e0e18",
    initials: "SK",
    tool: "🔨",
  },
  {
    name: "Carlos V.",
    trade: "Lawn & Landscape",
    rating: 4.8,
    jobs: 201,
    city: "Downtown SA",
    skinColor: "#C07840",
    hairColor: "#1a0800",
    uniformColor: "#15803D",
    bgGradient: "#051208",
    initials: "CV",
    tool: "🌿",
  },
];

const TRUST_POINTS: TrustPoint[] = [
  { icon: "✅", title: "Verified & Insured Pros", desc: "Every provider on VeloCity is background-checked, license-verified, and insured before their first job." },
  { icon: "📋", title: "Background & Document Checks", desc: "We verify identity, trade certifications, insurance docs, and criminal records — not just reviews." },
  { icon: "💬", title: "Transparent Quote Approval", desc: "You review and approve every quote before work begins. No surprise charges, ever." },
  { icon: "🔒", title: "Pay Only When Done", desc: "FINN holds your payment in escrow. It's only released after you confirm the job is complete." },
  { icon: "🛡", title: "Support If Something Goes Wrong", desc: "IVY, our dispute agent, reviews evidence and mediates if there's ever an issue with a job." },
  { icon: "📊", title: "Every Job Has an Audit Trail", desc: "Every status change, message, quote, and payment is logged — a complete, tamper-proof record." },
];

const TIMELINE: TimelineEvent[] = [
  { time: "8:12 AM", icon: "🔴", event: "Leak reported", detail: "Kitchen pipe burst — water spreading fast" },
  { time: "8:18 AM", icon: "📡", event: "Matched with Diego A.", detail: "4.9★ licensed plumber · 247 jobs" },
  { time: "8:42 AM", icon: "📍", event: "Diego arrived on-site", detail: "ETA 22 min · Arrived 4 min early" },
  { time: "9:20 AM", icon: "💬", event: "Quote approved", detail: "$185 · Pipe repair + shutoff valve" },
  { time: "10:05 AM", icon: "✅", event: "Job complete", detail: "Payment released · 5★ review submitted" },
];

const PROVIDER_BENEFITS: ProviderBenefit[] = [
  { icon: "💸", title: "No Lead Fees", desc: "We dispatch jobs to you. You never pay to receive a lead." },
  { icon: "✅", title: "Pre-Qualified Jobs", desc: "Customers are verified and payment is confirmed before dispatch." },
  { icon: "⚡", title: "Faster Payouts", desc: "Get paid within 24 hours of job approval via Stripe Connect." },
  { icon: "⭐", title: "Trust Score Growth", desc: "Build your reputation and get more premium job dispatches." },
  { icon: "📋", title: "Smart Quote Tools", desc: "QUINN helps you price fairly and detect change orders." },
  { icon: "🤖", title: "AI Dispatch Support", desc: "MAX handles scheduling, routing, and SLA management for you." },
];

const AUDIENCE_CARDS: AudienceCard[] = [
  {
    icon: "🏠",
    title: "CUSTOMERS",
    desc: "Homeowners and renters who need trusted, reliable local service without the stress.",
    features: [
      "Book in minutes — no phone calls",
      "Track your pro live",
      "Approve quotes before work starts",
      "Pay only when the job is done",
      "Review and rebook easily",
    ],
  },
  {
    icon: "🔧",
    title: "PROVIDERS",
    desc: "Local licensed tradespeople who want consistent, pre-qualified jobs without lead fees.",
    features: [
      "Receive dispatched, confirmed jobs",
      "No lead fees or bidding wars",
      "Get paid fast with Stripe Connect",
      "Grow your trust score on-platform",
      "AI-assisted scheduling and routing",
    ],
  },
  {
    icon: "🏢",
    title: "OPERATORS",
    desc: "Territory operators who manage fleets of providers and service areas at scale.",
    features: [
      "White-label operator dashboard",
      "Multi-provider territory management",
      "SLA monitoring and alerts",
      "Revenue and performance analytics",
      "Custom pricing and service rules",
    ],
  },
];

const PRICING_PLANS: PricingPlan[] = [
  {
    role: "CUSTOMER",
    amount: "Free",
    period: "No subscription required",
    featured: false,
    features: [
      "Book any service",
      "Live job tracking",
      "Escrow-protected payments",
      "Review & dispute support",
      "Rebook with 1 tap",
    ],
    cta: "Book Now",
  },
  {
    role: "PROVIDER",
    amount: "18–22%",
    period: "Platform fee per completed job",
    featured: true,
    features: [
      "Zero lead fees",
      "Pre-qualified job dispatches",
      "Stripe Connect payouts",
      "AI quote & pricing tools",
      "Trust score dashboard",
    ],
    cta: "Apply as a Pro",
  },
  {
    role: "OPERATOR",
    amount: "Custom",
    period: "Territory licensing model",
    featured: false,
    features: [
      "Operator command center",
      "Multi-provider management",
      "White-label branding",
      "Custom SLA rules",
      "Dedicated account support",
    ],
    cta: "Contact Sales",
  },
];

const TESTIMONIALS: Testimonial[] = [
  {
    quote: '"I called three plumbers and no one picked up. VeloCity matched me with Diego in 6 minutes. He fixed the leak before it ruined my floor. I won\'t use anything else."',
    name: "Marisol K.",
    role: "Homeowner · San Antonio",
    avatar: "MK",
    avatarBg: "#1E4D8C",
    stars: 5,
    featured: false,
  },
  {
    quote: '"I was skeptical at first — no more chasing leads, they just show up in my app. I\'ve done 247 jobs on VeloCity, no slow weeks, and the payout hits next day. This is how it should work."',
    name: "Diego A.",
    role: "Licensed Plumber · Provider",
    avatar: "DA",
    avatarBg: "#1E4D8C",
    stars: 5,
    featured: true,
  },
  {
    quote: '"Running 40 providers across two ZIP codes was a nightmare. The operator dashboard makes it manageable. SLA alerts, dispatch visibility, real-time dashboards — it\'s genuinely impressive."',
    name: "Sasha T.",
    role: "Territory Operator · Stone Oak",
    avatar: "ST",
    avatarBg: "#0D6D6E",
    stars: 5,
    featured: false,
  },
];

const FAQS: FaqItem[] = [
  {
    question: "How quickly can I get a pro to my home?",
    answer: "Our average match time is under 8 minutes. For emergency services, we have 24/7 dispatch coverage and can often route a provider within 30 minutes depending on your area and service type.",
  },
  {
    question: "Are providers background-checked and insured?",
    answer: "Yes — every provider on VeloCity goes through identity verification, criminal background checks, trade license verification, and proof of insurance before they can accept jobs. We also monitor their trust score on an ongoing basis.",
  },
  {
    question: "What happens if I'm not satisfied with the work?",
    answer: "Don't approve the job. Your payment stays in escrow until you confirm the work is done to your satisfaction. If there's a dispute, IVY — our AI dispute agent — reviews the evidence and helps mediate a fair resolution.",
  },
  {
    question: "How does payment work? Do I pay upfront?",
    answer: "You authorize a small hold at booking (to confirm intent), but the full payment only leaves escrow when you approve the completed job. If the job is cancelled or not completed, you're refunded automatically.",
  },
  {
    question: "Is VeloCity available in my area?",
    answer: "VeloCity launched in San Antonio, TX and is actively expanding. Enter your ZIP code in the booking search to check coverage. If we're not in your area yet, you can join the waitlist and we'll notify you when we launch.",
  },
  {
    question: "How is VeloCity different from other home service apps?",
    answer: "Most platforms just send your info to providers who then call and bid. We dispatch verified, pre-qualified pros directly — no cold calls, no bidding wars. You track the job live, approve quotes in-app, and pay only when satisfied. The whole thing runs on 10 specialized AI agents working behind the scenes.",
  },
];

/* ────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
  const [activeUrgency, setActiveUrgency] = useState<"Today" | "Schedule" | "Emergency">("Today");
  const [selectedService, setSelectedService] = useState("plumbing");
  const [cityZip, setCityZip] = useState("");
  const revealRefs = useRef<(HTMLElement | null)[]>([]);
  const cursorRef = useRef<HTMLDivElement>(null);

  /* Scroll listener */
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /* Google Fonts */
  useEffect(() => {
    if (document.getElementById("lp-fonts")) return;
    const link = document.createElement("link");
    link.id = "lp-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Space+Mono:wght@400;700&display=swap";
    document.head.appendChild(link);
  }, []);

  /* Cursor glow */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.left = `${e.clientX}px`;
        cursorRef.current.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  /* Intersection Observer for reveal animations */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    const elements = document.querySelectorAll(".lp-reveal");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const addRevealRef = useCallback((el: HTMLElement | null, index: number) => {
    revealRefs.current[index] = el;
  }, []);

  void addRevealRef;

  const toggleFaq = (index: number) => {
    setFaqOpenIndex(faqOpenIndex === index ? null : index);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="landing-page">
      {/* Cursor glow */}
      <div className="cursor-glow" ref={cursorRef} aria-hidden="true" />

      {/* ── NAV ── */}
      <nav className={`lp-nav${scrolled ? " scrolled" : ""}`} role="navigation" aria-label="Main navigation">
        <a href="/" className="lp-nav-logo" aria-label="VeloCity Home">
          <div className="lp-nav-logo-mark"><span>V</span></div>
          <span className="lp-nav-wordmark">VELO<em>CITY</em></span>
        </a>

        <ul className="lp-nav-links">
          {["services", "how-it-works", "trust", "providers", "pricing"].map((id) => (
            <li key={id}>
              <button
                onClick={() => scrollToSection(id)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500, letterSpacing: "0.4px", color: "var(--muted-lp)", transition: "color 0.2s", fontFamily: "var(--font-body-lp)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--white)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--muted-lp)"; }}
              >
                {id === "how-it-works" ? "How It Works" : id === "trust" ? "Trust" : id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            </li>
          ))}
          <li><a href="/auth/login">Sign In</a></li>
        </ul>

        <div className="lp-nav-actions">
          <a href="/auth/login" className="lp-btn lp-btn-ghost" style={{ display: "none" }}>Sign In</a>
          <a href="/book" className="lp-btn lp-btn-primary">Book Now</a>
          <button
            className="lp-hamburger"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span style={{ transform: mobileMenuOpen ? "rotate(45deg) translate(5px, 5px)" : "" }} />
            <span style={{ opacity: mobileMenuOpen ? 0 : 1 }} />
            <span style={{ transform: mobileMenuOpen ? "rotate(-45deg) translate(5px, -5px)" : "" }} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`lp-mobile-menu${mobileMenuOpen ? " open" : ""}`} aria-hidden={!mobileMenuOpen}>
        {["services", "how-it-works", "trust", "providers", "pricing"].map((id) => (
          <button
            key={id}
            onClick={() => scrollToSection(id)}
            style={{ background: "none", border: "none", fontSize: "16px", color: "var(--muted-lp)", fontWeight: 500, textAlign: "left", cursor: "pointer", padding: "4px 0", fontFamily: "var(--font-body-lp)" }}
          >
            {id === "how-it-works" ? "How It Works" : id.charAt(0).toUpperCase() + id.slice(1)}
          </button>
        ))}
        <a href="/auth/login" className="lp-btn lp-btn-ghost" style={{ width: "fit-content" }}>Sign In</a>
        <a href="/book" className="lp-btn lp-btn-primary" style={{ width: "fit-content" }}>Book Now ⚡</a>
      </div>

      {/* ── HERO ── */}
      <section className="lp-hero" aria-label="Hero">
        <div className="lp-hero-bg-grid" aria-hidden="true" />
        <div className="lp-hero-bg-glow" aria-hidden="true" />

        <div className="lp-hero-left">
          <div className="lp-hero-badge">⚡ SAN ANTONIO PILOT · NOW LIVE</div>

          <h1 className="lp-hero-title">
            Fix home problems<br />
            before they <span className="accent">ruin</span><br />
            your day.
          </h1>

          <p className="lp-hero-sub">
            Book trusted local pros in minutes. Track the job live. Approve the quote. Pay only when the work is done.
          </p>

          <div className="lp-hero-ctas">
            <a href="/book" className="lp-btn lp-btn-primary lp-btn-lg">⚡ Get a pro now</a>
            <button
              className="lp-btn lp-btn-outline lp-btn-lg"
              onClick={() => scrollToSection("how-it-works")}
            >
              See how it works →
            </button>
          </div>

          <div className="lp-hero-trust-chips">
            {[
              "Verified local pros",
              "Escrow-protected payments",
              "Live job tracking",
              "San Antonio pilot",
            ].map((chip) => (
              <div className="lp-trust-chip" key={chip}>
                <span>✓</span> {chip}
              </div>
            ))}
          </div>
        </div>

        {/* Phone mockup */}
        <div className="lp-hero-right">
          <div style={{ position: "relative" }}>
            <div className="lp-float-card lp-float-card-2">
              <div className="lp-float-dot" />
              <div className="lp-float-text">
                <strong>Diego A. — En Route</strong>
                <span>ETA 22 min · Plumbing</span>
              </div>
            </div>

            <div className="lp-phone-frame" aria-label="App preview showing real-time job tracking">
              <div className="lp-phone-notch">
                <div className="lp-phone-notch-cam" />
                <div style={{ width: "24px", height: "4px", background: "#1a1a28", borderRadius: "2px" }} />
              </div>
              <div className="lp-phone-screen">
                <div className="lp-phone-status">
                  <span>9:41</span>
                  <span>⚡ VeloCity</span>
                </div>

                <div className="lp-phone-card lp-phone-alert">
                  <div className="lp-phone-alert-dot" />
                  <div className="lp-phone-alert-text">
                    <strong>🔴 LEAK DETECTED</strong>
                    Plumbing issue reported nearby — urgent
                  </div>
                </div>

                <div className="lp-phone-card" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="lp-phone-pros-badge">✅ 3 PROS NEARBY</div>
                  <div className="lp-phone-pros-text">All verified</div>
                </div>

                <div className="lp-phone-card lp-phone-match">
                  <div className="lp-phone-avatar">DA</div>
                  <div className="lp-phone-match-info">
                    <div className="lp-phone-match-name">Diego A.</div>
                    <div className="lp-phone-match-meta">⭐ 4.9 · 247 jobs · 22 min</div>
                  </div>
                  <button className="lp-phone-accept-btn">ACCEPT</button>
                </div>

                <div className="lp-phone-card">
                  <div className="lp-phone-quote-label">QUOTE APPROVAL</div>
                  <div className="lp-phone-quote-amount">$185</div>
                  <button className="lp-phone-approve-btn">
                    ✓ Approve Quote
                  </button>
                </div>

                <div className="lp-phone-card">
                  <div className="lp-phone-progress-label">
                    <span className="lp-phone-progress-text">Job in progress</span>
                    <span className="lp-phone-progress-pct">80%</span>
                  </div>
                  <div className="lp-phone-progress-bar">
                    <div className="lp-phone-progress-fill" />
                  </div>
                  <div className="lp-phone-status-text">● LIVE TRACKING ACTIVE</div>
                </div>
              </div>
            </div>

            <div className="lp-float-card lp-float-card-1">
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "linear-gradient(135deg, #c8f135, #f5a623)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", color: "#0a0a0f" }}>JT</div>
              <div className="lp-float-text">
                <strong>Job Completed ✓</strong>
                <span>AC Repair · $220 · 4.9 ⭐</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <div className="lp-marquee-wrap" aria-hidden="true">
        <div className="lp-marquee-track">
          {[1, 2].map((copy) =>
            [
              "200+ JOBS / MONTH",
              "≤ 8 MIN AVG MATCH",
              "4.9★ SERVICE RATING",
              "99.5% UPTIME",
              "10 AI AGENTS",
              "STRIPE CONNECT",
              "ZERO LEAD FEES",
              "AUDIT TRAIL",
              "SAN ANTONIO, TX",
            ].map((item) => (
              <span className="lp-marquee-item" key={`${copy}-${item}`}>
                {item}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── BOOKING SEARCH ── */}
      <section className="lp-booking-section" id="booking" aria-label="Book a service">
        <div className="lp-booking-card lp-reveal">
          <h2 className="lp-booking-title">What do you need help with?</h2>
          <p className="lp-booking-sub">Verified local pros dispatched to your door. Average match time under 8 minutes.</p>
          <div className="lp-booking-fields">
            <div className="lp-field-wrap">
              <label className="lp-field-label" htmlFor="service-type">Service Type</label>
              <select
                id="service-type"
                className="lp-field-select"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
              >
                <option value="plumbing">🔧 Plumbing</option>
                <option value="electrical">⚡ Electrical</option>
                <option value="hvac">❄️ HVAC / AC</option>
                <option value="cleaning">🧹 Cleaning</option>
                <option value="handyman">🔨 Handyman</option>
                <option value="lawn">🌿 Lawn Care</option>
              </select>
            </div>
            <div className="lp-field-wrap">
              <label className="lp-field-label" htmlFor="city-zip">City / ZIP</label>
              <input
                id="city-zip"
                type="text"
                className="lp-field-input"
                placeholder="San Antonio, TX or 78201"
                value={cityZip}
                onChange={(e) => setCityZip(e.target.value)}
              />
            </div>
            <div className="lp-field-wrap">
              <label className="lp-field-label">Urgency</label>
              <div className="lp-urgency-row">
                {(["Today", "Schedule", "Emergency"] as const).map((u) => (
                  <button
                    key={u}
                    className={`lp-urgency-btn${activeUrgency === u ? " active" : ""}${u === "Emergency" ? " emergency" : ""}`}
                    onClick={() => setActiveUrgency(u)}
                    type="button"
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <button className="lp-booking-find-btn" type="button">
              ⚡ Find available pros
            </button>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-how-section" id="how-it-works" aria-label="How it works">
        <div className="lp-section-tag">{"// HOW IT WORKS"}</div>
        <h2 className="lp-section-title">Three steps.<br /><span style={{ color: "var(--volt)" }}>One smooth experience.</span></h2>
        <p className="lp-section-sub">No phone calls. No bidding. No stress. Just tell us what you need — our AI handles the rest.</p>

        <div className="lp-how-grid">
          {HOW_STEPS.map((step, i) => (
            <div className="lp-how-card lp-reveal" key={step.num} style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="lp-how-step-num">{step.num}</div>
              <div className="lp-how-icon">{step.icon}</div>
              <div className="lp-how-agent-tag">{step.agent}</div>
              <h3 className="lp-how-title">{step.title}</h3>
              <p className="lp-how-desc">{step.desc}</p>
              <pre className="lp-how-json">{step.json}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* ── POPULAR SERVICES ── */}
      <section className="lp-services-section" id="services" aria-label="Popular services">
        <div className="lp-section-tag">{"// POPULAR SERVICES"}</div>
        <h2 className="lp-section-title">Local pros for<br /><span style={{ color: "var(--muted-lp)" }}>every home need.</span></h2>
        <p className="lp-section-sub">All providers are licensed, insured, and background-checked. Book any service today.</p>

        <div className="lp-services-grid">
          {SERVICES.map((svc, i) => (
            <div className="lp-service-card lp-reveal" key={svc.name} style={{ transitionDelay: `${i * 0.08}s` }}>
              <div className="lp-service-header">
                <div className="lp-service-avatar-wrap">
                  <ServiceArtisan s={svc} />
                </div>
                <div>
                  <div className="lp-service-name">{svc.name}</div>
                  <div className="lp-service-meta">
                    <span className="lp-service-badge">✓ VERIFIED</span>
                    <span>{svc.responseTime}</span>
                  </div>
                </div>
              </div>
              <p className="lp-service-desc">{svc.desc}</p>
              <div className="lp-service-footer">
                <span className="lp-service-price">{svc.price}</span>
                <button className="lp-service-book-btn" type="button">Book service</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHY TRUST VELOCITY ── */}
      <section className="lp-trust-section" id="trust" aria-label="Why trust VeloCity">
        <div className="lp-section-tag">{"// WHY TRUST VELOCITY"}</div>
        <h2 className="lp-section-title">Built for people who<br /><span style={{ color: "var(--volt)" }}>hate bad surprises.</span></h2>
        <p className="lp-section-sub">Six real reasons why customers trust VeloCity with their home — and their money.</p>

        <div className="lp-trust-grid">
          {TRUST_POINTS.map((tp, i) => (
            <div className="lp-trust-card lp-reveal" key={tp.title} style={{ transitionDelay: `${i * 0.08}s` }}>
              <div className="lp-trust-card-icon">{tp.icon}</div>
              <div className="lp-trust-card-body">
                <h3 className="lp-trust-card-title">{tp.title}</h3>
                <p className="lp-trust-card-desc">{tp.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LOCAL PROOF ── */}
      <section className="lp-local-section" id="local" aria-label="Local proof">
        <div className="lp-local-layout">
          <div>
            <div className="lp-section-tag">{"// LOCAL PROOF"}</div>
            <h2 className="lp-section-title">Built for San Antonio<br /><span style={{ color: "var(--volt)" }}>neighborhoods first.</span></h2>
            <p className="lp-section-sub" style={{ marginBottom: "32px" }}>We started locally by design. Deep coverage, fast response times, and pros who know your streets.</p>

            <div className="lp-map-card lp-reveal">
              <div className="lp-map-bg" aria-hidden="true" />
              <div className="lp-map-pins" aria-label="Service area map">
                {[
                  { label: "Downtown", top: "40%", left: "45%" },
                  { label: "Stone Oak", top: "15%", left: "60%" },
                  { label: "Alamo Heights", top: "50%", left: "65%" },
                  { label: "Leon Valley", top: "45%", left: "20%" },
                  { label: "Helotes", top: "25%", left: "15%" },
                ].map((pin) => (
                  <div key={pin.label} className="lp-map-pin" style={{ top: pin.top, left: pin.left }}>
                    <div className="lp-map-pin-dot" />
                    <div className="lp-map-pin-label">{pin.label}</div>
                  </div>
                ))}
              </div>
              <div className="lp-neighborhood-chips">
                {["Downtown", "Stone Oak", "Alamo Heights", "Leon Valley", "Helotes"].map((n) => (
                  <span className="lp-neighborhood-chip" key={n}>{n}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="lp-local-metrics">
            {[
              { num: "6", label: "MIN AVG MATCH TIME" },
              { num: "4.9", label: "AVERAGE RATING" },
              { num: "98%", label: "JOBS COMPLETED" },
              { num: "24/7", label: "EMERGENCY SUPPORT" },
            ].map((m, i) => (
              <div className="lp-metric-card lp-reveal" key={m.label} style={{ transitionDelay: `${i * 0.1}s` }}>
                <div className="lp-metric-num">{m.num}</div>
                <div className="lp-metric-label">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ARTISAN GALLERY ── */}
      <section className="lp-gallery-section" id="gallery" aria-label="Meet your local pros">
        <div className="lp-section-tag">{"// MEET YOUR LOCAL PROS"}</div>
        <h2 className="lp-section-title">Real people.<br /><span style={{ color: "var(--volt)" }}>Real skills.</span></h2>
        <p className="lp-section-sub">Every pro on VeloCity is verified, rated, and ready. These are some of San Antonio&apos;s best.</p>

        <div className="lp-gallery-grid">
          {ARTISANS.map((artisan, i) => (
            <div className="lp-artisan-card lp-reveal" key={artisan.name} style={{ transitionDelay: `${i * 0.08}s` }}>
              <div className="lp-artisan-portrait">
                <ArtisanPortrait artisan={artisan} />
              </div>
              <div className="lp-artisan-info">
                <div className="lp-artisan-name">{artisan.name}</div>
                <div className="lp-artisan-trade">{artisan.trade}</div>
                <div className="lp-artisan-stats">
                  <div className="lp-artisan-rating">⭐ {artisan.rating.toFixed(1)}</div>
                  <div className="lp-artisan-jobs">{artisan.jobs} jobs</div>
                  <div className="lp-artisan-city">{artisan.city}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CUSTOMER STORY ── */}
      <section className="lp-story-section" id="story" aria-label="Customer story">
        <div className="lp-section-tag">{"// CUSTOMER STORY"}</div>
        <h2 className="lp-section-title">From panic to fixed<br /><span style={{ color: "var(--volt)" }}>in one visit.</span></h2>
        <p className="lp-section-sub" style={{ marginBottom: "56px" }}>How Marisol K. went from a burst kitchen pipe at 8 AM to a fully repaired home before noon — without a single phone call.</p>

        <div className="lp-story-layout">
          <div className="lp-timeline" aria-label="Job timeline">
            {TIMELINE.map((event, i) => (
              <div className="lp-timeline-item lp-reveal" key={event.time} style={{ transitionDelay: `${i * 0.1}s` }}>
                <div className="lp-timeline-dot">{event.icon}</div>
                <div className="lp-timeline-content">
                  <div className="lp-timeline-time">{event.time}</div>
                  <div className="lp-timeline-event">{event.event}</div>
                  <div className="lp-timeline-detail">{event.detail}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="lp-story-visuals">
            <div className="lp-story-card lp-reveal">
              <div className="lp-story-card-badge panic">BEFORE</div>
              <div className="lp-story-card-label before">{"// 8:12 AM"}</div>
              <div className="lp-story-card-title">Kitchen pipe burst</div>
              <div className="lp-story-card-desc">Water spreading across the floor. Three plumbers called — no one picked up. Marisol opened VeloCity as a last resort.</div>
            </div>
            <div className="lp-story-card lp-reveal" style={{ transitionDelay: "0.15s" }}>
              <div className="lp-story-card-badge resolved">AFTER</div>
              <div className="lp-story-card-label after">{"// 10:05 AM"}</div>
              <div className="lp-story-card-title">Pipe repaired, floor dry</div>
              <div className="lp-story-card-desc">Diego arrived, assessed, quoted $185, and completed the repair in under 2 hours. Marisol approved the quote and paid in-app. No stress, no surprises.</div>
            </div>
            <div style={{ background: "var(--graphite)", border: "1px solid var(--lp-border)", borderRadius: "8px", padding: "20px 24px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--volt)", letterSpacing: "1px", marginBottom: "10px" }}>{"// MARISOL K. · 5★ REVIEW"}</div>
              <p style={{ fontSize: "14px", color: "var(--white)", fontStyle: "italic", lineHeight: 1.7 }}>
                &ldquo;I was honestly shocked. Matched in 6 minutes. Diego was professional and fast. Paid through the app. The whole thing felt almost too easy — and that&apos;s exactly what you want when your kitchen is flooding.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR PROVIDERS ── */}
      <section className="lp-providers-section" id="providers" aria-label="For providers">
        <div className="lp-providers-layout">
          <div>
            <div className="lp-section-tag">{"// FOR PROVIDERS"}</div>
            <h2 className="lp-section-title">Real jobs.<br /><span style={{ color: "var(--volt)" }}>Not expensive leads.</span></h2>
            <p className="lp-section-sub" style={{ marginBottom: "12px" }}>
              We dispatch verified, pre-qualified jobs directly to you. No bidding, no cold calls, no lead fees. Just work — and fast payouts.
            </p>

            <div className="lp-provider-stat-row">
              <div className="lp-provider-stat">
                <div className="lp-provider-stat-num">$0</div>
                <div className="lp-provider-stat-label">LEAD FEES</div>
              </div>
              <div className="lp-provider-stat">
                <div className="lp-provider-stat-num">24h</div>
                <div className="lp-provider-stat-label">PAYOUT TIME</div>
              </div>
              <div className="lp-provider-stat">
                <div className="lp-provider-stat-num">85+</div>
                <div className="lp-provider-stat-label">ACTIVE PROVIDERS</div>
              </div>
            </div>

            <div className="lp-provider-cta-wrap">
              <a href="/provider/apply" className="lp-btn lp-btn-primary lp-btn-lg">Apply as a Pro →</a>
              <p style={{ fontSize: "13px", color: "var(--muted-lp)" }}>Applications reviewed within 48 hours. Background check required.</p>
            </div>
          </div>

          <div className="lp-providers-benefits">
            {PROVIDER_BENEFITS.map((b, i) => (
              <div className="lp-benefit-item lp-reveal" key={b.title} style={{ transitionDelay: `${i * 0.07}s` }}>
                <div className="lp-benefit-icon">{b.icon}</div>
                <div>
                  <div className="lp-benefit-title">{b.title}</div>
                  <div className="lp-benefit-desc">{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI OS ── */}
      <section className="lp-aios-section" id="ai-os" aria-label="AI Operating System">
        <div className="lp-section-tag">{"// JIT AI OPERATING SYSTEM"}</div>
        <h2 className="lp-section-title">Powered quietly by<br /><span style={{ color: "var(--volt)" }}>JIT AI.</span></h2>
        <p className="lp-section-sub">10 specialized agents run every job behind the scenes — from first message to final payment. You just see the results.</p>

        <div className="lp-agents-grid">
          {AGENTS.map((agent) => (
            <div className="lp-agent-badge" key={agent.name}>
              <span className="lp-agent-badge-icon">{agent.icon}</span>
              <div>
                <div className="lp-agent-badge-name">{agent.name}</div>
                <div className="lp-agent-badge-role">{agent.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMMAND CENTER ── */}
      <section className="lp-command-section" id="command" aria-label="Command center">
        <div className="lp-section-tag">{"// COMMAND CENTER"}</div>
        <h2 className="lp-section-title" style={{ marginBottom: "48px" }}>
          Operators run everything<br /><span style={{ color: "var(--volt)" }}>from one dashboard.</span>
        </h2>

        <div className="lp-terminal lp-reveal">
          <div className="lp-terminal-bar">
            <div className="lp-terminal-dot" style={{ background: "#ef4444" }} />
            <div className="lp-terminal-dot" style={{ background: "#f59e0b" }} />
            <div className="lp-terminal-dot" style={{ background: "#22c55e" }} />
            <span className="lp-terminal-title">velocity-command-center — ops@sanantonio.velocity</span>
          </div>
          <div className="lp-terminal-body">
            <div className="lp-terminal-line">
              <span className="lp-terminal-prompt">$</span>
              <span className="lp-terminal-cmd">v·os status --region=sanantonio --live</span>
            </div>
            <div className="lp-terminal-out lp-terminal-ok">▶ V·OS ACTIVE · All 10 agents online</div>
            <div className="lp-terminal-out">Active jobs: <span className="lp-terminal-ok">48</span> · Providers online: <span className="lp-terminal-ok">23</span> · Avg response: <span className="lp-terminal-ok">6.2 min</span></div>
            <div className="lp-terminal-out lp-terminal-warn">⚠ SLA alert: Job JB-4821 approaching 30 min threshold</div>
            <div className="lp-terminal-out">MAX recommendation: Reassign to Diego A. (nearest, 4.9★)</div>
            <div className="lp-terminal-out lp-terminal-ok">✓ Reassignment executed · ETA updated to 8 min</div>
            <div className="lp-terminal-out">FINN: 3 payments pending escrow release · $842 total</div>
            <div className="lp-terminal-out lp-terminal-ok">✓ GABRIEL: All providers compliant · 0 compliance flags</div>
            <div className="lp-terminal-line" style={{ marginTop: "8px" }}>
              <span className="lp-terminal-prompt">$</span>
              <span className="lp-terminal-cmd" style={{ opacity: 0.4 }}>_</span>
            </div>
          </div>
        </div>

        <div className="lp-kpi-grid" style={{ marginTop: "32px" }}>
          {[
            { num: "48", label: "Active Jobs Today" },
            { num: "6.2m", label: "Avg Match Time" },
            { num: "4.9★", label: "Service Rating" },
            { num: "99.5%", label: "Platform Uptime" },
          ].map((kpi) => (
            <div className="lp-kpi-item" key={kpi.label}>
              <div className="lp-kpi-num">{kpi.num}</div>
              <div className="lp-kpi-label">{kpi.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AUDIENCE ── */}
      <section className="lp-audience-section" id="audience" aria-label="Who is VeloCity for">
        <div className="lp-section-tag">{"// WHO IS VELOCITY FOR?"}</div>
        <h2 className="lp-section-title" style={{ marginBottom: "48px" }}>
          Built for everyone<br /><span style={{ color: "var(--volt)" }}>in the loop.</span>
        </h2>
        <div className="lp-audience-grid">
          {AUDIENCE_CARDS.map((card, i) => (
            <div className="lp-audience-card lp-reveal" key={card.title} style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="lp-audience-icon">{card.icon}</div>
              <h3 className="lp-audience-title">{card.title}</h3>
              <p className="lp-audience-desc">{card.desc}</p>
              <ul className="lp-audience-features">
                {card.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="lp-pricing-section" id="pricing" aria-label="Pricing">
        <div className="lp-section-tag">{"// PRICING"}</div>
        <h2 className="lp-section-title" style={{ textAlign: "center", marginBottom: "12px" }}>
          Simple, transparent<br /><span style={{ color: "var(--volt)" }}>pricing.</span>
        </h2>
        <p className="lp-section-sub" style={{ textAlign: "center", margin: "0 auto 56px" }}>No hidden fees. No subscriptions. Pay only for what gets done.</p>

        <div className="lp-pricing-grid">
          {PRICING_PLANS.map((plan, i) => (
            <div
              className={`lp-pricing-card lp-reveal${plan.featured ? " featured" : ""}`}
              key={plan.role}
              style={{ transitionDelay: `${i * 0.1}s` }}
            >
              {plan.featured && <div className="lp-pricing-badge">MOST POPULAR</div>}
              <div className="lp-pricing-role">{plan.role}</div>
              <div className="lp-pricing-amount">{plan.amount}</div>
              <div className="lp-pricing-period">{plan.period}</div>
              <ul className="lp-pricing-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <button className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="lp-testimonials-section" id="testimonials" aria-label="Testimonials">
        <div className="lp-section-tag">{"// WHAT PEOPLE ARE SAYING"}</div>
        <h2 className="lp-section-title" style={{ marginBottom: "48px" }}>
          Real stories from<br /><span style={{ color: "var(--volt)" }}>real people.</span>
        </h2>
        <div className="lp-testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <div
              className={`lp-testimonial-card lp-reveal${t.featured ? " featured" : ""}`}
              key={t.name}
              style={{ transitionDelay: `${i * 0.1}s` }}
            >
              <p className="lp-testimonial-quote">{t.quote}</p>
              <div className="lp-testimonial-footer">
                <div
                  className="lp-testimonial-avatar"
                  style={{ background: t.avatarBg, color: "white" }}
                >
                  {t.avatar}
                </div>
                <div>
                  <div className="lp-testimonial-name">{t.name}</div>
                  <div className="lp-testimonial-role">{t.role}</div>
                </div>
                <div className="lp-testimonial-stars">{"⭐".repeat(t.stars)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-faq-section" id="faq" aria-label="Frequently asked questions">
        <div className="lp-section-tag">{"// FAQ"}</div>
        <h2 className="lp-section-title" style={{ textAlign: "center", marginBottom: "48px" }}>
          Common questions,<br /><span style={{ color: "var(--volt)" }}>honest answers.</span>
        </h2>

        <div className="lp-faq-wrap">
          {FAQS.map((faq, i) => (
            <div className={`lp-faq-item${faqOpenIndex === i ? " open" : ""}`} key={faq.question}>
              <button
                className="lp-faq-question"
                onClick={() => toggleFaq(i)}
                aria-expanded={faqOpenIndex === i}
              >
                <span className="lp-faq-question-text">{faq.question}</span>
                <span className="lp-faq-chevron" aria-hidden="true">⌄</span>
              </button>
              <div className="lp-faq-answer" aria-hidden={faqOpenIndex !== i}>
                {faq.answer}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="lp-final-cta-section" id="cta" aria-label="Call to action">
        <div className="lp-final-cta-glow" aria-hidden="true" />
        <div className="lp-final-cta-label">{"// GET STARTED TODAY"}</div>
        <h2 className="lp-final-cta-title">Need help today?</h2>
        <p className="lp-final-cta-sub">
          Tell us what&apos;s wrong. We&apos;ll find the right local pro — verified, insured, and on the way in minutes.
        </p>
        <div className="lp-final-cta-btns">
          <a href="/book" className="lp-btn lp-btn-primary lp-btn-lg">⚡ Book Now</a>
          <a href="/provider/apply" className="lp-btn lp-btn-outline lp-btn-lg">Become a Provider →</a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" role="contentinfo">
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <a href="/" className="lp-nav-logo" aria-label="VeloCity Home">
              <div className="lp-nav-logo-mark"><span>V</span></div>
              <span className="lp-nav-wordmark">VELO<em>CITY</em></span>
            </a>
            <p>Your one-stop platform for trusted local field service — powered by AI dispatch and 10 specialized agents.</p>
          </div>
          <div className="lp-footer-col">
            <h4>Explore</h4>
            <ul>
              <li><a href="#services">Home Services</a></li>
              <li><a href="#gallery">Meet the Pros</a></li>
              <li><a href="#local">Service Areas</a></li>
              <li><a href="#ai-os">AI Agents</a></li>
              <li><a href="#pricing">Pricing</a></li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h4>Partner Portal</h4>
            <ul>
              <li><a href="/provider/apply">Become a Provider</a></li>
              <li><a href="/provider">Provider Dashboard</a></li>
              <li><a href="#providers">For Providers</a></li>
              <li><a href="#audience">Territory Operators</a></li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h4>AI System</h4>
            <ul>
              <li><a href="#ai-os">ALICE — Intake</a></li>
              <li><a href="#ai-os">MAX — Dispatch</a></li>
              <li><a href="#ai-os">QUINN — Quotes</a></li>
              <li><a href="#ai-os">REX — Quality</a></li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h4>Support</h4>
            <ul>
              <li><a href="/help">Help Center</a></li>
              <li><a href="/contact">Contact Us</a></li>
              <li><a href="/terms">Terms of Service</a></li>
              <li><a href="/privacy">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <p>© 2026 VeloCity Field Service. All rights reserved. San Antonio, TX.</p>
          <span className="lp-footer-mono">V·OS ACTIVE · AI DISPATCH ONLINE ●</span>
        </div>
      </footer>

      {/* ── MOBILE STICKY CTA ── */}
      <div className="lp-mobile-sticky-cta" aria-label="Quick book action">
        <div className="lp-mobile-sticky-cta-inner">
          <a href="/book" className="lp-btn lp-btn-primary">⚡ Book Now →</a>
          <a href="/provider/apply" className="lp-btn lp-btn-ghost">Become a Pro</a>
        </div>
      </div>
    </div>
  );
}
