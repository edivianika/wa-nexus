/// <reference types="vite/client" />
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { PlusCircle, Edit, Trash2, MoreVertical, Plus, Settings, Phone, FileText, Send, UserPlus, Unlink, Link as LinkIcon, MessageSquareText, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ExpiredTrialBanner } from '@/components/subscription/ExpiredTrialBanner';
import { Card as UiCard, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import AddContactToKanbanModal from '../../components/dashboard/AddContactToKanbanModal';
import { produce } from 'immer';
import './KanbanPage.css';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Session } from '@supabase/supabase-js';

// --- Helper Functions --- //
const getInitials = (name?: string) => {
  if (!name) return '?';
  const words = name.split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
};

const generateAvatarColor = (str?: string) => {
  if (!str) return '#808080'; // A default gray color
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
}

// --- Data Structures --- //
interface Contact {
  id: number;
  contact_name: string;
  email: string | null;
  phone_number: string;
  owner_id: string;
  kanban_column_id: string;
  kanban_position: number;
  job_title?: string;
  created_at?: string;
  last_note?: string;
  avatar_url?: string;
  notes?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  position: number;
  contacts: Contact[];
  drip_campaign_id?: string | null;
  drip_campaigns?: { name: string } | null;
}

interface KanbanBoard {
  id: string;
  title: string;
  kanban_columns: KanbanColumn[];
}

interface SubscriptionLimits {
  kanban_boards?: number;
}

interface DripCampaign {
    id: string;
    name: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// --- Drag and Drop Types --- //
const ItemTypes = {
  CARD: 'card',
};

interface DragItem {
  type: string;
  id: number;
  fromColumnId: string;
}

// --- Kanban Item Card Component --- //
interface KanbanItemCardProps {
  card: Contact;
  columnId: string;
}

const KanbanItemCard: React.FC<KanbanItemCardProps> = ({ card, columnId }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CARD,
    item: (): DragItem => ({ type: ItemTypes.CARD, id: card.id, fromColumnId: columnId }),
    collect: monitor => ({
      isDragging: !!monitor.isDragging(),
    }),
  });

  drag(ref);
  
  const color = useMemo(() => generateAvatarColor(card.contact_name), [card.contact_name]);

  return (
    <article
      ref={ref}
      className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow group relative"
      style={{ opacity: isDragging ? 0.5 : 1, cursor: 'grab' }}
    >
      <section className="flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-sm shadow-inner" 
          style={{ backgroundColor: color }}
        >
          {getInitials(card.contact_name)}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="font-semibold text-gray-800 dark:text-gray-100 truncate" title={card.contact_name}>{card.contact_name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5">
            <Phone className="h-3 w-3 flex-shrink-0" />
            {card.phone_number}
          </p>
        </div>
      </section>
      
      {card.last_note && (
        <section className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50">
          <p className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2 leading-relaxed">
            <MessageSquareText className="h-4 w-4 flex-shrink-0 mt-px text-gray-400" />
            <span className="italic">{`"${card.last_note}"`}</span>
          </p>
        </section>
      )}

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-5 w-5 text-gray-400" />
      </div>
    </article>
  );
};

// --- Kanban Column Component --- //
interface KanbanColumnComponentProps {
  column: KanbanColumn;
  onDropCard: (cardId: number, fromColumnId: string, toColumnId: string) => Promise<void>;
  openEditColumnModal: (column: KanbanColumn) => void;
  openDeleteColumnModal: (columnId: string) => void;
  openDripModal: (column: KanbanColumn) => void;
  handleUnlinkDripCampaign: (columnId: string) => void;
}

