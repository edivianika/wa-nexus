import { supabase, supabaseAdmin } from '../../utils/supabaseClient.js';
import { client as redis } from '../../utils/redis.js';
import ConnectionManager from '../../connections/ConnectionManager.js';

/**
 * Refreshes the message triggers cache in Redis for a specific connection.
 * @param {string} connectionId - The ID of the connection to refresh.
 * @returns {Promise<{success: boolean, message: string, error?: any}>}
 */
async function refreshTriggers(connectionId) {
  try {
    console.log(`[TRIGGER_SERVICE] Starting refresh for connection: ${connectionId}`);
    
    // 1. Fetch the latest triggers from Supabase
    const cacheKey = `triggers:${connectionId}`; 
    
    // Clear existing cache with timeout
    try {
      const clearPromise = redis.del(cacheKey);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis del timeout')), 5000)
      );
      
      await Promise.race([clearPromise, timeoutPromise]);
      console.log(`[TRIGGER_SERVICE] Cleared cache for connection: ${connectionId}`);
    } catch (redisError) {
      console.warn(`[TRIGGER_SERVICE] Failed to clear cache for connection ${connectionId}:`, redisError);
      // Continue execution even if cache clear fails
    }

    // Fetch triggers from database
    const { data: dbData, error: dbError } = await supabase
      .from('message_triggers')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('status', 'active');
      
    console.log(`[TRIGGER_SERVICE] Fetched ${dbData?.length || 0} triggers for connection: ${connectionId}`);

    // Handle database errors
    if (dbError) {
      console.error(`[TRIGGER_SERVICE] Database error for connection ${connectionId}:`, dbError);
      return { success: false, message: 'Failed to fetch triggers from database', error: dbError };
    }

    // Save to Redis on success with timeout
    if (dbData && redis) {
      try {
        const setPromise = redis.set(cacheKey, JSON.stringify(dbData), 'EX', 3600);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis set timeout')), 5000)
        );
        
        await Promise.race([setPromise, timeoutPromise]);
        console.log(`[TRIGGER_SERVICE] Cached ${dbData.length} triggers for connection: ${connectionId}`);
      } catch (redisError) {
        console.error(`[TRIGGER_SERVICE] Failed to save triggers to Redis cache for connection ${connectionId}:`, redisError);
        // Don't fail the entire operation if Redis fails
      }
    }

    // Log success
    console.log(`[TRIGGER_SERVICE] Successfully refreshed triggers cache for connection: ${connectionId}`);

    return { success: true, message: 'Message triggers cache refreshed successfully.' };
  } catch (error) {
    console.error(`[TRIGGER_SERVICE] Unexpected error in refreshTriggers for connection ${connectionId}:`, error);
    return { success: false, message: error.message, error };
  }
}

export {
  refreshTriggers,
}; 