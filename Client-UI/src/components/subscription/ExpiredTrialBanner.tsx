import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Crown, AlertTriangle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface SubscriptionData {
  status: string;
  plan_name: string;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
}

export function ExpiredTrialBanner() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
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
            trial_ends_at: result.data.trial_ends_at,
            current_period_ends_at: result.data.current_period_ends_at,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching subscription status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !subscription || subscription.status !== 'expired') {
    return null;
  }

  const handleUpgrade = () => {
    navigate('/dashboard/subscription');
  };

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
                  Trial Anda telah berakhir. Upgrade sekarang untuk melanjutkan menggunakan fitur premium.
                </p>
                <div className="text-xs text-muted-foreground mt-1">
                  Anda saat ini dalam mode read-only. Subscribe untuk mengaktifkan kembali semua fitur.
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleUpgrade}
                  className="whitespace-nowrap"
                >
                  <Crown className="mr-2 h-4 w-4" />
                  Upgrade Sekarang
                </Button>
              </div>
            </div>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
