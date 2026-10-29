import { Wrench } from "lucide-react";
import { cn } from "@/lib/format";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", light ? "text-white" : "text-slate-900", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white">
        <Wrench className="h-4 w-4" />
      </span>
      <span>
        Workshop<span className="text-orange-500">POS</span>
      </span>
    </span>
  );
}
