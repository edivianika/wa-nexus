import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, PlusCircle, Calendar, Clock, Trash2, Edit, Play, Pause, Info, CheckCircle2, XCircle, Clock3, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Video as VideoIcon, Music as MusicIcon, MessageSquare, DownloadCloud, RefreshCw } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";

// API URL
const API_URL = import.meta.env.VITE_API_URL ;

// Interface for campaign data
interface DripCampaign {
  id: string;
  name: string;
  description?: string;
  segment_id?: string;
  status?: string;
  created_at: string;
  updated_at?: string;
}

// Interface for message data
interface DripMessage {
  id: string;
  drip_campaign_id: string;
  message: string;
  type: string;
  media_url?: string;
  caption?: string;
  delay: number;
  message_order: number;
  created_at: string;
}

// Interface for subscriber data
interface DripSubscriber {
  id: string;
  drip_campaign_id: string;
  contact_id: string;
  created_at: string;
  metadata?: Record<string, any>;
  status?: string;
}

// Interface for log data
interface DripLog {
  id: string;
  drip_campaign_id: string;
  drip_message_id: string;
  contact_id: string; // dari join drip_subscribers
  status: 'sent' | 'failed';
  sent_at: string;
  error_message?: string;
  message_content: string;
  drip_subscribers: {
    id: string;
    contact_id: string;
  } | null;
  drip_messages: {
    id: string;
    message: string;
    message_order: number;
  } | null;
}

// Interface untuk status pesan per subscriber
interface MessageProgress {
  messageId: string;
  messageOrder: number;
  messageContent: string;
  status: 'sent' | 'failed' | 'pending';
  sentAt?: string;
  errorMessage?: string;
}

// --- Tipe Data ---
// (Tambahkan tipe data yang diperlukan di sini jika ada)
interface SegmentContact {
  id: string;
  contact_number: string;
  contact_name?: string;
}

