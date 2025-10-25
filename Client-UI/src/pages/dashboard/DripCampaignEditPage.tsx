import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, Trash2, Edit2, GripVertical, Loader2, Smile, Bold, Italic, Image as ImageIcon, Video as VideoIcon, FileText as FileTextIcon, Music as MusicIcon, Info, User, Briefcase, Building, Clock, DownloadCloud, MessageSquare, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { KeyboardSensor } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { produce } from 'immer';
import { Pencil, Trash, MoreHorizontal, MapPin, CheckCircle, Book } from "lucide-react";
import { AssetPicker } from "@/components/asset/AssetPicker";
import { Asset } from "@/services/assetService";
import assetService from "@/services/assetService";

const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
const API_URL = API_SERVER_URL + '/api';

// Contoh metadata umum yang mungkin digunakan
const commonMetadataFields = [
  { key: "contact_name", label: "Nama", icon: <User className="h-3 w-3" /> },
  { key: "profession", label: "Profesi", icon: <Briefcase className="h-3 w-3" /> },
  { key: "company", label: "Perusahaan", icon: <Building className="h-3 w-3" /> },
];

// Utilitas untuk konversi delay
type DelayUnit = 'menit' | 'jam' | 'hari';

const convertMinutesToBestUnit = (minutes: number): { value: number; unit: DelayUnit } => {
  if (minutes === 0) return { value: 0, unit: 'menit' };
  if (minutes > 0 && minutes % (60 * 24) === 0) {
    return { value: minutes / (60 * 24), unit: 'hari' };
  }
  if (minutes > 0 && minutes % 60 === 0) {
    return { value: minutes / 60, unit: 'jam' };
  }
  return { value: minutes, unit: 'menit' };
};

const convertToMinutes = (value: number, unit: DelayUnit): number => {
  if (unit === 'jam') {
    return value * 60;
  }
  if (unit === 'hari') {
    return value * 24 * 60;
  }
  return value;
};

// Interfaces (dapat disesuaikan/diimpor dari file terpusat jika ada)
interface DripMessage {
  id: string;
  drip_campaign_id?: string;
  message: string;
  type: string;
  media_url?: string;
  caption?: string;
  delay: number;
  message_order: number;
  isEditing?: boolean;
  isNew?: boolean;
  // Client-side only fields
  mediaFullPath?: string;
  text?: string; // For compatibility with the editor
  assetId?: string;  // Add asset ID for tracking usage
}

interface Device {
  id: string;
  name: string;
  phone_number?: string;
}

interface Segment {
  id: string;
  name: string;
}

interface CampaignData {
  id: string;
  name: string;
  description: string;
  connection_id: string;
  segment_id: string | null; // Allow null
  status?: string;
  created_at?: string;
  updated_at?: string;
}

// --- Komponen internal (bisa direfaktor dari DripCampaignCreatePage) ---
// MessageItem (untuk DragOverlay)
function MessageItem({ message }: { message: DripMessage }) {
  const formatDelay = (minutes: number) => {
    const { value, unit } = convertMinutesToBestUnit(minutes);
    return `${value} ${unit}`;
  };

  return (
    <div className="rounded-lg bg-white dark:bg-zinc-900 shadow-xl p-4 flex items-center gap-4 border border-primary ring-4 ring-primary/20">
      <GripVertical className="w-5 h-5 text-gray-400" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
           <Badge variant="secondary" className="font-mono">Pesan #{message.message_order}</Badge>
           <p className="font-semibold truncate">{message.message || "Pesan Media"}</p>
        </div>
        <p className="text-xs text-gray-500 mt-1">Delay: {formatDelay(message.delay)}</p>
      </div>
    </div>
  );
}

