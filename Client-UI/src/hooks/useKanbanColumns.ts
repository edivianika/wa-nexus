import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/ui/use-toast';

export interface KanbanColumn {
  id: string;
  title: string;
  position: number;
  drip_campaign_id?: string | null;
  drip_campaigns?: { name: string } | null;
  board_id: string;
}

export interface KanbanBoard {
  id: string;
  title: string;
  columns?: KanbanColumn[];
}

// Cache configuration
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds
let cachedColumns: KanbanColumn[] = [];
let cachedBoards: KanbanBoard[] = [];
let lastFetchTime = 0;

export function useKanbanColumns() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  const fetchColumns = useCallback(async (forceRefresh = false) => {
    // Use cache if available and not expired, unless force refresh is requested
    const now = Date.now();
    if (!forceRefresh && cachedColumns.length > 0 && cachedBoards.length > 0 && now - lastFetchTime < CACHE_DURATION) {
      setColumns(cachedColumns);
      setBoards(cachedBoards);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const userId = localStorage.getItem('user_id');
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      // Fetch boards first
      const boardsResponse = await fetch(`${API_URL}/kanban/boards`, {
        headers: { 'x-user-id': userId }
      });
      
      if (!boardsResponse.ok) {
        throw new Error('Failed to fetch kanban boards');
      }
      
      const boardsData = await boardsResponse.json();
      setBoards(boardsData);
      cachedBoards = boardsData; // Update cache
      
      if (boardsData.length === 0) {
        setColumns([]);
        cachedColumns = []; // Update cache
        return;
      }
      
      // Fetch all boards with columns
      const allColumns: KanbanColumn[] = [];
      
      for (const board of boardsData) {
        const boardResponse = await fetch(`${API_URL}/kanban/boards/${board.id}`, {
          headers: { 'x-user-id': userId }
        });
        
        if (!boardResponse.ok) {
          console.error(`Failed to fetch board details for ${board.id}`);
          continue;
        }
        
        const boardData = await boardResponse.json();
        if (boardData.kanban_columns && Array.isArray(boardData.kanban_columns)) {
          // Add board_id to each column if not already present
          const columnsWithBoard = boardData.kanban_columns.map((col: KanbanColumn) => ({
            ...col,
            board_id: board.id
          }));
          allColumns.push(...columnsWithBoard);
        }
      }
      
      setColumns(allColumns);
      cachedColumns = allColumns; // Update cache
      lastFetchTime = Date.now(); // Update last fetch time
      
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching kanban columns:', err);
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchColumns();
  }, [fetchColumns]);

  // Group columns by board
  const columnsByBoard = boards.map(board => ({
    ...board,
    columns: columns.filter(col => col.board_id === board.id)
  }));

  return {
    columns,
    boards,
    columnsByBoard,
    isLoading,
    error,
    fetchColumns
  };
}

export default useKanbanColumns; 