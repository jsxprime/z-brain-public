import { enqueueEvent } from '../queue/enqueue.js';

/**
 * Wiki.js Poller
 * Periodically queries Wiki.js GraphQL API for updated pages.
 */

export class WikiJsPoller {
  constructor(pool, config) {
    this.pool = pool;
    this.config = config;
    this.apiUrl = config.wikijs.apiUrl;
    this.apiKey = config.wikijs.apiKey;
    this.intervalMs = config.wikijs.pollIntervalMs || 300000;
    this.isRunning = false;
    this.timer = null;
  }

  start() {
    if (!this.apiUrl || !this.apiKey) {
      console.warn('[WikiJsPoller] Missing WIKIJS_API_URL or WIKIJS_API_KEY. Polling disabled.');
      return;
    }
    console.log(`[WikiJsPoller] Starting poller, interval: ${this.intervalMs}ms`);
    this.isRunning = true;
    this.poll(); // Start first poll immediately
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[WikiJsPoller] Stopped poller.');
  }

  async poll() {
    if (!this.isRunning) return;

    try {
      await this.runPollCycle();
    } catch (err) {
      console.error('[WikiJsPoller] Poll cycle failed:', err.message);
    } finally {
      if (this.isRunning) {
        this.timer = setTimeout(() => this.poll(), this.intervalMs);
      }
    }
  }

  async runPollCycle() {
    // 1. Get the last timestamp we processed
    const client = await this.pool.connect();
    let lastTimestamp = new Date(0); // Epoch
    try {
      const { rows } = await client.query(`SELECT last_event_timestamp FROM source_cursors WHERE source = 'wikijs'`);
      if (rows.length > 0) {
        lastTimestamp = new Date(rows[0].last_event_timestamp);
      }
    } finally {
      client.release();
    }

    // 2. Query Wiki.js for recent pages
    const listQuery = `
      query {
        pages {
          list(orderBy: UPDATED) {
            id
            updatedAt
          }
        }
      }
    `;

    const listData = await this.graphql(listQuery);
    if (!listData?.pages?.list) return;

    const pages = listData.pages.list;
    let newestTimestamp = lastTimestamp;
    let processedCount = 0;

    // Filter pages updated after our last timestamp
    const updatedPages = pages.filter(p => new Date(p.updatedAt) > lastTimestamp);

    if (updatedPages.length > 0) {
      console.log(`[WikiJsPoller] Found ${updatedPages.length} updated pages since ${lastTimestamp.toISOString()}`);
    }

    // 3. For each updated page, fetch full content and enqueue
    for (const pageMeta of updatedPages) {
      try {
        const pageQuery = `
          query {
            pages {
              single(id: ${pageMeta.id}) {
                id
                path
                title
                content
                updatedAt
                authorName
              }
            }
          }
        `;
        const pageData = await this.graphql(pageQuery);
        const page = pageData?.pages?.single;

        if (page) {
          const sourceId = `wikijs-page-${page.id}-${page.updatedAt}`;
          
          const event = {
            source: 'wikijs',
            sourceId,
            sourceUrl: null,
            payload: {
              event: 'page:updated',
              pageId: page.id,
              path: page.path,
              title: page.title,
              content: page.content,
              author: page.authorName,
              updatedAt: page.updatedAt,
            }
          };

          const result = await enqueueEvent(this.pool, event);
          if (!result.duplicate) {
            processedCount++;
            console.log(`[WikiJsPoller] Enqueued updated page: ${page.path} (ID: ${result.id})`);
          }
        }

        const currentTimestamp = new Date(pageMeta.updatedAt);
        if (currentTimestamp > newestTimestamp) {
          newestTimestamp = currentTimestamp;
        }
      } catch (err) {
        console.error(`[WikiJsPoller] Failed to fetch/enqueue page ID ${pageMeta.id}:`, err.message);
      }
    }

    // 4. Update the cursor if we saw newer pages
    if (newestTimestamp > lastTimestamp) {
      const client = await this.pool.connect();
      try {
        await client.query(`
          INSERT INTO source_cursors (source, last_event_id, last_event_timestamp, updated_at)
          VALUES ('wikijs', 'poll', $1, NOW())
          ON CONFLICT (source) DO UPDATE 
          SET last_event_timestamp = EXCLUDED.last_event_timestamp, updated_at = NOW()
        `, [newestTimestamp.toISOString()]);
      } finally {
        client.release();
      }
    }
  }

  async graphql(query) {
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      throw new Error(`GraphQL request failed with status ${res.status}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(`GraphQL returned errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }
}
