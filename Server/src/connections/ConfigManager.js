import Redis from 'ioredis';
import { loggerUtils, errorHandler } from '../utils/logger.js';
import EventEmitter from 'events';

class ConfigManager extends EventEmitter {
  constructor(supabase) {
    super();
    this.supabase = supabase;
    this.configCache = new Map();
    this.redis = null;
    this.setupRedis();
    this.setupDatabaseListeners();
  }

  setupRedis() {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: process.env.REDIS_DB || 0,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });

      this.redis.on('error', (error) => {
        loggerUtils.error('Redis connection error:', error);
        // Fallback to in-memory cache only
        this.redis = null;
      });

      this.redis.on('connect', () => {
        loggerUtils.info('Redis connected successfully');
      });

      this.redis.on('ready', () => {
        loggerUtils.info('Redis is ready to accept commands');
      });
    } catch (error) {
      loggerUtils.error('Failed to setup Redis:', error);
      this.redis = null;
    }
  }

  async setupDatabaseListeners() {
    try {
      // Subscribe to changes in connections table
      const channel = this.supabase
        .channel('connections_changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'connections' 
          }, 
          this.handleConnectionChange.bind(this)
        )
        .subscribe();

      loggerUtils.info('Database listeners setup completed');
    } catch (error) {
      errorHandler(error, {
        module: 'ConfigManager.setupDatabaseListeners',
        operation: 'setup_listeners'
      });
    }
  }

  async handleConnectionChange(payload) {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      const connectionId = newRecord?.id || oldRecord?.id;

      if (!connectionId) {
        loggerUtils.warn('Connection change event received without connection ID');
        return;
      }
 

      // Update cache
      await this.updateCache(connectionId, newRecord);

      // Emit event to notify connection instances
      this.emit('configUpdate', connectionId, newRecord);
    } catch (error) {
      errorHandler(error, {
        module: 'ConfigManager.handleConnectionChange',
        operation: 'handle_change',
        payload
      });
    }
  }

  async updateCache(connectionId, config) {
    try {
      // Update in-memory cache
      this.configCache.set(connectionId, config);

      // Update Redis cache if available
      if (this.redis) {
        try {
          await this.redis.set(
            `connection:${connectionId}:config`,
            JSON.stringify(config),
            'EX',
            3600 // Expire after 1 hour
          );
          loggerUtils.info('Redis cache updated', {
            connectionId,
            configKeys: Object.keys(config || {})
          });
        } catch (redisError) {
          loggerUtils.error('Failed to update Redis cache:', redisError);
          // Continue with in-memory cache only
        }
      }

      loggerUtils.info('Cache updated', {
        connectionId,
        cacheType: this.redis ? 'both' : 'memory',
        configKeys: Object.keys(config || {})
      });
    } catch (error) {
      errorHandler(error, {
        module: 'ConfigManager.updateCache',
        operation: 'update_cache',
        connectionId
      });
    }
  }

  async getConfig(connectionId) {
    try {
      // Try to get from cache first
      if (this.configCache.has(connectionId)) {
        const cachedConfig = this.configCache.get(connectionId);
        loggerUtils.info('Config retrieved from cache', { connectionId });
        return cachedConfig;
      }

      // If not in cache, get from database
      const { data, error } = await this.supabase
        .from('connections')
        .select('*')
        .eq('id', connectionId)
        .single();

      if (error) {
        loggerUtils.error('Error fetching config from database', { error, connectionId });
        return null;
      }

      if (!data) {
        loggerUtils.warn('No config found in database', { connectionId });
        return null;
      }

      // Get agent URL from ai_agents table if ai_agent_id exists
      let agentUrl = '';
      if (data.ai_agent_id) {
        try {
          const { data: agentData, error: agentError } = await this.supabase
            .from('ai_agents')
            .select('agent_url')
            .eq('id', data.ai_agent_id)
            .single();
          
          if (!agentError && agentData) {
            agentUrl = agentData.agent_url || '';
          }
        } catch (agentError) {
          loggerUtils.warn('Failed to fetch agent URL', { error: agentError, connectionId, aiAgentId: data.ai_agent_id });
        }
      }

      // Ensure webhook_config has the correct structure
      const config = {
        webhookConfig: data.webhook_config || {
          url: '',
          triggers: {
            group: false,
            private: false,
            broadcast: false,
            newsletter: false
          }
        },
        agentConfig: {
          agentUrl: agentUrl,
          aiAgentId: data.ai_agent_id || null
        }
      };

      // Cache the config
      this.configCache.set(connectionId, config);


      loggerUtils.info('Config loaded from database', { 
        connectionId,
        hasWebhook: !!config.webhookConfig?.url,
        hasAgent: !!config.agentConfig?.agentUrl
      });

      return config;
    } catch (error) {
      loggerUtils.error('Error in getConfig', { error, connectionId });
      return null;
    }
  }

  async clearCache(connectionId) {
    try {
      // Clear in-memory cache
      this.configCache.delete(connectionId);

      // Clear Redis cache if available
      if (this.redis) {
        try {
          await this.redis.del(`connection:${connectionId}:config`);
          loggerUtils.info('Redis cache cleared', { connectionId });
        } catch (redisError) {
          loggerUtils.error('Failed to clear Redis cache:', redisError);
        }
      }

      loggerUtils.info('Cache cleared', {
        connectionId,
        cacheType: this.redis ? 'both' : 'memory'
      });
    } catch (error) {
      errorHandler(error, {
        module: 'ConfigManager.clearCache',
        operation: 'clear_cache',
        connectionId
      });
    }
  }
}

export { ConfigManager }; 