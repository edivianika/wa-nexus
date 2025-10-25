import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Trash2, Key, Webhook, ClipboardCheck, CheckCircle, RefreshCw, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import io from "socket.io-client";

// Import WhatsApp icon component
const WhatsAppIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className={className}>
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
  </svg>
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

interface DeviceProps {
  id: string;
  name: string;
  status: "connected" | "disconnected";
  apiKey: string;
  webhook?: WebhookSettings;
  expiredDate: string;
  server: string;
  phone_number?: string | null;
  ai_agent_id?: string | null;
  agent_name?: string | null;
  onDelete: (id: string) => void;
  onWebhookUpdate: (id: string, webhook: WebhookSettings) => void;
}

// Fungsi utilitas untuk memastikan webhook selalu memiliki struktur lengkap
const ensureCompleteWebhook = (webhook?: Partial<WebhookSettings>): WebhookSettings => {
  return {
    url: webhook?.url || "",
    triggers: {
      private: webhook?.triggers?.private ?? false,
      group: webhook?.triggers?.group ?? false,
      broadcast: webhook?.triggers?.broadcast ?? false,
      newsletter: webhook?.triggers?.newsletter ?? false
    }
  };
};

// Use a dynamic WebSocket URL from environment variable, fallback to default
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'ws://localhost:3000'; 

