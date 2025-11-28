import logger from './logger.js';

/**
 * Idle Mode Manager
 * Reduces memory usage and background activity when there are no requests
 */
class IdleManager {
  constructor() {
    this.lastRequestTime = Date.now();
    this.idleTimeout = 30 * 1000; // Enter idle mode after 30 seconds of no requests
    this.isIdle = false;
    this.gcInterval = null;
    this.checkInterval = null;

    // Start idle check
    this.startIdleCheck();

    // Check if should enter idle mode after 10 seconds
    setTimeout(() => {
      const idleTime = Date.now() - this.lastRequestTime;
      if (idleTime > this.idleTimeout) {
        this.enterIdleMode();
      }
    }, 10000);
  }

  /**
   * Record request activity
   */
  recordActivity() {
    this.lastRequestTime = Date.now();

    // If previously idle, restore to active
    if (this.isIdle) {
      this.exitIdleMode();
    }
  }

  /**
   * Start idle check
   */
  startIdleCheck() {
    // Check every 15 seconds if should enter idle mode
    this.checkInterval = setInterval(() => {
      const idleTime = Date.now() - this.lastRequestTime;

      if (!this.isIdle && idleTime > this.idleTimeout) {
        this.enterIdleMode();
      }
    }, 15000); // Check every 15 seconds

    // Don't prevent process exit
    this.checkInterval.unref();
  }

  /**
   * Enter idle mode
   */
  enterIdleMode() {
    if (this.isIdle) return;

    logger.info('⏸️  Entering idle mode - reducing resource usage');
    this.isIdle = true;

    // Trigger garbage collection
    if (global.gc) {
      global.gc();
      logger.info('🗑️  Triggered garbage collection');
    } else {
      // If --expose-gc not enabled, try to release memory through other ways
      logger.warn('⚠️  --expose-gc not enabled, recommend starting with node --expose-gc for better memory optimization');
    }

    // In idle mode, perform garbage collection every 2 minutes
    this.gcInterval = setInterval(() => {
      if (global.gc) {
        global.gc();
        logger.info('🗑️  Idle mode: periodic garbage collection');
      }
    }, 2 * 60 * 1000); // Every 2 minutes

    // Don't prevent process exit
    this.gcInterval.unref();
  }

  /**
   * Exit idle mode
   */
  exitIdleMode() {
    if (!this.isIdle) return;

    logger.info('▶️  Exiting idle mode - resuming normal operation');
    this.isIdle = false;

    // Clear idle mode timer
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }

    // Trigger garbage collection once to clean up idle period memory
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    const idleTime = Date.now() - this.lastRequestTime;
    return {
      isIdle: this.isIdle,
      idleTimeSeconds: Math.floor(idleTime / 1000),
      lastRequestTime: new Date(this.lastRequestTime).toISOString()
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
  }
}

const idleManager = new IdleManager();
export default idleManager;
