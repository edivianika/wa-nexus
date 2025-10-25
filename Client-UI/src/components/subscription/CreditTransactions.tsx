import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface CreditTransaction {
  id: string;
  amount: number;
  balance_after: number;
  description: string;
  transaction_type: string;
  status: string;
  created_at: string;
}

export function CreditTransactions() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      
      // Dapatkan user ID dari session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User tidak ditemukan");
      }
      
      // Panggil API untuk mendapatkan riwayat transaksi
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/billing/credit/transactions`, {
        headers: {
          'x-user-id': user.id
        }
      });
      
      if (!response.ok) {
        throw new Error("Gagal mengambil data transaksi");
      }
      
      const data = await response.json();
      if (data.success) {
        setTransactions(data.data);
      } else {
        throw new Error(data.message || "Gagal mengambil data transaksi");
      }
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
      setError(err.message || 'Terjadi kesalahan saat memuat riwayat transaksi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd MMM yyyy HH:mm');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Memuat Riwayat Transaksi
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
        <CardTitle>Riwayat Transaksi</CardTitle>
        <CardDescription>
          Riwayat transaksi kredit Anda
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            Belum ada transaksi
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    {formatDate(transaction.created_at)}
                  </TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline"
                      className={
                        transaction.transaction_type === 'topup' ? 'bg-green-100 text-green-800' : 
                        transaction.transaction_type === 'subscription' ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'
                      }
                    >
                      {transaction.transaction_type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">
                      {transaction.amount > 0 ? (
                        <ArrowUpRight className="h-4 w-4 mr-1 text-green-500" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4 mr-1 text-red-500" />
                      )}
                      <span className={transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(transaction.amount)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
} 