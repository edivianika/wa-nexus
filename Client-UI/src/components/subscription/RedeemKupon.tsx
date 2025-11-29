import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface RedeemKuponProps {
  onSuccess?: () => void;
}

export function RedeemKupon({ onSuccess }: RedeemKuponProps) {
  const [kode, setKode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    
    getUser();
  }, []);

  const handleRedeemKupon = async () => {
    if (!kode.trim()) {
      toast.error('Silakan masukkan kode kupon');
      return;
    }

    if (!user) {
      toast.error('Silakan login terlebih dahulu');
      return;
    }

    if (!user.email) {
      toast.error('Email user tidak ditemukan');
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('redeem_coupon_new', {
        kode_kupon: kode.trim(),
        user_email: user.email
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
        // Handle different error codes
        let errorMessage = data.message || 'Gagal menggunakan kupon';
        
        switch (data.error_code) {
          case 'COUPON_ALREADY_USED':
            errorMessage = 'Kode kupon sudah digunakan';
            break;
          case 'COUPON_EXPIRED':
            errorMessage = 'Kode kupon sudah expired';
            break;
          case 'COUPON_NOT_FOUND':
            errorMessage = 'Kode kupon tidak valid';
            break;
          case 'USER_LIMIT_EXCEEDED':
            errorMessage = 'Anda sudah menggunakan kupon dalam 30 hari terakhir';
            break;
          case 'UNAUTHENTICATED':
            errorMessage = 'Silakan login kembali';
            break;
          case 'INVALID_INPUT':
            errorMessage = 'Kode kupon tidak boleh kosong';
            break;
          default:
            errorMessage = data.message || 'Terjadi kesalahan saat menukarkan kupon';
        }
        
        toast.error(errorMessage);
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