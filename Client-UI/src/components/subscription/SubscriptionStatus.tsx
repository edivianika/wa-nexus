import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface SubscriptionStatus {
  status: string;
  plan_name: string;
  plan_code: string;
  current_period_starts_at?: string;
  current_period_ends_at?: string;
  trial_ends_at?: string;
  subscription_id?: string;
  limits: {
    messages_per_period?: number;
    kanban_boards?: number;
    drip_campaigns?: number;
    active_devices?: number;
    max_speed_msg_per_min?: number;
  };
  features?: {
    webhooks?: boolean;
    api_access?: boolean;
    team_members?: number;
    has_ai_typing?: boolean;
    has_watermark?: boolean;
    has_scheduled_campaigns?: boolean;
  };
  usage: {
    messages_per_period?: number;
  };
}

export function SubscriptionStatus() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptionStatus = async () => {
    try {
      setIsLoading(true);
      
      // Get current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User tidak ditemukan');
      }
      
      // Use new subscription status endpoint with trial support
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/subscription`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        }
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Gagal mengambil status langganan');
      }

      console.log("Subscription status:", result.data);
      console.log("Trial ends at:", result.data.trial_ends_at);
      console.log("Current period ends at:", result.data.current_period_ends_at);
      
      if (result.data) {
        // Transform API response to match expected format
        const subscriptionData = {
          status: result.data.status,
          plan_name: result.data.plans_new.name,
          plan_code: result.data.plans_new.code,
          current_period_starts_at: result.data.current_period_starts_at,
          current_period_ends_at: result.data.current_period_ends_at,
          trial_ends_at: result.data.trial_ends_at,
          subscription_id: result.data.id,
          limits: result.data.plans_new.limits,
          features: result.data.plans_new.features,
          usage: {
            messages_per_period: 0 // Will be fetched separately if needed
          }
        };
        console.log("Parsed subscription data:", subscriptionData);
        console.log("Trial ends at parsed:", subscriptionData.trial_ends_at);
        setStatus(subscriptionData);
      } else {
        // No active subscription - set to free tier
        setStatus({
          status: 'free',
          plan_name: 'Free',
          plan_code: 'free',
          current_period_starts_at: null,
          current_period_ends_at: null,
          subscription_id: null,
          limits: {
            messages_per_period: 1000,
            kanban_boards: -1,
            drip_campaigns: -1,
            active_devices: -1
          },
          usage: {
            messages_per_period: 0
          }
        });
      }
    } catch (err: any) {
      console.error('Error fetching subscription status:', err);
      setError(err.message || 'Terjadi kesalahan saat memuat status langganan');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Memuat Status Langganan
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Terjadi Kesalahan</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Status Langganan</CardTitle>
          <CardDescription>Data tidak tersedia</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const messagesLimit = status.limits?.messages_per_period ?? 0;
  const messagesUsage = status.usage?.messages_per_period ?? 0;
  
  // Debug logging untuk subscription data
  console.log("Subscription Status Debug:", {
    status: status.status,
    plan_name: status.plan_name,
    plan_code: status.plan_code,
    trial_ends_at: status.trial_ends_at,
    current_period_ends_at: status.current_period_ends_at
  });
  
  const usagePercentage = messagesLimit > 0
    ? (messagesUsage / messagesLimit) * 100
    : 0;

  // Secara aman menampilkan tanggal tanpa format()
  const isActive = status.status === 'active' || status.status === 'premium' || status.status === 'free' || status.status === 'trial' || status.status === 'trialing';
  const isTrial = status.status === 'trial' || status.status === 'trialing';
  let endDateDisplay = '';
  let trialEndDateDisplay = '';
  let daysRemaining = 0;
  let trialDaysRemaining = 0;
  
  try {
    // Handle current_period_ends_at (for active subscriptions)
    if (status.current_period_ends_at) {
      const endDate = new Date(status.current_period_ends_at);
      if (!isNaN(endDate.getTime())) {
        const now = new Date();
        daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Format tanggal secara manual tanpa menggunakan date-fns
        const day = endDate.getDate().toString().padStart(2, '0');
        const month = new Intl.DateTimeFormat('id', { month: 'short' }).format(endDate);
        const year = endDate.getFullYear();
        endDateDisplay = `${day} ${month} ${year}`;
      }
    }

    // Handle trial_ends_at (for trial subscriptions)
    if (status.trial_ends_at) {
      console.log("Processing trial_ends_at:", status.trial_ends_at);
      const trialEndDate = new Date(status.trial_ends_at);
      console.log("Parsed trial end date:", trialEndDate);
      if (!isNaN(trialEndDate.getTime())) {
        const now = new Date();
        trialDaysRemaining = Math.max(0, Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        console.log("Trial days remaining:", trialDaysRemaining);
        
        // Format tanggal secara manual tanpa menggunakan date-fns
        const day = trialEndDate.getDate().toString().padStart(2, '0');
        const month = new Intl.DateTimeFormat('id', { month: 'short' }).format(trialEndDate);
        const year = trialEndDate.getFullYear();
        trialEndDateDisplay = `${day} ${month} ${year}`;
        console.log("Trial end date display:", trialEndDateDisplay);
      }
    } else if (isTrial && status.current_period_ends_at) {
      // Fallback: use current_period_ends_at for trial if trial_ends_at is not available
      console.log("Using current_period_ends_at as fallback for trial:", status.current_period_ends_at);
      const trialEndDate = new Date(status.current_period_ends_at);
      console.log("Parsed trial end date (fallback):", trialEndDate);
      if (!isNaN(trialEndDate.getTime())) {
        const now = new Date();
        trialDaysRemaining = Math.max(0, Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        console.log("Trial days remaining (fallback):", trialDaysRemaining);
        
        // Format tanggal secara manual tanpa menggunakan date-fns
        const day = trialEndDate.getDate().toString().padStart(2, '0');
        const month = new Intl.DateTimeFormat('id', { month: 'short' }).format(trialEndDate);
        const year = trialEndDate.getFullYear();
        trialEndDateDisplay = `${day} ${month} ${year}`;
        console.log("Trial end date display (fallback):", trialEndDateDisplay);
      }
    } else {
      console.log("No trial_ends_at or current_period_ends_at found in status:", status);
    }
  } catch (err) {
    console.error('Error processing date:', err);
    endDateDisplay = '';
    trialEndDateDisplay = '';
  }

  // Function to get badge styling based on plan type
  const getBadgeStyle = (planCode: string) => {
    const planParts = planCode?.split('-') || [];
    const planType = planParts.length > 0 ? planParts[0].toLowerCase() : 'free';
    
    switch (planType) {
      case 'trial':
        return 'bg-yellow-100 text-yellow-800';
      case 'micro':
        return 'bg-blue-100 text-blue-800';
      case 'starter':
        return 'bg-green-100 text-green-800';
      case 'growth':
        return 'bg-purple-100 text-purple-800';
      case 'free':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Function to get display name for plan type
  const getPlanDisplayName = (planCode: string) => {
    const planParts = planCode?.split('-') || [];
    const planType = planParts.length > 0 ? planParts[0].toLowerCase() : 'free';
    
    switch (planType) {
      case 'trial':
        return 'TRIAL';
      case 'micro':
        return 'MICRO';
      case 'starter':
        return 'STARTER';
      case 'growth':
        return 'GROWTH';
      case 'free':
        return 'FREE';
      default:
        return planType.toUpperCase();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Status Langganan
          <Badge 
            variant="outline"
            className={getBadgeStyle(status.plan_code)}
          >
            {getPlanDisplayName(status.plan_code)}
          </Badge>
        </CardTitle>
        <CardDescription>
          {status.status === 'expired' ? (
            'Langganan telah berakhir'
          ) : isTrial ? (
            trialDaysRemaining > 0 ? `Trial aktif - ${trialDaysRemaining} hari tersisa` : 'Trial telah berakhir'
          ) : isActive ? (
            daysRemaining > 0 ? `Langganan aktif - ${daysRemaining} hari tersisa` : 'Langganan aktif'
          ) : (
            'Akun aktif'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tipe Langganan:</span>
            <span className="font-medium">{status.plan_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status:</span>
            <span className={`font-medium ${
              isTrial ? 'text-blue-600' : 
              status.status === 'expired' ? 'text-red-600' :
              isActive ? 'text-green-600' : 'text-red-600'
            }`}>
              {isTrial ? 'Trial' : 
               status.status === 'expired' ? 'Berakhir' :
               isActive ? 'Aktif' : 'Tidak Aktif'}
            </span>
          </div>
          
          {/* Trial expiration info - Always show for trial status */}
          {isTrial && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sisa Trial:</span>
              <span className={`font-medium ${
                trialDaysRemaining <= 1 ? 'text-red-600' : 
                trialDaysRemaining <= 3 ? 'text-orange-600' : 
                'text-blue-600'
              }`}>
                {trialDaysRemaining > 0 ? `${trialDaysRemaining} Hari` : 
                 trialDaysRemaining === 0 ? 'Trial Berakhir Hari Ini' :
                 'Trial Aktif'}
                {trialDaysRemaining <= 1 && trialDaysRemaining > 0 && ' (Hampir Berakhir!)'}
              </span>
            </div>
          )}
          
          {/* Show trial end date if available */}
          {isTrial && trialEndDateDisplay && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Trial Berakhir:</span>
              <span className="font-medium text-muted-foreground">
                {trialEndDateDisplay}
              </span>
            </div>
          )}
          
          {/* Show debug info for trial if no date available */}
          {isTrial && !trialEndDateDisplay && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Debug Info:</span>
              <span className="font-medium text-muted-foreground text-xs">
                trial_ends_at: {status.trial_ends_at || 'null'}, 
                current_period_ends_at: {status.current_period_ends_at || 'null'}
              </span>
            </div>
          )}
          
          {/* Active subscription expiration info */}
          {isActive && !isTrial && status.status !== 'expired' && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sisa Langganan:</span>
              <span className={`font-medium ${
                daysRemaining <= 7 ? 'text-orange-600' : 
                daysRemaining <= 3 ? 'text-red-600' : 
                'text-green-600'
              }`}>
                {daysRemaining > 0 ? `${daysRemaining} Hari` : 'Berakhir'}
                {daysRemaining <= 3 && daysRemaining > 0 && ' (Hampir Berakhir!)'}
              </span>
            </div>
          )}
          
          {/* Expired subscription info */}
          {status.status === 'expired' && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Berakhir Pada:</span>
                <span className="font-medium text-red-600">
                  {endDateDisplay || trialEndDateDisplay || 'Tidak diketahui'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status Akun:</span>
                <span className="font-medium text-red-600">
                  Read-Only Mode
                </span>
              </div>
            </>
          )}
          {(messagesLimit > 0 || messagesLimit === -1) && (
            <div className="pt-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Penggunaan Pesan</span>
                <span className="font-medium">
                  {messagesUsage.toLocaleString()} / {messagesLimit === -1 ? '∞' : messagesLimit.toLocaleString()}
                </span>
              </div>
              {messagesLimit > 0 && (
                <Progress value={usagePercentage} />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 