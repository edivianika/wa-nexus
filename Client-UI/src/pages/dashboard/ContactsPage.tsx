import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Edit, Trash2, ShieldOff, ShieldCheck, Plus, X, MessageCircle, MessageCircleOff, ScrollText, Clock, MoreHorizontal, Loader2, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from '@/components/ui/use-toast';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import ScheduledMessageDialog from "@/components/ScheduledMessageDialog";
import { AddContactToCampaignModal } from "@/components/drip/AddContactToCampaignModal";
import ContactDetailDialog from "@/components/ContactDetailDialog";
import KanbanBadge from "@/components/kanban/KanbanBadge";
import useKanbanColumns from "@/hooks/useKanbanColumns";
import { LeadScoreBadge } from "@/components/LeadScoreBadge";

const API_URL = import.meta.env.VITE_API_URL;

// NOTE: The 'labels' field is not present in the generated Supabase types, but is used in the app and database.
interface Contact {
  id: number;
  contact_name: string | null;
  phone_number: string;
  labels?: string[]; // <-- custom field for label array
  is_blocked?: boolean;
  drip_campaign_count?: number; // <-- added field for drip campaign count
  notes?: Note[]; // <-- Ditambahkan
  scheduled_message_count?: number; // <-- added field for scheduled message count
  contact_detail?: Record<string, any>; // <-- Tambahkan field untuk contact_detail
  email?: string | null;
  created_at?: string;
  updated_at?: string;
  kanban_column_id?: string;
  lead_score?: number;
  connection_id?: string | null;
}

// Interface baru untuk Note
interface Note {
  id: string;
  content: string;
  created_at: string;
}

// Interface for drip campaign details
interface DripCampaignDetail {
  subscriber_id: string;
  drip_campaign_id: string;
  campaign_name: string;
  status: string;
  display_status?: string; // Added for UI display
  last_message_order: number;
  last_message_sent_at: string;
  subscribed_at: string;
}

