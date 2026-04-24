import type { SubscriptionPlan } from "./db.js";

export type PricingPhase = "prelaunch" | "launch_year" | "post_ramp";

export type PricingSnapshot = {
  currency: string;
  phase: PricingPhase;
  launchDate: string;
  rampDate: string;
  rampAfterMonths: number;
  rampFactor: number;
  amounts: Record<SubscriptionPlan, number>;
};

function parseDateOnly(input: string): Date {
  const d = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    return new Date("2026-01-01T00:00:00.000Z");
  }
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function clampFactor(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return value;
}

function applyFactor(amount: number, factor: number): number {
  return Math.max(0, Math.round(amount * factor));
}

export function getPricingSnapshot(now = new Date()): PricingSnapshot {
  const launchDateRaw = process.env.LAUNCH_DATE || "2026-06-01";
  const baseMonthly = Number(process.env.BASE_MONTHLY_CENTS || 999);
  const baseYearly = Number(process.env.BASE_YEARLY_CENTS || 9900);
  const rampAfterMonths = Number(process.env.PRICING_RAMP_AFTER_MONTHS || 12);
  const rampFactor = clampFactor(Number(process.env.PRICING_RAMP_FACTOR || 1.35));
  const currency = process.env.BILLING_CURRENCY || "EUR";

  const launchDate = parseDateOnly(launchDateRaw);
  const rampDate = addMonths(launchDate, Number.isFinite(rampAfterMonths) ? Math.max(1, Math.trunc(rampAfterMonths)) : 12);

  let phase: PricingPhase = "prelaunch";
  if (now >= launchDate && now < rampDate) phase = "launch_year";
  if (now >= rampDate) phase = "post_ramp";

  const factor = phase === "post_ramp" ? rampFactor : 1;

  return {
    currency,
    phase,
    launchDate: launchDate.toISOString().slice(0, 10),
    rampDate: rampDate.toISOString().slice(0, 10),
    rampAfterMonths: Number.isFinite(rampAfterMonths) ? Math.max(1, Math.trunc(rampAfterMonths)) : 12,
    rampFactor,
    amounts: {
      monthly: applyFactor(baseMonthly, factor),
      yearly: applyFactor(baseYearly, factor)
    }
  };
}