// SortableMessageItem
function SortableMessageItem({ message, onEdit, onDelete }: { 
  message: DripMessage, 
  onEdit: () => void, 
  onDelete: () => void 
}) {
   const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: message.id });
   const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, zIndex: isDragging ? 1 : 0 };
  
  const getMediaIcon = (type: string) => {
    if (type === 'image') return <ImageIcon className="w-4 h-4 text-blue-500" />;
    if (type === 'video') return <VideoIcon className="w-4 h-4 text-purple-500" />;
    if (type === 'document') return <FileTextIcon className="w-4 h-4 text-amber-500" />;
    if (type === 'audio') return <MusicIcon className="w-4 h-4 text-green-500" />;
    return <MessageSquare className="w-4 h-4 text-gray-500" />;
  };

  const { value, unit } = convertMinutesToBestUnit(message.delay);

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl bg-white dark:bg-zinc-900/50 shadow-sm p-3 border border-gray-200 dark:border-zinc-800 group">
      <div className="flex items-center gap-3">
         <div {...attributes} {...listeners} className="cursor-grab p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
            <GripVertical className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
          </div>
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-zinc-800 rounded-lg">
          {getMediaIcon(message.type)}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="font-medium text-gray-800 dark:text-zinc-200 truncate pr-4">{message.message || "Pesan Media"}</p>
          <div className="text-xs text-gray-500 dark:text-zinc-400 flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3"/>
              <span>{value} {unit}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" onClick={onEdit} className="w-8 h-8"><Edit2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onDelete} className="w-8 h-8 text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

