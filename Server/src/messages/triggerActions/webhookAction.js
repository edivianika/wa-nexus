/**
 * Webhook action handler for message triggers
 * Sends message data to an external webhook URL
 */
import axios from 'axios';
import { deepReplaceTemplate, createTemplateContext } from './utils.js';

/**
 * Sends message data to a webhook URL
 * @param {object} action - The webhook action configuration
 * @param {object} context - Message context containing all relevant message data
 * @returns {Promise<object>} - Response from the webhook
 */
async function execute(action, context) {
  if (!action.url) {
    throw new Error('Webhook URL is required');
  }
  
  const method = action.method || 'POST';
  const templateContext = createTemplateContext({
    ...context,
    mediaUrl: context.mediaUrl,
    media: context.media
  });
  
  let body;

  // Check if custom body is defined
  if (action.body && typeof action.body === 'object' && Object.keys(action.body).length > 0) {
    // Process templates in body and merge with simplifiedMessage
    const customBody = deepReplaceTemplate(action.body, templateContext);
    
    // Merge simplifiedMessage with customBody (customBody takes precedence)
    body = {
      ...context.simplifiedMessage,
      mediaUrl: context.mediaUrl,
      media: context.media,
      ...customBody
    };
  } else {
    // If no body defined, use simplifiedMessage with media details
    body = {
      ...context.simplifiedMessage,
      mediaUrl: context.mediaUrl,
      media: context.media
    };
  }
  
  // Parse headers: convert array to object if needed
  let headers = {};
  if (Array.isArray(action.headers)) {
    action.headers.forEach(h => {
      if (typeof h === 'object' && h !== null) {
        Object.entries(h).forEach(([k, v]) => {
          headers[k] = v;
        });
      }
    });
  } else if (typeof action.headers === 'object' && action.headers !== null) {
    headers = { ...action.headers };
  }
  
  // Replace templates in headers
  headers = deepReplaceTemplate(headers, templateContext);

  let data = body;
  
  // If body is object, ensure Content-Type is set for JSON
  let contentType = headers['Content-Type'] || headers['content-type'] || '';
  if (typeof data === 'object' && data !== null) {
    if (!contentType) {
      headers['Content-Type'] = 'application/json';
    }
    data = JSON.stringify(data);
  }
  
  // Configure and send the request
  const axiosConfig = {
    method,
    url: action.url,
    headers,
    data,
    timeout: 10000
  };
  
  try {
    const resp = await axios(axiosConfig);
    console.log('[TRIGGER:Webhook] Called:', action.url, resp.status);
    return resp.data;
  } catch (err) {
    console.error('[TRIGGER:Webhook] Error:', err?.response?.data || err.message || err);
    throw err;
  }
}

export default {
  execute
}; 