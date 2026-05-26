import { config } from '../config.js';

export async function getHealth() {
  const response = await fetch(`${config.HERMES_API_URL}/health/detailed`);
  if (!response.ok) {
    throw new Error(`Hermes health check failed: ${response.statusText}`);
  }
  return response.json();
}
