export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? ' brand--compact' : ''}`}>
      <img className="brand__logo" src="/lux-ai-logo.png" alt="LUX AI" width="2172" height="724" />
      {!compact ? (
        <span className="brand__product">
          <strong>
            HealthWallet <span>Liberia</span>
          </strong>
          <small>Powered by LUX HealthTrust</small>
        </span>
      ) : null}
    </span>
  );
}
