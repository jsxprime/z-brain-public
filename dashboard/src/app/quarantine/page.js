'use client';

import { useState, useEffect } from 'react';
import QuarantineItem from '@/components/QuarantineItem';

export default function QuarantinePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuarantine();
  }, []);

  async function fetchQuarantine() {
    setLoading(true);
    try {
      const res = await fetch('/api/quarantine');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleAction(id, action) {
    // Remove the item from the list after action
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <>
      <header style={{ marginBottom: 'var(--space-xl)' }}>
        <h1>Quarantine Review</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {loading ? 'Loading...' : `${items.length} items awaiting review`}
        </p>
      </header>

      {!loading && items.length === 0 && (
        <p style={{ color: 'var(--text-muted)', padding: 'var(--space-xl) 0' }}>
          No quarantined memories. Items with confidence below 60% will appear here for your review.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', maxWidth: '52rem' }}>
        {items.map((item) => (
          <QuarantineItem key={item.id} item={item} onAction={handleAction} />
        ))}
      </div>
    </>
  );
}