const ContactsPage = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteToast, setShowDeleteToast] = useState<{ id: number, open: boolean } | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<{ contact_name: string; label: string; phone_number: string }>({ contact_name: '', label: '', phone_number: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15); // Changed from 10 to 15 contacts per page
  const [totalContacts, setTotalContacts] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingLabelId, setAddingLabelId] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newNote, setNewNote] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [openLabelPopoverId, setOpenLabelPopoverId] = useState<number | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const [labelFilter, setLabelFilter] = useState<string>("");
  const [leadScoreFilter, setLeadScoreFilter] = useState<string>("");
  const [showDripCampaigns, setShowDripCampaigns] = useState<number | null>(null);
  const [dripCampaigns, setDripCampaigns] = useState<DripCampaignDetail[]>([]);
  const [loadingDripCampaigns, setLoadingDripCampaigns] = useState(false);
  const [unsubscribeInfo, setUnsubscribeInfo] = useState<{ subscriberId: string; campaignName: string, contactId: number } | null>(null);
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const navigate = useNavigate();
  const [scheduledDialogOpen, setScheduledDialogOpen] = useState(false);
  const [scheduledContactId, setScheduledContactId] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<string>("");
  const [isDripModalOpen, setIsDripModalOpen] = useState(false);
  const [selectedContactForDrip, setSelectedContactForDrip] = useState<Contact | null>(null);
  const [selectedContactForDetail, setSelectedContactForDetail] = useState<Contact | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [updatingKanbanId, setUpdatingKanbanId] = useState<number | null>(null);
  const [updatingLeadScoreId, setUpdatingLeadScoreId] = useState<number | null>(null);
  const { columns: kanbanColumns, fetchColumns: refreshKanbanColumns } = useKanbanColumns();
  const [userId, setUserId] = useState<string>("");
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [lastFetchedPage, setLastFetchedPage] = useState<number>(1);
  const CACHE_DURATION = 60000; // Increased to 60 seconds cache
  
  // Cache for kanban and board data
  const [kanbanCache, setKanbanCache] = useState<{
    data: any;
    timestamp: number;
  } | null>(null);
  const KANBAN_CACHE_DURATION = 120000; // 2 minutes cache for kanban data
  const [connections, setConnections] = useState<{ id: string; name: string }[]>([]);
  const [connectionMap, setConnectionMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchContacts();
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setOwnerId(userData?.user?.id || "");
    })();
    // eslint-disable-next-line
  }, [currentPage, searchTerm]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = selectedContacts.length > 0 && selectedContacts.length < contacts.length;
    }
  }, [selectedContacts, contacts]);

  // Get user ID once on component mount
  useEffect(() => {
    const getUserId = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const id = userData?.user?.id || "";
      setUserId(id);
      localStorage.setItem('user_id', id);
    };
    getUserId();
  }, []);

  // Optimized fetchContacts with useCallback
  const fetchContacts = useCallback(async (forceRefresh = false, overrideSearchTerm?: string) => {
    const effectiveSearchTerm = overrideSearchTerm !== undefined ? overrideSearchTerm : searchTerm;
    // Skip fetch if we have data and cache hasn't expired, unless forced
    const now = Date.now();
    if (
      !forceRefresh &&
      contacts.length > 0 &&
      now - lastFetchTime < CACHE_DURATION &&
      lastFetchedPage === currentPage
    ) {
      return;
    }
    
    setLoading(true);
    setSearchLoading(true);
    
    if (!userId) {
      setContacts([]);
      setLoading(false);
      setSearchLoading(false);
      setTotalContacts(0);
      return;
    }
    
    try {
      // Fetch base contact data
      let query = supabase
        .from("contacts")
        .select("id, contact_name, phone_number, labels, is_blocked, notes, email, contact_detail, created_at, updated_at, kanban_column_id, lead_score, connection_id", { count: "exact" })
        .eq("owner_id", userId);
      
      if (effectiveSearchTerm && effectiveSearchTerm.trim()) {
        query = query.or(`contact_name.ilike.%${effectiveSearchTerm}%,phone_number.ilike.%${effectiveSearchTerm}%`);
      }
      
      query = query.order("created_at", { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
      
      const { data, error, count } = await query;
      
      if (error) {
        throw error;
      }
      
      if (!data || data.length === 0) {
        setContacts([]);
        setTotalContacts(count || 0);
        setLastFetchTime(Date.now());
        setLastFetchedPage(currentPage);
        setLoading(false);
        setSearchLoading(false);
        return;
      }
      
      const contactIds = data.map((contact: Contact) => contact.id);
      
      // Get drip campaign counts
      let dripCounts: any[] = [];
      try {
        const { data: dripData } = await supabase.rpc(
          'count_campaigns_for_contacts',
          { p_contact_ids: contactIds }
        );
        if (dripData) dripCounts = dripData;
      } catch (dripError) {
        console.error("Error fetching drip counts:", dripError);
      }
      
      // Get scheduled message counts
      let scheduledCounts: Record<number, number> = {};
      try {
        const { data: scheduledData } = await supabase
          .from('scheduled_messages')
          .select('id, contact_id')
          .in('contact_id', contactIds.map(id => id.toString()))
          .eq('owner_id', userId)
          .gt('scheduled_at', new Date().toISOString())
          .neq('status', 'sent');
          
        if (scheduledData && scheduledData.length > 0) {
          scheduledData.forEach((msg: any) => {
            const contactId = parseInt(msg.contact_id);
            scheduledCounts[contactId] = (scheduledCounts[contactId] || 0) + 1;
          });
        }
      } catch (schedError) {
        console.error("Error fetching scheduled messages:", schedError);
      }
      
      // Combine all data
      const contactsWithData = data.map((contact: Contact) => {
        const dripCountData = dripCounts.find((dc: {contact_id: number, campaign_count: number}) => 
          dc.contact_id === contact.id
        );
        
        return {
          ...contact,
          drip_campaign_count: dripCountData ? dripCountData.campaign_count : 0,
          scheduled_message_count: scheduledCounts[contact.id] || 0
        };
      });
      
      setContacts(contactsWithData);
      setTotalContacts(count || 0);
      setLastFetchTime(Date.now());
      setLastFetchedPage(currentPage);
      
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setContacts([]);
      setTotalContacts(0);
    } finally {
      setLoading(false);
      setSearchLoading(false);
    }
  }, [userId, currentPage, pageSize, searchTerm, contacts.length, lastFetchTime, CACHE_DURATION, lastFetchedPage]);

  // Update dependency array to include userId
  useEffect(() => {
    fetchContacts();
  }, [fetchContacts, userId, currentPage, searchTerm]);

  // Ensure search triggers fetchContacts and resets page
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Fetch daftar connections user
  useEffect(() => {
    const fetchConnections = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const { data, error } = await supabase
        .from('connections')
        .select('id, name')
        .eq('user_id', userData.user.id);
      if (!error && data) {
        setConnections(data);
        const map: Record<string, string> = {};
        data.forEach((c: any) => { map[c.id] = c.name; });
        setConnectionMap(map);
      }
    };
    fetchConnections();
  }, []);

  // Function to fetch drip campaign details for a contact
  const fetchDripCampaignDetails = async (contactId: number) => {
    setLoadingDripCampaigns(true);
    setDripCampaigns([]);
    
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error("User not logged in.");
      }
      const response = await fetch(`${API_URL}/drip/contacts/${contactId}/campaigns`, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        }
      });
      if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to load drip campaign details');
      }
      
      const data = await response.json();
      
      if (!data.success) {
          throw new Error(data.error || 'Failed to load drip campaign details');
      }
      
      // Process the data to ensure consistent status display
      const processedData = (data.campaigns || []).map((campaign: DripCampaignDetail) => ({
        ...campaign,
        status: campaign.status ? campaign.status.toLowerCase() : 'unknown',
        // Add a display_status field for UI
        display_status: campaign.status ? campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1) : 'Unknown'
      }));
      
      setDripCampaigns(processedData);
      
      // If no campaigns are found, show a toast
      if (processedData.length === 0) {
        toast({ 
          description: 'No campaign details found for this contact.',
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Error fetching drip campaign details:', error);
      toast({ 
        description: error instanceof Error ? error.message : 'Failed to load drip campaign details', 
        variant: 'destructive' 
      });
    } finally {
      setLoadingDripCampaigns(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!unsubscribeInfo) return;
    setIsUnsubscribing(true);
    try {
      const { subscriberId, contactId } = unsubscribeInfo;
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error("User not logged in.");
      }

      // Using the correct, more reliable endpoint now
      const response = await fetch(`${API_URL}/drip/subscribers/${subscriberId}`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId 
        },
        body: JSON.stringify({ cancelScheduledMessages: true }) // Match the body from the reference page
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to unsubscribe.');
      }

      toast({ description: "Successfully unsubscribed from the campaign." });
      
      // Refresh data
      setUnsubscribeInfo(null);
      fetchDripCampaignDetails(contactId); // Refresh details for the current contact
      fetchContacts(); // Refresh all contacts to update the count
      
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: 'destructive',
      });
    } finally {
      setIsUnsubscribing(false);
    }
  };

  // Toggle showing drip campaign details
  const toggleDripCampaigns = (contactId: number) => {
    if (showDripCampaigns === contactId) {
      setShowDripCampaigns(null);
    } else {
      setShowDripCampaigns(contactId);
      fetchDripCampaignDetails(contactId);
    }
  };

  // Fungsi hapus kontak dengan toast konfirmasi
  const handleDelete = (id: number) => {
    setShowDeleteToast({ id, open: true });
  };

  // Optimize confirmDelete to use cached userId
  const confirmDelete = async (id: number) => {
    setDeletingId(id);
    const contactToDelete = contacts.find(c => c.id === id);
    
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (!error) {
      setContacts(prev => prev.filter(c => c.id !== id));
      toast({ description: 'Contact deleted.' });
      
      // Use cached userId instead of making another request
      if (userId && contactToDelete?.phone_number) {
        fetch(`${API_URL}/contacts/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, phone_number: contactToDelete.phone_number })
        }).catch(() => {});
      }
    } else {
      toast({ description: 'Failed to delete contact', variant: 'destructive' });
    }
    setDeletingId(null);
    setShowDeleteToast(null);
  };

  // Fungsi edit kontak, tampilkan dialog
  const handleEdit = (contact: Contact) => {
    setEditContact(contact);
    setEditForm({
      contact_name: contact.contact_name || '',
      label: Array.isArray(contact.labels) ? contact.labels.join(', ') : '',
      phone_number: contact.phone_number,
    });
  };

  const handleEditFormChange = (field: keyof typeof editForm, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleEditSave = async () => {
    if (!editContact) return;
    setSavingEdit(true);
    const labelArr = editForm.label.split(',').map(l => l.trim()).filter(Boolean);
    const { error } = await supabase.from('contacts')
      .update({
        contact_name: editForm.contact_name,
        labels: labelArr,
        phone_number: editForm.phone_number,
      } as any).eq('id', editContact.id);
    setSavingEdit(false);
    if (!error) {
      setContacts(prev => prev.map(c => c.id === editContact.id ? { ...c, contact_name: editForm.contact_name, labels: labelArr, phone_number: editForm.phone_number } : c));
      setEditContact(null);
      toast({ description: 'Contact updated.' });
    } else {
      toast({ description: 'Failed to update contact', variant: 'destructive' });
    }
  };

  const handleBlockToggle = async (contact: Contact) => {
    const newStatus = !contact.is_blocked;
    const { error } = await (supabase as any).from('contacts').update({ is_blocked: newStatus }).eq('id', contact.id);
    if (!error) {
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, is_blocked: newStatus } : c));
      toast({ description: newStatus ? 'Contact blocked.' : 'Contact unblocked.' });
    } else {
      toast({ description: 'Failed to update block status', variant: 'destructive' });
    }
  };

  const handleAddLabel = async (contact: Contact) => {
    if (!newLabel) return;
    if (Array.isArray(contact.labels) && contact.labels.includes(newLabel)) {
      toast({ description: 'Label already exists.' });
      setNewLabel("");
      setOpenLabelPopoverId(null);
      return;
    }
    const updatedLabels = Array.isArray(contact.labels) ? [...contact.labels, newLabel] : [newLabel];
    const { error } = await supabase.from('contacts')
      .update({ labels: updatedLabels } as any).eq('id', contact.id);
    if (!error) {
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, labels: updatedLabels } : c));
      toast({ description: 'Label added.' });
    } else {
      toast({ description: 'Failed to add label', variant: 'destructive' });
    }
    setNewLabel("");
    setOpenLabelPopoverId(null);
  };

  // Fungsi hapus label dari kontak
  const handleRemoveLabel = async (contact: Contact, labelToRemove: string) => {
    const updatedLabels = (contact.labels || []).filter(l => l !== labelToRemove);
    const { error } = await supabase.from('contacts')
      .update({ labels: updatedLabels } as any).eq('id', contact.id);
    if (!error) {
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, labels: updatedLabels } : c));
      toast({ description: 'Label removed.' });
    } else {
      toast({ description: 'Failed to remove label', variant: 'destructive' });
    }
  };

  // Handler untuk select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(contacts.map(c => c.id));
    } else {
      setSelectedContacts([]);
    }
  };

  // Handler untuk select per kontak
  const handleSelectContact = (id: number, checked: boolean) => {
    setSelectedContacts(prev =>
      checked ? [...prev, id] : prev.filter(cid => cid !== id)
    );
  };

  // Ambil semua label unik dari kontak yang sudah dimuat
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach(c => (c.labels || []).forEach(l => l && set.add(l)));
    return Array.from(set);
  }, [contacts]);

  // Fungsi untuk mendapatkan kategori berdasarkan skor
  const getScoreCategory = (score: number | undefined): 'hot' | 'warm' | 'cold' => {
    if (!score) return 'cold';
    if (score >= 71) return 'hot';
    if (score >= 31) return 'warm';
    return 'cold';
  };

  // Modified getKanbanColumnName with caching
  const getKanbanColumnName = useCallback(async (columnId: string | undefined) => {
    if (!columnId) return "";
    
    // Check if we have cached kanban data that's still valid
    const now = Date.now();
    if (kanbanCache && kanbanCache.data && now - kanbanCache.timestamp < KANBAN_CACHE_DURATION) {
      const column = kanbanCache.data.find((col: any) => col.id === columnId);
      if (column) return column.title;
    }
    
    // If no valid cache, fetch from server
    try {
      const { data } = await supabase
        .from("kanban_columns")
        .select("title")
        .eq("id", columnId)
        .single();
        
      // Update cache with all columns
      if (!kanbanCache || now - kanbanCache.timestamp >= KANBAN_CACHE_DURATION) {
        const { data: allColumns } = await supabase.from("kanban_columns").select("*");
        if (allColumns) {
          setKanbanCache({
            data: allColumns,
            timestamp: now
          });
        }
      }
      
      return data?.title || "";
    } catch (error) {
      console.error("Error fetching kanban column:", error);
      return "";
    }
  }, [kanbanCache]);

  // Filter kontak berdasarkan label dan lead score (jangan filter searchTerm di sini, karena sudah di-backend)
  const filteredContacts = useMemo(() => {
    let filtered = [...contacts];
    // Filter berdasarkan label
    if (labelFilter) {
      filtered = filtered.filter(contact => 
        Array.isArray(contact.labels) && contact.labels.includes(labelFilter)
      );
    }
    // Filter berdasarkan kategori lead score
    if (leadScoreFilter) {
      filtered = filtered.filter(contact => {
        const category = getScoreCategory(contact.lead_score);
        return category === leadScoreFilter;
      });
    }
    return filtered;
  }, [contacts, labelFilter, leadScoreFilter]);

  // Add function to handle broadcast button click
  const handleBroadcastClick = async () => {
    if (selectedContacts.length === 0) {
      toast({ description: 'Please select at least one contact for broadcast.' });
      return;
    }

    try {
      // Store selected contact IDs in sessionStorage
      sessionStorage.setItem('selectedContactIds', JSON.stringify(selectedContacts));
      
      // Navigate to the correct broadcast creation page
      navigate('/dashboard/broadcast/create');
      
      toast({ description: `${selectedContacts.length} contacts selected for broadcast.` });
    } catch (error) {
      console.error('Error preparing contacts for broadcast:', error);
      toast({ description: 'Failed to prepare contacts for broadcast', variant: 'destructive' });
    }
  };

  // Navigate to drip campaign detail page
  const navigateToDripCampaign = (campaignId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/dashboard/drip-campaign/${campaignId}`);
  };

  // Open modal to add contact to drip campaign
  const handleOpenDripModal = (contact: Contact) => {
    setSelectedContactForDrip(contact);
    setIsDripModalOpen(true);
  };

  const handleAddNote = async (contactId: number) => {
    if (!newNote.trim()) return;

    const currentContact = contacts.find(c => c.id === contactId);
    if (!currentContact) return;

    const newNoteObject: Note = {
      id: `note_${Date.now()}`,
      content: newNote,
      created_at: new Date().toISOString(),
    };

    const existingNotes = Array.isArray(currentContact.notes) ? currentContact.notes : [];
    const updatedNotes = [newNoteObject, ...existingNotes];

    const { error } = await supabase
      .from('contacts')
      .update({ notes: updatedNotes as any })
      .eq('id', contactId);

    if (error) {
      toast({ description: 'Failed to add note.', variant: 'destructive' });
    } else {
      toast({ description: 'Note added.' });
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, notes: updatedNotes } : c));
      setNewNote("");
    }
  };
  
  const handleDeleteNote = async (contactId: number, noteId: string) => {
    const currentContact = contacts.find(c => c.id === contactId);
    if (!currentContact || !Array.isArray(currentContact.notes)) return;

    const updatedNotes = currentContact.notes.filter(note => note.id !== noteId);

    const { error } = await supabase
      .from('contacts')
      .update({ notes: updatedNotes as any })
      .eq('id', contactId);

    if (error) {
      toast({ description: 'Failed to delete note.', variant: 'destructive' });
    } else {
      toast({ description: 'Note deleted.' });
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, notes: updatedNotes } : c));
    }
  };

  // Function to get scheduled message counts
  const getScheduledMessageCounts = async (contactIds: number[]) => {
    // This function is now handled within fetchContacts
    // Keeping it as a no-op for compatibility
    return;
  };

  // Function to handle view contact details
  const handleViewContactDetails = (contact: Contact) => {
    setSelectedContactForDetail(contact);
    setIsDetailDialogOpen(true);
  };

  // Function to handle contact update from ContactDetailDialog
  const handleContactUpdated = (updatedContact: Contact) => {
    // Update contact in the contacts array
    setContacts(prev => 
      prev.map(c => c.id === updatedContact.id ? { ...c, ...updatedContact } : c)
    );
    setSelectedContactForDetail(updatedContact);
  };

  // Tambahkan fungsi untuk mengubah kolom kanban kontak
  const handleUpdateKanbanColumn = async (contactId: number, columnId: string) => {
    setUpdatingKanbanId(contactId);
    
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      
      // Menggunakan endpoint yang benar sesuai dengan implementasi di server
      const response = await fetch(`${API_URL}/kanban/contacts/${contactId}/move`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ newColumnId: columnId })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to update contact kanban column');
      }
      
      // Ambil data hasil update untuk memastikan kita mendapatkan data terbaru
      const updatedContact = await response.json();
      
      toast({
        title: "Success",
        description: "Contact moved to new kanban column",
      });
      
      // Update local state dengan data terbaru
      setContacts(prevContacts => 
        prevContacts.map(contact => 
          contact.id === contactId 
            ? { ...contact, ...updatedContact } 
            : contact
        )
      );
      
      // Refresh data drip campaign jika contact sedang ditampilkan detail drip campaign-nya
      if (showDripCampaigns === contactId) {
        fetchDripCampaignDetails(contactId);
      }
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setUpdatingKanbanId(null);
    }
  };

  // Tambahkan fungsi untuk memperbarui lead score
  const handleUpdateLeadScore = async (contactId: number, score: number) => {
    try {
      // Update state lokal terlebih dahulu untuk UI yang responsif
      setContacts(prevContacts => 
        prevContacts.map(contact => 
          contact.id === contactId 
            ? { ...contact, lead_score: score } 
            : contact
        )
      );
      
      // Tidak perlu memanggil API karena LeadScoreBadge sudah menangani pembaruan ke server
    } catch (error) {
      console.error("Error updating lead score:", error);
      toast({
        title: "Error",
        description: "Failed to update lead score",
        variant: "destructive"
      });
    }
  };

  // Pagination calculation fix
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalContacts / pageSize));
  }, [totalContacts, pageSize]);

  // Determine if it's the initial load (no data yet)
  const isInitialLoading = loading && contacts.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <form
            onSubmit={e => {
              e.preventDefault();
              setCurrentPage(1);
              setSearchTerm(searchInput);
              fetchContacts(true, searchInput); // Pass intended search term
            }}
            className="flex gap-2 items-center"
          >
            <Input
              placeholder="Search by name or phone..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="max-w-xs"
              disabled={loading}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={loading || searchLoading}
            >
              Search
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="ml-2"
              disabled={selectedContacts.length === 0}
              onClick={handleBroadcastClick}
            >
              Broadcast
            </Button>
            {searchLoading && <span className="text-xs text-gray-400 ml-2">Searching...</span>}
          </form>
          <div className="flex gap-2 items-center">
            <Label htmlFor="label-filter" className="text-xs">Filter Label:</Label>
            <select
              id="label-filter"
              className="border rounded px-3 py-2 text-xs min-w-[120px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-700"
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

            <Label htmlFor="lead-score-filter" className="text-xs ml-4">Lead Score:</Label>
            <select
              id="lead-score-filter"
              className="border rounded px-3 py-2 text-xs min-w-[120px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-700"
              value={leadScoreFilter}
              onChange={e => { setLeadScoreFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="">All Leads</option>
              <option value="hot">Hot Leads (71-100)</option>
              <option value="warm">Warm Leads (31-70)</option>
              <option value="cold">Cold Leads (0-30)</option>
            </select>
          </div>
        </div>
        {isInitialLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div>No contacts found.</div>
        ) : (
          <div className="relative">
            {/* Overlay spinner for smooth page transitions */}
            {loading && contacts.length > 0 && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10 backdrop-blur-sm transition-opacity duration-300">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            <div className={`overflow-x-auto ${loading ? 'pointer-events-none opacity-50' : ''}`}>
              <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">
                    <input
                      type="checkbox"
                      ref={headerCheckboxRef}
                      checked={contacts.length > 0 && selectedContacts.length === contacts.length}
                      onChange={e => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="text-left py-2 px-4">Contact</th>
                  <th className="text-left py-2 px-4">Kanban</th>
                  <th className="text-left py-2 px-4">Lead Score</th>
                  <th className="text-left py-2 px-4">Label</th>
                  <th className="text-left py-2 px-4">Drip Campaigns</th>
                  <th className="text-left py-2 px-4">Notes</th>
                  <th className="text-left py-2 px-4">Scheduled</th>
                  <th className="text-left py-2 px-4">Device</th>
                  <th className="text-center py-2 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <React.Fragment key={contact.id}>
                    <tr 
                      className="border-b hover:bg-muted/30 cursor-pointer" 
                      onClick={() => handleSelectContact(contact.id, !selectedContacts.includes(contact.id))}
                    >
                      <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedContacts.includes(contact.id)}
                          onChange={e => handleSelectContact(contact.id, e.target.checked)}
                        />
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex flex-col">
                          <span className="font-medium">{contact.contact_name || 'No Name'}</span>
                          <span className="text-sm text-muted-foreground">{contact.phone_number}</span>
                        </div>
                      </td>
                      <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="w-fit max-w-full">
                          <KanbanBadge
                            value={contact.kanban_column_id}
                            onChange={(columnId) => handleUpdateKanbanColumn(contact.id, columnId)}
                            isUpdating={updatingKanbanId === contact.id}
                            className="text-xs font-normal"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="w-fit max-w-full">
                          <LeadScoreBadge
                            score={contact.lead_score || 0}
                            contactId={contact.id}
                            onScoreChange={(newScore) => handleUpdateLeadScore(contact.id, newScore)}
                            className="text-xs font-normal"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center w-full gap-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {Array.isArray(contact.labels) && contact.labels.filter(Boolean).map((l, i) => (
                              <Badge key={i} variant="secondary" className="font-normal">
                                {l}
                                <button
                                  type="button"
                                  aria-label="Remove label"
                                  className="ml-1.5 -mr-1 p-0.5 rounded-full hover:bg-background/50 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveLabel(contact, l);
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                          <Popover 
                            open={openLabelPopoverId === contact.id}
                            onOpenChange={(open) => {
                              setOpenLabelPopoverId(open ? contact.id : null);
                              if (!open) {
                                setNewLabel('');
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 rounded-full flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-60" onClick={(e) => e.stopPropagation()}>
                              <div className="grid gap-4">
                                <div className="space-y-1">
                                  <h4 className="font-medium leading-none">Add Label</h4>
                                  <p className="text-sm text-muted-foreground">Add a new label to this contact.</p>
                                </div>
                                <div className="flex gap-2">
                                  <Input
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    placeholder="e.g. 'Leads'"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddLabel(contact);
                                      }
                                    }}
                                  />
                                  <Button onClick={() => handleAddLabel(contact)}>Add</Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                      <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {contact.drip_campaign_count && contact.drip_campaign_count > 0 ? (
                            <Badge
                              variant="outline"
                              className="cursor-pointer font-normal py-1 px-2.5 hover:bg-accent"
                              onClick={(e) => { 
                                e.stopPropagation();
                                toggleDripCampaigns(contact.id);
                              }}
                            >
                              {contact.drip_campaign_count} Campaign{contact.drip_campaign_count !== 1 ? 's' : ''}
                            </Badge>
                          ) : (
                            <span className="w-[88px]"></span> // Placeholder to maintain alignment
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDripModal(contact);
                                  }}
                                  className="h-6 w-6 rounded-full"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Add to Drip Campaign</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </td>
                      <td className="py-2 px-4 align-top" onClick={(e) => e.stopPropagation()}>
                        <Popover onOpenChange={(open) => !open && setNewNote("")}>
                          <PopoverTrigger asChild>
                            <button className="text-left w-full hover:bg-muted/50 p-1 rounded">
                              {contact.notes && contact.notes.length > 0 ? (
                                <>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(contact.notes[0].created_at).toLocaleDateString()}
                                  </p>
                                  <p className="line-clamp-2 text-sm">{contact.notes[0].content}</p>
                                </>
                              ) : (
                                <p className="text-sm text-muted-foreground">Add a note...</p>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="flex flex-col gap-4">
                              <div>
                                <h4 className="font-medium leading-none">Add New Note</h4>
                                <div className="flex gap-2 mt-2">
                                  <Input
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    placeholder="Type your note..."
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddNote(contact.id);
                                      }
                                    }}
                                  />
                                  <Button onClick={() => handleAddNote(contact.id)}>Add</Button>
                                </div>
                              </div>
                              <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                <h4 className="font-medium leading-none">History</h4>
                                {contact.notes && contact.notes.length > 0 ? (
                                  contact.notes.map((note) => (
                                    <div key={note.id} className="text-sm group relative">
                                      <p className="text-xs text-muted-foreground">
                                        {new Date(note.created_at).toLocaleString()}
                                      </p>
                                      <p className="whitespace-pre-wrap">{note.content}</p>
                              <button
                                          onClick={() => handleDeleteNote(contact.id, note.id)}
                                          className="absolute top-0 right-0 p-0.5 rounded-full bg-background/50 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                          <X className="w-3 h-3" />
                              </button>
                            </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground text-center py-2">No notes yet.</p>
                                )}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="py-2 px-4">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 relative"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setScheduledContactId(contact.id);
                                  setScheduledDialogOpen(true);
                                }}
                              >
                                <Clock className="w-4 h-4" />
                                {contact.scheduled_message_count > 0 && (
                                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                    {contact.scheduled_message_count}
                                  </span>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {contact.scheduled_message_count > 0
                                  ? `View ${
                                      contact.scheduled_message_count
                                    } scheduled message${
                                      contact.scheduled_message_count !== 1 ? 's' : ''
                                    }`
                                  : 'Schedule a message'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="py-2 px-4">
                        {contact.connection_id ? (
                          <Badge variant="secondary" className="px-2 py-0.5 text-xs font-normal rounded-full bg-muted/60 border border-muted-foreground/20 text-muted-foreground" style={{fontSize: '11px', fontWeight: 500, letterSpacing: 0.2}}>
                            {connectionMap[contact.connection_id] || contact.connection_id}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewContactDetails(contact)}
                            className="h-8 w-8"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View Details</span>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(contact)}>
                                <Edit className="mr-2 h-4 w-4" />
                                <span>Edit Contact</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleBlockToggle(contact)}>
                                 {contact.is_blocked ? 
                                   <ShieldOff className="mr-2 h-4 w-4" /> : 
                                   <ShieldCheck className="mr-2 h-4 w-4" />
                                 }
                                <span>{contact.is_blocked ? 'Unblock Contact' : 'Block Contact'}</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(contact.id)}
                                className="text-red-500 focus:text-red-500 focus:bg-red-50 dark:focus:bg-red-900/40"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete Contact</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                          {showDripCampaigns === contact.id && (
                      <tr key={`${contact.id}-details`} className="bg-muted/20 dark:bg-muted/10">
                        <td />
                        <td colSpan={6} className="px-6 py-4">
                              {loadingDripCampaigns ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading campaigns...</span>
                              </div>
                              ) : dripCampaigns.length > 0 ? (
                              <div>
                                <h4 className="font-semibold text-sm mb-2">Subscribed Campaigns</h4>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {dripCampaigns.map((campaign) => (
                                    <li 
                                      key={campaign.drip_campaign_id} 
                                      className="text-xs border rounded-lg p-3 bg-background hover:bg-muted/50 transition-colors group relative"
                                    >
                                      <button
                                        aria-label="Unsubscribe"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setUnsubscribeInfo({ 
                                            contactId: contact.id, 
                                            subscriberId: campaign.subscriber_id, 
                                            campaignName: campaign.campaign_name 
                                          });
                                        }}
                                        className="absolute top-1 right-1 p-1 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                      <div 
                                        className="font-semibold text-primary hover:underline cursor-pointer pr-4" 
                                        onClick={(e) => navigateToDripCampaign(campaign.drip_campaign_id, e)}
                                      >
                                        {campaign.campaign_name}
                                      </div>
                                      <div className="text-muted-foreground mt-1">
                                        Status: <Badge variant={
                                          campaign.status === 'active' ? 'default' : 
                                          campaign.status === 'paused' ? 'secondary' : 
                                          campaign.status === 'completed' ? 'outline' : 
                                          'secondary'
                                        } className="text-xs font-normal">
                                          {campaign.display_status}
                                        </Badge>
                                      </div>
                                      <div className="text-muted-foreground mt-1.5 flex items-center gap-1">
                                        <span>Last message:</span> 
                                        {campaign.last_message_order ? (
                                          <Badge variant="secondary" className="font-mono">
                                            #{campaign.last_message_order}
                                          </Badge>
                                        ) : (
                                          <span className="text-muted-foreground/80">None</span>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                        </div>
                      ) : (
                              <div className="text-xs text-muted-foreground py-4 text-center">No campaign details found for this contact.</div>
                      )}
                    </td>
                  </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            </div> {/* End overflow-x-auto */}
            {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {filteredContacts.length} of {totalContacts} contacts
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Dialog edit kontak */}
        <Dialog open={!!editContact} onOpenChange={open => !open && setEditContact(null)}>
          <DialogContent className="max-w-2xl w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl min-h-[40vh] p-8">
            <DialogHeader>
              <DialogTitle>Edit Contact</DialogTitle>
              <DialogDescription>Edit detail kontak Anda di bawah ini.</DialogDescription>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); handleEditSave(); }} className="space-y-6 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="edit-contact-name">Name</Label>
                  <Input id="edit-contact-name" value={editForm.contact_name} onChange={e => handleEditFormChange('contact_name', e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="edit-contact-label">Label <span className="text-xs text-gray-400">(comma separated)</span></Label>
                  <Input id="edit-contact-label" value={editForm.label} onChange={e => handleEditFormChange('label', e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="edit-contact-phone">Phone</Label>
                  <Input id="edit-contact-phone" value={editForm.phone_number} onChange={e => handleEditFormChange('phone_number', e.target.value)} required />
                </div>
              </div>
              <DialogFooter className="flex flex-row justify-end gap-4 mt-8">
                <Button type="button" variant="outline" onClick={() => setEditContact(null)} disabled={savingEdit}>Cancel</Button>
                <Button type="submit" disabled={savingEdit}>Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {/* Dialog konfirmasi hapus */}
        <Dialog open={!!showDeleteToast} onOpenChange={open => !open && setShowDeleteToast(null)}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle>Delete Contact</DialogTitle>
              <DialogDescription>Are you sure you want to delete this contact?</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-row justify-end gap-4 mt-4">
              <Button variant="destructive" onClick={() => confirmDelete(showDeleteToast?.id!)} disabled={deletingId === showDeleteToast?.id}>Yes</Button>
              <Button variant="outline" onClick={() => setShowDeleteToast(null)} disabled={deletingId === showDeleteToast?.id}>No</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Dialog konfirmasi unsubscribe */}
        <Dialog open={!!unsubscribeInfo} onOpenChange={() => setUnsubscribeInfo(null)}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle>Konfirmasi Hapus Subscriber</DialogTitle>
              <DialogDescription>
                Apakah Anda yakin ingin menghapus subscriber ini dari campaign "{unsubscribeInfo?.campaignName}"? Tindakan ini tidak dapat dibatalkan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-row justify-end gap-4 mt-4">
              <Button 
                variant="outline" 
                onClick={() => setUnsubscribeInfo(null)}
                disabled={isUnsubscribing}
              >
                Batal
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleUnsubscribe}
                disabled={isUnsubscribing}
              >
                {isUnsubscribing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Hapus
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ScheduledMessageDialog
          open={scheduledDialogOpen}
          onOpenChange={setScheduledDialogOpen}
          contactId={scheduledContactId || 0}
          ownerId={ownerId}
          onMessagesUpdate={fetchContacts}
        />
        <AddContactToCampaignModal
          isOpen={isDripModalOpen}
          onClose={() => setIsDripModalOpen(false)}
          contact={selectedContactForDrip}
          onEnrolled={() => {
            fetchContacts(); // Refresh contact list
          }}
        />
        <ContactDetailDialog
          open={isDetailDialogOpen}
          onOpenChange={setIsDetailDialogOpen}
          contact={selectedContactForDetail}
          onContactUpdated={handleContactUpdated}
        />
      </CardContent>
    </Card>
  );
};

export default ContactsPage; 