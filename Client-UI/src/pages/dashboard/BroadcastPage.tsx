import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SendIcon, FileIcon, User2Icon, Bold, Italic, Info, Image, Video, Music, FileText, X, Settings2, Trash2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import ContactSelectorDialog from "@/components/ContactSelectorDialog";
import Papa from "papaparse";
import { FileUpload } from "@/components/ui/file-upload";
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDropzone } from 'react-dropzone';
import { AssetPicker } from "@/components/asset/AssetPicker";
import { Asset } from "@/services/assetService";
import assetService from "@/services/assetService";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { SimpleExpiredBanner } from "@/components/subscription/SimpleExpiredBanner";

// Baca URL API dari environment variable
const BROADCAST_API_URL = import.meta.env.VITE_BROADCAST_API_URL || 'http://localhost:3004';
const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';

interface Connection {
  id: string;
  name: string;
  api_key: string;
  phone_number: string | null;
  connected: boolean;
}

interface Contact {
  id: string;
  contact_name: string | null;
  phone_number: string;
  labels?: string[];
}

// Normalisasi nomor telepon: hanya angka, hilangkan +, spasi, tanda baca, dsb.
function normalizePhoneNumber(phone: string): string {
  // Hilangkan semua karakter kecuali angka
  let normalized = phone.replace(/[^0-9]/g, "");
  // Jika diawali 0, ganti dengan 62
  if (normalized.startsWith("0")) {
    normalized = "62" + normalized.slice(1);
  }
  // Jika sudah diawali 62, biarkan
  // Jika tidak diawali 62, tambahkan 62 di depan
  else if (!normalized.startsWith("62")) {
    normalized = "62" + normalized;
  }
  return normalized;
}

// Tambahkan fungsi untuk parse WhatsApp style
function parseWhatsappFormat(text: string): string {
  if (!text) return '';
  // Bold: *text*
  let parsed = text.replace(/\*(.*?)\*/g, '<b>$1</b>');
  // Italic: _text_
  parsed = parsed.replace(/_(.*?)_/g, '<i>$1</i>');
  // Line breaks: \n or \r\n
  parsed = parsed.replace(/\r?\n/g, '<br>');
  return parsed;
}

type ScheduledDateType = Date | null;

