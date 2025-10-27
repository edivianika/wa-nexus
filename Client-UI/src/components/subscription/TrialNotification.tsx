import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Clock, Crown, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface TrialNotificationProps {
  onUpgrade?: () => void;
}

interface SubscriptionStatus {
  status: string;
  plan_name: string;
  current_period_ends_at: string;
  trial_ends_at?: string;
  limits: {
    messages_per_period: number;
    active_devices: number;
    drip_campaigns: number;
  };
  usage: {
    messages_per_period: number;
  };
}

export function TrialNotification({ onUpgrade }: TrialNotificationProps) {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
          setSubscription({
            status: result.data.status,
            plan_name: result.data.plans_new.name,
            current_period_ends_at: result.data.current_period_ends_at,
            trial_ends_at: result.data.trial_ends_at,
            limits: result.data.plans_new.limits,
            usage: { messages_per_period: 0 }
          });
        }
      }
    } catch (error) {
      console.error('Error fetching subscription status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !subscription || subscription.status !== 'trialing') {
    return null;
  }

  const trialEndDate = new Date(subscription.trial_ends_at || subscription.current_period_ends_at);
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

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      navigate('/dashboard/subscription');
    }
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
                <div className="text-xs text-muted-foreground mt-1">
                  Trial berakhir: {trialEndDate.toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                <Button
                  size="sm"
                  variant={isCritical ? "destructive" : "default"}
                  onClick={handleUpgrade}
                  className="whitespace-nowrap"
                >
                  {isCritical ? 'Upgrade Sekarang' : 'Lihat Paket'}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
