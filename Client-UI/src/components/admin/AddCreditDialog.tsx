import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
}

interface AddCreditDialogProps {
  user: User | null;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onCreditAdded: () => void;
}

export function AddCreditDialog({ user, isOpen, setIsOpen, onCreditAdded }: AddCreditDialogProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const creditOptions = [
    { value: "50000", label: "Rp 50.000" },
    { value: "100000", label: "Rp 100.000" },
    { value: "200000", label: "Rp 200.000" },
    { value: "400000", label: "Rp 400.000" },
    { value: "500000", label: "Rp 500.000" },
    { value: "1000000", label: "Rp 1.000.000" }
  ];

  const handleAddCredit = async () => {
    if (!user) return;

    const amountValue = parseInt(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error("Jumlah kredit harus dipilih");
      return;
    }

    if (!description.trim()) {
      toast.error("Deskripsi tidak boleh kosong");
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser();
      if (!adminUser) throw new Error("Admin tidak ditemukan");

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/credit/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': adminUser.id,
        },
        body: JSON.stringify({
          userId: user.id,
          amount: amountValue,
          description: description.trim()
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Gagal menambahkan kredit");
      }
      
      toast.success(`Berhasil menambahkan ${formatCurrency(amountValue)} kredit ke user ${user.email}`);
      setAmount("");
      setDescription("");
      onCreditAdded();
      setIsOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan');
    } finally {
      setIsLoading(false);
    }
  };
  
  const formatCurrency = (value: number | string) => {
    const numericValue = typeof value === 'string' ? parseInt(value) : value;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(numericValue);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Kredit untuk {user?.email}</DialogTitle>
          <DialogDescription>
            Pilih jumlah kredit dan berikan deskripsi untuk transaksi ini.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Jumlah Kredit</Label>
            <Select value={amount} onValueChange={setAmount}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih jumlah kredit" />
              </SelectTrigger>
              <SelectContent>
                {creditOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              placeholder="Contoh: Deposit manual via transfer bank"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
          <Button 
            onClick={handleAddCredit}
            disabled={isLoading || !amount || !description.trim()}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Tambah Kredit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 