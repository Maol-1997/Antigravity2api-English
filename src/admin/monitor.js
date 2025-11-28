import os from 'os';
import { execSync } from 'child_process';
import idleManager from '../utils/idle_manager.js';

const startTime = Date.now();
let requestCount = 0;

// CPU usage tracking
let previousCpuInfo = null;
let currentCpuUsage = 0;

function getCpuInfo() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  return { idle: totalIdle, total: totalTick };
}

function updateCpuUsage() {
  const currentCpuInfo = getCpuInfo();

  if (previousCpuInfo) {
    const idleDiff = currentCpuInfo.idle - previousCpuInfo.idle;
    const totalDiff = currentCpuInfo.total - previousCpuInfo.total;

    if (totalDiff > 0) {
      currentCpuUsage = Math.round(100 - (100 * idleDiff / totalDiff));
    }
  }

  previousCpuInfo = currentCpuInfo;
}

// Update CPU usage every second
setInterval(updateCpuUsage, 1000);
updateCpuUsage();

// Today's request stats
let todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
let todayRequestCount = 0;

// Increment request count
export function incrementRequestCount() {
  requestCount++;

  // Check if date has changed
  const currentDate = new Date().toISOString().split('T')[0];
  if (currentDate !== todayDate) {
    // Date changed, reset today's count
    todayDate = currentDate;
    todayRequestCount = 0;
  }

  todayRequestCount++;
}

// Get today's request count
export function getTodayRequestCount() {
  // Check date again to prevent returning stale data after midnight
  const currentDate = new Date().toISOString().split('T')[0];
  if (currentDate !== todayDate) {
    todayDate = currentDate;
    todayRequestCount = 0;
  }
  return todayRequestCount;
}

// Get system status
export function getSystemStatus() {
  const uptime = Date.now() - startTime;
  const uptimeSeconds = Math.floor(uptime / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  const memUsage = process.memoryUsage();
  const sysMem = getSystemMemory();

  // Get idle status
  const idleStatus = idleManager.getStatus();

  return {
    cpu: getCpuUsage(),
    memory: formatBytes(sysMem.used),
    memoryPercent: ((sysMem.used / sysMem.total) * 100).toFixed(1),
    totalSystemMemory: formatBytes(sysMem.total),
    processMemory: formatBytes(memUsage.rss),
    heapUsed: formatBytes(memUsage.heapUsed),
    heapTotal: formatBytes(memUsage.heapTotal),
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    requests: requestCount,
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    pid: process.pid,
    idle: idleStatus.isIdle ? 'Idle mode' : 'Active',
    idleTime: idleStatus.idleTimeSeconds
  };
}

// Get current CPU usage
function getCpuUsage() {
  return currentCpuUsage;
}

// Get real memory usage (works on macOS, Linux, Windows)
function getSystemMemory() {
  const totalMem = os.totalmem();
  let usedMem;

  try {
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS: Total - Free = Used (matches Activity Monitor)
      const vmstat = execSync('vm_stat').toString();

      // Get page size from vm_stat output
      const pageSizeMatch = vmstat.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1]) : 16384;

      const getPages = (name) => {
        // Values end with a dot, e.g., "57861."
        const match = vmstat.match(new RegExp(`${name}:\\s+(\\d+)\\.`));
        return match ? parseInt(match[1]) : 0;
      };

      const free = getPages('Pages free') * pageSize;
      const inactive = getPages('Pages inactive') * pageSize;

      // Used = Total - Free - Inactive (inactive is available for use)
      usedMem = totalMem - free - inactive;
    } else if (platform === 'linux') {
      // Linux: parse /proc/meminfo
      const meminfo = execSync('cat /proc/meminfo').toString();
      const getValue = (name) => {
        const match = meminfo.match(new RegExp(`${name}:\\s+(\\d+)`));
        return match ? parseInt(match[1]) * 1024 : 0;
      };

      const memAvailable = getValue('MemAvailable');
      usedMem = totalMem - memAvailable;
    } else {
      // Windows/other: fallback to os.freemem
      usedMem = totalMem - os.freemem();
    }
  } catch {
    // Fallback
    usedMem = totalMem - os.freemem();
  }

  return { used: usedMem, total: totalMem };
}

// Format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
