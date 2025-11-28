import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import { reloadConfig } from '../config/config.js';

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

// Load settings
export async function loadSettings() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Failed to read config file:', error);
    // Return default config
    return {
      server: { port: 8045, host: '0.0.0.0' },
      api: {
        url: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse',
        modelsUrl: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
        host: 'daily-cloudcode-pa.sandbox.googleapis.com',
        userAgent: 'antigravity/1.11.3 windows/amd64'
      },
      defaults: { temperature: 1, top_p: 0.85, top_k: 50, max_tokens: 8096 },
      security: { maxRequestSize: '50mb', apiKey: 'sk-text', adminPassword: 'admin123' },
      systemInstruction: 'You are a chatbot, dedicated to providing chat and emotional support for users, assisting with novel writing or role-playing, and also providing math or coding advice'
    };
  }
}

// Save settings
export async function saveSettings(newSettings) {
  try {
    // Read existing config
    let config;
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      config = JSON.parse(data);
    } catch {
      config = {};
    }

    // Merge settings
    config.server = config.server || {};
    config.security = config.security || {};
    config.defaults = config.defaults || {};

    // Update server config
    if (newSettings.server) {
      config.server.port = parseInt(newSettings.server.port) || config.server.port;
      config.server.host = newSettings.server.host || config.server.host;
    }

    // Update security config
    if (newSettings.security) {
      config.security.apiKey = newSettings.security.apiKey || config.security.apiKey;
      config.security.adminPassword = newSettings.security.adminPassword || config.security.adminPassword;
      config.security.maxRequestSize = newSettings.security.maxRequestSize || config.security.maxRequestSize;
    }

    // Update default parameters
    if (newSettings.defaults) {
      const temp = parseFloat(newSettings.defaults.temperature);
      if (!isNaN(temp)) config.defaults.temperature = temp;

      const topP = parseFloat(newSettings.defaults.top_p);
      if (!isNaN(topP)) config.defaults.top_p = topP;

      const topK = parseInt(newSettings.defaults.top_k);
      if (!isNaN(topK)) config.defaults.top_k = topK;

      const maxTokens = parseInt(newSettings.defaults.max_tokens);
      if (!isNaN(maxTokens)) config.defaults.max_tokens = maxTokens;
    }

    // Update system instruction
    if (newSettings.systemInstruction !== undefined) {
      config.systemInstruction = newSettings.systemInstruction;
    }

    // Write to file
    logger.info('Saving config:', JSON.stringify(config, null, 2));
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    logger.info('Config file saved');

    // Trigger hot reload
    const reloaded = reloadConfig();
    const message = reloaded
      ? 'Settings saved and applied (core configs like port require restart)'
      : 'Settings saved, but hot reload failed, please restart server';

    return { success: true, message };
  } catch (error) {
    logger.error('Failed to save config file:', error);
    throw new Error('Failed to save config: ' + error.message);
  }
}
