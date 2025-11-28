import tokenManager from '../auth/token_manager.js';
import config from '../config/config.js';

export async function generateAssistantResponse(requestBody, callback, isImageModel = false, model = null) {
  const token = await tokenManager.getToken(model);

  if (!token) {
    throw new Error('No available token, please run npm run login to get token');
  }

  // Use different endpoint for image models
  const url = isImageModel ? config.api.imageUrl : config.api.url;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 403) {
      tokenManager.disableCurrentToken(token);
      throw new Error(`This account has no access permission, automatically disabled. Error details: ${errorText}`);
    }
    if (response.status === 429) {
      // Parse quota reset time from error response
      try {
        const errorData = JSON.parse(errorText);
        const errorInfo = errorData.error?.details?.find(d => d['@type']?.includes('ErrorInfo'));
        if (errorInfo?.metadata?.quotaResetTimeStamp) {
          const resetTimestamp = new Date(errorInfo.metadata.quotaResetTimeStamp).getTime();
          const rateLimitedModel = errorInfo.metadata.model || model;
          tokenManager.setQuotaCooldown(token, rateLimitedModel, resetTimestamp);
          // Retry with a different token
          return generateAssistantResponse(requestBody, callback, isImageModel, model);
        }
      } catch (e) {
        // If parsing fails, just throw the error
      }
    }
    throw new Error(`API request failed (${response.status}): ${errorText}`);
  }

  // SSE streaming for all models
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let thinkingStarted = false;
  let toolCalls = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines only
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6);
      try {
        const data = JSON.parse(jsonStr);
        const parts = data.response?.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.thought === true) {
              if (!thinkingStarted) {
                callback({ type: 'thinking', content: '<think>\n' });
                thinkingStarted = true;
              }
              callback({ type: 'thinking', content: part.text || '' });
            } else if (part.inlineData) {
              // Handle image generation (Gemini 2.5 Flash Image / Nano Banana)
              if (thinkingStarted) {
                callback({ type: 'thinking', content: '\n</think>\n' });
                thinkingStarted = false;
              }
              const mimeType = part.inlineData.mimeType;
              const imageData = part.inlineData.data;
              const markdownImage = `![Generated Image](data:${mimeType};base64,${imageData})`;
              callback({ type: 'text', content: markdownImage });
            } else if (part.text !== undefined) {
              if (thinkingStarted) {
                callback({ type: 'thinking', content: '\n</think>\n' });
                thinkingStarted = false;
              }
              let content = part.text || '';
              if (part.thought_signature) {
                content += `\n<!-- thought_signature: ${part.thought_signature} -->`;
              }

              if (content) {
                callback({ type: 'text', content: content });
              }
            } else if (part.functionCall) {
              toolCalls.push({
                id: part.functionCall.id,
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args)
                }
              });
            }
          }
        }

        // When encountering finishReason, send all collected tool calls
        if (data.response?.candidates?.[0]?.finishReason && toolCalls.length > 0) {
          if (thinkingStarted) {
            callback({ type: 'thinking', content: '\n</think>\n' });
            thinkingStarted = false;
          }
          callback({ type: 'tool_calls', tool_calls: toolCalls });
          toolCalls = [];
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
}

export async function getAvailableModels() {
  const token = await tokenManager.getToken();

  if (!token) {
    throw new Error('No available token, please run npm run login to get token');
  }

  const response = await fetch(config.api.modelsUrl, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get model list (${response.status}): ${errorText}`);
  }

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`JSON parse failed: ${e.message}. Raw response: ${responseText.substring(0, 200)}`);
  }

  return {
    object: 'list',
    data: Object.keys(data.models).map(id => ({
      id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'google'
    }))
  };
}
