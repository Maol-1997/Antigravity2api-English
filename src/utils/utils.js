import { randomUUID } from 'crypto';
import config from '../config/config.js';

function generateRequestId() {
  return `agent-${randomUUID()}`;
}
function extractImagesFromContent(content) {
  const result = { text: '', images: [] };

  // If content is string, return directly
  if (typeof content === 'string') {
    result.text = content;
    return result;
  }

  // If content is array (multimodal format)
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'text') {
        result.text += item.text;
      } else if (item.type === 'image_url') {
        // Extract base64 image data
        const imageUrl = item.image_url?.url || '';

        // Match data:image/{format};base64,{data} format
        const match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          const format = match[1]; // e.g., png, jpeg, jpg
          const base64Data = match[2];
          result.images.push({
            inlineData: {
              mimeType: `image/${format}`,
              data: base64Data
            }
          })
        }
      }
    }
  }

  return result;
}
function handleUserMessage(extracted, antigravityMessages) {
  antigravityMessages.push({
    role: "user",
    parts: [
      {
        text: extracted.text
      },
      ...extracted.images
    ]
  })
}
function handleAssistantMessage(message, antigravityMessages) {
  const lastMessage = antigravityMessages[antigravityMessages.length - 1];
  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;

  let contentText = '';
  if (typeof message.content === 'string') {
    contentText = message.content;
  } else if (Array.isArray(message.content)) {
    for (const item of message.content) {
      if (item.type === 'text') {
        contentText += item.text;
      }
    }
  }

  const hasContent = contentText && contentText.trim() !== '';

  const antigravityTools = hasToolCalls ? message.tool_calls.map(toolCall => ({
    functionCall: {
      id: toolCall.id,
      name: toolCall.function.name,
      args: {
        query: toolCall.function.arguments
      }
    }
  })) : [];

  if (lastMessage?.role === "model" && hasToolCalls && !hasContent) {
    lastMessage.parts.push(...antigravityTools)
  } else {
    const parts = [];
    if (hasContent) {
      let text = contentText;
      let thoughtSignature = null;
      const signatureMatch = text.match(/<!-- thought_signature: (.+?) -->/);
      if (signatureMatch) {
        thoughtSignature = signatureMatch[1];
        text = text.replace(signatureMatch[0], '').trim();
      }

      const part = { text };
      if (thoughtSignature) {
        part.thought_signature = thoughtSignature;
      }
      parts.push(part);
    }
    parts.push(...antigravityTools);

    antigravityMessages.push({
      role: "model",
      parts
    })
  }
}
function handleToolCall(message, antigravityMessages) {
  // Find the corresponding functionCall name from previous model messages
  let functionName = '';
  for (let i = antigravityMessages.length - 1; i >= 0; i--) {
    if (antigravityMessages[i].role === 'model') {
      const parts = antigravityMessages[i].parts;
      for (const part of parts) {
        if (part.functionCall && part.functionCall.id === message.tool_call_id) {
          functionName = part.functionCall.name;
          break;
        }
      }
      if (functionName) break;
    }
  }

  const lastMessage = antigravityMessages[antigravityMessages.length - 1];
  const functionResponse = {
    functionResponse: {
      id: message.tool_call_id,
      name: functionName,
      response: {
        output: message.content
      }
    }
  };

  // If last message is user and contains functionResponse, merge
  if (lastMessage?.role === "user" && lastMessage.parts.some(p => p.functionResponse)) {
    lastMessage.parts.push(functionResponse);
  } else {
    antigravityMessages.push({
      role: "user",
      parts: [functionResponse]
    });
  }
}
function openaiMessageToAntigravity(openaiMessages) {
  const antigravityMessages = [];
  for (const message of openaiMessages) {
    if (message.role === "user" || message.role === "system") {
      const extracted = extractImagesFromContent(message.content);
      handleUserMessage(extracted, antigravityMessages);
    } else if (message.role === "assistant") {
      handleAssistantMessage(message, antigravityMessages);
    } else if (message.role === "tool") {
      handleToolCall(message, antigravityMessages);
    }
  }

  return antigravityMessages;
}
function generateGenerationConfig(parameters, enableThinking, actualModelName) {
  const generationConfig = {
    topP: parameters.top_p ?? config.defaults.top_p,
    topK: parameters.top_k ?? config.defaults.top_k,
    temperature: parameters.temperature ?? config.defaults.temperature,
    candidateCount: 1,
    maxOutputTokens: parameters.max_tokens ?? config.defaults.max_tokens,
    stopSequences: [
      "<|user|>",
      "<|bot|>",
      "<|context_request|>",
      "<|endoftext|>",
      "<|end_of_turn|>"
    ]
  }

  // Enable image generation for image models
  if (actualModelName.includes('image')) {
    generationConfig.responseModalities = ["TEXT", "IMAGE"];
    // 4K resolution only for gemini-3-pro-image
    if (actualModelName.includes('gemini-3-pro-image')) {
      generationConfig.imageConfig = {
        aspectRatio: "5:4",
        imageSize: "4K"
      };
    }
  }

  if (enableThinking) {
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: 1024
    };
  }

  if (enableThinking && actualModelName.includes("claude")) {
    delete generationConfig.topP;
  }
  return generationConfig
}
function convertOpenAIToolsToAntigravity(openaiTools) {
  if (!openaiTools || openaiTools.length === 0) return [];
  return openaiTools.map((tool) => {
    delete tool.function.parameters.$schema;
    return {
      functionDeclarations: [
        {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }
      ]
    }
  })
}
function modelMapping(modelName) {
  if (modelName === "claude-sonnet-4-5-thinking") {
    return "claude-sonnet-4-5";
  } else if (modelName === "claude-opus-4-5") {
    return "claude-opus-4-5-thinking";
  } else if (modelName === "gemini-2.5-flash-thinking") {
    return "gemini-2.5-flash";
  }
  return modelName;
}

function isEnableThinking(modelName) {
  return modelName.endsWith('-thinking') ||
    modelName === 'gemini-2.5-pro' ||
    modelName === 'gemini-2.5-pro-image' ||
    modelName.startsWith('gemini-3-pro-') ||
    modelName === "rev19-uic3-1p" ||
    modelName === "gpt-oss-120b-medium"
}

function generateRequestBody(openaiMessages, modelName, parameters, openaiTools, token) {
  const enableThinking = isEnableThinking(modelName);
  const actualModelName = modelMapping(modelName);

  return {
    project: token.projectId,
    requestId: generateRequestId(),
    request: {
      contents: openaiMessageToAntigravity(openaiMessages),
      systemInstruction: {
        role: "user",
        parts: [{ text: config.systemInstruction }]
      },
      tools: [{ google_search: {} }, ...convertOpenAIToolsToAntigravity(openaiTools)],
      toolConfig: {
        functionCallingConfig: {
          mode: "VALIDATED"
        }
      },
      generationConfig: generateGenerationConfig(parameters, enableThinking, actualModelName),
      sessionId: token.sessionId
    },
    model: actualModelName,
    userAgent: "antigravity"
  }
}
export {
  generateRequestId,
  generateRequestBody
}
