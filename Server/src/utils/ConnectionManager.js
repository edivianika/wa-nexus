import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import LRUCache from 'lru-cache';

/**
 * ConnectionManager handles database and Redis connections efficiently
 * with connection pooling and caching mechanisms
 */
class ConnectionManager {
  constructor() {
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      }
    });

    // Set up error handling for Redis
    this.redis.on('error', (err) => {
      console.error('[ConnectionManager] Redis connection error:', err);
    });

    // Initialize LRU caches with size limits
    this.connectionCache = new LRUCache({
      max: 500, // Maximum 500 connections in cache
      ttl: 1000 * 60 * 60, // 1 hour TTL
      updateAgeOnGet: true, // Reset TTL on access
    });

    this.contactCache = new LRUCache({
      max: 10000, // Maximum 10,000 contacts in cache
      ttl: 1000 * 60 * 30, // 30 minutes TTL
      updateAgeOnGet: true, // Reset TTL on access
    });

    // Cache hit/miss statistics
    this.stats = {
      connectionCacheHits: 0,
      connectionCacheMisses: 0,
      contactCacheHits: 0,
      contactCacheMisses: 0,
    };
  }

  /**
   * Get connection details by ID with caching
   * @param {string} connectionId - The connection ID
   * @returns {Promise<Object|null>} - The connection details or null
   */
  async getConnectionDetails(connectionId) {
    try {
      // Check memory cache first
      if (this.connectionCache.has(connectionId)) {
        this.stats.connectionCacheHits++;
        return this.connectionCache.get(connectionId);
      }
      this.stats.connectionCacheMisses++;

      // Try Redis cache next
      const redisKey = `connection:${connectionId}`;
      let connectionInfo = await this.redis.get(redisKey);
      
      if (connectionInfo) {
        try {
          connectionInfo = JSON.parse(connectionInfo);
          if (connectionInfo && connectionInfo.api_key) {
            // Update memory cache
            this.connectionCache.set(connectionId, connectionInfo);
            return connectionInfo;
          }
        } catch (e) {
          console.error(`[ConnectionManager] Error parsing Redis connection info:`, e);
        }
      }
      
      // Get from database if not in cache
      const { data, error } = await this.supabase
        .from('connections')
        .select('id, name, phone_number, api_key, connected, status')
        .eq('id', connectionId)
        .single();
      
      if (error) {
        console.error(`[ConnectionManager] Error fetching connection details:`, error);
        return null;
      }
      
      if (!data) {
        console.error(`[ConnectionManager] Connection not found for ID: ${connectionId}`);
        return null;
      }
      
      // Cache in Redis
      await this.redis.set(redisKey, JSON.stringify(data), 'EX', 3600);
      
      // Cache in memory
      this.connectionCache.set(connectionId, data);
      
      return data;
    } catch (error) {
      console.error(`[ConnectionManager] Error getting connection details:`, error);
      return null;
    }
  }

  /**
   * Get contact details by ID with caching
   * @param {string|number} contactId - The contact ID
   * @returns {Promise<Object|null>} - The contact details or null
   */
  async getContactDetails(contactId) {
    try {
      // For non-numeric IDs (like test contacts), create a test contact
      if (isNaN(contactId)) {
        return {
          id: contactId,
          contact_name: 'Test Contact',
          phone_number: contactId
        };
      }

      // Check memory cache first
      const cacheKey = `contact:${contactId}`;
      if (this.contactCache.has(cacheKey)) {
        this.stats.contactCacheHits++;
        return this.contactCache.get(cacheKey);
      }
      this.stats.contactCacheMisses++;

      // Try Redis cache next
      const redisKey = `contact:${contactId}`;
      let contactInfo = await this.redis.get(redisKey);
      
      if (contactInfo) {
        try {
          contactInfo = JSON.parse(contactInfo);
          if (contactInfo) {
            // Update memory cache
            this.contactCache.set(cacheKey, contactInfo);
            return contactInfo;
          }
        } catch (e) {
          console.error(`[ConnectionManager] Error parsing Redis contact info:`, e);
        }
      }
      
      // Get from database if not in cache
      const { data, error } = await this.supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();
      
      if (error) {
        console.error(`[ConnectionManager] Error fetching contact details:`, error);
        return null;
      }
      
      if (!data) {
        console.error(`[ConnectionManager] Contact not found for ID: ${contactId}`);
        return null;
      }
      
      // Cache in Redis
      await this.redis.set(redisKey, JSON.stringify(data), 'EX', 1800); // 30 minutes
      
      // Cache in memory
      this.contactCache.set(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error(`[ConnectionManager] Error fetching contact details for ID ${contactId}:`, error);
      return null;
    }
  }

  /**
   * Clear cache for a specific connection
   * @param {string} connectionId - The connection ID to clear
   */
  async clearConnectionCache(connectionId) {
    this.connectionCache.delete(connectionId);
    await this.redis.del(`connection:${connectionId}`);
  }

  /**
   * Clear cache for a specific contact
   * @param {string|number} contactId - The contact ID to clear
   */
  async clearContactCache(contactId) {
    const cacheKey = `contact:${contactId}`;
    this.contactCache.delete(cacheKey);
    await this.redis.del(cacheKey);
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      connectionCacheSize: this.connectionCache.size,
      contactCacheSize: this.contactCache.size,
      connectionCacheHitRate: this.stats.connectionCacheHits / 
        (this.stats.connectionCacheHits + this.stats.connectionCacheMisses || 1),
      contactCacheHitRate: this.stats.contactCacheHits / 
        (this.stats.contactCacheHits + this.stats.contactCacheMisses || 1)
    };
  }

  /**
   * Get Redis client instance
   * @returns {Redis} - Redis client instance
   */
  getRedisClient() {
    return this.redis;
  }

  /**
   * Get Supabase client instance
   * @returns {SupabaseClient} - Supabase client instance
   */
  getSupabaseClient() {
    return this.supabase;
  }
}

// Create a singleton instance
const connectionManager = new ConnectionManager();

export default connectionManager; 