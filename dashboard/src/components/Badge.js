import styles from './Badge.module.css';

export default function Badge({ type }) {
  return (
    <span className={`${styles.badge} ${styles[type] || ''}`}>
      {type}
    </span>
  );
}
