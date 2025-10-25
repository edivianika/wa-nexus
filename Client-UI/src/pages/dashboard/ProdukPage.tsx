import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const produkDummy = [
  {
    id: 1,
    nama: "Tas Selempang Wanita Bordir Elegan Warna Ungu",
    harga: 19500,
    gambar: "https://images.tokopedia.net/img/cache/700/VqbcmM/2023/12/7/7e6e2e2d-2e2e-4e2e-8e2e-2e2e2e2e2e2e.jpg", // Ganti dengan gambar lokal jika perlu
    cod: true
  }
];

export default function ProdukPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nama: "",
    deskripsi: "",
    harga: "",
    kategori: "",
    stok: "",
    image_urls: "",
    fitur: "",
    spesifikasi: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Produk</h1>
        <Button onClick={() => setOpen(true)}>
          + Tambah Produk
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {produkDummy.map((produk) => (
          <Card key={produk.id} className="hover:shadow-lg transition-shadow">
            <img
              src={produk.gambar}
              alt={produk.nama}
              className="w-full h-48 object-cover rounded-t"
            />
            <CardContent className="p-4">
              <div className="font-semibold text-base mb-1 truncate">
                {produk.nama}
              </div>
              {produk.cod && (
                <Badge className="bg-orange-100 text-orange-600 font-bold px-2 py-0.5 text-xs mb-2">COD</Badge>
              )}
              <div className="text-orange-600 font-bold text-lg mt-2">
                Rp{produk.harga.toLocaleString("id-ID")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Produk</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input name="nama" placeholder="Nama Produk" value={form.nama} onChange={handleChange} />
            <Textarea name="deskripsi" placeholder="Deskripsi" value={form.deskripsi} onChange={handleChange} />
            <Input name="harga" placeholder="Harga" type="number" value={form.harga} onChange={handleChange} />
            <Input name="kategori" placeholder="Kategori" value={form.kategori} onChange={handleChange} />
            <Input name="stok" placeholder="Stok" type="number" value={form.stok} onChange={handleChange} />
            <Input name="image_urls" placeholder="Image URLs (pisahkan dengan koma)" value={form.image_urls} onChange={handleChange} />
            <Input name="fitur" placeholder="Fitur (pisahkan dengan koma)" value={form.fitur} onChange={handleChange} />
            <Textarea name="spesifikasi" placeholder="Spesifikasi (JSON)" value={form.spesifikasi} onChange={handleChange} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={() => setOpen(false)}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 