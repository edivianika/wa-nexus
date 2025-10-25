/**
 * Action Registry for Message Triggers
 * This module manages the registration and execution of trigger actions
 */

import webhookAction from './webhookAction.js';
import contactAction from './contactAction.js';

// Register all available actions
const actionHandlers = {
  'webhook': webhookAction.execute,
  'save_contact': contactAction.execute,
  // Add new action handlers here
};

/**
 * Execute a trigger action based on its type
 * @param {object} action - The action configuration from the trigger
 * @param {object} context - The execution context (message data, connection, etc)
 * @returns {Promise} - Result of the action execution
 */
async function executeAction(action, context) {
  if (!action || !action.type) {
    throw new Error('Invalid action: missing type');
  }

  const handler = actionHandlers[action.type];
  if (!handler) {
    throw new Error(`Unknown action type: ${action.type}`);
  }

  try {
    return await handler(action, context);
  } catch (error) {
    console.error(`[TriggerAction] Error executing ${action.type}:`, error);
    throw error;
  }
}

/**
 * Register a new action handler
 * @param {string} actionType - The type identifier for this action
 * @param {function} handler - The handler function for this action type
 */
function registerActionHandler(actionType, handler) {
  if (typeof actionType !== 'string' || !actionType) {
    throw new Error('Action type must be a non-empty string');
  }
  
  if (typeof handler !== 'function') {
    throw new Error('Action handler must be a function');
  }
  
  actionHandlers[actionType] = handler;
  console.log(`[TriggerAction] Registered new action handler: ${actionType}`);
}

export {
  executeAction,
  registerActionHandler
}; 