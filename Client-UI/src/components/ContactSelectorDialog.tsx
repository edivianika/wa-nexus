import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Contact {
  id: string;
  contact_name: string | null;
  phone_number: string;
  labels?: string[];
}

interface ContactSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (contacts: Contact[]) => void;
  initialSelected?: string[];
}

const PAGE_SIZE = 10;
const SEARCH_DELAY = 500; // 500ms delay for search

export default function ContactSelectorDialog({ open, onOpenChange, onConfirm, initialSelected = [] }: ContactSelectorDialogProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
  const [allLabels, setAllLabels] = useState<string[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to first page when search changes
    }, SEARCH_DELAY);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  useEffect(() => {
    if (open) {
      fetchContacts();
    }
    // eslint-disable-next-line
  }, [open, currentPage, debouncedSearch, labelFilter]);

  useEffect(() => {
    setSelectedIds(initialSelected);
  }, [initialSelected, open]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate =
        pageContacts.length > 0 &&
        selectedIds.filter(id => pageContacts.some(c => c.id === id)).length > 0 &&
        selectedIds.filter(id => pageContacts.some(c => c.id === id)).length < pageContacts.length;
    }
  }, [selectedIds, contacts, currentPage]);

  const fetchContacts = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setContacts([]);
      setTotalContacts(0);
      setAllLabels([]);
      setLoading(false);
      return;
    }
    let query = (supabase as any)
      .from("contacts")
      .select("id, contact_name, phone_number, labels", { count: "exact" })
      .eq("owner_id", user.id);
    if (debouncedSearch.trim()) {
      query = query.or(`contact_name.ilike.%${debouncedSearch}%,phone_number.ilike.%${debouncedSearch}%`);
    }
    query = query.order("created_at", { ascending: false })
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    if (labelFilter) {
      query = query.contains("labels", [labelFilter]);
    }
    const { data, error, count } = await query;
    if (!error && data) {
      setContacts(data);
      setTotalContacts(count || 0);
      // Ambil semua label unik dari hasil
      const labelSet = new Set<string>();
      data.forEach((c: Contact) => (c.labels || []).forEach(l => l && labelSet.add(l)));
      setAllLabels(Array.from(labelSet));
    }
    setLoading(false);
  };

  const pageContacts = contacts;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const ids = Array.from(new Set([...selectedIds, ...pageContacts.map(c => c.id)]));
      setSelectedIds(ids);
    } else {
      setSelectedIds(selectedIds.filter(id => !pageContacts.some(c => c.id === id)));
    }
  };

  const handleSelectContact = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? [...prev, id] : prev.filter(cid => cid !== id));
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;
    
    // Temporarily show loading state
    setLoading(true);
    
    try {
      // Fetch all selected contacts from the database
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      
      if (!user) {
        setLoading(false);
        return;
      }
      
      const { data: allSelectedContacts, error } = await (supabase as any)
        .from("contacts")
        .select("id, contact_name, phone_number, labels")
        .eq("owner_id", user.id)
        .in("id", selectedIds);
      
      if (error) throw error;
      
      // Pass all selected contacts to the onConfirm callback
      onConfirm(allSelectedContacts || []);
      onOpenChange(false);
    } catch (error) {
      console.error("Error fetching selected contacts:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>Select Contact</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Search name or number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setDebouncedSearch(search); setCurrentPage(1); } }}
            className="max-w-xs"
            disabled={loading}
          />
          <select
            className="border rounded px-3 py-2 text-xs min-w-[120px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={labelFilter}
            onChange={e => { setLabelFilter(e.target.value); setCurrentPage(1); }}
            disabled={allLabels.length === 0}
            style={{ opacity: allLabels.length === 0 ? 0.6 : 1, cursor: allLabels.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <option value="">All Labels</option>
            {allLabels.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto max-h-[350px]">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs px-2 py-1">
                  <input
                    type="checkbox"
                    ref={headerCheckboxRef}
                    checked={pageContacts.length > 0 && pageContacts.every(c => selectedIds.includes(c.id))}
                    onChange={e => handleSelectAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="text-xs px-2 py-1">Name</TableHead>
                <TableHead className="text-xs px-2 py-1">Label</TableHead>
                <TableHead className="text-xs px-2 py-1">Phone Number</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-xs px-2 py-1">Loading...</TableCell></TableRow>
              ) : pageContacts.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-xs px-2 py-1">No contacts found.</TableCell></TableRow>
              ) : (
                pageContacts.map(contact => {
                  const checked = selectedIds.includes(contact.id);
                  return (
                    <TableRow
                      key={contact.id}
                      className={`text-xs cursor-pointer ${checked ? 'bg-muted' : ''}`}
                      onClick={e => {
                        // Jangan toggle jika klik checkbox
                        if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
                        handleSelectContact(contact.id, !checked);
                      }}
                    >
                      <TableCell className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => handleSelectContact(contact.id, e.target.checked)}
                          onClick={e => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1">{contact.contact_name || '-'}</TableCell>
                      <TableCell className="px-2 py-1">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(contact.labels) && contact.labels.length > 0 ? contact.labels.map((l, i) => (
                            <Badge key={i} variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-800">{l}</Badge>
                          )) : <span className="text-xs text-muted-foreground">-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1">{contact.phone_number}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {/* Pagination */}
        <div className="flex justify-between items-center mt-4">
          <span className="text-xs text-gray-500">
            Showing {pageContacts.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}
            -{(currentPage - 1) * PAGE_SIZE + pageContacts.length} of {totalContacts}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
            >
              Prev
            </Button>
            <span className="text-xs px-2" style={{ marginTop: '10px' }}>Page {currentPage}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage * PAGE_SIZE >= totalContacts || loading}
            >
              Next
            </Button>
          </div>
        </div>
        <DialogFooter className="flex flex-row justify-end gap-4 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={selectedIds.length === 0 || loading}>
            {loading ? "Loading..." : `Select (${selectedIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 