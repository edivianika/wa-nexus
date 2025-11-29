import { useState, useEffect } from "react";
import { DeviceCard } from "@/components/devices/device-card";
import { AddDeviceForm } from "@/components/devices/add-device-form";
import { TrialNotification } from "@/components/subscription/TrialNotification";
import { ExpiredTrialBanner } from "@/components/subscription/ExpiredTrialBanner";
import { Smartphone, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { generateDeviceId, generateApiKey } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";

// Baca URL server dari environment variable, jangan hardcode
const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
if (!import.meta.env.VITE_API_SERVER_URL) {
  console.warn('VITE_API_SERVER_URL not set in environment variables. Using fallback URL.');
}

// Komponen Spinner sederhana untuk menampilkan loading
const Spinner = ({ className }: { className?: string }) => (
  <div className={`animate-spin rounded-full border-4 border-primary border-t-transparent ${className}`}></div>
);

interface WebhookTriggers {
  private: boolean;
  group: boolean;
  broadcast: boolean;
  newsletter: boolean;
}

interface WebhookSettings {
  url: string;
  triggers: WebhookTriggers;
}

const defaultWebhook: WebhookSettings = {
  url: "",
  triggers: {
    private: false,
    group: false,
    broadcast: false,
    newsletter: false
  }
};

interface Device {
  id: string;
  name: string;
  status: "connected" | "disconnected";
  apiKey: string;
  webhook: WebhookSettings;
  user_id: string;
  expired_date: string;
  server: string;
  phone_number: string;
  ai_agent_id?: string | null;
  agent_name?: string | null;
}

// Tipe data untuk hasil fungsi get_subscription_status
interface SubscriptionStatus {
  user_type: string;
  end_date: string;
  is_active: boolean;
  days_remaining: number;
  limits: {
    active_devices: number;
    messages_per_period: number;
    drip_campaigns: number;
    kanban_boards: number;
  };
}

// Tambahkan interface untuk respons dari fungsi add_device_with_subscription_expiry
interface AddDeviceResponse {
  success: boolean;
  message: string;
  data: {
    id: string;
    name: string;
    connected: boolean;
    user_id: string;
    webhook_config: WebhookSettings;
    api_key: string;
    server: string;
    phone_number: string | null;
    expired_date: string;
    created_at: string;
  };
}

const DevicesPage = () => {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    deviceId: string | null;
  }>({
    isOpen: false,
    deviceId: null,
  });
  const navigate = useNavigate();
  
  // Fetch user data and devices
  useEffect(() => {
    let isMounted = true;
    let loadingTimeout: ReturnType<typeof setTimeout>;
    
    const fetchUserAndDevices = async () => {
      try {
        // Tampilkan loading setelah 300ms jika data belum selesai diambil
        loadingTimeout = setTimeout(() => {
          if (isMounted) setIsLoading(true);
        }, 300);
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!isMounted) return;
        
        if (!user) {
          setIsLoading(false);
          clearTimeout(loadingTimeout);
          return;
        }
        
        setUserId(user.id);
        
        // Dapatkan informasi subscription dan devices secara paralel
        const [subscriptionResult, connectionsResult] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/subscription`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': user.id
            }
          }).then(res => res.json()),
          supabase.from('connections')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        ]);
        
        const { data: connections, error } = connectionsResult;
          
        if (error) throw error;
        
        if (!isMounted) return;
        
        // Set batas device dari informasi subscription
        if (subscriptionResult.success && subscriptionResult.data) {
          console.log("Subscription data received:", subscriptionResult.data);
          const deviceLimitValue = subscriptionResult.data.plans_new?.limits?.active_devices || 1;
          console.log("Device limit value:", deviceLimitValue);
          console.log("Setting device limit to:", deviceLimitValue === -1 ? Infinity : deviceLimitValue);
          setDeviceLimit(deviceLimitValue === -1 ? Infinity : deviceLimitValue);
        } else {
          console.error("Error fetching subscription:", subscriptionResult);
          // Fallback to default limit
          setDeviceLimit(1);
        }
        
        // Ambil semua ID agen yang digunakan oleh device
        const agentIds = connections
          .filter(conn => conn.ai_agent_id)
          .map(conn => conn.ai_agent_id);
        
        // Jika ada agen yang terhubung, ambil data nama agen
        let agentNameMap = new Map();
        if (agentIds.length > 0) {
          const { data: agents, error: agentError } = await supabase
            .from('ai_agents')
            .select('id,name')
            .in('id', agentIds);
          
          if (!agentError && agents) {
            // Buat map dari ID agen ke nama agen
            agentNameMap = new Map(
              agents.map(agent => [agent.id, agent.name])
            );
          }
        }
        
        const formattedDevices: Device[] = connections.map(conn => {
          const webhookConfig = conn.webhook_config as unknown;
          const webhook = webhookConfig ? (webhookConfig as WebhookSettings) : defaultWebhook;
          
          // Ambil nama agen jika tersedia
          const agentName = conn.ai_agent_id ? agentNameMap.get(conn.ai_agent_id) : null;
          
          return {
            id: conn.id,
            name: conn.name,
            status: conn.connected ? "connected" as const : "disconnected" as const,
            apiKey: conn.api_key,
            webhook,
            user_id: conn.user_id,
            expired_date: conn.expired_date,
            server: conn.server || API_SERVER_URL,
            phone_number: conn.phone_number,
            ai_agent_id: conn.ai_agent_id,
            agent_name: agentName
          };
        });
        
        setDevices(formattedDevices);
      } catch (error) {
        console.error("Error fetching devices:", error);
        if (isMounted) {
          toast({
            title: "Error",
            description: "Failed to load devices. Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        clearTimeout(loadingTimeout);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchUserAndDevices();
    
    // Cleanup
    return () => {
      isMounted = false;
      clearTimeout(loadingTimeout);
    };
  }, [toast]);

  const handleAddDevice = async (name: string) => {
    if (!userId) {
      toast({
        title: "Error",
        description: "User not authenticated",
        variant: "destructive",
      });
      return;
    }

    try {
      const deviceId = await generateDeviceId(userId);
      const apiKey = await generateApiKey(deviceId, userId);
      
      // Tambahkan log untuk menampilkan URL server yang akan digunakan
      console.log(`[Add Device] Using server URL: ${API_SERVER_URL}`);
      
      // Gunakan fungsi SQL khusus yang akan mengatur expired_date sesuai subscription
      const { data, error } = await supabase.rpc<AddDeviceResponse, Record<string, never>>('add_device_with_subscription_expiry', {
        device_id: deviceId,
        name,
        user_id: userId,
        webhook_config: defaultWebhook as unknown as Json,
        api_key: apiKey,
        server: API_SERVER_URL // Gunakan environment variable
      });
      
      if (error) throw error;
      
      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to add device');
      }
      
      // Data device dari respons
      const deviceData = data.data;
      
      // Log data device yang diterima dari server
      console.log(`[Add Device] Received device data:`, deviceData);
      console.log(`[Add Device] Device server URL:`, deviceData.server);
      
      const deviceForState: Device = {
        id: deviceData.id,
        name: deviceData.name,
        status: deviceData.connected ? "connected" as const : "disconnected" as const,
        apiKey: deviceData.api_key,
        webhook: deviceData.webhook_config || defaultWebhook,
        user_id: deviceData.user_id,
        expired_date: deviceData.expired_date,
        // Prioritaskan server yang dikembalikan dari backend untuk memastikan konsistensi
        server: deviceData.server || API_SERVER_URL,
        phone_number: deviceData.phone_number || '',
        ai_agent_id: deviceData.ai_agent_id
      };
      
      setDevices((prev) => [...prev, deviceForState]);
      
      toast({
        title: "Success",
        description: "Device added successfully",
      });
    } catch (error) {
      console.error("Error adding device:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add device. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteDialog({ isOpen: true, deviceId: id });
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.deviceId) return;

    try {
      // Dapatkan device yang akan dihapus untuk mendapatkan server dan api key
      const device = devices.find(d => d.id === deleteDialog.deviceId);
      if (!device) {
        throw new Error("Device not found");
      }

      // Panggil API untuk menghapus koneksi
      const response = await fetch(`${device.server}/api/connection/${deleteDialog.deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${device.apiKey}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete device');
      }

      if (data.success) {
        // Update state untuk menghapus card
        setDevices((prev) => prev.filter(device => device.id !== deleteDialog.deviceId));
        
        toast({
          title: "Success",
          description: "Device deleted successfully",
        });
      } else {
        throw new Error(data.message || 'Failed to delete device');
      }
    } catch (error) {
      console.error("Error deleting device:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete device. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialog({ isOpen: false, deviceId: null });
    }
  };

  const handleWebhookUpdate = async (id: string, webhook: WebhookSettings) => {
    try {
      console.log("[DevicesPage] Memulai update webhook untuk device ID:", id);
      console.log("[DevicesPage] Data webhook yang dikirim:", webhook);
      
      // Dapatkan device untuk mendapatkan server dan api key
      const device = devices.find(d => d.id === id);
      if (!device) {
        throw new Error("Device not found");
      }

      // Panggil API untuk update webhook
      const response = await fetch(`${device.server}/api/webhook/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${device.apiKey}`
        },
        body: JSON.stringify({
          url: webhook.url,
          triggers: webhook.triggers
        })
      });

      const data = await response.json();
      console.log("[DevicesPage] Respons dari server:", data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update webhook');
      }

      if (data.success) {
        // Update state dengan data webhook baru
        setDevices((prev) => {
          const updatedDevices = prev.map((device) => {
            if (device.id === id) {
              console.log("[DevicesPage] Memperbarui device dengan ID:", id);
              console.log("[DevicesPage] Webhook data lama:", device.webhook);
              console.log("[DevicesPage] Webhook data baru:", webhook);
              return { 
                ...device, 
                webhook: webhook // Gunakan webhook dari parameter, bukan data.data
              };
            }
            return device;
          });
          return updatedDevices;
        });
        
        toast({
          title: "Success",
          description: data.message || "Webhook updated successfully",
        });
      } else {
        throw new Error(data.error || 'Failed to update webhook');
      }
    } catch (error) {
      console.error("Error updating webhook:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update webhook. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Expired Trial Banner */}
      <ExpiredTrialBanner />
      
      {/* Trial Notification */}
      <TrialNotification />
      
      
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
        
        <AddDeviceForm 
          onAddDevice={handleAddDevice}
          currentDeviceCount={devices.length}
          deviceLimit={deviceLimit}
        />
      </div>
      
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Spinner className="h-10 w-10 text-primary" />
          </div>
        ) : (
          <>
            {devices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] space-y-4">
                <div className="p-4 bg-muted/30 rounded-full">
                  <Smartphone className="h-10 w-10 text-muted-foreground/70" />
                </div>
                <h3 className="text-lg font-medium">No Devices Found</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Get started by creating a new device. You can add up to {0}
                  {deviceLimit ? `/${deviceLimit}` : ''} devices.
                </p>
                <Button 
                  variant="default" 
                  onClick={() => {
                    const addDeviceButton = document.querySelector('[data-testid="add-device-button"]') as HTMLButtonElement;
                    if (addDeviceButton) {
                      addDeviceButton.click();
                    }
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Device
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2 md:grid-cols-2 sm:grid-cols-1">
                {devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    id={device.id}
                    name={device.name}
                    status={device.status as "connected" | "disconnected"}
                    apiKey={device.apiKey}
                    webhook={device.webhook}
                    expiredDate={device.expired_date}
                    server={device.server}
                    phone_number={device.phone_number}
                    ai_agent_id={device.ai_agent_id}
                    agent_name={device.agent_name}
                    onDelete={handleDeleteRequest}
                    onWebhookUpdate={handleWebhookUpdate}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={deleteDialog.isOpen} onOpenChange={(isOpen) => 
        setDeleteDialog(prev => ({ ...prev, isOpen }))
      }>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Device</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this device? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ isOpen: false, deviceId: null })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DevicesPage;