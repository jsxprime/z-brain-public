'use client';

import { useState } from 'react';
import Badge from './Badge';
import styles from './QuarantineItem.module.css';

export default function QuarantineItem({ item, onAction }) {
  const [loading, setLoading] = useState(false);

  async function handleAction(action) {
    setLoading(true);
    try {
      const res = await fetch(`/api/quarantine/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok && onAction) onAction(item.id, action);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <Badge type={item.memory_type} />
        <span className={styles.confidence}>
          {Math.round(item.confidence * 100)}% confidence
        </span>
        <span className={styles.source}>
          {item.source === 'zulip' ? `${item.stream} › ${item.topic}` : item.title}
        </span>
      </div>
      <p className={styles.content}>{item.extracted_content}</p>
      {item.original_content && (
        <details className={styles.original}>
          <summary>Original message</summary>
          <pre>{item.original_content}</pre>
        </details>
      )}
      <div className={styles.actions}>
        <button
          className={styles.approve}
          onClick={() => handleAction('approve')}
          disabled={loading}
        >
          ✓ Approve
        </button>
        <button
          className={styles.reject}
          onClick={() => handleAction('reject')}
          disabled={loading}
        >
          ✕ Reject
        </button>
      </div>
    </div>
  );
}
