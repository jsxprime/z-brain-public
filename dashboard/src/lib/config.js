/**
 * Dashboard configuration from environment variables.
 * Next.js loads .env automatically in development.
 */

export function getConfig() {
  return {
    db: {
      host: process.env.SYNTH_DB_HOST || 'localhost',
      port: parseInt(process.env.SYNTH_DB_PORT || '5432', 10),
      name: process.env.SYNTH_DB_NAME || 'synthesizer_db',
      user: process.env.SYNTH_DB_USER || 'synth',
      password: process.env.SYNTH_DB_PASSWORD || '',
    },
    openbrain: {
      url: process.env.OPENBRAIN_URL || 'http://localhost:3040',
    },
    synthApp: {
      url: process.env.SYNTH_APP_URL || 'http://localhost:3080',
    },
    hermes: {
      url: process.env.HERMES_URL || 'http://localhost:8642',
      apiKey: process.env.HERMES_API_KEY || '',
    },
  };
}
