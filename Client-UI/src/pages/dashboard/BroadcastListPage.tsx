import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { SubscriptionBanner } from "@/components/subscription/SubscriptionBanner";
import { 
  PlusCircle, 
  Search, 
  MoreVertical, 
  Eye, 
  Pause, 
  Play, 
  Trash2,
  RefreshCw,
  FileDown,
  BarChart3
} from "lucide-react";
import { format } from "date-fns";

// Types
interface BroadcastItem {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "paused" | "queued";
  created_at: string;
  schedule: string | null;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  connection_id: string;
  device_name: string;
}

interface ConnectionItem {
  id: string;
  name: string;
}

// Baca URL API dari environment variable
const BROADCAST_API_URL = import.meta.env.VITE_BROADCAST_API_URL || 'http://localhost:3004';

const BroadcastListPage = () => {
  const navigate = useNavigate();
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Check subscription status
  const { isExpired } = useSubscriptionStatus();

  useEffect(() => {
    fetchAll();
  }, [currentPage, statusFilter]);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setBroadcasts([]);
        setConnections([]);
        setTotalPages(1);
        setIsLoading(false);
        return;
      }
      const { data: connData, error: connError } = await supabase
        .from('connections')
        .select('id, name')
        .eq('user_id', userData.user.id);
      if (connError) throw connError;
      setConnections(connData || []);
      // Fetch broadcasts (no join)
      let query = (supabase as any)
        .from('broadcast_jobs')
        .select('id, broadcast_name, message, status, created_at, schedule, total_contacts, sent_count, failed_count, connection_id, isprivatemessage', { count: 'exact' })
        .eq('user_id', userData.user.id)
        .eq('isprivatemessage', false)
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1);
      if (searchQuery) {
        query = query.ilike('message', `%${searchQuery}%`);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      setTotalPages(Math.max(1, Math.ceil((count || 0) / itemsPerPage)));
      const connMap = new Map((connData || []).map((c: any) => [c.id, c.name]));
      setBroadcasts(
        (data || []).map((item: any) => ({
          id: item.id,
          name: item.broadcast_name || item.message,
          status: item.status,
          created_at: item.created_at,
          schedule: item.schedule,
          total_contacts: item.total_contacts,
          sent_count: item.sent_count,
          failed_count: item.failed_count,
          connection_id: item.connection_id,
          device_name: connMap.get(item.connection_id) || '-',
        }))
      );
    } catch (error) {
      console.error("Error fetching broadcasts or connections:", error);
      toast.error("Failed to load broadcasts");
      setBroadcasts([]);
      setConnections([]);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when search changes
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchAll();
    }, 300);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleAction = async (action: string, broadcastId: string) => {
    switch (action) {
      case 'view':
        navigate(`/dashboard/broadcast/${broadcastId}`);
        break;
      case 'pause':
        toast.success(`Broadcast ${broadcastId} paused`);
        break;
      case 'resume':
        toast.success(`Broadcast ${broadcastId} resumed`);
        break;
      case 'delete': {
        try {
          setIsLoading(true);
          const { error } = await (supabase as any)
            .from('broadcast_jobs')
            .delete()
            .eq('id', broadcastId);
          if (error) throw error;
          toast.success('Broadcast deleted successfully');
          fetchAll();
        } catch (error: any) {
          toast.error(error?.message || 'Failed to delete broadcast');
        } finally {
          setIsLoading(false);
        }
        break;
      }
      case 'retry':
        toast.success(`Retrying failed messages for broadcast ${broadcastId}`);
        break;
      case 'export': {
        try {
          toast.info("Preparing export data...");
          const response = await fetch(`${BROADCAST_API_URL}/export/${broadcastId}`);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to export results' }));
            throw new Error(errorData.message);
          }

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          const contentDisposition = response.headers.get('content-disposition');
          let filename = `broadcast_results_${broadcastId}.csv`;
          if (contentDisposition) {
              const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
              if (filenameMatch && filenameMatch.length > 1) {
                  filename = filenameMatch[1];
              }
          }
          
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          
          toast.success("Export successful!");
        } catch (error: any) {
          toast.error(error.message || "An unknown error occurred during export.");
        }
        break;
      }
      default:
        break;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">Pending</Badge>;
      case 'queued':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">Scheduled</Badge>;
      case 'running':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">Running</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Completed</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">Failed</Badge>;
      case 'paused':
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300">Paused</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>
          
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <PaginationItem key={page}>
              <PaginationLink 
                isActive={currentPage === page}
                onClick={() => handlePageChange(page)}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}
          
          <PaginationItem>
            <PaginationNext 
              onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
              className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  return (
    <div className="space-y-6">
      {/* Subscription Status Banner - Shows expired or trialing status */}
      <SubscriptionBanner />
      
      <div className="flex justify-between items-center">
        <div>
        <h1 className="text-2xl font-bold tracking-tight">Broadcast Messages</h1>
          <p className="text-muted-foreground mt-1">Manage your broadcast campaigns and view their status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/dashboard/broadcast/analytics">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Link>
          </Button>
          <Button 
            asChild={!isExpired} 
            disabled={isExpired}
            className="animated-button"
            title={isExpired ? "Trial expired - Please upgrade to create broadcasts" : "Create Broadcast"}
          >
            {isExpired ? (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Trial Expired
              </>
            ) : (
              <Link to="/dashboard/broadcast/create">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Broadcast
              </Link>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Broadcasts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search broadcasts..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
              </div>
            </div>
            <div className="w-full md:w-[200px]">
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead className="hidden md:table-cell">Created</TableHead>
                  <TableHead className="hidden md:table-cell">Scheduled</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading broadcasts...
                    </TableCell>
                  </TableRow>
                ) : broadcasts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      No broadcasts found
                    </TableCell>
                  </TableRow>
                ) : (
                  broadcasts.map((broadcast) => (
                    <TableRow key={broadcast.id}>
                      <TableCell className="font-medium">{broadcast.name}</TableCell>
                      <TableCell>{getStatusBadge(broadcast.status)}</TableCell>
                      <TableCell>{broadcast.device_name}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {format(new Date(broadcast.created_at), 'dd MMM yyyy, HH:mm')}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {broadcast.schedule 
                          ? format(new Date(broadcast.schedule), 'dd MMM yyyy, HH:mm')
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <div className="text-sm">
                            {broadcast.sent_count}/{broadcast.total_contacts}
                          </div>
                          <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
                            <div 
                              className={`h-full rounded-full ${
                                broadcast.status === 'failed' 
                                  ? 'bg-red-500' 
                                  : broadcast.status === 'completed' 
                                    ? 'bg-green-500' 
                                    : 'bg-blue-500'
                              }`}
                              style={{ 
                                width: `${(broadcast.sent_count / broadcast.total_contacts) * 100}%` 
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleAction('view', broadcast.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {broadcast.status === 'running' && (
                              <DropdownMenuItem onClick={() => handleAction('pause', broadcast.id)}>
                                <Pause className="mr-2 h-4 w-4" />
                                Pause
                              </DropdownMenuItem>
                            )}
                            {broadcast.status === 'paused' && (
                              <DropdownMenuItem onClick={() => handleAction('resume', broadcast.id)}>
                                <Play className="mr-2 h-4 w-4" />
                                Resume
                              </DropdownMenuItem>
                            )}
                            {broadcast.status === 'failed' && (
                              <DropdownMenuItem onClick={() => handleAction('retry', broadcast.id)}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Retry Failed
                              </DropdownMenuItem>
                            )}
                            {(broadcast.status === 'completed' || broadcast.status === 'failed') && (
                              <DropdownMenuItem onClick={() => handleAction('export', broadcast.id)}>
                                <FileDown className="mr-2 h-4 w-4" />
                                Export Results
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => handleAction('delete', broadcast.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex justify-end">
            {renderPagination()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BroadcastListPage; 