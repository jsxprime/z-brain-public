/**
 * Telegram Bot API client for push notifications.
 *
 * Uses the same bot token Hermes uses for Telegram gateway.
 * Reads credentials from the Hermes .env on the VM via SSH,
 * or from local environment variables.
 *
 * This replaces the SSH-based session injection approach with
 * a clean, direct Telegram Bot API call that survives container updates.
 */

import { config } from '../config.js';

// Cached credentials — loaded once on first use
let _botToken = null;
let _chatId = null;

/**
 * Load Telegram bot credentials.
 * Tries relay config first, then fetches from VM container.
 */
async function getCredentials() {
  if (_botToken && _chatId) return { botToken: _botToken, chatId: _chatId };

  // Try config (loaded from .env)
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_HOME_CHANNEL) {
    _botToken = config.TELEGRAM_BOT_TOKEN;
    _chatId = config.TELEGRAM_HOME_CHANNEL;
    return { botToken: _botToken, chatId: _chatId };
  }

  // Fallback: fetch from the Hermes container's env via SSH
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const cmd = `ssh ${config.VM_USER}@${config.VM_HOST} "docker exec hermes-agent printenv TELEGRAM_BOT_TOKEN && docker exec hermes-agent printenv TELEGRAM_HOME_CHANNEL"`;
    const { stdout } = await execAsync(cmd, { timeout: 10000 });
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      _botToken = lines[0].trim();
      _chatId = lines[1].trim();
    }
  } catch (e) {
    console.error(`Failed to fetch Telegram credentials: ${e.message}`);
  }

  if (!_botToken || !_chatId) {
    throw new Error('Telegram credentials not available. Set TELEGRAM_BOT_TOKEN and TELEGRAM_HOME_CHANNEL in relay/.env');
  }

  return { botToken: _botToken, chatId: _chatId };
}

/**
 * Send a notification to the operator's Telegram via the Bot API.
 *
 * @param {string} text - The message text to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTelegramNotification(text) {
  try {
    const { botToken, chatId } = await getCredentials();
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_notification: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Retry without Markdown if parse fails
      if (data.description && data.description.includes("parse")) {
        const retryResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: text })
        });
        const retryData = await retryResponse.json();
        if (!retryResponse.ok) {
          return { success: false, error: retryData.description || 'Unknown error' };
        }
        return { success: true };
      }
      return { success: false, error: data.description || 'Unknown error' };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
