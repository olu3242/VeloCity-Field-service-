"use client";

import { useEffect } from "react";
import "./landing.css";

export interface LandingStats {
  activeJobsToday: number;
  completedJobs: number;
  providerCount: number;
  avgRating: number | null;
  reviewCount: number;
  categoryCount: number;
}

export interface LandingTestimonial {
  quote: string;
  rating: number;
  author: string;
  category: string;
}

const SERVICES = [
  { icon: "🔧", name: "PLUMBING REPAIR", desc: "Leaks, clogged drains, pipe repairs, faucet installs, toilet repairs, and emergency water shutoffs.", price: "FROM $75 · SAME DAY AVAILABLE" },
  { icon: "⚡", name: "ELECTRICAL", desc: "Wiring, outlets, lighting, breaker issues, panel upgrades, and EV charger installations.", price: "FROM $90 · LICENSED PROS" },
  { icon: "❄️", name: "HVAC / AC REPAIR", desc: "AC not cooling, system tune-ups, filter replacement, diagnostics, and seasonal maintenance.", price: "FROM $120 · CERTIFIED TECHS" },
  { icon: "🏠", name: "HOME CLEANING", desc: "Deep cleaning, move-in/move-out, recurring weekly or bi-weekly home cleaning services.", price: "FROM $65 · RECURRING PLANS" },
  { icon: "🔨", name: "HANDYMAN", desc: "TV mounting, furniture assembly, drywall patching, minor repairs, and general home fixes.", price: "FROM $50 · SAME DAY" },
  { icon: "🌿", name: "LAWN CARE", desc: "Mowing, edging, trimming, seasonal cleanup, leaf removal, and landscaping maintenance.", price: "FROM $60 · WEEKLY PLANS" },
];

const WHY_CARDS = [
  { num: "01", icon: "✅", title: "VERIFIED PROVIDERS", desc: "Every technician is background-checked, license-verified, and rated by real customers before joining the platform." },
  { num: "02", icon: "⚡", title: "FAST MATCHING", desc: "We connect you with the right nearby provider based on your job, location, and urgency — usually in minutes." },
  { num: "03", icon: "💰", title: "TRANSPARENT PRICING", desc: "See estimates, quotes, and change orders before any work begins. No surprise charges, ever." },
  { num: "04", icon: "📡", title: "REAL-TIME TRACKING", desc: "Watch your provider's status update live: accepted, en route, arrived, in progress, completed." },
  { num: "05", icon: "🔒", title: "SECURE PAYMENTS", desc: "Deposits, escrow holds, full payments, refunds, and payouts — all handled safely on the platform." },
  { num: "06", icon: "🛡️", title: "QUALITY YOU CAN TRUST", desc: "We track provider reliability and step in fast with a resolution team if anything goes wrong." },
];

const STEPS = [
  { num: "1", title: "Search & Select", desc: "Enter your location and choose your service category or describe your need." },
  { num: "2", title: "Get Matched", desc: "We find the best available provider near you by skill, rating, and response time." },
  { num: "3", title: "Track Live", desc: "Watch your provider's status in real time: accepted, en route, arrived, in progress." },
  { num: "4", title: "Approve & Pay", desc: "Review the quote, approve the work, and pay securely — all within the platform." },
  { num: "5", title: "Rate & Rebook", desc: "Leave a review and get reminders for recurring maintenance needs." },
];

const TRUST_ITEMS = [
  { icon: "🔒", title: "Secure Escrow", desc: "Funds held until job complete" },
  { icon: "📋", title: "Licensed & Insured", desc: "All providers verified" },
  { icon: "⚡", title: "Same-Day Available", desc: "Emergency dispatch ready" },
  { icon: "🔄", title: "Satisfaction Guarantee", desc: "We make it right" },
];

function formatStatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
  return `${n}`;
}

