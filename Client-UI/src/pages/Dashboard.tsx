import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Gunakan setTimeout untuk memberikan waktu bagi sidebar untuk memeriksa autentikasi
    const redirectTimer = setTimeout(() => {
      // Redirect to devices page by default
      navigate("/dashboard/devices", { replace: true });
    }, 300);
    
    // Cleanup timer jika komponen unmount
    return () => clearTimeout(redirectTimer);
  }, [navigate]);
  
  return null; // Redirecting, so don't render anything
};

export default Dashboard;
