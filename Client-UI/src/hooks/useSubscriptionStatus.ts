import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionData {
  status: string;
  plan_name: string;
  plan_code: string;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  limits: {
    active_devices: number;
    messages_per_period: number;
    drip_campaigns: number;
    kanban_boards: number;
  };
}

interface UseSubscriptionStatusReturn {
  subscription: SubscriptionData | null;
  isLoading: boolean;
  isExpired: boolean;
  isTrialing: boolean;
  isActive: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSubscriptionStatus(): UseSubscriptionStatusReturn {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptionStatus = async () => {
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setSubscription(null);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/subscription`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data) {
          const subscriptionData: SubscriptionData = {
            status: result.data.status,
            plan_name: result.data.plans_new.name,
            plan_code: result.data.plans_new.code,
            trial_ends_at: result.data.trial_ends_at,
            current_period_ends_at: result.data.current_period_ends_at,
            limits: result.data.plans_new.limits
          };
          setSubscription(subscriptionData);
        } else {
          setSubscription(null);
        }
      } else {
        setError('Failed to fetch subscription status');
      }
    } catch (err) {
      console.error('Error fetching subscription status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchSubscriptionStatus, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Check if trial has expired based on date
  const isTrialExpired = () => {
    if (!subscription?.trial_ends_at) return false;
    const trialEndDate = new Date(subscription.trial_ends_at);
    const now = new Date();
    return now > trialEndDate;
  };

  const isExpired = subscription?.status === 'expired' || (subscription?.status === 'trialing' && isTrialExpired());
  const isTrialing = subscription?.status === 'trialing' && !isTrialExpired();
  const isActive = subscription?.status === 'active';

  return {
    subscription,
    isLoading,
    isExpired,
    isTrialing,
    isActive,
    error,
    refetch: fetchSubscriptionStatus
  };
}
