import React, { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, PlusCircle, Trash2, Edit2, GripVertical, Loader2, Smile, Bold, Italic, Image as ImageIcon, Video as VideoIcon, FileText as FileTextIcon, Music as MusicIcon, Info, User, Briefcase, Building, Clock, MessageSquare, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from '@dnd-kit/utilities';
import { produce } from 'immer';
import { AssetPicker } from "@/components/asset/AssetPicker";
import { Asset } from "@/services/assetService";
import assetService from "@/services/assetService";

const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
const API_URL = API_SERVER_URL + '/api';

// --- Helper Functions for Delay ---
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
// --- End Helper Functions ---

// CORRECTED: Define message type with 'message' property
interface DripMessage {
  id: string; // Use string for UUID compatibility
  message: string;
  type: string;
  delay: number;
  message_order: number;
  isEditing?: boolean;
  isNew?: boolean;
  mediaFullPath?: string;
  media_url?: string; // To match edit page
  caption?: string;   // To match edit page
  assetId?: string;   // Add asset ID for tracking usage
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
  name: string;
  description: string;
  connection_id: string;
  segment_id: string | null;
}

const commonMetadataFields = [
  { key: "contact_name", label: "Nama", icon: <User className="h-3 w-3" /> },
  { key: "profession", label: "Profesi", icon: <Briefcase className="h-3 w-3" /> },
  { key: "company", label: "Perusahaan", icon: <Building className="h-3 w-3" /> },
];

// --- REDESIGNED UI COMPONENTS (Mirroring Edit Page) ---

// MessageItem (for DragOverlay)
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
    // Jika tidak ada pesan dan tidak ada media, tampilkan error
    if (!currentMessage.message?.trim() && !currentMessage.mediaFullPath && !selectedAsset) {
      toast.error("Pesan atau media wajib diisi");
      return;
    }
    
    // Pastikan pesan selalu ada nilai, bahkan jika hanya media yang dipilih
    let updatedMessage = {...currentMessage};
    if (!updatedMessage.message?.trim()) {
      updatedMessage.message = "Pesan media";
    }
    
    if (selectedAsset) {
      updatedMessage = {
        ...updatedMessage,
        mediaFullPath: selectedAsset.url,
        type: 'media',
        assetId: selectedAsset.id,
      };
    }
    
    onSave(updatedMessage);
  };
  
  const handleAssetSelected = (asset: Asset) => {
    setSelectedAsset(asset);
    setCurrentMessage(produce(draft => { 
      draft.mediaFullPath = asset.url;
      draft.type = 'media';
      draft.assetId = asset.id;
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
      
      setCurrentMessage(produce(draft => {
        draft.mediaFullPath = result.fullPath;
        const mimeType = file.type;
        if (mimeType.startsWith('image/')) draft.type = 'image';
        else if (mimeType.startsWith('video/')) draft.type = 'video';
        else if (mimeType.startsWith('audio/')) draft.type = 'audio';
        else draft.type = 'document';
      }));

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
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const placeholder = `{{${key}}}`;
    const newText = `${textarea.value.substring(0, start)}${placeholder}${textarea.value.substring(end)}`;
    setCurrentMessage(produce(draft => { draft.message = newText; }));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 0);
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


// --- Main Page Component ---
export default function DripCampaignCreatePage() {
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [campaign, setCampaign] = useState<CampaignData>({
    name: "",
    description: "",
    connection_id: "",
    segment_id: null,
  });
  
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(true);

  const [messages, setMessages] = useState<DripMessage[]>([]);
  const [activeDragMessage, setActiveDragMessage] = useState<DripMessage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const fetchInitialData = async () => {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User tidak teridentifikasi. Silakan login kembali.");
        return;
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        toast.error("User ID tidak valid. Silakan login kembali.");
        return;
      }

      setLoadingDevices(true);
      try {
        const res = await fetch(`${API_URL}/connections?status=connected`, { headers: { 'x-user-id': userId } });
        const data = await res.json();
        if (data.success) {
          setDevices(data.connections || []);
        } else {
          toast.error(`Gagal memuat device: ${data.error}`);
          setDevices([]);
        }
      } catch (e) { 
        toast.error("Gagal memuat device."); 
        setDevices([]);
      } 
      finally { setLoadingDevices(false); }

      setLoadingSegments(true);
      try {
        const res = await fetch(`${API_URL}/drip-segments`, { headers: { 'x-user-id': userId } });
        const data = await res.json();
        if (data.success) {
          setSegments(data.segments || []);
        } else {
          toast.error(`Gagal memuat segmen: ${data.error}`);
          setSegments([]);
        }
      } catch (e) { 
        toast.error("Gagal memuat segmen."); 
        setSegments([]);
      }
      finally { setLoadingSegments(false); }
    };
    fetchInitialData();
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const msg = messages.find(m => m.id === event.active.id);
    if (msg) setActiveDragMessage(msg);
  }, [messages]);

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
      toast.info("Urutan pesan diubah.");
    }
  }, []);
  
  const handleAddNewMessage = () => {
    setMessages(
      produce((draft: DripMessage[]) => {
        draft.forEach(m => m.isEditing = false);
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
  
  const handleSaveMessage = (editedMessage: DripMessage) => {
     setMessages(
      produce(draft => {
        const index = draft.findIndex(m => m.id === editedMessage.id);
        if (index !== -1) {
          draft[index] = { ...editedMessage, isEditing: false };
        }
        draft.forEach((msg, idx) => { msg.message_order = idx + 1; });
      })
    );
    toast.success("Pesan baru disimpan.");
  };
  
  const handleCancelEdit = (id: string) => {
    setMessages(draft => draft.filter(m => m.id !== id));
  };
  
  const handleToggleEdit = (id: string) => {
    setMessages(
      produce(draft => {
        const msg = draft.find(m => m.id === id);
        if (msg) msg.isEditing = !msg.isEditing;
      })
    );
  };

  const handleDeleteMessage = (id: string) => {
    setMessages(draft => draft.filter(m => m.id !== id).map((msg, idx) => ({...msg, message_order: idx+1})));
    toast.warning("Pesan dihapus dari alur.");
  };

  const handleSubmit = async () => {
    if (!campaign.name.trim()) return toast.error("Nama campaign wajib diisi.");
    if (!campaign.connection_id) return toast.error("Device pengirim wajib dipilih.");
    if (messages.length === 0) return toast.error("Minimal harus ada 1 pesan dalam alur.");

    setSubmitting(true);
    const toastId = toast.loading("Membuat campaign baru...");

    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) throw new Error("User tidak teridentifikasi.");

      // 1. Create Campaign - do not send client-side ID
      const campaignPayload = { ...campaign };
      const campRes = await fetch(`${API_URL}/drip/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify(campaign),
      });

      if (!campRes.ok) {
        const err = await campRes.json();
        throw new Error(`Gagal membuat campaign: ${err.error || 'Unknown error'}`);
      }
      
      const newCampaignData = await campRes.json();
      const newCampaignId = newCampaignData.campaign.id;

      // 2. Create Messages for the Campaign using the new ID
      const messagePayloads = messages.map(msg => ({
          drip_campaign_id: newCampaignId,
          message: msg.message || "Pesan tanpa teks",
          type: msg.type,
          mediaFullPath: msg.mediaFullPath,
          caption: msg.message || "Pesan tanpa teks",
          delay: msg.delay,
          order: msg.message_order,
          assetId: msg.assetId
      }));

      for (const payload of messagePayloads) {
          const msgRes = await fetch(`${API_URL}/drip/campaigns/${newCampaignId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
              body: JSON.stringify(payload),
          });
          if (!msgRes.ok) {
              const err = await msgRes.json();
              throw new Error(`Gagal membuat pesan #${payload.order}: ${err.error}`);
          }
      }

      toast.success("Campaign berhasil dibuat!", { id: toastId });
      navigate('/dashboard/drip-campaign');

    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      <header className="bg-white dark:bg-zinc-900/50 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <Button variant="ghost" size="icon" className="w-9 h-9" onClick={() => navigate('/dashboard/drip-campaign')}>
               <ArrowLeft className="w-5 h-5" />
             </Button>
            <div>
               <h1 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Buat Drip Campaign Baru</h1>
               <p className="text-xs text-gray-500 dark:text-zinc-400">Isi detail di bawah untuk memulai.</p>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan...</> : "Simpan Campaign"}
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
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

          <div className="lg:col-span-1 space-y-6">
             <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Pengaturan Campaign</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="campaign-name">Nama Campaign</Label>
                    <Input id="campaign-name" value={campaign.name} onChange={(e) => setCampaign(produce(draft => { draft.name = e.target.value; }))} />
                  </div>
                  <div>
                    <Label htmlFor="campaign-desc">Deskripsi</Label>
                    <Textarea id="campaign-desc" value={campaign.description} onChange={(e) => setCampaign(produce(draft => { draft.description = e.target.value; }))} placeholder="Jelaskan tujuan campaign ini..." />
                  </div>
                   <div>
                    <Label>Device Pengirim</Label>
                    <Select value={campaign.connection_id} onValueChange={(value) => {
                      if (value !== "no-devices") {
                        setCampaign(produce(draft => { draft.connection_id = value; }));
                      }
                    }} disabled={loadingDevices || devices.length === 0}>
                      <SelectTrigger><SelectValue placeholder={loadingDevices ? "Memuat..." : devices.length === 0 ? "Tidak ada device tersedia" : "Pilih device..."} /></SelectTrigger>
                      <SelectContent>
                        {devices.length === 0 ? (
                          <SelectItem value="no-devices" disabled>Tidak ada device tersedia</SelectItem>
                        ) : (
                          devices.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)
                        )}
                      </SelectContent>
                    </Select>
                    {devices.length === 0 && !loadingDevices && (
                      <p className="text-sm text-red-500 mt-1">Tidak ada device yang terhubung. Silakan hubungkan device terlebih dahulu.</p>
                    )}
                  </div>
                  <div>
                    <Label>Segment Kontak (Opsional)</Label>
                    <Select value={campaign.segment_id || 'none'} onValueChange={(value) => {
                      if (value !== "no-segments") {
                        setCampaign(produce(draft => { draft.segment_id = value === 'none' ? null : value; }));
                      }
                    }} disabled={loadingSegments}>
                      <SelectTrigger><SelectValue placeholder={loadingSegments ? "Memuat..." : "Pilih segmen..."} /></SelectTrigger>
                      <SelectContent>
                         <SelectItem value="none">Tanpa Segmen</SelectItem>
                         <SelectSeparator />
                        {segments.length === 0 ? (
                          <SelectItem value="no-segments" disabled>Tidak ada segmen tersedia</SelectItem>
                        ) : (
                          segments.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                        )}
                      </SelectContent>
                    </Select>
                    {segments.length === 0 && !loadingSegments && (
                      <p className="text-sm text-gray-500 mt-1">Tidak ada segmen tersedia. Anda dapat membuat segmen di halaman Contact Segments.</p>
                    )}
                  </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
} 
