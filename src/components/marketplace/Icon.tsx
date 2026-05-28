import {
  Car,
  Hammer,
  Home,
  KeyRound,
  Layers,
  Leaf,
  LucideIcon,
  Package,
  Paintbrush,
  PanelTop,
  Plug,
  Ruler,
  Settings,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Waves,
  Wrench,
  Zap,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  Car,
  Hammer,
  Home,
  KeyRound,
  Layers,
  Leaf,
  Package,
  Paintbrush,
  PanelTop,
  Plug,
  Ruler,
  Settings,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Waves,
  Wrench,
  Zap,
};

export function MarketplaceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name] ?? Settings;
  return <Icon className={className} aria-hidden="true" />;
}
