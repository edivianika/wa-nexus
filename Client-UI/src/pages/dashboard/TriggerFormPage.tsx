import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from '@/components/ui/use-toast';
import { Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { refreshTriggerCache } from "@/lib/api";

interface TriggerFormPageProps {
  mode: "add" | "edit";
}

interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  device: string;
  source: string;
  keywords: string[];
  actionType: string;
  webhookUrl?: string;
  webhookMethod?: string;
  webhookHeaders?: { key: string; value: string }[];
  webhookBody?: string;
}

interface DeviceOption {
  id: string;
  name: string;
  phone_number: string | null;
  api_key: string;
}

const defaultForm: Partial<Trigger> = {
  name: "",
  enabled: true,
  device: "",
  source: "Messages from Customers",
  keywords: [],
  actionType: "webhook",
  webhookUrl: "",
  webhookMethod: "POST",
  webhookBody: ""
};

// Daftar variabel yang bisa di-drag
const variableBadges = [
  { label: 'Sender Name', value: '{{sender_name}}' },
  { label: 'Sender Number', value: '{{sender_number}}' },
  { label: 'Message Text', value: '{{message_text}}' },
  { label: 'Device Name', value: '{{device_name}}' },
  { label: 'Api Key', value: '{{api_key}}' },
];

const TriggerFormPage = ({ mode }: TriggerFormPageProps) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<Partial<Trigger>>(defaultForm);
  const [keywords, setKeywords] = useState<string[]>(form.keywords || [""]);
  const [headers, setHeaders] = useState<{ [key: string]: string }[]>([]);
  const [deviceInput, setDeviceInput] = useState("");
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactLabels, setContactLabels] = useState<string[]>([""]);
  const [triggerDeviceId, setTriggerDeviceId] = useState<string | undefined>(undefined);
  const [bodyFields, setBodyFields] = useState<{ key: string; value: string }[]>(form.webhookBody && Array.isArray(form.webhookBody) ? form.webhookBody : []);

  useEffect(() => {
    const fetchAll = async () => {
      setLoadingDevices(true);
      try {
        // Get user ID from localStorage
        const userId = localStorage.getItem('user_id');
        if (!userId) {
          toast({ description: "User ID not found. Please log in again." });
          navigate("/dashboard/triggers");
          return;
        }

        if (mode === "edit" && id) {
          // Fetch trigger with user_id filter for security
          const { data: triggerData, error: triggerError } = await supabase
            .from('message_triggers')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId) // Add user_id filter for security
            .single();
            
          if (triggerError) throw triggerError;
          
          // Fetch devices
          const { data: deviceList, error: deviceError } = await supabase
            .from('connections')
            .select('id, name, phone_number, api_key')
            .eq('user_id', userId);
            
          if (deviceError) throw deviceError;
          // Parse trigger
          let keywordObj = triggerData.keyword;
          let actionObj = triggerData.action;
          if (typeof keywordObj === 'string') {
            try { keywordObj = JSON.parse(keywordObj); } catch {}
          }
          if (typeof actionObj === 'string') {
            try { actionObj = JSON.parse(actionObj); } catch {}
          }
          let loadedKeywords: string[] = [];
          if (keywordObj && typeof keywordObj === 'object' && Array.isArray((keywordObj as any).keywords)) {
            loadedKeywords = (keywordObj as any).keywords;
          }
          let loadedHeaders: { [key: string]: string }[] = [];
          if (actionObj && typeof actionObj === 'object' && Array.isArray((actionObj as any).headers)) {
            loadedHeaders = (actionObj as any).headers.map((h: any) => {
              if (h && typeof h === 'object' && h.key && h.value !== undefined) {
                return { [h.key]: String(h.value) };
              }
              return h;
            });
          }
          // Sinkronisasi device
          let finalDevices = deviceList || [];
          if (triggerData.connection_id && !finalDevices.find(d => d.id === triggerData.connection_id)) {
            finalDevices = [
              ...finalDevices,
              { id: triggerData.connection_id, name: `Unknown Device (${triggerData.connection_id})`, phone_number: null, api_key: "" }
            ];
          }
          setDevices(finalDevices);
          setTriggerDeviceId(triggerData.connection_id);
          setForm({
            id: triggerData.id,
            name: triggerData.trigger_name,
            enabled: triggerData.status === 'active',
            device: String(triggerData.connection_id),
            source: triggerData.trigger_source || (keywordObj as any)?.source || '',
            keywords: loadedKeywords,
            actionType: (actionObj as any)?.type || '',
            webhookUrl: (actionObj as any)?.url,
            webhookMethod: (actionObj as any)?.method,
            webhookBody: (actionObj as any)?.body,
          });
          setKeywords(loadedKeywords);
          setHeaders(loadedHeaders);
          if ((actionObj as any)?.type === "save_contact") {
            setContactName((actionObj as any)?.contact_name || "");
            const loadedLabels = Array.isArray((actionObj as any)?.label)
              ? (actionObj as any).label
              : (typeof (actionObj as any)?.label === "string" && (actionObj as any).label ? [(actionObj as any).label] : [""]);
            setContactLabels(loadedLabels);
          }
          setBodyFields((actionObj as any)?.body && typeof (actionObj as any)?.body === 'object' && !Array.isArray((actionObj as any)?.body)
            ? Object.entries((actionObj as any)?.body).map(([key, value]) => ({ key, value: String(value) }))
            : []);
        } else if (mode === "add") {
          // Mode add: fetch devices saja
          const { data, error } = await supabase
            .from('connections')
            .select('id, name, phone_number, api_key')
            .eq('user_id', userId); // Use userId from localStorage
            
          if (error) throw error;
          setDevices(data || []);
        }
      } catch (err: any) {
        toast({ description: "Failed to load trigger/devices: " + (err?.message || err) });
        navigate("/dashboard/triggers");
      } finally {
        setLoadingDevices(false);
      }
    };
    fetchAll();
    // eslint-disable-next-line
  }, [mode, id, navigate]);

  // Tambahkan useEffect untuk auto-select device setelah devices siap
  useEffect(() => {
    if (
      mode === "edit" &&
      devices.length > 0 &&
      triggerDeviceId &&
      (!form.device || !devices.some(d => String(d.id) === String(form.device)))
    ) {
      setForm(prev => ({ ...prev, device: String(triggerDeviceId) }));
    }
  }, [mode, devices, triggerDeviceId, form.device]);

  const handleFormChange = (field: keyof Trigger, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Update keywords array on change
  const handleKeywordChange = (idx: number, value: string) => {
    setKeywords(prev => prev.map((kw, i) => i === idx ? value : kw));
  };
  const handleAddKeywordField = () => setKeywords(prev => [...prev, ""]);
  const handleRemoveKeywordField = (idx: number) => setKeywords(prev => prev.filter((_, i) => i !== idx));

  // Update headers array on change
  const handleHeaderFieldChange = (idx: number, field: string, value: string) => {
    setHeaders(prev => prev.map((h, i) => i === idx ? { [field]: value } : h));
  };
  const handleAddHeaderField = () => setHeaders(prev => [...prev, { '': '' }]);
  const handleRemoveHeaderField = (idx: number) => setHeaders(prev => prev.filter((_, i) => i !== idx));

  // Handler untuk label
  const handleLabelChange = (idx: number, value: string) => {
    setContactLabels(prev => prev.map((l, i) => i === idx ? value : l));
  };
  const handleAddLabelField = () => setContactLabels(prev => [...prev, ""]);
  const handleRemoveLabelField = (idx: number) => setContactLabels(prev => prev.filter((_, i) => i !== idx));

  // Tambahkan handler untuk bodyFields
  const handleBodyFieldChange = (idx: number, field: 'key' | 'value', value: string) => {
    setBodyFields(prev => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };
  const handleAddBodyField = () => setBodyFields(prev => [...prev, { key: '', value: '' }]);
  const handleRemoveBodyField = (idx: number) => setBodyFields(prev => prev.filter((_, i) => i !== idx));

  // Fungsi untuk handle drop ke input
  const handleBadgeDrop = (e: React.DragEvent<HTMLInputElement>, idx: number, field: 'key' | 'value', type: 'header' | 'body') => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (type === 'header') {
      setHeaders(prev => prev.map((h, i) => {
        if (i !== idx) return h;
        const key = Object.keys(h)[0] || '';
        if (field === 'key') return { [text]: h[key] };
        if (field === 'value') return { [key]: (h[key] || '') + text };
        return h;
      }));
    } else {
      setBodyFields(prev => prev.map((b, i) => i === idx ? { ...b, [field]: (b[field] || '') + text } : b));
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.device || !form.source) {
      toast({ description: "Please fill all required fields" });
      return;
    }

    // Get user ID from localStorage
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast({ description: "User ID not found. Please log in again." });
      return;
    }

    // Jika semua keyword kosong, simpan null
    const filteredKeywords = keywords.filter(kw => kw.trim());
    const keywordPayload = filteredKeywords.length === 0 ? null : {
      type: "contains",
      keywords: filteredKeywords,
      source: form.source,
    };
    // Jika semua header kosong, simpan null
    const filteredHeaders = headers.filter(h => Object.keys(h)[0]?.trim());
    let actionPayload: any = {};
    if (form.actionType === "webhook") {
      actionPayload = {
        type: "webhook",
        url: form.webhookUrl,
        method: form.webhookMethod,
        headers: filteredHeaders.length === 0 ? null : filteredHeaders.filter(h => Object.keys(h)[0]?.trim()),
        body: bodyFields.length === 0 ? null : Object.fromEntries(bodyFields.filter(b => b.key.trim()).map(b => [b.key, b.value])),
      };
    } else if (form.actionType === "save_contact") {
      actionPayload = {
        type: "save_contact",
        contact_name: contactName,
        label: contactLabels.filter(l => l.trim()),
      };
    } else {
      actionPayload = { type: form.actionType };
    }

    try {
      let error;
      if (mode === "edit" && id) {
        const { error: updateError } = await supabase
          .from('message_triggers')
          .update({
            trigger_name: form.name,
            connection_id: form.device,
            status: form.enabled ? 'active' : 'inactive',
            keyword: keywordPayload,
            action: actionPayload,
            trigger_source: form.source,
          })
          .eq('id', id)
          .eq('user_id', userId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('message_triggers')
          .insert([{
            trigger_name: form.name,
            connection_id: form.device,
            status: form.enabled ? 'active' : 'inactive',
            keyword: keywordPayload,
            action: actionPayload,
            trigger_source: form.source,
            user_id: userId,
          }]);
        error = insertError;
      }
      if (error) throw error;

      // Refresh the cache after saving
      if (form.device) {
        const device = devices.find(d => d.id === form.device);
        if (device && device.api_key) {
          await refreshTriggerCache(device.id, device.api_key);
        } else {
          console.warn('Could not find API key for the device to refresh cache.');
        }
      }

      toast({ description: mode === "add" ? "Trigger created" : "Trigger updated" });
      navigate("/dashboard/triggers");
    } catch (err: any) {
      toast({ description: "Failed to save trigger: " + (err?.message || err) });
    }
  };

  return (
    <div className="py-8 px-0 md:px-8">
      <h1 className="text-2xl font-bold mb-8">{mode === "add" ? "Add Trigger" : "Edit Trigger"}</h1>
      <form className="space-y-8" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div>
              <Label>Trigger Name *</Label>
              <Input value={form.name} onChange={e => handleFormChange("name", e.target.value)} placeholder="Enter trigger name" required />
            </div>
            <div>
              <Label>Device *</Label>
              <Select value={form.device || ""} onValueChange={v => handleFormChange("device", v)} disabled={loadingDevices}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingDevices ? "Loading..." : "Select Device"} />
                </SelectTrigger>
                <SelectContent>
                  {devices.map(device => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name} {device.phone_number ? `(${device.phone_number})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trigger Source *</Label>
              <Select value={form.source} onValueChange={v => handleFormChange("source", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Trigger Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Messages from Customers</SelectItem>
                  <SelectItem value="2">Messages from Me</SelectItem>
                  <SelectItem value="3">Message From Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Keyword(s)</Label>
              <div className="flex flex-col gap-2">
                {keywords.map((kw, idx) => (
                  <div className="flex gap-2" key={idx}>
                    <Input
                      value={kw}
                      onChange={e => handleKeywordChange(idx, e.target.value)}
                      placeholder="Enter keyword"
                    />
                    <Button type="button" onClick={() => handleRemoveKeywordField(idx)} variant="destructive" size="icon">×</Button>
                  </div>
                ))}
                <Button type="button" onClick={handleAddKeywordField} variant="outline" size="sm" className="w-fit mt-1">+ Add Keyword</Button>
                <span className="text-xs text-muted-foreground mt-1">Kosongkan semua keyword untuk trigger semua pesan.</span>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <Label>Action</Label>
              <Select value={form.actionType} onValueChange={v => {
                handleFormChange("actionType", v);
                if (v === "save_contact") {
                  if (mode === "add") {
                    setContactName("{{sender_name}}")
                  } else {
                    setContactName("");
                  }
                  setContactLabels([""]);
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webhook">Call Webhook</SelectItem>
                  <SelectItem value="save_contact">Save Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.actionType === "webhook" && (
              <div className="space-y-2">
                <Label>Webhook URL</Label>
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
                  <Input value={form.webhookUrl} onChange={e => handleFormChange("webhookUrl", e.target.value)} placeholder="https://example.com/receiver" />
                </div>
                <Label>Headers</Label>
                <div className="flex flex-col gap-2">
                  {headers.map((h, idx) => {
                    const key = Object.keys(h)[0] || '';
                    return (
                    <div className="flex gap-2" key={idx}>
                        <Input value={key} onChange={e => handleHeaderFieldChange(idx, e.target.value, h[key])} placeholder="Key" className="w-1/3" onDrop={e => handleBadgeDrop(e, idx, 'key', 'header')} onDragOver={e => e.preventDefault()} />
                        <Input value={h[key]} onChange={e => handleHeaderFieldChange(idx, key, e.target.value)} placeholder="Value" className="w-1/2" onDrop={e => handleBadgeDrop(e, idx, 'value', 'header')} onDragOver={e => e.preventDefault()} />
                      <Button type="button" onClick={() => handleRemoveHeaderField(idx)} variant="destructive" size="icon">×</Button>
                    </div>
                    );
                  })}
                  <Button type="button" onClick={handleAddHeaderField} variant="outline" size="sm" className="w-fit mt-1">+ Add Header</Button>
                </div>
                <Label>Body</Label>
                <div className="flex flex-col gap-2">
                  {bodyFields.map((b, idx) => (
                    <div className="flex gap-2" key={idx}>
                      <Input value={b.key} onChange={e => handleBodyFieldChange(idx, 'key', e.target.value)} placeholder="Key" className="w-1/3" onDrop={e => handleBadgeDrop(e, idx, 'key', 'body')} onDragOver={e => e.preventDefault()} />
                      <Input value={b.value} onChange={e => handleBodyFieldChange(idx, 'value', e.target.value)} placeholder="Value" className="w-1/2" onDrop={e => handleBadgeDrop(e, idx, 'value', 'body')} onDragOver={e => e.preventDefault()} />
                      <Button type="button" onClick={() => handleRemoveBodyField(idx)} variant="destructive" size="icon">×</Button>
                    </div>
                  ))}
                  <Button type="button" onClick={handleAddBodyField} variant="outline" size="sm" className="w-fit mt-1">+ Add Body Field</Button>
                </div>
              </div>
            )}
            {form.actionType === "save_contact" && (
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Contact Name" />
                <Label>Label(s)</Label>
                <div className="flex flex-col gap-2">
                  {contactLabels.map((l, idx) => (
                    <div className="flex gap-2" key={idx}>
                      <Input
                        value={l}
                        onChange={e => handleLabelChange(idx, e.target.value)}
                        placeholder="Enter label"
                      />
                      <Button type="button" onClick={() => handleRemoveLabelField(idx)} variant="destructive" size="icon">×</Button>
                    </div>
                  ))}
                  <Button type="button" onClick={handleAddLabelField} variant="outline" size="sm" className="w-fit mt-1">+ Add Label</Button>
                  <span className="text-xs text-muted-foreground mt-1">Kosongkan semua label jika tidak ingin menambah label kontak.</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-8">
          <Button variant="outline" type="button" onClick={() => navigate("/dashboard/triggers")}> <X className="mr-2 h-4 w-4" /> Cancel </Button>
          <Button type="submit"> <Save className="mr-2 h-4 w-4" /> Save </Button>
        </div>
      </form>
      <Label>Insert Variable</Label>
      <div className="flex flex-wrap gap-2 mb-2">
        {variableBadges.map(v => (
          <span
            key={v.value}
            draggable
            onDragStart={e => e.dataTransfer.setData('text/plain', v.value)}
            className="inline-block cursor-grab select-none bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold border border-blue-300"
          >
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default TriggerFormPage; 