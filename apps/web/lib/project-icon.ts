import {
  Landmark,
  ShoppingBag,
  TrendingUp,
  ShieldAlert,
  Settings2,
  MonitorSmartphone,
  Zap,
  HeartPulse,
  Factory,
  Plane,
  GraduationCap,
  FlaskConical,
  Folder,
  type LucideIcon,
} from "lucide-react";

/**
 * Map a Tableau project (or industry) name to a Lucide icon by keyword.
 * Single source of truth for the sidebar tree and the dashboard library —
 * keyword → icon per DESIGN v2 §1.5. Case-insensitive; falls back to Folder.
 */
export function projectIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("banking") || n.includes("financial")) return Landmark;
  if (n.includes("retail")) return ShoppingBag;
  if (n.includes("sales")) return TrendingUp;
  if (n.includes("risk")) return ShieldAlert;
  if (n.includes("operation")) return Settings2;
  if (n.includes("digital")) return MonitorSmartphone;
  if (n.includes("energy") || n.includes("evn") || n.includes("power")) return Zap;
  if (n.includes("health")) return HeartPulse;
  if (n.includes("manufactur")) return Factory;
  if (n.includes("airline") || n.includes("transport")) return Plane;
  if (n.includes("education")) return GraduationCap;
  if (n.includes("demo") || n.includes("sample")) return FlaskConical;
  return Folder;
}