const BroadcastPage = () => {
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [message, setMessage] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [priority, setPriority] = useState("normal");
  const [sendSpeed, setSendSpeed] = useState("normal");
  const [maxRetry, setMaxRetry] = useState(2);
  const [scheduledDate, setScheduledDate] = useState<ScheduledDateType>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [contactCount, setContactCount] = useState(0);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [manualContacts, setManualContacts] = useState<Contact[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewContacts, setCsvPreviewContacts] = useState<any[]>([]);
  const [csvStats, setCsvStats] = useState({ total: 0, unique: 0, duplicate: 0 });
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUploadResults, setMediaUploadResults] = useState<any[]>([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<string[]>([]);
  const [mediaTypes, setMediaTypes] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [csvError, setCsvError] = useState<string>("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [broadcastName, setBroadcastName] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => handleMediaUpload(acceptedFiles),
    accept: {
      'image/*': ['.jpeg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.mov'],
      'audio/*': ['.mp3', '.wav'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 65 * 1024 * 1024, // 65MB
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;

        const { data: connectionsData, error: connectionsError } = await supabase
          .from('connections')
          .select('id, name, api_key, phone_number, connected')
          .eq('user_id', userData.user.id);

        if (connectionsError) throw connectionsError;
        setConnections(connectionsData || []);

        if (connectionsData && connectionsData.length > 0) {
          setSelectedConnectionId(connectionsData[0].id);
          setApiKey(connectionsData[0].api_key);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        toast.error("Failed to load user data");
      }
    };

    fetchUserData();
  }, []);

  // Check subscription status
  const { isExpired } = useSubscriptionStatus();

  // New useEffect to load selected contacts from contacts page
  useEffect(() => {
    const loadSelectedContacts = async () => {
      try {
        // Get selected contact IDs from sessionStorage
        const selectedContactIds = sessionStorage.getItem('selectedContactIds');
        
        if (!selectedContactIds) return;
        
        const contactIds = JSON.parse(selectedContactIds) as string[];
        if (!contactIds.length) return;
        
        // Fetch contact details from Supabase
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;
        
        // Use 'as any' temporarily to bypass type checking for database fields
        const { data, error } = await (supabase as any)
          .from('contacts')
          .select('id, contact_name, phone_number, labels')
          .eq('owner_id', userData.user.id)
          .in('id', contactIds);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setManualContacts(data);
          setContactCount(data.length);
          toast.success(`${data.length} contacts loaded from selection`);
          
          // Clear the sessionStorage to avoid reloading these contacts on page refresh
          sessionStorage.removeItem('selectedContactIds');
        }
      } catch (error) {
        console.error("Error loading selected contacts:", error);
        toast.error("Failed to load selected contacts");
      }
    };
    
    loadSelectedContacts();
  }, []);

  const handleConnectionChange = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    const selectedConnection = connections.find(conn => conn.id === connectionId);
    if (selectedConnection) {
      setApiKey(selectedConnection.api_key);
    }
  };

  const processCsv = async (file: File) => {
    setCsvError("");
    if (file.size > 1024 * 1024) {
      setCsvError("File size exceeds 1 MB");
      resetContactSelection();
      return;
    }
    if (file.type === "text/csv" || file.name.endsWith(".csv")) {
      const fileContent = await file.text();
      const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
      if (parsed.errors.length > 0) {
        setCsvError("Some CSV rows are inconsistent, only valid rows will be shown");
      }
      const allKeys = new Set<string>();
      (parsed.data as any[]).forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
      
      let allValidRows = (parsed.data as any[]).filter(row => {
        const phone = row.phone_number || row.phone || row["Phone Number"] || row["Nomor"];
        return phone && phone.toString().trim() !== '';
      });

      const seen = new Set<string>();
      const validRows = allValidRows.filter(row => {
        const phone = (row.phone_number || row.phone || row["Phone Number"] || row["Nomor"] || '').toString().trim();
        if (seen.has(phone)) return false;
        seen.add(phone);
        return true;
      });

      setCsvHeaders(Array.from(allKeys));
      setCsvPreviewContacts(validRows.slice(0, 10));
      setContactCount(validRows.length);
      setCsvFile(file);
      setManualContacts([]); // Reset manual contacts
      const phoneNumbers = allValidRows.map((row: any) => row.phone_number || row.phone || row["Phone Number"] || row["Nomor"]);
      const uniquePhones = new Set(phoneNumbers);
      setCsvStats({
        total: allValidRows.length,
        unique: uniquePhones.size,
        duplicate: allValidRows.length - uniquePhones.size,
      });
    } else {
      setCsvError("File format must be .csv");
      resetContactSelection();
    }
  };
  
  const processManualInput = () => {
      function detectDelimiter(line: string) {
        if (line.includes('\t')) return '\t';
        if (line.includes('~')) return '~';
        if (line.includes('-')) return '-';
        return ','; // fallback
      }
      function mapHeader(header: string) {
        const h = header.trim().toLowerCase();
        if (["phone_number", "phone", "nomor", "no hp", "no", "number"].includes(h)) return "phone_number";
        if (["contact_name", "name", "nama"].includes(h)) return "contact_name";
        if (["labels", "label", "tags", "tag"].includes(h)) return "labels";
        return header.trim();
      }
      const lines = manualInput.trim().split('\n').filter(Boolean);
      if (lines.length < 2) {
        toast.error("Minimal 2 baris: header dan data");
        return;
      }
      const delimiter = detectDelimiter(lines[0]);
      const rawHeaders = lines[0].split(delimiter).map(h => h.trim());
      const headers = rawHeaders.map(mapHeader);
      const contacts = lines.slice(1).map(line => {
        const values = line.split(delimiter).map(v => v.trim());
        const obj: any = {};
        headers.forEach((h, i) => {
          if (h === "labels") {
            obj.labels = values[i] ? values[i].split(/[,;\s]+/).filter(Boolean) : [];
          } else {
            obj[h] = values[i] || "";
          }
        });
        if (obj.phone_number) obj.phone_number = normalizePhoneNumber(obj.phone_number);
        return obj;
      }).filter(c => c.phone_number && c.phone_number !== "");
      if (contacts.length === 0) {
        toast.error("Tidak ada kontak valid ditemukan (pastikan ada kolom nomor HP)");
        return;
      }
      const seen = new Set<string>(manualContacts.map(c => c.phone_number));
      const uniqueContacts = contacts.filter(c => {
        const phone = (c.phone_number || '').toString().trim();
        if (seen.has(phone)) return false;
        seen.add(phone);
        return true;
      });
      
      // Add new contacts to existing ones instead of replacing
      setManualContacts(prev => [...prev, ...uniqueContacts]);
      resetContactSelection(false); // keep manual contacts
      setContactCount(prev => prev + uniqueContacts.length);
      setManualInput(""); // Clear the input field after adding
      toast.success(`${uniqueContacts.length} kontak berhasil ditambahkan dari input manual`);
  }

  const resetContactSelection = (resetManual = true) => {
    setCsvFile(null);
    setCsvPreviewContacts([]);
    setCsvHeaders([]);
    setCsvStats({ total: 0, unique: 0, duplicate: 0 });
    if (resetManual) {
        setManualContacts([]);
    }
    setContactCount(resetManual ? 0 : manualContacts.length);
    setCsvError("");
  };

  const validateBroadcast = () => {
    if (!broadcastName.trim()) {
      toast.error("Broadcast name is required");
      return false;
    }
    if (!selectedConnectionId) {
      toast.error("Please select a device");
      return false;
    }
    if (contactCount === 0) {
      toast.error("Please add at least one contact");
      return false;
    }
    if (!message.trim() && mediaFiles.length === 0) {
        toast.error("Message is required if no media is attached");
        return false;
    }
    return true;
  };

  const handleOpenConfirmDialog = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateBroadcast()) {
        setShowConfirmDialog(true);
    }
  };
    
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setShowConfirmDialog(false);

    try {
      const allContacts: Contact[] = [];
      let finalContacts: any[] = [];

      if (csvFile) {
        const fileContent = await csvFile.text();
        const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
        finalContacts = (parsed.data as any[]).map(row => {
          const phone = row.phone_number || row.phone || row["Phone Number"] || row["Nomor"];
          return {
            ...row,
            phone_number: normalizePhoneNumber(phone)
          };
        }).filter(c => c.phone_number);
      } else {
        finalContacts = manualContacts.map(c => ({
          ...c,
          phone_number: normalizePhoneNumber(c.phone_number)
        }));
      }

      const uniqueContacts = Array.from(new Set(finalContacts.map(c => c.phone_number)))
        .map(phone => finalContacts.find(c => c.phone_number === phone));

      // =============================================================
      // Build payload – now supports three scenarios:
      // 1. Asset Library (asset_id)
      // 2. Uploaded media (single or multiple)
      // 3. Text-only broadcast
      // =============================================================

      const hasAssetMedia = selectedAssets.length > 0;
      const hasUploadedMedia = mediaUploadResults.length > 0;

      const payload: any = {
        apiKey,
        contacts: uniqueContacts,
        message,            // original text / caption
        caption: message,   // explicit caption field for media
        speed: sendSpeed,
        isPrivateMessage: true, 
        broadcast_name: broadcastName,
        connection_id: selectedConnectionId,  // snake_case per API spec
        type: hasAssetMedia || hasUploadedMedia ? 'media' : 'text',
      };

      // If user selected an asset from the library
      if (hasAssetMedia) {
        payload.asset_id = selectedAssets[0].id;
      }

      // If user uploaded media via drag-drop / uploader
      if (hasUploadedMedia) {
        if (mediaUploadResults.length === 1) {
          // legacy API accepts single mediaFullPath
          payload.mediaFullPath = mediaUploadResults[0].fullPath;
        } else {
          // Use new multi-media array
          payload.media = mediaUploadResults.map((res, idx) => ({
            fullPath: res.fullPath,
            filename: res.file,
            mimetype: mediaFiles[idx]?.type || undefined,
            caption: message || undefined,
          }));
        }
      }

      if (isScheduled && scheduledDate) {
        payload.schedule = scheduledDate.toISOString();
      }

      console.log('Sending broadcast payload:', payload);

      const response = await fetch(`${BROADCAST_API_URL}/broadcast`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast.success("Broadcast sent successfully!", {
        description: `Job ID: ${result.jobId}`,
      });
      navigate('/dashboard/broadcast/list');

    } catch (err: any) {
      console.error("Error sending broadcast:", err);
      toast.error("Failed to send broadcast", {
        description: err.message || "An unknown error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMediaUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsLoading(true);
    
    const newUploads = await Promise.all(files.map(async file => {
      try {
        const formData = new FormData();
        formData.append("media", file);
        const response = await fetch(`${API_SERVER_URL}/api/broadcast/upload-media`, { method: "POST", body: formData });
        const result = await response.json();

        if (result.success) {
          const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document';
          const previewUrl = type === 'image' ? URL.createObjectURL(file) : `${import.meta.env.VITE_FILE_API_URL}${result.url}`;
          return { file, result, type, previewUrl };
        } else {
          toast.error(`Failed to upload ${file.name}: ${result.message}`);
          return null;
        }
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
        return null;
      }
    }));

    const successfulUploads = newUploads.filter(u => u !== null);

    if (successfulUploads.length > 0) {
        setMediaFiles(prev => [...prev, ...successfulUploads.map(u => u!.file)]);
        setMediaUploadResults(prev => [...prev, ...successfulUploads.map(u => u!.result)]);
        setMediaTypes(prev => [...prev, ...successfulUploads.map(u => u!.type)]);
        setMediaPreviewUrls(prev => [...prev, ...successfulUploads.map(u => u!.previewUrl)]);
        toast.success(`${successfulUploads.length} media file(s) uploaded.`);
    }

    setIsLoading(false);
  };
  
  const removeMediaFile = async (index: number) => {
    const fileToRemove = mediaUploadResults[index];
    const url = mediaPreviewUrls[index];

    if (!fileToRemove || !fileToRemove.fullPath) {
        toast.error("Cannot delete file: path not found.");
        // Still remove from UI as a fallback
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
        setMediaUploadResults(prev => prev.filter((_, i) => i !== index));
        setMediaTypes(prev => prev.filter((_, i) => i !== index));
        setMediaPreviewUrls(prev => prev.filter((_, i) => i !== index));
        return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`${BROADCAST_API_URL.replace('3004', '3000')}/api/broadcast/delete-media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: fileToRemove.fullPath }),
      });

      const result = await response.json();

      if (!result.success) {
          throw new Error(result.message || "Failed to delete file from server.");
      }

      toast.success("File deleted from server.");

      // On successful deletion, remove from UI
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
      setMediaFiles(prev => prev.filter((_, i) => i !== index));
      setMediaUploadResults(prev => prev.filter((_, i) => i !== index));
      setMediaTypes(prev => prev.filter((_, i) => i !== index));
      setMediaPreviewUrls(prev => prev.filter((_, i) => i !== index));

    } catch (error) {
        console.error("Error deleting file:", error);
        toast.error(error instanceof Error ? error.message : "An unknown error occurred while deleting the file.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const applyFormat = (format: "bold" | "italic") => {
    const textArea = document.getElementById("message") as HTMLTextAreaElement;
    if (!textArea) return;
    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    const selectedText = message.substring(start, end);
    const wrap = format === 'bold' ? '*' : '_';
    const newText = `${message.substring(0, start)}${wrap}${selectedText || 'text'}${wrap}${message.substring(end)}`;
    setMessage(newText);
    setTimeout(() => {
        textArea.focus();
        textArea.setSelectionRange(start + 1, start + (selectedText || 'text').length + 1);
    }, 0);
  };

  const insertVariable = (field: string) => {
    const textArea = document.getElementById("message") as HTMLTextAreaElement;
    if (!textArea) return;
    const start = textArea.selectionStart;
    const placeholder = `{{${field}}}`;
    const newText = `${message.substring(0, start)}${placeholder}${message.substring(start)}`;
    setMessage(newText);
    setTimeout(() => {
        const newPos = start + placeholder.length;
        textArea.focus();
        textArea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const getMediaIcon = (fileType: string) => {
      if (fileType.startsWith('image/')) return <Image className="w-8 h-8 text-gray-500" />;
      if (fileType.startsWith('video/')) return <Video className="w-8 h-8 text-gray-500" />;
      if (fileType.startsWith('audio/')) return <Music className="w-8 h-8 text-gray-500" />;
      return <FileText className="w-8 h-8 text-gray-500" />;
  };

  const variableFields = [...csvHeaders, ...Object.keys(manualContacts[0] || {})];
  const uniqueVariableFields = [...new Set(variableFields)];

  const handleAssetSelected = (asset: Asset) => {
    // Add the selected asset to the list if not already added
    if (!selectedAssets.some(a => a.id === asset.id)) {
      setSelectedAssets([...selectedAssets, asset]);
    }
  };
  
  const removeAsset = (assetId: string) => {
    setSelectedAssets(selectedAssets.filter(asset => asset.id !== assetId));
  };

  return (
    <div className="space-y-6">
      {/* Expired Trial Banner */}
      <SimpleExpiredBanner />
      
      <form onSubmit={handleOpenConfirmDialog} className="space-y-6">
        <div className="flex justify-between items-start">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">Create Broadcast</h1>
            <p className="text-sm text-muted-foreground">
                Configure, compose, and send your message to multiple contacts at once.
            </p>
        </div>
        <Button 
          type="submit" 
          disabled={isLoading || isExpired}
          title={isExpired ? "Trial expired - Please upgrade to create broadcasts" : "Schedule/Send Broadcast"}
        >
          <SendIcon className="mr-2 h-4 w-4" />
          {isExpired ? "Trial Expired" : (isLoading ? "Scheduling..." : "Schedule/Send Broadcast")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="broadcastName">Broadcast Name *</Label>
                        <Input id="broadcastName" value={broadcastName} onChange={e => setBroadcastName(e.target.value)} placeholder="e.g., 'Promo Lebaran'" required/>
                    </div>
                    <div>
                      <Label htmlFor="connectionId">Device *</Label>
                      <Select value={selectedConnectionId} onValueChange={handleConnectionChange} required>
                        <SelectTrigger><SelectValue placeholder="Select a device" /></SelectTrigger>
                        <SelectContent>
                          {connections.map(c => (
                            <SelectItem key={c.id} value={c.id} disabled={!c.connected}>
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2 w-2 rounded-full", c.connected ? "bg-green-500" : "bg-red-500")} />
                                <span>{c.name} ({c.phone_number})</span>
                                {!c.connected && <span className="text-xs text-muted-foreground">(Disconnected)</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recipients</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="csv">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="csv">CSV</TabsTrigger>
                            <TabsTrigger value="manual">Manual</TabsTrigger>
                            <TabsTrigger value="contacts">From Contacts</TabsTrigger>
                        </TabsList>
                        <TabsContent value="csv" className="pt-4">
                            <FileUpload
                                onFileUpload={files => processCsv(files[0])}
                                acceptedFileTypes={[".csv"]}
                                maxFiles={1}
                                disabled={isLoading}
                                formatDisplayText=".csv files up to 1MB"
                            />
                            {csvError && <p className="text-xs text-red-500 mt-1">{csvError}</p>}
                        </TabsContent>
                        <TabsContent value="manual" className="pt-4 space-y-2">
                             <Textarea
                                id="extraManualInput"
                                className="min-h-[100px]"
                                placeholder={"Paste data here. e.g.:\nphone_number,name\n628123456789,John Doe"}
                                value={manualInput}
                                onChange={e => setManualInput(e.target.value)}
                                onFocus={() => {
                                  if (!manualInput.trim()) {
                                    setManualInput("phone_number,name\n");
                                  }
                                }}
                            />
                            <div className="flex flex-col gap-2">
                              <div className="text-xs text-muted-foreground mt-1">
                                <span className="font-medium">Format:</span> First row must be headers with at least <span className="font-semibold">phone_number</span> column. Additional columns like <span className="font-semibold">name</span> are optional.
                              </div>
                              <Button type="button" size="sm" onClick={processManualInput} disabled={!manualInput.trim()}>Add Contact</Button>
                            </div>
                        </TabsContent>
                        <TabsContent value="contacts" className="pt-4 text-center">
                            <Button type="button" variant="outline" onClick={() => setShowContactDialog(true)}>
                                <User2Icon className="mr-2 h-4 w-4"/>
                                Select Contacts
                            </Button>
                        </TabsContent>
                    </Tabs>
                    {(contactCount > 0 || manualContacts.length > 0) && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                             <div className="flex justify-between items-center">
                                <h4 className="font-medium">Contact Summary</h4>
                                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => resetContactSelection()}>
                                    <Trash2 className="h-3 w-3 mr-1"/> Reset
                                </Button>
                             </div>
                             {csvFile && <p>Total: <b>{csvStats.total}</b> | Unique: <b>{csvStats.unique}</b> | Duplicates: <b>{csvStats.duplicate}</b></p>}
                             {manualContacts.length > 0 && <p>Total unique contacts: <b>{manualContacts.length}</b></p>}
                             <p className="text-xs text-muted-foreground">Showing all selected contacts.</p>
                             <div className="overflow-y-auto max-h-[250px] border rounded bg-background custom-scrollbar">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-background z-10">
                                    <tr className="text-left">
                                      {csvHeaders.length > 0 ? 
                                        <>
                                          {csvHeaders.map(h => <th key={h} className="p-2 font-semibold">{h}</th>)}
                                          <th className="p-2 font-semibold w-8"></th>
                                        </> 
                                        : 
                                        <>
                                          <th className="p-2 font-semibold">contact_name</th>
                                          <th className="p-2 font-semibold">phone_number</th>
                                          <th className="p-2 font-semibold w-8"></th>
                                        </>
                                      }
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(csvPreviewContacts.length > 0 ? csvPreviewContacts : manualContacts).map((contact, idx) => (
                                      <tr key={idx} className="border-t">
                                          {csvHeaders.length > 0 ? csvHeaders.map(h => 
                                            <td key={h} className="p-2 truncate max-w-[100px]">{contact[h] || "-"}</td>
                                          ) : (
                                            <>
                                                <td className="p-2">{contact.contact_name || "-"}</td>
                                                <td className="p-2">{contact.phone_number}</td>
                                                <td className="p-2">
                                                  <button 
                                                    type="button" 
                                                    className="text-gray-500 hover:text-red-500 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                    onClick={() => {
                                                      if (manualContacts.length > 0) {
                                                        const newContacts = manualContacts.filter((_, i) => i !== idx);
                                                        setManualContacts(newContacts);
                                                        setContactCount(newContacts.length);
                                                      }
                                                    }}
                                                    aria-label="Remove contact"
                                                  >
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </td>
                                            </>
                                          )}
                                          {csvHeaders.length > 0 && (
                                            <td className="p-2">
                                              <button 
                                                type="button" 
                                                className="text-gray-500 hover:text-red-500 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                onClick={() => {
                                                  if (csvPreviewContacts.length > 0) {
                                                    const phoneToRemove = contact.phone_number || contact.phone || contact["Phone Number"] || contact["Nomor"];
                                                    const newCsvPreviewContacts = csvPreviewContacts.filter((c, i) => i !== idx);
                                                    setCsvPreviewContacts(newCsvPreviewContacts);
                                                    
                                                    // Update stats
                                                    setCsvStats(prev => ({
                                                      ...prev,
                                                      total: prev.total - 1,
                                                      unique: prev.unique - 1
                                                    }));
                                                    setContactCount(prev => prev - 1);
                                                  }
                                                }}
                                                aria-label="Remove contact"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            </td>
                                          )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                             </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Accordion type="single" collapsible>
                <AccordionItem value="advanced">
                    <AccordionTrigger>
                        <div className="flex items-center gap-2">
                            <Settings2 className="h-4 w-4"/> Advanced Settings
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="priority">Priority</Label>
                                <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="sendSpeed">Speed</Label>
                                <Select value={sendSpeed} onValueChange={setSendSpeed}><SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="slow">Slow</SelectItem>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="fast">Fast</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="maxRetry">Max Retries</Label>
                            <Input id="maxRetry" type="number" min={0} max={5} value={maxRetry} onChange={e => setMaxRetry(parseInt(e.target.value))}/>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="scheduleMessage" checked={isScheduled} onCheckedChange={c => setIsScheduled(!!c)}/>
                            <Label htmlFor="scheduleMessage">Schedule for later</Label>
                        </div>
                        {isScheduled && (
                            <div className="relative z-50">
                            <LocalizationProvider dateAdapter={AdapterDateFns}>
                                <DateTimePicker 
                                    value={scheduledDate} 
                                    onChange={setScheduledDate} 
                                    minDate={new Date()} 
                                    ampm={false}
                                    slotProps={{
                                        popper: {
                                            placement: 'top-start',
                                            modifiers: [
                                                {
                                                    name: 'flip',
                                                    enabled: true,
                                                },
                                            ],
                                            disablePortal: true,
                                        },
                                        layout: {
                                          sx: {
                                            ".MuiPickersLayout-contentWrapper": {
                                              zIndex: 9999
                                            }
                                          }
                                        },
                                        textField: {
                                          fullWidth: true,
                                          variant: "outlined"
                                        }
                                    }}
                                />
                            </LocalizationProvider>
                            </div>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>

        {/* Right Column: Composer & Preview */}
        <div className="lg:col-span-2 space-y-6">
            <Card>
                <CardHeader><CardTitle>Message Composer</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     <div>
                        <Label>Media</Label>
                        <div className="flex flex-col gap-2">
                          <AssetPicker
                            onAssetSelect={handleAssetSelected}
                            buttonLabel="Select Media"
                          />
                          <div className="text-xs text-muted-foreground">
                            Select media from your library or upload new files
                          </div>
                        </div>
                     </div>
                     {selectedAssets.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {selectedAssets.map((asset) => (
                              <div key={asset.id} className="relative group aspect-square">
                                {asset.assetType === 'image' ? (
                                  <img 
                                    src={asset.thumbnailUrl || asset.url} 
                                    alt={asset.original_filename || asset.filename} 
                                    className="w-full h-full object-cover rounded-md"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-muted rounded-md flex flex-col items-center justify-center p-2">
                                    {asset.assetType === 'video' && <Video className="h-8 w-8 text-gray-500" />}
                                    {asset.assetType === 'audio' && <Music className="h-8 w-8 text-gray-500" />}
                                    {asset.assetType === 'document' && <FileText className="h-8 w-8 text-gray-500" />}
                                    <span className="text-xs text-center mt-2 truncate w-full">
                                      {asset.original_filename || asset.filename}
                                    </span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-md">
                                  <Button 
                                    type="button" 
                                    variant="destructive" 
                                    size="icon" 
                                    className="h-8 w-8" 
                                    onClick={() => removeAsset(asset.id)}
                                  >
                                    <Trash2 className="h-4 w-4"/>
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                     )}

                    <div>
                        <Label htmlFor="message">Message {selectedAssets.length > 0 && "(Caption for media)"}</Label>
                        <Textarea 
                          id="message" 
                          value={message} 
                          onChange={e => setMessage(e.target.value)} 
                          placeholder="Type your message here..." 
                          className="min-h-[150px]"
                        />
                    </div>
                     <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => applyFormat("bold")}><Bold className="h-4 w-4"/></Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => applyFormat("italic")}><Italic className="h-4 w-4"/></Button>
                        <div className="h-6 border-l mx-2"/>
                         {uniqueVariableFields.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <Info className="h-4 w-4 text-blue-500" />
                                <span className="text-xs text-muted-foreground">Variables:</span>
                                {uniqueVariableFields.map(field => (
                                    <Button key={field} type="button" variant="outline" size="sm" className="text-xs" onClick={() => insertVariable(field)}>
                                        {`{{${field}}}`}
                                    </Button>
                                ))}
                            </div>
                         )}
                    </div>
                </CardContent>
            </Card>

             <Card>
                <CardHeader><CardTitle>Live Preview</CardTitle></CardHeader>
                <CardContent>
                    <div className="bg-muted w-full max-w-sm mx-auto rounded-xl p-4 border border-muted-foreground/10">
                         <div className="space-y-2">
                            {selectedAssets.length > 0 && (
                                <div className="p-2 bg-background rounded-lg">
                                    {selectedAssets[0].assetType === 'image' ?
                                      <img 
                                        src={selectedAssets[0].thumbnailUrl || selectedAssets[0].url} 
                                        className="rounded-md w-full h-auto object-cover"
                                      /> :
                                      <div className="flex items-center gap-2">
                                          {selectedAssets[0].assetType === 'video' && <Video className="h-8 w-8 text-gray-500" />}
                                          {selectedAssets[0].assetType === 'audio' && <Music className="h-8 w-8 text-gray-500" />}
                                          {selectedAssets[0].assetType === 'document' && <FileText className="h-8 w-8 text-gray-500" />}
                                          <span>{selectedAssets[0].original_filename || selectedAssets[0].filename}</span>
                                      </div>
                                    }
                                    {selectedAssets.length > 1 && <p className="text-xs text-center mt-1 font-bold">+{selectedAssets.length - 1} more media</p>}
                                </div>
                            )}
                            {(message || selectedAssets.length == 0) && (
                                <div className="bg-background rounded-lg p-3 text-sm">
                                    <p dangerouslySetInnerHTML={{ __html: parseWhatsappFormat(message) || "<span class='text-muted-foreground'>Your message will appear here...</span>" }} />
                                    <div className="text-[10px] text-right text-muted-foreground mt-1">
                                        {format(new Date(), "HH:mm")}
                                    </div>
                                </div>
                            )}
                         </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>

      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <ContactSelectorDialog
            open={showContactDialog}
            onOpenChange={setShowContactDialog}
            onConfirm={contacts => {
              setManualContacts(contacts);
              resetContactSelection(false); // keep manual contacts
              setContactCount(contacts.length);
            }}
            initialSelected={manualContacts.map(c => c.id)}
        />
      </Dialog>
      
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent data-no-autofocus>
          <DialogHeader>
            <DialogTitle>Confirm Broadcast</DialogTitle>
            <DialogDescription>Please review the details before sending.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p><strong>Name:</strong> {broadcastName}</p>
            <p><strong>Device:</strong> {connections.find(c=>c.id === selectedConnectionId)?.name}</p>
            <p><strong>Recipients:</strong> {contactCount} unique contacts</p>
            <p><strong>Message Type:</strong> {selectedAssets.length > 0 ? 'Media' : 'Text'}</p>
            <p><strong>Scheduled:</strong> {isScheduled && scheduledDate ? format(scheduledDate, "PPP 'at' HH:mm") : 'Sending immediately'}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={isLoading}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Sending..." : "Confirm & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add the custom scrollbar style to the document head */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.3);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}} />
      </form>
    </div>
  );
};

export default BroadcastPage;