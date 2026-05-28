import { getConfig } from './config.js';

/**
 * Fetch health/status from the Hermes Agent.
 */
export async function getHermesHealth() {
  const { hermes } = getConfig();
  try {
    const res = await fetch(`${hermes.url}/health/detailed`, {
      headers: hermes.apiKey
        ? { Authorization: `Bearer ${hermes.apiKey}` }
        : {},
      next: { revalidate: 15 },
    });
    if (!res.ok) return { status: 'offline', error: `${res.status}` };
    return { status: 'online', ...(await res.json()) };
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}

/**
 * Fetch health from the Memory Synthesizer app.
 */
export async function getSynthHealth() {
  const { synthApp } = getConfig();
  try {
    const res = await fetch(`${synthApp.url}/health/detailed`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) return { status: 'offline', error: `${res.status}` };
    return { status: 'online', ...(await res.json()) };
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}
