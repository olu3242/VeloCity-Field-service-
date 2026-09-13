-- Fix mutable function resolution for application-owned functions.

alter function public.update_updated_at() set search_path = pg_catalog, public, app;
alter function public.log_job_status_change() set search_path = pg_catalog, public, app;
alter function public.update_provider_trust_score(uuid) set search_path = pg_catalog, public, app;
alter function public.update_automation_rules_updated_at() set search_path = pg_catalog, public, app;
alter function public.update_provider_tips_updated_at() set search_path = pg_catalog, public, app;

alter function app.touch_updated_at() set search_path = pg_catalog, public, app;
alter function app.prevent_invalid_job_transition() set search_path = pg_catalog, public, app;
alter function app.prevent_provider_approval_without_documents() set search_path = pg_catalog, public, app;
alter function app.freeze_payout_on_dispute() set search_path = pg_catalog, public, app;
alter function app.prevent_payout_release_during_dispute() set search_path = pg_catalog, public, app;
