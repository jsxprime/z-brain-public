import StatusIndicator from '@/components/StatusIndicator';

async function fetchStats() {
  try {
    // In production (Docker), use internal URL; in dev, use localhost
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3090';
    const res = await fetch(`${baseUrl}/api/stats`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function OverviewPage() {
  const stats = await fetchStats();

  return (
    <>
      <header style={{ marginBottom: '2.5rem' }}>
        <h1>Ecosystem Overview</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          Memory Synthesizer pipeline health and service status
        </p>
      </header>

      {/* Service Status Row */}
      <section style={{ display: 'flex', gap: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
        <div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>OpenBrain</div>
          <StatusIndicator status={stats?.services?.openbrain?.status || 'error'} />
        </div>
        <div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>Hermes Agent</div>
          <StatusIndicator status={stats?.services?.hermes?.status || 'error'} />
        </div>
        <div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>Synthesizer</div>
          <StatusIndicator status={stats?.services?.synthesizer?.status || 'error'} />
        </div>
      </section>

      {/* Queue Stats */}
      <section style={{ marginBottom: 'var(--space-2xl)' }}>
        <h2 style={{ marginBottom: 'var(--space-lg)' }}>Pipeline Queue</h2>
        <div style={{ display: 'flex', gap: 'var(--space-xl)' }}>
          {['pending', 'processing', 'completed', 'failed'].map((key) => (
            <div key={key}>
              <div style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: key === 'failed' ? 'var(--status-error)' : 'var(--text-primary)' }}>
                {stats?.queue?.[key] ?? '—'}
              </div>
              <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
                {key}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Memory Stats */}
      <section>
        <h2 style={{ marginBottom: 'var(--space-lg)' }}>Memories</h2>
        <div style={{ display: 'flex', gap: 'var(--space-xl)' }}>
          <div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
              {stats?.memories?.committed ?? '—'}
            </div>
            <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
              Committed
            </div>
          </div>
          <div>
            <div style={{ fontSize: '1.75rem', fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--status-warn)' }}>
              {stats?.memories?.quarantined_pending ?? '—'}
            </div>
            <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 'var(--space-xs)' }}>
              Quarantined
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
