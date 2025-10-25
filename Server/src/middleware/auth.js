/**
 * Authentication middleware
 * 
 * Extracts user ID from x-user-id header
 */

// Simple middleware to extract user ID from header
const authenticateUser = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  
  if (!userId) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication failed. User ID header is missing.' 
    });
  }
  
  // Attach user object to request
  req.user = { id: userId };
  next();
};

export {
  authenticateUser
}; 