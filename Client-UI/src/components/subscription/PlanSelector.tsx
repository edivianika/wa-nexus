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
        // Filter untuk 4 paket utama saja (trial, basic, professional, enterprise)
        const mainPlans = plansData.data.filter((plan: Plan) => 
          ['trial', 'basic', 'professional', 'enterprise'].includes(plan.code)
        );
        
        // Group plans dengan logic yang lebih sederhana untuk 4 paket
        const grouped = mainPlans.map(plan => ({
          baseName: plan.name,
          plans: [plan]
        }));
        
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
  const selectedPlan = group.plans[0]; // Hanya 1 plan per group untuk 4 paket utama

  const getPlanBadge = (code: string) => {
    switch (code) {
      case 'trial': return { text: 'TRIAL', className: 'bg-blue-100 text-blue-800' };
      case 'basic': return { text: 'POPULAR', className: 'bg-green-100 text-green-800' };
      case 'professional': return { text: 'RECOMMENDED', className: 'bg-purple-100 text-purple-800' };
      case 'enterprise': return { text: 'ENTERPRISE', className: 'bg-orange-100 text-orange-800' };
      default: return null;
    }
  };

  const getPlanDescription = (code: string) => {
    switch (code) {
      case 'trial': return 'Coba gratis 7 hari dengan fitur lengkap';
      case 'basic': return 'Sempurna untuk individu dan startup kecil';
      case 'professional': return 'Ideal untuk bisnis menengah dan agensi';
      case 'enterprise': return 'Solusi lengkap untuk perusahaan besar';
      default: return '';
    }
  };

  const badge = getPlanBadge(selectedPlan.code);

  return (
    <Card className={`relative ${selectedPlan.code === 'professional' ? 'border-purple-200 shadow-lg' : ''}`}>
      {badge && (
        <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
          {badge.text}
        </div>
      )}
      
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{selectedPlan.name}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {getPlanDescription(selectedPlan.code)}
        </CardDescription>
        <div className="mt-4">
          <span className="text-3xl font-bold">
            {selectedPlan.price === 0 ? 'GRATIS' : formatCurrency(selectedPlan.price)}
          </span>
          {selectedPlan.price > 0 && (
            <span className="text-sm text-muted-foreground"> / bulan</span>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          {/* Limits */}
          <div className="space-y-2">
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-2 text-green-500" />
              <span className="text-sm">
                {selectedPlan.limits.messages_per_period === -1 ? 'Unlimited' : selectedPlan.limits.messages_per_period.toLocaleString()} pesan per bulan
              </span>
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-2 text-green-500" />
              <span className="text-sm">
                {selectedPlan.limits.active_devices === -1 ? 'Unlimited' : selectedPlan.limits.active_devices} device WhatsApp
              </span>
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-2 text-green-500" />
              <span className="text-sm">
                {selectedPlan.limits.drip_campaigns === -1 ? 'Unlimited' : selectedPlan.limits.drip_campaigns} drip campaign
              </span>
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 mr-2 text-green-500" />
              <span className="text-sm">
                {selectedPlan.limits.kanban_boards === -1 ? 'Unlimited' : selectedPlan.limits.kanban_boards} kanban board
              </span>
            </div>
          </div>

          {/* Features */}
          <div className="pt-4 border-t space-y-2">
            {selectedPlan.features.has_ai_typing && (
              <div className="flex items-center">
                <Check className="h-4 w-4 mr-2 text-green-500" />
                <span className="text-sm">AI Typing Indicator</span>
              </div>
            )}
            {selectedPlan.features.has_scheduled_campaigns && (
              <div className="flex items-center">
                <Check className="h-4 w-4 mr-2 text-green-500" />
                <span className="text-sm">Scheduled Campaigns</span>
              </div>
            )}
            {selectedPlan.features.team_members > 0 && (
              <div className="flex items-center">
                <Check className="h-4 w-4 mr-2 text-green-500" />
                <span className="text-sm">{selectedPlan.features.team_members} team members</span>
              </div>
            )}
            {selectedPlan.features.priority_support && (
              <div className="flex items-center">
                <Check className="h-4 w-4 mr-2 text-green-500" />
                <span className="text-sm">Priority Support</span>
              </div>
            )}
            {selectedPlan.features.dedicated_manager && (
              <div className="flex items-center">
                <Check className="h-4 w-4 mr-2 text-green-500" />
                <span className="text-sm">Dedicated Manager</span>
              </div>
            )}
            {selectedPlan.features.has_watermark && (
              <div className="flex items-center">
                <X className="h-4 w-4 mr-2 text-red-500" />
                <span className="text-sm text-muted-foreground">Watermark</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      
      <CardFooter>
        <Button 
          onClick={() => onSelectPlan(selectedPlan)} 
          className={`w-full ${selectedPlan.code === 'professional' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
          disabled={isSubscribing || (selectedPlan.price > 0 && creditBalance < selectedPlan.price)}
        >
          {isSubscribing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memproses...
            </>
          ) : selectedPlan.price === 0 ? (
            'Mulai Trial Gratis'
          ) : (
            `Berlangganan ${formatCurrency(selectedPlan.price)}`
          )}
        </Button>
      </CardFooter>
    </Card>
  )
} 