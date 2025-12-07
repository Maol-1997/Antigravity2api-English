import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/logger.js';
import config from '../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

function generateSessionId() {
  return String(-Math.floor(Math.random() * 9e18));
}

class TokenManager {
  constructor(filePath = path.join(__dirname,'..','..','data' ,'accounts.json')) {
    this.filePath = filePath;
    this.quotaFilePath = path.join(__dirname,'..','..','data' ,'quota_cooldowns.json');
    this.tokens = [];
    this.currentIndex = 0;
    this.lastLoadTime = 0;
    this.loadInterval = 60000; // Don't reload within 1 minute
    this.cachedData = null; // Cache file data, reduce disk reads
    this.usageStats = new Map(); // Token usage stats { refresh_token -> { requests, lastUsed } }
    this.quotaCooldowns = new Map(); // Quota cooldowns { "refresh_token:model" -> resetTimestamp }
    this.loadTokens();
    this.loadQuotaCooldowns();
  }

  loadTokens() {
    try {
      // Avoid frequent loading, use cache within 1 minute
      if (Date.now() - this.lastLoadTime < this.loadInterval && this.tokens.length > 0) {
        return;
      }

      log.info('Loading tokens...');
      const data = fs.readFileSync(this.filePath, 'utf8');
      const tokenArray = JSON.parse(data);
      this.cachedData = tokenArray; // Cache raw data
      this.tokens = tokenArray.filter(token => token.enable !== false).map(token => ({
        ...token,
        sessionId: generateSessionId()
      }));
      this.currentIndex = 0;
      this.lastLoadTime = Date.now();
      log.info(`Successfully loaded ${this.tokens.length} available tokens`);

      // Trigger garbage collection (if available)
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      log.error('Failed to load tokens:', error.message);
      this.tokens = [];
    }
  }

  async fetchProjectId(token) {
    const response = await fetch('https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist', {
      method: 'POST',
      headers: {
        'Host': 'daily-cloudcode-pa.sandbox.googleapis.com',
        'User-Agent': config.api?.userAgent || 'antigravity/1.11.3 windows/amd64',
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip'
      },
      body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projectId: ${response.status}`);
    }

    const data = await response.json();
    return data?.cloudaicompanionProject;
  }

  loadQuotaCooldowns() {
    try {
      if (fs.existsSync(this.quotaFilePath)) {
        const data = fs.readFileSync(this.quotaFilePath, 'utf8');
        const cooldowns = JSON.parse(data);
        this.quotaCooldowns = new Map(Object.entries(cooldowns));
        // Clean up expired cooldowns
        const now = Date.now();
        for (const [key, resetTime] of this.quotaCooldowns) {
          if (resetTime <= now) {
            this.quotaCooldowns.delete(key);
          }
        }
        this.saveQuotaCooldowns();
      }
    } catch (error) {
      log.error('Failed to load quota cooldowns:', error.message);
    }
  }

  saveQuotaCooldowns() {
    try {
      const obj = Object.fromEntries(this.quotaCooldowns);
      fs.writeFileSync(this.quotaFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (error) {
      log.error('Failed to save quota cooldowns:', error.message);
    }
  }

  setQuotaCooldown(token, model, resetTimestamp) {
    const key = `${token.refresh_token}:${model}`;
    this.quotaCooldowns.set(key, resetTimestamp);
    this.saveQuotaCooldowns();
    const resetDate = new Date(resetTimestamp);
    log.warn(`⏳ Token quota exhausted for model ${model}, will reset at ${resetDate.toLocaleTimeString()}`);
  }

  isTokenInCooldown(token, model) {
    const key = `${token.refresh_token}:${model}`;
    const resetTime = this.quotaCooldowns.get(key);
    if (!resetTime) return false;
    if (Date.now() >= resetTime) {
      this.quotaCooldowns.delete(key);
      this.saveQuotaCooldowns();
      return false;
    }
    return true;
  }

  getTokenCooldownInfo(token, model) {
    const key = `${token.refresh_token}:${model}`;
    const resetTime = this.quotaCooldowns.get(key);
    if (!resetTime || Date.now() >= resetTime) return null;
    return {
      resetTime,
      remainingMs: resetTime - Date.now()
    };
  }

  formatDuration(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  }

  isExpired(token) {
    if (!token.timestamp || !token.expires_in) return true;
    const expiresAt = token.timestamp + (token.expires_in * 1000);
    return Date.now() >= expiresAt - 300000;
  }

  async refreshToken(token) {
    log.info('Refreshing token...');
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Host': 'oauth2.googleapis.com',
        'User-Agent': 'Go-http-client/1.1',
        'Content-Length': body.toString().length.toString(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Encoding': 'gzip'
      },
      body: body.toString()
    });

    if (response.ok) {
      const data = await response.json();
      token.access_token = data.access_token;
      token.expires_in = data.expires_in;
      token.timestamp = Date.now();
      this.saveToFile();
      return token;
    } else {
      throw { statusCode: response.status, message: await response.text() };
    }
  }

  saveToFile() {
    try {
      // Use cached data, reduce disk reads
      let allTokens = this.cachedData;
      if (!allTokens) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        allTokens = JSON.parse(data);
      }

      this.tokens.forEach(memToken => {
        const index = allTokens.findIndex(t => t.refresh_token === memToken.refresh_token);
        if (index !== -1) allTokens[index] = memToken;
      });

      fs.writeFileSync(this.filePath, JSON.stringify(allTokens, null, 2), 'utf8');
      this.cachedData = allTokens; // Update cache
    } catch (error) {
      log.error('Failed to save file:', error.message);
    }
  }

  disableToken(token) {
    log.warn(`Disabling token`)
    token.enable = false;
    this.saveToFile();
    this.loadTokens();
  }

  async getToken(model = null) {
    this.loadTokens();
    if (this.tokens.length === 0) return null;

    let skippedDueToCooldown = 0;

    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[this.currentIndex];
      const tokenIndex = this.currentIndex;

      // Check if token is in cooldown for this model
      if (model && this.isTokenInCooldown(token, model)) {
        const cooldownInfo = this.getTokenCooldownInfo(token, model);
        const remainingFormatted = this.formatDuration(cooldownInfo.remainingMs);
        log.info(`⏭️ Skipping Token #${tokenIndex} (quota cooldown for ${model}, ${remainingFormatted} remaining)`);
        skippedDueToCooldown++;
        this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
        continue;
      }

      try {
        if (this.isExpired(token)) {
          await this.refreshToken(token);
        }

        // Fetch projectId if not present
        if (!token.projectId) {
          try {
            log.info(`Fetching projectId for Token #${tokenIndex}...`);
            const projectId = await this.fetchProjectId(token);
            if (projectId === undefined) {
              log.warn(`Token #${tokenIndex}: No permission to get projectId, disabling`);
              this.disableToken(token);
              if (this.tokens.length === 0) return null;
              continue;
            }
            token.projectId = projectId;
            this.saveToFile();
            log.info(`Token #${tokenIndex}: Got projectId: ${projectId}`);
          } catch (fetchError) {
            log.error(`Token #${tokenIndex}: Failed to fetch projectId:`, fetchError.message);
            this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
            continue;
          }
        }

        this.currentIndex = (this.currentIndex + 1) % this.tokens.length;

        // Record usage stats
        this.recordUsage(token);
        log.info(`🔄 Round-robin using Token #${tokenIndex} (total requests: ${this.getTokenRequests(token)})`);

        return token;
      } catch (error) {
        if (error.statusCode === 403) {
          log.warn(`Token ${this.currentIndex} refresh failed (403), disabling and trying next`);
          this.disableToken(token);
        } else {
          log.error(`Token ${this.currentIndex} refresh failed:`, error.message);
        }
        this.currentIndex = (this.currentIndex + 1) % this.tokens.length;
        if (this.tokens.length === 0) return null;
      }
    }

    // All tokens are either disabled or in cooldown
    if (skippedDueToCooldown === this.tokens.length) {
      // Find the token with the shortest cooldown
      let shortestCooldown = null;
      for (const token of this.tokens) {
        const info = this.getTokenCooldownInfo(token, model);
        if (info && (!shortestCooldown || info.remainingMs < shortestCooldown.remainingMs)) {
          shortestCooldown = { token, ...info };
        }
      }
      if (shortestCooldown) {
        const resetDate = new Date(shortestCooldown.resetTime);
        throw new Error(`All tokens are in quota cooldown for model ${model}. Shortest reset at ${resetDate.toLocaleTimeString()}`);
      }
    }

    return null;
  }

