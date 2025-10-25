import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';

/**
 * BaseWorker class to standardize worker implementation across the application
 * This provides consistent handling for events, logging, and connection management
 */
class BaseWorker {
  /**
   * Create a new base worker
   * @param {string} queueName - The name of the queue to process
   * @param {Function} processFunction - The function to process jobs
   * @param {Object} options - Worker options
   */
  constructor(queueName, processFunction, options = {}) {
    this.queueName = queueName;
    this.processFunction = processFunction;
    
    // Default options
    this.options = {
      concurrency: 5,
      ...options
    };
    
    // Logging control
    this.isVerboseLogging = process.env.LOG_VERBOSE === 'true';
    
    // Initialize connections
    this.initializeRedis();
    this.initializeSupabase();
    
    // Create worker
    this.worker = new Worker(
      this.queueName,
      this.wrapProcessFunction.bind(this),
      {
        connection: this.redis,
        ...this.options
      }
    );
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Performance metrics
    this.metrics = {
      processed: 0,
      failed: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
  }
  
  /**
   * Utility method to log only important messages or when verbose logging is enabled
   * @param {string} message - The message to log
   * @param {boolean} isImportant - Whether this is an important message that should always be logged
   */
  log(message, isImportant = false) {
    if (isImportant || this.isVerboseLogging) {
      console.log(message);
    }
  }
  
  /**
   * Initialize Redis connection with proper error handling
   */
  initializeRedis() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        this.log(`[${this.queueName}] Redis connection retry ${times} in ${delay}ms`, times > 3);
        return delay;
      }
    });
    
    this.redis.on('error', (err) => {
      console.error(`[${this.queueName}] Redis connection error:`, err);
    });
    
    this.redis.on('connect', () => {
      this.log(`[${this.queueName}] Redis connected successfully`, true);
    });
  }
  
  /**
   * Initialize Supabase connection
   */
  initializeSupabase() {
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
  }
  
  /**
   * Set up event handlers for the worker
   */
  setupEventHandlers() {
    // Handle completed jobs
    this.worker.on('completed', (job, result) => {
      const processingTime = Date.now() - job.timestamp;
      this.metrics.processed++;
      this.metrics.totalProcessingTime += processingTime;
      this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.processed;
      
      // Only log if the job took longer than expected
      if (processingTime > 5000) {
        this.log(`[${this.queueName}] Job ${job.id} completed in ${processingTime}ms (slow)`, true);
      } else {
        this.log(`[${this.queueName}] Job ${job.id} completed in ${processingTime}ms`);
      }
    });
    
    // Handle failed jobs
    this.worker.on('failed', (job, err) => {
      this.metrics.failed++;
      console.error(`[${this.queueName}] Job ${job?.id} failed:`, err);
    });
    
    // Handle worker errors
    this.worker.on('error', err => {
      console.error(`[${this.queueName}] Worker error:`, err);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', this.shutdown.bind(this));
    process.on('SIGINT', this.shutdown.bind(this));
  }
  
  /**
   * Wrap the process function to add timing and error handling
   */
  async wrapProcessFunction(job) {
    this.log(`[${this.queueName}] Processing job ${job.id} of type ${job.name}`);
    const startTime = Date.now();
    
    try {
      const result = await this.processFunction(job);
      const processingTime = Date.now() - startTime;
      
      // Only log if the job took longer than expected
      if (processingTime > 5000) {
        this.log(`[${this.queueName}] Job ${job.id} processed in ${processingTime}ms (slow)`, true);
      } else {
        this.log(`[${this.queueName}] Job ${job.id} processed in ${processingTime}ms`);
      }
      
      return result;
    } catch (error) {
      console.error(`[${this.queueName}] Error processing job ${job.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Gracefully shutdown the worker
   */
  async shutdown() {
    this.log(`[${this.queueName}] Shutting down gracefully...`, true);
    
    try {
      await this.worker.close();
      await this.redis.quit();
      this.log(`[${this.queueName}] Shutdown complete`, true);
    } catch (err) {
      console.error(`[${this.queueName}] Error during shutdown:`, err);
    }
    
    process.exit(0);
  }
  
  /**
   * Get current performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString()
    };
  }
}

export default BaseWorker; 