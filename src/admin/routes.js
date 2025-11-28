import express from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { createKey, loadKeys, deleteKey, updateKeyRateLimit, getKeyStats } from './key_manager.js';
import { getRecentLogs, clearLogs, addLog } from './log_manager.js';
import { getSystemStatus, incrementRequestCount, getTodayRequestCount } from './monitor.js';
import { loadAccounts, deleteAccount, toggleAccount, triggerLogin, getAccountStats, addTokenFromCallback, getAccountName, importTokens } from './token_admin.js';
import { createSession, validateSession, destroySession, verifyPassword, adminAuth } from './session.js';
import { loadSettings, saveSettings } from './settings_manager.js';
import tokenManager from '../auth/token_manager.js';

// Configure file upload
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Login endpoint (no authentication required)
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Please enter password' });
    }

    if (verifyPassword(password)) {
      const token = createSession();
      await addLog('info', 'Admin login successful');
      res.json({ success: true, token });
    } else {
      await addLog('warn', 'Admin login failed: wrong password');
      res.status(401).json({ error: 'Wrong password' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) {
    destroySession(token);
  }
  res.json({ success: true });
});

// Verify session endpoint
router.get('/verify', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (validateSession(token)) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false });
  }
});

// All following routes require authentication
router.use(adminAuth);

