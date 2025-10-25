import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface TopUpGuideProps {
  children?: React.ReactNode;
}

export function TopUpGuide({ children }: TopUpGuideProps) {
  const copyToClipboard = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast.success(message);
  };

  const bankAccounts = [
    {
      bank: "BCA",
      accountNumber: "1234567890",
      accountName: "PT WhatsApp Automation"
    },
    {
      bank: "Mandiri",
      accountNumber: "0987654321",
      accountName: "PT WhatsApp Automation"
    },
    {
      bank: "BNI",
      accountNumber: "1122334455",
      accountName: "PT WhatsApp Automation"
    }
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="w-full">
            <CreditCard className="mr-2 h-4 w-4" />
            TopUp Kredit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Panduan TopUp Kredit</DialogTitle>
          <DialogDescription>
            Ikuti langkah-langkah berikut untuk menambah saldo kredit Anda
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">1. Transfer ke salah satu rekening berikut:</h3>
            <div className="space-y-3">
              {bankAccounts.map((account, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{account.bank}</span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => copyToClipboard(account.accountNumber, `Nomor rekening ${account.bank} disalin`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-sm mt-1">{account.accountNumber}</div>
                  <div className="text-xs text-muted-foreground mt-1">a.n {account.accountName}</div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium">2. Kirim bukti transfer ke:</h3>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => copyToClipboard("admin@whatsapp-automation.com", "Email admin disalin")}
              >
                admin@whatsapp-automation.com
                <Copy className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center space-x-2 mt-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => copyToClipboard("+6281234567890", "Nomor WhatsApp admin disalin")}
              >
                +6281234567890 (WhatsApp)
                <Copy className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium">3. Sertakan informasi berikut:</h3>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Email akun Anda</li>
              <li>User ID Anda</li>
              <li>Jumlah transfer</li>
              <li>Bukti transfer (screenshot/foto)</li>
            </ul>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p>Kredit akan ditambahkan ke akun Anda dalam 1x24 jam kerja setelah konfirmasi.</p>
          </div>
          
          <div className="flex justify-center">
            <Button 
              variant="default" 
              className="w-full"
              onClick={() => window.open("https://wa.me/6281234567890?text=Halo,%20saya%20ingin%20TopUp%20kredit%20WhatsApp%20Automation", "_blank")}
            >
              Hubungi Admin via WhatsApp
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 