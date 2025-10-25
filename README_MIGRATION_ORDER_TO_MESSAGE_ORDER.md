# Migrasi Kolom `order` menjadi `message_order` pada Modul Drip Campaign

## Ringkasan Perubahan

Migrasi ini mengubah nama kolom `order` menjadi `message_order` pada tabel `drip_messages` untuk menghindari penggunaan kata kunci SQL reserved word. Perubahan ini memerlukan update pada beberapa file di backend dan frontend.

## File yang Diubah

### Backend (Server)

1. **Server/src/jobs/dripWorker.js**
   - Semua referensi `.filter('order', 'eq', ...)` menjadi `.filter('message_order', 'eq', ...)`
   - Variabel dan fungsi yang mengakses `msg.order` diubah menjadi `msg.message_order`
   - Log pesan yang mereferensikan `order` diubah menjadi `message_order`

2. **Server/src/api/routes/dripRoutes.js**
   - Query `.order('order', { ascending: true })` diubah menjadi `.order('message_order', { ascending: true })`
   - Field mapping saat insert/update menjadi `message_order: order`
   - Field pada query join `drip_messages ( id, message, "message_order" )`

3. **Server/src/api/services/dripSegmentService.js**
   - Referensi `order: 1` dan `order=1` diubah menjadi `message_order: 1` dan `message_order=1`

4. **Server/src/api/services/dripCampaignService.js**
   - Pesan log yang mereferensikan `order 1` diubah menjadi `message_order 1`

5. **Server/src/jobs/dripScheduler.js**
   - Query `.order('order', { ascending: true })` diubah menjadi `.order('message_order', { ascending: true })`
   - Variabel dan fungsi yang mengakses `msg.order` diubah menjadi `msg.message_order`
   - Log pesan yang mereferensikan `order` diubah menjadi `message_order`

### Frontend (Client-UI)

1. **Client-UI/src/pages/dashboard/DripCampaignCreatePage.tsx**
   - Interface `DripMessage` diubah dari `order: number` menjadi `message_order: number`
   - Semua referensi `message.order` di komponen menjadi `message.message_order`
   - Semua fungsi yang mengubah array pesan juga diubah untuk menggunakan field `message_order`

2. **Client-UI/src/pages/dashboard/DripCampaignEditPage.tsx**
   - Interface `DripMessage` diubah dari `order: number` menjadi `message_order: number`
   - Semua referensi `message.order` di komponen menjadi `message.message_order`
   - Fungsi `cleanMessageForAPI` diubah untuk mengkonversi dari `message_order` ke `order` untuk API

3. **Client-UI/src/pages/dashboard/DripCampaignDetailPage.tsx**
   - Interface `DripMessage` diubah dari `order: number` menjadi `message_order: number`
   - Referensi sorting `.sort((a, b) => a.order - b.order)` diubah menjadi `.sort((a, b) => a.message_order - b.message_order)`
   - Penampilan UI untuk `Pesan #{message.order}` diubah menjadi `Pesan #{message.message_order}`

## Database Migration

File SQL untuk menjalankan migrasi database:

```sql
-- Migration untuk mengubah nama kolom dari "order" menjadi "message_order"
ALTER TABLE "public"."drip_messages" RENAME COLUMN "order" TO "message_order";

-- Drop dan buat ulang fungsi get_first_drip_message
DROP FUNCTION IF EXISTS "public"."get_first_drip_message"(campaign_id_input uuid);

CREATE OR REPLACE FUNCTION "public"."get_first_drip_message"(campaign_id_input uuid)
RETURNS SETOF "public"."drip_messages" 
LANGUAGE "plpgsql" 
AS $$
BEGIN
  RETURN QUERY SELECT * FROM "public"."drip_messages" 
    WHERE "drip_campaign_id" = campaign_id_input 
    AND "message_order" = 1 
    LIMIT 1;
END;
$$;

-- Berikan permission pada fungsi
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_first_drip_message"(uuid) TO "service_role";
```

## Cara Deployment

1. Backup database terlebih dahulu
2. Jalankan migration SQL pada database
3. Deploy kode backend dan frontend yang sudah diupdate
4. Pastikan semua proses background (worker, scheduler) sudah direstart
5. Lakukan pengujian untuk memastikan semua fitur modul Drip Campaign berfungsi dengan baik

## Catatan Penting

- API tetap menerima parameter `order` dari client untuk backward compatibility, tetapi secara internal disimpan sebagai `message_order`
- Pastikan semua fungsi dan prosedur tersimpan di database yang menggunakan kolom `order` sudah diupdate 