// Generate new key
router.post('/keys/generate', async (req, res) => {
  try {
    const { name, rateLimit, key } = req.body;
    const newKey = await createKey(name, rateLimit, key);
    await addLog('success', `Key generated: ${name || 'Unnamed'}`);
    res.json({ success: true, key: newKey.key, name: newKey.name, rateLimit: newKey.rateLimit });
  } catch (error) {
    await addLog('error', `Failed to generate key: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get all keys
router.get('/keys', async (req, res) => {
  try {
    const keys = await loadKeys();
    // Return key list (hide partial characters)
    const safeKeys = keys.map(k => ({
      ...k,
      key: k.key.substring(0, 10) + '...' + k.key.substring(k.key.length - 4)
    }));
    res.json(keys); // Show full key in admin interface
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete key
router.delete('/keys/:key', async (req, res) => {
  try {
    const { key } = req.params;
    await deleteKey(key);
    await addLog('warn', `Key deleted: ${key.substring(0, 10)}...`);
    res.json({ success: true });
  } catch (error) {
    await addLog('error', `Failed to delete key: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Update key rate limit
router.patch('/keys/:key/ratelimit', async (req, res) => {
  try {
    const { key } = req.params;
    const { rateLimit } = req.body;
    await updateKeyRateLimit(key, rateLimit);
    await addLog('info', `Key rate limit updated: ${key.substring(0, 10)}...`);
    res.json({ success: true });
  } catch (error) {
    await addLog('error', `Failed to update rate limit: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get key stats
router.get('/keys/stats', async (req, res) => {
  try {
    const stats = await getKeyStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await getRecentLogs(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear logs
router.delete('/logs', async (req, res) => {
  try {
    await clearLogs();
    await addLog('info', 'Logs cleared');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get system status
router.get('/status', async (req, res) => {
  try {
    const status = getSystemStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get today's request stats
router.get('/today-requests', async (req, res) => {
  try {
    const todayRequests = getTodayRequestCount();
    res.json({ todayRequests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Token management routes

// Get all accounts
router.get('/tokens', async (req, res) => {
  try {
    const accounts = await loadAccounts();
    // Hide sensitive info, only return necessary fields
    const safeAccounts = accounts.map((acc, index) => ({
      index,
      access_token: acc.access_token?.substring(0, 20) + '...',
      refresh_token: acc.refresh_token ? 'exists' : 'none',
      expires_in: acc.expires_in,
      timestamp: acc.timestamp,
      enable: acc.enable !== false,
      created: new Date(acc.timestamp).toLocaleString()
    }));
    res.json(safeAccounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete account
router.delete('/tokens/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    await deleteAccount(index);
    await addLog('warn', `Token account ${index} deleted`);
    res.json({ success: true });
  } catch (error) {
    await addLog('error', `Failed to delete token: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable account
router.patch('/tokens/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const { enable } = req.body;
    await toggleAccount(index, enable);
    await addLog('info', `Token account ${index} ${enable ? 'enabled' : 'disabled'}`);
    res.json({ success: true });
  } catch (error) {
    await addLog('error', `Failed to toggle token status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable account (POST method support)
router.post('/tokens/toggle', async (req, res) => {
  try {
    const { index, enable } = req.body;
    await toggleAccount(index, enable);
    await addLog('info', `Token account ${index} ${enable ? 'enabled' : 'disabled'}`);
    res.json({ success: true });
  } catch (error) {
    await addLog('error', `Failed to toggle token status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Trigger login flow
router.post('/tokens/login', async (req, res) => {
  try {
    await addLog('info', 'Starting Google OAuth login flow');
    const result = await triggerLogin();
    res.json(result);
  } catch (error) {
    await addLog('error', `Login failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get token stats
router.get('/tokens/stats', async (req, res) => {
  try {
    const stats = await getAccountStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get token usage stats (polling info)
router.get('/tokens/usage', async (req, res) => {
  try {
    const usageStats = tokenManager.getUsageStats();
    res.json(usageStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually add token (via callback URL)
router.post('/tokens/callback', async (req, res) => {
  try {
    const { callbackUrl } = req.body;
    if (!callbackUrl) {
      return res.status(400).json({ error: 'Please provide callback URL' });
    }
    await addLog('info', 'Adding token via callback URL...');
    const result = await addTokenFromCallback(callbackUrl);
    await addLog('success', 'Token successfully added via callback URL');
    res.json(result);
  } catch (error) {
    await addLog('error', `Failed to add token: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get account details (including name)
router.post('/tokens/details', async (req, res) => {
  try {
    const { indices } = req.body;
    const accounts = await loadAccounts();
    const details = [];

    for (const index of indices) {
      if (index >= 0 && index < accounts.length) {
        const account = accounts[index];
        const accountInfo = await getAccountName(account.access_token);
        details.push({
          index,
          email: accountInfo.email,
          name: accountInfo.name,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_in: account.expires_in,
          timestamp: account.timestamp,
          enable: account.enable !== false
        });
      }
    }

    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch export tokens (ZIP format)
router.post('/tokens/export', async (req, res) => {
  try {
    const { indices } = req.body;
    const accounts = await loadAccounts();
    const exportData = [];

    for (const index of indices) {
      if (index >= 0 && index < accounts.length) {
        const account = accounts[index];
        const accountInfo = await getAccountName(account.access_token);
        exportData.push({
          email: accountInfo.email,
          name: accountInfo.name,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expires_in: account.expires_in,
          timestamp: account.timestamp,
          created: new Date(account.timestamp).toLocaleString(),
          enable: account.enable !== false
        });
      }
    }

    await addLog('info', `Batch exported ${exportData.length} token accounts`);

    // Create ZIP file
    const archive = archiver('zip', { zlib: { level: 9 } });
    const timestamp = new Date().toISOString().split('T')[0];

    res.attachment(`tokens_export_${timestamp}.zip`);
    res.setHeader('Content-Type', 'application/zip');

    archive.pipe(res);

    // Add tokens.json file to ZIP
    archive.append(JSON.stringify(exportData, null, 2), { name: 'tokens.json' });

    await archive.finalize();
  } catch (error) {
    await addLog('error', `Batch export failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Batch import tokens (ZIP format)
router.post('/tokens/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a file' });
    }

    await addLog('info', 'Importing token accounts...');
    const result = await importTokens(req.file.path);
    await addLog('success', `Successfully imported ${result.count} token accounts`);
    res.json(result);
  } catch (error) {
    await addLog('error', `Import failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get system settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save system settings
router.post('/settings', async (req, res) => {
  try {
    const result = await saveSettings(req.body);
    await addLog('success', 'System settings updated');
    res.json(result);
  } catch (error) {
    await addLog('error', `Failed to save settings: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { incrementRequestCount, addLog };
