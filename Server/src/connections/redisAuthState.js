import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { 
    getRaw as getFromRedis, 
    setRaw as setToRedis, 
    del as delFromRedis 
} from '../utils/redis.js';

// Awalan untuk semua kunci Redis yang terkait dengan sesi
const KEY_PREFIX = 'session:';

// Default TTL untuk session keys (30 hari)
const SESSION_TTL = 180 * 24 * 60 * 60; // 180 hari dalam detik

/**
 * Membaca data dari Redis.
 * Mengambil string mentah dan mem-parsingnya dengan BufferJSON.reviver
 * untuk merekonstruksi Buffer dan tipe data khusus lainnya.
 * 
 * @param {string} key Kunci Redis.
 * @returns {Promise<any>} Data yang sudah di-parse.
 */
const readData = async (key) => {
    const data = await getFromRedis(key);
    if (data) {
        // Parse menggunakan BufferJSON untuk menghidupkan kembali Buffer dari string
        return JSON.parse(data, BufferJSON.reviver);
    }
    return null;
};

/**
 * Menulis data ke Redis.
 * Menggunakan BufferJSON.replacer untuk mengubah Buffer menjadi format yang bisa di-serialisasi,
 * lalu menyimpannya sebagai string mentah.
 * 
 * @param {string} key Kunci Redis.
 * @param {any} data Data yang akan ditulis.
 * @param {number} ttl TTL dalam detik (default: 30 hari)
 */
const writeData = async (key, data, ttl = SESSION_TTL) => {
    // Stringify menggunakan BufferJSON replacer dan set ke Redis sebagai string mentah
    const stringifiedData = JSON.stringify(data, BufferJSON.replacer);
    
    // Simpan data di Redis dengan TTL
    try {
        await setToRedis(key, stringifiedData);
        
        // Tambahkan TTL ke key
        const { client: redis } = await import('../utils/redis.js');
        await redis.expire(key, ttl);
        
        // Tambahkan log untuk debugging jika diperlukan
        // console.log(`Set TTL ${ttl} seconds untuk key ${key}`);
        
        return true;
    } catch (error) {
        console.error(`Error menyimpan data untuk key ${key}:`, error);
        return false;
    }
};

/**
 * Menghapus data dari Redis.
 * @param {string} key Kunci Redis.
 */
const removeData = (key) => {
    return delFromRedis(key);
};

/**
 * Membuat state otentikasi yang didukung oleh Redis.
 * Ini adalah pengganti `useMultiFileAuthState`.
 * @param {string} connectionId ID koneksi yang unik.
 * @returns {Promise<{ state: { creds: any, keys: any }, saveCreds: () => Promise<void>, clearState: () => Promise<void> }>}
 */
const useRedisAuthState = async (connectionId) => {
    const credsKey = `${KEY_PREFIX}${connectionId}:creds`;
    const keysKey = `${KEY_PREFIX}${connectionId}:keys`;

    // Ambil kredensial dari Redis, atau inisialisasi jika tidak ada
    const creds = await readData(credsKey) || initAuthCreds();

    const keys = {
        /**
         * Mengambil kunci-kunci (seperti pre-key, signed-pre-key, dll.) dari Redis.
         */
        get: async (type, ids) => {
            const allKeys = await readData(keysKey) || {};
            const data = {};
            for (const id of ids) {
                const key = `${type}-${id}`;
                if (allKeys[key]) {
                    data[id] = allKeys[key];
                }
            }
            return data;
        },
        /**
         * Menyimpan/memperbarui kunci-kunci ke Redis.
         */
        set: async (data) => {
            const allKeys = await readData(keysKey) || {};
            for (const type in data) {
                for (const id in data[type]) {
                    const key = `${type}-${id}`;
                    allKeys[key] = data[type][id];
                }
            }
            await writeData(keysKey, allKeys);
        },
    };

    return {
        state: { creds, keys },
        /**
         * Fungsi yang dipanggil oleh Baileys setiap kali kredensial diperbarui.
         */
        saveCreds: () => {
            return writeData(credsKey, creds);
        },
        /**
         * Fungsi untuk membersihkan semua data sesi dari Redis (untuk logout).
         */
        clearState: async () => {
            await removeData(credsKey);
            await removeData(keysKey);
        }
    };
};

export { useRedisAuthState }; 