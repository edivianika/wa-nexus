import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wallet } from "lucide-react";
import { TopUpGuide } from "./TopUpGuide";
import { Button } from "@/components/ui/button";

export function CreditBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCreditBalance = async () => {
    try {
      setIsLoading(true);
      
      // Dapatkan user ID dari session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User tidak ditemukan");
      }
      
      // Panggil API untuk mendapatkan saldo kredit
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/credit`, {
        headers: {
          'x-user-id': user.id
        }
      });
      
      if (!response.ok) {
        throw new Error("Gagal mengambil data saldo kredit");
      }
      
      const data = await response.json();
      if (data.success) {
        setBalance(data.data.balance);
      } else {
        throw new Error(data.message || "Gagal mengambil data saldo kredit");
      }
    } catch (err: any) {
      console.error('Error fetching credit balance:', err);
      setError(err.message || 'Terjadi kesalahan saat memuat saldo kredit');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditBalance();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Memuat Saldo Kredit
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Terjadi Kesalahan</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Wallet className="h-5 w-5 mr-2" />
          Saldo Kredit
        </CardTitle>
        <CardDescription>
          Kredit yang tersedia untuk berlangganan paket
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-2">
          <div className="text-3xl font-bold text-center">
            {balance !== null ? formatCurrency(balance) : 'Rp 0'}
          </div>
          <div className="text-sm text-center text-muted-foreground">
            Gunakan kredit untuk berlangganan paket
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <TopUpGuide>
          <Button variant="outline" className="w-full">
            <Wallet className="mr-2 h-4 w-4" />
            TopUp Kredit
          </Button>
        </TopUpGuide>
      </CardFooter>
    </Card>
  );
} 