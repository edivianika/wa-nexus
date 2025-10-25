import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Flame, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface LeadScoreBadgeProps {
  score: number;
  contactId: number;
  onScoreChange?: (newScore: number) => void;
  disabled?: boolean;
  className?: string;
}

export function LeadScoreBadge({ 
  score = 0, 
  contactId, 
  onScoreChange, 
  disabled = false,
  className = ''
}: LeadScoreBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentScore, setCurrentScore] = useState(score);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fungsi untuk mendapatkan kategori berdasarkan skor
  const getCategory = (value: number): 'cold' | 'warm' | 'hot' => {
    if (value >= 71) return 'hot';
    if (value >= 31) return 'warm';
    return 'cold';
  };

  // Fungsi untuk mendapatkan warna berdasarkan kategori
  const getCategoryColor = (category: 'cold' | 'warm' | 'hot') => {
    switch (category) {
      case 'hot':
        return 'bg-red-100 text-red-800 hover:bg-red-200';
      case 'warm':
        return 'bg-amber-100 text-amber-800 hover:bg-amber-200';
      case 'cold':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    }
  };

  // Fungsi untuk mendapatkan label berdasarkan kategori
  const getCategoryLabel = (category: 'cold' | 'warm' | 'hot') => {
    switch (category) {
      case 'hot':
        return 'Hot';
      case 'warm':
        return 'Warm';
      case 'cold':
        return 'Cold';
      default:
        return 'N/A';
    }
  };

  // Fungsi untuk memperbarui skor
  const updateScore = async () => {
    if (currentScore === score || disabled) return;
    
    setIsUpdating(true);
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const userId = localStorage.getItem('user_id');
      
      if (!userId) {
        throw new Error('User ID not found');
      }
      
      const response = await fetch(`${API_URL}/contacts/${contactId}/lead-score`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({ score: currentScore })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update lead score');
      }
      
      const data = await response.json();
      
      if (onScoreChange) {
        onScoreChange(data.score);
      }
      
      toast.success('Lead score updated successfully');
      setIsOpen(false);
    } catch (error) {
      console.error('Error updating lead score:', error);
      toast.error('Failed to update lead score');
    } finally {
      setIsUpdating(false);
    }
  };

  const category = getCategory(score);
  const categoryColor = getCategoryColor(category);
  const categoryLabel = getCategoryLabel(category);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge 
          variant="outline" 
          className={`cursor-pointer ${categoryColor} ${className}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen(true);
          }}
        >
          <Flame className="h-3 w-3 mr-1" />
          <span>{categoryLabel}</span>
          <span className="ml-1 font-semibold">{score}</span>
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <h4 className="font-medium">Lead Score</h4>
              <span className="font-semibold">{currentScore}</span>
            </div>
            <Slider
              value={[currentScore]}
              min={0}
              max={100}
              step={1}
              disabled={disabled || isUpdating}
              onValueChange={(values) => setCurrentScore(values[0])}
              className="my-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Cold (0-30)</span>
              <span>Warm (31-70)</span>
              <span>Hot (71-100)</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              size="sm"
              disabled={isUpdating}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              size="sm"
              disabled={currentScore === score || disabled || isUpdating}
              onClick={updateScore}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Updating...
                </>
              ) : 'Update Score'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
} 