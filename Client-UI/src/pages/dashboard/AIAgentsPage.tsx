import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Plus, Trash2, Settings, Link, MessageSquare, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Interface untuk data agen AI
interface AIAgent {
  id: string;
  name: string;
  description: string;
  type: "customer-service" | "sales" | "custom";
  status: "active" | "inactive";
  created_at: string;
  user_id?: string;
  settings: {
    behaviour: string;
    knowledge: string;
    more_settings: {
      multi_bubble_chat: boolean;
      humanlike_behaviour: boolean;
      stop_ai_if_cs_replied: boolean;
    };
  };
  connectedDevices?: Array<{id: string, name: string}>;
}

// Interface untuk data device
interface Device {
  id: string;
  name: string;
  status: "active" | "inactive";
  type: string;
  last_active: string;
}

const AIAgentsPage = () => {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [devices, setDevices] = useState<Device[]>([
    {
      id: "device-1",
      name: "Level Up Business",
      status: "inactive",
      type: "Business",
      last_active: "2023-10-15T14:30:00Z"
    },
    {
      id: "device-2",
      name: "Indomusika",
      status: "inactive",
      type: "Music",
      last_active: "2023-10-14T09:15:00Z"
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [settingsTab, setSettingsTab] = useState("integration");
  const [newAgent, setNewAgent] = useState({
    name: "",
    description: "",
    type: "customer-service" as "customer-service" | "sales" | "custom",
    customInstructions: ""
  });
  const navigate = useNavigate();

  // Fetch agents from database
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setIsLoading(true);
        
        // Get current user
        const { data: userData } = await supabase.auth.getUser();
        
        if (!userData || !userData.user) {
          throw new Error("User not authenticated");
        }
        
        // Fetch user's agents
        const { data, error } = await supabase
          .from('ai_agents')
          .select('*')
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data) {
          // Convert database data to AIAgent type
          setAgents(data.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            type: item.type as "customer-service" | "sales" | "custom",
            status: item.status as "active" | "inactive",
            created_at: item.created_at,
            user_id: item.user_id,
            settings: item.settings as AIAgent['settings']
          })));
        }
      } catch (error) {
        console.error('Error fetching agents:', error);
        toast.error('Gagal memuat data agen AI');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAgents();
  }, []);

  // Tambahkan fetchConnections setelah fetchAgents berhasil
  useEffect(() => {
    const fetchConnections = async () => {
      try {
        // Get current user
        const { data: userData } = await supabase.auth.getUser();
        
        if (!userData || !userData.user) {
          throw new Error("User not authenticated");
        }
        
        // Fetch user's connections
        const { data, error } = await supabase
          .from('connections')
          .select('id, name, ai_agent_id, connected')
          .eq('user_id', userData.user.id);
        
        if (error) throw error;
        
        if (data) {
          // Group connections by agent_id
          const connectionsMap = new Map();
          
          data.forEach(connection => {
            if (connection.ai_agent_id && connection.connected) {
              if (!connectionsMap.has(connection.ai_agent_id)) {
                connectionsMap.set(connection.ai_agent_id, []);
              }
              
              connectionsMap.get(connection.ai_agent_id).push({
                id: connection.id,
                name: connection.name
              });
            }
          });
          
          // Update agents with their connected devices
          setAgents(agents.map(agent => ({
            ...agent,
            connectedDevices: connectionsMap.get(agent.id) || []
          })));
        }
      } catch (error) {
        console.error('Error fetching connections:', error);
      }
    };
    
    if (agents.length > 0) {
      fetchConnections();
    }
  }, [agents.length]); // Tambahkan dependency agents.length

  const handleCreateAgent = async () => {
    setIsLoading(true);
    
    try {
      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      
      if (!userData || !userData.user) {
        throw new Error("User not authenticated");
      }
      
      // Prepare agent data
      const agentData = {
        name: newAgent.name,
        description: newAgent.description,
        type: newAgent.type,
        status: "active",
        user_id: userData.user.id,
        settings: {
          behaviour: `Halo, saya adalah asisten ${newAgent.name}. Ada yang bisa saya bantu?`,
          knowledge: "",
          more_settings: {
            humanlike_behaviour: true,
            multi_bubble_chat: false,
            stop_ai_if_cs_replied: true
          }
        }
      };
      
      // Insert agent into database
      const { data, error } = await supabase
        .from('ai_agents')
        .insert(agentData)
        .select();
      
      if (error) throw error;
      
      if (data) {
        // Add new agent to state
        const newAgent: AIAgent = {
          id: data[0].id,
          name: data[0].name,
          description: data[0].description,
          type: data[0].type as "customer-service" | "sales" | "custom",
          status: data[0].status as "active" | "inactive",
          created_at: data[0].created_at,
          user_id: data[0].user_id,
          settings: data[0].settings as AIAgent['settings']
        };
        
        // Add to agents array
        setAgents([newAgent, ...agents]);
        
        // Reset form
        setNewAgent({
          name: "",
          description: "",
          type: "customer-service",
          customInstructions: "",
        });
        
        setIsDialogOpen(false);
        toast.success("Agen AI berhasil dibuat");
        
        // Arahkan ke halaman pengaturan agen yang baru dibuat
        navigate(`/dashboard/ai-agents/settings/${newAgent.id}`);
      }
    } catch (error) {
      console.error('Error creating agent:', error);
      toast.error('Gagal membuat agen AI');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    try {
      // Tampilkan konfirmasi delete
      if (!confirm("Apakah Anda yakin ingin menghapus agen ini beserta semua file-nya?")) {
        return;
      }
      
      const loadingToast = toast.loading("Menghapus agen dan file-nya...");
      
      // Hapus semua file agen melalui document API
      try {
        const DOCUMENT_API_URL = import.meta.env.VITE_DOCUMENT_API_URL || 'http://localhost:1212';
        const apiResponse = await fetch(`${DOCUMENT_API_URL}/files/agent`, {
          method: 'DELETE',
          headers: {
            'agent-id': id
          }
        });
        
        if (apiResponse.ok) {
          console.log("File agen berhasil dihapus");
        } else {
          const errorText = await apiResponse.text();
          console.error("Gagal menghapus file agen:", errorText);
        }
      } catch (apiError) {
        console.error("Error menghapus file agen:", apiError);
        // Lanjutkan proses meskipun gagal menghapus file
      }
      
      // Delete agent from database
      const { error } = await supabase
        .from('ai_agents')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Remove agent from state
      setAgents(agents.filter(agent => agent.id !== id));
      
      toast.dismiss(loadingToast);
      toast.success("Agen AI dan file-nya berhasil dihapus");
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast.error('Gagal menghapus agen AI');
    }
  };

  const handleOpenSettings = (agent: AIAgent) => {
    setSelectedAgent(agent);
    setSettingsTab("integration");
  };

  const handleSaveSettings = () => {
    if (!selectedAgent) return;
    
    setAgents(agents.map(agent => 
      agent.id === selectedAgent.id ? selectedAgent : agent
    ));
    
    toast.success("Pengaturan berhasil disimpan");
  };

  const updateAgentSetting = (section: string, field: string, value: any) => {
    if (!selectedAgent || !selectedAgent.settings) return;
    
    if (section === 'behaviour' || section === 'knowledge') {
      setSelectedAgent({
        ...selectedAgent,
        settings: {
          ...selectedAgent.settings,
          [section]: String(value)
        }
      });
    } else if (section === 'more_settings') {
      setSelectedAgent({
        ...selectedAgent,
        settings: {
          ...selectedAgent.settings,
          more_settings: {
            ...selectedAgent.settings.more_settings,
            [field]: value
          }
        }
      });
    }
  };

  const toggleDeviceStatus = (id: string) => {
    setDevices(devices.map(device => 
      device.id === id ? 
      { ...device, status: device.status === "active" ? "inactive" : "active" } : 
      device
    ));
    
    const device = devices.find(d => d.id === id);
    if (device) {
      toast.success(`${device.name} ${device.status === "active" ? "dinonaktifkan" : "diaktifkan"}`);
    }
  };

  const renderAgentTypeBadge = (type: AIAgent['type']) => {
    switch (type) {
      case "customer-service":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700">Customer Service</Badge>;
      case "sales":
        return <Badge variant="outline" className="bg-green-50 text-green-700">Sales</Badge>;
      case "custom":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700">Custom</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Agen AI</h1>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Buat Agen AI
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Agen AI Baru</DialogTitle>
              <DialogDescription>
                Buat asisten AI yang dapat berinteraksi dengan pelanggan Anda melalui WhatsApp.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Nama Agen</Label>
                <Input 
                  id="agent-name" 
                  placeholder="Contoh: Asisten Penjualan" 
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({...newAgent, name: e.target.value})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="agent-type">Tipe Agen</Label>
                <Select 
                  value={newAgent.type} 
                  onValueChange={(value: "customer-service" | "sales" | "custom") => 
                    setNewAgent({...newAgent, type: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tipe agen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer-service">Customer Service</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="agent-description">Deskripsi</Label>
                <Textarea 
                  id="agent-description" 
                  placeholder="Deskripsi singkat tentang fungsi agen ini" 
                  value={newAgent.description}
                  onChange={(e) => setNewAgent({...newAgent, description: e.target.value})}
                />
              </div>
              
              {typeof newAgent.type === "string" && newAgent.type === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="custom-instructions">Instruksi Khusus</Label>
                  <Textarea 
                    id="custom-instructions" 
                    placeholder="Berikan instruksi detail tentang bagaimana agen ini seharusnya berperilaku" 
                    value={newAgent.customInstructions}
                    onChange={(e) => setNewAgent({...newAgent, customInstructions: e.target.value})}
                    className="min-h-[100px]"
                  />
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button onClick={handleCreateAgent} disabled={isLoading}>
                {isLoading ? "Membuat..." : "Buat Agen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center min-h-[70vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
          <p className="ml-3">Memuat data agen...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 text-center border rounded-lg p-8">
          <div className="bg-muted h-16 w-16 rounded-full flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-1">Belum ada Agen AI</h2>
          <p className="text-muted-foreground mb-4 max-w-md">
            Buat agen AI pertama Anda untuk mulai otomatisasi customer service dan penjualan melalui WhatsApp.
          </p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Buat Agen AI
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="overflow-hidden flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <div className="mt-1">
                      {renderAgentTypeBadge(agent.type)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => navigate(`/dashboard/ai-agents/settings/${agent.id}`)}
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDeleteAgent(agent.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground mb-3">{agent.description}</p>
                
                {/* Tampilkan devices yang terhubung */}
                {agent.connectedDevices && agent.connectedDevices.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Devices terhubung:</p>
                    <div className="flex flex-wrap gap-2">
                      {agent.connectedDevices.map(device => (
                        <Badge key={device.id} variant="outline" className="bg-muted/30 px-3 py-1 rounded-full">
                          {device.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Tidak ada device terhubung</p>
                )}
              </CardContent>
              <CardFooter className="bg-muted/50 p-3 mt-auto">
                <span className="text-xs text-muted-foreground">
                  Dibuat: {new Date(agent.created_at).toLocaleDateString('id-ID')}
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AIAgentsPage; 