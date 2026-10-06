export type HouseholdMode = "single_payer" | "ledger";
export type Theme = "statement" | "peach";
export type ColorScheme = "system" | "light";
export type Role = "admin" | "member";

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface Membership {
  id: number;
  householdId: number;
  userId: number;
  role: Role;
  splitsBills: boolean;
  welcomedAt: Date | null;
  joinedAt: Date | null;
}

export interface Household {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  mode: HouseholdMode;
  theme: Theme;
  colorScheme: ColorScheme;
  timezone: string;
  askBillDate: boolean;
  billsPerPage: number;
  featureRent: boolean;
  featureTrends: boolean;
  featureBulkEmail: boolean;
  featureDocuments: boolean;
  featureWelcomeTour: boolean;
  featureThanks: boolean;
  monthlyRent: number | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  remindersEnabled: boolean;
  sendHour: number;
  firstReminderDays: number;
  urgentReminderDays: number;
  fromName: string | null;
  replyTo: string | null;
  digestEmail: string | null;
}
