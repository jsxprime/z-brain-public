/**
 * Wiki.js GraphQL API client.
 *
 * Uses the Wiki.js GraphQL endpoint for page mutations.
 * Docs: https://docs.requarks.io/dev/api
 *
 * Authentication: Bearer token in Authorization header.
 */

/**
 * Send a GraphQL request to Wiki.js.
 *
 * @param {object} config - App config
 * @param {string} query - GraphQL query/mutation string
 * @returns {Promise<object>} The `data` field of the GraphQL response.
 */
async function graphql(config, query) {
  if (!config.wikijs.apiUrl || !config.wikijs.apiKey) {
    throw new Error('Wiki.js API not configured: set WIKIJS_API_URL, WIKIJS_API_KEY');
  }

  const response = await fetch(config.wikijs.apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.wikijs.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Wiki.js API HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Wiki.js GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

/**
 * Escape a string for safe inclusion in a GraphQL query.
 * Handles quotes, backslashes, and newlines.
 */
function escapeGql(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Create a new Wiki.js page.
 *
 * @param {object} config - App config
 * @param {object} params
 * @param {string} params.path - Page path (e.g. 'homelab/docker')
 * @param {string} params.title - Page title
 * @param {string} params.content - Page content (Markdown)
 * @param {string} [params.description] - Page description
 * @param {string} [params.locale] - Locale (default: 'en')
 * @returns {Promise<{succeeded: boolean, page: {id: number, path: string, title: string}}>}
 */
export async function createPage(config, { path, title, content, description = '', locale = 'en' }) {
  const mutation = `
    mutation {
      pages {
        create(
          title: "${escapeGql(title)}",
          content: "${escapeGql(content)}",
          description: "${escapeGql(description)}",
          editor: "markdown",
          isPublished: true,
          isPrivate: false,
          locale: "${escapeGql(locale)}",
          path: "${escapeGql(path)}",
          tags: []
        ) {
          responseResult {
            succeeded
            errorCode
            message
          }
          page {
            id
            path
            title
          }
        }
      }
    }
  `;

  const data = await graphql(config, mutation);
  const result = data.pages.create;

  if (!result.responseResult.succeeded) {
    throw new Error(`Wiki.js create failed: ${result.responseResult.message} (code ${result.responseResult.errorCode})`);
  }

  return { succeeded: true, page: result.page };
}

/**
 * Update an existing Wiki.js page.
 *
 * @param {object} config - App config
 * @param {object} params
 * @param {number} params.id - Page ID to update
 * @param {string} params.title - New title
 * @param {string} params.content - New content (Markdown)
 * @param {string} [params.description] - New description
 * @param {string} [params.locale] - Locale (default: 'en')
 * @returns {Promise<{succeeded: boolean, page: {id: number, path: string, title: string}}>}
 */
export async function updatePage(config, { id, title, content, description = '', locale = 'en' }) {
  const mutation = `
    mutation {
      pages {
        update(
          id: ${id},
          title: "${escapeGql(title)}",
          content: "${escapeGql(content)}",
          description: "${escapeGql(description)}",
          editor: "markdown",
          isPublished: true,
          isPrivate: false,
          locale: "${escapeGql(locale)}",
          tags: []
        ) {
          responseResult {
            succeeded
            errorCode
            message
          }
          page {
            id
            path
            title
          }
        }
      }
    }
  `;

  const data = await graphql(config, mutation);
  const result = data.pages.update;

  if (!result.responseResult.succeeded) {
    throw new Error(`Wiki.js update failed: ${result.responseResult.message} (code ${result.responseResult.errorCode})`);
  }

  return { succeeded: true, page: result.page };
}
