import fs from 'fs/promises';
import path from 'path';

const LOGS_FILE = path.join(process.cwd(), 'data', 'app_logs.json');
const MAX_LOGS = 200; // Max 200 logs (reduce memory usage)

// Memory cache, avoid frequent file reads
let logsCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 30000; // Cache for 30 seconds

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(LOGS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Load logs (with cache)
export async function loadLogs() {
  const now = Date.now();

  // If cache is valid, return cached data directly
  if (logsCache && (now - lastCacheTime) < CACHE_DURATION) {
    return logsCache;
  }

  await ensureDataDir();
  try {
    const data = await fs.readFile(LOGS_FILE, 'utf-8');
    logsCache = JSON.parse(data);
    lastCacheTime = now;
    return logsCache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logsCache = [];
      lastCacheTime = now;
      return [];
    }
    throw error;
  }
}

// Save logs
async function saveLogs(logs) {
  await ensureDataDir();
  // Only keep the most recent logs
  const recentLogs = logs.slice(-MAX_LOGS);
  await fs.writeFile(LOGS_FILE, JSON.stringify(recentLogs, null, 2), 'utf-8');

  // Update cache
  logsCache = recentLogs;
  lastCacheTime = Date.now();
}

// Add log
export async function addLog(level, message) {
  const logs = await loadLogs();
  logs.push({
    timestamp: new Date().toISOString(),
    level,
    message
  });
  await saveLogs(logs);
}

// Clear logs
export async function clearLogs() {
  await saveLogs([]);
}

// Get recent logs
export async function getRecentLogs(limit = 100) {
  const logs = await loadLogs();
  return logs.slice(-limit).reverse();
}
