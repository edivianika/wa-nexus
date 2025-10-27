import { supabaseAdmin } from '../utils/supabaseClient.js';
import { loggerUtils } from '../utils/logger.js';

/**
 * Middleware to check if user has expired trial
 * Blocks write operations (POST, PUT, DELETE) for expired trials
 * Allows read operations (GET) for expired trials
 */
export const checkTrialExpired = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(); // No user, skip check
    }

    // Check if user has expired trial
    const { data: subscription, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .in('status', ['expired'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      loggerUtils.error('Error checking trial expiration:', error);
      return next(); // Continue on error
    }

    // If user has expired trial and trying to do write operation
    if (subscription && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return res.status(403).json({
        success: false,
        error: 'Trial expired',
        message: 'Your trial has expired. Please upgrade to continue using premium features.',
        code: 'TRIAL_EXPIRED'
      });
    }

    // Attach expired status to request for frontend use
    req.isTrialExpired = !!subscription;
    
    next();
  } catch (error) {
    loggerUtils.error('Error in checkTrialExpired middleware:', error);
    next(); // Continue on error
  }
};

/**
 * Middleware specifically for read-only operations
 * Only allows GET requests for expired trials
 */
export const checkTrialExpiredReadOnly = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return next(); // No user, skip check
    }

    // Check if user has expired trial
    const { data: subscription, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .in('status', ['expired'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      loggerUtils.error('Error checking trial expiration:', error);
      return next(); // Continue on error
    }

    // If user has expired trial, only allow GET requests
    if (subscription && req.method !== 'GET') {
      return res.status(403).json({
        success: false,
        error: 'Trial expired',
        message: 'Your trial has expired. Please upgrade to continue using premium features.',
        code: 'TRIAL_EXPIRED'
      });
    }

    // Attach expired status to request for frontend use
    req.isTrialExpired = !!subscription;
    
    next();
  } catch (error) {
    loggerUtils.error('Error in checkTrialExpiredReadOnly middleware:', error);
    next(); // Continue on error
  }
};
