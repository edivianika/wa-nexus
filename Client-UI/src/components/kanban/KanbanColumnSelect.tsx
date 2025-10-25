import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import useKanbanColumns from "@/hooks/useKanbanColumns";

interface KanbanColumnSelectProps {
  value: string | undefined;
  onChange: (columnId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function KanbanColumnSelect({ value, onChange, disabled = false, className }: KanbanColumnSelectProps) {
  const { columns, isLoading } = useKanbanColumns();
  const [isUpdating, setIsUpdating] = useState(false);

  // Find the current column from the value
  const currentColumn = columns.find(column => column.id === value);

  const handleChange = async (newValue: string) => {
    setIsUpdating(true);
    onChange(newValue);
    setIsUpdating(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading columns...</span>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={handleChange}
      disabled={disabled || isUpdating}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select a column">
          {currentColumn ? currentColumn.title : "Select a column"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Kanban Columns</SelectLabel>
          {columns.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground">No columns available</div>
          ) : (
            columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.title}
              </SelectItem>
            ))
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export default KanbanColumnSelect; 