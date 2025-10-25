// Default rate limit jika tidak ditentukan di database
const DEFAULT_RATE_LIMIT = {
  max: 5,            // Dari 10 menjadi 5 pesan per window
  duration: 120000,  // Dari 60 detik menjadi 120 detik
  initialBackoff: 10000, // Backoff awal lebih panjang
}; 