import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { SubscriptionBanner } from "./SubscriptionBanner";

/**
 * SimpleExpiredBanner - Deprecated, use SubscriptionBanner instead
 * This component now uses the centralized subscription status hook
 * and only shows when subscription is actually expired
 */
export function SimpleExpiredBanner() {
  const { isExpired, isLoading } = useSubscriptionStatus();

  // Only show expired banner, not trialing
  if (isLoading || !isExpired) {
    return null;
  }

  return <SubscriptionBanner />;
}







