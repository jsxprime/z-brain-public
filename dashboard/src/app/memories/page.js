import Badge from '@/components/Badge';

async function fetchMemories() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3090';
    const res = await fetch(`${baseUrl}/api/memories?limit=100`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.memories || [];
  } catch {
    return [];
  }
}

export default async function MemoriesPage() {
  const memories = await fetchMemories();

  return (
    <>
      <header style={{ marginBottom: 'var(--space-xl)' }}>
        <h1>Committed Memories</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {memories.length} memories committed to OpenBrain
        </p>
      </header>

      {memories.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', padding: 'var(--space-xl) 0' }}>
          No memories committed yet. Memories will appear here after the Synthesizer processes events and commits them to OpenBrain.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', maxWidth: '52rem' }}>
          {memories.map((m) => (
            <div key={m.id} style={{
              padding: 'var(--space-md)',
              borderBottom: 'var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                <Badge type={m.memory_type} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {m.source === 'zulip' ? `${m.stream} › ${m.topic}` : m.title}
                </span>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
              <p style={{ fontSize: '0.8125rem', lineHeight: 1.55, maxWidth: '65ch' }}>
                {m.extracted_content}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