export function DeviceCard({
  id,
  name,
  status,
  apiKey,
  webhook = defaultWebhook,
  expiredDate,
  server,
  phone_number: initialPhoneNumber,
  ai_agent_id,
  agent_name,
  onDelete,
  onWebhookUpdate
}: DeviceProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(initialPhoneNumber);
  
  // Pastikan webhook selalu memiliki struktur lengkap
  const safeWebhook = useMemo(() => ensureCompleteWebhook(webhook), [webhook]);
  
  const [newWebhook, setNewWebhook] = useState<WebhookSettings>(safeWebhook);
  const [webhookData, setWebhookData] = useState<WebhookSettings>(safeWebhook);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState(status);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [socketDisconnected, setSocketDisconnected] = useState(false);

  // Always use the dynamic WebSocket URL
  const socketUrl = SOCKET_URL;

  useEffect(() => {
    // Jika URL tidak valid, kita tidak akan membuat koneksi socket
    if (!socketUrl || socketUrl === 'undefined' || socketUrl === 'null') {
      console.warn("[Socket] URL server tidak valid, koneksi socket tidak akan dibuat");
      setSocketDisconnected(true);
      return;
    }
    
    // Hanya buat koneksi socket jika pengguna aktif melihat halaman
    let socketInstance: any = null;
    let socketConnected = false;
    let isActive = true;
    
    const initializeSocket = () => {
      try {
        socketInstance = io(socketUrl, {
          query: { deviceId: id },
          transports: ['websocket'], // Prioritaskan websocket saja untuk kecepatan
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 2,
          reconnectionDelay: 1000,
          timeout: 5000, // Kurangi timeout untuk mempercepat
        });

        socketInstance.on('connect', () => {
          socketConnected = true;
          setSocketDisconnected(false);
          console.log(`[Socket] Connected to server: ${socketUrl}`);
          
          // Emit join event with connection ID
          socketInstance.emit('join', { connectionId: id });
          console.log(`[Socket] Emitted join event for connectionId: ${id}`);
        });

        socketInstance.on('connect_error', (error) => {
          setSocketDisconnected(true);
          console.error(`[Socket] Connection error:`, error);
        });

        socketInstance.on('disconnect', (reason) => {
          socketConnected = false;
          setConnectionStatus('disconnected');
          console.log(`[Socket] Disconnected. Reason:`, reason);
        });

        // Mengurangi jumlah event yang perlu didengarkan
        socketInstance.on('connection_status', (data: any) => {
          console.log(`[Socket] Connection status update:`, data);
          if (data.connectionId === id) {
            if (data.status === 'connected') {
              setConnectionStatus('connected');
              setIsQrDialogOpen(false);
              // Update phone number when receiving connection status
              if (data.phoneNumber) {
                console.log(`[Socket] Updating phone number to: ${data.phoneNumber}`);
                setPhoneNumber(data.phoneNumber);
              }
              toast.success(data.message || 'Perangkat berhasil terhubung');
            } else if (data.status === 'disconnected') {
              setConnectionStatus('disconnected');
              toast.error(data.message || 'Perangkat terputus');
            }
          }
        });

        socketInstance.on('qr_status', (data: any) => {
          console.log(`[Socket] QR status update:`, data);
          if (data.status === 'connected') {
            setConnectionStatus('connected');
            setIsQrDialogOpen(false);
            toast.success('Perangkat berhasil terhubung');
          } else if (data.status === 'disconnected') {
            setConnectionStatus('disconnected');
            toast.error('Perangkat terputus');
          }
        });

        socketInstance.on('qr_error', (error: any) => {
          console.error(`[Socket] QR error:`, error);
          setError(error.message);
          toast.error(error.message);
        });
      } catch (err) {
        setSocketDisconnected(true);
      }
    };

    // Gunakan requestIdleCallback untuk menunda inisialisasi socket sampai browser idle
    const idleCallbackId = window.requestIdleCallback ? 
      window.requestIdleCallback(() => {
        if (isActive) initializeSocket();
      }, { timeout: 1000 }) : 
      setTimeout(() => {
        if (isActive) initializeSocket();
      }, 1000);

    return () => {
      isActive = false;
      if (window.cancelIdleCallback && idleCallbackId && typeof idleCallbackId === 'number') {
        window.cancelIdleCallback(idleCallbackId);
      } else if (idleCallbackId) {
        clearTimeout(idleCallbackId as number);
      }
      
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [id, socketUrl]);

  // Update state ketika prop webhook berubah
  useEffect(() => {
    setNewWebhook(safeWebhook);
    setWebhookData(safeWebhook);
  }, [safeWebhook]);

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setApiKeyCopied(true);
    toast.success("API Key disalin ke clipboard");
    setTimeout(() => {
      setApiKeyCopied(false);
    }, 2000);
  };

  const handleCopyWebhook = () => {
    if (webhookData.url) {
      navigator.clipboard.writeText(webhookData.url);
      setWebhookCopied(true);
      toast.success("Webhook URL disalin ke clipboard");
      setTimeout(() => {
        setWebhookCopied(false);
      }, 2000);
    }
  };

  const handleSaveWebhook = async () => {
    try {
      // Pastikan struktur webhook lengkap sebelum disimpan
      const webhookToSave = ensureCompleteWebhook(newWebhook);
      
      console.log("[Webhook] Menyimpan webhook baru:", webhookToSave);
      await onWebhookUpdate(id, webhookToSave);
      
      // Perbarui data webhook lokal
      console.log("[Webhook] Memperbarui UI dengan webhook baru");
      setWebhookData({...webhookToSave}); // Buat objek baru untuk memastikan rerender
      
      // Tutup dialog
      setIsWebhookDialogOpen(false);
      
      // Tampilkan notifikasi sukses
      toast.success("Pengaturan webhook berhasil diperbarui");
    } catch (error) {
      console.error("[Webhook] Gagal memperbarui:", error);
      toast.error("Gagal memperbarui pengaturan webhook");
    }
  };

  const handleReconnect = async () => {
    setIsLoading(true);
    setError(null);
    setQrCode(null);
    
    // Validasi URL server
    if (!socketUrl || socketUrl === 'undefined' || socketUrl === 'null') {
      setError("URL server tidak valid");
      toast.error("URL server tidak valid");
      setIsLoading(false);
      return;
    }
    
    try {
      const loadingToast = toast.loading("Meminta QR code...");
      
      // Gunakan URL server dari props perangkat
      const qrRequestUrl = `${server}/api/qr/request`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(qrRequestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: controller.signal
      }).catch(err => {
        throw new Error(`Gagal terhubung ke server: ${err.message}`);
      });
      
      clearTimeout(timeoutId);
      toast.dismiss(loadingToast);
      
      if (!response) {
        throw new Error('Tidak ada respons dari server');
      }
      
      const data = await response.json();
      console.log("Response data:", data);
      
      if (!response.ok) {
        throw new Error(data?.message || `Error server: ${response.status}`);
      }
      
      if (data?.success && (data?.qrCode || (data?.data && data?.data?.qr))) {
        // Cek struktur respons dan gunakan yang sesuai
        const qrCodeData = data?.qrCode || data?.data?.qr;
        console.log("QR code ditemukan:", qrCodeData ? "Ya" : "Tidak");
        setQrCode(qrCodeData);
        setIsQrDialogOpen(true);
        toast.success("QR code berhasil dimuat");
      } else {
        console.error("Format respons tidak sesuai:", data);
        throw new Error(data?.message || 'Format respons tidak valid');
      }
    } catch (err: any) {
      let errorMessage = 'Gagal mendapatkan QR code';
      
      if (err.name === 'AbortError') {
        errorMessage = 'Timeout: Server tidak merespons';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Tambahkan handler untuk disconnect
  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const logoutUrl = `${server}/api/logout/${id}`;
      const response = await fetch(logoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Gagal disconnect device');
      }
      setConnectionStatus('disconnected');
      toast.success('Device berhasil disconnect');
    } catch (err: any) {
      setError(err.message || 'Gagal disconnect device');
      toast.error(err.message || 'Gagal disconnect device');
    } finally {
      setIsLoading(false);
    }
  };

  const formattedExpiredDate = new Date(expiredDate).toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const handleOpenWebhookDialog = () => {
    // Pastikan newWebhook memiliki struktur lengkap
    setNewWebhook(ensureCompleteWebhook(webhookData));
    setIsWebhookDialogOpen(true);
  };

  const handleCloseWebhookDialog = () => {
    setIsWebhookDialogOpen(false);
    // Reset nilai form ke nilai asli
    setNewWebhook(ensureCompleteWebhook(webhookData));
  };

  return (
    <Card className="border shadow-sm transition-all hover:shadow-md hover:border-border/60">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <div className="flex items-center justify-between w-full mb-4">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge 
                  variant={connectionStatus === "connected" ? "default" : "outline"}
                  className={connectionStatus === "connected" 
                    ? "bg-green-100 hover:bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/40 dark:hover:bg-green-900/30 flex items-center gap-1 px-2.5 py-0.5" 
                    : "text-muted-foreground flex items-center gap-1 px-2.5 py-0.5"
                  }
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  <span className="flex items-center gap-1">
                    {connectionStatus === "connected" ? (
                      <>
                        Connected
                        <span className="opacity-60">-</span>
                        <span>[ {phoneNumber || 'No Number'} ]</span>
                      </>
                    ) : "Disconnected"}
                  </span>
                </Badge>
                {socketDisconnected && (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/40 px-2 py-0.5">
                    Socket: Offline
                  </Badge>
                )}
              </div>
              
              {agent_name && (
                <div className="flex items-center flex-shrink-0">
                  <div className="mx-2 relative w-12 h-3 flex-grow">
                    <div className="absolute inset-0 flex items-center">
                      <div className="h-0.5 w-full bg-muted-foreground/30"></div>
                    </div>
                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 border-t border-r border-muted-foreground/30 rotate-45"></div>
                  </div>
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40 flex items-center gap-1 px-2 py-0.5 whitespace-nowrap">
                    <div className="text-[10px] font-semibold flex items-center justify-center mr-0.5">AI</div>
                    {agent_name}
                  </Badge>
                </div>
              )}
            </div>
            <CardTitle className="text-lg font-semibold">{name}</CardTitle>
          </div>
          
          <div className="flex gap-1">
            {connectionStatus === "disconnected" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReconnect}
                disabled={isLoading}
                className="h-8 px-3 hover:bg-green-50 hover:text-green-600 hover:border-green-200 dark:hover:bg-green-900/20 dark:hover:text-green-400 dark:hover:border-green-800/40"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                Scan QR
              </Button>
            )}
            {connectionStatus === "connected" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100/20"
                onClick={handleDisconnect}
                disabled={isLoading}
                title="Disconnect"
              >
                <PowerOff className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="px-5 pb-5 pt-0 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">API Key</Label>
            <div className="rounded-md bg-muted/40 px-3 py-1.5 font-mono text-xs overflow-x-auto flex-1 border border-muted/30">
              {showApiKey ? apiKey : "•".repeat(20)}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted/80"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                <Key className="h-3 w-3" />
                <span className="sr-only">Toggle API Key</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted/80"
                onClick={handleCopyApiKey}
              >
                {apiKeyCopied ? 
                  <CheckCircle className="h-3 w-3 text-green-500" /> : 
                  <ClipboardCheck className="h-3 w-3" />
                }
                <span className="sr-only">Copy API Key</span>
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Webhook</Label>
            <div 
              className="rounded-md bg-muted/40 px-3 py-1.5 font-mono text-xs truncate flex-1 border border-muted/30"
              key={`webhook-display-${webhookData.url}`}
            >
              {webhookData.url || "Belum diatur"}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <Dialog open={isWebhookDialogOpen} onOpenChange={(open) => {
                if (open) {
                  handleOpenWebhookDialog();
                } else {
                  handleCloseWebhookDialog();
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-muted/80">
                    <Webhook className="h-3 w-3" />
                    <span className="sr-only">Update Webhook</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Perbarui URL Webhook</DialogTitle>
                    <DialogDescription>
                      Masukkan URL tempat Anda ingin menerima notifikasi webhook untuk perangkat ini.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="webhook-url">Webhook</Label>
                      <Input
                        id="webhook-url"
                        value={newWebhook.url}
                        onChange={(e) => setNewWebhook({ 
                          ...newWebhook, 
                          url: e.target.value 
                        })}
                        placeholder="https://your-server.com/webhook"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="private-message"
                          checked={Boolean(newWebhook.triggers?.private)}
                          onCheckedChange={(checked) => 
                            setNewWebhook({ 
                              ...newWebhook, 
                              triggers: {
                                ...newWebhook.triggers,
                                private: Boolean(checked)
                              }
                            })
                          }
                        />
                        <Label htmlFor="private-message">Pesan Private</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="group-message"
                          checked={Boolean(newWebhook.triggers?.group)}
                          onCheckedChange={(checked) => 
                            setNewWebhook({ 
                              ...newWebhook, 
                              triggers: {
                                ...newWebhook.triggers,
                                group: Boolean(checked)
                              }
                            })
                          }
                        />
                        <Label htmlFor="group-message">Pesan Group</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="broadcast"
                          checked={Boolean(newWebhook.triggers?.broadcast)}
                          onCheckedChange={(checked) => 
                            setNewWebhook({ 
                              ...newWebhook, 
                              triggers: {
                                ...newWebhook.triggers,
                                broadcast: Boolean(checked)
                              }
                            })
                          }
                        />
                        <Label htmlFor="broadcast">Pesan Broadcast</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="newsletter"
                          checked={Boolean(newWebhook.triggers?.newsletter)}
                          onCheckedChange={(checked) => 
                            setNewWebhook({ 
                              ...newWebhook, 
                              triggers: {
                                ...newWebhook.triggers,
                                newsletter: Boolean(checked)
                              }
                            })
                          }
                        />
                        <Label htmlFor="newsletter">Newsletter</Label>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveWebhook}>Simpan Perubahan</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted/80"
                onClick={handleCopyWebhook}
                disabled={!webhookData.url}
              >
                {webhookCopied ? 
                  <CheckCircle className="h-3 w-3 text-green-500" /> : 
                  <ClipboardCheck className="h-3 w-3" />
                }
                <span className="sr-only">Copy Webhook URL</span>
              </Button>
            </div>
          </div>
        </div>
        
        <div 
          className="text-xs text-muted-foreground cursor-pointer flex items-center hover:text-foreground transition-colors"
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
        >
          <span>Detail Teknis</span>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="12" 
            height="12" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={`ml-1 transition-transform ${showTechnicalDetails ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
        
        {showTechnicalDetails && (
          <div className="space-y-2 pt-2 border-t text-xs">
            <div className="grid grid-cols-3 gap-1">
              <div className="text-muted-foreground">ID:</div>
              <div className="col-span-2 font-mono text-xs break-all">{id}</div>
            </div>
            
            {ai_agent_id && (
              <div className="grid grid-cols-3 gap-1">
                <div className="text-muted-foreground">Agent ID:</div>
                <div className="col-span-2 font-mono text-xs break-all text-blue-600 dark:text-blue-400">{ai_agent_id}</div>
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-1">
              <div className="text-muted-foreground">Server:</div>
              <div className="col-span-2 font-mono text-xs break-all">{server}</div>
            </div>
            
            <div className="grid grid-cols-3 gap-1">
              <div className="text-muted-foreground">Expires:</div>
              <div className="col-span-2">{formattedExpiredDate}</div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pindai Kode QR</DialogTitle>
            <DialogDescription>
              Buka WhatsApp di ponsel Anda dan pindai kode QR ini untuk menghubungkan perangkat Anda.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-4">
            {isLoading && (
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
            )}
            {error && (
              <div className="text-destructive text-center">
                {error}
              </div>
            )}
            {qrCode && (
              <div className="relative w-64 h-64">
                <img
                  src={qrCode}
                  alt="WhatsApp QR Code"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsQrDialogOpen(false)}
            >
              Tutup
            </Button>
            <Button
              onClick={handleReconnect}
              disabled={isLoading}
            >
              Segarkan QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}