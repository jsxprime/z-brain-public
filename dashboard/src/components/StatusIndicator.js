import styles from './StatusIndicator.module.css';

const STATUS_MAP = {
  ok: { className: 'ok', label: 'Healthy' },
  online: { className: 'ok', label: 'Online' },
  healthy: { className: 'ok', label: 'Healthy' },
  degraded: { className: 'warn', label: 'Degraded' },
  error: { className: 'error', label: 'Error' },
  offline: { className: 'error', label: 'Offline' },
};

export default function StatusIndicator({ status, label }) {
  const mapped = STATUS_MAP[status] || STATUS_MAP.error;

  return (
    <span className={`${styles.indicator} ${styles[mapped.className]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label || mapped.label}
    </span>
  );
}
