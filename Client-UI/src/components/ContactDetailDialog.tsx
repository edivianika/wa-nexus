import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Mail, Calendar, Clock, Tag, Info, User, Plus, X, ChevronDown, ChevronRight, ScrollText, Pencil, Trash2, Check, Flame } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { LeadScoreBadge } from "@/components/LeadScoreBadge";

interface ContactDetail {
  [key: string]: any;
}

interface Note {
  id: string;
  content: string;
  created_at: string;
}

interface ContactDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: number;
    contact_name: string | null;
    phone_number: string;
    email?: string | null;
    labels?: string[];
    contact_detail?: ContactDetail;
    notes?: Note[];
    created_at?: string;
    updated_at?: string;
    lead_score?: number;
  } | null;
  onContactUpdated?: (updatedContact: any) => void;
}

// Default fields for contact details
const DEFAULT_FIELDS = ["address","city" , "birthday", "Title"];

export function ContactDetailDialog({
  open,
  onOpenChange,
  contact,
  onContactUpdated,
}: ContactDetailDialogProps) {
  const [editableDetail, setEditableDetail] = useState<ContactDetail>({});
  const [isSaving, setIsSaving] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [showNewFieldForm, setShowNewFieldForm] = useState(false);
  const [showBasicInfo, setShowBasicInfo] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [showNotes, setShowNotes] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [editingField, setEditingField] = useState<{key: string, value: string} | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [showAddLabelForm, setShowAddLabelForm] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [updatingLeadScore, setUpdatingLeadScore] = useState(false);

  // Fungsi untuk memperbarui lead score
  const handleUpdateLeadScore = async (newScore: number) => {
    if (!contact) return;
    
    try {
      // Update lokal untuk UI yang responsif
      if (onContactUpdated) {
        onContactUpdated({
          ...contact,
          lead_score: newScore
        });
      }
    } catch (error) {
      console.error("Error updating lead score:", error);
      toast({
        variant: "destructive",
        description: "Failed to update lead score",
      });
    }
  };

  // Reset state when dialog opens/closes or contact changes
  useEffect(() => {
    if (open && contact) {
      // Ensure all default fields exist in contact_detail
      const details = contact.contact_detail ? { ...contact.contact_detail } : {};
      DEFAULT_FIELDS.forEach(field => {
        if (details[field] === undefined) {
          details[field] = "";
        }
      });
      setEditableDetail(details);
      setShowBasicInfo(true);
      setShowDetails(true);
      setShowNotes(true);
      setShowLabels(true);
      setEditingName(false);
      setEditedName(contact.contact_name || "");
    } else {
      setShowNewFieldForm(false);
      setEditingField(null);
      setShowAddLabelForm(false);
      setEditingName(false);
    }
  }, [open, contact]);

  if (!contact) return null;

  // Format date nicely
  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  // Get contact detail entries for display
  const contactDetailEntries = editableDetail
    ? Object.entries(editableDetail)
    : [];

  // Format value for display
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  };

  // Add new field
  const handleAddField = () => {
    setShowNewFieldForm(true);
  };

  // Start editing field
  const handleEditField = (key: string, value: string) => {
    setEditingField({ key, value });
  };

  // Save edited field
  const handleSaveEdit = () => {
    if (!editingField) return;
    
    const updatedDetails = { ...editableDetail };
    updatedDetails[editingField.key] = editingField.value;
    
    saveContactDetails(updatedDetails);
    setEditingField(null);
  };

  // Cancel editing field
  const handleCancelEdit = () => {
    setEditingField(null);
  };

  // Save new field
  const handleSaveNewField = () => {
    if (!newFieldKey.trim()) {
      toast({
        variant: "destructive",
        description: "Field name cannot be empty",
      });
      return;
    }

    // Check if field already exists
    if (editableDetail[newFieldKey]) {
      toast({
        variant: "destructive",
        description: "Field already exists",
      });
      return;
    }

    const updatedDetails = {
      ...editableDetail,
      [newFieldKey]: newFieldValue
    };

    saveContactDetails(updatedDetails);
    setNewFieldKey("");
    setNewFieldValue("");
    setShowNewFieldForm(false);
  };

  // Remove field
  const handleRemoveField = (key: string) => {
    // Don't allow removing default fields, just clear their value
    const updatedDetails = { ...editableDetail };
    
    if (DEFAULT_FIELDS.includes(key)) {
      updatedDetails[key] = "";
      toast({
        description: `Field "${key}" has been cleared (default fields cannot be removed)`,
      });
    } else {
      delete updatedDetails[key];
      toast({
        description: `Field "${key}" has been removed`,
      });
    }
    
    saveContactDetails(updatedDetails);
  };

  // Save contact details to database
  const saveContactDetails = async (details: ContactDetail) => {
    if (!contact) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ contact_detail: details })
        .eq('id', contact.id);
        
      if (error) throw error;
      
      toast({
        description: "Contact details updated successfully",
      });
      
      // Update local state
      setEditableDetail(details);
      
      // Update the contact in the parent component
      const updatedContact = {
        ...contact,
        contact_detail: details
      };
      
      // Call the callback if provided
      if (onContactUpdated) {
        onContactUpdated(updatedContact);
      }
      
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to update contact details",
      });
      console.error("Error updating contact details:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Add new label
  const handleAddLabel = async () => {
    if (!newLabel.trim()) {
      toast({
        variant: "destructive",
        description: "Label cannot be empty",
      });
      return;
    }

    const currentLabels = Array.isArray(contact.labels) ? [...contact.labels] : [];
    
    // Check if label already exists
    if (currentLabels.includes(newLabel)) {
      toast({
        variant: "destructive",
        description: "Label already exists",
      });
      return;
    }
    
    const updatedLabels = [...currentLabels, newLabel];
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ labels: updatedLabels })
        .eq('id', contact.id);
        
      if (error) throw error;
      
      toast({
        description: "Label added successfully",
      });
      
      // Update the contact in the parent component
      const updatedContact = {
        ...contact,
        labels: updatedLabels
      };
      
      // Call the callback if provided
      if (onContactUpdated) {
        onContactUpdated(updatedContact);
      }
      
      setNewLabel("");
      setShowAddLabelForm(false);
      
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to add label",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Remove label
  const handleRemoveLabel = async (labelToRemove: string) => {
    const currentLabels = Array.isArray(contact.labels) ? [...contact.labels] : [];
    const updatedLabels = currentLabels.filter(label => label !== labelToRemove);
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ labels: updatedLabels })
        .eq('id', contact.id);
        
      if (error) throw error;
      
      toast({
        description: "Label removed successfully",
      });
      
      // Update the contact in the parent component
      const updatedContact = {
        ...contact,
        labels: updatedLabels
      };
      
      // Call the callback if provided
      if (onContactUpdated) {
        onContactUpdated(updatedContact);
      }
      
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to remove label",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Add new note
  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast({
        variant: "destructive",
        description: "Note cannot be empty",
      });
      return;
    }

    const newNoteObj = {
      id: `note_${Date.now()}`,
      content: newNote,
      created_at: new Date().toISOString()
    };

    const existingNotes = Array.isArray(contact.notes) ? contact.notes : [];
    const updatedNotes = [newNoteObj, ...existingNotes];

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ notes: updatedNotes })
        .eq('id', contact.id);
        
      if (error) throw error;
      
      toast({
        description: "Note added successfully",
      });
      
      // Update the contact in the parent component
      const updatedContact = {
        ...contact,
        notes: updatedNotes
      };
      
      // Call the callback if provided
      if (onContactUpdated) {
        onContactUpdated(updatedContact);
      }
      
      setNewNote("");
      
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to add note",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    if (!contact.notes) return;

    const updatedNotes = contact.notes.filter(note => note.id !== noteId);

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ notes: updatedNotes })
        .eq('id', contact.id);
        
      if (error) throw error;
      
      toast({
        description: "Note deleted successfully",
      });
      
      // Update the contact in the parent component
      const updatedContact = {
        ...contact,
        notes: updatedNotes
      };
      
      // Call the callback if provided
      if (onContactUpdated) {
        onContactUpdated(updatedContact);
      }
      
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to delete note",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Save edited contact name
  const handleSaveContactName = async () => {
    if (!contact) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ contact_name: editedName })
        .eq('id', contact.id);
        
      if (error) throw error;
      
      toast({
        description: "Contact name updated successfully",
      });
      
      // Update the contact in the parent component
      const updatedContact = {
        ...contact,
        contact_name: editedName
      };
      
      // Call the callback if provided
      if (onContactUpdated) {
        onContactUpdated(updatedContact);
      }
      
      setEditingName(false);
      
    } catch (error) {
      toast({
        variant: "destructive",
        description: "Failed to update contact name",
      });
      console.error("Error updating contact name:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && contact && onContactUpdated) {
        // Fetch updated contact data before closing
        supabase
          .from('contacts')
          .select('*')
          .eq('id', contact.id)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              // Refresh contact data when dialog is closed with latest data from server
              onContactUpdated(data);
            } else {
              // Fallback to current contact data if fetch fails
              onContactUpdated({
                ...contact,
                contact_detail: editableDetail,
                labels: contact.labels
              });
            }
          });
      }
      onOpenChange(isOpen);
    }}>
      <DialogContent className={cn(
        "sm:max-w-[550px] md:max-w-[600px] max-h-[85vh] p-0 overflow-hidden flex flex-col",
        "border-border dark:border-zinc-800",
        "bg-background/95 dark:bg-zinc-900/95"
      )}>
        <div className="p-5 border-b border-border dark:border-zinc-800">
          <div className="flex justify-between items-start">
            <div className="flex-grow">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 max-w-[250px]">
                    <Input 
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="text-xl font-semibold"
                      placeholder="Contact name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveContactName();
                        } else if (e.key === 'Escape') {
                          setEditingName(false);
                          setEditedName(contact.contact_name || "");
                        }
                      }}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => {
                        setEditingName(false);
                        setEditedName(contact.contact_name || "");
                      }}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="default" 
                      size="icon" 
                      onClick={handleSaveContactName}
                      disabled={isSaving}
                      className="h-8 w-8 bg-blue-600 hover:bg-blue-700"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h2 className="text-xl font-semibold">
                    {contact.contact_name || "Unnamed Contact"}
                  </h2>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                      setEditingName(true);
                      setEditedName(contact.contact_name || "");
                    }}
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <div className="text-sm text-muted-foreground mt-1 flex items-center">
                <Phone className="h-3.5 w-3.5 mr-1.5" />
                {contact.phone_number}
              </div>
              
              {/* Labels moved here */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <div className="flex items-center">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 p-0 hover:bg-transparent hover:text-foreground"
                    onClick={() => setShowAddLabelForm(!showAddLabelForm)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    <span className="text-xs">Add Label</span>
                  </Button>
                </div>
                {contact.labels && contact.labels.length > 0 && (
                  contact.labels.map((label, index) => (
                    <Badge key={index} variant="secondary" className="text-xs py-0 px-2 group">
                      {label}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveLabel(label)}
                        className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2 w-2" />
                      </Button>
                    </Badge>
                  ))
                )}
              </div>
              
              {/* Add label form */}
              {showAddLabelForm && (
                <div className="flex items-center gap-2 mt-2">
                  <Input 
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="New label"
                    className="text-xs flex-1 h-7"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLabel();
                      }
                    }}
                  />
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleAddLabel}
                    disabled={isSaving || !newLabel.trim()}
                    className="h-7 bg-blue-600 hover:bg-blue-700 text-xs"
                  >
                    Add
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setShowAddLabelForm(false)}
                    className="h-7 w-7"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <ScrollArea className="flex-grow px-0 overflow-y-auto custom-scrollbar">
          <div className="p-5 space-y-3">
            {/* Basic Information Section */}
            <div className="border border-border dark:border-zinc-800 rounded-lg overflow-hidden bg-card/50 dark:bg-zinc-900/30">
              <button 
                className="flex items-center justify-between w-full text-left p-3 hover:bg-muted/50 dark:hover:bg-zinc-800/30 transition-colors"
                onClick={() => setShowBasicInfo(!showBasicInfo)}
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Basic Information</h3>
                </div>
                {showBasicInfo ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              
              {showBasicInfo && (
                <div className="p-3 space-y-2 border-t border-border dark:border-zinc-800">
                  <div className="space-y-4">
                    {/* Contact Name */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Name:</span>
                      </div>
                      
                      {editingName ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            className="h-8 w-[200px]"
                          />
                          <Button size="sm" variant="ghost" onClick={handleSaveContactName}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{contact.contact_name || "No Name"}</span>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingName(true);
                            setEditedName(contact.contact_name || "");
                          }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* Phone Number */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Phone:</span>
                      </div>
                      <span>{contact.phone_number}</span>
                    </div>
                    
                    {/* Email */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Email:</span>
                      </div>
                      <span>{contact.email || "Not provided"}</span>
                    </div>
                    
                    {/* Lead Score */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Flame className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Lead Score:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <LeadScoreBadge
                          score={contact.lead_score || 0}
                          contactId={contact.id}
                          onScoreChange={handleUpdateLeadScore}
                        />
                      </div>
                    </div>
                    
                    {/* Created At */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Created:</span>
                      </div>
                      <span>{formatDate(contact.created_at)}</span>
                    </div>
                    
                    {/* Updated At */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Updated:</span>
                      </div>
                      <span>{formatDate(contact.updated_at)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Additional Details Section */}
            <div className="border border-border dark:border-zinc-800 rounded-lg overflow-hidden bg-card/50 dark:bg-zinc-900/30">
              <button 
                className="flex items-center justify-between w-full text-left p-3 hover:bg-muted/50 dark:hover:bg-zinc-800/30 transition-colors"
                onClick={() => setShowDetails(!showDetails)}
              >
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Additional Details</h3>
                </div>
                {showDetails ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              
              {showDetails && (
                <div className="divide-y divide-border dark:divide-zinc-800">
                  {contactDetailEntries.map(([key, value], index) => (
                    <div key={index} className="p-2.5 group hover:bg-muted/20 dark:hover:bg-zinc-800/20">
                      {editingField && editingField.key === key ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="font-medium text-xs text-muted-foreground capitalize mb-1">
                              {key.replace(/_/g, ' ')}:
                            </div>
                            <Input 
                              value={editingField.value}
                              onChange={(e) => setEditingField({...editingField, value: e.target.value})}
                              className="text-xs"
                            />
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={handleCancelEdit}
                              className="h-7 w-7"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="default" 
                              size="icon" 
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="h-7 w-7 bg-blue-600 hover:bg-blue-700"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-xs text-muted-foreground capitalize">
                            {key.replace(/_/g, ' ')}:
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{formatValue(value)}</span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleEditField(key, String(value))}
                                className="h-5 w-5"
                                title="Edit"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveField(key);
                                }}
                                className="h-5 w-5 text-red-500 hover:text-red-400"
                                title={DEFAULT_FIELDS.includes(key) ? "Clear value" : "Delete field"}
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {!showNewFieldForm && (
                    <div className="p-2.5">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleAddField}
                        className="w-full flex items-center justify-center text-xs h-7"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Field
                      </Button>
                    </div>
                  )}
                </div>
              )}
              
              {showDetails && showNewFieldForm && (
                <div className="p-3 bg-muted/20 dark:bg-zinc-800/20 border-t border-border dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-xs text-muted-foreground capitalize mb-1">
                        Field Name:
                      </div>
                      <Input 
                        value={newFieldKey}
                        onChange={(e) => setNewFieldKey(e.target.value)}
                        placeholder="Field name"
                        className="text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-xs text-muted-foreground capitalize mb-1">
                        Value:
                      </div>
                      <Input 
                        value={newFieldValue}
                        onChange={(e) => setNewFieldValue(e.target.value)}
                        placeholder="Value"
                        className="text-xs"
                      />
                    </div>
                    <div className="flex gap-1 self-end">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setShowNewFieldForm(false)}
                        className="h-7 w-7"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="default" 
                        size="icon" 
                        onClick={handleSaveNewField}
                        disabled={isSaving}
                        className="h-7 w-7 bg-blue-600 hover:bg-blue-700"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="border border-border dark:border-zinc-800 rounded-lg overflow-hidden bg-card/50 dark:bg-zinc-900/30">
              <button 
                className="flex items-center justify-between w-full text-left p-3 hover:bg-muted/50 dark:hover:bg-zinc-800/30 transition-colors"
                onClick={() => setShowNotes(!showNotes)}
              >
                <div className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">Notes</h3>
                </div>
                {showNotes ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              
              {showNotes && (
                <div className="p-3 border-t border-border dark:border-zinc-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Input 
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note..."
                      className="text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddNote();
                        }
                      }}
                    />
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={handleAddNote}
                      disabled={isSaving || !newNote.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs"
                    >
                      Add
                    </Button>
                  </div>
                  
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar-inner">
                    {contact.notes && contact.notes.length > 0 ? (
                      contact.notes.map((note) => (
                        <div key={note.id} className="bg-muted/30 dark:bg-zinc-800/30 p-2 rounded-md relative group">
                          <div className="text-xs text-muted-foreground mb-1">
                            {formatDate(note.created_at)}
                          </div>
                          <div className="text-xs whitespace-pre-wrap pr-6">
                            {note.content}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteNote(note.id)}
                            className="h-5 w-5 absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground py-3 text-center">
                        No notes yet
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t border-border dark:border-zinc-800">
          <Button 
            variant="default" 
            className="w-full bg-blue-600 hover:bg-blue-700 text-sm" 
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(false);
            }}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ContactDetailDialog; 