const KanbanColumnComponent: React.FC<KanbanColumnComponentProps> = ({ column, onDropCard, openEditColumnModal, openDeleteColumnModal, openDripModal, handleUnlinkDripCampaign }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver }, drop] = useDrop({
    accept: ItemTypes.CARD,
    drop: (item: DragItem) => {
      // Always trigger onDropCard, for both inter-column and intra-column drops.
      onDropCard(item.id, item.fromColumnId, column.id);
      return { id: column.id };
    },
    collect: monitor => ({
      isOver: !!monitor.isOver(),
    }),
  });
  
  drop(ref);

  const columnColor = useMemo(() => generateAvatarColor(column.title), [column.title]);

  return (
    <div
      ref={ref}
      className="w-[300px] flex-shrink-0"
    >
      <div className="bg-gray-100 dark:bg-gray-800/60 rounded-lg flex flex-col h-full max-h-full">
        <div className="flex justify-between items-center p-3 flex-shrink-0 sticky top-0 bg-gray-100/80 dark:bg-gray-800/80 z-10 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700/50">
            <div className="flex items-center gap-2 flex-grow overflow-hidden">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: columnColor }}></span>
                <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-200 truncate" title={column.title}>{column.title}</h2>
                <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">{column.contacts.length}</span>
            </div>
            <div className="flex items-center gap-1">
                {column.drip_campaigns && (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                         <div className="flex items-center gap-1.5 text-blue-500 bg-blue-500/10 px-2 py-1 rounded-md text-xs cursor-default">
                            <Send className="h-3 w-3" />
                            <span className="font-semibold truncate max-w-[80px]">{column.drip_campaigns.name}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Linked to: <span className="font-semibold">{column.drip_campaigns.name}</span></p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                         <DropdownMenuItem onClick={() => openEditColumnModal(column)}>
                            <Edit className="mr-2 h-4 w-4" />
                            <span>Edit Column</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openDripModal(column)}>
                            <LinkIcon className="mr-2 h-4 w-4" />
                            <span>{column.drip_campaign_id ? 'Change Campaign' : 'Link Campaign'}</span>
                        </DropdownMenuItem>
                        {column.drip_campaign_id && (
                             <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleUnlinkDripCampaign(column.id)}>
                                <Unlink className="mr-2 h-4 w-4" />
                                <span>Unlink Campaign</span>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDeleteColumnModal(column.id)}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete Column</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
        <div className="flex-grow space-y-3 p-3 overflow-y-auto kanban-column-content">
            {column.contacts?.map((contact) => (
              <KanbanItemCard key={contact.id} card={contact} columnId={column.id} />
            ))}
        </div>
      </div>
    </div>
  );
};

interface KanbanHeaderProps {
    boards: KanbanBoard[];
    currentBoardId: string | null;
    setCurrentBoardId: (id: string) => void;
    openAddBoardModal: () => void;
    openEditBoardModal: (board: KanbanBoard) => void;
    openDeleteBoardModal: (board: KanbanBoard) => void;
    setIsContactModalOpen: (isOpen: boolean) => void;
}

const KanbanHeader = React.forwardRef<HTMLDivElement, KanbanHeaderProps>(
    ({ boards, currentBoardId, setCurrentBoardId, openAddBoardModal, openEditBoardModal, openDeleteBoardModal, setIsContactModalOpen }, ref) => (
    <div ref={ref} className="flex-shrink-0 z-10 border-b border-gray-200/50 dark:border-gray-700/30 bg-transparent">
        <header className="px-4 py-3">
            <div className="flex justify-between items-center">
              <div className="flex-grow">
                  <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Kanban Board</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Manage your contacts and leads effectively.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                  <Button variant="secondary" onClick={openAddBoardModal}>
                      <PlusCircle className="mr-2 h-4 w-4" /> New Board
                  </Button>
                  <Button onClick={() => setIsContactModalOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Add Contact
                  </Button>
              </div>
            </div>
        </header>

        <div className="px-4 pb-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {boards?.map(board => (
                <div key={board.id} className="flex-shrink-0">
                    <div className="flex items-center">
                        <Button
                            variant={currentBoardId === board.id ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentBoardId(board.id)}
                            className={`whitespace-nowrap rounded-md ${currentBoardId === board.id ? 'bg-primary text-primary-foreground' : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm dark:text-gray-100 dark:border-gray-600'}`}
                        >
                            {board.title}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1 rounded-md">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditBoardModal(board)}>
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openDeleteBoardModal(board)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
                ))}
            </div>
        </div>
    </div>
));

