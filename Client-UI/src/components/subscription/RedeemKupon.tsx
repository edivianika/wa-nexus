import { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface RedeemKuponProps {
  onSuccess?: () => void;
}

export function RedeemKupon({ onSuccess }: RedeemKuponProps) {
  const [kode, setKode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRedeemKupon = async () => {
    if (!kode.trim()) {
      toast.error('Silakan masukkan kode kupon');
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('redeem_kupon', { 
        kode_kupon: kode.trim() 
      });
      
      if (error) {
        throw error;
      }

      if (data.success) {
        toast.success(data.message);
        setKode('');
        // Refresh auth session untuk mendapatkan metadata baru
        await supabase.auth.refreshSession();
        // Panggil callback jika ada
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(data.message || 'Gagal menggunakan kupon');
      }
    } catch (err: any) {
      console.error('Error redeeming coupon:', err);
      toast.error(err.message || 'Terjadi kesalahan saat menukarkan kupon');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tukarkan Kupon</CardTitle>
        <CardDescription>
          Masukkan kode kupon untuk mengupgrade akun Anda
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4">
          <Input
            placeholder="Masukkan kode kupon (contoh: ABCD-EFGH-IJKL)"
            value={kode}
            onChange={(e) => setKode(e.target.value)}
            disabled={isLoading}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={handleRedeemKupon} 
          disabled={isLoading || !kode.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memproses...
            </>
          ) : (
            'Tukarkan Kupon'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
} 