import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Crown, Clock, AlertTriangle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";

/**
 * Centralized subscription banner component that handles all subscription states:
 * - Expired: Shows red banner with upgrade message
 * - Trialing: Shows blue/orange banner with trial info
 * - Active: Shows nothing
 */
export function SubscriptionBanner() {
  const navigate = useNavigate();
  const { subscription, isLoading, isExpired, isTrialing } = useSubscriptionStatus();

  if (isLoading || !subscription) {
    return null;
  }

  const handleUpgrade = () => {
    navigate('/dashboard/subscription');
  };

  // Show expired banner
  if (isExpired) {
    return (
      <Alert 
        variant="destructive"
        className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
      >
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 text-red-600 dark:text-red-400">
            <XCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <AlertDescription className="text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium mb-1 text-foreground">
                    Trial Anda telah berakhir. Upgrade sekarang untuk melanjutkan layanan.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Anda saat ini dalam mode read-only. Subscribe untuk mengaktifkan kembali semua fitur.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleUpgrade}
                  className="ml-4 whitespace-nowrap"
                >
                  <Crown className="mr-2 h-4 w-4" />
                  Upgrade Sekarang
                </Button>
              </div>
            </AlertDescription>
          </div>
        </div>
      </Alert>
    );
  }

  // Show trialing banner
  if (isTrialing && subscription.trial_ends_at) {
    const trialEndDate = new Date(subscription.trial_ends_at);
    const now = new Date();
    const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const isExpiringSoon = daysRemaining <= 3;
    const isCritical = daysRemaining <= 1;

    const getAlertVariant = () => {
      if (isCritical) return "destructive";
      if (isExpiringSoon) return "default";
      return "default";
    };

    const getIcon = () => {
      if (isCritical) return <AlertTriangle className="h-4 w-4" />;
      if (isExpiringSoon) return <Clock className="h-4 w-4" />;
      return <Crown className="h-4 w-4" />;
    };

    const getMessage = () => {
      if (isCritical) {
        return `Trial Anda berakhir dalam ${daysRemaining} hari! Upgrade sekarang untuk melanjutkan layanan.`;
      }
      if (isExpiringSoon) {
        return `Trial Anda akan berakhir dalam ${daysRemaining} hari. Pertimbangkan untuk upgrade ke paket berbayar.`;
      }
      return `Selamat datang! Anda sedang menggunakan trial gratis selama 7 hari. Nikmati semua fitur premium.`;
    };

    return (
      <Alert 
        variant={getAlertVariant()}
        className={`mb-6 ${
          isCritical 
            ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' 
            : isExpiringSoon 
              ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950' 
              : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
        }`}
      >
        <div className="flex items-start space-x-3">
          <div className={`flex-shrink-0 ${
            isCritical 
              ? 'text-red-600 dark:text-red-400' 
              : isExpiringSoon 
                ? 'text-orange-600 dark:text-orange-400' 
                : 'text-blue-600 dark:text-blue-400'
          }`}>
            {getIcon()}
          </div>
          <div className="flex-1">
            <AlertDescription className="text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium mb-1 text-foreground">{getMessage()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Trial berakhir: {trialEndDate.toLocaleDateString('id-ID', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={isCritical ? "destructive" : "default"}
                  onClick={handleUpgrade}
                  className="ml-4 whitespace-nowrap"
                >
                  {isCritical ? (
                    <>
                      <Crown className="mr-2 h-4 w-4" />
                      Upgrade Sekarang
                    </>
                  ) : (
                    'Lihat Paket'
                  )}
                </Button>
              </div>
            </AlertDescription>
          </div>
        </div>
      </Alert>
    );
  }

  // Active subscription - show nothing
  return null;
}
