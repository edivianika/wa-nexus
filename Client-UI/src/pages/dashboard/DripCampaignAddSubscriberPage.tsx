import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
const API_URL = API_SERVER_URL + '/api';

export default function DripCampaignAddSubscriberPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  
  const [contactIdentifier, setContactIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaignName, setCampaignName] = useState(""); // Optional: To display campaign name

  // Optional: Fetch campaign details to display name or for validation
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
          // Handle error silently or show a less intrusive toast
        }
      };
      fetchCampaignName();
    }
  }, [campaignId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!contactIdentifier.trim()) {
      toast.error("Identifier Kontak wajib diisi.");
      return;
    }
    if (!campaignId) {
      toast.error("Campaign ID tidak ditemukan.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/drip/campaigns/${campaignId}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Di sini, kita asumsikan `contactIdentifier` bisa berupa nomor telepon atau ID kontak yang sudah ada.
        // Backend perlu menangani ini. Untuk sekarang, kita kirim sebagai `contact_id`.
        // Jika sistem kontak lebih kompleks, Anda mungkin perlu lookup ID kontak berdasarkan nomor telepon dulu.
        body: JSON.stringify({ contact_id: contactIdentifier }), 
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Gagal menambahkan subscriber.");
      }

      toast.success(`Subscriber ${contactIdentifier} berhasil ditambahkan ke campaign.`);
      setContactIdentifier(""); // Clear input
      // Optional: Navigate back or to subscriber list for this campaign
      // navigate(`/dashboard/drip-campaign/${campaignId}`); 
    } catch (error) {
      console.error("Error adding subscriber:", error);
      toast.error("Gagal menambahkan subscriber: " + (error instanceof Error ? error.message : String(error)));
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
          <h1 className="text-2xl font-bold tracking-tight">Tambah Subscriber</h1>
          {campaignName && <p className="text-muted-foreground">Untuk Campaign: {campaignName}</p>}
        </div>
      </div>

      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Masukkan Detail Subscriber</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="contactIdentifier">Nomor Telepon / ID Kontak *</Label>
              <Input 
                id="contactIdentifier"
                value={contactIdentifier}
                onChange={(e) => setContactIdentifier(e.target.value)}
                placeholder="Contoh: 628123456789 atau ID_Kontak_Unik"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Masukkan nomor telepon lengkap dengan kode negara (misal 62) atau ID kontak yang sudah ada.
              </p>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Simpan Subscriber"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 