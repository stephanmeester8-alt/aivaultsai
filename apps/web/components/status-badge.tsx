export type CapabilityStatus = "built" | "in-development" | "planned";

const STYLES: Record<CapabilityStatus, string> = {
  built: "bg-built-dim text-built",
  "in-development": "bg-developing-dim text-developing",
  planned: "bg-planned-dim text-planned",
};

const LABELS: Record<CapabilityStatus, string> = {
  built: "Built",
  "in-development": "In development",
  planned: "Planned",
};

export function StatusBadge({ status }: { status: CapabilityStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.14em] uppercase ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
