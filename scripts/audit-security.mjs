#!/usr/bin/env node
/**
 * Static security and multi-tenancy audit.
 *
 * Codifies checks that have each already caught a real defect in this codebase,
 * so they run on demand and in CI rather than depending on someone thinking to
 * look:
 *
 *   tenant-inserts   — writes to a tenant-scoped table that omit tenant_id.
 *                      Those columns carry `default app.default_tenant_id()`, so
 *                      omitting the value does not fail — it silently files the
 *                      row under the default tenant. Found two such writes.
 *   fail-open-auth   — secret comparisons that short-circuit when the secret is
 *                      unset, allowing unauthenticated access. Found four.
 *   route-auth       — API routes with no authentication check at all.
 *   service-role     — service-role (RLS-bypassing) queries with no tenant
 *                      filter and no documented reason.
 *
 * Node built-ins only — no dependencies, so it runs before `npm install` if
 * needed. Exits non-zero when anything is found, for CI.
 *
 * Usage:
 *   node scripts/audit-security.mjs            # all checks
 *   node scripts/audit-security.mjs --json     # machine-readable
 *   node scripts/audit-security.mjs --check tenant-inserts
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "src/app/api");
const MIGRATION = join(ROOT, "supabase/migrations/003_tenant_demarcation.sql");

// ── helpers ───────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const rel = (f) => relative(join(ROOT, "src/app/api"), f);

/** Tables that gained a tenant_id column with a database default. */
function tenantScopedTables() {
  if (!existsSync(MIGRATION)) return new Set();
  const sql = readFileSync(MIGRATION, "utf8");
  return new Set(
    Array.from(sql.matchAll(/alter table ([a-z_]+) add column if not exists tenant_id/g)).map(
      (m) => m[1]
    )
  );
}

/**
 * Routes that are public by design. Each is listed with the reason, so an
 * addition here is a deliberate, reviewable act rather than a silent exemption.
 */
const PUBLIC_BY_DESIGN = {
  "live/route.ts": "Kubernetes liveness probe — must answer without auth",
  "ready/route.ts": "readiness probe",
  "health/route.ts": "health probe",
  "health/detailed/route.ts": "health probe",
  "auth/signout/route.ts": "sign-out clears a session; no session to check",
  "webhooks/stripe/route.ts": "authenticated by Stripe signature, not a user session",
};

const AUTH_MARKERS = [
  "auth.getUser",
  "requireAdmin",
  "requireAuth",
  "requireAdminTenant",
  "enforceRouteAccess",
  "checkPermission",
  "assertAdmin",
  "authorizeCron",
];

// ── checks ────────────────────────────────────────────────────────────────

/** Writes to a tenant-scoped table that never set tenant_id. */
function checkTenantInserts(files) {
  const scoped = tenantScopedTables();
  const findings = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");

    // .from("t").insert({ ... })
    for (const m of src.matchAll(/\.from\("([a-z_]+)"\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      const [, table, payload] = m;
      if (!scoped.has(table)) continue;
      if (!payload.includes("tenant_id")) {
        findings.push({
          file: rel(file),
          detail: `insert into '${table}' omits tenant_id — the column default files it under the default tenant`,
        });
      }
    }

    // .from("t").insert(someVariable)
    for (const m of src.matchAll(/\.from\("([a-z_]+)"\)\s*\.insert\((\w+)\)/g)) {
      const [, table, varName] = m;
      if (!scoped.has(table)) continue;
      const decl = src.match(new RegExp(`const ${varName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`));
      if (decl && !decl[1].includes("tenant_id")) {
        findings.push({
          file: rel(file),
          detail: `insert into '${table}' via '${varName}' omits tenant_id`,
        });
      }
    }
  }

  return findings;
}

/**
 * Secret comparisons that pass when the secret is unset.
 * `if (expected && supplied !== expected)` allows everything when `expected`
 * is falsy.
 */
function checkFailOpenAuth(files) {
  const findings = [];
  const patterns = [
    /if\s*\(\s*(\w+)\s*&&\s*\w+\s*!==\s*\1\s*\)/g,
    /if\s*\(\s*(\w+)\s*&&\s*\1\s*!==\s*\w+\s*\)/g,
  ];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const m of src.matchAll(pattern)) {
        findings.push({
          file: rel(file),
          detail: `fail-open guard: '${m[0]}' permits every request when '${m[1]}' is unset`,
        });
      }
    }
  }

  return findings;
}

