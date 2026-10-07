import type { Feature } from "@/lib/features";

// The settings form's shape and limits, shared by the client form and lib/settings.ts (which
// the client can't import: it reaches the database through lib/auth).

export const BILLS_PER_PAGE = [10, 20, 30, 50] as const;
export const NAME_MAX = 80;
export const TAGLINE_MAX = 60;

/** The form's raw fields, echoed back on an error so nothing typed is lost. */
export interface SettingsForm {
  name: string;
  tagline: string;
  mode: string;
  payerId: string;
  theme: string;
  colorScheme: string;
  features: Record<Feature, boolean>;
  monthlyRent: string;
  leaseStart: string;
  leaseEnd: string;
  askBillDate: boolean;
  billsPerPage: string;
  remindersEnabled: boolean;
  sendHour: string;
  firstReminderDays: string;
  urgentReminderDays: string;
  timezone: string;
  fromName: string;
  replyTo: string;
  digestEmail: string;
}

