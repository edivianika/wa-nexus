import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DataGridProps {
  columns: {
    field: string;
    headerName: string;
    width?: number | string;
    className?: string;
    renderCell?: (value: any, row: any) => React.ReactNode;
  }[];
  rows: any[];
  height?: string;
}

export const DataGrid = ({ columns, rows, height = '400px' }: DataGridProps) => {
  return (
    <div className="border rounded-md overflow-hidden">
      <ScrollArea className={`h-[${height}]`}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead 
                  key={col.field}
                  style={{ width: col.width }}
                  className={col.className}
                >
                  {col.headerName}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((col) => (
                  <TableCell 
                    key={col.field} 
                    className={col.className}
                  >
                    {col.renderCell ? col.renderCell(row[col.field], row) : row[col.field]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}; 