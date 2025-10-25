import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Bold, Italic, Info, User, Briefcase, Building } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
const API_URL = API_SERVER_URL + '/api';

interface DripMessagePayload {
  message: string;
  delay: number;
  order: number;
  type?: string; // Default to 'text' or let backend handle
}

// Contoh metadata umum yang mungkin digunakan
const commonMetadataFields = [
  { key: "contact_name", label: "Nama Kontak", icon: <User className="h-3 w-3" /> },
  { key: "profession", label: "Profesi", icon: <Briefcase className="h-3 w-3" /> },
  { key: "company", label: "Perusahaan", icon: <Building className="h-3 w-3" /> },
];

export default function DripCampaignAddMessagePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();

  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [delay, setDelay] = useState<number>(1);
  const [order, setOrder] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (campaignId) {
      const fetchCampaignName = async () => {
        try {
          const response = await fetch(`${API_URL}/drip/campaigns/${campaignId}`);
          if (!response.ok) throw new Error("Gagal memuat detail campaign");
          const data = await response.json();
          if (data.success && data.campaign) {
            setCampaignName(data.campaign.name);
          }
        } catch (error) {
          console.error("Error fetching campaign name:", error);
        }
      };
      fetchCampaignName();
    }
  }, [campaignId]);

  const applyFormat = (format: "bold" | "italic") => {
    if (!textareaRef) return;
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    const selectedText = message.substring(start, end);
    let newText;
    if (format === "bold") {
      newText = `${message.substring(0, start)}*${selectedText}*${message.substring(end)}`;
    } else { // italic
      newText = `${message.substring(0, start)}_${selectedText}_${message.substring(end)}`;
    }
    setMessage(newText);
    // Focus back and adjust cursor position if needed
    textareaRef.focus();
    // Simple cursor adjustment, might need refinement for edge cases
    setTimeout(() => textareaRef.setSelectionRange(start + 1, end + 1), 0); 
  };

  // Fungsi untuk menyisipkan placeholder metadata
  const insertMetadataPlaceholder = (key: string) => {
    if (!textareaRef) return;
    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    
    // Buat placeholder dengan format {{key}}
    const placeholder = `{{${key}}}`;
    
    // Sisipkan placeholder pada posisi kursor
    const newText = `${message.substring(0, start)}${placeholder}${message.substring(end)}`;
    setMessage(newText);
    
    // Focus kembali ke textarea dan atur posisi kursor setelah placeholder
    textareaRef.focus();
    const newPosition = start + placeholder.length;
    setTimeout(() => textareaRef.setSelectionRange(newPosition, newPosition), 0);
    
    // Tampilkan toast informasi
    toast.info(`Placeholder metadata "${key}" ditambahkan`);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Isi pesan wajib diisi.");
      return;
    }
    if (delay < 0) {
      toast.error("Delay tidak boleh negatif.");
      return;
    }
     if (order <= 0) {
      toast.error("Order harus lebih besar dari 0.");
      return;
    }
    if (!campaignId) {
      toast.error("Campaign ID tidak ditemukan.");
      return;
    }

    setIsSubmitting(true);
    const payload: DripMessagePayload = {
      message,
      delay,
      order,
      type: "text", // Defaulting to text, can be expanded later
    };

    try {
      const response = await fetch(`${API_URL}/drip/campaigns/${campaignId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal menyimpan pesan drip.");
      }

      toast.success("Pesan drip berhasil ditambahkan.");
      // Navigate back to campaign detail page or message list
      navigate(`/dashboard/drip-campaign/${campaignId}`); 
    } catch (error) {
      console.error("Error saving drip message:", error);
      toast.error("Gagal menyimpan pesan: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate(`/dashboard/drip-campaign/${campaignId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tambah Pesan Drip</h1>
          {campaignName && <p className="text-muted-foreground">Untuk Campaign: {campaignName}</p>}
        </div>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Detail Pesan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="message">Isi Pesan *</Label>
              <div className="flex items-center gap-2 mb-2">
                <Button type="button" variant="outline" size="sm" onClick={() => applyFormat("bold")}><Bold className="h-4 w-4" /></Button>
                <Button type="button" variant="outline" size="sm" onClick={() => applyFormat("italic")}><Italic className="h-4 w-4" /></Button>
                
                <div className="h-6 border-l border-gray-300 mx-2"></div>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8">
                        <Info className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Sisipkan metadata subscriber dengan format {"{{key}}"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {commonMetadataFields.map((field) => (
                  <TooltipProvider key={field.key}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => insertMetadataPlaceholder(field.key)}
                        >
                          {field.icon} <span className="ml-1 text-xs">{field.label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">Sisipkan {`{{${field.key}}}`} ke pesan</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
              <Textarea
                id="message"
                ref={setTextareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ketik pesan Anda di sini... Gunakan *teks* untuk bold, _teks_ untuk italic, dan {{key}} untuk metadata subscriber."
                rows={6}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Gunakan placeholder {`{{key}}`} untuk menyisipkan metadata subscriber, contoh: Halo {`{{contact_name}}`}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="delay">Delay (hari setelah pesan sebelumnya/mulai campaign) *</Label>
                <Input
                  id="delay"
                  type="number"
                  value={delay}
                  onChange={(e) => setDelay(parseInt(e.target.value, 10))}
                  min="0"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Untuk pesan pertama, delay dihitung dari subscriber masuk. Untuk pesan berikutnya, dari pesan sebelumnya.
                </p>
              </div>
              <div>
                <Label htmlFor="order">Urutan Pesan *</Label>
                <Input
                  id="order"
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(parseInt(e.target.value, 10))}
                  min="1"
                  required
                />
                 <p className="text-xs text-muted-foreground mt-1">
                  Urutan pengiriman pesan dalam campaign.
                </p>
              </div>
            </div>
            
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan Pesan...
                </>
              ) : (
                "Simpan Pesan"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 