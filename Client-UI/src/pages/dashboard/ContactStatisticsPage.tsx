import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface Connection {
  id: string;
  name: string;
}

interface StatsRow {
  connection_id: string | null;
  device_name: string;
  leadsToday: number;
  totalContacts: number;
}

const ContactStatisticsPage = () => {
  const [stats, setStats] = useState<StatsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedConnection, setSelectedConnection] = useState<string | "all">("all");
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    fetchStats();
  }, [selectedConnection]);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setIsLoading(false);
        return;
      }

      // get connections
      const { data: connData, error: connErr } = await supabase
        .from("connections")
        .select("id, name")
        .eq("user_id", userData.user.id);
      if (connErr) throw connErr;
      setConnections(connData || []);
      const connMap = new Map(connData?.map((c) => [c.id, c.name]) || []);

      // Build query for contacts
      const todayStart = format(new Date(), "yyyy-MM-dd");

      let contactQuery = supabase
        .from("contacts")
        .select("id, connection_id, created_at", { count: "exact" })
        .eq("owner_id", userData.user.id);

      if (selectedConnection !== "all") {
        contactQuery = contactQuery.eq("connection_id", selectedConnection);
      }

      const { data: contactsData, error } = await contactQuery;
      if (error) throw error;

      // group stats
      const map = new Map<string | null, { leadsToday: number; total: number }>();
      (contactsData || []).forEach((c: any) => {
        const key = c.connection_id || null;
        const group = map.get(key) || { leadsToday: 0, total: 0 };
        const isToday = c.created_at && c.created_at.startsWith(todayStart);
        if (isToday) group.leadsToday += 1;
        group.total += 1;
        map.set(key, group);
      });

      const rows: StatsRow[] = Array.from(map.entries()).map(([connId, grp]) => ({
        connection_id: connId,
        device_name: connMap.get(connId) || (connId ?? "-"),
        leadsToday: grp.leadsToday,
        totalContacts: grp.total,
      }));

      setStats(rows);
    } catch (err) {
      console.error(err);
      setStats([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact Statistics</CardTitle>
        <CardDescription>Ringkasan leads per device / connection.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4">
          <Select value={selectedConnection} onValueChange={(val) => setSelectedConnection(val as any)}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Pilih Device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => fetchStats()}>Refresh</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : stats.length === 0 ? (
          <p>No data found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Device</th>
                  <th className="text-left p-2">Leads Today</th>
                  <th className="text-left p-2">Total Contacts</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr key={row.connection_id ?? "none"} className="border-b">
                    <td className="p-2">{row.device_name}</td>
                    <td className="p-2">{row.leadsToday}</td>
                    <td className="p-2">{row.totalContacts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ContactStatisticsPage; 