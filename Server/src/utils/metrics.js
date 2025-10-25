/**
 * Metrics Collection dan Monitoring
 * 
 * Modul ini mengimplementasikan pengumpulan metrik untuk monitoring performa
 * dan kesehatan sistem menggunakan Prometheus.
 */

import client from 'prom-client';
import express from 'express';
import { performance } from 'perf_hooks';

// Buat registry baru
const register = new client.Registry();

// Tambahkan default metrics (GC, memory usage, etc)
client.collectDefaultMetrics({ register });

// Metrics untuk koneksi WhatsApp
const whatsappConnectionGauge = new client.Gauge({
  name: 'whatsapp_connections_active',
  help: 'Jumlah koneksi WhatsApp yang aktif',
  labelNames: ['status']
});

// Metrics untuk message queue
const messageQueueGauge = new client.Gauge({
  name: 'whatsapp_message_queue_size',
  help: 'Jumlah pesan dalam antrian',
  labelNames: ['type', 'status']
});

// Metrics untuk message processing
const messageSendHistogram = new client.Histogram({
  name: 'whatsapp_message_send_duration_seconds',
  help: 'Waktu yang dibutuhkan untuk mengirim pesan (dalam detik)',
  labelNames: ['method', 'status', 'type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60]
});

// Metrics untuk rate limiting
const rateLimitCounter = new client.Counter({
  name: 'whatsapp_rate_limit_hits_total',
  help: 'Jumlah kali rate limit tercapai',
  labelNames: ['key', 'limit', 'window']
});

// Metrics untuk circuit breaker
const circuitBreakerGauge = new client.Gauge({
  name: 'whatsapp_circuit_breaker_state',
  help: 'Status circuit breaker (0=closed, 1=open, 0.5=half-open)',
  labelNames: ['service']
});

// Metrics untuk error
const errorCounter = new client.Counter({
  name: 'whatsapp_errors_total',
  help: 'Jumlah error yang terjadi',
  labelNames: ['type', 'service']
});

// Metrics untuk HTTP requests
const httpRequestDurationHistogram = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durasi HTTP requests dalam detik',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});

// Metrics untuk Redis operations
const redisOperationDurationHistogram = new client.Histogram({
  name: 'redis_operation_duration_seconds',
  help: 'Durasi operasi Redis dalam detik',
  labelNames: ['operation', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});

// Register semua metrics
register.registerMetric(whatsappConnectionGauge);
register.registerMetric(messageQueueGauge);
register.registerMetric(messageSendHistogram);
register.registerMetric(rateLimitCounter);
register.registerMetric(circuitBreakerGauge);
register.registerMetric(errorCounter);
register.registerMetric(httpRequestDurationHistogram);
register.registerMetric(redisOperationDurationHistogram);

/**
 * Track waktu eksekusi fungsi dan catat sebagai metrik
 * @param {Function} fn - Fungsi yang akan dieksekusi dan diukur
 * @param {string} metricName - Nama metrik yang akan digunakan
 * @param {Object} labels - Label untuk metrik
 * @returns {Promise<any>} - Hasil eksekusi fungsi
 */
async function trackDuration(fn, metricName, labels = {}) {
  const startTime = performance.now();
  try {
    const result = await fn();
    const duration = (performance.now() - startTime) / 1000; // Convert to seconds
    
    // Record duration based on metric name
    switch (metricName) {
      case 'message_send':
        messageSendHistogram.observe({ ...labels, status: 'success' }, duration);
        break;
      case 'http_request':
        httpRequestDurationHistogram.observe({ ...labels, status_code: labels.status_code || 200 }, duration);
        break;
      case 'redis_operation':
        redisOperationDurationHistogram.observe({ ...labels, status: 'success' }, duration);
        break;
    }
    
    return result;
  } catch (error) {
    const duration = (performance.now() - startTime) / 1000; // Convert to seconds
    
    // Record error metrics
    errorCounter.inc({ type: error.name || 'unknown', service: labels.service || 'unknown' });
    
    // Record duration with error status
    switch (metricName) {
      case 'message_send':
        messageSendHistogram.observe({ ...labels, status: 'error' }, duration);
        break;
      case 'http_request':
        httpRequestDurationHistogram.observe({ ...labels, status_code: error.status || 500 }, duration);
        break;
      case 'redis_operation':
        redisOperationDurationHistogram.observe({ ...labels, status: 'error' }, duration);
        break;
    }
    
    throw error;
  }
}

/**
 * Update koneksi WhatsApp metrics
 * @param {Object} stats - Statistik koneksi
 */
function updateConnectionMetrics(stats) {
  if (!stats) return;
  
  whatsappConnectionGauge.set({ status: 'connected' }, stats.connected || 0);
  whatsappConnectionGauge.set({ status: 'disconnected' }, stats.disconnected || 0);
  whatsappConnectionGauge.set({ status: 'connecting' }, stats.connecting || 0);
}

/**
 * Update message queue metrics
 * @param {Object} stats - Statistik queue
 */
function updateQueueMetrics(stats) {
  if (!stats) return;
  
  Object.entries(stats).forEach(([queueName, queueStats]) => {
    messageQueueGauge.set({ type: queueName, status: 'waiting' }, queueStats.waiting || 0);
    messageQueueGauge.set({ type: queueName, status: 'active' }, queueStats.active || 0);
    messageQueueGauge.set({ type: queueName, status: 'completed' }, queueStats.completed || 0);
    messageQueueGauge.set({ type: queueName, status: 'failed' }, queueStats.failed || 0);
    messageQueueGauge.set({ type: queueName, status: 'delayed' }, queueStats.delayed || 0);
  });
}

/**
 * Update circuit breaker metrics
 * @param {Object} stats - Statistik circuit breaker
 */
function updateCircuitBreakerMetrics(stats) {
  if (!stats) return;
  
  Object.entries(stats).forEach(([service, serviceStats]) => {
    let stateValue = 0; // closed
    if (serviceStats.state === 'open') stateValue = 1;
    else if (serviceStats.state === 'half-open') stateValue = 0.5;
    
    circuitBreakerGauge.set({ service }, stateValue);
  });
}

/**
 * Record rate limit hit
 * @param {string} key - Rate limit key
 * @param {number} limit - Rate limit value
 * @param {number} window - Rate limit window in ms
 */
function recordRateLimitHit(key, limit, window) {
  rateLimitCounter.inc({ key, limit: String(limit), window: String(window) });
}

/**
 * Express middleware untuk mengumpulkan metrik HTTP request
 * @returns {Function} - Express middleware
 */
function metricsMiddleware() {
  return (req, res, next) => {
    const start = performance.now();
    const path = req.route ? req.route.path : req.path;
    
    // Tambahkan listener untuk 'finish' event
    res.on('finish', () => {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      
      httpRequestDurationHistogram.observe({
        method: req.method,
        route: path,
        status_code: res.statusCode
      }, duration);
    });
    
    next();
  };
}

/**
 * Inisialisasi server metrics
 * @param {number} port - Port untuk metrics server
 */
function startMetricsServer(port = 9090) {
  const app = express();
  
  // Endpoint untuk Prometheus scraping
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      console.error('[Metrics] Error generating metrics:', error);
      res.status(500).end('Error generating metrics');
    }
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  
  // Start server
  app.listen(port, () => {
    console.log(`[Metrics] Metrics server running at http://localhost:${port}/metrics`);
  });
}

export {
  trackDuration,
  updateConnectionMetrics,
  updateQueueMetrics,
  updateCircuitBreakerMetrics,
  recordRateLimitHit,
  metricsMiddleware,
  startMetricsServer,
  register
};

// Export metrics untuk digunakan langsung
export const metrics = {
  whatsappConnectionGauge,
  messageQueueGauge,
  messageSendHistogram,
  rateLimitCounter,
  circuitBreakerGauge,
  errorCounter,
  httpRequestDurationHistogram,
  redisOperationDurationHistogram
}; 