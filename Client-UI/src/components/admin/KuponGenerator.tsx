import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, TicketIcon } from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { format } from "date-fns";

interface Kupon {
  id: string;
  kode: string;
  tipe: string;
  durasi_hari: number;
  device_limit: number;
  is_used: boolean;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export function KuponGenerator() {
  const [tipe, setTipe] = useState('premium');
  const [durasi, setDurasi] = useState(30);
  const [jumlah, setJumlah] = useState(5);
  const [deviceLimit, setDeviceLimit] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [kupons, setKupons] = useState<Kupon[]>([]);
  const [isLoadingKupons, setIsLoadingKupons] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Verify if user is authorized (email is akhivian@gmail.com)
  useEffect(() => {
    const checkAuthorization = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && user.email === 'akhivian@gmail.com') {
        setIsAuthorized(true);
        loadKupons();
      } else {
        setIsAuthorized(false);
      }
    };

    checkAuthorization();
  }, []);

  const loadKupons = async () => {
    try {
      setIsLoadingKupons(true);
      // @ts-ignore - Ignore TypeScript error for Supabase schema definition
      const { data, error } = await supabase
        .from('kupons')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (error) {
        throw error;
      }
      
      // @ts-ignore - Tipe data response dari Supabase tidak sesuai dengan definisi interface
      setKupons(data || []);
    } catch (err: any) {
      console.error('Error loading coupons:', err);
      toast.error('Gagal memuat daftar kupon');
    } finally {
      setIsLoadingKupons(false);
    }
  };

  const handleGenerateKupons = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('generate_kupon', {
        jumlah,
        tipe,
        durasi_hari: durasi,
        device_limit: deviceLimit
      });
      
      if (error) {
        console.error('Error detail:', error);
        throw error;
      }
      
      toast.success(`${jumlah} kupon berhasil dibuat`);
      loadKupons();
    } catch (err: any) {
      console.error('Error generating coupons:', err);
      toast.error(err.message || 'Gagal membuat kupon');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (kode: string, id: string) => {
    navigator.clipboard.writeText(kode);
    setCopiedId(id);
    toast.success('Kode kupon disalin ke clipboard');
    
    // Reset copied status after 2 seconds
    setTimeout(() => {
      setCopiedId('');
    }, 2000);
  };

  if (!isAuthorized) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Akses Ditolak</CardTitle>
          <CardDescription>
            Anda tidak memiliki izin untuk mengakses halaman ini.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TicketIcon className="h-5 w-5" />
            Generate Kupon
          </CardTitle>
          <CardDescription>
            Buat kupon untuk pelanggan premium. Kupon dapat digunakan untuk meng-upgrade akun.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tipe">Tipe Langganan</Label>
                <Select 
                  value={tipe} 
                  onValueChange={setTipe}
                >
                  <SelectTrigger id="tipe">
                    <SelectValue placeholder="Pilih tipe langganan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="durasi">Durasi (hari)</Label>
                <Select 
                  value={durasi.toString()} 
                  onValueChange={(val) => setDurasi(parseInt(val))}
                >
                  <SelectTrigger id="durasi">
                    <SelectValue placeholder="Pilih durasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 hari</SelectItem>
                    <SelectItem value="30">30 hari</SelectItem>
                    <SelectItem value="90">90 hari</SelectItem>
                    <SelectItem value="180">180 hari</SelectItem>
                    <SelectItem value="365">365 hari</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deviceLimit">Batas Device</Label>
                <Select 
                  value={deviceLimit.toString()} 
                  onValueChange={(val) => setDeviceLimit(parseInt(val))}
                >
                  <SelectTrigger id="deviceLimit">
                    <SelectValue placeholder="Pilih batas device" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 device</SelectItem>
                    <SelectItem value="3">3 devices</SelectItem>
                    <SelectItem value="5">5 devices</SelectItem>
                    <SelectItem value="10">10 devices</SelectItem>
                    <SelectItem value="20">20 devices</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="jumlah">Jumlah Kupon</Label>
                <Input 
                  id="jumlah" 
                  type="number" 
                  value={jumlah} 
                  min={1}
                  max={100}
                  onChange={(e) => setJumlah(parseInt(e.target.value))} 
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            disabled={isLoading} 
            onClick={handleGenerateKupons}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Kupon'
            )}
          </Button>
        </CardFooter>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Daftar Kupon</CardTitle>
          <CardDescription>
            {isLoadingKupons 
              ? 'Memuat daftar kupon...' 
              : `${kupons.length} kupon terbaru`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingKupons ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : kupons.length > 0 ? (
            <Table>
              <TableCaption>Daftar kupon yang telah dibuat</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kupons.map((kupon) => (
                  <TableRow key={kupon.id}>
                    <TableCell className="font-medium">
                      {kupon.kode}
                    </TableCell>
                    <TableCell>
                      <span className="capitalize">{kupon.tipe}</span>
                    </TableCell>
                    <TableCell>{kupon.durasi_hari} hari</TableCell>
                    <TableCell>{kupon.device_limit} device</TableCell>
                    <TableCell>
                      <span className={kupon.is_used ? 'text-red-500' : 'text-green-500'}>
                        {kupon.is_used ? 'Terpakai' : 'Available'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {format(new Date(kupon.created_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(kupon.kode, kupon.id)}
                        disabled={kupon.is_used}
                      >
                        {copiedId === kupon.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada kupon yang dibuat
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 