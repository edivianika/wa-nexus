import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabaseClient.js';
import { loggerUtils } from '../utils/logger.js';

/**
 * Cron job untuk handle trial expiration
 * Berjalan setiap hari pada jam 00:00
 */
export class TrialExpirationJob {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start the cron job
   */
  start() {
    // Run every day at midnight
    cron.schedule('0 0 * * *', async () => {
      await this.handleTrialExpiration();
    }, {
      scheduled: true,
      timezone: "Asia/Jakarta"
    });

    // Also run immediately on startup for testing
    this.handleTrialExpiration();
    
    loggerUtils.info('Trial expiration cron job started');
  }

  /**
   * Handle trial expiration
   */
  async handleTrialExpiration() {
    if (this.isRunning) {
      loggerUtils.warn('Trial expiration job is already running, skipping...');
      return;
    }

    this.isRunning = true;
    
    try {
      loggerUtils.info('Starting trial expiration process...');
      
      // Call the database function to handle trial expiration
      const { data, error } = await supabaseAdmin.rpc('handle_trial_expiration');
      
      if (error) {
        loggerUtils.error('Error handling trial expiration:', error);
        return;
      }

      loggerUtils.info('Trial expiration process completed successfully');
      
      // Log statistics
      await this.logTrialStatistics();
      
    } catch (error) {
      loggerUtils.error('Unexpected error in trial expiration job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Log trial statistics
   */
  async logTrialStatistics() {
    try {
      // Get current trial users count
      const { data: trialUsers, error: trialError } = await supabaseAdmin
        .from('subscriptions')
        .select('id, user_id, trial_ends_at')
        .eq('status', 'trialing');

      if (trialError) {
        loggerUtils.error('Error fetching trial users:', trialError);
        return;
      }

      const now = new Date();
      const expiringToday = trialUsers?.filter(user => {
        const trialEnd = new Date(user.trial_ends_at);
        return trialEnd.toDateString() === now.toDateString();
      }) || [];

      const expiringTomorrow = trialUsers?.filter(user => {
        const trialEnd = new Date(user.trial_ends_at);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return trialEnd.toDateString() === tomorrow.toDateString();
      }) || [];

      loggerUtils.info('Trial Statistics:', {
        totalTrialUsers: trialUsers?.length || 0,
        expiringToday: expiringToday.length,
        expiringTomorrow: expiringTomorrow.length
      });

    } catch (error) {
      loggerUtils.error('Error logging trial statistics:', error);
    }
  }

  /**
   * Manual trigger for testing
   */
  async triggerManually() {
    loggerUtils.info('Manually triggering trial expiration...');
    await this.handleTrialExpiration();
  }
}

// Export singleton instance
export const trialExpirationJob = new TrialExpirationJob();
