


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."artisan_onboarding_status" AS ENUM (
    'not_started',
    'profile_created',
    'services_added',
    'verification_pending',
    'verified',
    'rejected'
);


ALTER TYPE "public"."artisan_onboarding_status" OWNER TO "postgres";


CREATE TYPE "public"."artisan_verification_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."artisan_verification_status" OWNER TO "postgres";


CREATE TYPE "public"."artisan_verification_type" AS ENUM (
    'phone',
    'id',
    'manual'
);


ALTER TYPE "public"."artisan_verification_type" OWNER TO "postgres";


CREATE TYPE "public"."billing_transaction_status" AS ENUM (
    'pending',
    'completed',
    'failed',
    'cancelled'
);


ALTER TYPE "public"."billing_transaction_status" OWNER TO "postgres";


CREATE TYPE "public"."billing_transaction_type" AS ENUM (
    'booking',
    'subscription',
    'featured_listing',
    'referral_bonus'
);


ALTER TYPE "public"."billing_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."booking_status" AS ENUM (
    'pending',
    'awaiting_payment',
    'paid',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."escrow_status" AS ENUM (
    'held',
    'released',
    'refunded',
    'disputed'
);


ALTER TYPE "public"."escrow_status" OWNER TO "postgres";


CREATE TYPE "public"."featured_listing_status" AS ENUM (
    'active',
    'expired',
    'cancelled'
);


ALTER TYPE "public"."featured_listing_status" OWNER TO "postgres";


CREATE TYPE "public"."featured_listing_type" AS ENUM (
    'boost',
    'top_placement'
);


ALTER TYPE "public"."featured_listing_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_channel" AS ENUM (
    'sms',
    'in_app',
    'whatsapp',
    'email'
);


ALTER TYPE "public"."notification_channel" OWNER TO "postgres";


CREATE TYPE "public"."payment_mode" AS ENUM (
    'instant',
    'escrow'
);


