import { toast } from '@/components/ui/use-toast';

/**
 * Calls the API endpoint to refresh the message triggers cache in Redis.
 * @param connectionId - The ID of the connection to refresh.
 * @param apiKey - The API key for the connection.
 */
export const refreshTriggerCache = async (connectionId: string, apiKey: string) => {
  if (!connectionId || !apiKey) {
    console.warn('Cannot refresh trigger cache without connectionId and apiKey.');
    return;
  }

  try {
    const API_SERVER_URL = import.meta.env.VITE_API_SERVER_URL || 'http://localhost:3000';
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(`${API_SERVER_URL}/api/connections/${connectionId}/triggers/refresh-simple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'connection_id': connectionId,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle non-JSON responses gracefully
      let errorMessage = `API error: ${response.statusText} (${response.status})`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        }
      } catch (parseError) {
        console.error('Error parsing error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    // Optional: show a success toast, but can be annoying if called too often.
    // toast({ description: 'Trigger cache refreshed successfully.' });
    console.log(`Trigger cache refreshed for connection ${connectionId}`);

  } catch (error: any) {
    console.error('Error refreshing trigger cache:', error);
    
    // Handle timeout specifically
    if (error.name === 'AbortError') {
      console.warn('Trigger cache refresh timed out after 10 seconds');
      // Don't show error toast for timeout, just log it
      return;
    }
    
    toast({
      variant: 'destructive',
      title: 'Cache Refresh Failed',
      description: `Could not refresh the trigger cache: ${error.message}`,
    });
  }
}; 