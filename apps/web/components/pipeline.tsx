import { StatusBadge, type CapabilityStatus } from "./status-badge";

export type PipelineStage = {
  label: string;
  detail?: string;
  status?: CapabilityStatus;
};

export function Pipeline({ stages, labelledBy }: { stages: readonly PipelineStage[]; labelledBy?: string }) {
  return (
    <ol className="m-0 list-none p-0" aria-labelledby={labelledBy}>
      {stages.map((stage, index) => (
        <li key={stage.label} className="relative flex gap-4 pb-0">
          <div className="flex w-6 shrink-0 flex-col items-center">
            <span className="mt-1.5 h-2.5 w-2.5 rounded-full border border-gold bg-gold-dim" aria-hidden="true" />
            {index < stages.length - 1 ? (
              <span className="mt-1 w-px flex-1 bg-line" aria-hidden="true" />
            ) : null}
          </div>
          <div className={`min-w-0 flex-1 ${index < stages.length - 1 ? "pb-5" : "pb-0"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs tracking-[0.14em] text-ink uppercase">{stage.label}</p>
              {stage.status ? <StatusBadge status={stage.status} /> : null}
            </div>
            {stage.detail ? <p className="mt-1 text-sm leading-relaxed text-mute">{stage.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