// --- Button for creating a new board with quota check ---
const NewBoardButton = ({ boards, limits, onClick }: { boards: KanbanBoard[], limits: SubscriptionLimits | null, onClick: () => void }) => {
  const boardLimit = limits?.kanban_boards;
  const canCreateBoard = boardLimit === -1 || (boardLimit !== undefined && boards.length < boardLimit);

  if (canCreateBoard) {
    return (
      <Button variant="outline" size="sm" onClick={onClick}>
        <PlusCircle className="mr-2 h-4 w-4" />
        New Board
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-block"> 
            <Button variant="outline" size="sm" disabled>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Board
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Anda telah mencapai batas {boardLimit} Papan Kanban untuk paket Anda.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface KanbanBoardAreaProps {
    loading: boolean;
    board: KanbanBoard | null;
    onDropCard: (cardId: number, fromColumnId: string, toColumnId: string) => Promise<void>;
    openEditColumnModal: (column: KanbanColumn) => void;
    openDeleteColumnModal: (columnId: string) => void;
    openDripModal: (column: KanbanColumn) => void;
    openAddBoardModal: () => void;
    openAddColumnModal: () => void;
    handleUnlinkDripCampaign: (columnId: string) => void;
    headerHeight: number;
}

const KanbanBoardArea = ({ loading, board, onDropCard, openEditColumnModal, openDeleteColumnModal, openAddBoardModal, openAddColumnModal, openDripModal, headerHeight, handleUnlinkDripCampaign }: KanbanBoardAreaProps) => (
    <div 
        className="absolute left-0 right-0 bottom-0 kanban-board-container overflow-auto"
        style={{ top: `${headerHeight}px` }}
    >
        <div className="h-full">
            {loading && (
                <div className="flex justify-center items-center py-10 w-full h-full">
                    <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
                        <p className="text-gray-500 dark:text-gray-400">Loading board...</p>
                    </div>
                </div>
            )}

            {!loading && board ? (
              <div className="inline-flex gap-4 h-full p-0 pt-2 pl-4">
                {board.kanban_columns?.map((column) => (
                  <KanbanColumnComponent 
                    key={column.id} 
                    column={column} 
                    onDropCard={onDropCard}
                    openEditColumnModal={openEditColumnModal}
                    openDeleteColumnModal={openDeleteColumnModal}
                    openDripModal={openDripModal}
                    handleUnlinkDripCampaign={handleUnlinkDripCampaign}
                  />
                ))}
                <div className="w-[300px] flex-shrink-0">
                    <Button 
                        variant="outline" 
                        onClick={openAddColumnModal} 
                        className="h-full w-full border-dashed border-2 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-center"
                    >
                        <Plus className="mr-2 h-5 w-5" />
                        Add New Column
                    </Button>
                </div>
              </div>
            ) : (
              !loading && (
                <div className="flex flex-col items-center justify-center h-full p-0">
                    <div className="flex flex-col items-center justify-center h-full text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 w-full max-w-2xl mx-auto backdrop-blur-sm bg-white/30 dark:bg-gray-800/30">
                        <Settings className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
                        <h3 className="text-xl font-medium text-gray-700 dark:text-gray-200 mb-2">No Kanban Boards Found</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">Create your first board to get started.</p>
                        <Button onClick={openAddBoardModal} className="shadow-sm">
                            <PlusCircle className="mr-2 h-4 w-4" /> Create Your First Board
                        </Button>
                    </div>
                </div>
              )
            )}
        </div>
    </div>
);

// --- Main Page Component --- //
const KanbanPage = () => {
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [currentBoard, setCurrentBoard] = useState<KanbanBoard | null>(null);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isDeleteColumnModalOpen, setIsDeleteColumnModalOpen] = useState(false);
  const [isDripModalOpen, setIsDripModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null);
  const [linkingColumn, setLinkingColumn] = useState<KanbanColumn | null>(null);
  const [deletingColumnId, setDeletingColumnId] = useState<string | null>(null);
  const [columnTitle, setColumnTitle] = useState('');
  
  const [isBoardModalOpen, setIsBoardModalOpen] = useState(false);
  const [isDeleteBoardModalOpen, setIsDeleteBoardModalOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<KanbanBoard | null>(null);
  const [boardName, setBoardName] = useState('');

  const [dripCampaigns, setDripCampaigns] = useState<DripCampaign[]>([]);

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const [selectedDripCampaign, setSelectedDripCampaign] = useState<string | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);

  // Get session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useLayoutEffect(() => {
    const updateHeaderHeight = () => {
        if (headerRef.current) {
            setHeaderHeight(headerRef.current.offsetHeight);
        }
    };
    
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    
    // Also re-check after a short delay to account for any late-rendering elements
    const timeoutId = setTimeout(updateHeaderHeight, 200);

    return () => {
        window.removeEventListener('resize', updateHeaderHeight);
        clearTimeout(timeoutId);
    };
  }, [boards]); // Re-calculate if the number of boards changes (might cause wrapping)

  const fetchAllData = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: subData, error: subError } = await supabase.rpc('get_subscription_status');
      if (subError) throw new Error('Failed to load subscription limits.');
      if (subData && subData.limits) {
        setLimits(subData.limits);
      }

      const token = session.access_token;
      const boardsResponse = await fetch(`${API_URL}/kanban/boards`, {
        headers: { 'x-user-id': session.user.id, 'Authorization': `Bearer ${token}` }
      });
      if (!boardsResponse.ok) throw new Error('Failed to fetch boards');
      const fetchedBoards: KanbanBoard[] = await boardsResponse.json();
      setBoards(fetchedBoards);

      let boardToFetchId = currentBoardId;
      if (!boardToFetchId && fetchedBoards.length > 0) {
        boardToFetchId = fetchedBoards[0].id;
      }
      
      if (boardToFetchId && fetchedBoards.some(b => b.id === boardToFetchId)) {
        setCurrentBoardId(boardToFetchId);

        const detailsResponse = await fetch(`${API_URL}/kanban/boards/${boardToFetchId}`, {
          headers: { 'x-user-id': session.user.id, 'Authorization': `Bearer ${token}` }
        });
        if (!detailsResponse.ok) throw new Error('Failed to fetch board details');
        const detailedBoard: KanbanBoard = await detailsResponse.json();
        setCurrentBoard(detailedBoard);
      } else {
        setCurrentBoard(null);
        setCurrentBoardId(null);
      }

      // Fetch drip campaigns for dropdown
      const dripCampaignsResponse = await fetch(`${API_URL}/drip/campaigns`, {
        headers: { 'x-user-id': session.user.id, 'Authorization': `Bearer ${token}` }
      });
      if (dripCampaignsResponse.ok) {
        const data = await dripCampaignsResponse.json();
        if (data.success) {
          setDripCampaigns(data.campaigns || []);
        }
      }
    } catch (error: any) {
      setError(error.message);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [session, currentBoardId]);


  useEffect(() => {
    fetchAllData();
  }, [session, fetchAllData]);

  useEffect(() => {
    if (editingColumn) {
        setColumnTitle(editingColumn.title);
        setSelectedDripCampaign(editingColumn.drip_campaign_id);
    }
  }, [editingColumn]);

  // Log drip campaigns when modal is opened
  useEffect(() => {
    if (isDripModalOpen) {
      console.log(`Drip campaigns available: ${dripCampaigns.length}`);
    }
  }, [isDripModalOpen, dripCampaigns.length]);

  const handleDropCard = async (cardId: number, fromColumnId: string, toColumnId: string) => {
    if (!currentBoardId) return;

    const originalBoard = currentBoard;

    let nextState: KanbanBoard | null = null;
    // Perform optimistic update
    setCurrentBoard(prevBoard => {
        nextState = produce(prevBoard, draft => {
            if (!draft) return;
            let cardToMove: Contact | undefined;

            const fromCol = draft.kanban_columns.find(c => c.id === fromColumnId);
            if (fromCol) {
                const cardIndex = fromCol.contacts.findIndex(c => c.id === cardId);
                if (cardIndex > -1) {
                    [cardToMove] = fromCol.contacts.splice(cardIndex, 1);
                }
            }

            if (cardToMove) {
                const toCol = draft.kanban_columns.find(c => c.id === toColumnId);
                if (toCol) {
                    // Add the card to the top of the new column
                    toCol.contacts.unshift(cardToMove);
                }
            }
        });
        return nextState;
    });

    // If the state update failed somehow, bail out.
    if (!nextState) {
        toast.error("An internal error occurred during reordering.");
        return;
    }

    // Now, update the backend
    const targetColumn = nextState.kanban_columns.find(c => c.id === toColumnId);
    if (!targetColumn) {
        setCurrentBoard(originalBoard); // Should not happen, but rollback just in case
        return;
    }
    
    const contactIds = targetColumn.contacts.map(c => c.id);
    const userId = localStorage.getItem('user_id');

    try {
        const response = await fetch(`${API_URL}/kanban/columns/${toColumnId}/order`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
            body: JSON.stringify({ contactIds }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to save new order.' }));
            throw new Error(errorData.message);
        }
        
        // Silently succeed or show a subtle toast
        // toast.success("Order updated!");

    } catch (e: any) {
        toast.error(`Error saving order: ${e.message}`);
        setCurrentBoard(originalBoard); // Revert on error
    }
  };

  const handleCreateBoard = async () => {
    if (!boardName.trim()) {
      toast.error("Board name cannot be empty");
      return;
    }
    const userId = localStorage.getItem('user_id');
    try {
      const response = await fetch(`${API_URL}/kanban/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ title: boardName }) // Send title
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to create board');
      }
      const newBoard = await response.json();
      toast.success('Board created successfully');
      setCurrentBoardId(newBoard.id); // Set the new board as current
      await fetchAllData(); // Refetch all data
      setIsBoardModalOpen(false);
      setBoardName('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  
  const handleUpdateBoard = async () => {
    if (!editingBoard || !boardName.trim()) return;
    const userId = localStorage.getItem('user_id');
    try {
      const response = await fetch(`${API_URL}/kanban/boards/${editingBoard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ title: boardName }) // Send title
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to update board');
      }
      await fetchAllData();
      setIsBoardModalOpen(false);
      toast.success('Board updated successfully');
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  
  const handleDeleteBoard = async () => {
    if (!editingBoard) return;
    const userId = localStorage.getItem('user_id');
    try {
      const response = await fetch(`${API_URL}/kanban/boards/${editingBoard.id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': userId }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to delete board');
      }
      toast.success('Board deleted successfully');
      const newBoards = boards.filter(b => b.id !== editingBoard.id);
      setBoards(newBoards);
      if (currentBoardId === editingBoard.id) {
          const newCurrentId = newBoards.length > 0 ? newBoards[0].id : null;
          setCurrentBoardId(newCurrentId);
      }
      await fetchAllData();
      setIsDeleteBoardModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateColumn = async () => {
    if (!currentBoardId || !columnTitle.trim()) return;
    const userId = localStorage.getItem('user_id');
    try {
      let newPosition = 0;
      if (currentBoard && currentBoard.kanban_columns.length > 0) {
        newPosition = Math.max(...currentBoard.kanban_columns.map(col => col.position)) + 1;
      }
      const response = await fetch(`${API_URL}/kanban/boards/${currentBoardId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ title: columnTitle, position: newPosition, drip_campaign_id: selectedDripCampaign })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to create column.');
      }
      await fetchAllData();
      setIsColumnModalOpen(false);
      setColumnTitle('');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateColumn = async () => {
    if (!editingColumn || !columnTitle.trim() || !currentBoardId) return;
    const userId = localStorage.getItem('user_id');
     if (!userId) {
       toast.error("User not logged in");
       return;
     }
    try {
      const response = await fetch(`${API_URL}/kanban/columns/${editingColumn.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ title: columnTitle, drip_campaign_id: selectedDripCampaign }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to update column.');
      }
      await fetchAllData();
      setIsColumnModalOpen(false); // Close modal
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveDripLink = async () => {
    if (!linkingColumn || !currentBoardId) return;
    const userId = localStorage.getItem('user_id');
     if (!userId) {
       toast.error("User not logged in");
       return;
     }
    try {
      const response = await fetch(`${API_URL}/kanban/columns/${linkingColumn.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ drip_campaign_id: selectedDripCampaign }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to update column link.');
      }
      await fetchAllData();
      setIsDripModalOpen(false); // Close modal
      toast.success("Drip campaign linked successfully!");
    } catch (err: any)      {
      toast.error(`Failed to link campaign: ${err.message}`);
    }
  };

  const handleDeleteColumn = async () => {
    if (!deletingColumnId || !currentBoardId) return;
    const userId = localStorage.getItem('user_id');
    try {
      await fetch(`${API_URL}/kanban/columns/${deletingColumnId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': userId }
      });
      await fetchAllData();
      setIsDeleteColumnModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  
  const handleUnlinkDripCampaign = async (columnId: string) => {
    if (!currentBoardId) return;
    const userId = localStorage.getItem('user_id');
     if (!userId) {
       toast.error("User not logged in");
       return;
     }
    try {
      const response = await fetch(`${API_URL}/kanban/columns/${columnId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ drip_campaign_id: null }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to unlink campaign.');
      }
      await fetchAllData();
      toast.success("Drip campaign unlinked.");
    } catch (err: any)      {
      toast.error(`Failed to unlink campaign: ${err.message}`);
    }
  };
  
  // --- Modal Openers --- //
  const openAddBoardModal = () => {
      setEditingBoard(null);
      setBoardName('');
      setIsBoardModalOpen(true);
  };
  
  const openEditBoardModal = (board: KanbanBoard) => {
      setEditingBoard(board);
      setBoardName(board.title);
      setIsBoardModalOpen(true);
  };

  const openDeleteBoardModal = (board: KanbanBoard) => {
      setEditingBoard(board);
      setIsDeleteBoardModalOpen(true);
  };

  const openAddColumnModal = () => {
    setEditingColumn(null);
    setColumnTitle('');
    setSelectedDripCampaign(null);
    setIsColumnModalOpen(true);
  };

  const openEditColumnModal = (column: KanbanColumn) => {
    setEditingColumn(column);
    setColumnTitle(column.title);
    setIsColumnModalOpen(true);
  };

  const openDeleteColumnModal = (columnId: string) => {
    setDeletingColumnId(columnId);
    setIsDeleteColumnModalOpen(true);
  };

  const openDripModal = (column: KanbanColumn) => {
    setLinkingColumn(column);
    setSelectedDripCampaign(column.drip_campaign_id || null);
    
    // If no drip campaigns are loaded yet, fetch them now
    if (dripCampaigns.length === 0 && session) {
      const fetchDripCampaigns = async () => {
        try {
          const token = session.access_token;
          const response = await fetch(`${API_URL}/drip/campaigns`, {
            headers: { 'x-user-id': session.user.id, 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setDripCampaigns(data.campaigns || []);
            }
          }
        } catch (error) {
          console.error("Error fetching drip campaigns:", error);
        }
      };
      fetchDripCampaigns();
    }
    
    setIsDripModalOpen(true);
  };
  
  if (loading && !currentBoard) return (
    <div className="flex justify-center items-center h-[80vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-lg">Loading boards...</span>
    </div>
  );

  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  
  return (
    <DndProvider backend={HTML5Backend}>
      <TooltipProvider delayDuration={100}>
        <div className="relative flex flex-col h-screen bg-transparent text-gray-900 dark:text-gray-100 overflow-hidden">
          {/* Expired Trial Banner */}
          <ExpiredTrialBanner />
          <KanbanHeader 
              ref={headerRef}
              boards={boards}
              currentBoardId={currentBoardId}
              setCurrentBoardId={setCurrentBoardId}
              openAddBoardModal={openAddBoardModal}
              openEditBoardModal={openEditBoardModal}
              openDeleteBoardModal={openDeleteBoardModal}
              setIsContactModalOpen={setIsContactModalOpen}
          />
          
          {headerHeight > 0 && (
              <KanbanBoardArea 
                  loading={loading && !currentBoard}
                  board={currentBoard}
                  onDropCard={handleDropCard}
                  openEditColumnModal={openEditColumnModal}
                  openDeleteColumnModal={openDeleteColumnModal}
                  openDripModal={openDripModal}
                  openAddBoardModal={openAddBoardModal}
                  openAddColumnModal={openAddColumnModal}
                  headerHeight={headerHeight}
                  handleUnlinkDripCampaign={handleUnlinkDripCampaign}
              />
          )}
        </div>
      </TooltipProvider>

      {isContactModalOpen && currentBoard && (
        <AddContactToKanbanModal
          isOpen={isContactModalOpen}
          onClose={() => setIsContactModalOpen(false)}
          onContactAdded={() => fetchAllData()}
          columns={currentBoard.kanban_columns}
        />
      )}

      {/* Board Modals */}
      <Dialog open={isBoardModalOpen} onOpenChange={setIsBoardModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingBoard ? 'Edit Board' : 'Create New Board'}</DialogTitle>
            <DialogDescription>
              {editingBoard ? 'Update your board name.' : 'Give your new board a name to get started.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="boardName">Board Name</Label>
            <Input id="boardName" value={boardName} onChange={(e) => setBoardName(e.target.value)} 
              placeholder="Enter board name" className="focus-visible:ring-primary" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBoardModalOpen(false)}>Cancel</Button>
            <Button onClick={editingBoard ? handleUpdateBoard : handleCreateBoard}>{editingBoard ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteBoardModalOpen} onOpenChange={setIsDeleteBoardModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Board</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{editingBoard?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteBoardModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBoard}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Column Modals */}
      <Dialog open={isColumnModalOpen} onOpenChange={setIsColumnModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingColumn ? 'Edit Column' : 'Add Column'}</DialogTitle>
            <DialogDescription>
              {editingColumn ? 'Update the details of your column.' : 'Add a new column to your board.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="columnName">Column Name</Label>
            <Input id="columnName" value={columnTitle} onChange={(e) => setColumnTitle(e.target.value)}
              placeholder="Enter column name" className="focus-visible:ring-primary" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsColumnModalOpen(false)}>Cancel</Button>
            <Button onClick={editingColumn ? handleUpdateColumn : handleCreateColumn}>{editingColumn ? 'Update' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDripModalOpen} onOpenChange={setIsDripModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Link Drip Campaign</DialogTitle>
            <DialogDescription>
              Select a drip campaign to automatically subscribe contacts added to the "{linkingColumn?.title}" column.
            </DialogDescription>
          </DialogHeader>
           <div className="py-4 space-y-2">
              <Label htmlFor="drip-campaign-select">Drip Campaign (Optional)</Label>
              <Select onValueChange={(value) => setSelectedDripCampaign(value === '_NONE_' ? null : value)} value={selectedDripCampaign || ''}>
                  <SelectTrigger id="drip-campaign-select">
                      <SelectValue placeholder="No Campaign Linked" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="_NONE_">No Campaign Linked</SelectItem>
                      {dripCampaigns.map(campaign => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                              {campaign.name}
                          </SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDripModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDripLink}>Save Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteColumnModalOpen} onOpenChange={setIsDeleteColumnModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Column</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this column? All contacts will become unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteColumnModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteColumn}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndProvider>
  );
};

export default KanbanPage;