  // Record token usage
  recordUsage(token) {
    const key = token.refresh_token;
    if (!this.usageStats.has(key)) {
      this.usageStats.set(key, { requests: 0, lastUsed: null });
    }
    const stats = this.usageStats.get(key);
    stats.requests++;
    stats.lastUsed = Date.now();
  }

  // Get request count for single token
  getTokenRequests(token) {
    const stats = this.usageStats.get(token.refresh_token);
    return stats ? stats.requests : 0;
  }

  // Get usage stats for all tokens
  getUsageStats() {
    const stats = [];
    this.tokens.forEach((token, index) => {
      const usage = this.usageStats.get(token.refresh_token) || { requests: 0, lastUsed: null };
      stats.push({
        index,
        requests: usage.requests,
        lastUsed: usage.lastUsed ? new Date(usage.lastUsed).toISOString() : null,
        isCurrent: index === this.currentIndex
      });
    });
    return {
      totalTokens: this.tokens.length,
      currentIndex: this.currentIndex,
      totalRequests: Array.from(this.usageStats.values()).reduce((sum, s) => sum + s.requests, 0),
      tokens: stats
    };
  }

  disableCurrentToken(token) {
    const found = this.tokens.find(t => t.access_token === token.access_token);
    if (found) {
      this.disableToken(found);
    }
  }

  async handleRequestError(error, currentAccessToken) {
    if (error.statusCode === 403) {
      log.warn('Request encountered 403 error, trying to refresh token');
      const currentToken = this.tokens[this.currentIndex];
      if (currentToken && currentToken.access_token === currentAccessToken) {
        try {
          await this.refreshToken(currentToken);
          log.info('Token refresh successful, returning new token');
          return currentToken;
        } catch (refreshError) {
          if (refreshError.statusCode === 403) {
            log.warn('Token refresh also encountered 403, disabling and switching to next');
            this.disableToken(currentToken);
            return await this.getToken();
          }
          log.error('Token refresh failed:', refreshError.message);
        }
      }
      return await this.getToken();
    }
    return null;
  }
}
const tokenManager = new TokenManager();
export default tokenManager;
