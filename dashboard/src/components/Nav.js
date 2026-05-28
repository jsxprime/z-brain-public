'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';

const LINKS = [
  { href: '/', label: 'Overview', icon: '◉' },
  { href: '/pipeline', label: 'Pipeline', icon: '⟶' },
  { href: '/quarantine', label: 'Quarantine', icon: '⚑' },
  { href: '/memories', label: 'Memories', icon: '◎' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <div className={styles.brand}>
        <span className={styles.brandIcon}>🧠</span>
        <span className={styles.brandText}>Z-Brain</span>
      </div>
      <ul className={styles.links}>
        {LINKS.map(({ href, label, icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`${styles.link} ${pathname === href ? styles.active : ''}`}
            >
              <span className={styles.linkIcon}>{icon}</span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
