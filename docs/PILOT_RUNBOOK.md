# Controlled pilot runbook

The pilot gate certifies one customer, one approved provider, and one tenant admin against staging. It does not authorize production traffic.

## 1. Deploy and migrate

Deploy the candidate branch to an HTTPS staging URL. Apply migrations through `202609130004_pilot_view_security.sql` to the staging Supabase project only.

## 2. Provision the cohort

Set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a unique `PILOT_PASSWORD` of at least 16 characters. Confirm the URL is the staging project, then run:

```bash
npm run pilot:provision
```

The provisioner is idempotent for users and core profiles. Never use the pilot password in production or commit it to git.

## 3. Configure certification

Set GitHub staging environment variables `PILOT_BASE_URL`, `PILOT_CUSTOMER_EMAIL`, `PILOT_PROVIDER_EMAIL`, and `PILOT_ADMIN_EMAIL`. Store `PILOT_PASSWORD` as a staging environment secret.

Run the `Certification` workflow manually. It verifies anonymous isolation, customer booking and outcome creation, provider role isolation, and admin launch-readiness access.

## 4. Go/no-go rule

Go for a controlled internal pilot only when application CI and the manual pilot E2E job both pass, `npm audit --omit=dev` reports zero vulnerabilities, Supabase security advisors have no unresolved app-owned error findings, and Stripe remains in test mode. Extension-owned PostGIS findings must be documented separately rather than changed blindly. Any failed gate is a no-go until rerun successfully.
