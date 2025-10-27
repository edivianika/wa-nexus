import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function SimpleExpiredBanner() {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    navigate('/dashboard/subscription');
  };

  return (
    <Alert className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
      <div className="flex items-center space-x-3">
        <Crown className="h-5 w-5 text-red-600 dark:text-red-400" />
        <div className="flex-1">
          <AlertDescription className="text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium mb-1 text-foreground">
                  Trial Anda telah berakhir. Upgrade sekarang untuk melanjutkan layanan.
                </p>
                <p className="text-xs text-muted-foreground">
                  Anda saat ini dalam mode read-only. Subscribe untuk mengaktifkan kembali semua fitur.
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleUpgrade}
                className="ml-4"
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
