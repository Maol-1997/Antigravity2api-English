import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateAssistantResponse, getAvailableModels } from '../api/client.js';
import { generateRequestBody } from '../utils/utils.js';
import logger from '../utils/logger.js';
import config from '../config/config.js';
import adminRoutes, { incrementRequestCount, addLog } from '../admin/routes.js';
import { validateKey, checkRateLimit } from '../admin/key_manager.js';
import idleManager from '../utils/idle_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure required directories exist
const ensureDirectories = () => {
  const dirs = ['data', 'uploads'];
  dirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  });
};

ensureDirectories();

const app = express();

app.use(express.json({ limit: config.security.maxRequestSize }));

// Static file serving - provides admin console pages
app.use(express.static(path.join(process.cwd(), 'client/dist')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: `Request body too large, maximum supported: ${config.security.maxRequestSize}` });
  }
  next(err);
});

// ... (rest of the file)



// Request logging middleware
app.use((req, res, next) => {
  // Record request activity, manage idle state
  if (req.path.startsWith('/v1/')) {
    idleManager.recordActivity();
  }

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req.method, req.path, res.statusCode, duration);

    // Log to admin logs
    if (req.path.startsWith('/v1/')) {
      incrementRequestCount();
      addLog('info', `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API key validation and rate limiting middleware
app.use(async (req, res, next) => {
  if (req.path.startsWith('/v1/')) {
    const apiKey = config.security?.apiKey;
    if (apiKey) {
      const authHeader = req.headers.authorization;
      const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

      // First check config file key (not rate limited)
      if (providedKey === apiKey) {
        return next();
      }

      // Then check database keys
      const isValid = await validateKey(providedKey);
      if (!isValid) {
        logger.warn(`API Key validation failed: ${req.method} ${req.path}`);
        await addLog('warn', `API Key validation failed: ${req.method} ${req.path}`);
        return res.status(401).json({ error: 'Invalid API Key' });
      }

      // Check rate limit
      const rateLimitCheck = await checkRateLimit(providedKey);
      if (!rateLimitCheck.allowed) {
        logger.warn(`Rate limit: ${req.method} ${req.path} - ${rateLimitCheck.error}`);
        await addLog('warn', `Rate limit triggered: ${providedKey.substring(0, 10)}...`);

        res.setHeader('X-RateLimit-Limit', rateLimitCheck.limit || 0);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', rateLimitCheck.resetIn || 0);

        return res.status(429).json({
          error: {
            message: rateLimitCheck.error,
            type: 'rate_limit_exceeded',
            reset_in_seconds: rateLimitCheck.resetIn
          }
        });
      }

      // Set rate limit response headers
      if (rateLimitCheck.limit) {
        res.setHeader('X-RateLimit-Limit', rateLimitCheck.limit);
        res.setHeader('X-RateLimit-Remaining', rateLimitCheck.remaining);
      }
    }
  }
  next();
});

// Admin routes
app.use('/admin', adminRoutes);

app.get('/v1/models', async (req, res) => {
  try {
    const models = await getAvailableModels();
    res.json(models);
  } catch (error) {
    logger.error('Failed to get model list:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/v1/chat/completions', async (req, res) => {
  let { messages, model, stream = true, tools, ...params } = req.body;
  try {

    if (!messages) {
      return res.status(400).json({ error: 'messages is required' });
    }

    // Smart detection: NewAPI speed test requests usually have simple messages, force non-streaming response
    // Detection conditions: single message + short content (e.g., "hi", "test", etc.)
    const isSingleShortMessage = messages.length === 1 &&
      messages[0].content &&
      messages[0].content.length < 20;

    // If detected as possible speed test request and streaming not explicitly requested, use non-streaming
    if (isSingleShortMessage && req.body.stream === undefined) {
      stream = false;
    }

    const authHeader = req.headers.authorization;
    const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    const requestBody = generateRequestBody(messages, model, params, tools, apiKey);

    // Check if this is an image model
    const isImageModel = model.includes('image');

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const id = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      let hasToolCall = false;

      // State for parsing <think> tags from text content
      let inThinkBlock = false;
      let thinkBuffer = '';

      await generateAssistantResponse(requestBody, (data) => {
        if (data.type === 'tool_calls') {
          hasToolCall = true;
          res.write(`data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{ index: 0, delta: { tool_calls: data.tool_calls }, finish_reason: null }]
          })}\n\n`);
        } else if (data.type === 'thinking') {
          // Native thinking from Gemini - send as reasoning_content
          // Strip <think> and </think> tags
          let content = data.content || '';
          content = content.replace(/<think>\n?/g, '').replace(/\n?<\/think>\n?/g, '');
          if (content) {
            res.write(`data: ${JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: [{ index: 0, delta: { reasoning_content: content }, finish_reason: null }]
            })}\n\n`);
          }
        } else {
          // Regular text - check for <think> tags embedded in content
          let content = data.content || '';

          // Process character by character to handle streaming <think> tags
          let i = 0;
          while (i < content.length) {
            if (!inThinkBlock) {
              // Look for <think> start tag
              const thinkStart = content.indexOf('<think>', i);
              if (thinkStart === i) {
                inThinkBlock = true;
                i += 7; // Skip past <think>
                // Skip newline after <think> if present
                if (content[i] === '\n') i++;
                continue;
              } else if (thinkStart > i) {
                // Send text before <think>
                const textBefore = content.slice(i, thinkStart);
                res.write(`data: ${JSON.stringify({
                  id,
                  object: 'chat.completion.chunk',
                  created,
                  model,
                  choices: [{ index: 0, delta: { content: textBefore }, finish_reason: null }]
                })}\n\n`);
                inThinkBlock = true;
                i = thinkStart + 7;
                if (content[i] === '\n') i++;
                continue;
              } else {
                // No <think> tag, send as regular content
                const remaining = content.slice(i);
                if (remaining) {
                  res.write(`data: ${JSON.stringify({
                    id,
                    object: 'chat.completion.chunk',
                    created,
                    model,
                    choices: [{ index: 0, delta: { content: remaining }, finish_reason: null }]
                  })}\n\n`);
                }
                break;
              }
            } else {
              // Inside think block - look for </think>
              const thinkEnd = content.indexOf('</think>', i);
              if (thinkEnd === -1) {
                // No end tag yet, buffer and send as reasoning
                const reasoning = content.slice(i);
                if (reasoning) {
                  res.write(`data: ${JSON.stringify({
                    id,
                    object: 'chat.completion.chunk',
                    created,
                    model,
                    choices: [{ index: 0, delta: { reasoning_content: reasoning }, finish_reason: null }]
                  })}\n\n`);
                }
                break;
              } else {
                // Found end tag
                const reasoning = content.slice(i, thinkEnd);
                if (reasoning) {
                  // Remove trailing newline before </think>
                  const cleanReasoning = reasoning.replace(/\n$/, '');
                  if (cleanReasoning) {
                    res.write(`data: ${JSON.stringify({
                      id,
                      object: 'chat.completion.chunk',
                      created,
                      model,
                      choices: [{ index: 0, delta: { reasoning_content: cleanReasoning }, finish_reason: null }]
                    })}\n\n`);
                  }
                }
                inThinkBlock = false;
                i = thinkEnd + 8; // Skip past </think>
                // Skip newline after </think> if present
                if (content[i] === '\n') i++;
              }
            }
          }
        }
      }, isImageModel, model);

      res.write(`data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: hasToolCall ? 'tool_calls' : 'stop' }]
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      let fullContent = '';
      let reasoningContent = '';
      let toolCalls = [];
      let inThinkBlock = false;

      await generateAssistantResponse(requestBody, (data) => {
        if (data.type === 'tool_calls') {
          toolCalls = data.tool_calls;
        } else if (data.type === 'thinking') {
          // Native thinking from Gemini
          let content = data.content || '';
          content = content.replace(/<think>\n?/g, '').replace(/\n?<\/think>\n?/g, '');
          reasoningContent += content;
        } else {
          // Check for <think> tags in text content
          let content = data.content || '';

          // Simple regex extraction for non-streaming
          const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
          if (thinkMatch) {
            reasoningContent += thinkMatch[1].trim();
            content = content.replace(/<think>[\s\S]*?<\/think>\n?/g, '');
          }

          fullContent += content;
        }
      }, isImageModel, model);

      const message = { role: 'assistant', content: fullContent.trim() };
      if (reasoningContent) {
        message.reasoning_content = reasoningContent.trim();
      }
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message,
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop'
        }]
      });
    }
  } catch (error) {
    logger.error('Failed to generate response:', error.message);
    if (!res.headersSent) {
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const id = `chatcmpl-${Date.now()}`;
        const created = Math.floor(Date.now() / 1000);
        res.write(`data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: { content: `Error: ${error.message}` }, finish_reason: null }]
        })}\n\n`);
        res.write(`data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
});

// All other requests return index.html (SPA support)
// Express 5 requires (.*) instead of * for wildcard
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(process.cwd(), 'client/dist', 'index.html'));
});

const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(`Server started: ${config.server.host}:${config.server.port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.server.port} is already in use`);
    process.exit(1);
  } else if (error.code === 'EACCES') {
    logger.error(`No permission to access port ${config.server.port}`);
    process.exit(1);
  } else {
    logger.error('Server startup failed:', error.message);
    process.exit(1);
  }
});

const shutdown = () => {
  logger.info('Shutting down server...');

  // Cleanup idle manager
  idleManager.destroy();

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
