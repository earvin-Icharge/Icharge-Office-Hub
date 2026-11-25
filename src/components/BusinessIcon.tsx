import { Monitor, Zap } from "lucide-react";

export type Business = "icharge" | "iscreen" | "company";

export function BusinessIcon({ business, size = 13 }: { business: Business | "all"; size?: number }) {
  if (business === "icharge") return <Zap aria-hidden size={size} fill="currentColor" strokeWidth={0} className="flex-none" />;
  if (business === "iscreen") return <Monitor aria-hidden size={size} strokeWidth={2.4} className="flex-none" />;
  return null;
}
