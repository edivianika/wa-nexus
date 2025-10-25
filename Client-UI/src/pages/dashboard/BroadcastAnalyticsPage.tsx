import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

// Icons
import { CheckCircle2, AlertCircle, Clock, Activity, Calendar, BarChart3, Smartphone } from "lucide-react";

// Constants
const BROADCAST_API_URL = import.meta.env.VITE_BROADCAST_API_URL || 'http://localhost:3004';

// Helper function to format date
const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString));
};

// Types for our broadcast data
interface BroadcastJob {
  id: string;
  broadcast_name?: string;
  message?: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  created_at: string;
  connection_id: string;
  user_id: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  schedule?: string;
}

// Types
interface BroadcastStats {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  totalMessages: number;
  sentMessages: number;
  failedMessages: number;
  pendingMessages: number;
}

interface BroadcastActivity {
  date: string;
  count: number;
  sent: number;
  failed: number;
}

interface DeviceStat {
  deviceName: string;
  broadcasts: number;
  messagesSent: number;
  successRate: number;
}

const BroadcastAnalyticsPage = () => {
  const [stats, setStats] = useState<BroadcastStats>({
    total: 0,
    completed: 0,
    pending: 0,
    failed: 0,
    totalMessages: 0,
    sentMessages: 0,
    failedMessages: 0,
    pendingMessages: 0
  });
  
  const [timeRange, setTimeRange] = useState("7d");
  const [isLoading, setIsLoading] = useState(true);
  const [activityData, setActivityData] = useState<BroadcastActivity[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStat[]>([]);
  const [topBroadcasts, setTopBroadcasts] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setIsLoading(false);
        return;
      }

      // Fetch connections first for reference
      const { data: connData, error: connError } = await supabase
        .from('connections')
        .select('id, name')
        .eq('user_id', userData.user.id);
      
      setConnections(connData || []);
      const connMap = new Map(connData?.map(c => [c.id, c.name]) || []);

      // Create date range for filter
      const now = new Date();
      let startDate = new Date();
      
      switch(timeRange) {
        case "7d": 
          startDate.setDate(now.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(now.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(now.getDate() - 90);
          break;
        case "all":
          startDate = new Date(0); // Beginning of time
          break;
      }

      // Get broadcast stats - cast to any to bypass TypeScript table checks
      const { data: broadcastsData, error } = await supabase
        .from('broadcast_jobs' as any)
        .select('*')
        .eq('user_id', userData.user.id)
        .eq('isprivatemessage', false) as any;
      
      if (error) {
        console.error("Error fetching broadcasts:", error);
        throw error;
      }
      
      // Cast the data to our expected type
      const broadcasts = broadcastsData as unknown as BroadcastJob[];
      
      if (!broadcasts || broadcasts.length === 0) {
        setIsLoading(false);
        return;
      }

      // Calculate stats
      const completed = broadcasts.filter(b => b.status === 'completed').length;
      const pending = broadcasts.filter(b => ['pending', 'queued', 'running', 'paused'].includes(b.status)).length;
      const failed = broadcasts.filter(b => b.status === 'failed').length;

      const totalMessages = broadcasts.reduce((sum, b) => sum + (b.total_contacts || 0), 0);
      const sentMessages = broadcasts.reduce((sum, b) => sum + (b.sent_count || 0), 0);
      const failedMessages = broadcasts.reduce((sum, b) => sum + (b.failed_count || 0), 0);
      const pendingMessages = totalMessages - sentMessages - failedMessages;

      setStats({
        total: broadcasts.length,
        completed,
        pending,
        failed,
        totalMessages,
        sentMessages,
        failedMessages,
        pendingMessages
      });

      // Process activity data (group by date)
      const activityMap = new Map<string, BroadcastActivity>();
      
      broadcasts.forEach(broadcast => {
        const date = new Date(broadcast.created_at).toISOString().split('T')[0];
        const existing = activityMap.get(date) || { date, count: 0, sent: 0, failed: 0 };
        
        activityMap.set(date, {
          date,
          count: existing.count + 1,
          sent: existing.sent + (broadcast.sent_count || 0),
          failed: existing.failed + (broadcast.failed_count || 0)
        });
      });

      // Sort by date
      const activityArray = Array.from(activityMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14); // Last 14 days
      
      setActivityData(activityArray);
      
      // Process device stats
      const deviceMap = new Map<string, DeviceStat>();
      
      broadcasts.forEach(broadcast => {
        const deviceId = broadcast.connection_id;
        const deviceName = connMap.get(deviceId) || 'Unknown Device';
        const existing = deviceMap.get(deviceId) || { 
          deviceName, 
          broadcasts: 0, 
          messagesSent: 0,
          successRate: 0
        };
        
        const total = broadcast.total_contacts || 0;
        const sent = broadcast.sent_count || 0;
        const rate = total > 0 ? sent / total : 0;
        
        deviceMap.set(deviceId, {
          deviceName,
          broadcasts: existing.broadcasts + 1,
          messagesSent: existing.messagesSent + sent,
          successRate: (existing.successRate * existing.broadcasts + rate) / (existing.broadcasts + 1)
        });
      });
      
      setDeviceStats(Array.from(deviceMap.values()));
      
      // Get top performing broadcasts
      const sortedBroadcasts = [...broadcasts]
        .filter(b => b.total_contacts > 0)
        .sort((a, b) => {
          const rateA = a.sent_count / a.total_contacts;
          const rateB = b.sent_count / b.total_contacts;
          return rateB - rateA;
        })
        .slice(0, 5)
        .map(b => ({
          id: b.id,
          name: b.broadcast_name || b.message || 'Unnamed Broadcast',
          device: connMap.get(b.connection_id) || 'Unknown',
          sent: b.sent_count || 0,
          total: b.total_contacts,
          successRate: b.total_contacts > 0 ? (b.sent_count / b.total_contacts * 100).toFixed(1) + '%' : '0%',
          created: formatDate(b.created_at)
        }));
      
      setTopBroadcasts(sortedBroadcasts);
      
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Failed to load analytics data");
    } finally {
      setIsLoading(false);
    }
  };

  const COLORS = ['#4CAF50', '#FFC107', '#F44336', '#2196F3'];
  const statusData = [
    { name: 'Completed', value: stats.completed },
    { name: 'Pending', value: stats.pending },
    { name: 'Failed', value: stats.failed }
  ].filter(item => item.value > 0);

  const messageStatusData = [
    { name: 'Sent', value: stats.sentMessages },
    { name: 'Failed', value: stats.failedMessages },
    { name: 'Pending', value: stats.pendingMessages }
  ].filter(item => item.value > 0);

  // Display loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Memuat data analitik...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Broadcast Analytics</h1>
        <p className="text-muted-foreground mt-1">Monitor and analyze your broadcast messaging performance</p>
      </div>
      
      <div className="flex justify-end">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 3 months</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Broadcasts</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {timeRange === '7d' ? 'Last 7 days' : 
               timeRange === '30d' ? 'Last 30 days' : 
               timeRange === '90d' ? 'Last 3 months' : 'All time'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sentMessages}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalMessages > 0 ? 
                `${(stats.sentMessages / stats.totalMessages * 100).toFixed(1)}% success rate` : 
                'No messages sent'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Messages</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.failedMessages}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalMessages > 0 ? 
                `${(stats.failedMessages / stats.totalMessages * 100).toFixed(1)}% failure rate` : 
                'No messages sent'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Messages</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingMessages}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalMessages > 0 ? 
                `${(stats.pendingMessages / stats.totalMessages * 100).toFixed(1)}% pending` : 
                'No pending messages'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 mr-2" />Overview</TabsTrigger>
          <TabsTrigger value="devices"><Smartphone className="h-4 w-4 mr-2" />Devices</TabsTrigger>
          <TabsTrigger value="history"><Calendar className="h-4 w-4 mr-2" />History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Broadcast Status</CardTitle>
                <CardDescription>Distribution of broadcast campaigns by status</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px]">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Message Status</CardTitle>
                <CardDescription>Distribution of individual messages by status</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                {messageStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={messageStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {messageStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px]">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Broadcasts</CardTitle>
              <CardDescription>Broadcasts with the highest success rates</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {topBroadcasts.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-4 border-b">Name</th>
                        <th className="text-left py-2 px-4 border-b">Device</th>
                        <th className="text-right py-2 px-4 border-b">Messages</th>
                        <th className="text-right py-2 px-4 border-b">Success Rate</th>
                        <th className="text-left py-2 px-4 border-b">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topBroadcasts.map(broadcast => (
                        <tr key={broadcast.id}>
                          <td className="py-2 px-4 border-b">{broadcast.name}</td>
                          <td className="py-2 px-4 border-b">{broadcast.device}</td>
                          <td className="text-right py-2 px-4 border-b">{broadcast.sent} / {broadcast.total}</td>
                          <td className="text-right py-2 px-4 border-b">
                            <Badge className={broadcast.successRate.startsWith('100') ? 
                              'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
                              {broadcast.successRate}
                            </Badge>
                          </td>
                          <td className="py-2 px-4 border-b">{broadcast.created}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    No data available
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="devices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Performance</CardTitle>
              <CardDescription>Compare performance metrics across your devices</CardDescription>
            </CardHeader>
            <CardContent>
              {deviceStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart
                    data={deviceStats}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis dataKey="deviceName" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="broadcasts" name="Total Broadcasts" fill="#8884d8" />
                    <Bar yAxisId="left" dataKey="messagesSent" name="Messages Sent" fill="#82ca9d" />
                    <Bar yAxisId="right" dataKey="successRate" name="Success Rate" fill="#ff8042" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px]">
                  No device data available
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Device Statistics</CardTitle>
              <CardDescription>Detailed metrics for each device</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {deviceStats.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-4 border-b">Device</th>
                        <th className="text-right py-2 px-4 border-b">Broadcasts</th>
                        <th className="text-right py-2 px-4 border-b">Messages Sent</th>
                        <th className="text-right py-2 px-4 border-b">Success Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceStats.map((device, index) => (
                        <tr key={index}>
                          <td className="py-2 px-4 border-b">{device.deviceName}</td>
                          <td className="text-right py-2 px-4 border-b">{device.broadcasts}</td>
                          <td className="text-right py-2 px-4 border-b">{device.messagesSent}</td>
                          <td className="text-right py-2 px-4 border-b">
                            <Badge className={device.successRate > 0.95 ? 
                              'bg-green-100 text-green-800' : 
                              device.successRate > 0.8 ?
                              'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'}>
                              {(device.successRate * 100).toFixed(1)}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    No device data available
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity</CardTitle>
              <CardDescription>Broadcast activity trends over time</CardDescription>
            </CardHeader>
            <CardContent>
              {activityData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart
                    data={activityData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="Broadcasts" fill="#8884d8" />
                    <Bar dataKey="sent" name="Messages Sent" fill="#82ca9d" />
                    <Bar dataKey="failed" name="Failed Messages" fill="#ff8042" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px]">
                  No activity data available
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Message Volume Over Time</CardTitle>
              <CardDescription>Track message volume trends</CardDescription>
            </CardHeader>
            <CardContent>
              {activityData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart
                    data={activityData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sent" name="Sent Messages" stackId="a" fill="#82ca9d" />
                    <Bar dataKey="failed" name="Failed Messages" stackId="a" fill="#ff8042" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px]">
                  No activity data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BroadcastAnalyticsPage; 