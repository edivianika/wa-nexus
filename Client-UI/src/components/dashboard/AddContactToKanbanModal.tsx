import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Contact {
  id: number;
  contact_name: string;
}

interface KanbanColumn {
  id: string;
  title: string;
}

interface AddContactToKanbanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactAdded: () => void;
  columns: KanbanColumn[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const AddContactToKanbanModal = ({ isOpen, onClose, onContactAdded, columns }: AddContactToKanbanModalProps) => {
  const [unassignedContacts, setUnassignedContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedColumnId, setSelectedColumnId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUnassignedContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) throw new Error("User not authenticated.");

      const response = await fetch(`${API_URL}/kanban/contacts/unassigned`, {
        headers: { 'x-user-id': userId }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch unassigned contacts.');
      }
      const data = await response.json();
      setUnassignedContacts(data);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchUnassignedContacts();
      // Set default column if available
      if (columns.length > 0) {
        setSelectedColumnId(columns[0].id);
      }
    }
  }, [isOpen, fetchUnassignedContacts, columns]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId || !selectedColumnId) {
      toast.error("Please select a contact and a column.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) throw new Error("User not authenticated.");

      const response = await fetch(`${API_URL}/kanban/columns/${selectedColumnId}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ contactId: parseInt(selectedContactId, 10) }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add contact to the board.');
      }

      toast.success("Contact added to board successfully");
      onContactAdded();
      onClose();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Contact to Kanban</DialogTitle>
          <DialogDescription>
            Select a contact and the column where you want to add it.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact">Contact</Label>
              <Select 
                value={selectedContactId} 
                onValueChange={setSelectedContactId}
                disabled={isLoading || unassignedContacts.length === 0}
              >
                <SelectTrigger id="contact">
                  <SelectValue placeholder={
                    unassignedContacts.length === 0 
                      ? 'No available contacts' 
                      : 'Select a contact'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {unassignedContacts.map(contact => (
                    <SelectItem key={contact.id} value={contact.id.toString()}>
                      {contact.contact_name || `Contact #${contact.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="column">Column</Label>
              <Select 
                value={selectedColumnId} 
                onValueChange={setSelectedColumnId}
                disabled={isLoading}
              >
                <SelectTrigger id="column">
                  <SelectValue placeholder="Select a column" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map(column => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !selectedContactId || !selectedColumnId}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddContactToKanbanModal; 