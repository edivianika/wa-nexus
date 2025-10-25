import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  limits: Record<string, any>;
  features: Record<string, boolean>;
}

interface GroupedPlan {
  baseName: string;
  plans: Plan[];
}

interface PlanSelectorProps {
  onSubscribe?: () => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export function PlanSelector({ onSubscribe }: PlanSelectorProps) {
  const [plans, setPlans] = useState<GroupedPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const groupAndSortPlans = (plans: Plan[]): GroupedPlan[] => {
    const planGroups: Record<string, Plan[]> = {};
    
    plans.forEach(plan => {
      const baseName = plan.name.split(' ')[0];
      if (!planGroups[baseName]) {
        planGroups[baseName] = [];
      }
      planGroups[baseName].push(plan);
    });

    return Object.entries(planGroups).map(([baseName, plans]) => {
      // Sort plans within the group: monthly, 6m, 1y
      plans.sort((a, b) => {
        if (!a.code.includes('-')) return -1; // monthly first
        if (!b.code.includes('-')) return 1;
        if (a.code.endsWith('6m')) return -1;
        if (b.code.endsWith('1y')) return 1;
        return 0;
      });
      return { baseName, plans };
    });
  };

  const fetchPlans = async () => {
    try {
      setIsLoading(true);
      
      // Dapatkan user ID dari session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User tidak ditemukan");
      }
      
      // Panggil API untuk mendapatkan daftar paket
      const plansResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/plans`, {
        headers: {
          'x-user-id': user.id
        }
      });
      
      if (!plansResponse.ok) {
        throw new Error("Gagal mengambil data paket");
      }
      
      const plansData = await plansResponse.json();
      
      // Panggil API untuk mendapatkan saldo kredit
      const creditResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/credit`, {
        headers: {
          'x-user-id': user.id
        }
      });
      
      if (!creditResponse.ok) {
        throw new Error("Gagal mengambil data saldo kredit");
      }
      
      const creditData = await creditResponse.json();
      
      if (plansData.success) {
        const grouped = groupAndSortPlans(plansData.data);
        setPlans(grouped);
      } else {
        throw new Error(plansData.message || "Gagal mengambil data paket");
      }
      
      if (creditData.success) {
        setCreditBalance(creditData.data.balance);
      }
    } catch (err: any) {
      console.error('Error fetching plans:', err);
      setError(err.message || 'Terjadi kesalahan saat memuat daftar paket');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    if (plan.price > creditBalance) {
      toast.error(`Saldo kredit tidak cukup untuk paket ${plan.name}. Silakan topup terlebih dahulu.`);
    } else {
      setConfirmDialogOpen(true);
    }
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return;
    
    try {
      setIsSubscribing(true);
      
      // Dapatkan user ID dari session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User tidak ditemukan");
      }
      
      // Panggil API untuk berlangganan paket
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/billing/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id
        },
        body: JSON.stringify({
          planCode: selectedPlan.code
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Gagal berlangganan paket");
      }
      
      if (data.success) {
        toast.success(`Berhasil berlangganan paket ${selectedPlan.name}`);
        setCreditBalance(data.data.remainingBalance);
        setSelectedPlan(null);
        
        // Panggil callback jika ada
        if (onSubscribe) {
          onSubscribe();
        }
      } else {
        throw new Error(data.message || "Gagal berlangganan paket");
      }
    } catch (err: any) {
      console.error('Error subscribing to plan:', err);
      toast.error(err.message || 'Terjadi kesalahan saat berlangganan paket');
    } finally {
      setIsSubscribing(false);
      setConfirmDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Memuat Daftar Paket
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
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pilih Paket</CardTitle>
          <CardDescription>
            Pilih paket yang sesuai dengan kebutuhan Anda dan nikmati diskon untuk langganan jangka panjang!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((group) => (
              <PlanCard 
                key={group.baseName}
                group={group}
                onSelectPlan={handleSelectPlan}
                creditBalance={creditBalance}
                isSubscribing={isSubscribing}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Berlangganan</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan berlangganan paket <span className="font-bold">{selectedPlan?.name}</span> seharga <span className="font-bold">{formatCurrency(selectedPlan?.price || 0)}</span>. Saldo Anda akan dipotong sesuai harga paket.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubscribing}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubscribe} disabled={isSubscribing}>
              {isSubscribing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface PlanCardProps {
  group: GroupedPlan;
  onSelectPlan: (plan: Plan) => void;
  creditBalance: number;
  isSubscribing: boolean;
}

function PlanCard({ group, onSelectPlan, creditBalance, isSubscribing }: PlanCardProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(group.plans[0].id);

  const selectedPlan = group.plans.find(p => p.id === selectedPlanId) || group.plans[0];

  const getDurationLabel = (code: string) => {
    if (code.endsWith('6m')) return '6 Bulan (Diskon 10%)';
    if (code.endsWith('1y')) return '1 Tahun (Diskon 20%)';
    return '1 Bulan';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.baseName}</CardTitle>
        <CardDescription>
          <span className="text-2xl font-bold">{formatCurrency(selectedPlan.price)}</span>
          <span className="text-sm text-muted-foreground"> / {getDurationLabel(selectedPlan.code).split(' ')[0]}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={selectedPlanId}
          onValueChange={setSelectedPlanId}
          className="mb-4"
        >
          {group.plans.map(plan => (
            <div key={plan.id} className="flex items-center space-x-2">
              <RadioGroupItem value={plan.id} id={plan.id} />
              <Label htmlFor={plan.id}>{getDurationLabel(plan.code)} - <span className="font-semibold">{formatCurrency(plan.price)}</span></Label>
            </div>
          ))}
        </RadioGroup>
        
        <div className="space-y-2 mt-4 pt-4 border-t">
          {selectedPlan.limits && Object.entries(selectedPlan.limits).map(([key, value]) => (
            <div key={key} className="flex items-center">
              <Check className="h-4 w-4 mr-2 text-green-500" />
              <span>
                {value === -1 ? 'Unlimited' : value} {key.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
          {selectedPlan.features && Object.entries(selectedPlan.features).map(([key, value]) => (
            <div key={key} className="flex items-center">
              {value ? (
                <Check className="h-4 w-4 mr-2 text-green-500" />
              ) : (
                <X className="h-4 w-4 mr-2 text-red-500" />
              )}
              <span className={!value ? 'text-muted-foreground line-through' : ''}>
                {key.replace(/has_/g, '').replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={() => onSelectPlan(selectedPlan)}
          variant={selectedPlan.price > creditBalance ? "outline" : "default"}
          disabled={isSubscribing}
        >
          {selectedPlan.price > creditBalance ? 'Kredit Tidak Cukup' : 'Pilih Paket'}
        </Button>
      </CardFooter>
    </Card>
  )
} 