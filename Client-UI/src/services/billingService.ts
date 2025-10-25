import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Helper to get auth token
const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

// Define API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Fetches the active subscription for the current user.
 * @returns {Promise<any>} The active subscription data or null.
 */
export const getActiveSubscription = async () => {
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("Authentication token not found.");
    }
    
    // Get user from Supabase to include the user ID in the headers
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        throw new Error("User not found.");
    }

    const response = await fetch(`${API_URL}/billing/subscription`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-user-id': user.id, // Include the user ID
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to fetch subscription");
    }

    const result = await response.json();
    return result.data; // The API returns { success: true, data: subscription }
  } catch (error) {
    console.error("Error fetching active subscription:", error);
    // Let the calling component handle toast messages for better UX
    throw error;
  }
}; 