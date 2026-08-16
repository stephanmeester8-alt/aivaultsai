export function AgentDiagram() {
  return (
    <svg
      viewBox="0 0 720 420"
      role="img"
      aria-labelledby="agent-diagram-title agent-diagram-desc"
      className="h-auto w-full text-ink"
    >
      <title id="agent-diagram-title">Five specialist agents connected through the orchestrator</title>
      <desc id="agent-diagram-desc">
        The orchestrator sits at the center and coordinates five specialist agents. Agents reason and
        delegate. They do not execute tools directly. Autonomous execution is not claimed.
      </desc>
      <g stroke="currentColor" strokeOpacity="0.22" fill="none">
        <line x1="360" y1="210" x2="130" y2="78" />
        <line x1="360" y1="210" x2="590" y2="78" />
        <line x1="360" y1="210" x2="130" y2="342" />
        <line x1="360" y1="210" x2="590" y2="342" />
        <line x1="360" y1="210" x2="360" y2="52" />
      </g>
      <AgentNode x={360} y={36} label="Research Intelligence" />
      <AgentNode x={118} y={64} label="CTO / AI Architect" />
      <AgentNode x={602} y={64} label="Product / UX" />
      <AgentNode x={118} y={328} label="Growth / Analytics" />
      <AgentNode x={602} y={328} label="Principal AI Engineer" />
      <g>
        <rect x="248" y="176" width="224" height="68" fill="#101216" stroke="#d4af77" strokeOpacity="0.7" />
        <text
          x="360"
          y="204"
          textAnchor="middle"
          fill="#d4af77"
          fontFamily="ui-monospace, monospace"
          fontSize="11"
          letterSpacing="0.16em"
        >
          ORCHESTRATOR
        </text>
        <text x="360" y="224" textAnchor="middle" fill="#9b968c" fontFamily="ui-sans-serif, system-ui" fontSize="11">
          coordinates Â· does not execute
        </text>
      </g>
    </svg>
  );
}

function AgentNode({ x, y, label }: { x: number; y: number; label: string }) {
  const width = 188;
  const height = 44;
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y}
        width={width}
        height={height}
        fill="#161a1f"
        stroke="#23272d"
      />
      <text
        x={x}
        y={y + 27}
        textAnchor="middle"
        fill="#f2efe8"
        fontFamily="ui-sans-serif, system-ui"
        fontSize="12"
      >
        {label}
      </text>
    </g>
  );
}
