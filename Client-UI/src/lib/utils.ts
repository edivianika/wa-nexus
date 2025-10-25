import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate a random string of specified length
export function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Convert ArrayBuffer to hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function generateDeviceId(userId: string): Promise<string> {
  const timestamp = Date.now().toString()
  const randomStr = generateRandomString(12) // Menggunakan string random yang lebih panjang
  const dataToHash = `${userId}-${timestamp}-${randomStr}`
  
  // Menggunakan Web Crypto API untuk enkripsi
  const msgBuffer = new TextEncoder().encode(dataToHash)
  const hashBuffer = await crypto.subtle.digest('SHA-384', msgBuffer) // Menggunakan SHA-384 untuk variasi
  const hashHex = bufferToHex(hashBuffer)
  
  // Mengambil 32 karakter untuk device ID
  return hashHex.substring(0, 32).toLowerCase()
}

export async function generateApiKey(deviceId: string, userId: string): Promise<string> {
  const timestamp = Date.now().toString()
  const randomStr = generateRandomString(16)
  const dataToHash = `${deviceId}-${userId}-${timestamp}-${randomStr}`
  
  // Menggunakan Web Crypto API untuk enkripsi dengan hasil yang lebih panjang
  const msgBuffer = new TextEncoder().encode(dataToHash)
  const hashBuffer = await crypto.subtle.digest('SHA-512', msgBuffer)
  const hashHex = bufferToHex(hashBuffer)
  
  // Mengambil 48 karakter untuk API key yang lebih panjang
  return hashHex.substring(0, 48).toLowerCase()
}
