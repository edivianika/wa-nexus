import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const BroadcastDetailPage = () => {
  const { broadcastId } = useParams();
  const [broadcast, setBroadcast] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoading(true);
      setError("");
      try {
        // Fetch broadcast job detail
        const { data: job, error: jobError } = await supabase
          .from<any, any>('broadcast_jobs')
          .select('*')
          .eq('id', broadcastId)
          .single();
        if (jobError) throw jobError;
        setBroadcast(job);
        // Fetch messages for this job
        const { data: msgData, error: msgError } = await supabase
          .from<any, any>('broadcast_messages')
          .select('*')
          .eq('job_id', broadcastId)
          .limit(1000);
        if (msgError) throw msgError;
        setMessages(msgData || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load broadcast detail');
      } finally {
        setIsLoading(false);
      }
    };
    if (broadcastId) fetchDetail();
  }, [broadcastId]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Broadcast Detail</h1>
      <p>Broadcast ID: <span className="font-mono">{broadcastId}</span></p>
      {isLoading ? (
        <p className="mt-4">Loading...</p>
      ) : error ? (
        <p className="mt-4 text-red-600">{error}</p>
      ) : !broadcast ? (
        <p className="mt-4">Broadcast not found.</p>
      ) : (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Broadcast Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p><b>Name:</b> {broadcast.broadcast_name || broadcast.message || '-'}</p>
                  <p><b>Status:</b> <Badge>{broadcast.status}</Badge></p>
                  <p><b>Created:</b> {format(new Date(broadcast.created_at), 'dd MMM yyyy, HH:mm')}</p>
                  <p><b>Scheduled:</b> {broadcast.schedule ? format(new Date(broadcast.schedule), 'dd MMM yyyy, HH:mm') : '-'}</p>
                </div>
                <div>
                  <p><b>Total Contacts:</b> {broadcast.total_contacts}</p>
                  <p><b>Sent:</b> {broadcast.sent_count}</p>
                  <p><b>Failed:</b> {broadcast.failed_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Message Status</CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p>No message data found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent At</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((msg) => (
                        <TableRow key={msg.id}>
                          <TableCell>{msg.contact}</TableCell>
                          <TableCell><Badge>{msg.status}</Badge></TableCell>
                          <TableCell>{msg.sent_at ? format(new Date(msg.sent_at), 'dd MMM yyyy, HH:mm') : '-'}</TableCell>
                          <TableCell>{msg.error || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default BroadcastDetailPage; 