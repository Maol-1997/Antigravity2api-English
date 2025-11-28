import fs from 'fs';
import log from '../utils/logger.js';

const defaultConfig = {
  server: { port: 8045, host: '127.0.0.1' },
  api: {
    url: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse',
    imageUrl: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent?alt=sse',
    modelsUrl: 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
    host: 'daily-cloudcode-pa.sandbox.googleapis.com',
    userAgent: 'antigravity/1.11.3 windows/amd64'
  },
  defaults: { temperature: 1, top_p: 0.85, top_k: 50, max_tokens: 8096 },
  security: { maxRequestSize: '50mb', apiKey: null },
  systemInstruction: 'You are a chatbot, dedicated to providing chat and emotional support for users, assisting with novel writing or role-playing, and also providing math or coding advice'
};

let config = JSON.parse(JSON.stringify(defaultConfig));

export function reloadConfig() {
  try {
    const newConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

    // Recursively merge config
    // 1. Basic merge
    Object.assign(config, newConfig);

    // 2. Deep merge key parts
    if (newConfig.server) Object.assign(config.server, newConfig.server);
    if (newConfig.api) Object.assign(config.api, newConfig.api);
    if (newConfig.defaults) Object.assign(config.defaults, newConfig.defaults);
    if (newConfig.security) Object.assign(config.security, newConfig.security);

    log.info('✓ Config file reloaded');
    return true;
  } catch (error) {
    log.error('⚠ Failed to reload config file:', error.message);
    return false;
  }
}

// Initial load
reloadConfig();

export default config;
