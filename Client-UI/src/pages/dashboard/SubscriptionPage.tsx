import React, { useState, useEffect } from "react";
import { SubscriptionStatus } from "@/components/subscription/SubscriptionStatus";
import { CreditBalance } from "@/components/subscription/CreditBalance";
import { CreditTransactions } from "@/components/subscription/CreditTransactions";
import { PlanSelector } from "@/components/subscription/PlanSelector";
import { CreditManager } from "@/components/admin/CreditManager";
import { RedeemKupon } from "@/components/subscription/RedeemKupon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KuponGenerator } from "@/components/admin/KuponGenerator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// ErrorBoundary Component
class ComponentErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: React.ErrorInfo): void {
    console.error("Component Error:", error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>Terjadi kesalahan saat memuat komponen ini</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default function SubscriptionPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const { data: userProfile, error } = await supabase
            .from('user_profiles')
            .select('is_admin')
          .eq('id', userData.user.id)
            .single();

        if (error) {
          console.error('Error fetching user profile:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(userProfile?.is_admin || false);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-6">Subscription</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <ComponentErrorBoundary>
          <SubscriptionStatus />
        </ComponentErrorBoundary>
        
        <ComponentErrorBoundary>
          <CreditBalance />
        </ComponentErrorBoundary>
      </div>
      
      <Tabs defaultValue="transactions" className="mb-6">
        <TabsList>
          <TabsTrigger value="transactions">Riwayat Transaksi</TabsTrigger>
          <TabsTrigger value="plans">Paket Langganan</TabsTrigger>
          <TabsTrigger value="redeem">Redeem Kupon</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">Admin Tools</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="transactions">
          <ComponentErrorBoundary>
            <CreditTransactions />
          </ComponentErrorBoundary>
        </TabsContent>
        
        <TabsContent value="plans">
          <ComponentErrorBoundary>
            <PlanSelector />
          </ComponentErrorBoundary>
        </TabsContent>
        
        <TabsContent value="redeem">
          <ComponentErrorBoundary>
            <RedeemKupon />
          </ComponentErrorBoundary>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin">
            <div className="grid grid-cols-1 gap-6">
              <ComponentErrorBoundary>
              <CreditManager />
              </ComponentErrorBoundary>
              
              <ComponentErrorBoundary>
              <KuponGenerator />
              </ComponentErrorBoundary>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
} 