import EventRow from '@/components/EventRow';

async function fetchEvents() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3090';
    const res = await fetch(`${baseUrl}/api/events?limit=100`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

export default async function PipelinePage() {
  const events = await fetchEvents();

  return (
    <>
      <header style={{ marginBottom: 'var(--space-xl)' }}>
        <h1>Pipeline</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {events.length} events in queue — most recent first
        </p>
      </header>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '5rem 1fr 8rem 6rem 5.5rem',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) var(--space-md)',
        fontSize: '0.625rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        borderBottom: 'var(--border-visible)',
        marginBottom: 'var(--space-xs)',
      }}>
        <span>Source</span>
        <span>Context</span>
        <span>Sender</span>
        <span>Status</span>
        <span style={{ textAlign: 'right' }}>Time</span>
      </div>

      {events.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: 'var(--space-xl) var(--space-md)' }}>
          No events yet. Events will appear here when Zulip or Wiki.js sends webhooks.
        </p>
      ) : (
        events.map((event) => <EventRow key={event.id} event={event} />)
      )}
    </>
  );
}
