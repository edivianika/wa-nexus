import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, ChevronDown, Plus, Zap } from "lucide-react";
import useKanbanColumns from "@/hooks/useKanbanColumns";

interface KanbanBadgeProps {
  value: string | undefined;
  onChange: (columnId: string) => void;
  disabled?: boolean;
  className?: string;
  isUpdating?: boolean;
}

export function KanbanBadge({ value, onChange, disabled = false, className, isUpdating = false }: KanbanBadgeProps) {
  const { columns, columnsByBoard, isLoading } = useKanbanColumns();
  const [isOpen, setIsOpen] = useState(false);

  // Find the current column from the value
  const currentColumn = columns.find(column => column.id === value);

  const handleChange = async (newValue: string) => {
    onChange(newValue);
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  if (isUpdating) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Updating...</span>
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button 
          type="button"
          className="inline-block border-0 bg-transparent p-0 focus:outline-none w-full text-left"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsOpen(!isOpen);
          }}
          disabled={disabled || isUpdating}
        >
          <Badge 
            variant={currentColumn ? "default" : "outline"} 
            className={`cursor-pointer hover:bg-primary/80 flex items-center gap-1 ${className} ${!currentColumn ? "text-muted-foreground border-dashed" : ""} w-full inline-flex px-2.5 py-0.5`}
          >
            {currentColumn ? (
              <>
                <span className="truncate">{currentColumn.title}</span>
                {currentColumn.drip_campaign_id && (
                  <Zap className="h-3 w-3 ml-1 text-amber-500 flex-shrink-0" />
                )}
              </>
            ) : (
              <>
                <Plus className="h-3 w-3 flex-shrink-0" />
              </>
            )}
            <ChevronDown className="h-3 w-3 opacity-70 flex-shrink-0 ml-auto" />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={5} className="w-[250px] p-2 z-[100]">
        <div className="space-y-1">
          {columnsByBoard.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground">No kanban boards available</div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {columnsByBoard.map((board) => (
                <div key={board.id} className="space-y-1">
                  <h4 className="font-medium text-sm px-2 py-1.5 border-b mb-1">{board.title}</h4>
                  {board.columns && board.columns.length > 0 ? (
                    <div className="space-y-1">
                      {board.columns.map((column) => (
                        <button
                          key={column.id}
                          type="button"
                          className={`flex w-full items-center justify-between px-2 py-1.5 text-sm rounded-md cursor-pointer ${
                            column.id === value 
                              ? "bg-primary/10 text-primary font-medium" 
                              : "hover:bg-muted text-left"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChange(column.id);
                          }}
                        >
                          <div className="flex items-center">
                            <span className="ml-2 truncate">{column.title}</span>
                            {column.drip_campaign_id && (
                              <Zap className="h-3 w-3 ml-1.5 text-amber-500 flex-shrink-0" />
                            )}
                          </div>
                          {column.id === value && <Check className="h-4 w-4 flex-shrink-0 ml-2" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No columns in this board</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default KanbanBadge; 