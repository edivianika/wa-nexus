import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from './ui/use-toast';
import { format } from 'date-fns';
import { Trash2, Edit, Plus, Calendar, Clock, Check, X, AlertCircle, RefreshCw, ScrollText, Loader2, Image, Video, Music, FileText, ArrowLeft, MessageSquare, ImageIcon, CalendarClock, Save, Send, Smartphone } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { AssetPicker } from './asset/AssetPicker';
import { Asset } from '@/services/assetService';
import assetService from '@/services/assetService';
import { Badge } from './ui/badge';

interface ScheduledMessage {
  id: string;
  connection_id: string;
  contact_id: string | number;
  message: string;
  type: string;
  media_url?: string;
  caption?: string;
  scheduled_at: string;
  status: string;
  created_at: string;
  owner_id?: string;
  sent_at?: string;
  message_id?: string;
  error?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string;
  next_scheduled_at?: string;
  media?: any;
  asset_id?: string;
}

interface ContactInfo {
  contact_name: string | null;
  phone_number: string;
}

interface Connection {
  id: string;
  name: string;
  phone_number?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | number;
  ownerId: string;
  onMessagesUpdate?: () => void;
}

const ScheduledMessageDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  contactId,
  ownerId,
  onMessagesUpdate,
}) => {
  const [tab, setTab] = useState('view');
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [editingMessage, setEditingMessage] = useState<ScheduledMessage | null>(null);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  
  // Form state for creating/editing messages
  const [formData, setFormData] = useState({
    connection_id: '',
    message: '',
    scheduled_at: new Date(Date.now() + 30 * 60000), // 30 minutes from now
    is_recurring: false,
    recurrence_pattern: 'daily',
    type: 'text',
    media_url: '',
    caption: '',
    asset_id: ''
  });

  // Add state for selected asset
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Fetch scheduled messages when dialog opens
  useEffect(() => {
    if (open && contactId) {
      fetchScheduledMessages();
      fetchConnections();
      fetchContactInfo();
    }
  }, [open, contactId]);

  // Fetch contact info
  const fetchContactInfo = async () => {
    if (!contactId) return;
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('contact_name, phone_number')
        .eq('id', contactId)
        .single();

      if (error) {
        console.error('Error fetching contact details:', error);
        setContactInfo(null);
        return;
      }
      setContactInfo(data);
    } catch (error) {
      console.error('Failed to fetch contact details', error);
      setContactInfo(null);
    }
  };

  // Fetch scheduled messages for the contact
  const fetchScheduledMessages = async () => {
    if (!contactId) return;
    
    setLoading(true);
    try {
      console.log('Fetching scheduled messages for contact:', contactId, 'owner:', ownerId);
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching scheduled messages:', error);
        throw error;
      }
      console.log('Fetched scheduled messages:', data);
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load scheduled messages',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch available connections
  const fetchConnections = async () => {
    if (!ownerId) return;
    try {
      const { data, error } = await supabase
        .from('connections')
        .select('id, name, phone_number')
        .eq('connected', true)
        .eq('user_id', ownerId);
      
      if (error) throw error;
      console.log('Fetched connections:', data);
      setConnections(data || []);
      
      // Set default connection if available
      if (data && data.length > 0 && !formData.connection_id) {
        setFormData(prev => ({ ...prev, connection_id: data[0].id }));
      }
    } catch (error) {
      console.error('Error fetching connections:', error);
    }
  };

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle checkbox changes
  const handleCheckboxChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, is_recurring: checked }));
  };

  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle date changes
  const handleDateChange = (date: Date | null) => {
    if (date) {
      setFormData(prev => ({ ...prev, scheduled_at: date }));
    }
  };

  // Validate UUID format
  const isValidUUID = (uuid: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  // Handle asset selection
  const handleAssetSelected = (asset: Asset) => {
    setSelectedAsset(asset);
    setFormData(prev => ({
      ...prev,
      type: asset.assetType || 'document',
      media_url: asset.url || '',
      asset_id: asset.id
    }));
  };
  
  // Remove selected asset
  const handleRemoveAsset = () => {
    setSelectedAsset(null);
    setFormData(prev => ({
      ...prev,
      type: 'text',
      media_url: '',
      asset_id: ''
    }));
  };

  // Create a new scheduled message
  const handleCreateMessage = async () => {
    // Adjusted validation: message is not required if an asset is selected
    if (!formData.connection_id || (!formData.message && !formData.media_url) || !formData.scheduled_at) {
      toast({
        title: 'Validation Error',
        description: 'Please select a device, add a message or media, and set a schedule.',
        variant: 'destructive'
      });
      return;
    }

    if (!isValidUUID(ownerId)) {
      toast({
        title: 'Error',
        description: 'Invalid owner ID format',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const nextScheduledDate = formData.is_recurring 
        ? getNextScheduledDate(formData.scheduled_at, formData.recurrence_pattern).toISOString() 
        : null;

      // Create a simplified object that matches the actual database schema
      const newMessage = {
        connection_id: formData.connection_id,
        contact_id: contactId,
        message: formData.message,
        type: selectedAsset ? 'media' : 'text',
        media_url: selectedAsset ? selectedAsset.url : null,
        caption: selectedAsset ? formData.message : null,
        scheduled_at: formData.scheduled_at.toISOString(),
        owner_id: ownerId,
        status: 'pending',
        is_recurring: formData.is_recurring,
        recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : null,
        next_scheduled_at: nextScheduledDate,
        asset_id: selectedAsset ? selectedAsset.id : null
      };

      console.log('Creating scheduled message:', newMessage);
      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert(newMessage)
        .select();

      if (error) {
        console.error('Error creating scheduled message:', error);
        throw error;
      }

      console.log('Scheduled message created:', data);
      toast({
        title: 'Success',
        description: 'Message scheduled successfully',
      });

      setFormData({
        ...formData,
        message: '',
        type: 'text',
        media_url: '',
        caption: '',
        asset_id: '',
      });
      fetchScheduledMessages();
      onMessagesUpdate?.();

      // Record asset usage if an asset was selected
      if (selectedAsset && data && data.length > 0) {
        try {
          // Access the first record's id
          const newMessageId = data[0].id;
          await assetService.recordAssetUsage(
            selectedAsset.id,
            'scheduled_message',
            newMessageId 
          );
        } catch (error) {
          console.error('Failed to record asset usage:', error);
          // Don't fail the whole operation if just the tracking fails
        }
      }
    } catch (error: any) {
      console.error('Error creating scheduled message:', error);
      toast({
        title: 'Error',
        description: `Failed to create scheduled message: ${error.message || 'Unknown error'}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Update an existing scheduled message
  const handleUpdateMessage = async () => {
    if (!editingMessage) return;

    setLoading(true);
    try {
      const nextScheduledDate = formData.is_recurring 
        ? getNextScheduledDate(formData.scheduled_at, formData.recurrence_pattern).toISOString() 
        : null;

      // Update message in database
      const { error } = await supabase
        .from('scheduled_messages')
        .update({
          connection_id: formData.connection_id,
          message: formData.message,
          type: formData.type,
          media_url: formData.media_url || null,
          caption: formData.caption || null,
          scheduled_at: formData.scheduled_at.toISOString(),
          status: 'pending',
          is_recurring: formData.is_recurring,
          recurrence_pattern: formData.is_recurring ? formData.recurrence_pattern : null,
          next_scheduled_at: nextScheduledDate,
          asset_id: formData.asset_id || null
        })
        .eq('id', editingMessage.id);

      if (error) {
        console.error('Error updating scheduled message:', error);
        throw error;
      }

      toast({
        title: 'Success',
        description: 'Scheduled message updated successfully',
      });

      // Reset edit mode and refresh messages
      setEditingMessage(null);
      fetchScheduledMessages();
      onMessagesUpdate?.();

      // Record asset usage if a new asset was selected
      if (formData.asset_id && formData.asset_id !== editingMessage.asset_id) {
        try {
          await assetService.recordAssetUsage(
            formData.asset_id,
            'scheduled_message',
            editingMessage.id
          );
        } catch (error) {
          console.error('Failed to record asset usage:', error);
          // Don't fail the whole operation if just the tracking fails
        }
      }
    } catch (error: any) {
      console.error('Error updating scheduled message:', error);
      toast({
        title: 'Error',
        description: `Failed to update scheduled message: ${error.message || 'Unknown error'}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Delete a scheduled message
  const handleDeleteMessage = async (id: string) => {

    setLoading(true);
    try {
      console.log('Deleting scheduled message:', id);
      const { error } = await supabase
        .from('scheduled_messages')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting scheduled message:', error);
        throw error;
      }

      toast({
        title: 'Success',
        description: 'Scheduled message deleted successfully',
      });

      fetchScheduledMessages();
      onMessagesUpdate?.();
    } catch (error: any) {
      console.error('Error deleting scheduled message:', error);
      toast({
        title: 'Error',
        description: `Failed to delete scheduled message: ${error.message || 'Unknown error'}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Edit a scheduled message
  const handleEditMessage = (message: ScheduledMessage) => {
    setEditingMessage(message);
    setFormData({
      connection_id: message.connection_id,
      message: message.message || '',
      scheduled_at: message.scheduled_at ? new Date(message.scheduled_at) : new Date(),
      is_recurring: message.is_recurring || false,
      recurrence_pattern: message.recurrence_pattern || 'daily',
      type: message.type || 'text',
      media_url: message.media_url || '',
      caption: message.caption || '',
      asset_id: message.asset_id || ''
    });
    
    // If message has media, try to load the asset info
    if (message.media_url && message.asset_id) {
      assetService.getAssetById(message.asset_id)
        .then(asset => {
          setSelectedAsset(asset);
        })
        .catch(error => {
          console.error('Failed to load asset details:', error);
          // Don't block the editing if asset details can't be loaded
        });
    }
    
    setTab('create');
  };

  // Helper function to calculate next scheduled date based on recurrence pattern
  const getNextScheduledDate = (currentDate: Date, pattern: string): Date => {
    const nextDate = new Date(currentDate);
    
    switch (pattern) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      default:
        nextDate.setDate(nextDate.getDate() + 1);
    }
    
    return nextDate;
  };

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'sent':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingMessage(null);
    setTab('view');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto p-6 dark:bg-zinc-900" data-no-autofocus>
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2.5 text-xl">
              <Clock className="w-6 h-6 text-primary" />
              {editingMessage ? 'Edit Scheduled Message' : 'Schedule Message'}
            </DialogTitle>
          </DialogHeader>

          {contactInfo && (
            <div className="text-sm text-muted-foreground pt-1 pb-4 border-b border-dashed">
              <strong className="text-foreground">To:</strong> {contactInfo.contact_name || 'No Name'}{' '}
              ({contactInfo.phone_number})
            </div>
          )}

          {/* Main Form Area */}
          <div className="space-y-5 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-1">
                <Label htmlFor="connection_id" className="mb-1.5 text-sm font-medium">
                  WhatsApp Device
                </Label>
                <Select
                  value={formData.connection_id}
                  onValueChange={(value) => handleSelectChange('connection_id', value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select a device" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {connection.name} {connection.phone_number ? `(${connection.phone_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            
              <div className="col-span-1">
                <Label className="mb-1.5 text-sm font-medium">
                  Scheduled Time
                </Label>
                <div className="relative">
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DateTimePicker
                      value={formData.scheduled_at}
                      onChange={handleDateChange}
                      ampm={false} // Use 24-hour format as requested
                      className="w-full"
                      slotProps={{
                        popper: {
                          disablePortal: true, // Kept user change
                          style: { zIndex: 1400 },
                        },
                        textField: {
                          fullWidth: true,
                          variant: 'outlined',
                          sx: { 
                            '.MuiInputBase-root': {
                              height: '40px'
                            }
                          }
                        }
                      }}
                    />
                  </LocalizationProvider>
                </div>
              </div>
            </div>
            
            <div>
              <Label htmlFor="message" className="mb-1.5 text-sm font-medium">
                Message Content
              </Label>
              <Textarea 
                id="message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                placeholder={formData.media_url ? "Caption for media (optional)" : "Type your message here"}
                className="min-h-[110px] resize-none px-3 py-2 text-base"
              />
            </div>

            <div>
              {formData.media_url ? (
                <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/20 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 truncate">
                    {selectedAsset ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10">
                          {selectedAsset.assetType === 'image' ? (
                            <Image className="w-5 h-5 text-blue-500" />
                          ) : selectedAsset.assetType === 'video' ? (
                            <Video className="w-5 h-5 text-purple-500" />
                          ) : selectedAsset.assetType === 'audio' ? (
                            <Music className="w-5 h-5 text-green-500" />
                          ) : (
                            <FileText className="w-5 h-5 text-orange-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {selectedAsset.original_filename || selectedAsset.filename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedAsset.assetType.charAt(0).toUpperCase() + selectedAsset.assetType.slice(1)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm">{formData.media_url.split('/').pop()}</span>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRemoveAsset}
                    className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <AssetPicker 
                  onAssetSelect={handleAssetSelected} 
                  buttonLabel="Add Media"
                />
              )}
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
              <Checkbox
                id="is_recurring"
                checked={formData.is_recurring}
                onCheckedChange={handleCheckboxChange}
                className="mt-0.5"
              />
              <div className="grid gap-1.5 leading-none flex-1">
                <Label
                  htmlFor="is_recurring"
                  className="cursor-pointer text-sm font-medium"
                >
                  Recurring Message
                </Label>
                {formData.is_recurring && (
                  <div className="mt-2">
                    <Select
                      value={formData.recurrence_pattern}
                      onValueChange={(value) => handleSelectChange('recurrence_pattern', value)}
                    >
                      <SelectTrigger className="h-9 w-full max-w-xs bg-background">
                        <SelectValue placeholder="Select pattern" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className={`flex ${editingMessage ? 'justify-between' : 'justify-end'} items-center pt-5 border-t mt-3`}>
              {editingMessage && (
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  className="gap-1.5 h-10"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Cancel
                </Button>
              )}

              <Button
                onClick={editingMessage ? handleUpdateMessage : handleCreateMessage}
                disabled={loading || !formData.connection_id || (!formData.message && !formData.media_url)}
                className="gap-1.5 h-10 px-5"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : editingMessage ? (
                  <Save className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {editingMessage ? "Update" : "Schedule"}
              </Button>
            </div>
          </div>
          
          {/* Scheduled Messages List */}
          {!editingMessage && messages.length > 0 && (
            <div className="mt-6 pt-5 border-t">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <ScrollText className="w-4 h-4 text-primary" />
                  Scheduled Messages ({messages.length})
                </h3>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingMessage(null)} // Reset to create mode
                  className="h-8 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New
                </Button>
              </div>
              
              <div className="space-y-3 max-h-[270px] overflow-y-auto pr-1">
                {loading ? (
                  <div className="py-8 text-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Loading messages...</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`border rounded-lg p-3 transition-all ${
                        message.status === 'pending'
                          ? 'bg-background hover:bg-muted/30'
                          : message.status === 'sent'
                          ? 'bg-muted/20 hover:bg-muted/30'
                          : 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100/50 dark:hover:bg-red-900/20'
                      }`}
                    >
                      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3">
                        {/* Col 1: Status */}
                        <div className="flex-shrink-0">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(
                              message.status
                            )}`}
                          >
                            {message.status.charAt(0).toUpperCase() + message.status.slice(1)}
                          </span>
                        </div>

                        {/* Col 2: Message Content */}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {message.message || 'Media message'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Scheduled for:{' '}
                            {format(new Date(message.scheduled_at), 'd MMM yyyy, HH:mm')}
                          </p>
                        </div>

                        {/* Col 3: Buttons */}
                        <div className="flex items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            onClick={() => handleEditMessage(message)}
                            disabled={message.status === 'sent'}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-red-500/80 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => handleDeleteMessage(message.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {(message.is_recurring || message.media_url) && (
                        <div className="mt-2 pt-2 border-t border-dashed flex items-center gap-4 text-xs text-muted-foreground">
                          {message.is_recurring && message.recurrence_pattern && (
                            <div className="flex items-center gap-1.5">
                              <RefreshCw className="w-3.5 h-3.5 text-primary/70" />
                              <span>
                                Repeats{' '}
                                {message.recurrence_pattern.charAt(0).toUpperCase() +
                                  message.recurrence_pattern.slice(1)}
                              </span>
                            </div>
                          )}
                          {message.media_url && (
                            <div className="flex items-center gap-1.5">
                              {message.type === 'image' ? (
                                <Image className="w-3.5 h-3.5 text-primary/70" />
                              ) : message.type === 'video' ? (
                                <Video className="w-3.5 h-3.5 text-primary/70" />
                              ) : message.type === 'audio' ? (
                                <Music className="w-3.5 h-3.5 text-primary/70" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-primary/70" />
                              )}
                              <span>Media Attached</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ScheduledMessageDialog; 