ALTER TYPE "public"."payment_mode" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'initialized',
    'successful',
    'failed'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."referral_status" AS ENUM (
    'pending',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."referral_status" OWNER TO "postgres";


CREATE TYPE "public"."service_status" AS ENUM (
    'draft',
    'published',
    'archived'
);


ALTER TYPE "public"."service_status" OWNER TO "postgres";


CREATE TYPE "public"."slot_status" AS ENUM (
    'available',
    'held',
    'booked',
    'cancelled'
);


ALTER TYPE "public"."slot_status" OWNER TO "postgres";


CREATE TYPE "public"."subscription_tier" AS ENUM (
    'free',
    'pro',
    'elite'
);


ALTER TYPE "public"."subscription_tier" OWNER TO "postgres";


CREATE TYPE "public"."tenant_type" AS ENUM (
    'individual',
    'business',
    'cooperative'
);


ALTER TYPE "public"."tenant_type" OWNER TO "postgres";


CREATE TYPE "public"."user_activity_event" AS ENUM (
    'view',
    'click',
    'book',
    'repeat'
);


ALTER TYPE "public"."user_activity_event" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'super_admin',
    'tenant_admin',
    'artisan',
    'client'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_referral_rewards"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE artisan_referrals
    SET status = 'completed', reward_earned = 5000, updated_at = NOW()
    WHERE referred_artisan_id = NEW.artisan_id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."apply_referral_rewards"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_review_allowed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  booking_record bookings;
BEGIN
  SELECT * INTO booking_record FROM bookings WHERE id = NEW.booking_id;
  IF booking_record.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF booking_record.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed bookings can be reviewed';
  END IF;
  IF booking_record.client_id <> NEW.user_id AND booking_record.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Only the booking owner can review';
  END IF;
  IF booking_record.artisan_id <> NEW.artisan_id THEN
    RAISE EXCEPTION 'Review artisan does not match booking';
  END IF;
  NEW.client_id := NEW.user_id;
  NEW.tenant_id := booking_record.tenant_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assert_review_allowed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_discount_amount"("total_cents" bigint, "code" "text", "target_tenant_id" "uuid") RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  discount_row RECORD;
  discount BIGINT := 0;
BEGIN
  IF code IS NULL OR code = '' THEN
    RETURN 0;
  END IF;
  SELECT * INTO discount_row
  FROM discount_codes
  WHERE tenant_id = target_tenant_id
    AND LOWER(discount_codes.code) = LOWER(code)
    AND active
    AND starts_at <= NOW()
    AND ends_at >= NOW()
    AND (max_uses = 0 OR used_count < max_uses)
  LIMIT 1;

  IF discount_row IS NULL THEN
    RETURN 0;
  END IF;

  discount := GREATEST(0, discount_row.amount_cents);
  IF discount_row.percent_off > 0 THEN
    discount := GREATEST(0, ROUND(total_cents * discount_row.percent_off / 100.0));
  END IF;

  RETURN LEAST(discount, total_cents);
END;
$$;


ALTER FUNCTION "public"."calculate_discount_amount"("total_cents" bigint, "code" "text", "target_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_platform_fee"("amount_cents" bigint, "percent" numeric) RETURNS bigint
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  RETURN GREATEST(0, ROUND(amount_cents * COALESCE(percent, 0) / 100.0));
END;
$$;


ALTER FUNCTION "public"."calculate_platform_fee"("amount_cents" bigint, "percent" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_profile_score"("target_artisan_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  has_photo BOOLEAN;
  service_count INTEGER;
  portfolio_count INTEGER;
  window_count INTEGER;
  score NUMERIC := 0;
BEGIN
  SELECT COALESCE(profile_photo_url IS NOT NULL AND profile_photo_url <> '', false)
  INTO has_photo
  FROM artisans
  WHERE id = target_artisan_id;

  SELECT COUNT(*) INTO service_count FROM services WHERE artisan_id = target_artisan_id;
  SELECT COALESCE(JSONB_ARRAY_LENGTH(profile_media), 0) INTO portfolio_count FROM artisans WHERE id = target_artisan_id;
  SELECT COUNT(*) INTO window_count FROM availability_windows WHERE artisan_id = target_artisan_id;

  score := score + CASE WHEN has_photo THEN 25 ELSE 0 END;
  score := score + CASE WHEN service_count > 0 THEN 25 ELSE 0 END;
  score := score + CASE WHEN portfolio_count > 0 THEN 25 ELSE 0 END;
  score := score + CASE WHEN window_count > 0 THEN 25 ELSE 0 END;

  RETURN ROUND(LEAST(100, score), 2);
END;
$$;


ALTER FUNCTION "public"."calculate_profile_score"("target_artisan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_trust_score"("avg_rating" numeric, "completed_jobs" integer, "total_jobs" integer, "response_time_avg" integer, "recent_avg_rating" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  rating_score NUMERIC;
  completion_score NUMERIC;
  consistency_score NUMERIC;
  response_score NUMERIC;
BEGIN
  rating_score := LEAST(100, GREATEST(0, COALESCE(avg_rating, 0) * 20)) * 0.4;
  completion_score := CASE WHEN total_jobs > 0 THEN LEAST(100, GREATEST(0, (completed_jobs::NUMERIC / total_jobs::NUMERIC) * 100)) ELSE 0 END * 0.3;
  consistency_score := LEAST(100, GREATEST(0, COALESCE(recent_avg_rating, avg_rating, 0) * 20)) * 0.2;
  response_score := CASE
    WHEN COALESCE(response_time_avg, 0) <= 0 THEN 50
    WHEN response_time_avg <= 15 THEN 100
    WHEN response_time_avg <= 60 THEN 80
    WHEN response_time_avg <= 240 THEN 55
    ELSE 25
  END * 0.1;

  RETURN ROUND(LEAST(100, rating_score + completion_score + consistency_score + response_score), 2);
END;
$$;


ALTER FUNCTION "public"."calculate_trust_score"("avg_rating" numeric, "completed_jobs" integer, "total_jobs" integer, "response_time_avg" integer, "recent_avg_rating" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."escrow_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "payment_id" "uuid",
    "amount" bigint NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "status" "public"."escrow_status" DEFAULT 'held'::"public"."escrow_status" NOT NULL,
    "milestones" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "released_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "escrow_accounts_amount_check" CHECK (("amount" >= 0))
);


ALTER TABLE "public"."escrow_accounts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_escrow"("target_booking_id" "uuid", "target_payment_id" "uuid") RETURNS "public"."escrow_accounts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  booking_record bookings;
  payment_record payments;
  escrow_record escrow_accounts;
BEGIN
  SELECT * INTO booking_record FROM bookings WHERE id = target_booking_id;
  IF booking_record.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO payment_record FROM payments WHERE id = target_payment_id;
  IF payment_record.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  INSERT INTO escrow_accounts (tenant_id, booking_id, payment_id, amount, currency, status, milestones)
  VALUES (
    booking_record.tenant_id,
    booking_record.id,
    payment_record.id,
    COALESCE(payment_record.amount, payment_record.amount_cents),
    payment_record.currency,
    'held',
    '[{"name":"Payment secured","status":"completed"},{"name":"Work in progress","status":"active"},{"name":"Release payout","status":"pending"}]'::jsonb
  )
  ON CONFLICT (booking_id) DO UPDATE
  SET payment_id = EXCLUDED.payment_id,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency
  RETURNING * INTO escrow_record;

  RETURN escrow_record;
END;
$$;


ALTER FUNCTION "public"."create_booking_escrow"("target_booking_id" "uuid", "target_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::UUID;
$$;


ALTER FUNCTION "public"."current_user_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_system_event"("p_tenant_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_source" "text", "p_created_by" "text", "p_entity_type" "text", "p_entity_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO system_events(
    tenant_id, event_type, payload, source, created_by, entity_type, entity_id, status, dedup_key
  ) VALUES (
    p_tenant_id,
    p_event_type,
    p_payload,
    p_source,
    p_created_by,
    p_entity_type,
    p_entity_id,
    'pending',
    p_event_type || ':' || COALESCE(p_entity_type, 'system') || ':' || COALESCE(p_entity_id::TEXT, gen_random_uuid()::TEXT)
  )
  ON CONFLICT (dedup_key) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."emit_system_event"("p_tenant_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_source" "text", "p_created_by" "text", "p_entity_type" "text", "p_entity_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "slot_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "status" "public"."booking_status" DEFAULT 'pending'::"public"."booking_status" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "total_amount" bigint DEFAULT 0 NOT NULL,
    "payment_reference" "text",
    "payment_mode" "public"."payment_mode" DEFAULT 'instant'::"public"."payment_mode" NOT NULL,
    CONSTRAINT "bookings_total_amount_check" CHECK (("total_amount" >= 0))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_payment"("target_booking_id" "uuid") RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  updated bookings;
BEGIN
  UPDATE payments
  SET status = 'failed'
  WHERE booking_id = target_booking_id AND status <> 'successful';

  UPDATE bookings
  SET status = 'cancelled', cancellation_reason = COALESCE(cancellation_reason, 'Payment failed')
  WHERE id = target_booking_id AND status IN ('pending','awaiting_payment')
  RETURNING * INTO updated;

  IF updated.id IS NOT NULL THEN
    UPDATE booking_slots
    SET status = 'available', held_by_user_id = NULL, booking_id = NULL
    WHERE id = updated.slot_id;
  END IF;

  RETURN updated;
END;
$$;


ALTER FUNCTION "public"."fail_payment"("target_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("required_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT (auth.jwt() ->> 'role') = required_role;
$$;


ALTER FUNCTION "public"."has_role"("required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_booking_confirmed"("target_booking_id" "uuid") RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  updated bookings;
BEGIN
  UPDATE bookings
  SET status = CASE
      WHEN status = 'awaiting_payment' THEN 'paid'::booking_status
      ELSE status
    END
  WHERE id = target_booking_id;

  UPDATE bookings
  SET status = CASE
      WHEN status = 'paid' THEN 'confirmed'::booking_status
      WHEN status IN ('confirmed','completed') THEN status
      ELSE status
    END
  WHERE id = target_booking_id
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  UPDATE booking_slots
  SET status = 'booked'
  WHERE id = updated.slot_id AND status <> 'booked';

  RETURN updated;
END;
$$;


ALTER FUNCTION "public"."mark_booking_confirmed"("target_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_booking_in_progress"("target_booking_id" "uuid") RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  updated bookings;
BEGIN
  UPDATE bookings
  SET status = 'in_progress'
  WHERE id = target_booking_id AND status = 'awaiting_payment'
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    SELECT * INTO updated FROM bookings WHERE id = target_booking_id;
  END IF;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  UPDATE booking_slots
  SET status = 'booked'
  WHERE id = updated.slot_id AND status <> 'booked';

  RETURN updated;
END;
$$;


ALTER FUNCTION "public"."mark_booking_in_progress"("target_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_booking_paid"("target_booking_id" "uuid") RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  updated bookings;
BEGIN
  UPDATE bookings
  SET status = CASE
      WHEN status = 'awaiting_payment' THEN 'paid'::booking_status
      WHEN status IN ('paid','confirmed','completed') THEN status
      ELSE status
    END
  WHERE id = target_booking_id
  RETURNING * INTO updated;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  RETURN updated;
END;
$$;


ALTER FUNCTION "public"."mark_booking_paid"("target_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_artisan_analytics_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO artisan_analytics (artisan_id, views, clicks, bookings, last_updated)
  VALUES (
    NEW.artisan_id,
    CASE WHEN NEW.event_type = 'view' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type IN ('book','repeat') THEN 1 ELSE 0 END,
    NOW()
  )
  ON CONFLICT (artisan_id) DO UPDATE
  SET
    views = artisan_analytics.views + CASE WHEN NEW.event_type = 'view' THEN 1 ELSE 0 END,
    clicks = artisan_analytics.clicks + CASE WHEN NEW.event_type = 'click' THEN 1 ELSE 0 END,
    bookings = artisan_analytics.bookings + CASE WHEN NEW.event_type IN ('book','repeat') THEN 1 ELSE 0 END,
    last_updated = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_artisan_analytics_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_booking_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  previous_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO previous_count
  FROM bookings
  WHERE (user_id = NEW.user_id OR client_id = NEW.user_id)
    AND artisan_id = NEW.artisan_id
    AND id <> NEW.id;

  INSERT INTO user_activity (user_id, artisan_id, event_type)
  VALUES (NEW.user_id, NEW.artisan_id, CASE WHEN previous_count > 0 THEN 'repeat'::user_activity_event ELSE 'book'::user_activity_event END);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_booking_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_first_booking_completed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  completed_count INTEGER;
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> NEW.status THEN
    SELECT COUNT(*) INTO completed_count
    FROM bookings
    WHERE artisan_id = NEW.artisan_id
      AND status = 'completed'
      AND id <> NEW.id;

    IF completed_count = 0 THEN
      PERFORM emit_system_event(
        NEW.tenant_id,
        'first_booking_completed',
        row_to_json(NEW),
        TG_TABLE_NAME,
        COALESCE(auth.jwt() ->> 'sub', 'system'),
        'booking',
        NEW.id::UUID
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_first_booking_completed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_system_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO system_events (tenant_id, event_type, payload, source, created_by)
  VALUES (
    NEW.tenant_id,
    TG_ARGV[0],
    row_to_json(NEW),
    TG_TABLE_NAME,
    COALESCE(auth.jwt() ->> 'sub', 'system')
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_system_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_system_event_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  tenant UUID;
  payload JSONB;
  created_by TEXT := COALESCE(auth.jwt() ->> 'sub', 'system');
BEGIN
  IF TG_TABLE_NAME = 'artisan_referrals' THEN
    SELECT tenant_id INTO tenant FROM artisans WHERE id = NEW.referrer_id;
  ELSE
    tenant := NEW.tenant_id;
  END IF;
  payload := row_to_json(NEW);
  PERFORM emit_system_event(
    tenant,
    TG_ARGV[0],
    payload,
    TG_TABLE_NAME,
    created_by,
    TG_ARGV[1],
    NEW.id::UUID
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_system_event_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_artisan_stats_from_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM update_artisan_stats(COALESCE(NEW.artisan_id, OLD.artisan_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."refresh_artisan_stats_from_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_artisan_stats_from_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM update_artisan_stats(COALESCE(NEW.artisan_id, OLD.artisan_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."refresh_artisan_stats_from_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_popular_artisans"("result_limit" integer DEFAULT 20) RETURNS TABLE("artisan_id" "uuid", "recommendation_score" numeric, "reason" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  WITH recent_bookings AS (
    SELECT b.artisan_id, COUNT(*)::NUMERIC AS recent_jobs
    FROM bookings b
    WHERE b.created_at > NOW() - INTERVAL '30 days'
    GROUP BY b.artisan_id
  )
  SELECT
    a.id,
    ROUND(COALESCE(rb.recent_jobs, 0) * 8 + COALESCE(s.trust_score, 0) * 0.55 + COALESCE(s.total_jobs, 0) * 0.2, 2),
    'Popular right now'
  FROM artisans a
  LEFT JOIN artisan_stats s ON s.artisan_id = a.id
  LEFT JOIN recent_bookings rb ON rb.artisan_id = a.id
  ORDER BY 2 DESC, COALESCE(s.trust_score, 0) DESC
  LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."score_popular_artisans"("result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_recommended_artisans"("target_user_id" "uuid", "result_limit" integer DEFAULT 20) RETURNS TABLE("artisan_id" "uuid", "recommendation_score" numeric, "reason" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  WITH prefs AS (
    SELECT * FROM user_preferences WHERE user_id = target_user_id
  ),
  activity AS (
    SELECT
      ua.artisan_id,
      SUM(CASE ua.event_type WHEN 'view' THEN 5 WHEN 'click' THEN 8 WHEN 'book' THEN 22 WHEN 'repeat' THEN 35 ELSE 0 END)::NUMERIC AS affinity_score
    FROM user_activity ua
    WHERE ua.user_id = target_user_id
      AND ua.created_at > NOW() - INTERVAL '180 days'
    GROUP BY ua.artisan_id
  ),
  availability AS (
    SELECT bs.artisan_id, COUNT(*)::NUMERIC AS open_slots
    FROM booking_slots bs
    WHERE bs.status = 'available' AND bs.start_at > NOW()
    GROUP BY bs.artisan_id
  ),
  recent_bookings AS (
    SELECT b.artisan_id, COUNT(*)::NUMERIC AS recent_jobs
    FROM bookings b
    WHERE b.created_at > NOW() - INTERVAL '30 days'
    GROUP BY b.artisan_id
  )
  SELECT
    a.id,
    ROUND(
      COALESCE(s.trust_score, 0) * 0.42
      + LEAST(COALESCE(av.open_slots, 0) * 5, 20)
      + LEAST(COALESCE(act.affinity_score, 0), 35)
      + CASE WHEN a.category = ANY(COALESCE((SELECT preferred_categories FROM prefs), ARRAY[]::TEXT[])) THEN 12 ELSE 0 END
      + LEAST(COALESCE(rb.recent_jobs, 0) * 4, 20)
      + COALESCE(s.total_jobs, 0) * 0.12
    , 2) AS recommendation_score,
    CASE
      WHEN COALESCE(act.affinity_score, 0) >= 22 THEN 'Because you booked this artisan before'
      WHEN a.category = ANY(COALESCE((SELECT preferred_categories FROM prefs), ARRAY[]::TEXT[])) THEN 'Because you booked this category before'
      WHEN COALESCE(s.trust_score, 0) >= 75 THEN 'Highly rated near you'
      WHEN COALESCE(rb.recent_jobs, 0) > 0 THEN 'Popular right now'
      ELSE 'Recommended by quality and availability'
    END AS reason
  FROM artisans a
  LEFT JOIN artisan_stats s ON s.artisan_id = a.id
  LEFT JOIN activity act ON act.artisan_id = a.id
  LEFT JOIN availability av ON av.artisan_id = a.id
  LEFT JOIN recent_bookings rb ON rb.artisan_id = a.id
  ORDER BY
    CASE WHEN COALESCE(act.affinity_score, 0) >= 22 THEN 0 ELSE 1 END,
    recommendation_score DESC,
    COALESCE(s.trust_score, 0) DESC,
    COALESCE(s.total_jobs, 0) DESC
  LIMIT result_limit;
END;
$$;


ALTER FUNCTION "public"."score_recommended_artisans"("target_user_id" "uuid", "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_automation_rules"("target_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO automation_rules (tenant_id, name, trigger_event, conditions, action_type, config, is_active)
  VALUES
    (target_tenant_id, 'Notify artisan on booking creation', 'booking_created', '{}'::jsonb, 'send_notification', '{"channel":"in_app","user_id":"payload.artisan_user_id","title":"New booking request","body":"You have a new booking request. Respond quickly to keep your ranking strong."}'::jsonb, true),
    (target_tenant_id, 'Confirm client after payment', 'payment_successful', '{}'::jsonb, 'send_notification', '{"channel":"in_app","user_id":"payload.client_id","title":"Payment successful","body":"Your payment is successful and your booking is moving forward."}'::jsonb, true),
    (target_tenant_id, 'Request review after completion', 'booking_completed', '{}'::jsonb, 'send_notification', '{"channel":"in_app","user_id":"payload.client_id","title":"Rate your experience","body":"Please review your artisan to help quality rise across Kajola."}'::jsonb, true),
    (target_tenant_id, 'Onboarding tips', 'artisan_onboarded', '{}'::jsonb, 'send_notification', '{"channel":"in_app","user_id":"payload.user_id","title":"Complete your profile","body":"Add services, portfolio, availability, and verification to go live."}'::jsonb, true),
    (target_tenant_id, 'Artisan live notification', 'artisan_verified', '{}'::jsonb, 'send_notification', '{"channel":"in_app","user_id":"payload.user_id","title":"You are now live","body":"Your profile is verified and can appear in discovery."}'::jsonb, true),
    (target_tenant_id, 'First job boost', 'first_booking_completed', '{}'::jsonb, 'assign_featured_boost', '{"artisan_id":"payload.artisan_id","boost_value":1,"action_key":"first_job_boost"}'::jsonb, true),
    (target_tenant_id, 'Referral reward', 'referral_completed', '{}'::jsonb, 'trigger_reward', '{"referral_id":"payload.id","reward_amount":5000,"action_key":"referral_reward"}'::jsonb, true)
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."seed_default_automation_rules"("target_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_artisan_profile_score"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  artisan_id UUID;
BEGIN
  IF TG_TABLE_NAME = 'artisans' THEN
    NEW.profile_score =
      (CASE WHEN COALESCE(NEW.profile_photo_url, '') <> '' THEN 25 ELSE 0 END)
      + (CASE WHEN COALESCE(JSONB_ARRAY_LENGTH(NEW.profile_media), 0) > 0 THEN 25 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM services WHERE artisan_id = NEW.id) THEN 25 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM availability_windows WHERE artisan_id = NEW.id) THEN 25 ELSE 0 END);
    RETURN NEW;
  END IF;

  artisan_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.artisan_id
    ELSE NEW.artisan_id
  END;

  UPDATE artisans
  SET profile_score = calculate_profile_score(artisan_id), updated_at = NOW()
  WHERE id = artisan_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_artisan_profile_score"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artisan_stats" (
    "artisan_id" "uuid" NOT NULL,
    "total_jobs" integer DEFAULT 0 NOT NULL,
    "completed_jobs" integer DEFAULT 0 NOT NULL,
    "cancelled_jobs" integer DEFAULT 0 NOT NULL,
    "avg_rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "total_reviews" integer DEFAULT 0 NOT NULL,
    "response_time_avg" integer DEFAULT 0 NOT NULL,
    "trust_score" numeric(5,2) DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."artisan_stats" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_artisan_stats"("target_artisan_id" "uuid") RETURNS "public"."artisan_stats"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  stats artisan_stats;
  total_count INTEGER;
  completed_count INTEGER;
  cancelled_count INTEGER;
  rating_avg NUMERIC;
  review_count INTEGER;
  recent_avg NUMERIC;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status IN ('completed','confirmed','in_progress')),
         COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO total_count, completed_count, cancelled_count
  FROM bookings
  WHERE artisan_id = target_artisan_id;

  SELECT COALESCE(AVG(rating), 0), COUNT(*)
  INTO rating_avg, review_count
  FROM reviews
  WHERE artisan_id = target_artisan_id AND flagged_at IS NULL;

  SELECT COALESCE(AVG(rating), rating_avg)
  INTO recent_avg
  FROM (
    SELECT rating
    FROM reviews
    WHERE artisan_id = target_artisan_id AND flagged_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  ) recent_reviews;

  INSERT INTO artisan_stats (
    artisan_id,
    total_jobs,
    completed_jobs,
    cancelled_jobs,
    avg_rating,
    total_reviews,
    trust_score,
    last_updated
  )
  VALUES (
    target_artisan_id,
    total_count,
    completed_count,
    cancelled_count,
    ROUND(rating_avg, 2),
    review_count,
    calculate_trust_score(rating_avg, completed_count, total_count, 0, recent_avg),
    NOW()
  )
  ON CONFLICT (artisan_id) DO UPDATE
  SET total_jobs = EXCLUDED.total_jobs,
      completed_jobs = EXCLUDED.completed_jobs,
      cancelled_jobs = EXCLUDED.cancelled_jobs,
      avg_rating = EXCLUDED.avg_rating,
      total_reviews = EXCLUDED.total_reviews,
      trust_score = calculate_trust_score(EXCLUDED.avg_rating, EXCLUDED.completed_jobs, EXCLUDED.total_jobs, artisan_stats.response_time_avg, recent_avg),
      last_updated = NOW()
  RETURNING * INTO stats;

  RETURN stats;
END;
$$;


ALTER FUNCTION "public"."update_artisan_stats"("target_artisan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_preferences_from_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  service_category TEXT;
  avg_amount BIGINT;
  categories TEXT[];
BEGIN
  SELECT category INTO service_category FROM services WHERE id = NEW.service_id;
  SELECT COALESCE(AVG(total_amount), 0)::BIGINT INTO avg_amount
  FROM bookings
  WHERE user_id = NEW.user_id OR client_id = NEW.user_id;

  SELECT ARRAY(
    SELECT DISTINCT category
    FROM (
      SELECT services.category
      FROM bookings
      JOIN services ON services.id = bookings.service_id
      WHERE (bookings.user_id = NEW.user_id OR bookings.client_id = NEW.user_id)
        AND services.category IS NOT NULL
      ORDER BY bookings.created_at DESC
      LIMIT 10
    ) recent
  ) INTO categories;

  INSERT INTO user_preferences (user_id, preferred_categories, avg_budget, last_updated)
  VALUES (NEW.user_id, COALESCE(categories, ARRAY[]::TEXT[]), avg_amount, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET preferred_categories = EXCLUDED.preferred_categories,
      avg_budget = EXCLUDED.avg_budget,
      last_updated = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_preferences_from_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_booking_status_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('awaiting_payment','cancelled')) OR
    (OLD.status = 'awaiting_payment' AND NEW.status IN ('paid','in_progress','cancelled')) OR
    (OLD.status = 'paid' AND NEW.status = 'confirmed') OR
    (OLD.status = 'confirmed' AND NEW.status IN ('completed','cancelled')) OR
    (OLD.status = 'in_progress' AND NEW.status IN ('completed','cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid booking status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at = NOW();
  ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_booking_status_transition"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artisan_analytics" (
    "artisan_id" "uuid" NOT NULL,
    "views" bigint DEFAULT 0 NOT NULL,
    "clicks" bigint DEFAULT 0 NOT NULL,
    "bookings" bigint DEFAULT 0 NOT NULL,
    "conversion_rate" numeric(5,2) GENERATED ALWAYS AS (
CASE
    WHEN ("views" = 0) THEN (0)::numeric
    ELSE "round"(((("bookings")::numeric / ("views")::numeric) * (100)::numeric), 2)
END) STORED,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."artisan_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artisan_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "referred_artisan_id" "uuid" NOT NULL,
    "status" "public"."referral_status" DEFAULT 'pending'::"public"."referral_status" NOT NULL,
    "reward_earned" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."artisan_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artisan_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "type" "public"."artisan_verification_type" NOT NULL,
    "status" "public"."artisan_verification_status" DEFAULT 'pending'::"public"."artisan_verification_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."artisan_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."artisans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "headline" "text",
    "description" "text",
    "verified" boolean DEFAULT false NOT NULL,
    "latitude" numeric(10,6),
    "longitude" numeric(10,6),
    "address" "text",
    "city" "text",
    "state" "text",
    "country" "text",
    "rating" numeric(2,1) DEFAULT 0 NOT NULL,
    "reviews_count" integer DEFAULT 0 NOT NULL,
    "profile_media" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarding_status" "public"."artisan_onboarding_status" DEFAULT 'not_started'::"public"."artisan_onboarding_status" NOT NULL,
    "verification_score" numeric(5,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "profile_photo_url" "text",
    "profile_score" numeric(5,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."artisans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "code" "text" NOT NULL,
    "purpose" "text" DEFAULT 'login'::"text" NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."auth_otps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "action_index" integer NOT NULL,
    "action_type" "text" NOT NULL,
    "action_key" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "attempt" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."automation_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "trigger_event" "text" NOT NULL,
    "conditions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action_type" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."automation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "executed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."automation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_windows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "slot_interval_minutes" integer NOT NULL,
    "max_bookings_per_slot" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "availability_windows_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "availability_windows_max_bookings_per_slot_check" CHECK (("max_bookings_per_slot" > 0)),
    CONSTRAINT "availability_windows_slot_interval_minutes_check" CHECK (("slot_interval_minutes" > 0))
);


ALTER TABLE "public"."availability_windows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "artisan_id" "uuid",
    "booking_id" "uuid",
    "featured_listing_id" "uuid",
    "type" "public"."billing_transaction_type" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "platform_fee_cents" bigint DEFAULT 0 NOT NULL,
    "net_amount_cents" bigint DEFAULT 0 NOT NULL,
    "discount_cents" bigint DEFAULT 0 NOT NULL,
    "discount_code" "text",
    "provider" "text",
    "reference" "text" NOT NULL,
    "status" "public"."billing_transaction_status" DEFAULT 'pending'::"public"."billing_transaction_status" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_transactions_amount_cents_check" CHECK (("amount_cents" >= 0))
);


ALTER TABLE "public"."billing_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "window_id" "uuid" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "status" "public"."slot_status" DEFAULT 'available'::"public"."slot_status" NOT NULL,
    "held_by_user_id" "uuid",
    "booking_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_slots_check" CHECK (("end_at" > "start_at"))
);


ALTER TABLE "public"."booking_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "amount_cents" bigint DEFAULT 0 NOT NULL,
    "percent_off" numeric(5,2) DEFAULT 0 NOT NULL,
    "max_uses" integer DEFAULT 0 NOT NULL,
    "used_count" integer DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discount_codes_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "discount_codes_max_uses_check" CHECK (("max_uses" >= 0)),
    CONSTRAINT "discount_codes_percent_off_check" CHECK ((("percent_off" >= (0)::numeric) AND ("percent_off" <= (100)::numeric)))
);


ALTER TABLE "public"."discount_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."featured_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "type" "public"."featured_listing_type" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "public"."featured_listing_status" DEFAULT 'active'::"public"."featured_listing_status" NOT NULL,
    "purchase_reference" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "featured_listings_amount_cents_check" CHECK (("amount_cents" >= 0))
);


ALTER TABLE "public"."featured_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."migration_deployments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "environment" "text" NOT NULL,
    "migration_version" "text" NOT NULL,
    "migration_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "drift_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "backup_reference" "text",
    "commit_sha" "text",
    "error_message" "text",
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "migration_deployments_drift_status_check" CHECK (("drift_status" = ANY (ARRAY['unknown'::"text", 'clean'::"text", 'drift_detected'::"text"]))),
    CONSTRAINT "migration_deployments_environment_check" CHECK (("environment" = ANY (ARRAY['local'::"text", 'staging'::"text", 'production'::"text"]))),
    CONSTRAINT "migration_deployments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'failed'::"text", 'rolled_back'::"text"])))
);


ALTER TABLE "public"."migration_deployments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "public"."notification_channel" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operator_dashboard_cache" (
    "tenant_id" "uuid" NOT NULL,
    "metrics" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."operator_dashboard_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_reference" "text" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "paid_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "raw_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "platform_fee_cents" bigint DEFAULT 0 NOT NULL,
    "net_amount_cents" bigint DEFAULT 0 NOT NULL,
    "discount_cents" bigint DEFAULT 0 NOT NULL,
    "discount_code" "text",
    CONSTRAINT "payments_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "payments_provider_check" CHECK (("provider" = ANY (ARRAY['stripe'::"text", 'paystack'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recommendation_cache" (
    "user_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "artisans" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recommendation_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "tag" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."review_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "media" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "flagged_at" timestamp with time zone,
    "flag_reason" "text",
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_rating_range" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "duration_minutes" integer NOT NULL,
    "price_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "status" "public"."service_status" DEFAULT 'draft'::"public"."service_status" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "services_duration_minutes_check" CHECK (("duration_minutes" > 0)),
    CONSTRAINT "services_price_cents_check" CHECK (("price_cents" >= 0))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "source" "text" NOT NULL,
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "dedup_key" "text",
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."system_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "type" "public"."tenant_type" DEFAULT 'business'::"public"."tenant_type" NOT NULL,
    "subscription_tier" "public"."subscription_tier" DEFAULT 'free'::"public"."subscription_tier" NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "platform_fee_percent" numeric(5,2) DEFAULT 10 NOT NULL,
    "subscription_updated_at" timestamp with time zone
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "artisan_id" "uuid" NOT NULL,
    "event_type" "public"."user_activity_event" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "preferred_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "avg_budget" bigint,
    "latitude" numeric(10,6),
    "longitude" numeric(10,6),
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "auth_uid" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'client'::"public"."user_role" NOT NULL,
    "phone" "text" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."artisan_analytics"
    ADD CONSTRAINT "artisan_analytics_pkey" PRIMARY KEY ("artisan_id");



ALTER TABLE ONLY "public"."artisan_referrals"
    ADD CONSTRAINT "artisan_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artisan_referrals"
    ADD CONSTRAINT "artisan_referrals_referrer_id_referred_artisan_id_key" UNIQUE ("referrer_id", "referred_artisan_id");



ALTER TABLE ONLY "public"."artisan_stats"
    ADD CONSTRAINT "artisan_stats_pkey" PRIMARY KEY ("artisan_id");



ALTER TABLE ONLY "public"."artisan_verifications"
    ADD CONSTRAINT "artisan_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."artisans"
    ADD CONSTRAINT "artisans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_otps"
    ADD CONSTRAINT "auth_otps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_windows"
    ADD CONSTRAINT "availability_windows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_transactions"
    ADD CONSTRAINT "billing_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_slots"
    ADD CONSTRAINT "booking_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_codes"
    ADD CONSTRAINT "discount_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."discount_codes"
    ADD CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escrow_accounts"
    ADD CONSTRAINT "escrow_accounts_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."escrow_accounts"
    ADD CONSTRAINT "escrow_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."featured_listings"
    ADD CONSTRAINT "featured_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."migration_deployments"
    ADD CONSTRAINT "migration_deployments_environment_migration_version_key" UNIQUE ("environment", "migration_version");



ALTER TABLE ONLY "public"."migration_deployments"
    ADD CONSTRAINT "migration_deployments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_dashboard_cache"
    ADD CONSTRAINT "operator_dashboard_cache_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recommendation_cache"
    ADD CONSTRAINT "recommendation_cache_pkey" PRIMARY KEY ("user_id", "section");



ALTER TABLE ONLY "public"."review_tags"
    ADD CONSTRAINT "review_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_tags"
    ADD CONSTRAINT "review_tags_review_id_tag_key" UNIQUE ("review_id", "tag");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_events"
    ADD CONSTRAINT "system_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_uid_key" UNIQUE ("auth_uid");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "auth_otps_expires_at_idx" ON "public"."auth_otps" USING "btree" ("expires_at");



CREATE INDEX "auth_otps_phone_purpose_idx" ON "public"."auth_otps" USING "btree" ("phone", "purpose");



CREATE INDEX "idx_artisans_tenant_id" ON "public"."artisans" USING "btree" ("tenant_id");



CREATE INDEX "idx_artisans_user_id" ON "public"."artisans" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_automation_logs_action_unique" ON "public"."automation_logs" USING "btree" ("event_id", "rule_id", "action_key");



CREATE INDEX "idx_automation_logs_event_rule" ON "public"."automation_logs" USING "btree" ("event_id", "rule_id");



CREATE INDEX "idx_automation_rules_tenant_id" ON "public"."automation_rules" USING "btree" ("tenant_id");



CREATE INDEX "idx_automation_runs_status" ON "public"."automation_runs" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_automation_runs_unique_event_rule" ON "public"."automation_runs" USING "btree" ("event_id", "rule_id");



CREATE INDEX "idx_availability_windows_artisan_id" ON "public"."availability_windows" USING "btree" ("artisan_id");



CREATE INDEX "idx_booking_slots_artisan_id" ON "public"."booking_slots" USING "btree" ("artisan_id");



CREATE INDEX "idx_booking_slots_service_id" ON "public"."booking_slots" USING "btree" ("service_id");



CREATE INDEX "idx_booking_slots_start_at" ON "public"."booking_slots" USING "btree" ("start_at");



CREATE INDEX "idx_booking_slots_status" ON "public"."booking_slots" USING "btree" ("status");



CREATE INDEX "idx_bookings_artisan_id" ON "public"."bookings" USING "btree" ("artisan_id");



CREATE INDEX "idx_bookings_client_id" ON "public"."bookings" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_payment_mode" ON "public"."bookings" USING "btree" ("payment_mode");



CREATE INDEX "idx_bookings_payment_reference" ON "public"."bookings" USING "btree" ("payment_reference");



CREATE INDEX "idx_bookings_slot_id" ON "public"."bookings" USING "btree" ("slot_id");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("status");



CREATE INDEX "idx_escrow_accounts_booking_id" ON "public"."escrow_accounts" USING "btree" ("booking_id");



CREATE INDEX "idx_escrow_accounts_status" ON "public"."escrow_accounts" USING "btree" ("status");



CREATE INDEX "idx_migration_deployments_env_created" ON "public"."migration_deployments" USING "btree" ("environment", "created_at" DESC);



CREATE INDEX "idx_migration_deployments_status" ON "public"."migration_deployments" USING "btree" ("status");



CREATE INDEX "idx_notifications_channel" ON "public"."notifications" USING "btree" ("channel");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_operator_dashboard_cache_expires" ON "public"."operator_dashboard_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_payments_booking_id" ON "public"."payments" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "idx_payments_reference" ON "public"."payments" USING "btree" ("reference");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "idx_recommendation_cache_expires" ON "public"."recommendation_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_reviews_artisan_created" ON "public"."reviews" USING "btree" ("artisan_id", "created_at" DESC);



CREATE INDEX "idx_reviews_artisan_id" ON "public"."reviews" USING "btree" ("artisan_id");



CREATE INDEX "idx_reviews_booking_id" ON "public"."reviews" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "idx_reviews_one_per_booking" ON "public"."reviews" USING "btree" ("booking_id");



CREATE INDEX "idx_reviews_rating" ON "public"."reviews" USING "btree" ("rating");



CREATE INDEX "idx_services_artisan_id" ON "public"."services" USING "btree" ("artisan_id");



CREATE INDEX "idx_services_tenant_id" ON "public"."services" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_system_events_dedup_key" ON "public"."system_events" USING "btree" ("dedup_key") WHERE ("dedup_key" IS NOT NULL);



CREATE INDEX "idx_system_events_event_type" ON "public"."system_events" USING "btree" ("event_type");



CREATE INDEX "idx_system_events_status" ON "public"."system_events" USING "btree" ("status");



CREATE INDEX "idx_system_events_status_created" ON "public"."system_events" USING "btree" ("status", "created_at");



CREATE INDEX "idx_system_events_tenant_id" ON "public"."system_events" USING "btree" ("tenant_id");



CREATE INDEX "idx_user_activity_artisan_created" ON "public"."user_activity" USING "btree" ("artisan_id", "created_at" DESC);



CREATE INDEX "idx_user_activity_event" ON "public"."user_activity" USING "btree" ("event_type");



CREATE INDEX "idx_user_activity_user_created" ON "public"."user_activity" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE INDEX "idx_users_tenant_id" ON "public"."users" USING "btree" ("tenant_id");



CREATE OR REPLACE TRIGGER "apply_referral_rewards_on_booking" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."apply_referral_rewards"();



CREATE OR REPLACE TRIGGER "assert_review_allowed_trigger" BEFORE INSERT OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."assert_review_allowed"();



CREATE OR REPLACE TRIGGER "record_artisan_analytics_event_trigger" AFTER INSERT ON "public"."user_activity" FOR EACH ROW EXECUTE FUNCTION "public"."record_artisan_analytics_event"();



CREATE OR REPLACE TRIGGER "record_artisan_onboarded_event" AFTER UPDATE OF "onboarding_status" ON "public"."artisans" FOR EACH ROW WHEN ((("new"."onboarding_status" = 'profile_created'::"public"."artisan_onboarding_status") AND ("old"."onboarding_status" IS DISTINCT FROM "new"."onboarding_status"))) EXECUTE FUNCTION "public"."record_system_event_trigger"('artisan_onboarded', 'artisan');



CREATE OR REPLACE TRIGGER "record_artisan_verified_event" AFTER UPDATE OF "verified" ON "public"."artisans" FOR EACH ROW WHEN ((("new"."verified" = true) AND ("old"."verified" IS DISTINCT FROM "new"."verified"))) EXECUTE FUNCTION "public"."record_system_event_trigger"('artisan_verified', 'artisan');



CREATE OR REPLACE TRIGGER "record_booking_activity_trigger" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."record_booking_activity"();



CREATE OR REPLACE TRIGGER "record_booking_completed_event" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW WHEN ((("new"."status" = 'completed'::"public"."booking_status") AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."record_system_event_trigger"('booking_completed', 'booking');



CREATE OR REPLACE TRIGGER "record_booking_confirmed_event" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW WHEN ((("new"."status" = 'confirmed'::"public"."booking_status") AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."record_system_event_trigger"('booking_confirmed', 'booking');



CREATE OR REPLACE TRIGGER "record_booking_created_event" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."record_system_event"('booking_created');



CREATE OR REPLACE TRIGGER "record_first_booking_completed_event" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW WHEN ((("new"."status" = 'completed'::"public"."booking_status") AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."record_first_booking_completed"();



CREATE OR REPLACE TRIGGER "record_payment_created_event" AFTER INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."record_system_event"('payment_created');



CREATE OR REPLACE TRIGGER "record_payment_successful_event" AFTER UPDATE OF "status" ON "public"."payments" FOR EACH ROW WHEN ((("new"."status" = 'successful'::"public"."payment_status") AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."record_system_event_trigger"('payment_successful', 'payment');



CREATE OR REPLACE TRIGGER "record_referral_completed_event" AFTER UPDATE OF "status" ON "public"."artisan_referrals" FOR EACH ROW WHEN ((("new"."status" = 'completed'::"public"."referral_status") AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "public"."record_system_event_trigger"('referral_completed', 'artisan_referral');



CREATE OR REPLACE TRIGGER "record_review_created_event" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."record_system_event_trigger"('review_created', 'review');



CREATE OR REPLACE TRIGGER "refresh_artisan_profile_score" BEFORE INSERT OR UPDATE OF "profile_photo_url", "profile_media" ON "public"."artisans" FOR EACH ROW EXECUTE FUNCTION "public"."update_artisan_profile_score"();



CREATE OR REPLACE TRIGGER "refresh_artisan_profile_score_on_availability" AFTER INSERT OR DELETE OR UPDATE ON "public"."availability_windows" FOR EACH ROW EXECUTE FUNCTION "public"."update_artisan_profile_score"();



CREATE OR REPLACE TRIGGER "refresh_artisan_profile_score_on_services" AFTER INSERT OR DELETE OR UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_artisan_profile_score"();



CREATE OR REPLACE TRIGGER "refresh_artisan_stats_on_booking" AFTER INSERT OR UPDATE OF "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_artisan_stats_from_booking"();



CREATE OR REPLACE TRIGGER "refresh_artisan_stats_on_review" AFTER INSERT OR DELETE OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."refresh_artisan_stats_from_review"();



CREATE OR REPLACE TRIGGER "set_updated_at_artisans" BEFORE UPDATE ON "public"."artisans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_automation_rules" BEFORE UPDATE ON "public"."automation_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_automation_runs" BEFORE UPDATE ON "public"."automation_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_bookings" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_escrow_accounts" BEFORE UPDATE ON "public"."escrow_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_notifications" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_operator_dashboard_cache" BEFORE UPDATE ON "public"."operator_dashboard_cache" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_payments" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_reviews" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_services" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_slots" BEFORE UPDATE ON "public"."booking_slots" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_tenants" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_users" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_windows" BEFORE UPDATE ON "public"."availability_windows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_preferences_booking_trigger" AFTER INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_preferences_from_booking"();



CREATE OR REPLACE TRIGGER "validate_booking_status_transition_trigger" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_booking_status_transition"();



ALTER TABLE ONLY "public"."artisan_analytics"
    ADD CONSTRAINT "artisan_analytics_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artisan_referrals"
    ADD CONSTRAINT "artisan_referrals_referred_artisan_id_fkey" FOREIGN KEY ("referred_artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artisan_referrals"
    ADD CONSTRAINT "artisan_referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artisan_stats"
    ADD CONSTRAINT "artisan_stats_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artisan_verifications"
    ADD CONSTRAINT "artisan_verifications_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artisans"
    ADD CONSTRAINT "artisans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."artisans"
    ADD CONSTRAINT "artisans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."system_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."system_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_windows"
    ADD CONSTRAINT "availability_windows_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_windows"
    ADD CONSTRAINT "availability_windows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_transactions"
    ADD CONSTRAINT "billing_transactions_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_transactions"
    ADD CONSTRAINT "billing_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_transactions"
    ADD CONSTRAINT "billing_transactions_featured_listing_id_fkey" FOREIGN KEY ("featured_listing_id") REFERENCES "public"."featured_listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."billing_transactions"
    ADD CONSTRAINT "billing_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_slots"
    ADD CONSTRAINT "booking_slots_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_slots"
    ADD CONSTRAINT "booking_slots_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_slots"
    ADD CONSTRAINT "booking_slots_held_by_user_id_fkey" FOREIGN KEY ("held_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_slots"
    ADD CONSTRAINT "booking_slots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_slots"
    ADD CONSTRAINT "booking_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_slots"
    ADD CONSTRAINT "booking_slots_window_id_fkey" FOREIGN KEY ("window_id") REFERENCES "public"."availability_windows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."booking_slots"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_codes"
    ADD CONSTRAINT "discount_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escrow_accounts"
    ADD CONSTRAINT "escrow_accounts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escrow_accounts"
    ADD CONSTRAINT "escrow_accounts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."escrow_accounts"
    ADD CONSTRAINT "escrow_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."featured_listings"
    ADD CONSTRAINT "featured_listings_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."featured_listings"
    ADD CONSTRAINT "featured_listings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operator_dashboard_cache"
    ADD CONSTRAINT "operator_dashboard_cache_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recommendation_cache"
    ADD CONSTRAINT "recommendation_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_tags"
    ADD CONSTRAINT "review_tags_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_events"
    ADD CONSTRAINT "system_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_artisan_id_fkey" FOREIGN KEY ("artisan_id") REFERENCES "public"."artisans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_activity"
    ADD CONSTRAINT "user_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE "public"."artisan_analytics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "artisan_analytics_public_read" ON "public"."artisan_analytics" FOR SELECT USING (true);



CREATE POLICY "artisan_analytics_super_admin" ON "public"."artisan_analytics" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."artisan_referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "artisan_referrals_super_admin_all" ON "public"."artisan_referrals" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "artisan_referrals_tenant_isolation" ON "public"."artisan_referrals" USING ((EXISTS ( SELECT 1
   FROM "public"."artisans"
  WHERE (("artisans"."id" = "artisan_referrals"."referrer_id") AND ("artisans"."tenant_id" = "public"."current_user_tenant_id"())))));



ALTER TABLE "public"."artisan_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "artisan_stats_public_read" ON "public"."artisan_stats" FOR SELECT USING (true);



CREATE POLICY "artisan_stats_super_admin_all" ON "public"."artisan_stats" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."artisan_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "artisan_verifications_super_admin_all" ON "public"."artisan_verifications" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "artisan_verifications_tenant_isolation" ON "public"."artisan_verifications" USING ((EXISTS ( SELECT 1
   FROM "public"."artisans"
  WHERE (("artisans"."id" = "artisan_verifications"."artisan_id") AND ("artisans"."tenant_id" = "public"."current_user_tenant_id"())))));



ALTER TABLE "public"."artisans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."availability_windows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_transactions_super_admin" ON "public"."billing_transactions" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "billing_transactions_tenant_insert" ON "public"."billing_transactions" FOR INSERT WITH CHECK (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "billing_transactions_tenant_read" ON "public"."billing_transactions" FOR SELECT USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "billing_transactions_tenant_update" ON "public"."billing_transactions" FOR UPDATE USING (("tenant_id" = "public"."current_user_tenant_id"())) WITH CHECK (("tenant_id" = "public"."current_user_tenant_id"()));



ALTER TABLE "public"."booking_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discount_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discount_codes_super_admin" ON "public"."discount_codes" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "discount_codes_tenant_insert" ON "public"."discount_codes" FOR INSERT WITH CHECK (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "discount_codes_tenant_read" ON "public"."discount_codes" FOR SELECT USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "discount_codes_tenant_update" ON "public"."discount_codes" FOR UPDATE USING (("tenant_id" = "public"."current_user_tenant_id"())) WITH CHECK (("tenant_id" = "public"."current_user_tenant_id"()));



ALTER TABLE "public"."escrow_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."featured_listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "featured_listings_super_admin" ON "public"."featured_listings" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "featured_listings_tenant_insert" ON "public"."featured_listings" FOR INSERT WITH CHECK (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "featured_listings_tenant_read" ON "public"."featured_listings" FOR SELECT USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "featured_listings_tenant_update" ON "public"."featured_listings" FOR UPDATE USING (("tenant_id" = "public"."current_user_tenant_id"())) WITH CHECK (("tenant_id" = "public"."current_user_tenant_id"()));



ALTER TABLE "public"."migration_deployments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "migration_deployments_admin_read" ON "public"."migration_deployments" FOR SELECT USING (("public"."has_role"('tenant_admin'::"text") OR "public"."has_role"('super_admin'::"text")));



CREATE POLICY "migration_deployments_super_admin_all" ON "public"."migration_deployments" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operator_dashboard_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operator_dashboard_cache_admin_read" ON "public"."operator_dashboard_cache" FOR SELECT USING (("public"."has_role"('tenant_admin'::"text") OR "public"."has_role"('super_admin'::"text")));



CREATE POLICY "operator_dashboard_cache_super_admin_all" ON "public"."operator_dashboard_cache" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recommendation_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recommendation_cache_owner" ON "public"."recommendation_cache" USING (("user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"));



CREATE POLICY "recommendation_cache_super_admin" ON "public"."recommendation_cache" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."review_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "review_tags_owner_insert" ON "public"."review_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."reviews"
  WHERE (("reviews"."id" = "review_tags"."review_id") AND ("reviews"."user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid")))));



CREATE POLICY "review_tags_public_read" ON "public"."review_tags" FOR SELECT USING (true);



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_owner_insert" ON "public"."reviews" FOR INSERT WITH CHECK ((("user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid") AND (EXISTS ( SELECT 1
   FROM "public"."bookings"
  WHERE (("bookings"."id" = "reviews"."booking_id") AND ("bookings"."status" = 'completed'::"public"."booking_status") AND (("bookings"."client_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid") OR ("bookings"."user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid")))))));



CREATE POLICY "reviews_public_read" ON "public"."reviews" FOR SELECT USING (true);



CREATE POLICY "reviews_super_admin_all" ON "public"."reviews" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_admin_all" ON "public"."artisans" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."automation_rules" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."automation_runs" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."availability_windows" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."booking_slots" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."bookings" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."escrow_accounts" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."notifications" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."payments" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."services" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."system_events" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."tenants" USING ("public"."has_role"('super_admin'::"text"));



CREATE POLICY "super_admin_all" ON "public"."users" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."system_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_isolation" ON "public"."artisans" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."automation_rules" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."automation_runs" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."availability_windows" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."booking_slots" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."bookings" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."escrow_accounts" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."notifications" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."payments" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."services" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."system_events" USING (("tenant_id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."tenants" USING (("id" = "public"."current_user_tenant_id"()));



CREATE POLICY "tenant_isolation" ON "public"."users" USING (("tenant_id" = "public"."current_user_tenant_id"()));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_activity_owner_insert" ON "public"."user_activity" FOR INSERT WITH CHECK (("user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"));



CREATE POLICY "user_activity_owner_read" ON "public"."user_activity" FOR SELECT USING (("user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"));



CREATE POLICY "user_activity_super_admin" ON "public"."user_activity" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_preferences_owner" ON "public"."user_preferences" USING (("user_id" = (("auth"."jwt"() ->> 'sub'::"text"))::"uuid"));



CREATE POLICY "user_preferences_super_admin" ON "public"."user_preferences" USING ("public"."has_role"('super_admin'::"text"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_referral_rewards"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_referral_rewards"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_referral_rewards"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assert_review_allowed"() TO "anon";
GRANT ALL ON FUNCTION "public"."assert_review_allowed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_review_allowed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_discount_amount"("total_cents" bigint, "code" "text", "target_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_discount_amount"("total_cents" bigint, "code" "text", "target_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_discount_amount"("total_cents" bigint, "code" "text", "target_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_platform_fee"("amount_cents" bigint, "percent" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_platform_fee"("amount_cents" bigint, "percent" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_platform_fee"("amount_cents" bigint, "percent" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_profile_score"("target_artisan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_profile_score"("target_artisan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_profile_score"("target_artisan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_trust_score"("avg_rating" numeric, "completed_jobs" integer, "total_jobs" integer, "response_time_avg" integer, "recent_avg_rating" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_trust_score"("avg_rating" numeric, "completed_jobs" integer, "total_jobs" integer, "response_time_avg" integer, "recent_avg_rating" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_trust_score"("avg_rating" numeric, "completed_jobs" integer, "total_jobs" integer, "response_time_avg" integer, "recent_avg_rating" numeric) TO "service_role";



GRANT ALL ON TABLE "public"."escrow_accounts" TO "anon";
GRANT ALL ON TABLE "public"."escrow_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."escrow_accounts" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_escrow"("target_booking_id" "uuid", "target_payment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_escrow"("target_booking_id" "uuid", "target_payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_escrow"("target_booking_id" "uuid", "target_payment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_tenant_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."emit_system_event"("p_tenant_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_source" "text", "p_created_by" "text", "p_entity_type" "text", "p_entity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."emit_system_event"("p_tenant_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_source" "text", "p_created_by" "text", "p_entity_type" "text", "p_entity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."emit_system_event"("p_tenant_id" "uuid", "p_event_type" "text", "p_payload" "jsonb", "p_source" "text", "p_created_by" "text", "p_entity_type" "text", "p_entity_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON FUNCTION "public"."fail_payment"("target_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fail_payment"("target_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fail_payment"("target_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_booking_confirmed"("target_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_booking_confirmed"("target_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_booking_confirmed"("target_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_booking_in_progress"("target_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_booking_in_progress"("target_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_booking_in_progress"("target_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_booking_paid"("target_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_booking_paid"("target_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_booking_paid"("target_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_artisan_analytics_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_artisan_analytics_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_artisan_analytics_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_booking_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_booking_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_booking_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_first_booking_completed"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_first_booking_completed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_first_booking_completed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_system_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_system_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_system_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_system_event_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_system_event_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_system_event_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_artisan_stats_from_booking"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_artisan_stats_from_booking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_artisan_stats_from_booking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_artisan_stats_from_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_artisan_stats_from_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_artisan_stats_from_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."score_popular_artisans"("result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."score_popular_artisans"("result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."score_popular_artisans"("result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."score_recommended_artisans"("target_user_id" "uuid", "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."score_recommended_artisans"("target_user_id" "uuid", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."score_recommended_artisans"("target_user_id" "uuid", "result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_automation_rules"("target_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_automation_rules"("target_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_automation_rules"("target_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_artisan_profile_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_artisan_profile_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_artisan_profile_score"() TO "service_role";



GRANT ALL ON TABLE "public"."artisan_stats" TO "anon";
GRANT ALL ON TABLE "public"."artisan_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."artisan_stats" TO "service_role";



GRANT ALL ON FUNCTION "public"."update_artisan_stats"("target_artisan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_artisan_stats"("target_artisan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_artisan_stats"("target_artisan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_preferences_from_booking"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_preferences_from_booking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_preferences_from_booking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_booking_status_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_booking_status_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_booking_status_transition"() TO "service_role";



GRANT ALL ON TABLE "public"."artisan_analytics" TO "anon";
GRANT ALL ON TABLE "public"."artisan_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."artisan_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."artisan_referrals" TO "anon";
GRANT ALL ON TABLE "public"."artisan_referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."artisan_referrals" TO "service_role";



GRANT ALL ON TABLE "public"."artisan_verifications" TO "anon";
GRANT ALL ON TABLE "public"."artisan_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."artisan_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."artisans" TO "anon";
GRANT ALL ON TABLE "public"."artisans" TO "authenticated";
GRANT ALL ON TABLE "public"."artisans" TO "service_role";



GRANT ALL ON TABLE "public"."auth_otps" TO "anon";
GRANT ALL ON TABLE "public"."auth_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_otps" TO "service_role";



GRANT ALL ON TABLE "public"."automation_logs" TO "anon";
GRANT ALL ON TABLE "public"."automation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_rules" TO "anon";
GRANT ALL ON TABLE "public"."automation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."automation_runs" TO "anon";
GRANT ALL ON TABLE "public"."automation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."availability_windows" TO "anon";
GRANT ALL ON TABLE "public"."availability_windows" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_windows" TO "service_role";



GRANT ALL ON TABLE "public"."billing_transactions" TO "anon";
GRANT ALL ON TABLE "public"."billing_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."booking_slots" TO "anon";
GRANT ALL ON TABLE "public"."booking_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_slots" TO "service_role";



GRANT ALL ON TABLE "public"."discount_codes" TO "anon";
GRANT ALL ON TABLE "public"."discount_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_codes" TO "service_role";



GRANT ALL ON TABLE "public"."featured_listings" TO "anon";
GRANT ALL ON TABLE "public"."featured_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."featured_listings" TO "service_role";



GRANT ALL ON TABLE "public"."migration_deployments" TO "anon";
GRANT ALL ON TABLE "public"."migration_deployments" TO "authenticated";
GRANT ALL ON TABLE "public"."migration_deployments" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."operator_dashboard_cache" TO "anon";
GRANT ALL ON TABLE "public"."operator_dashboard_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."operator_dashboard_cache" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."recommendation_cache" TO "anon";
GRANT ALL ON TABLE "public"."recommendation_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."recommendation_cache" TO "service_role";



GRANT ALL ON TABLE "public"."review_tags" TO "anon";
GRANT ALL ON TABLE "public"."review_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."review_tags" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."system_events" TO "anon";
GRANT ALL ON TABLE "public"."system_events" TO "authenticated";
GRANT ALL ON TABLE "public"."system_events" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."user_activity" TO "anon";
GRANT ALL ON TABLE "public"."user_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activity" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







