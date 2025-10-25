import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

interface Contact {
  id: number;
  contact_name: string | null;
  phone_number: string;
}

interface DripCampaign {
  id: string;
  name: string;
  description?: string;
}

interface AddContactToCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onEnrolled: () => void; // Callback to refresh contact data
}

export function AddContactToCampaignModal({ isOpen, onClose, contact, onEnrolled }: AddContactToCampaignModalProps) {
  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCampaigns();
    }
  }, [isOpen]);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      // Get user ID from localStorage
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please log in again.");
        return;
      }

      const response = await fetch(`${API_URL}/drip/campaigns`, {
        headers: {
          'x-user-id': userId
        }
      });
      if (!response.ok) throw new Error("Gagal memuat daftar campaign.");
      const data = await response.json();
      if (data.success) {
        setCampaigns(data.campaigns || []);
      } else {
        throw new Error(data.error || "Gagal memuat data campaign.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCampaign = (campaignId: string, isSelected: boolean) => {
    const newSelection = new Set(selectedCampaigns);
    if (isSelected) {
      newSelection.add(campaignId);
    } else {
      newSelection.delete(campaignId);
    }
    setSelectedCampaigns(newSelection);
  };

  const handleSubmit = async () => {
    if (!contact || selectedCampaigns.size === 0) {
      return toast.warning("Pilih setidaknya satu campaign.");
    }

    // Get user ID from localStorage
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast.error("User ID not found. Please log in again.");
      return;
    }

    setIsSubmitting(true);
    const promises = Array.from(selectedCampaigns).map(campaignId => {
      return fetch(`${API_URL}/drip/campaigns/${campaignId}/subscribers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          contact_id: contact.id,
          metadata: { contact_name: contact.contact_name || '' },
          should_schedule: true
        }),
      });
    });

    const results = await Promise.allSettled(promises);
    
    let successCount = 0;
    let failedCount = 0;

    results.forEach((result, index) => {
      const campaignId = Array.from(selectedCampaigns)[index];
      const campaignName = campaigns.find(c => c.id === campaignId)?.name || campaignId;
      if (result.status === 'fulfilled' && result.value.ok) {
        successCount++;
      } else {
        failedCount++;
        let errorMessage = `Gagal menambahkan ke campaign "${campaignName}".`;
        if (result.status === 'fulfilled') {
            result.value.json().then(err => {
                toast.error(`${errorMessage} Error: ${err.error || 'Unknown error'}`);
            }).catch(() => {
                toast.error(errorMessage);
            });
        } else {
             toast.error(errorMessage);
        }
      }
    });

    if (successCount > 0) {
      toast.success(`${contact.contact_name || contact.phone_number} berhasil ditambahkan ke ${successCount} campaign.`);
    }

    if (failedCount === 0) {
      onClose(); // Close modal only if all succeed
    }
    
    onEnrolled(); // Refresh parent component data
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Tambah Kontak ke Drip Campaign</DialogTitle>
          <DialogDescription>
            Pilih campaign untuk menambahkan kontak "{contact?.contact_name || contact?.phone_number}".
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-24">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-start space-x-3 p-2 rounded-md hover:bg-muted/50">
                  <Checkbox
                    id={campaign.id}
                    checked={selectedCampaigns.has(campaign.id)}
                    onCheckedChange={(checked) => handleSelectCampaign(campaign.id, !!checked)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label htmlFor={campaign.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {campaign.name}
                    </label>
                    {campaign.description && (
                      <p className="text-xs text-muted-foreground mt-1">{campaign.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isLoading || selectedCampaigns.size === 0}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 