import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { debounce } from 'lodash';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddCreditDialog } from "./AddCreditDialog";

interface User {
  id: string;
  email: string;
  created_at: string;
}

export function CreditManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const PAGE_SIZE = 10;

  const fetchUsers = useCallback(async (currentPage: number, search: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_paged_users', {
        p_search_term: search,
        p_page_number: currentPage,
        p_page_size: PAGE_SIZE,
      });

      if (error) throw error;
      
      setUsers(data.users);
      setTotalPages(Math.ceil(data.total_count / PAGE_SIZE));
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Gagal mengambil data pengguna.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debouncedFetch = useCallback(debounce(fetchUsers, 500), [fetchUsers]);

  useEffect(() => {
    debouncedFetch(page, searchTerm);
  }, [page, searchTerm, debouncedFetch]);

  const handleAddCreditClick = (user: User) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };
  
  const onCreditAdded = () => {
    // Optionally refresh data
    fetchUsers(page, searchTerm);
  };

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Manajemen Kredit Pengguna</CardTitle>
        <CardDescription>
          Lihat, cari, dan tambahkan kredit untuk semua pengguna.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Cari pengguna berdasarkan ID atau email..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1); // Reset to first page on new search
          }}
        />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Tanggal Daftar</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.id}</TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => handleAddCreditClick(user)}>
                        Tambah Kredit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    Tidak ada pengguna ditemukan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Sebelumnya
          </Button>
          <span className="text-sm">
            Halaman {page} dari {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Berikutnya
          </Button>
        </div>
      </CardContent>
      {selectedUser && (
        <AddCreditDialog
          user={selectedUser}
          isOpen={isDialogOpen}
          setIsOpen={setIsDialogOpen}
          onCreditAdded={onCreditAdded}
        />
      )}
    </Card>
  );
}

// Create a new component for the dialog
// Client-UI/src/components/admin/AddCreditDialog.tsx
// This component needs to be created in a new file. 