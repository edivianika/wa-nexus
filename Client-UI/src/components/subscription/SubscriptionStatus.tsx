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
  subscription_id?: string;
  limits: {
    messages_per_period?: number;
    kanban_boards?: number;
    drip_campaigns?: number;
    active_devices?: number;
    max_speed_msg_per_min?: number;
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
      
      // Use API endpoint instead of RPC
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
      
      if (result.data) {
        // Transform API response to match expected format
        const subscriptionData = {
          status: result.data.status,
          plan_name: result.data.plans.name,
          plan_code: result.data.plans.code,
          current_period_starts_at: result.data.current_period_starts_at,
          current_period_ends_at: result.data.current_period_ends_at,
          subscription_id: result.data.id,
          limits: result.data.plans.limits,
          usage: {
            messages_per_period: 0 // Will be fetched separately if needed
          }
        };
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
  
  const usagePercentage = messagesLimit > 0
    ? (messagesUsage / messagesLimit) * 100
    : 0;

  // Secara aman menampilkan tanggal tanpa format()
  const isActive = status.status === 'active' || status.status === 'premium' || status.status === 'free';
  let endDateDisplay = '';
  let daysRemaining = 0;
  
  try {
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
  } catch (err) {
    console.error('Error processing date:', err);
    endDateDisplay = '';
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
          {isActive ? (
            endDateDisplay ? `Aktif hingga ${endDateDisplay}` : 'Akun aktif'
          ) : (
            'Langganan telah berakhir'
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
            <span className={`font-medium ${isActive ? 'text-green-600' : 'text-red-600'}`}>
              {isActive ? 'Aktif' : 'Tidak Aktif'}
            </span>
          </div>
          {isActive && endDateDisplay && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sisa Waktu:</span>
              <span className="font-medium">
                {daysRemaining} Hari
              </span>
            </div>
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