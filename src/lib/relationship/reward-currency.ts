// Unified Reward Currency — tenant-configurable point currencies, earning rules,
// and redemption catalogs. Each tenant names and controls their own reward economy.

import type { LoyaltyEventType } from "./loyalty-engine";
import type { RedemptionType } from "./loyalty-engine";

export interface RewardCurrency {
  tenantId: string;
  name: string;             // e.g. "Velocity Points"
  symbol: string;           // e.g. "VP"
  conversionValueUsd: number; // 1 unit = X USD
  expirationDays?: number;  // undefined = no expiry
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EarningRule {
  id: string;
  tenantId: string;
  eventType: LoyaltyEventType | string;
  pointsAwarded: number;
  multiplier: number;       // applied on top of pointsAwarded
  conditions?: string;      // human-readable condition description
  isActive: boolean;
  createdAt: string;
}

export interface RedemptionCatalogItem {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  pointsCost: number;
  valueUsd: number;
  type: RedemptionType;
  isActive: boolean;
  createdAt: string;
}

const CURRENCIES = new Map<string, RewardCurrency>(); // tenantId → currency
const EARNING_RULES: EarningRule[] = [];
const CATALOG: RedemptionCatalogItem[] = [];
const RULES_CAP = 500;
const CATALOG_CAP = 200;

export function configureCurrency(params: {
  tenantId: string;
  name: string;
  symbol: string;
  conversionValueUsd: number;
  expirationDays?: number;
}): RewardCurrency {
  const now = new Date().toISOString();
  const existing = CURRENCIES.get(params.tenantId);
  const currency: RewardCurrency = {
    tenantId: params.tenantId,
    name: params.name,
    symbol: params.symbol,
    conversionValueUsd: params.conversionValueUsd,
    expirationDays: params.expirationDays,
    isActive: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  CURRENCIES.set(params.tenantId, currency);
  return currency;
}

export function getCurrency(tenantId: string): RewardCurrency | null {
  return CURRENCIES.get(tenantId) ?? null;
}

export function addEarningRule(params: {
  tenantId: string;
  eventType: LoyaltyEventType | string;
  pointsAwarded: number;
  multiplier?: number;
  conditions?: string;
}): EarningRule {
  const rule: EarningRule = {
    id: `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    tenantId: params.tenantId,
    eventType: params.eventType,
    pointsAwarded: params.pointsAwarded,
    multiplier: params.multiplier ?? 1,
    conditions: params.conditions,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  if (EARNING_RULES.length >= RULES_CAP) EARNING_RULES.shift();
  EARNING_RULES.push(rule);
  return rule;
}

export function deactivateEarningRule(id: string): boolean {
  const rule = EARNING_RULES.find(r => r.id === id);
  if (!rule) return false;
  rule.isActive = false;
  return true;
}

export function getEarningRules(tenantId: string, activeOnly = true): EarningRule[] {
  return EARNING_RULES.filter(r => r.tenantId === tenantId && (!activeOnly || r.isActive));
}

export function computePointsForEvent(tenantId: string, eventType: LoyaltyEventType | string): number {
  const rules = EARNING_RULES.filter(r => r.tenantId === tenantId && r.eventType === eventType && r.isActive);
  if (!rules.length) return 0;
  return Math.round(rules.reduce((s, r) => s + r.pointsAwarded * r.multiplier, 0));
}

export function addRedemptionItem(params: {
  tenantId: string;
  name: string;
  description: string;
  pointsCost: number;
  valueUsd: number;
  type: RedemptionType;
}): RedemptionCatalogItem {
  const item: RedemptionCatalogItem = {
    id: `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ...params,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  if (CATALOG.length >= CATALOG_CAP) CATALOG.shift();
  CATALOG.push(item);
  return item;
}

export function deactivateCatalogItem(id: string): boolean {
  const item = CATALOG.find(c => c.id === id);
  if (!item) return false;
  item.isActive = false;
  return true;
}

export function getRedemptionCatalog(tenantId: string, activeOnly = true): RedemptionCatalogItem[] {
  return CATALOG.filter(c => c.tenantId === tenantId && (!activeOnly || c.isActive));
}

export function pointsToUsd(tenantId: string, points: number): number {
  const currency = CURRENCIES.get(tenantId);
  if (!currency) return 0;
  return Math.round(points * currency.conversionValueUsd * 100) / 100;
}

export function getCurrencyStats(tenantId: string) {
  const currency = CURRENCIES.get(tenantId);
  const rules = EARNING_RULES.filter(r => r.tenantId === tenantId);
  const catalog = CATALOG.filter(c => c.tenantId === tenantId);
  return {
    currency: currency ?? null,
    activeEarningRules: rules.filter(r => r.isActive).length,
    totalEarningRules: rules.length,
    activeCatalogItems: catalog.filter(c => c.isActive).length,
    totalCatalogItems: catalog.length,
  };
}
