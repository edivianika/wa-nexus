import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Crown, AlertTriangle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface TrialUpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

interface SubscriptionData {
  trial_ends_at: string;
  plan_name: string;
  limits: {
    messages_per_period: number;
    active_devices: number;
  };
}

export function TrialUpgradePrompt({ isOpen, onClose, onUpgrade }: TrialUpgradePromptProps) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchSubscriptionData();
    }
  }, [isOpen]);

  const fetchSubscriptionData = async () => {
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
            trial_ends_at: result.data.trial_ends_at,
            plan_name: result.data.plans_new.name,
            limits: result.data.plans_new.limits
          });
        }
      }
    } catch (error) {
      console.error('Error fetching subscription data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!subscription) return null;

  const trialEndDate = new Date(subscription.trial_ends_at);
  const now = new Date();
  const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  const isExpiringSoon = daysRemaining <= 3;
  const isCritical = daysRemaining <= 1;

  const getTitle = () => {
    if (isCritical) return "Trial Anda Hampir Berakhir!";
    if (isExpiringSoon) return "Trial Anda Akan Berakhir";
    return "Upgrade ke Paket Berbayar";
  };

  const getDescription = () => {
    if (isCritical) {
      return `Trial Anda akan berakhir dalam ${daysRemaining} hari. Upgrade sekarang untuk melanjutkan layanan tanpa interupsi.`;
    }
    if (isExpiringSoon) {
      return `Trial Anda akan berakhir dalam ${daysRemaining} hari. Pilih paket yang sesuai dengan kebutuhan Anda.`;
    }
    return "Nikmati semua fitur premium dengan paket berbayar kami.";
  };

  const getIcon = () => {
    if (isCritical) return <AlertTriangle className="h-6 w-6 text-red-600" />;
    if (isExpiringSoon) return <Clock className="h-6 w-6 text-orange-600" />;
    return <Crown className="h-6 w-6 text-blue-600" />;
  };

  const handleUpgrade = () => {
    onUpgrade();
    navigate('/dashboard/subscription');
  };

  const handleDismiss = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            {getIcon()}
            <div>
              <DialogTitle className="text-lg font-semibold">
                {getTitle()}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                {getDescription()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trial Info */}
          <Alert className={
            isCritical 
              ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' 
              : isExpiringSoon 
                ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950' 
                : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
          }>
            <AlertDescription className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {isCritical ? 'Trial Berakhir:' : 'Trial Berakhir:'}
                </span>
                <span className={`font-semibold ${
                  isCritical 
                    ? 'text-red-700 dark:text-red-400' 
                    : isExpiringSoon 
                      ? 'text-orange-700 dark:text-orange-400' 
                      : 'text-blue-700 dark:text-blue-400'
                }`}>
                  {trialEndDate.toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Sisa waktu: {daysRemaining} hari
              </div>
            </AlertDescription>
          </Alert>

          {/* Current Plan Benefits */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Fitur yang Anda nikmati:</h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>• {subscription.limits.messages_per_period.toLocaleString()} pesan/bulan</div>
              <div>• {subscription.limits.active_devices} device WhatsApp</div>
              <div>• Webhooks & API access</div>
              <div>• Drip campaigns</div>
            </div>
          </div>

          {/* Upgrade Benefits */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Dengan upgrade, Anda mendapat:</h4>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>• Unlimited pesan</div>
              <div>• Multiple devices</div>
              <div>• AI Typing Indicator</div>
              <div>• Priority Support</div>
              <div>• No watermark</div>
              <div>• Advanced analytics</div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="w-full sm:w-auto"
          >
            {isCritical ? 'Nanti' : 'Tutup'}
          </Button>
          <Button
            onClick={handleUpgrade}
            className={`w-full sm:w-auto ${
              isCritical ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isCritical ? 'Upgrade Sekarang' : 'Lihat Paket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
