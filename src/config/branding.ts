import { env } from "@/config/env";
import { velocityBrand as baseBrand } from "@/config/brand";

export const velocityBrand = {
  ...baseBrand,
  appUrl: env.appUrl,
} as const;

export type VelocityBrand = typeof velocityBrand;