export function LandingPage({ stats, testimonials }: { stats: LandingStats; testimonials: LandingTestimonial[] }) {
  useEffect(() => {
    const chips = Array.from(document.querySelectorAll<HTMLElement>(".cat-chip"));
    const onChipClick = (event: Event) => {
      chips.forEach((chip) => chip.classList.remove("active"));
      (event.currentTarget as HTMLElement).classList.add("active");
    };
    chips.forEach((chip) => chip.addEventListener("click", onChipClick));

    const animated = Array.from(
      document.querySelectorAll<HTMLElement>(".service-card, .why-card, .step-item, .testimonial-card")
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            target.style.opacity = "1";
            target.style.transform = "translateY(0)";
          }
        });
      },
      { threshold: 0.1 }
    );

    animated.forEach((element) => {
      element.style.opacity = "0";
      element.style.transform = "translateY(20px)";
      element.style.transition = "opacity 0.5s ease, transform 0.5s ease";
      observer.observe(element);
    });

    return () => {
      chips.forEach((chip) => chip.removeEventListener("click", onChipClick));
      observer.disconnect();
    };
  }, []);

  const ratingLabel = stats.avgRating ? stats.avgRating.toFixed(1) : "New";
  const reviewLabel = stats.reviewCount > 0 ? `Across ${stats.reviewCount}+ reviews` : "Be one of our first reviews";

  return (
    <div className="landing-page">
      {/* NAV */}
      <nav>
        <a href="/" className="nav-logo">
          <div className="nav-logo-mark"><span>V</span></div>
          <span className="nav-wordmark">VELO<em>CITY</em></span>
        </a>
        <ul className="nav-links">
          <li><a href="#services">Home Services</a></li>
          <li><a href="/provider/apply">Providers</a></li>
          <li><a href="#trust">Service Areas</a></li>
          <li><a href="#how">How It Works</a></li>
          <li><a href="#services">Pricing</a></li>
        </ul>
        <div className="nav-actions">
          <a href="/auth/login" className="btn btn-ghost">Sign In</a>
          <a href="/book" className="btn btn-primary">Book Service</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg-grid" />
        <div className="hero-bg-glow" />

        <div className="hero-left">
          <div className="hero-badge fade-in">⚡ SAME-DAY SERVICE IN YOUR AREA</div>

          <h1 className="hero-title fade-in delay-1">
            YOUR LOCAL<br />
            <span className="accent">SERVICE,</span><br />
            <span className="line2">AT VELOCITY.</span>
          </h1>

          <p className="hero-sub fade-in delay-2">
            Book verified local professionals for plumbing, electrical, HVAC, cleaning, handyman work, and emergency home services — matched in minutes, tracked in real time.
          </p>

          <div className="hero-ctas fade-in delay-3">
            <a href="/book" className="btn btn-primary btn-lg">⚡ Book a Service</a>
            <a href="/provider/apply" className="btn btn-outline btn-lg">Become a Provider →</a>
          </div>

          <div className="hero-social fade-in delay-4">
            <span className="hero-social-label">Continue with</span>
            <div className="social-btns">
              <a href="/auth/login" className="social-btn">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </a>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="hero-card-stack">
            <div className="float-card float-card-2">
              <div className="float-dot" />
              <div className="float-text">
                <strong>Marcus R. — En Route</strong>
                <span>ETA 12 min · Plumbing</span>
              </div>
            </div>

            <div className="search-panel">
              <p className="search-panel-title">BOOK A SERVICE</p>

              <div className="search-input-wrap">
                <span className="search-icon">📍</span>
                <input type="text" className="search-input" placeholder="City, area, ZIP code, or service need" />
              </div>

              <div className="category-grid">
                <div className="cat-chip active"><span className="cat-chip-icon">🔧</span> Plumbing</div>
                <div className="cat-chip"><span className="cat-chip-icon">⚡</span> Electrical</div>
                <div className="cat-chip"><span className="cat-chip-icon">❄️</span> HVAC / AC</div>
                <div className="cat-chip"><span className="cat-chip-icon">🏠</span> Cleaning</div>
                <div className="cat-chip"><span className="cat-chip-icon">🔨</span> Handyman</div>
                <div className="cat-chip"><span className="cat-chip-icon">🌿</span> Lawn Care</div>
              </div>

              <a href="/book" className="btn-book">⚡ Find Providers Near Me</a>
            </div>

            <div className="float-card float-card-1">
              <div className="float-avatar">JT</div>
              <div className="float-text">
                <strong>Job Completed ✓</strong>
                <span>AC Repair · $220 · 4.9 ⭐</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS — live platform data */}
      <div className="stats-bar">
        <div className="stat-item">
          <div className="stat-number">{stats.activeJobsToday}</div>
          <div className="stat-label">Active Jobs Today</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{stats.categoryCount}</div>
          <div className="stat-label">Service Categories</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{stats.providerCount}+</div>
          <div className="stat-label">Verified Providers</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{formatStatNumber(stats.completedJobs)}</div>
          <div className="stat-label">Completed Services</div>
        </div>
      </div>

      {/* FEATURED SERVICES */}
      <section id="services" className="section services">
        <div className="section-header">
          <div className="section-tag">{"// SERVICES"}</div>
          <h2 className="section-title">Featured Services<br /><span style={{ color: "var(--muted)" }}>Near You</span></h2>
          <p className="section-sub">Professional, verified, and ready to help — usually the same day you ask.</p>
        </div>
        <div className="services-grid">
          {SERVICES.map((service) => (
            <div className="service-card" key={service.name}>
              <div className="service-icon">{service.icon}</div>
              <div className="service-arrow">↗</div>
              <div className="service-name">{service.name}</div>
              <div className="service-desc">{service.desc}</div>
              <div className="service-price">{service.price}</div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY VELOCITY */}
      <section className="section why">
        <div className="section-header">
          <div className="section-tag">{"// WHY CHOOSE US"}</div>
          <h2 className="section-title">Why Choose<br /><span style={{ color: "var(--volt)" }}>VeloCity?</span></h2>
          <p className="section-sub">We make local field service fast, trusted, trackable, and stress-free.</p>
        </div>
        <div className="why-grid">
          {WHY_CARDS.map((card) => (
            <div className="why-card" key={card.title}>
              <div className="why-num">{card.num}</div>
              <div className="why-icon">{card.icon}</div>
              <div className="why-title">{card.title}</div>
              <div className="why-desc">{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS — visual flow, replaces internal-system explanation */}
      <section id="how" className="section how">
        <div className="section-header">
          <div className="section-tag">{"// HOW IT WORKS"}</div>
          <h2 className="section-title">From Request to<br /><span style={{ color: "var(--volt)" }}>Completion</span></h2>
        </div>
        <div className="steps-row">
          {STEPS.map((step) => (
            <div className="step-item" key={step.num}>
              <div className="step-num">{step.num}</div>
              <div className="step-title">{step.title}</div>
              <div className="step-desc">{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS — only renders with real, public reviews */}
      {testimonials.length > 0 && (
        <section id="trust" className="section testimonials">
          <div className="section-header">
            <div className="section-tag">{"// CUSTOMER REVIEWS"}</div>
            <h2 className="section-title">What Customers<br /><span style={{ color: "var(--volt)" }}>Are Saying</span></h2>
          </div>
          <div className="testimonial-grid">
            {testimonials.map((t, i) => (
              <div className="testimonial-card" key={i}>
                <div className="testimonial-stars">{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</div>
                <p className="testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{t.author.slice(0, 1)}</div>
                  <div>
                    <strong>{t.author}</strong>
                    <span>{t.category} customer</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TRUST BAR */}
      <div className="trust" style={{ padding: "48px 80px" }}>
        <div className="trust-inner">
          {TRUST_ITEMS.map((item) => (
            <div className="trust-item" key={item.title}>
              <div className="trust-icon">{item.icon}</div>
              <div className="trust-text"><strong>{item.title}</strong><span>{item.desc}</span></div>
            </div>
          ))}
          <div className="trust-item">
            <div className="trust-icon">🌟</div>
            <div className="trust-text"><strong>{ratingLabel} Avg Rating</strong><span>{reviewLabel}</span></div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-glow" />
        <div className="section-tag" style={{ marginBottom: 24 }}>{"// GET STARTED TODAY"}</div>
        <h2 className="section-title">Ready for <span style={{ color: "var(--volt)" }}>Velocity?</span></h2>
        <p className="section-sub">Join the customers and providers using VeloCity for local field service, done right.</p>
        <div className="cta-btns">
          <a href="/book" className="btn btn-primary btn-lg">⚡ Book Your First Service</a>
          <a href="/provider/apply" className="btn btn-outline btn-lg">Become a Provider →</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-top">
          <div className="footer-brand">
            <a href="/" className="nav-logo" style={{ marginBottom: 0 }}>
              <div className="nav-logo-mark"><span>V</span></div>
              <span className="nav-wordmark">VELO<em>CITY</em></span>
            </a>
            <p>The fastest way to get trusted help for your home, from booking to payment.</p>
          </div>
          <div className="footer-col">
            <h4>Explore</h4>
            <ul>
              <li><a href="#services">Home Services</a></li>
              <li><a href="/provider/apply">Providers</a></li>
              <li><a href="#trust">Service Areas</a></li>
              <li><a href="#how">How It Works</a></li>
              <li><a href="#services">Pricing</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Partner Portal</h4>
            <ul>
              <li><a href="/provider/apply">Become a Provider</a></li>
              <li><a href="/provider/dashboard">Provider Dashboard</a></li>
              <li><a href="/provider/apply">Business Solutions</a></li>
              <li><a href="/provider/apply">Territory Operators</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="/">About Us</a></li>
              <li><a href="/provider/apply">Careers</a></li>
              <li><a href="/book">Get Started</a></li>
              <li><a href="/auth/login">Sign In</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Support</h4>
            <ul>
              <li><a href="/dashboard">Help Center</a></li>
              <li><a href="/dashboard">Contact Us</a></li>
              <li><a href="/">Terms of Service</a></li>
              <li><a href="/">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 VeloCity Field Service. All rights reserved.</p>
          <span className="footer-mono">● {stats.activeJobsToday} jobs in progress now</span>
        </div>
      </footer>
    </div>
  );
}
