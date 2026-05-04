// Auto-generated from Supabase schema — keep in sync with migrations

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "customer" | "provider" | "admin";
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          stripe_customer_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      providers: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          business_license: string | null;
          insurance_number: string | null;
          insurance_expiry: string | null;
          categories: string[];
          service_area_ids: string[];
          service_radius_miles: number;
          hourly_rate_cents: number | null;
          bio: string | null;
          years_experience: number;
          status: "pending" | "under_review" | "approved" | "suspended" | "rejected";
          trust_score: number;
          completed_jobs: number;
          cancellation_rate: number;
          response_time_minutes: number | null;
          stripe_account_id: string | null;
          stripe_account_status: string | null;
          is_online: boolean;
          last_location: unknown | null;
          documents: Json;
          admin_notes: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["providers"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["providers"]["Insert"]>;
      };
      jobs: {
        Row: {
          id: string;
          customer_id: string;
          provider_id: string | null;
          category: string;
          title: string;
          description: string;
          urgency: string;
          status: string;
          address_id: string | null;
          street: string | null;
          unit: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          location: unknown | null;
          preferred_date: string | null;
          preferred_time_start: string | null;
          preferred_time_end: string | null;
          scheduled_start: string | null;
          scheduled_end: string | null;
          actual_start: string | null;
          actual_end: string | null;
          photo_urls: string[];
          document_urls: string[];
          estimated_cost_cents: number | null;
          quoted_cost_cents: number | null;
          final_cost_cents: number | null;
          deposit_amount_cents: number | null;
          platform_fee_cents: number | null;
          checkin_otp: string | null;
          checkin_otp_expires_at: string | null;
          checked_in_at: string | null;
          ai_classification: Json;
          ai_match_scores: Json;
          internal_notes: string | null;
          customer_notes: string | null;
          provider_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["jobs"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
      };
      quotes: {
        Row: {
          id: string;
          job_id: string;
          provider_id: string;
          is_change_order: boolean;
          parent_quote_id: string | null;
          line_items: Json;
          subtotal_cents: number;
          tax_cents: number;
          total_cents: number;
          deposit_required_cents: number;
          notes: string | null;
          valid_until: string | null;
          approved_at: string | null;
          rejected_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["quotes"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["quotes"]["Insert"]>;
      };
      payments: {
        Row: {
          id: string;
          job_id: string;
          customer_id: string;
          provider_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_transfer_id: string | null;
          amount_cents: number;
          platform_fee_cents: number;
          provider_payout_cents: number;
          currency: string;
          status: string;
          type: string;
          metadata: Json;
          captured_at: string | null;
          payout_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payments"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      };
      disputes: {
        Row: {
          id: string;
          job_id: string;
          initiated_by: string;
          against: string;
          status: string;
          reason: string;
          description: string | null;
          evidence_urls: string[];
          resolution_notes: string | null;
          refund_amount_cents: number | null;
          ai_recommendation: Json;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["disputes"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["disputes"]["Insert"]>;
      };
      reviews: {
        Row: {
          id: string;
          job_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          response: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["reviews"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          channel: string;
          title: string;
          body: string;
          data: Json;
          is_read: boolean;
          sent_at: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      };
      agent_logs: {
        Row: {
          id: string;
          agent_name: string;
          job_id: string | null;
          user_id: string | null;
          action: string;
          input: Json;
          output: Json;
          tokens_used: number | null;
          latency_ms: number | null;
          error: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["agent_logs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["agent_logs"]["Insert"]>;
      };
      customer_addresses: {
        Row: {
          id: string;
          customer_id: string;
          label: string;
          street: string;
          unit: string | null;
          city: string;
          state: string;
          zip: string;
          country: string;
          location: unknown | null;
          is_default: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["customer_addresses"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["customer_addresses"]["Insert"]>;
      };
      provider_offers: {
        Row: {
          id: string;
          job_id: string;
          provider_id: string;
          match_score: number | null;
          ai_reasoning: string | null;
          offered_at: string;
          expires_at: string | null;
          accepted_at: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["provider_offers"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["provider_offers"]["Insert"]>;
      };
      service_areas: {
        Row: {
          id: string;
          name: string;
          city: string;
          state: string;
          zip_codes: string[];
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["service_areas"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["service_areas"]["Insert"]>;
      };
      job_status_history: {
        Row: {
          id: string;
          job_id: string;
          from_status: string | null;
          to_status: string;
          actor_id: string | null;
          actor_role: string | null;
          reason: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["job_status_history"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["job_status_history"]["Insert"]>;
      };
      subscriptions: {
        Row: {
          id: string;
          customer_id: string;
          provider_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          category: string | null;
          plan_name: string;
          interval: string;
          amount_cents: number;
          status: string;
          next_service_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["subscriptions"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
