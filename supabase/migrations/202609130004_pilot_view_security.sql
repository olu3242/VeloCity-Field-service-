-- Pilot P0: make reporting views respect the querying user's grants and RLS.

alter view public.velocity_job_formula_view set (security_invoker = true);
alter view public.velocity_provider_formula_view set (security_invoker = true);
alter view public.velocity_customer_formula_view set (security_invoker = true);
alter view public.velocity_quote_formula_view set (security_invoker = true);
alter view public.velocity_payment_formula_view set (security_invoker = true);
alter view public.velocity_dispute_formula_view set (security_invoker = true);
alter view public.velocity_automation_formula_view set (security_invoker = true);
alter view public.velocity_agent_log_formula_view set (security_invoker = true);
alter view public.job_events set (security_invoker = true);
