import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Lock, Crown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";

interface AddDeviceFormProps {
  onAddDevice: (name: string) => void;
  currentDeviceCount?: number;
  deviceLimit?: number;
}

interface SubscriptionData {
  status: string;
  plan_name: string;
  limits: {
    active_devices: number;
  };
}

export function AddDeviceForm({ onAddDevice, currentDeviceCount = 0, deviceLimit = 1 }: AddDeviceFormProps) {
  const [deviceName, setDeviceName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { subscription, isExpired, isLoading } = useSubscriptionStatus();


  const isDeviceLimitReached = currentDeviceCount >= deviceLimit;
  const canAddDevice = !isDeviceLimitReached && deviceLimit > 0 && !isExpired;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deviceName.trim()) {
      toast.error("Device name cannot be empty");
      return;
    }

    if (isDeviceLimitReached) {
      toast.error("Device limit reached. Please upgrade your plan to add more devices.");
      return;
    }
    
    onAddDevice(deviceName);
    setDeviceName("");
    setIsDialogOpen(false);
    toast.success("Device added successfully");
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
            <Button 
              data-testid="add-device-button"
              disabled={!canAddDevice}
              variant={!canAddDevice ? "outline" : "default"}
            >
              {isExpired ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Trial Expired
                </>
              ) : !canAddDevice ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Device Limit Reached
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Device
                </>
              )}
            </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
          <DialogDescription>
            Create a new WhatsApp device connection.
          </DialogDescription>
        </DialogHeader>
        
            {/* Device Limit Info */}
            {subscription && (
              <Alert className="mb-4">
                <Crown className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Current Plan:</span>
                      <Badge variant="outline">{subscription.plan_name}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Device Usage:</span>
                      <span className="text-sm font-medium">
                        {currentDeviceCount} / {deviceLimit === -1 ? '∞' : deviceLimit}
                      </span>
                    </div>
                    {isExpired && (
                      <div className="text-sm text-red-600 font-medium">
                        Trial expired. Please upgrade to add devices.
                      </div>
                    )}
                    {isDeviceLimitReached && !isExpired && (
                      <div className="text-sm text-amber-600 font-medium">
                        Device limit reached. Upgrade your plan to add more devices.
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="device-name">Device Name</Label>
              <Input
                id="device-name"
                placeholder="Enter a name for this device"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                disabled={!canAddDevice}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              disabled={!canAddDevice}
              variant={!canAddDevice ? "outline" : "default"}
            >
              {isExpired ? 'Trial Expired' : !canAddDevice ? 'Device Limit Reached' : 'Add Device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
