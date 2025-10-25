import { refreshTriggers } from '../services/triggerService.js';
import { getConnectionIdFromRequest } from '../../utils/middleware.js';

/**
 * Controller to handle refreshing the message triggers cache.
 */
async function refreshTriggersCache(req, res) {
  try {
    // Get connectionId from URL parameter
    const connectionId = req.params.connectionId;
    if (!connectionId) {
      return res.status(400).json({ success: false, message: 'Connection ID is required.' });
    }

    console.log(`[TRIGGER_CONTROLLER] Refreshing triggers for connection: ${connectionId}`);

    const result = await refreshTriggers(connectionId);

    if (result.success) {
      console.log(`[TRIGGER_CONTROLLER] Successfully refreshed triggers for connection: ${connectionId}`);
      return res.status(200).json(result);
    } else {
      console.error(`[TRIGGER_CONTROLLER] Failed to refresh triggers for connection ${connectionId}:`, result);
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error('[TRIGGER_CONTROLLER] Error refreshing triggers cache:', error);
    return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
}

export {
  refreshTriggersCache,
}; 