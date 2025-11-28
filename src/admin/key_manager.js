import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const KEYS_FILE = path.join(process.cwd(), 'data', 'api_keys.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(KEYS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Generate random API key
function generateApiKey() {
  return 'sk-' + crypto.randomBytes(32).toString('hex');
}

// Load all keys
export async function loadKeys() {
  await ensureDataDir();
  try {
    const data = await fs.readFile(KEYS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Save keys
async function saveKeys(keys) {
  await ensureDataDir();
  await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf-8');
}

// Create new key
export async function createKey(name = 'Unnamed', rateLimit = null, customKey = null) {
  const keys = await loadKeys();

  if (customKey) {
    if (keys.some(k => k.key === customKey)) {
      throw new Error('Key already exists');
    }
  }

  const newKey = {
    key: customKey || generateApiKey(),
    name,
    created: new Date().toISOString(),
    lastUsed: null,
    requests: 0,
    rateLimit: rateLimit || { enabled: false, maxRequests: 100, windowMs: 60000 }, // Default 100 requests/minute
    usage: {} // Used to store usage records { timestamp: count }
  };
  keys.push(newKey);
  await saveKeys(keys);
  logger.info(`New key created: ${name}`);
  return newKey;
}

// Delete key
export async function deleteKey(keyToDelete) {
  const keys = await loadKeys();
  const filtered = keys.filter(k => k.key !== keyToDelete);
  if (filtered.length === keys.length) {
    throw new Error('Key does not exist');
  }
  await saveKeys(filtered);
  logger.info(`Key deleted: ${keyToDelete.substring(0, 10)}...`);
  return true;
}

// Validate key
export async function validateKey(keyToCheck) {
  const keys = await loadKeys();
  const key = keys.find(k => k.key === keyToCheck);
  if (key) {
    // Update usage info
    key.lastUsed = new Date().toISOString();
    key.requests = (key.requests || 0) + 1;
    await saveKeys(keys);
    return true;
  }
  return false;
}

// Get key stats
export async function getKeyStats() {
  const keys = await loadKeys();
  return {
    total: keys.length,
    active: keys.filter(k => k.lastUsed).length,
    totalRequests: keys.reduce((sum, k) => sum + (k.requests || 0), 0)
  };
}

// Update key rate limit
export async function updateKeyRateLimit(keyToUpdate, rateLimit) {
  const keys = await loadKeys();
  const key = keys.find(k => k.key === keyToUpdate);
  if (!key) {
    throw new Error('Key does not exist');
  }
  key.rateLimit = rateLimit;
  await saveKeys(keys);
  logger.info(`Key rate limit updated: ${keyToUpdate.substring(0, 10)}...`);
  return key;
}

// Check rate limit
export async function checkRateLimit(keyToCheck) {
  const keys = await loadKeys();
  const key = keys.find(k => k.key === keyToCheck);

  if (!key) {
    return { allowed: false, error: 'Key does not exist' };
  }

  // If rate limit not enabled, allow directly
  if (!key.rateLimit || !key.rateLimit.enabled) {
    return { allowed: true };
  }

  const now = Date.now();
  const windowMs = key.rateLimit.windowMs || 60000;
  const maxRequests = key.rateLimit.maxRequests || 100;

  // Clean up expired usage records
  key.usage = key.usage || {};
  const cutoffTime = now - windowMs;

  // Calculate request count in current time window
  let requestCount = 0;
  for (const [timestamp, count] of Object.entries(key.usage)) {
    if (parseInt(timestamp) >= cutoffTime) {
      requestCount += count;
    } else {
      delete key.usage[timestamp]; // Clean up expired records
    }
  }

  // Check if limit exceeded
  if (requestCount >= maxRequests) {
    const resetTime = Math.min(...Object.keys(key.usage).map(t => parseInt(t))) + windowMs;
    const waitSeconds = Math.ceil((resetTime - now) / 1000);
    return {
      allowed: false,
      error: 'Rate limit exceeded',
      resetIn: waitSeconds,
      limit: maxRequests,
      remaining: 0
    };
  }

  // Record this request
  const minute = Math.floor(now / 10000) * 10000; // Group by 10 seconds
  key.usage[minute] = (key.usage[minute] || 0) + 1;

  await saveKeys(keys);

  return {
    allowed: true,
    limit: maxRequests,
    remaining: maxRequests - requestCount - 1
  };
}
