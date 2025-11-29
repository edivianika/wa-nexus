import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Lock, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TrialExpiredGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showAlert?: boolean;
}

export function TrialExpiredGuard({ 
  children, 
  fallback, 
  showAlert = true 
}: TrialExpiredGuardProps) {
  const { isExpired, isLoading } = useSubscriptionStatus();
  const navigate = useNavigate();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isExpired) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showAlert) {
      return (
        <Alert className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <Lock className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">
                Trial Anda telah berakhir. Upgrade sekarang untuk melanjutkan menggunakan fitur premium.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Anda saat ini dalam mode read-only. Subscribe untuk mengaktifkan kembali semua fitur.
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => navigate('/dashboard/subscription')}
              className="ml-4"
            >
              <Crown className="mr-2 h-4 w-4" />
              Upgrade Sekarang
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  }

  return <>{children}</>;
}

// Higher-order component untuk disable action
export function withTrialExpiredGuard<T extends object>(
  Component: React.ComponentType<T>,
  options?: { showAlert?: boolean; fallback?: React.ReactNode }
) {
  return function TrialExpiredGuardedComponent(props: T) {
    return (
      <TrialExpiredGuard 
        showAlert={options?.showAlert} 
        fallback={options?.fallback}
      >
        <Component {...props} />
      </TrialExpiredGuard>
    );
  };
}







