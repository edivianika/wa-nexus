/**
 * Shared utility functions for trigger actions
 */

/**
 * Replaces template variables in a string with their values from context
 * @param {string} str - String containing template variables in {{var}} format
 * @param {object} context - Object containing values to be substituted
 * @returns {string} - String with replaced variables
 */
function replaceTemplate(str, context) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    const value = context[key.trim()];
    // Fallback for mediaUrl and mediaType
    if (value === undefined) {
      if (key.trim() === 'mediaUrl') return context.mediaUrl || '';
      if (key.trim() === 'mediaType') return context.mediaType || 'text';
    }
    return value !== undefined ? value : match;
  });
}

/**
 * Recursively replaces template variables in objects and arrays
 * @param {any} obj - Object or array containing template variables
 * @param {object} context - Object containing values to be substituted
 * @returns {any} - Object with all string values replaced
 */
function deepReplaceTemplate(obj, context) {
  if (typeof obj === 'string') {
    return replaceTemplate(obj, context);
  } else if (Array.isArray(obj)) {
    return obj.map(item => deepReplaceTemplate(item, context));
  } else if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = deepReplaceTemplate(obj[key], context);
    }
    return newObj;
  }
  return obj;
}

/**
 * Creates a standardized template context from the message data
 * @param {object} context - The raw context object from message handler
 * @returns {object} - Standardized context for templates
 */
function createTemplateContext(context) {
  return {
    sender_name: context.alldata.pushName || context.alldata.businessName || 'Unknown',
    message_text: context.message || '',
    sender_number: context.alldata.key.remoteJid ? context.alldata.key.remoteJid.split('@')[0] : '',
    media_url: context.mediaUrl || '',
    media_type: context.mediaType || 'text',
    // Media details for template variables
    media: context.media || null,
    mediaUrl: context.mediaUrl || '',
    media_filename: context.media?.filename || '',
    media_mimetype: context.media?.mimetype || '',
    media_size: context.media?.size || 0,
    media_timestamp: context.media?.timestamp || '',
    device_name: context.connection.name,
    api_key: context.connection.apiKey,
    device_id: context.connection.id,
    ...context // include other fields for backward compatibility
  };
}

export {
  replaceTemplate,
  deepReplaceTemplate,
  createTemplateContext
}; 