// --- Komponen Modal Baru ---
function EnrollSegmentModal({ campaign, onEnroll, triggerButton }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<SegmentContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  const fetchSegmentContacts = async () => {
    if (!campaign?.segment_id) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/drip-segments/${campaign.segment_id}/contacts`);
      if (!response.ok) throw new Error("Gagal memuat kontak segmen.");
      const data = await response.json();
      if (data.success) {
        const contacts: SegmentContact[] = data.contacts;
        setContacts(contacts);
        // Pilih semua kontak secara default
        const allContactNumbers = new Set(contacts.map(c => c.contact_number));
        setSelectedContacts(allContactNumbers);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (open) => {
    if (open) {
      fetchSegmentContacts();
    }
    setIsOpen(open);
  };

  const handleSelectContact = (contactNumber: string, isSelected: boolean) => {
    const newSelection = new Set(selectedContacts);
    if (isSelected) {
      newSelection.add(contactNumber);
    } else {
      newSelection.delete(contactNumber);
    }
    setSelectedContacts(newSelection);
  };

  const handleSelectAll = (isAllSelected: boolean) => {
    if (isAllSelected) {
      const allContactNumbers = new Set(contacts.map(c => c.contact_number));
      setSelectedContacts(allContactNumbers);
    } else {
      setSelectedContacts(new Set());
    }
  };

  const handleConfirmEnrollment = async () => {
    if (selectedContacts.size === 0) {
      return toast.warning("Pilih setidaknya satu kontak untuk didaftarkan.");
    }
    await onEnroll(Array.from(selectedContacts));
    setIsOpen(false);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Daftarkan Kontak dari Segmen: {campaign?.segment?.name}</DialogTitle>
          <DialogDescription>
            Pilih kontak dari segmen yang ingin Anda daftarkan ke dalam drip campaign ini.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Memuat kontak...
            </div>
          ) : contacts.length === 0 ? (
             <div className="text-center py-10">Segmen ini tidak memiliki kontak.</div>
          ) : (
            <div className="space-y-2">
               <div className="flex items-center p-2 border-b">
                  <Checkbox
                    id="select-all"
                    checked={selectedContacts.size === contacts.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <label htmlFor="select-all" className="ml-3 font-medium">
                    Pilih Semua ({selectedContacts.size}/{contacts.length})
                  </label>
                </div>
              {contacts.map(contact => (
                <div key={contact.id} className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                  <Checkbox
                    id={contact.id}
                    checked={selectedContacts.has(contact.contact_number)}
                    onCheckedChange={(checked) => handleSelectContact(contact.contact_number, !!checked)}
                  />
                  <div className="ml-3">
                    <label htmlFor={contact.id} className="font-medium">{contact.contact_name || 'Tanpa Nama'}</label>
                    <p className="text-sm text-muted-foreground">{contact.contact_number}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
          <Button onClick={handleConfirmEnrollment} disabled={loading}>
            Daftarkan {selectedContacts.size} Kontak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DripCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<DripCampaign | null>(null);
  const [messages, setMessages] = useState<DripMessage[]>([]);
  const [subscribers, setSubscribers] = useState<DripSubscriber[]>([]);
  const [logs, setLogs] = useState<DripLog[]>([]);
  const [activeTab, setActiveTab] = useState("details");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingSubscriber, setDeletingSubscriber] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [newContactNumber, setNewContactNumber] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  // State untuk metadata fleksibel
  const [metadata, setMetadata] = useState<{key: string, value: string}[]>([{key: "contact_name", value: ""}]);
  
  // State untuk dialog progress pesan
  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState<DripSubscriber | null>(null);
  const [subscriberProgress, setSubscriberProgress] = useState<MessageProgress[]>([]);

  // State untuk nomor WhatsApp yang diformat
  const [formattedNumber, setFormattedNumber] = useState("");
  
  // State untuk pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Fetch campaign data on component mount
  useEffect(() => {
    if (!id) return;
    fetchCampaignData(id);
  }, [id]);

  // Function to fetch campaign data from API
  const fetchCampaignData = async (campaignId: string) => {
    setLoading(true);
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error("User ID not found in storage.");
      }
      
      const headers = { 'x-user-id': userId };

      // Helper to process responses
      const processResponse = async (response: Response, dataType: string) => {
        if (!response.ok) {
          throw new Error(`Error fetching ${dataType}: ${response.statusText} (${response.status})`);
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error(`Error in ${dataType} data: ${data.error || 'Unknown error'}`);
        }
        return data;
      };
      
      // Fetch all data in parallel
      const [campaignRes, messagesRes, subscribersRes, logsRes] = await Promise.all([
        fetch(`${API_URL}/drip/campaigns/${campaignId}`, { headers }),
        fetch(`${API_URL}/drip/campaigns/${campaignId}/messages`, { headers }),
        fetch(`${API_URL}/drip/campaigns/${campaignId}/subscribers`, { headers }),
        fetch(`${API_URL}/drip/campaigns/${campaignId}/logs`, { headers })
      ]);

      const campaignData = await processResponse(campaignRes, "campaign details");
      setCampaign(campaignData.campaign);

      const messagesData = await processResponse(messagesRes, "messages");
      setMessages(messagesData.messages);
      
      const subscribersData = await processResponse(subscribersRes, "subscribers");
      setSubscribers(subscribersData.subscribers);

      const logsData = await processResponse(logsRes, "logs");
      setLogs(logsData.logs);

    } catch (error) {
      console.error("Error fetching campaign details:", error);
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Function to format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Function to format metadata in a readable way
  const formatMetadata = (metadata?: Record<string, any>) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;
    
    return (
      <div className="space-y-1 max-w-[300px]">
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key} className="flex items-start">
            <span className="font-medium text-xs text-gray-500 min-w-[100px] mr-2">{key.replace(/_/g, ' ')}:</span>
            <span className="text-xs text-gray-700 dark:text-gray-300 break-words font-medium">{
              typeof value === 'object' 
                ? JSON.stringify(value) 
                : String(value)
            }</span>
          </div>
        ))}
      </div>
    );
  };

  // Function to get message progress summary for a subscriber
  const getProgressSummary = (subscriberId: string, contactId: string) => {
    // Dapatkan semua log untuk subscriber ini
    const subscriberLogs = logs.filter(
      log => log.drip_subscribers?.id === subscriberId || log.contact_id === contactId
    );
    
    // Jika tidak ada log, belum ada pesan yang dikirim
    if (subscriberLogs.length === 0) return "0/" + messages.length;
    
    // Hitung pesan yang sukses terkirim
    const sentCount = subscriberLogs.filter(log => log.status === 'sent').length;
    
    // Return format "terkirim/total"
    return `${sentCount}/${messages.length}`;
  };

  // Function to delete message
  const deleteMessage = async (messageId: string) => {
    try {
      setDeleting(messageId);
      const userId = localStorage.getItem('user_id');
      const response = await fetch(`${API_URL}/drip/campaigns/${id}/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': userId || ''
        }
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Gagal menghapus pesan");
      }
      toast.success("Pesan berhasil dihapus");
      fetchCampaignData(id!);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  // Function to delete campaign
  const deleteCampaign = async () => {
    if (!id) return;
    
    try {
      setDeleting(id);
      const userId = localStorage.getItem('user_id');
      const response = await fetch(`${API_URL}/drip/campaigns/${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': userId,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Error deleting campaign: ${response.statusText}`);
      }
      
      toast.success("Campaign berhasil dihapus");
      navigate('/dashboard/drip-campaign');
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast.error("Gagal menghapus campaign");
    } finally {
      setDeleting(null);
    }
  };

  // Parse message content for formatting (e.g., bold, italic)
  const parseMessage = (content: string) => {
    if (!content) return "";
    
    // Replace *text* with <strong>text</strong> for bold
    let formattedText = content.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    
    // Replace _text_ with <em>text</em> for italic
    formattedText = formattedText.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Replace newlines with <br>
    formattedText = formattedText.replace(/\n/g, '<br>');
    
    return formattedText;
  };

  // Info section for campaign details
  const CampaignInfo = useMemo(() => {
    if (!campaign) return null;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informasi Umum</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Nama Campaign</dt>
                <dd className="text-lg font-semibold">{campaign.name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Deskripsi</dt>
                <dd>{campaign.description || "-"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                <dd>
                  <Badge variant={campaign.status === "Active" ? "default" : "secondary"}
                    className={campaign.status === "Active" ? "bg-green-600 hover:bg-green-700" : ""}>
                    {campaign.status || "Draft"}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Dibuat</dt>
                <dd>{formatDate(campaign.created_at)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Diperbarui</dt>
                <dd>{campaign.updated_at ? formatDate(campaign.updated_at) : "-"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Statistik</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Pesan</dt>
                <dd className="text-lg font-semibold">{messages.length}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Subscriber</dt>
                <dd className="text-lg font-semibold">{subscribers.length}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Log</dt>
                <dd className="text-lg font-semibold">{logs.length}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    );
  }, [campaign, messages.length, subscribers.length, logs.length]);

  // Messages section
  const MessagesSection = useMemo(() => {
    // Helper function untuk mendapatkan icon berdasarkan tipe media
    const getMediaIcon = (type: string) => {
      switch(type) {
        case 'image': return <ImageIcon className="h-4 w-4" />;
        case 'video': return <VideoIcon className="h-4 w-4" />;
        case 'document': return <FileText className="h-4 w-4" />;
        case 'audio': return <MusicIcon className="h-4 w-4" />;
        default: return <MessageSquare className="h-4 w-4" />;
      }
    };
    
    // Helper function untuk mendapatkan warna badge berdasarkan tipe media
    const getTypeColor = (type: string) => {
      switch(type) {
        case 'image': return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
        case 'video': return 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
        case 'document': return 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400';
        case 'audio': return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400';
        default: return 'bg-gray-50 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400';
      }
    };
    
    // Helper function untuk mendapatkan nama file dari path
    const getFileName = (path?: string) => {
      if (!path) return '';
      return path.split('/').pop() || 'file';
    };
    
    // Helper function untuk memformat delay dalam bentuk yang lebih user-friendly
    const formatDelay = (minutes: number) => {
      if (minutes < 60) return `${minutes} menit`;
      if (minutes % 60 === 0) return `${minutes / 60} jam`;
      if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)} hari`;
      return `${minutes} menit`;
    };
    
    // API URL untuk download file
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pesan Drip</CardTitle>
            <p className="text-sm text-gray-500">
              Urutan pesan yang akan dikirim ke subscriber.
              <span className="font-medium ml-1">({messages.length} pesan)</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/drip-campaign/edit/${id}`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit Pesan
          </Button>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Belum ada pesan drip. Gunakan halaman edit campaign untuk menambahkan pesan.
            </div>
          ) : (
            <div className="space-y-6">
              {messages.sort((a, b) => a.message_order - b.message_order).map((message, index) => (
                <div 
                  key={message.id} 
                  className={`
                    border rounded-lg p-5 relative
                    ${index % 2 === 0 ? 'bg-gray-50/30 dark:bg-gray-800/20' : ''}
                  `}
                >
                  <div className="flex flex-col gap-3">
                    {/* Header dengan Info Pesan */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="rounded-full bg-primary/10 text-primary border-primary/20"
                      >
                        Pesan #{message.message_order}
                      </Badge>
                      
                      <Badge 
                        variant="outline" 
                        className="rounded-full flex items-center gap-1"
                      >
                        <Clock className="h-3 w-3" />
                        {formatDelay(message.delay)}
                      </Badge>
                      
                      <Badge 
                        variant="outline" 
                        className={`rounded-full capitalize flex items-center gap-1 ${getTypeColor(message.type)}`}
                      >
                        {getMediaIcon(message.type)}
                        {message.type}
                      </Badge>
                    </div>
                    
                    {/* Konten Pesan */}
                    <div className="border-l-2 border-gray-200 dark:border-gray-700 pl-3 py-1 mt-1">
                      <div 
                        className="prose dark:prose-invert max-w-none text-base"
                        dangerouslySetInnerHTML={{ __html: parseMessage(message.message) }}
                      />
                    </div>
                    
                    {/* Media Info jika ada */}
                    {message.media_url && (
                      <div className="mt-1 flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-800/50 p-2 rounded-md">
                        <div className="flex-1 flex items-center gap-2">
                          {getMediaIcon(message.type)} 
                          <span className="truncate font-medium">{getFileName(message.media_url)}</span>
                        </div>
                        <a
                          href={`${apiUrl}/api/broadcast/media-proxy?path=${encodeURIComponent(message.media_url)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded-md text-xs flex items-center gap-1 transition-colors"
                          title="Download Media"
                        >
                          <DownloadCloud className="w-3.5 h-3.5" /> Download
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }, [messages, id, navigate]);

  // Logs section - NEW Card-based Layout
  const LogsSection = useMemo(() => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Log Aktivitas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mencatat setiap percobaan pengiriman pesan untuk campaign ini.
            <span className="font-medium ml-1">({logs.length} aktivitas)</span>
          </p>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p>Belum ada aktivitas tercatat.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-2">
                  <div className="flex-shrink-0 mt-0.5">
                    {log.status === "sent" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">{formatDate(log.sent_at)} : </span>
                    <span className={log.status === "sent" ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                      {log.status === 'sent' ? 'Terkirim' : 'Gagal'}
                    </span>
                    <span> → </span>
                    <span className="font-medium">{log.drip_subscribers?.contact_id || log.contact_id || 'N/A'}</span>
                    <span> → Pesan ke-{log.drip_messages?.message_order || 'N/A'}</span>
                    
                    {log.status === 'failed' && log.error_message && (
                      <div className="mt-1 text-xs text-red-500 dark:text-red-400">
                        Error: {log.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }, [logs]);

  // Function to toggle campaign status
  const toggleCampaignStatus = async () => {
    if (!id || !campaign) return;

    setIsUpdatingStatus(true);
    const newStatus = campaign.status === "Active" ? "Draft" : "Active";

    try {
      const userId = localStorage.getItem('user_id');
      const response = await fetch(`${API_URL}/drip/campaigns/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId || '',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Gagal mengubah status campaign menjadi ${newStatus}`);
      }

      setCampaign(prev => prev ? { ...prev, status: newStatus, updated_at: new Date().toISOString() } : null);
      toast.success(`Campaign berhasil di${newStatus === "Active" ? "aktifkan" : "nonaktifkan"}.`);
    } catch (error) {
      console.error("Error updating campaign status:", error);
      toast.error("Gagal mengubah status campaign: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Function to delete a subscriber
  const deleteSubscriber = async (subscriberId: string) => {
    const toastId = toast.loading("Menghapus subscriber...");
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast.error("User ID tidak ditemukan.", { id: toastId });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/drip/subscribers/${subscriberId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': userId
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: `Gagal menghapus subscriber. Status: ${response.status}` 
        }));
        throw new Error(errorData.error);
      }
      
      toast.success("Subscriber berhasil dihapus", { id: toastId });
      // Refresh data
      fetchCampaignData(id);

    } catch (error: any) {
      console.error('Error deleting subscriber:', error);
      toast.error(error.message || "Terjadi kesalahan saat menghapus.", { id: toastId });
    }
  };

  // --- LOGIKA TAMBAH KONTAK ---
  const handleAddContact = async () => {
    if (!newContactNumber.trim()) {
      return toast.error("Nomor kontak wajib diisi.");
    }
    if (!id) {
      return toast.error("ID Campaign tidak valid.");
    }
    
    // Gunakan nomor yang sudah diformat
    const contactIdToUse = formattedNumber || formatWhatsAppNumber(newContactNumber);
    
    setAddingContact(true);
    try {
      const userId = localStorage.getItem('user_id');
      const payload = {
        contact_id: contactIdToUse,
        metadata: metadata.reduce((acc, item) => {
          if (item.key) acc[item.key] = item.value;
          return acc;
        }, {} as Record<string, any>),
      };
      const response = await fetch(`${API_URL}/drip/campaigns/${id}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId || '',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Gagal menambahkan subscriber");
      }
      
      toast.success("Kontak berhasil ditambahkan sebagai subscriber");
      // Reset form dan tutup modal
      setNewContactNumber("");
      setNewContactName("");
      setMetadata([{key: "contact_name", value: ""}]);
      setFormattedNumber("");
      setIsAddContactModalOpen(false);
      
      // Refresh daftar subscriber
      fetchCampaignData(id);
    } catch (error) {
      toast.error((error instanceof Error) ? error.message : "Terjadi kesalahan");
    } finally {
      setAddingContact(false);
    }
  };

  // Fungsi untuk menambah field metadata baru
  const addMetadataField = () => {
    setMetadata([...metadata, {key: "", value: ""}]);
  };

  // Fungsi untuk update metadata
  const updateMetadata = (index: number, field: 'key' | 'value', value: string) => {
    const newMetadata = [...metadata];
    newMetadata[index][field] = value;
    setMetadata(newMetadata);
  };

  // Fungsi untuk menghapus field metadata
  const removeMetadataField = (index: number) => {
    if (metadata.length <= 1) return;
    const newMetadata = [...metadata];
    newMetadata.splice(index, 1);
    setMetadata(newMetadata);
  };

  // Fungsi untuk memperbaiki format nomor WhatsApp
  const formatWhatsAppNumber = (input: string): string => {
    // Hapus semua karakter non-digit
    let cleaned = input.replace(/\D/g, '');
    
    // Jika dimulai dengan 0, ganti dengan 62 (khusus nomor Indonesia)
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.substring(1);
    }
    
    // Tidak perlu menambahkan 62 ke nomor lain agar mendukung nomor internasional
    return cleaned;
  };

  // Fungsi untuk melihat progress pesan subscriber
  const viewSubscriberProgress = (subscriber: DripSubscriber) => {
    setSelectedSubscriber(subscriber);
    
    // Dapatkan semua pesan dari campaign
    const campaignMessages = [...messages].sort((a, b) => a.message_order - b.message_order);
    
    // Filter log untuk subscriber ini
    const subscriberLogs = logs.filter(
      log => log.drip_subscribers?.id === subscriber.id || log.contact_id === subscriber.contact_id
    );
    
    // Buat array progress untuk setiap pesan
    const progress: MessageProgress[] = campaignMessages.map(message => {
      // Cari log untuk pesan ini
      const messageLog = subscriberLogs.find(
        log => log.drip_message_id === message.id || 
              (log.drip_messages?.id === message.id)
      );
      
      if (messageLog) {
        // Pesan sudah diproses (berhasil atau gagal)
        return {
          messageId: message.id,
          messageOrder: message.message_order,
          messageContent: message.message,
          status: messageLog.status,
          sentAt: messageLog.sent_at,
          errorMessage: messageLog.error_message
        };
      } else {
        // Pesan belum diproses (pending)
        return {
          messageId: message.id,
          messageOrder: message.message_order,
          messageContent: message.message,
          status: 'pending'
        };
      }
    });
    
    setSubscriberProgress(progress);
    setIsProgressDialogOpen(true);
  };

  // --- LOGIKA BARU: ENROLL SEGMENT ---
  const handleEnrollSegment = async (contactNumbers: string[]) => {
    if (!id) return;
    setIsEnrolling(true);
    toast.loading("Mendaftarkan kontak dari segmen...");

    try {
      const userId = localStorage.getItem('user_id');
      const response = await fetch(`${API_URL}/drip/campaigns/${id}/enroll-segment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId || '',
        },
        body: JSON.stringify({ contacts: contactNumbers })
      });

      const result = await response.json();
      toast.dismiss();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal mendaftarkan segmen");
      }
      
      const { enrolledCount, alreadyExistsCount, totalSegmentContacts } = result;
      toast.success("Proses pendaftaran selesai!", {
        description: `${enrolledCount} kontak baru didaftarkan. ${alreadyExistsCount} kontak sudah ada sebelumnya. Total kontak di segmen: ${totalSegmentContacts}.`,
      });

      // Refresh daftar subscriber untuk menampilkan data baru
      fetchCampaignData(id);

    } catch (error) {
      toast.dismiss();
      toast.error((error instanceof Error) ? error.message : "Terjadi kesalahan saat pendaftaran");
    } finally {
      setIsEnrolling(false);
    }
  };

  // Function to get sorted subscribers with pagination
  const paginatedSubscribers = useMemo(() => {
    // Sortir subscribers berdasarkan status dan tanggal
    const sortedSubscribers = [...subscribers].sort((a, b) => {
      // Prioritaskan status active
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      
      // Jika keduanya completed, atau keduanya bukan active, sortir berdasarkan tanggal terbaru
      if (a.status === 'completed' && b.status === 'completed') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      
      // Jika keduanya bukan active dan bukan completed, sortir berdasarkan tanggal
      if (a.status !== 'active' && b.status !== 'active' && 
          a.status !== 'completed' && b.status !== 'completed') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      
      // Taruh completed di bawah
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      
      // Default sort by date
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    // Hitung total halaman
    const totalPages = Math.ceil(sortedSubscribers.length / itemsPerPage);
    
    // Pastikan current page valid
    const validCurrentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
    if (validCurrentPage !== currentPage) {
      setCurrentPage(validCurrentPage);
    }
    
    // Ambil data untuk halaman saat ini
    const startIndex = (validCurrentPage - 1) * itemsPerPage;
    const paginatedData = sortedSubscribers.slice(startIndex, startIndex + itemsPerPage);
    
    return {
      data: paginatedData,
      totalItems: sortedSubscribers.length,
      totalPages: totalPages,
      currentPage: validCurrentPage
    };
  }, [subscribers, currentPage, itemsPerPage]);

  // Pagination component
  const PaginationControls = () => {
    if (paginatedSubscribers.totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-500">
          Menampilkan {paginatedSubscribers.data.length} dari {paginatedSubscribers.totalItems} subscriber
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm">
            Halaman {currentPage} dari {paginatedSubscribers.totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(paginatedSubscribers.totalPages, prev + 1))}
            disabled={currentPage === paginatedSubscribers.totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-10 w-10 animate-spin mb-4" />
        <p>Memuat data campaign...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-xl mb-2">Campaign tidak ditemukan</p>
        <Button onClick={() => navigate('/dashboard/drip-campaign')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali ke Daftar Campaign
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/drip-campaign')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => navigate(`/dashboard/drip-campaign/edit/${id}`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit Campaign
          </Button>
          
          {campaign && (
            <Button
              variant={campaign.status === "Active" ? "destructive" : "default"} 
              onClick={toggleCampaignStatus}
              disabled={isUpdatingStatus}
              className={campaign.status === "Active" ? "bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700" : "bg-green-600 hover:bg-green-700"}
            >
              {isUpdatingStatus ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : campaign.status === "Active" ? (
                <Pause className="mr-2 h-4 w-4" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {isUpdatingStatus ? "Memperbarui..." : campaign.status === "Active" ? "Nonaktifkan" : "Aktifkan Campaign"}
            </Button>
          )}
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Hapus Campaign
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Konfirmasi Hapus</AlertDialogTitle>
                <AlertDialogDescription>
                  Apakah Anda yakin ingin menghapus campaign "{campaign.name}"?
                  <br />
                  Tindakan ini tidak dapat dibatalkan dan akan menghapus semua pesan dan subscriber.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={deleteCampaign}
                  disabled={deleting === id}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleting === id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Menghapus...
                    </>
                  ) : "Hapus"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full md:w-auto grid-cols-4 md:inline-flex">
          <TabsTrigger value="details">Detail</TabsTrigger>
          <TabsTrigger value="messages">Pesan Drip</TabsTrigger>
          <TabsTrigger value="subscribers">Subscriber</TabsTrigger>
          <TabsTrigger value="logs">Log</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="details">
            {CampaignInfo}
          </TabsContent>
          <TabsContent value="messages">
            {MessagesSection}
          </TabsContent>
          <TabsContent value="subscribers">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Kontak Terdaftar</CardTitle>
                  <p className="text-sm text-gray-500">
                    Daftar kontak yang mengikuti alur drip campaign ini.
                    <span className="font-medium ml-1">({subscribers.length} kontak)</span>
                  </p>
                </div>
                <div className="flex gap-2">
                   <EnrollSegmentModal
                    campaign={campaign}
                    onEnroll={handleEnrollSegment}
                    triggerButton={
                      <Button variant="outline" size="sm" disabled={isEnrolling || campaign?.status !== 'Active' || !campaign?.segment_id}>
                         {isEnrolling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Daftarkan Segmen
                      </Button>
                    }
                  />

                   <Button variant="outline" size="sm" onClick={() => fetchCampaignData(id!)} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => setIsAddContactModalOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Tambah Kontak
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50 dark:bg-gray-800/50">
                      <TableHead className="font-medium">Contact ID</TableHead>
                      <TableHead className="font-medium">Terdaftar Pada</TableHead>
                      <TableHead className="font-medium">Metadata</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium">Progress</TableHead>
                      <TableHead className="font-medium">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSubscribers.data.map((subscriber, index) => (
                      <TableRow key={subscriber.id} className={`
                        hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors
                        ${index % 2 === 0 ? '' : 'bg-gray-50/30 dark:bg-gray-800/20'}
                        ${subscriber.status === 'active' ? 'bg-green-50/40 dark:bg-green-900/10' : ''}
                      `}>
                        <TableCell className="font-medium">{subscriber.contact_id}</TableCell>
                        <TableCell className="text-gray-600 dark:text-gray-400">{formatDate(subscriber.created_at)}</TableCell>
                        <TableCell>{formatMetadata(subscriber.metadata)}</TableCell>
                        <TableCell>
                          <Badge variant={subscriber.status === "active" ? "default" : "secondary"}
                            className={`
                              px-3 py-1 rounded-full text-xs font-medium
                              ${subscriber.status === "active" 
                                ? "bg-green-500 text-white hover:bg-green-600" 
                                : subscriber.status === "completed" 
                                  ? "bg-blue-500 text-white hover:bg-blue-600" 
                                  : ""}
                            `}>
                            {subscriber.status || "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-center">
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="rounded-full h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                              onClick={() => viewSubscriberProgress(subscriber)}
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                            <div className="mt-1 text-xs font-medium">
                              {getProgressSummary(subscriber.id, subscriber.contact_id)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="rounded-full h-8 w-8 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                disabled={deletingSubscriber === subscriber.id}
                              >
                                {deletingSubscriber === subscriber.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Konfirmasi Hapus Subscriber</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Apakah Anda yakin ingin menghapus subscriber ini dari campaign?
                                  Tindakan ini tidak dapat dibatalkan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteSubscriber(subscriber.id)}
                                  disabled={deletingSubscriber === subscriber.id}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {deletingSubscriber === subscriber.id ? "Menghapus..." : "Hapus"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Pagination Controls */}
                <PaginationControls />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="logs">
            {LogsSection}
          </TabsContent>
        </div>
      </Tabs>

      {/* MODAL TAMBAH KONTAK */}
      <Dialog open={isAddContactModalOpen} onOpenChange={val => {
        setIsAddContactModalOpen(val);
        if (!val) {
          // Reset form saat dialog ditutup
          setNewContactNumber("");
          setFormattedNumber("");
          setMetadata([{key: "contact_name", value: ""}]);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tambah Subscriber Baru</DialogTitle>
            <DialogDescription>
              Kontak ini akan langsung ditambahkan sebagai subscriber ke campaign ini dengan data tambahan yang fleksibel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* Nomor WhatsApp */}
            <div>
              <Label htmlFor="newContactNumber">ID Kontak / Nomor WhatsApp *</Label>
              <Input 
                id="newContactNumber" 
                value={newContactNumber} 
                onChange={e => {
                  const inputValue = e.target.value;
                  setNewContactNumber(inputValue);
                  // Format dan update state untuk nomor yang sudah diformat
                  const formatted = formatWhatsAppNumber(inputValue);
                  setFormattedNumber(formatted);
                }} 
                placeholder="Masukkan ID kontak atau nomor WhatsApp"
                className="mt-2"
              />
              {newContactNumber && formattedNumber && (
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Format yang akan disimpan:</span> {formattedNumber}
                  {newContactNumber !== formattedNumber && (
                    <div className="mt-0.5">
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        * Format otomatis mengubah nomor Indonesia (awalan 0) menjadi format internasional (62)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="space-y-3">
              <Label>Data Tambahan (Metadata)</Label>
              
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                {metadata.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
                    <Input
                      placeholder="Nama Field"
                      value={item.key}
                      onChange={e => updateMetadata(index, 'key', e.target.value)}
                    />
                    <Input
                      placeholder="Nilai Field"
                      value={item.value}
                      onChange={e => updateMetadata(index, 'value', e.target.value)}
                    />
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeMetadataField(index)}
                      disabled={metadata.length <= 1}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              
              {/* Tambah Field Button */}
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={addMetadataField}
                className="w-full flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" /> Tambah Field
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddContactModalOpen(false)}>Batal</Button>
            <Button onClick={handleAddContact} disabled={addingContact}>
              {addingContact ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Tambah Subscriber"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG PROGRESS PESAN */}
      <Dialog open={isProgressDialogOpen} onOpenChange={setIsProgressDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Status Pesan Drip untuk {selectedSubscriber?.contact_id}
            </DialogTitle>
            <DialogDescription>
              Menampilkan status pengiriman setiap pesan untuk subscriber ini.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {subscriberProgress.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground">
                  Tidak ada pesan dalam campaign ini.
                </div>
              ) : (
                subscriberProgress.map((progress, index) => (
                  <div 
                    key={progress.messageId} 
                    className={`
                      relative border-l-4 pl-4 pb-4 ${index !== subscriberProgress.length - 1 ? 'before:absolute before:left-[-5px] before:top-6 before:h-full before:w-[2px] before:bg-gray-200 dark:before:bg-gray-700' : ''}
                      ${progress.status === 'sent' 
                        ? 'border-l-green-500' 
                        : progress.status === 'failed'
                          ? 'border-l-red-500'
                          : 'border-l-gray-300 dark:border-l-gray-600'}
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`
                            rounded-full p-1 
                            ${progress.status === 'sent' 
                              ? 'bg-green-100 text-green-500 dark:bg-green-900/30 dark:text-green-400' 
                              : progress.status === 'failed' 
                                ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400' 
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}
                          `}>
                          {progress.status === 'sent' ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : progress.status === 'failed' ? (
                            <XCircle className="h-5 w-5" />
                          ) : (
                            <Clock3 className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            Pesan #{progress.messageOrder}
                            <Badge 
                              variant={
                                progress.status === 'sent' 
                                  ? 'default' 
                                  : progress.status === 'failed' 
                                    ? 'destructive' 
                                    : 'secondary'
                              }
                              className={`
                                ml-2 px-2 py-0 text-xs rounded-full
                                ${progress.status === 'sent' ? 'bg-green-500' : ''}
                              `}
                            >
                              {progress.status === 'sent' 
                                ? 'Terkirim' 
                                : progress.status === 'failed' 
                                  ? 'Gagal' 
                                  : 'Menunggu'}
                            </Badge>
                          </div>
                          <div className="text-sm mt-1 text-gray-600 dark:text-gray-300">
                            {progress.messageContent.length > 80
                              ? `${progress.messageContent.substring(0, 80)}...`
                              : progress.messageContent}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {progress.sentAt && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 pl-8">
                        Dikirim pada: {formatDate(progress.sentAt)}
                      </div>
                    )}
                    
                    {progress.status === 'failed' && progress.errorMessage && (
                      <div className="mt-2 text-xs bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400 p-2 rounded-md ml-8">
                        <strong>Error:</strong> {progress.errorMessage}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProgressDialogOpen(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 