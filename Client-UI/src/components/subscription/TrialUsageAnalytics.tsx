import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Smartphone, Zap, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TrialUsageAnalyticsProps {
  className?: string;
}

interface UsageData {
  messages_used: number;
  messages_limit: number;
  devices_used: number;
  devices_limit: number;
  campaigns_used: number;
  campaigns_limit: number;
  days_remaining: number;
  trial_ends_at: string;
}

export function TrialUsageAnalytics({ className }: TrialUsageAnalyticsProps) {
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUsageData();
  }, []);

  const fetchUsageData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch subscription data
      const subscriptionResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/subscription`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        }
      });

      if (subscriptionResponse.ok) {
        const subscriptionResult = await subscriptionResponse.json();
        
        if (subscriptionResult.data && subscriptionResult.data.status === 'trialing') {
          const subscription = subscriptionResult.data;
          const trialEndDate = new Date(subscription.trial_ends_at);
          const now = new Date();
          const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          setUsageData({
            messages_used: subscription.usage?.messages_per_period || 0,
            messages_limit: subscription.plans_new.limits.messages_per_period,
            devices_used: 1, // This would need to be fetched from devices API
            devices_limit: subscription.plans_new.limits.active_devices,
            campaigns_used: 0, // This would need to be fetched from campaigns API
            campaigns_limit: subscription.plans_new.limits.drip_campaigns,
            days_remaining: daysRemaining,
            trial_ends_at: subscription.trial_ends_at
          });
        }
      }
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !usageData) {
    return null;
  }

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((used / limit) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-orange-600';
    return 'text-green-600';
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const messagesPercentage = getUsagePercentage(usageData.messages_used, usageData.messages_limit);
  const devicesPercentage = getUsagePercentage(usageData.devices_used, usageData.devices_limit);
  const campaignsPercentage = getUsagePercentage(usageData.campaigns_used, usageData.campaigns_limit);

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Trial Analytics</span>
          </CardTitle>
          <CardDescription>
            Pantau penggunaan trial Anda dan sisa waktu
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Trial Time Remaining */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sisa Waktu Trial</span>
            <Badge variant={usageData.days_remaining <= 1 ? 'destructive' : usageData.days_remaining <= 3 ? 'secondary' : 'default'}>
              {usageData.days_remaining} hari
            </Badge>
          </div>

          {/* Messages Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm font-medium">Pesan</span>
              </div>
              <span className={`text-sm font-medium ${getUsageColor(messagesPercentage)}`}>
                {usageData.messages_used.toLocaleString()} / {usageData.messages_limit === -1 ? '∞' : usageData.messages_limit.toLocaleString()}
              </span>
            </div>
            <Progress 
              value={messagesPercentage} 
              className="h-2"
            />
            {messagesPercentage > 0 && (
              <div className="text-xs text-muted-foreground">
                {messagesPercentage.toFixed(1)}% digunakan
              </div>
            )}
          </div>

          {/* Devices Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Smartphone className="h-4 w-4" />
                <span className="text-sm font-medium">Devices</span>
              </div>
              <span className={`text-sm font-medium ${getUsageColor(devicesPercentage)}`}>
                {usageData.devices_used} / {usageData.devices_limit === -1 ? '∞' : usageData.devices_limit}
              </span>
            </div>
            <Progress 
              value={devicesPercentage} 
              className="h-2"
            />
            {devicesPercentage > 0 && (
              <div className="text-xs text-muted-foreground">
                {devicesPercentage.toFixed(1)}% digunakan
              </div>
            )}
          </div>

          {/* Campaigns Usage */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4" />
                <span className="text-sm font-medium">Campaigns</span>
              </div>
              <span className={`text-sm font-medium ${getUsageColor(campaignsPercentage)}`}>
                {usageData.campaigns_used} / {usageData.campaigns_limit === -1 ? '∞' : usageData.campaigns_limit}
              </span>
            </div>
            <Progress 
              value={campaignsPercentage} 
              className="h-2"
            />
            {campaignsPercentage > 0 && (
              <div className="text-xs text-muted-foreground">
                {campaignsPercentage.toFixed(1)}% digunakan
              </div>
            )}
          </div>

          {/* Trial End Date */}
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              Trial berakhir: {new Date(usageData.trial_ends_at).toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
