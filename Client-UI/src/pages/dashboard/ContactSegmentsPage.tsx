import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Loader2, PlusCircle, Edit, Trash2, Users, Eye, UploadCloud } from "lucide-react";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL; // Asumsi sama dengan Drip Campaign API

interface Segment {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  // user_id?: string; // Jika diperlukan
  contacts_count?: number; // Opsional, bisa didapat dari backend
}

interface SegmentContact {
  id: string;
  segment_id: string;
  contact_number: string;
  contact_name?: string;
  added_at?: string;
}

export default function ContactSegmentsPage() {
  const navigate = useNavigate();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const [segmentDescription, setSegmentDescription] = useState("");
  const [submittingSegment, setSubmittingSegment] = useState(false);

  const [isContactsModalOpen, setIsContactsModalOpen] = useState(false);
  const [selectedSegmentForContacts, setSelectedSegmentForContacts] = useState<Segment | null>(null);
  const [contactsInSegment, setContactsInSegment] = useState<SegmentContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [newContactNumber, setNewContactNumber] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [addingContact, setAddingContact] = useState(false);

  const fetchSegments = useCallback(async () => {
    setLoadingSegments(true);
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        toast.error("User ID not found. Please login again.");
        setLoadingSegments(false);
        return;
      }
      const response = await fetch(`${API_URL}/drip-segments`, {
        headers: {
          'x-user-id': userId
        }
      });
      if (!response.ok) throw new Error("Gagal memuat segmen");
      const data = await response.json();
      setSegments(data.success && data.segments ? data.segments : []);
    } catch (error) {
      toast.error((error instanceof Error) ? error.message : "Terjadi kesalahan");
      setSegments([]);
    } finally {
      setLoadingSegments(false);
    }
  }, []);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  const handleOpenSegmentModal = (segment: Segment | null = null) => {
    setEditingSegment(segment);
    setSegmentName(segment?.name || "");
    setSegmentDescription(segment?.description || "");
    setIsSegmentModalOpen(true);
  };

  const handleCloseSegmentModal = () => {
    setIsSegmentModalOpen(false);
    setEditingSegment(null);
    setSegmentName("");
    setSegmentDescription("");
  };

  const handleSaveSegment = async () => {
    if (!segmentName.trim()) return toast.error("Nama segmen wajib diisi.");
    setSubmittingSegment(true);
    const payload = { name: segmentName, description: segmentDescription };
    const url = editingSegment ? `${API_URL}/drip-segments/${editingSegment.id}` : `${API_URL}/drip-segments`;
    const method = editingSegment ? 'PUT' : 'POST';
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      toast.error("User ID not found. Please login again.");
      setSubmittingSegment(false);
      return;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Gagal ${editingSegment ? 'memperbarui' : 'membuat'} segmen`);
      }
      toast.success(`Segmen berhasil ${editingSegment ? 'diperbarui' : 'dibuat'}!`);
      fetchSegments(); // Refresh list
      handleCloseSegmentModal();
    } catch (error) {
      toast.error((error instanceof Error) ? error.message : "Terjadi kesalahan");
    } finally {
      setSubmittingSegment(false);
    }
  };

  const handleDeleteSegment = async (segmentId: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus segmen ini? Semua kontak di dalamnya akan dihapus dari segmen ini.")) return;
    toast.loading("Menghapus segmen...");
    try {
      const response = await fetch(`${API_URL}/drip-segments/${segmentId}`, { method: 'DELETE' });
      if (!response.ok) {
         const errData = await response.json();
        throw new Error(errData.error || "Gagal menghapus segmen");
      }
      toast.success("Segmen berhasil dihapus.");
      fetchSegments(); // Refresh list
    } catch (error) {
      toast.error((error instanceof Error) ? error.message : "Terjadi kesalahan");
    } finally {
      toast.dismiss();
    }
  };
  
  // --- Fungsi untuk Kelola Kontak dalam Segmen (placeholder) ---
  const handleOpenContactsModal = async (segment: Segment) => {
    setSelectedSegmentForContacts(segment);
    setIsContactsModalOpen(true);
    setLoadingContacts(true);
    try {
        const response = await fetch(`${API_URL}/drip-segments/${segment.id}/contacts`);
        if(!response.ok) throw new Error("Gagal memuat kontak segmen");
        const data = await response.json();
        setContactsInSegment(data.success && data.contacts ? data.contacts : []);
    } catch (error) {
        toast.error((error instanceof Error) ? error.message : "Gagal memuat kontak");
        setContactsInSegment([]);
    } finally {
        setLoadingContacts(false);
    }
  };

  const handleCloseContactsModal = () => {
    setIsContactsModalOpen(false);
    setSelectedSegmentForContacts(null);
    setContactsInSegment([]);
    setNewContactName("");
    setNewContactNumber("");
  };

  const handleAddContactToSegment = async () => {
    if(!selectedSegmentForContacts || !newContactNumber.trim()) {
        toast.error("Nomor kontak wajib diisi.");
        return;
    }
    setAddingContact(true);
    try {
        const payload = { contact_number: newContactNumber, contact_name: newContactName };
        const response = await fetch(`${API_URL}/drip-segments/${selectedSegmentForContacts.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if(!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Gagal menambah kontak");
        }
        toast.success("Kontak berhasil ditambahkan ke segmen.");
        // Refresh kontak list
        handleOpenContactsModal(selectedSegmentForContacts); 
        setNewContactName("");
        setNewContactNumber("");
    } catch (error) {
        toast.error((error instanceof Error) ? error.message : "Gagal menambah kontak");
    } finally {
        setAddingContact(false);
    }
  };

  const handleDeleteContactFromSegment = async (segmentContactId: string) => {
    if(!selectedSegmentForContacts || !window.confirm("Yakin ingin menghapus kontak ini dari segmen?")) return;
    toast.loading("Menghapus kontak dari segmen...");
    try {
        const response = await fetch(`${API_URL}/drip-segments/contacts/${segmentContactId}`, { method: 'DELETE' });
        if(!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Gagal menghapus kontak");
        }
        toast.success("Kontak berhasil dihapus dari segmen.");
        handleOpenContactsModal(selectedSegmentForContacts); // Refresh
    } catch (error) {
        toast.error((error instanceof Error) ? error.message : "Gagal menghapus kontak");
    } finally {
        toast.dismiss();
    }
  };

  // --- End Fungsi Kontak ---

  if (loadingSegments) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /> <span className="ml-2">Memuat segmen...</span></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Segmen Kontak</h1>
          <p className="text-muted-foreground mt-1">Kelola grup kontak untuk campaign dan pesan Anda</p>
        </div>
        <Button onClick={() => handleOpenSegmentModal()} className="animated-button">
          <PlusCircle className="mr-2 h-4 w-4" /> Buat Segmen Baru
        </Button>
      </div>

      {/* Daftar Segmen */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Segmen</CardTitle>
          <CardDescription>Kelola grup kontak untuk campaign Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          {segments.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Belum ada segmen. Klik "Buat Segmen Baru" untuk memulai.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Segmen</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead>Jumlah Kontak</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map(segment => (
                  <TableRow key={segment.id}>
                    <TableCell className="font-medium">{segment.name}</TableCell>
                    <TableCell>{segment.description || "-"}</TableCell>
                    <TableCell>{segment.contacts_count || 0}</TableCell> {/* Asumsi ada contacts_count */}
                    <TableCell>{segment.created_at ? new Date(segment.created_at).toLocaleDateString('id-ID') : "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenContactsModal(segment)} title="Kelola Kontak"><Users className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleOpenSegmentModal(segment)} title="Edit Segmen"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteSegment(segment.id)} className="text-red-500 hover:text-red-600" title="Hapus Segmen"><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Buat/Edit Segmen */}
      <Dialog open={isSegmentModalOpen} onOpenChange={setIsSegmentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSegment ? "Edit Segmen" : "Buat Segmen Baru"}</DialogTitle>
            <DialogDescription>{editingSegment ? "Perbarui detail segmen Anda." : "Isi detail untuk segmen kontak baru."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="segmentName">Nama Segmen *</Label>
              <Input id="segmentName" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="segmentDescription">Deskripsi (Opsional)</Label>
              <Textarea id="segmentDescription" value={segmentDescription} onChange={(e) => setSegmentDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseSegmentModal}>Batal</Button>
            <Button onClick={handleSaveSegment} disabled={submittingSegment}>
              {submittingSegment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingSegment ? "Simpan Perubahan" : "Buat Segmen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Kelola Kontak dalam Segmen */}
      {selectedSegmentForContacts && (
        <Dialog open={isContactsModalOpen} onOpenChange={setIsContactsModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Kelola Kontak: {selectedSegmentForContacts.name}</DialogTitle>
              <DialogDescription>Tambah, lihat, atau hapus kontak dari segmen ini.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {/* Form Tambah Kontak */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Tambah Kontak Baru</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <Label htmlFor="newContactNumber">Nomor WhatsApp *</Label>
                        <Input id="newContactNumber" value={newContactNumber} onChange={e => setNewContactNumber(e.target.value)} placeholder="Contoh: 628123456789"/>
                    </div>
                    <div>
                        <Label htmlFor="newContactName">Nama Kontak (Opsional)</Label>
                        <Input id="newContactName" value={newContactName} onChange={e => setNewContactName(e.target.value)} />
                    </div>
                    <Button onClick={handleAddContactToSegment} disabled={addingContact}>
                        {addingContact ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Tambah ke Segmen
                    </Button>
                    <Button variant="outline" className="ml-2">
                        <UploadCloud className="mr-2 h-4 w-4" /> Upload Kontak (CSV)
                    </Button>
                </CardContent>
              </Card>

              {/* Daftar Kontak */}
              <h4 className="text-md font-semibold pt-4">Daftar Kontak di Segmen Ini ({contactsInSegment.length})</h4>
              {loadingContacts ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /> Memuat kontak...</div>
              ) : contactsInSegment.length === 0 ? (
                <p className="text-center text-gray-500 py-3">Belum ada kontak di segmen ini.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Kontak</TableHead>
                      <TableHead>Nomor WhatsApp</TableHead>
                      <TableHead>Ditambahkan</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactsInSegment.map(contact => (
                      <TableRow key={contact.id}>
                        <TableCell>{contact.contact_name || "-"}</TableCell>
                        <TableCell>{contact.contact_number}</TableCell>
                        <TableCell>{contact.added_at ? new Date(contact.added_at).toLocaleDateString('id-ID') : "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteContactFromSegment(contact.id)} className="text-red-500 hover:text-red-600" title="Hapus Kontak dari Segmen">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseContactsModal}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 