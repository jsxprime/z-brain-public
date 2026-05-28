import styles from './EventRow.module.css';

export default function EventRow({ event }) {
  const label = event.source === 'zulip'
    ? `${event.stream || '?'} › ${event.topic || '?'}`
    : event.title || event.source_id;

  const who = event.sender || event.author || '—';

  return (
    <div className={`${styles.row} ${styles[event.status]}`}>
      <span className={styles.source}>{event.source}</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.who}>{who}</span>
      <span className={styles.status}>{event.status}</span>
      <time className={styles.time} dateTime={event.created_at}>
        {new Date(event.created_at).toLocaleTimeString()}
      </time>
    </div>
  );
}
