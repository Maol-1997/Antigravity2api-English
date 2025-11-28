import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import path from 'path';
import { spawn } from 'child_process';
import logger from '../utils/logger.js';

const ACCOUNTS_FILE = path.join(process.cwd(), 'data', 'accounts.json');

// Read all accounts
export async function loadAccounts() {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Save accounts
async function saveAccounts(accounts) {
  const dir = path.dirname(ACCOUNTS_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
}

// Delete account
export async function deleteAccount(index) {
  const accounts = await loadAccounts();
  if (index < 0 || index >= accounts.length) {
    throw new Error('Invalid account index');
  }
  accounts.splice(index, 1);
  await saveAccounts(accounts);
  logger.info(`Account ${index} deleted`);
  return true;
}

// Enable/disable account
export async function toggleAccount(index, enable) {
  const accounts = await loadAccounts();
  if (index < 0 || index >= accounts.length) {
    throw new Error('Invalid account index');
  }
  accounts[index].enable = enable;
  await saveAccounts(accounts);
  logger.info(`Account ${index} ${enable ? 'enabled' : 'disabled'}`);
  return true;
}

// Trigger login flow
export async function triggerLogin() {
  return new Promise((resolve, reject) => {
    logger.info('Starting login flow...');

    const loginScript = path.join(process.cwd(), 'scripts', 'oauth-server.js');
    const child = spawn('node', [loginScript], {
      stdio: 'pipe',
      shell: true
    });

    let authUrl = '';
    let output = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;

      // 提取授权 URL
      const urlMatch = text.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[^\s]+)/);
      if (urlMatch) {
        authUrl = urlMatch[1];
      }

      logger.info(text.trim());
    });

    child.stderr.on('data', (data) => {
      logger.error(data.toString().trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        logger.info('Login flow completed');
        resolve({ success: true, authUrl, message: 'Login successful' });
      } else {
        reject(new Error('Login flow failed'));
      }
    });

    // Return auth URL after 5 seconds, don't wait for completion
    setTimeout(() => {
      if (authUrl) {
        resolve({ success: true, authUrl, message: 'Please complete authorization in browser' });
      }
    }, 5000);

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Get account statistics
export async function getAccountStats() {
  const accounts = await loadAccounts();
  return {
    total: accounts.length,
    enabled: accounts.filter(a => a.enable !== false).length,
    disabled: accounts.filter(a => a.enable === false).length
  };
}

// Manually add token from callback URL
import https from 'https';

const CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

// Get Google account info
export async function getAccountName(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v2/userinfo',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const data = JSON.parse(body);
          resolve({
            email: data.email,
            name: data.name || data.email
          });
        } else {
          resolve({ email: 'Unknown', name: 'Unknown' });
        }
      });
    });

    req.on('error', () => resolve({ email: 'Unknown', name: 'Unknown' }));
    req.end();
  });
}

export async function addTokenFromCallback(callbackUrl) {
  // Parse callback URL
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const port = url.port || '80';

  if (!code) {
    throw new Error('Authorization code (code) not found in callback URL');
  }

  logger.info(`Exchanging authorization code for token...`);

  // Exchange authorization code for token
  const tokenData = await exchangeCodeForToken(code, port, url.origin);

  // Save account
  const account = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
    timestamp: Date.now(),
    enable: true
  };

  const accounts = await loadAccounts();
  accounts.push(account);
  await saveAccounts(accounts);

  logger.info('Token saved successfully');
  return { success: true, message: 'Token added successfully' };
}

function exchangeCodeForToken(code, port, origin) {
  return new Promise((resolve, reject) => {
    const redirectUri = `${origin}/oauth-callback`;

    const postData = new URLSearchParams({
      code: code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          logger.error(`Token exchange failed: ${body}`);
          reject(new Error(`Token exchange failed: ${res.statusCode} - ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Batch import tokens
export async function importTokens(filePath) {
  try {
    logger.info('Starting token import...');

    // Check if it's a ZIP file
    if (filePath.endsWith('.zip') || true) {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();

      // Find tokens.json
      const tokensEntry = zipEntries.find(entry => entry.entryName === 'tokens.json');
      if (!tokensEntry) {
        throw new Error('tokens.json not found in ZIP file');
      }

      const tokensContent = tokensEntry.getData().toString('utf8');
      const importedTokens = JSON.parse(tokensContent);

      // Validate data format
      if (!Array.isArray(importedTokens)) {
        throw new Error('tokens.json format error: should be an array');
      }

      // Load existing accounts
      const accounts = await loadAccounts();

      // Add new accounts
      let addedCount = 0;
      for (const token of importedTokens) {
        // Check if already exists
        const exists = accounts.some(acc => acc.access_token === token.access_token);
        if (!exists) {
          accounts.push({
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_in: token.expires_in,
            timestamp: token.timestamp || Date.now(),
            enable: token.enable !== false
          });
          addedCount++;
        }
      }

      // Save accounts
      await saveAccounts(accounts);

      // Clean up uploaded file
      try {
        await fs.unlink(filePath);
      } catch (e) {
        logger.warn('Failed to clean up uploaded file:', e);
      }

      logger.info(`Successfully imported ${addedCount} token accounts`);
      return {
        success: true,
        count: addedCount,
        total: importedTokens.length,
        skipped: importedTokens.length - addedCount,
        message: `Successfully imported ${addedCount} token accounts${importedTokens.length - addedCount > 0 ? `, skipped ${importedTokens.length - addedCount} duplicate accounts` : ''}`
      };
    }
  } catch (error) {
    logger.error('Failed to import tokens:', error);
    // Clean up uploaded file
    try {
      await fs.unlink(filePath);
    } catch (e) {}
    throw error;
  }
}
