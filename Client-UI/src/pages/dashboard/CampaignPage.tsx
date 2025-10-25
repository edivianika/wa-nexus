import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PlusCircle, Eye } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link } from "react-router-dom";

interface Campaign {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

interface DripMessage {
  id: string;
  message: string;
  type: string;
  delay: number;
  order: number;
}

interface DripSubscriber {
  id: string;
  contact_id: string;
  created_at: string;
  last_message_sent_at?: string;
}

interface DripLog {
  id: string;
  drip_message_id: string;
  contact_id: string;
  status: string;
  sent_at: string;
}

const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
const API_URL = API_SERVER_URL + '/api';

const CampaignPage = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", description: "" });
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [tab, setTab] = useState("messages");
  const [messages, setMessages] = useState<DripMessage[]>([]);
  const [subscribers, setSubscribers] = useState<DripSubscriber[]>([]);
  const [logs, setLogs] = useState<DripLog[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [newMessage, setNewMessage] = useState({ message: "", type: "text", delay: 0, order: 1 });
  const [newSubscriber, setNewSubscriber] = useState({ contact_id: "" });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      // Get user ID from localStorage
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please log in again.");
        return;
      }
      
      const res = await fetch(`${API_URL}/drip/campaigns`, {
        headers: {
          'x-user-id': userId
        }
      });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      const data = await res.json();
      setCampaigns(data || []);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      toast.error("Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCampaign = async () => {
    try {
      // Get user ID from localStorage
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please log in again.");
        return;
      }
      
      const res = await fetch(`${API_URL}/drip/campaigns`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          'x-user-id': userId
        },
        body: JSON.stringify(newCampaign)
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      const data = await res.json();
      setCampaigns([...campaigns, data]);
      setShowCreateDialog(false);
      setNewCampaign({ name: "", description: "" });
      toast.success("Campaign created successfully");
    } catch (error) {
      console.error("Error creating campaign:", error);
      toast.error("Failed to create campaign");
    }
  };

  const openDetail = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setShowDetailDialog(true);
    setTab("messages");
    setIsDetailLoading(true);
    
    try {
      // Get user ID from localStorage
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please log in again.");
        return;
      }
      
      const headers = { 'x-user-id': userId };
      
      const [msgRes, subRes, logRes] = await Promise.all([
        fetch(`${API_URL}/drip/campaigns/${campaign.id}/messages`, { headers }),
        fetch(`${API_URL}/drip/campaigns/${campaign.id}/subscribers`, { headers }),
        fetch(`${API_URL}/drip/campaigns/${campaign.id}/logs`, { headers }),
      ]);
      setMessages((await msgRes.json()) || []);
      setSubscribers((await subRes.json()) || []);
      setLogs((await logRes.json()) || []);
    } catch (e) {
      toast.error("Failed to load campaign details");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleAddMessage = async () => {
    if (!selectedCampaign) return;
    
    try {
      // Get user ID from localStorage
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please log in again.");
        return;
      }
      
      const res = await fetch(`${API_URL}/drip/campaigns/${selectedCampaign.id}/messages`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          'x-user-id': userId
        },
        body: JSON.stringify(newMessage),
      });
      if (!res.ok) throw new Error("Failed to add message");
      const data = await res.json();
      setMessages([...messages, data]);
      setNewMessage({ message: "", type: "text", delay: 0, order: messages.length + 2 });
      toast.success("Message added");
    } catch (e) {
      toast.error("Failed to add message");
    }
  };

  const handleAddSubscriber = async () => {
    if (!selectedCampaign) return;
    
    try {
      // Get user ID from localStorage
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please log in again.");
        return;
      }
      
      const res = await fetch(`${API_URL}/drip/campaigns/${selectedCampaign.id}/subscribers`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          'x-user-id': userId
        },
        body: JSON.stringify(newSubscriber),
      });
      if (!res.ok) throw new Error("Failed to add subscriber");
      const data = await res.json();
      setSubscribers([...subscribers, data]);
      setNewSubscriber({ contact_id: "" });
      toast.success("Subscriber added");
    } catch (e) {
      toast.error("Failed to add subscriber");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        {/* <Button asChild>
          <Link to="/dashboard/campaign/create">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create Campaign
          </Link>
        </Button> */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    Loading campaigns...
                  </TableCell>
                </TableRow>
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    No campaigns found
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>{campaign.name}</TableCell>
                    <TableCell>{campaign.description}</TableCell>
                    <TableCell>{new Date(campaign.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openDetail(campaign)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newCampaign.description}
                onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCampaign}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Campaign Detail</DialogTitle>
            <div className="text-sm text-muted-foreground">{selectedCampaign?.name}</div>
          </DialogHeader>
          {isDetailLoading ? (
            <div className="py-8 text-center">Loading...</div>
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="mt-4">
              <TabsList>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
              </TabsList>
              <TabsContent value="messages">
                <div className="mb-2 font-semibold">Drip Messages</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Delay (min)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">No messages</TableCell>
                      </TableRow>
                    ) : (
                      messages.map((msg) => (
                        <TableRow key={msg.id}>
                          <TableCell>{msg.order}</TableCell>
                          <TableCell>{msg.message}</TableCell>
                          <TableCell>{msg.type}</TableCell>
                          <TableCell>{msg.delay}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div className="mt-4 flex gap-2 items-end">
                  <div>
                    <Label>Message</Label>
                    <Input value={newMessage.message} onChange={e => setNewMessage({ ...newMessage, message: e.target.value })} />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Input value={newMessage.type} onChange={e => setNewMessage({ ...newMessage, type: e.target.value })} />
                  </div>
                  <div>
                    <Label>Delay (min)</Label>
                    <Input type="number" value={newMessage.delay} onChange={e => setNewMessage({ ...newMessage, delay: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Order</Label>
                    <Input type="number" value={newMessage.order} onChange={e => setNewMessage({ ...newMessage, order: Number(e.target.value) })} />
                  </div>
                  <Button onClick={handleAddMessage}>Add</Button>
                </div>
              </TabsContent>
              <TabsContent value="subscribers">
                <div className="mb-2 font-semibold">Subscribers</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact ID</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Last Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4">No subscribers</TableCell>
                      </TableRow>
                    ) : (
                      subscribers.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell>{sub.contact_id}</TableCell>
                          <TableCell>{new Date(sub.created_at).toLocaleString()}</TableCell>
                          <TableCell>{sub.last_message_sent_at ? new Date(sub.last_message_sent_at).toLocaleString() : '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div className="mt-4 flex gap-2 items-end">
                  <div>
                    <Label>Contact ID</Label>
                    <Input value={newSubscriber.contact_id} onChange={e => setNewSubscriber({ contact_id: e.target.value })} />
                  </div>
                  <Button onClick={handleAddSubscriber}>Add</Button>
                </div>
              </TabsContent>
              <TabsContent value="logs">
                <div className="mb-2 font-semibold">Drip Logs</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact ID</TableHead>
                      <TableHead>Message ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">No logs</TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{log.contact_id}</TableCell>
                          <TableCell>{log.drip_message_id}</TableCell>
                          <TableCell>{log.status}</TableCell>
                          <TableCell>{new Date(log.sent_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignPage; 