import { getConfig } from './config.js';

/**
 * Fetch stats from OpenBrain (total thought count, etc.)
 */
export async function getOpenBrainStats() {
  const { openbrain } = getConfig();
  try {
    const res = await fetch(`${openbrain.url}/stats`, { next: { revalidate: 30 } });
    if (!res.ok) return { status: 'error', error: `${res.status}` };
    return { status: 'ok', ...(await res.json()) };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Fetch recent thoughts from OpenBrain.
 */
export async function getOpenBrainRecent(limit = 20) {
  const { openbrain } = getConfig();
  try {
    const res = await fetch(`${openbrain.url}/recent?limit=${limit}`, { next: { revalidate: 10 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.thoughts || data || [];
  } catch {
    return [];
  }
}

/**
 * Fetch domains from OpenBrain.
 */
export async function getOpenBrainDomains() {
  const { openbrain } = getConfig();
  try {
    const res = await fetch(`${openbrain.url}/list_domains`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.domains || data || [];
  } catch {
    return [];
  }
}
