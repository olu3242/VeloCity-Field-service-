"use client";
import { createContext, useContext } from "react";
import { BRAND, type Brand } from "@/config/brand";

const BrandContext = createContext<Brand>(BRAND);

export const useBrand = () => useContext(BrandContext);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  return (
    <BrandContext.Provider value={BRAND}>{children}</BrandContext.Provider>
  );
}
