import redis from 'redis';

// Konfigurasi Redis
const redisConfig = {
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB || '0'),
};

// Buat koneksi Redis
const client = redis.createClient(redisConfig);

// Flag untuk menandai status koneksi
let isConnected = false;
let isConnecting = false;

// Log error jika ada masalah koneksi
client.on('error', (err) => {
  console.error('Redis error:', err);
  isConnected = false;
});

// Log ketika berhasil connect
client.on('connect', () => {
  //console.log('Redis connected successfully');
  isConnected = true;
});

// Handle disconnection
client.on('end', () => {
  console.log('Redis connection ended');
  isConnected = false;
});

// Handle reconnection
client.on('reconnecting', () => {
  console.log('Redis reconnecting...');
  isConnecting = true;
});

// Ensure connection is established
const ensureConnection = async () => {
  if (!isConnected && !isConnecting) {
    try {
      isConnecting = true;
      await client.connect();
      isConnected = true;
      isConnecting = false;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      isConnecting = false;
      throw error;
    }
  }
};

// Log ketika disconnect
client.on('end', () => {
  console.log('Redis connection closed');
  isConnected = false;
});


// Fungsi untuk menyimpan data dengan TTL (Time-To-Live)
async function setWithTTL(key, value, ttlInSeconds = 172800) {
  try {
    await ensureConnection();
    await client.set(key, JSON.stringify(value));
    // edi offkan dul
    
    await client.expire(key, ttlInSeconds);
    return true;
  } catch (error) {
    console.error(`Redis setWithTTL error for key ${key}:`, error);
    return false;
  }
}

// Fungsi untuk menyimpan data dengan TTL (Time-To-Live)
async function set(key, value) {
  try {
    await ensureConnection();
    await client.set(key, JSON.stringify(value));

    return true;
  } catch (error) {
    console.error(`Redis setWithTTL error for key ${key}:`, error);
    return false;
  }
}

// Fungsi untuk mendapatkan data
async function get(key) {
  try {
    await ensureConnection();
    const reply = await client.get(key);
    if (!reply) return null;

    // Pengecualian: Jika kunci adalah untuk api_key, kembalikan sebagai string mentah
    // untuk menghindari peringatan JSON parse yang tidak perlu.
    if (key.startsWith('api_key:')) {
      return reply;
    }

    try {
      return JSON.parse(reply);
    } catch (error) {
      // Jika gagal parse, kembalikan string as-is
      console.warn(`Redis get warning: value for key ${key} is not valid JSON, returning as string.`);
      return reply;
    }
  } catch (error) {
    console.error(`Redis get error for key ${key}:`, error);
    return null;
  }
}

// Fungsi untuk menghapus data
async function del(key) {
  try {
    await ensureConnection();
    const result = await client.del(key);
    return result > 0;
  } catch (error) {
    console.error(`Redis del error for key ${key}:`, error);
    return false;
  }
}

// Fungsi untuk mendapatkan semua key dengan pattern
async function keys(pattern) {
  try {
    await ensureConnection();
    return await client.keys(pattern);
  } catch (error) {
    console.error(`Redis keys error for pattern ${pattern}:`, error);
    return [];
  }
}

// Fungsi untuk memeriksa keberadaan key
async function exists(key) {
  try {
    await ensureConnection();
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    console.error(`Redis exists error for key ${key}:`, error);
    return false;
  }
}

// Fungsi untuk mendapatkan TTL (waktu kedaluwarsa) dari key
async function ttl(key) {
  try {
    await ensureConnection();
    return await client.ttl(key);
  } catch (error) {
    console.error(`Redis ttl error for key ${key}:`, error);
    return -1;
  }
}

// Fungsi untuk memeriksa status koneksi Redis
async function ping() {
  try {
    await ensureConnection();
    const response = await client.ping();
    return response === 'PONG';
  } catch (error) {
    console.error('Redis ping error:', error);
    return false;
  }
}

/**
 * Menyimpan string mentah ke Redis tanpa JSON.stringify otomatis.
 * @param {string} key Kunci Redis.
 * @param {string} value Nilai string yang akan disimpan.
 * @returns {Promise<boolean>}
 */
async function setRaw(key, value) {
  try {
    await ensureConnection();
    await client.set(key, value);
    return true;
  } catch (error) {
    console.error(`Redis setRaw error for key ${key}:`, error);
    return false;
  }
}

/**
 * Mengambil string mentah dari Redis tanpa JSON.parse otomatis.
 * @param {string} key Kunci Redis.
 * @returns {Promise<string|null>}
 */
async function getRaw(key) {
  try {
    await ensureConnection();
    return await client.get(key);
  } catch (error) {
    console.error(`Redis getRaw error for key ${key}:`, error);
    return null;
  }
}

// Fungsi untuk menghapus member dari set
async function removeSetMember(key, member) {
  try {
    await ensureConnection();
    const result = await client.sRem(key, member);
    return result > 0;
  } catch (error) {
    console.error(`Redis removeSetMember error for key ${key}, member ${member}:`, error);
    return false;
  }
}

export {
  client,
  setWithTTL,
  set,
  get,
  del,
  keys,
  exists,
  ttl,
  ping,
  removeSetMember,
  setRaw,
  getRaw,
  ensureConnection,
};

export const isConnectedStatus = () => isConnected; 