/** API routes with no authentication check. */
function checkRouteAuth(files) {
  const findings = [];

  for (const file of files) {
    const name = rel(file);
    if (PUBLIC_BY_DESIGN[name]) continue;
    const src = readFileSync(file, "utf8");
    if (AUTH_MARKERS.some((marker) => src.includes(marker))) continue;
    findings.push({
      file: name,
      detail: "no authentication check found — add one, or record it in PUBLIC_BY_DESIGN with a reason",
    });
  }

  return findings;
}

/**
 * Service-role queries with neither tenant nor ownership scoping.
 *
 * The service-role client bypasses RLS, so a query through it needs its own
 * constraint. Two forms are acceptable:
 *
 *   tenant scoping    — .eq("tenant_id", tenantId)
 *   ownership scoping — .eq("customer_id", user.id) and similar
 *
 * Ownership scoping is not a weaker substitute: a row belonging to the
 * authenticated user is necessarily inside that user's tenant, so it implies
 * the tenant constraint and adds to it. /api/tips relies on exactly this, and
 * an earlier version of this check reported it as a finding — the route was
 * correct and the heuristic was too narrow.
 */
const OWNERSHIP_SCOPING = /\.eq\(\s*"(?:customer_id|user_id|provider_id|profile_id|actor_id|initiated_by|reviewer_id|owner_id)"\s*,\s*(?:user\.id|userId|auth\.userId)/;

function checkServiceRole(files) {
  const findings = [];

  for (const file of files) {
    const name = rel(file);
    const src = readFileSync(file, "utf8");
    if (!/getAdminClient|createAdminClient/.test(src)) continue;

    // Cron and webhook handlers legitimately operate across every tenant.
    if (name.startsWith("cron/") || name.startsWith("webhooks/")) continue;
    if (src.includes("tenant_id")) continue;
    if (OWNERSHIP_SCOPING.test(src)) continue;

    findings.push({
      file: name,
      detail:
        "uses the service-role client (bypasses RLS) with neither a tenant_id filter nor a row-ownership check against the authenticated user",
    });
  }

  return findings;
}

const CHECKS = {
  "tenant-inserts": { run: checkTenantInserts, label: "Tenant-scoped inserts missing tenant_id" },
  "fail-open-auth": { run: checkFailOpenAuth, label: "Fail-open secret comparisons" },
  "route-auth": { run: checkRouteAuth, label: "Routes without an authentication check" },
  "service-role": { run: checkServiceRole, label: "Unscoped service-role queries" },
};

// ── main ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.includes("--check") ? args[args.indexOf("--check") + 1] : null;

if (only && !CHECKS[only]) {
  console.error(`Unknown check '${only}'. Available: ${Object.keys(CHECKS).join(", ")}`);
  process.exit(2);
}

const files = walk(API_DIR);
if (files.length === 0) {
  console.error(`No route.ts files found under ${API_DIR} — run this from the repository root.`);
  process.exit(2);
}

const results = {};
let total = 0;

for (const [key, check] of Object.entries(CHECKS)) {
  if (only && key !== only) continue;
  const findings = check.run(files);
  results[key] = { label: check.label, findings };
  total += findings.length;
}

if (asJson) {
  console.log(JSON.stringify({ routesScanned: files.length, total, results }, null, 2));
  process.exit(total === 0 ? 0 : 1);
}

console.log(`\nSecurity audit — ${files.length} API routes scanned\n`);

for (const [key, { label, findings }] of Object.entries(results)) {
  if (findings.length === 0) {
    console.log(`  ✓ ${label}`);
    continue;
  }
  console.log(`  ✗ ${label} (${findings.length})`);
  for (const f of findings) console.log(`      ${f.file}\n        ${f.detail}`);
}

console.log(
  total === 0
    ? "\nClean — no findings.\n"
    : `\n${total} finding(s). Each represents a defect that has occurred in this codebase before.\n`
);

process.exit(total === 0 ? 0 : 1);
