import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Eye, Trash2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { SubscriptionBanner } from "@/components/subscription/SubscriptionBanner";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";

// API URL
const API_URL = import.meta.env.VITE_API_URL ;


// Interface for campaign data
interface DripCampaign {
  id: string;
  name: string;
  description?: string;
  segment?: string;
  status?: string;
  created_at: string;
  updated_at?: string;
}

interface SubscriptionLimits {
  drip_campaigns?: number;
}

export default function DripCampaignPage() {
  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const navigate = useNavigate();
  
  // Check subscription status
  const { isExpired } = useSubscriptionStatus();

  // Fetch campaigns on component mount
  useEffect(() => {
    fetchSubscriptionLimits();
    fetchCampaigns();
  }, []);

  const fetchSubscriptionLimits = async () => {
    try {
      const { data, error } = await supabase.rpc('get_subscription_status');
      if (error) throw error;
      if (data && data.limits) {
        setLimits(data.limits);
      }
    } catch (err: any) {
      toast.error('Gagal memuat batas langganan.');
      console.error(err);
    }
  };

  // Function to fetch campaigns from API
  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please login again.");
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/drip/campaigns`, {
        headers: {
          'x-user-id': userId
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      // Menyesuaikan dengan format respons API baru
      if (data.success) {
        setCampaigns(data.campaigns || []);
      } else {
        throw new Error(data.error || "Gagal memuat data");
      }
    } catch (error) {
      console.error("Error fetching drip campaigns:", error);
      toast.error("Gagal memuat daftar campaign");
    } finally {
      setLoading(false);
    }
  };

  // Function to delete a campaign
  const deleteCampaign = async (id: string) => {
    try {
      setDeleting(id);
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please login again.");
        setDeleting(null);
        return;
      }

      const response = await fetch(`${API_URL}/drip/campaigns/${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': userId
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        // Remove the deleted campaign from the state
        setCampaigns(campaigns.filter(c => c.id !== id));
        toast.success(data.message || "Campaign berhasil dihapus");
      } else {
        throw new Error(data.error || "Gagal menghapus campaign");
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      toast.error("Gagal menghapus campaign");
    } finally {
      setDeleting(null);
    }
  };

  // Function to view campaign details
  const viewCampaignDetails = (id: string) => {
    navigate(`/dashboard/drip-campaign/${id}`);
  };

  // Format date
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

  const campaignLimit = limits?.drip_campaigns;
  const canCreateCampaign = !isExpired && (campaignLimit === -1 || (campaignLimit !== undefined && campaigns.length < campaignLimit));

  return (
    <div className="space-y-6">
      {/* Expired Trial Banner */}
      <SubscriptionBanner />
      
      <div className="flex justify-between items-center">
        <div>
        <h1 className="text-2xl font-bold tracking-tight">Drip Campaign</h1>
          <p className="text-muted-foreground mt-1">Manage automated message sequences sent over time</p>
        </div>
        <CardHeader className="flex flex-row items-center justify-between">
          
          {canCreateCampaign ? (
            <Button onClick={() => navigate("/dashboard/drip-campaign/create")}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Buat Campaign Baru
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block">
                    <Button disabled>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      {isExpired ? 'Trial Expired' : 'Buat Campaign Baru'}
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {isExpired 
                      ? 'Trial expired - Please upgrade to create campaigns'
                      : `Anda telah mencapai batas ${campaignLimit} Drip Campaign untuk paket Anda.`
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardHeader>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Memuat data...</span>
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                  <TableHead>Deskripsi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dibuat</TableHead>
                  <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada drip campaign</TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.description || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "Active" ? "default" : "secondary"} 
                          className={c.status === "Active" ? "bg-green-600 hover:bg-green-700" : ""}>
                          {c.status || "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(c.created_at)}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => viewCampaignDetails(c.id)}
                            title="Lihat detail"
                          >
                        <Eye className="h-4 w-4" />
                      </Button>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20"
                                title="Hapus campaign"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Konfirmasi Hapus</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Apakah Anda yakin ingin menghapus campaign "{c.name}"?
                                  <br />
                                  Tindakan ini tidak dapat dibatalkan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteCampaign(c.id)}
                                  disabled={deleting === c.id}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {deleting === c.id ? (
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 