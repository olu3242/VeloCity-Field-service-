export const BRAND = {
  name: "VeloCity",
  tagline: "Field service, delivered at velocity.",
  shortTagline: "At velocity.",
  logoMark: "⚡",
  url: "https://velocityfs.com",
  support: "support@velocityfs.com",
  social: {
    twitter: "@velocityfs",
  },
} as const;

export type Brand = typeof BRAND;