// MessageEditor
function MessageEditor({ message, onSave, onCancel, isFirstMessage }: { 
  message: DripMessage, 
  onSave: (message: DripMessage) => void, 
  onCancel: () => void,
  isFirstMessage: boolean
}) {
  const [currentMessage, setCurrentMessage] = useState(message);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  useEffect(() => {
    setCurrentMessage(message); // Sync with parent prop
  }, [message]);

  const handleSave = () => {
    if (!currentMessage.message?.trim() && !currentMessage.mediaFullPath && !selectedAsset) {
      toast.error("Pesan atau media wajib diisi");
      return;
    }
    
    if (selectedAsset) {
      const updatedMessage = {
        ...currentMessage,
        mediaFullPath: selectedAsset.url,
        type: 'media',
        assetId: selectedAsset.id,
      };
      onSave(updatedMessage);
    } else {
      onSave(currentMessage);
    }
  };
  
  const handleAssetSelected = (asset: Asset) => {
    setSelectedAsset(asset);
    setCurrentMessage(produce(draft => { 
      draft.mediaFullPath = asset.url;
      draft.type = 'media';
    }));
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validasi ukuran file (max 25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB dalam bytes
    if (file.size > maxSize) {
      toast.error(`Ukuran file terlalu besar. Maksimal 25MB, file Anda: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("Mengupload media...", { description: `File: ${file.name}` });

    const formData = new FormData();
    formData.append("media", file);
    
    // Dapatkan user ID dari localStorage
    const userId = localStorage.getItem('user_id') || 'anonymous';
    console.log("Uploading file with user ID:", userId); // Log untuk debugging
    
    // Pastikan user_id dikirimkan sebagai bagian dari FormData
    formData.append("user_id", userId);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/broadcast/upload-media`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Gagal memparsing respons error" }));
        throw new Error(errorData.error || `Gagal mengupload file: Status ${response.status}`);
      }

      const result = await response.json();
      console.log("Upload response:", result); // Log untuk debugging
      setCurrentMessage(produce(draft => { draft.mediaFullPath = result.fullPath; }));
      
      const mimeType = file.type;
      let type = 'document';
      if (mimeType.startsWith('image/')) {
        type = 'image';
      } else {
        setCurrentMessage(produce(draft => { draft.type = type; }));
      }
      if (mimeType.startsWith('video/')) type = 'video';
      if (mimeType.startsWith('audio/')) type = 'audio';
      setCurrentMessage(produce(draft => { draft.type = type; }));

      toast.success("Media berhasil diupload", { id: toastId });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(`Gagal mengupload media: ${(error as Error).message}`, { id: toastId });
      setCurrentMessage(produce(draft => { draft.mediaFullPath = undefined; }));
    } finally {
      setIsUploading(false);
      if(fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const insertMetadataPlaceholder = (key: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Buat placeholder dengan format {{key}}
    const placeholder = `{{${key}}}`;
    
    // Sisipkan placeholder pada posisi kursor
    const newText = `${textarea.value.substring(0, start)}${placeholder}${textarea.value.substring(end)}`;
    setCurrentMessage(produce(draft => { draft.message = newText; }));
    
    // Focus kembali ke textarea dan atur posisi kursor setelah placeholder
    textarea.focus();
    const newPosition = start + placeholder.length;
    setTimeout(() => textarea.setSelectionRange(newPosition, newPosition), 0);
    
    // Tampilkan toast informasi
    toast.info(`Placeholder metadata "${key}" ditambahkan`);
  };

  const { value: delayValue, unit: delayUnit } = convertMinutesToBestUnit(currentMessage.delay);

  return (
    <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/5 dark:bg-zinc-900 my-4 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Message & Media */}
        <div className="md:col-span-2 flex flex-col gap-3">
          {currentMessage.mediaFullPath ? (
             <div className="bg-background/80 p-2 rounded-lg flex items-center gap-2 max-w-full border dark:bg-zinc-800/50 dark:border-zinc-700">
               <div className="flex-1 flex items-center gap-2 text-sm text-foreground overflow-hidden">
                 <FileTextIcon className="w-4 h-4 text-gray-500" />
                 <span className="truncate font-medium">
                   {selectedAsset ? 
                     (selectedAsset.original_filename || selectedAsset.filename) : 
                     currentMessage.mediaFullPath.split('/').pop()}
                 </span>
               </div>
               <Button 
                 size="icon" 
                 variant="ghost" 
                 className="w-7 h-7" 
                 onClick={() => {
                   setCurrentMessage(produce(draft => { 
                     draft.mediaFullPath = undefined; 
                     draft.type = 'text';
                     draft.assetId = undefined; 
                   }));
                   setSelectedAsset(null);
                 }} 
                 disabled={isUploading}
               >
                 <X className="w-4 h-4 text-red-500" />
               </Button>
             </div>
          ) : (
            <div className="flex gap-2">
              <AssetPicker 
                onAssetSelect={handleAssetSelected}
                buttonLabel="Pilih Media"
                triggerElement={
                  <Button variant="outline" disabled={isUploading}>
                    <FileTextIcon className="w-4 h-4 mr-2" /> Pilih Media (Opsional)
                  </Button>
                }
              />
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,video/*,application/pdf,audio/*" />

          <Textarea
            ref={textareaRef}
            placeholder={currentMessage.mediaFullPath ? "Tulis caption untuk media..." : "Tulis pesan Anda di sini..."}
            value={currentMessage.message}
            onChange={(e) => setCurrentMessage(produce(draft => { draft.message = e.target.value; }))}
            className="min-h-[150px] bg-white dark:bg-zinc-900"
            disabled={isUploading}
          />
           <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground mr-2">Sisipkan:</span>
              {commonMetadataFields.map(field => (
                <Button key={field.key} type="button" variant="outline" size="sm" onClick={() => insertMetadataPlaceholder(field.key)} className="flex items-center gap-1 text-xs">
                  {field.icon} {field.label}
                </Button>
              ))}
            </div>
        </div>
        {/* Right Side: Delay Settings */}
        <div className="flex flex-col gap-4">
          <div>
            <Label className="font-semibold">{isFirstMessage ? "Kirim setelah subscribe" : "Kirim setelah pesan sebelumnya"}</Label>
            <div className="flex gap-2 mt-2">
              <Input type="number" min="0" value={delayValue} onChange={(e) => {
                  const newDelay = convertToMinutes(Number(e.target.value), delayUnit);
                  setCurrentMessage(produce(draft => { draft.delay = newDelay; }));
              }} className="w-24 bg-white dark:bg-zinc-900"/>
              <Select value={delayUnit} onValueChange={(unit: DelayUnit) => {
                  const newDelay = convertToMinutes(delayValue, unit);
                  setCurrentMessage(produce(draft => { draft.delay = newDelay; }));
              }}>
                <SelectTrigger className="bg-white dark:bg-zinc-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="menit">Menit</SelectItem>
                  <SelectItem value="jam">Jam</SelectItem>
                  <SelectItem value="hari">Hari</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <p className="text-xs text-muted-foreground mt-2">Total delay: {currentMessage.delay} menit.</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={onCancel}>Batal</Button>
        <Button onClick={handleSave} disabled={isUploading}>
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
           Simpan Pesan
        </Button>
      </div>
    </div>
  );
}
// --- End Komponen internal ---

export default function DripCampaignEditPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [campaign, setCampaign] = useState<Partial<CampaignData>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [messages, setMessages] = useState<DripMessage[]>([]);
  const [initialMessages, setInitialMessages] = useState<DripMessage[]>([]);
  const [activeDragMessage, setActiveDragMessage] = useState<DripMessage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const fetchCampaignDetails = async () => {
      setLoading(true);
      const userId = localStorage.getItem('user_id');
      if (!campaignId || !userId) {
        toast.error("Campaign ID atau User ID tidak ditemukan.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/drip/campaigns/${campaignId}`, {
          headers: {
            'x-user-id': userId
          }
        });
        if (!response.ok) {
          throw new Error('Gagal memuat detail campaign.');
        }
        const campaignResData = await response.json();
        if (!campaignResData.success) throw new Error(campaignResData.error || "Gagal memuat data campaign");
        
        const campaignData = campaignResData.campaign;
        setCampaign(campaignData);
        const processedMessages = processMessages(campaignData.drip_messages || []);
        setMessages(processedMessages);
        setInitialMessages(processedMessages);

      } catch (error) {
        toast.error((error instanceof Error) ? error.message : "Terjadi kesalahan saat memuat data");
        navigate("/dashboard/drip-campaign");
      } finally {
        setLoading(false);
      }
    };

    const fetchAuxData = async () => {
      // Fetch Devices
      try {
        // Mengambil device yang hanya dimiliki oleh user yang login
        const userId = localStorage.getItem('user_id'); // Asumsi user_id disimpan di localStorage
        if (!userId) {
          throw new Error('User ID tidak ditemukan');
        }
        const deviceRes = await fetch(`${API_URL}/connections?status=connected`, {
          headers: {
            'x-user-id': userId
          }
        });
        const deviceData = await deviceRes.json();
        setDevices(deviceData.success ? deviceData.connections : []);
      } catch (e) { setDevices([]); toast.error("Gagal memuat device"); }

      // Fetch Segments
      try {
        const userId = localStorage.getItem('user_id');
        if (!userId) {
            throw new Error('User ID tidak ditemukan');
        }
        // Mengubah endpoint segments ke endpoint yang benar
        const segmentRes = await fetch(`${API_URL}/drip-segments`, {
            headers: {
                'x-user-id': userId
            }
        });
        const segmentData = await segmentRes.json();
        setSegments(segmentData.success ? segmentData.segments : []);
      } catch (e) { setSegments([]); toast.error("Gagal memuat segmen"); }
    };
    
    fetchCampaignDetails();
    fetchAuxData();
  }, [campaignId, navigate]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const msg = messages.find(m => m.id === event.active.id);
    if (msg) setActiveDragMessage(msg);
  }, [messages]);

  // Add saveMessageOrder function here - before handleDragEnd is used
  const saveMessageOrder = async () => {
    if (!campaignId) return toast.error("Campaign ID tidak ditemukan.");
    
    setSubmitting(true);
    const toastId = toast.loading("Menyimpan urutan pesan...");

    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) throw new Error('User ID tidak ditemukan');

      // Process all message updates
      const promises = [];
      
      for (const message of messages) {
        if (!String(message.id).startsWith('new_')) { // Only update existing messages
          // Create a simple payload with just the required fields for reordering
          const messagePayload = {
            message: message.message,
            type: message.type || 'text',
            media_url: message.mediaFullPath || message.media_url,
            caption: message.caption || message.message,
            delay: message.delay || 0,
            message_order: message.message_order,
            asset_id: message.assetId
          };
          
          promises.push(
            fetch(`${API_URL}/drip/messages/${message.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
              body: JSON.stringify(messagePayload),
            })
          );
        }
      }

      const results = await Promise.all(promises);
      for (const result of results) {
        if (!result.ok) {
          const err = await result.json().catch(() => ({error: 'Gagal memproses pesan'}));
          throw new Error(err.error || `Satu atau lebih pesan gagal disimpan. Status: ${result.status}`);
        }
      }
      
      toast.success("Urutan pesan berhasil disimpan!", { id: toastId });
      
      // Refresh data to sync state
      const freshDataResponse = await fetch(`${API_URL}/drip/campaigns/${campaignId}`, { headers: { 'x-user-id': userId } });
      const freshData = await freshDataResponse.json();
      if (freshData.success) {
        const processed = processMessages(freshData.campaign.drip_messages || []);
        setMessages(processed);
        setInitialMessages(processed);
      }
    } catch (error) {
      toast.error(`Gagal menyimpan: ${(error instanceof Error) ? error.message : String(error)}`, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragMessage(null);
    if (over && active.id !== over.id) {
      setMessages(items => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        return reordered.map((msg, idx) => ({ ...msg, message_order: idx + 1, isEditing: false }));
      });
      
      // Add this: Auto-save the reordering to the database
      setTimeout(() => {
        saveMessageOrder();
      }, 500);
      
      toast.info("Urutan pesan diubah dan sedang disimpan...");
    }
  }, [messages, campaignId]);

  const handleToggleEdit = (id: string) => {
    setMessages(
      produce(draft => {
        const msg = draft.find(m => m.id === id);
        if (msg) msg.isEditing = !msg.isEditing;
      })
    );
  };
  
  const handleSaveMessage = (editedMessage: DripMessage) => {
     setMessages(
      produce(draft => {
        const index = draft.findIndex(m => m.id === editedMessage.id);
        if (index !== -1) {
          draft[index] = { ...editedMessage, isEditing: false };
        } else {
          // This is a new message being added
          draft.push({ ...editedMessage, isEditing: false });
        }
        // Re-order just in case
        draft.forEach((msg, idx) => { msg.message_order = idx + 1; });
      })
    );
    toast.success(String(editedMessage.id).startsWith('new_') ? "Pesan baru ditambahkan." : "Pesan berhasil diperbarui.");
  };

  const handleAddNewMessage = () => {
    setMessages(
      produce(draft => {
        draft.forEach(m => m.isEditing = false); // Close other editors
        draft.push({
          id: `new_${Date.now()}`,
          message: "",
          type: "text",
          delay: 10,
          message_order: draft.length + 1,
          isEditing: true,
          isNew: true,
        });
      })
    );
  };
  
  const handleCancelEdit = (id: string) => {
    if (String(id).startsWith('new_')) {
      // It's a new, unsaved message, so just remove it
      setMessages(draft => draft.filter(m => m.id !== id));
    } else {
      // It's an existing message, just toggle edit mode off
      handleToggleEdit(id);
    }
  };

  const handleDeleteMessage = (id: string) => {
    setMessages(draft => draft.filter(m => m.id !== id).map((msg, idx) => ({...msg, message_order: idx+1})));
    toast.warning("Pesan dihapus dari alur (belum tersimpan).");
  };

  const handleSubmit = async () => {
    if (!campaignId || !campaign.name) return toast.error("Nama campaign wajib diisi.");
    if (!campaign.connection_id) return toast.error("Device pengirim wajib dipilih.");

    setSubmitting(true);
    const toastId = toast.loading("Menyimpan perubahan campaign...");

    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) throw new Error('User ID tidak ditemukan');

      // 1. Update Campaign Details
      const campaignUpdateRes = await fetch(`${API_URL}/drip/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify(campaign),
      });

      if (!campaignUpdateRes.ok) {
        const errData = await campaignUpdateRes.json();
        throw new Error(`Gagal update campaign: ${errData.error || campaignUpdateRes.statusText}`);
      }

      // 2. Handle Message CUD (Create, Update, Delete)
      const initialMessageIds = new Set(initialMessages.map(m => m.id));
      const currentMessageIds = new Set(messages.map(m => m.id));
      
      const promises = [];

      // DELETIONS: Find messages in initial list but not in current list
      for (const initialMsg of initialMessages) {
        if (!currentMessageIds.has(initialMsg.id)) {
          promises.push(
            fetch(`${API_URL}/drip/messages/${initialMsg.id}`, {
              method: 'DELETE',
              headers: { 'x-user-id': userId },
            })
          );
        }
      }

      // UPSERTS (Updates and Creates)
      for (const message of messages) {
        const messagePayload = cleanMessageForAPI(message);
        if (String(message.id).startsWith('new_')) {
          // CREATE new message
          promises.push(
            fetch(`${API_URL}/drip/campaigns/${campaignId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
              body: JSON.stringify(messagePayload),
            })
          );
        } else {
          // UPDATE existing message
          promises.push(
            fetch(`${API_URL}/drip/messages/${message.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
              body: JSON.stringify(messagePayload),
            })
          );
        }
      }

      const results = await Promise.all(promises);
      for (const result of results) {
        if (!result.ok) {
          const err = await result.json().catch(() => ({error: 'Gagal memproses pesan'}));
          throw new Error(err.error || `Satu atau lebih pesan gagal disimpan. Status: ${result.status}`);
        }
      }
      
      toast.success("Campaign berhasil diperbarui!", { id: toastId });
      // Fetch fresh data after saving to sync state
      const freshDataResponse = await fetch(`${API_URL}/drip/campaigns/${campaignId}`, { headers: { 'x-user-id': userId } });
      const freshData = await freshDataResponse.json();
      if (freshData.success) {
        const processed = processMessages(freshData.campaign.drip_messages || []);
        setMessages(processed);
        setInitialMessages(processed);
      }

    } catch (error) {
      toast.error(`Gagal menyimpan: ${(error instanceof Error) ? error.message : String(error)}`, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const processMessages = (messagesData: any[]): DripMessage[] => {
    if (!messagesData || !Array.isArray(messagesData)) return [];
    
    return messagesData.map(m => ({
      ...m,
      // The server sends 'message', the client expects 'message'.
      // This ensures that even if the server sends null/undefined, we have a fallback.
      message: m.message || "", 
      mediaFullPath: m.media_url, 
      id: m.id || String(Date.now() + Math.random()),
      isEditing: false,
    })).sort((a,b) => (a.message_order || 0) - (b.message_order || 0));
  };

  const cleanMessageForAPI = (msg: DripMessage) => {
    // Convert client-side message object to API format
    return {
      message: msg.message, // Changed from 'text' to 'message' to match API expectations
      type: msg.type || 'text',
      media_url: msg.mediaFullPath || msg.media_url,
      caption: msg.caption,
      delay: msg.delay || 0,
      order: msg.message_order, // Tetap menggunakan 'order' untuk kompatibilitas dengan API
      assetId: msg.assetId // Include the asset ID for tracking
    };
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900/50 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <Button variant="ghost" size="icon" className="w-9 h-9" onClick={() => navigate('/dashboard/drip-campaign')}>
               <ArrowLeft className="w-5 h-5" />
             </Button>
            <div>
               <h1 className="text-lg font-bold text-gray-900 dark:text-zinc-100">{campaign.name || "Edit Drip Campaign"}</h1>
               <p className="text-xs text-gray-500 dark:text-zinc-400">Pastikan menyimpan perubahan Anda.</p>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...</> : "Simpan Perubahan"}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Messages */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Alur Pesan</CardTitle>
                <CardDescription>Atur urutan dan konten pesan yang akan dikirimkan secara otomatis. Tarik untuk mengubah urutan.</CardDescription>
              </CardHeader>
              <CardContent>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  <SortableContext items={messages.map(m => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {messages.map((msg) => (
                        msg.isEditing ? (
                          <MessageEditor 
                            key={msg.id}
                            message={msg}
                            onSave={handleSaveMessage}
                            onCancel={() => handleCancelEdit(msg.id)}
                            isFirstMessage={msg.message_order === 1}
                          />
                        ) : (
                          <SortableMessageItem 
                            key={msg.id}
                            message={msg}
                            onEdit={() => handleToggleEdit(msg.id)}
                            onDelete={() => handleDeleteMessage(msg.id)}
                          />
                        )
                      ))}
                    </div>
                  </SortableContext>
                   <DragOverlay dropAnimation={{ duration: 250, easing: 'ease' }}>
                      {activeDragMessage ? <MessageItem message={activeDragMessage} /> : null}
                   </DragOverlay>
                </DndContext>

                <div className="mt-6">
                   <Button variant="outline" className="w-full border-dashed" onClick={handleAddNewMessage}>
                      <Plus className="w-4 h-4 mr-2" /> Tambah Pesan
                   </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Settings */}
          <div className="lg:col-span-1 space-y-6">
             <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Pengaturan Campaign</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="campaign-name">Nama Campaign</Label>
                    <Input id="campaign-name" value={campaign.name || ''} onChange={(e) => setCampaign(produce(draft => { draft.name = e.target.value; }))} />
                  </div>
                  <div>
                    <Label htmlFor="campaign-desc">Deskripsi</Label>
                    <Textarea id="campaign-desc" value={campaign.description || ''} onChange={(e) => setCampaign(produce(draft => { draft.description = e.target.value; }))} placeholder="Jelaskan tujuan campaign ini..." />
                  </div>
                   <div>
                    <Label>Device Pengirim</Label>
                    <Select value={campaign.connection_id || ''} onValueChange={(value) => setCampaign(produce(draft => { draft.connection_id = value; }))} >
                      <SelectTrigger><SelectValue placeholder="Pilih device..." /></SelectTrigger>
                      <SelectContent>
                        {devices.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Segment Kontak (Opsional)</Label>
                    <Select value={campaign.segment_id || 'none'} onValueChange={(value) => setCampaign(produce(draft => { draft.segment_id = value === 'none' ? null : value; }))}>
                      <SelectTrigger><SelectValue placeholder="Pilih segmen..." /></SelectTrigger>
                      <SelectContent>
                         <SelectItem value="none">Tanpa Segmen</SelectItem>
                         <SelectSeparator />
                        {segments.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
} 