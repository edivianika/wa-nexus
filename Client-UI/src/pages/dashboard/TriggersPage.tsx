import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from '@/components/ui/use-toast';
import { PlusCircle, Edit, Trash2, Zap, Save, X, ChevronDown, ChevronUp, Webhook, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { refreshTriggerCache } from "@/lib/api";

interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  sender: string;
  source: string;
  keywords: string[];
  actionType: string;
  webhookUrl?: string;
  webhookMethod?: string;
  webhookHeaders?: { key: string; value: string }[];
  webhookBody?: string;
  connectionId: string;
  apiKey?: string;
}

const TriggersPage = () => {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; triggerId: string | null }>({ isOpen: false, triggerId: null });

  // Form state
  const [form, setForm] = useState<Partial<Trigger>>({
    name: "",
    enabled: true,
    sender: "",
    source: "Messages from Customers",
    keywords: [],
    actionType: "webhook",
    webhookUrl: "",
    webhookMethod: "POST",
    webhookHeaders: [],
    webhookBody: ""
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [headerKey, setHeaderKey] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [bodyFields, setBodyFields] = useState<{ key: string; value: string }[]>(form.webhookBody && Array.isArray(form.webhookBody) ? form.webhookBody : []);

  // Tambahkan fungsi mapping label trigger source
  const getTriggerSourceLabel = (val: string) => {
    if (val === '1') return 'Messages from Customers';
    if (val === '2') return 'Messages from Me';
    if (val === '3') return 'Message From Group';
    return val || '-';
  };

  // Fetch triggers from Supabase
  useEffect(() => {
    const fetchTriggers = async () => {
      setLoading(true);
      try {
        // Get user ID from localStorage
        const userId = localStorage.getItem('user_id');
        if (!userId) {
          toast({ description: "User ID not found. Please log in again." });
          return;
        }

        // Join message_triggers with connections to get device name and filter by user_id
        const { data, error } = await supabase
          .from('message_triggers')
          .select('*, connections:connection_id(id, name, phone_number, api_key)')
          .eq('user_id', userId); // Filter by user_id
          
        if (error) throw error;
        // Map Supabase data to Trigger type
        const mapped = (data || []).map((row: any) => {
          const deviceName = row.connections?.name || row.connection_id || '-';
          const devicePhone = row.connections?.phone_number ? ` (${row.connections.phone_number})` : '';
          let keywords: string[] = [];
          if (typeof row.keyword === 'string') {
            try {
              const parsed = JSON.parse(row.keyword);
              keywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
            } catch {
              keywords = [];
            }
          } else if (typeof row.keyword === 'object' && row.keyword !== null && 'keywords' in row.keyword) {
            keywords = Array.isArray((row.keyword as any).keywords) ? (row.keyword as any).keywords : [];
          } else {
            keywords = [];
          }
          const triggerObj: Trigger = {
            id: row.id,
            name: row.trigger_name,
            enabled: row.status === 'active',
            sender: deviceName + devicePhone,
            source: row.trigger_source || '',
            keywords,
            actionType: row.action?.type || '',
            webhookUrl: row.action?.url,
            webhookMethod: row.action?.method,
            webhookHeaders: row.action?.headers,
            webhookBody: row.action?.body,
            connectionId: row.connection_id,
            apiKey: row.connections?.api_key,
          };
          return triggerObj;
        });
        setTriggers(mapped);
      } catch (err: any) {
        toast({ description: "Failed to load triggers: " + (err?.message || err) });
      } finally {
        setLoading(false);
      }
    };
    fetchTriggers();
  }, []);

  const openAddDialog = () => {
    setEditingTrigger(null);
    setForm({
      name: "",
      enabled: true,
      sender: "",
      source: "Messages from Customers",
      keywords: [],
      actionType: "webhook",
      webhookUrl: "",
      webhookMethod: "POST",
      webhookHeaders: [],
      webhookBody: ""
    });
    setShowDialog(true);
  };

  const openEditDialog = async (trigger: Trigger) => {
    setEditingTrigger(trigger);
    setShowDialog(true);
    // Get user ID from localStorage
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast({ description: "User ID not found. Please log in again." });
      setShowDialog(false);
      return;
    }
    
    // Ambil data detail dari Supabase berdasarkan id
    try {
      const { data, error } = await supabase
        .from('message_triggers')
        .select('*, connections:connection_id(name, phone_number)')
        .eq('id', trigger.id)
        .eq('user_id', userId) // Add user_id filter
        .single();
        
      if (error) throw error;
      // Parse action JSON if needed
      let actionObj = data.action;
      if (typeof actionObj === 'string') {
        try { actionObj = JSON.parse(actionObj); } catch {}
      }
      // Robust keywords extraction
      let keywords: string[] = [];
      if (typeof data.keyword === 'string') {
        try {
          const parsed = JSON.parse(data.keyword);
          keywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
        } catch {
          keywords = [];
        }
      } else if (typeof data.keyword === 'object' && data.keyword !== null && 'keywords' in data.keyword) {
        keywords = Array.isArray((data.keyword as any).keywords) ? (data.keyword as any).keywords : [];
      } else {
        keywords = [];
      }
      setForm({
        name: data.trigger_name,
        enabled: data.status === 'active',
        sender: (data.connections?.name || data.connection_id || '-') + (data.connections?.phone_number ? ` (${data.connections.phone_number})` : ''),
        source: data.trigger_source || '',
        keywords,
        actionType: (actionObj as any)?.type || '',
        webhookUrl: (actionObj as any)?.url,
        webhookMethod: (actionObj as any)?.method,
        webhookHeaders: (actionObj as any)?.headers,
      });
      setBodyFields((actionObj as any)?.body && typeof (actionObj as any)?.body === 'object' && !Array.isArray((actionObj as any)?.body)
        ? Object.entries((actionObj as any)?.body).map(([key, value]) => ({ key, value: String(value) }))
        : []);
    } catch (err: any) {
      toast({ description: 'Failed to load trigger: ' + (err?.message || err) });
      setShowDialog(false);
    }
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingTrigger(null);
  };

  const handleFormChange = (field: keyof Trigger, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !form.keywords?.includes(keywordInput.trim())) {
      setForm((prev) => ({ ...prev, keywords: [...(prev.keywords || []), keywordInput.trim()] }));
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (kw: string) => {
    setForm((prev) => ({ ...prev, keywords: (prev.keywords || []).filter(k => k !== kw) }));
  };

  const handleAddHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setForm((prev) => ({
        ...prev,
        webhookHeaders: [...(prev.webhookHeaders || []), { key: headerKey.trim(), value: headerValue.trim() }]
      }));
      setHeaderKey("");
      setHeaderValue("");
    }
  };

  const handleRemoveHeader = (key: string) => {
    setForm((prev) => ({
      ...prev,
      webhookHeaders: (prev.webhookHeaders || []).filter(h => h.key !== key)
    }));
  };

  const handleBodyFieldChange = (idx: number, field: 'key' | 'value', value: string) => {
    setBodyFields(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const handleAddBodyField = () => setBodyFields(prev => [...prev, { key: '', value: '' }]);

  const handleRemoveBodyField = (idx: number) => setBodyFields(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!form.name || !form.sender || !form.source) {
      toast({ description: "Please fill all required fields" });
      return;
    }
    
    // Get user ID from localStorage
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast({ description: "User ID not found. Please log in again." });
      return;
    }
    
    if (editingTrigger) {
      // Update ke Supabase
      try {
        const { error } = await supabase.from('message_triggers').update({
          trigger_name: form.name,
          connection_id: form.sender,
          status: form.enabled ? 'active' : 'inactive',
          trigger: {
            type: 'contains',
            keywords: form.keywords || [],
            source: form.source,
          },
          action: {
            type: form.actionType,
            url: form.webhookUrl,
            method: form.webhookMethod,
            headers: form.webhookHeaders,
            body: bodyFields.length === 0 ? null : Object.fromEntries(bodyFields.filter(b => b.key.trim()).map(b => [b.key, b.value])),
          },
        }).eq('id', editingTrigger.id).eq('user_id', userId); // Add user_id filter
        if (error) throw error;
        toast({ description: 'Trigger updated' });
        // Refresh data
        const { data, error: fetchError } = await supabase
          .from('message_triggers')
          .select('*')
          .eq('user_id', userId); // Filter by user_id
        if (!fetchError) {
          const mapped = (data || []).map((row: any) => {
            const deviceName = row.connections?.name || row.connection_id || '-';
            const devicePhone = row.connections?.phone_number ? ` (${row.connections.phone_number})` : '';
            let keywords: string[] = [];
            if (typeof row.keyword === 'string') {
              try {
                const parsed = JSON.parse(row.keyword);
                keywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
              } catch {
                keywords = [];
              }
            } else if (typeof row.keyword === 'object' && row.keyword !== null && 'keywords' in row.keyword) {
              keywords = Array.isArray((row.keyword as any).keywords) ? (row.keyword as any).keywords : [];
            } else {
              keywords = [];
            }
            const triggerObj: Trigger = {
              id: row.id,
              name: row.trigger_name,
              enabled: row.status === 'active',
              sender: deviceName + devicePhone,
              source: row.trigger_source || '',
              keywords,
              actionType: row.action?.type || '',
              webhookUrl: row.action?.url,
              webhookMethod: row.action?.method,
              webhookHeaders: row.action?.headers,
              webhookBody: row.action?.body,
              connectionId: row.connection_id,
              apiKey: row.connections?.api_key,
            };
            return triggerObj;
          });
          setTriggers(mapped);
        }
        setShowDialog(false);
        setEditingTrigger(null);
      } catch (err: any) {
        toast({ description: 'Failed to update trigger: ' + (err?.message || err) });
      }
    } else {
      // Create new trigger with user_id
      try {
        const { data, error } = await supabase.from('message_triggers').insert({
          trigger_name: form.name,
          connection_id: form.sender,
          status: form.enabled ? 'active' : 'inactive',
          user_id: userId, // Add user_id
          keyword: {
            keywords: form.keywords || [],
          },
          trigger_source: form.source,
          action: {
            type: form.actionType,
            url: form.webhookUrl,
            method: form.webhookMethod,
            headers: form.webhookHeaders,
            body: bodyFields.length === 0 ? null : Object.fromEntries(bodyFields.filter(b => b.key.trim()).map(b => [b.key, b.value])),
          },
        }).select();
        
        if (error) throw error;
        
        toast({ description: "Trigger created" });
        // Refresh triggers
        const { data: refreshedData, error: fetchError } = await supabase
          .from('message_triggers')
          .select('*, connections:connection_id(id, name, phone_number, api_key)')
          .eq('user_id', userId);
          
        if (!fetchError && refreshedData) {
          const mapped = refreshedData.map((row: any) => {
            // Same mapping logic as above
            const deviceName = row.connections?.name || row.connection_id || '-';
            const devicePhone = row.connections?.phone_number ? ` (${row.connections.phone_number})` : '';
            let keywords: string[] = [];
            if (typeof row.keyword === 'string') {
              try {
                const parsed = JSON.parse(row.keyword);
                keywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
              } catch {
                keywords = [];
              }
            } else if (typeof row.keyword === 'object' && row.keyword !== null && 'keywords' in row.keyword) {
              keywords = Array.isArray((row.keyword as any).keywords) ? (row.keyword as any).keywords : [];
            } else {
              keywords = [];
            }
            return {
              id: row.id,
              name: row.trigger_name,
              enabled: row.status === 'active',
              sender: deviceName + devicePhone,
              source: row.trigger_source || '',
              keywords,
              actionType: row.action?.type || '',
              webhookUrl: row.action?.url,
              webhookMethod: row.action?.method,
              webhookHeaders: row.action?.headers,
              webhookBody: row.action?.body,
              connectionId: row.connection_id,
              apiKey: row.connections?.api_key,
            };
          });
          setTriggers(mapped);
        }
        
        // Refresh trigger cache for the connection (non-blocking)
        if (form.sender && refreshedData && refreshedData.length > 0) {
          const createdTrigger = refreshedData.find(t => t.connection_id === form.sender);
          if (createdTrigger && createdTrigger.connections && createdTrigger.connections.api_key) {
            // Don't await this to prevent blocking the UI
            refreshTriggerCache(createdTrigger.connection_id, createdTrigger.connections.api_key)
              .catch(error => {
                console.warn('Failed to refresh trigger cache:', error);
              });
          }
        }
        
        setShowDialog(false);
      } catch (err: any) {
        toast({ description: 'Failed to create trigger: ' + (err?.message || err) });
      }
    }
  };

  const handleRequestDelete = (id: string) => {
    setDeleteDialog({ isOpen: true, triggerId: id });
  };

  const handleConfirmDelete = async () => {
    if (!deleteDialog.triggerId) return;
    
    // Get user ID from localStorage
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast({ description: "User ID not found. Please log in again." });
      return;
    }
    
    const triggerToDelete = triggers.find(t => t.id === deleteDialog.triggerId);
    try {
      const { error } = await supabase
        .from('message_triggers')
        .delete()
        .eq('id', deleteDialog.triggerId)
        .eq('user_id', userId); // Add user_id filter
        
      if (error) throw error;
      setTriggers(triggers.filter(t => t.id !== deleteDialog.triggerId));
      toast({ description: 'Trigger deleted' });
      if (triggerToDelete && triggerToDelete.connectionId && triggerToDelete.apiKey) {
        await refreshTriggerCache(triggerToDelete.connectionId, triggerToDelete.apiKey);
      }
    } catch (err: any) {
      toast({ description: 'Failed to delete trigger: ' + (err?.message || err) });
    } finally {
      setDeleteDialog({ isOpen: false, triggerId: null });
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    // Get user ID from localStorage
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast({ description: "User ID not found. Please log in again." });
      return;
    }
    
    try {
      const { error } = await supabase
        .from('message_triggers')
        .update({ status: currentStatus ? 'inactive' : 'active' })
        .eq('id', id)
        .eq('user_id', userId); // Add user_id filter
        
      if (error) throw error;
      toast({ description: 'Status updated' });

      // Refresh cache after toggling
      const trigger = triggers.find(t => t.id === id);
      if (trigger && trigger.connectionId && trigger.apiKey) {
        await refreshTriggerCache(trigger.connectionId, trigger.apiKey);
      }

      // Refresh data
      const { data, error: fetchError } = await supabase
        .from('message_triggers')
        .select('*, connections:connection_id(id, name, phone_number, api_key)')
        .eq('user_id', userId); // Filter by user_id
        
      if (!fetchError) {
        const mapped = (data || []).map((row: any) => {
          const deviceName = row.connections?.name || row.connection_id || '-';
          const devicePhone = row.connections?.phone_number ? ` (${row.connections.phone_number})` : '';
          let keywords: string[] = [];
          if (typeof row.keyword === 'string') {
            try {
              const parsed = JSON.parse(row.keyword);
              keywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
            } catch {
              keywords = [];
            }
          } else if (typeof row.keyword === 'object' && row.keyword !== null && 'keywords' in row.keyword) {
            keywords = Array.isArray((row.keyword as any).keywords) ? (row.keyword as any).keywords : [];
          } else {
            keywords = [];
          }
          const triggerObj: Trigger = {
            id: row.id,
            name: row.trigger_name,
            enabled: row.status === 'active',
            sender: deviceName + devicePhone,
            source: row.trigger_source || '',
            keywords,
            actionType: row.action?.type || '',
            webhookUrl: row.action?.url,
            webhookMethod: row.action?.method,
            webhookHeaders: row.action?.headers,
            webhookBody: row.action?.body,
            connectionId: row.connection_id,
            apiKey: row.connections?.api_key,
          };
          return triggerObj;
        });
        setTriggers(mapped);
      }
    } catch (err: any) {
      toast({ description: 'Failed to update status: ' + (err?.message || err) });
    }
  };

  // Add a refresh function
  const refreshTriggers = async () => {
    setLoading(true);
    try {
      // Get user ID from localStorage
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast({ description: "User ID not found. Please log in again." });
        return;
      }

      // Join message_triggers with connections to get device name and filter by user_id
      const { data, error } = await supabase
        .from('message_triggers')
        .select('*, connections:connection_id(id, name, phone_number, api_key)')
        .eq('user_id', userId); // Filter by user_id
        
      if (error) throw error;
      // Map Supabase data to Trigger type
      const mapped = (data || []).map((row: any) => {
        const deviceName = row.connections?.name || row.connection_id || '-';
        const devicePhone = row.connections?.phone_number ? ` (${row.connections.phone_number})` : '';
        let keywords: string[] = [];
        if (typeof row.keyword === 'string') {
          try {
            const parsed = JSON.parse(row.keyword);
            keywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
          } catch {
            keywords = [];
          }
        } else if (typeof row.keyword === 'object' && row.keyword !== null && 'keywords' in row.keyword) {
          keywords = Array.isArray((row.keyword as any).keywords) ? (row.keyword as any).keywords : [];
        } else {
          keywords = [];
        }
        const triggerObj: Trigger = {
          id: row.id,
          name: row.trigger_name,
          enabled: row.status === 'active',
          sender: deviceName + devicePhone,
          source: row.trigger_source || '',
          keywords,
          actionType: row.action?.type || '',
          webhookUrl: row.action?.url,
          webhookMethod: row.action?.method,
          webhookHeaders: row.action?.headers,
          webhookBody: row.action?.body,
          connectionId: row.connection_id,
          apiKey: row.connections?.api_key,
        };
        return triggerObj;
      });
      setTriggers(mapped);
      toast({ description: "Triggers refreshed" });
    } catch (err: any) {
      toast({ description: "Failed to refresh triggers: " + (err?.message || err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" /> Triggers
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshTriggers} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button onClick={() => navigate("/dashboard/triggers/add")}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Trigger
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trigger List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
              <p>Loading triggers...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Messages From</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead>*</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {triggers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <p>No triggers found for your account</p>
                        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/triggers/add")}>
                          <PlusCircle className="mr-2 h-4 w-4" /> Create your first trigger
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  triggers.map(trigger => (
                    <TableRow key={trigger.id}>
                      <TableCell className="font-medium">{trigger.name}</TableCell>
                      <TableCell>{trigger.sender}</TableCell>
                      <TableCell>{getTriggerSourceLabel(trigger.source)}</TableCell>
                      <TableCell>{trigger.actionType}</TableCell>
                      <TableCell>
                        {trigger.keywords.length === 0 ? (
                          <Badge className="mr-1 mb-1 inline-block bg-blue-500 text-white">All</Badge>
                        ) : (
                          trigger.keywords.map(kw => (
                          <Badge key={kw} className="mr-1 mb-1 inline-block">{kw}</Badge>
                          ))
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch checked={trigger.enabled} onCheckedChange={() => handleToggle(trigger.id, trigger.enabled)} />
                        <Button size="icon" variant="ghost" onClick={() => navigate(`/dashboard/triggers/edit/${trigger.id}`)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleRequestDelete(trigger.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTrigger ? "Edit Trigger" : "Add Trigger"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Trigger Name *</Label>
                <Input value={form.name} onChange={e => handleFormChange("name", e.target.value)} placeholder="Enter trigger name" required />
              </div>
              <div>
                <Label>Number Affected *</Label>
                <Input value={form.sender} onChange={e => handleFormChange("sender", e.target.value)} placeholder="Select Sender" required />
              </div>
              <div>
                <Label>Chat Source *</Label>
                <Select value={form.source} onValueChange={v => handleFormChange("source", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Messages from Customers">Messages from Customers</SelectItem>
                    <SelectItem value="Messages from Groups">Messages from Groups</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Keyword(s)</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={keywordInput}
                    onChange={e => setKeywordInput(e.target.value)}
                    placeholder="Enter keyword"
                    onKeyDown={e => e.key === 'Enter' ? (e.preventDefault(), handleAddKeyword()) : undefined}
                  />
                  <Button type="button" onClick={handleAddKeyword} variant="outline">+</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.keywords?.map(kw => (
                    <Badge key={kw} className="flex items-center gap-1">
                      {kw}
                      <button type="button" onClick={() => handleRemoveKeyword(kw)} className="ml-1 text-xs">×</button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Action</Label>
                <Select value={form.actionType} onValueChange={v => handleFormChange("actionType", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Call Webhook</SelectItem>
                    {/* Bisa dikembangkan untuk aksi lain */}
                  </SelectContent>
                </Select>
              </div>
              {form.actionType === "webhook" && (
                <div className="space-y-2 border rounded-md p-3">
                  <Label>Webhook URL</Label>
                  <Input value={form.webhookUrl} onChange={e => handleFormChange("webhookUrl", e.target.value)} placeholder="https://example.com/receiver" />
                  <div className="flex gap-2">
                    <Select value={form.webhookMethod} onValueChange={v => handleFormChange("webhookMethod", v)}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={form.webhookUrl} onChange={e => handleFormChange("webhookUrl", e.target.value)} placeholder="Webhook URL" />
                  </div>
                  <Label>Headers</Label>
                  <div className="flex gap-2 mb-2">
                    <Input value={headerKey} onChange={e => setHeaderKey(e.target.value)} placeholder="Key" className="w-1/3" />
                    <Input value={headerValue} onChange={e => setHeaderValue(e.target.value)} placeholder="Value" className="w-1/2" />
                    <Button type="button" onClick={handleAddHeader} variant="outline">+</Button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {form.webhookHeaders?.map(h => (
                      <div key={h.key} className="flex items-center gap-2 text-xs">
                        <span className="font-mono bg-muted px-2 py-1 rounded">{h.key}</span>
                        <span className="font-mono bg-muted px-2 py-1 rounded">{h.value}</span>
                        <button type="button" onClick={() => handleRemoveHeader(h.key)} className="text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                  <Label>Body</Label>
                  <div className="flex flex-col gap-2">
                    {bodyFields.map((b, idx) => (
                      <div className="flex gap-2" key={idx}>
                        <Input value={b.key} onChange={e => handleBodyFieldChange(idx, 'key', e.target.value)} placeholder="Key" className="w-1/3" />
                        <Input value={b.value} onChange={e => handleBodyFieldChange(idx, 'value', e.target.value)} placeholder="Value" className="w-1/2" />
                        <Button type="button" onClick={() => handleRemoveBodyField(idx)} variant="destructive" size="icon">×</Button>
                      </div>
                    ))}
                    <Button type="button" onClick={handleAddBodyField} variant="outline" size="sm" className="w-fit mt-1">+ Add Body Field</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeDialog} type="button">
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.isOpen} onOpenChange={isOpen => setDeleteDialog(prev => ({ ...prev, isOpen }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Trigger</DialogTitle>
            <div>Are you sure you want to delete this trigger? This action cannot be undone.</div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ isOpen: false, triggerId: null })}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TriggersPage; 