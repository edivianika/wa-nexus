import { KuponGenerator } from "@/components/admin/KuponGenerator";

export default function GenerateKuponPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Generate Kupon</h1>
      <KuponGenerator />
    </div>
  );
} 