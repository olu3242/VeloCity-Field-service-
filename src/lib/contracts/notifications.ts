/**
 * VeloCity Contracts — Notification Types
 *
 * Canonical type definitions for the notification system.
 * Used by: notifications API, notification-bell component, handler files that
 * insert into the notifications table.
 */

// ── Notification types ────────────────────────────────────────────────────────

/**
 * All supported notification categories.
 * These values are stored in notifications.type and used by the bell to select icons.
 */
export type NotificationType =
  | "job_update"
  | "provider_matched"
  | "quote_ready"
  | "payment_captured"
  | "dispute_opened"
  | "tip_received"
  | "review_nudge"
  | "sla_breach"
  | "payout_released"
  | "payout_failed"
  | "provider_approved"
  | "provider_suspended";

/**
 * Delivery channels for a notification.
 * Currently only in_app is fully implemented; others are planned for Wave 5.
 */
export type NotificationChannel = "in_app" | "email" | "sms" | "push";

// ── Notification payload (for insert) ────────────────────────────────────────

/**
 * Shape of the data required to create a notification.
 * Passed to handlers that write to the notifications table.
 */
export interface NotificationPayload {
  /** The user receiving this notification */
  user_id: string;

  /** Notification category — used for icon selection and filtering */
  type: NotificationType;

  /** Human-readable message shown in the bell dropdown */
  message: string;

  /** Optional job ID — if set, clicking the notification navigates to the job */
  job_id?: string;

  /** Additional event-specific data (not shown in UI) */
  metadata?: Record<string, unknown>;
}

// ── Notification row (for read) ───────────────────────────────────────────────

/**
 * Shape of a row returned from the notifications table.
 * Matches what the NotificationBell component and GET /api/notifications return.
 */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  message: string;
  /** True if the user has acknowledged this notification */
  read: boolean;
  created_at: string;
  job_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

// ── API response shapes ───────────────────────────────────────────────────────

/**
 * Response shape for GET /api/notifications
 */
export interface NotificationsGetResponse {
  data: NotificationRow[];
}

/**
 * Request body for PATCH /api/notifications
 */
export interface NotificationsPatchRequest {
  /** If true, mark all notifications for the current user as read */
  mark_all_read?: boolean;
  /** Specific notification ID to mark as read */
  id?: string;
}
