import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { SubscriptionBanner } from "./SubscriptionBanner";

interface TrialNotificationProps {
  onUpgrade?: () => void;
}

/**
 * TrialNotification - Deprecated, use SubscriptionBanner instead
 * This component now uses the centralized subscription status hook
 * and only shows when subscription is trialing (not expired)
 */
export function TrialNotification({ onUpgrade }: TrialNotificationProps) {
  const { isTrialing, isLoading } = useSubscriptionStatus();

  // Only show trialing banner, not expired
  if (isLoading || !isTrialing) {
    return null;
  }

  // SubscriptionBanner handles both expired and trialing states
  // but we only want to show trialing here, so we check isTrialing first
  return <SubscriptionBanner />;
}
