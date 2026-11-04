# API contract v1 (ขั้นตอนที่ 1: ล็อกรายการ API action)

ทุกหน้าจอเรียก backend ผ่าน `frontend/api.js` เท่านั้น สัญญานี้ไม่ผูกกับ Apps Script — ถ้าย้ายไป Supabase ให้คงชื่อ action และรูปแบบข้อมูลเดิม

## รูปแบบ

```
POST <API_URL>
Content-Type: text/plain;charset=utf-8      (ไม่ใช่ application/json เพื่อเลี่ยง CORS preflight ของ Apps Script)

{ "action": "assets.save", "token": "<Google ID token>", "payload": { ... }, "requestId": "<uuid>" }
```

```
{ "ok": true,  "data": ..., "requestId": "..." }
{ "ok": false, "error": { "code": "VALIDATION", "message": "Invalid input", "details": { "name": "required" } }, "requestId": "..." }
```

HTTP status เป็น 200 เสมอ (Apps Script กำหนด status ไม่ได้) ให้ดูที่ `ok`

| error code | ความหมาย |
| --- | --- |
| `UNAUTHENTICATED` | ไม่มี token / token หมดอายุ / ไม่ใช่ token ของแอปนี้ → ให้ล็อกอินใหม่ |
| `FORBIDDEN` | ไม่อยู่ในตาราง users, ถูกปิดใช้งาน, Role ไม่มีสิทธิ์ หรือไม่ได้ดูแลโรงแรมนั้น |
| `VALIDATION` | ข้อมูลไม่ผ่าน `details` = { ฟิลด์: ข้อความ } |
| `CONFLICT` | มีคนแก้รายการนี้หลังจากที่เราโหลดมา (`details.current` = ข้อมูลล่าสุด) |
| `NOT_FOUND`, `BAD_REQUEST`, `BUSY`, `CONFIG`, `INTERNAL` | ตามชื่อ |

รายการแบบแบ่งหน้าตอบกลับเป็น `{ items, page, pageSize, total }` รับ `page` (เริ่ม 1) และ `pageSize` (ค่าเริ่มต้น 50, สูงสุด 200)

## Actions

ชื่อ action = ชื่อสิทธิ์ใน `role_permissions` (ยกเว้น `auth.me` ที่ทุกคนที่ล็อกอินได้ใช้ได้)

| action | payload | ผลลัพธ์ | viewer | editor | admin |
| --- | --- | --- | :-: | :-: | :-: |
| `auth.me` | – | `{email, name, role, permissions, hotels}` | ✓ | ✓ | ✓ |
| `dashboard.summary` | – | จำนวนโรงแรม/อุปกรณ์ตามประเภทและสถานะ, การแจ้งเตือนที่เปิดอยู่, License ใกล้หมดอายุ | ✓ | ✓ | ✓ |
| `hotels.search` | `q?, page?, pageSize?, includeInactive?` | หน้าของ hotels (เฉพาะที่ดูแล) | ✓ | ✓ | ✓ |
| `hotels.get` | `hotel_id` | hotel | ✓ | ✓ | ✓ |
| `hotels.save` | hotel (ไม่มี `hotel_id` = สร้างใหม่) | hotel | | | ✓ |
| `assets.list` | `hotel_id?, type?, status?, q?, page?` | หน้าของ assets | ✓ | ✓ | ✓ |
| `assets.get` | `asset_id` | asset | ✓ | ✓ | ✓ |
| `assets.save` | asset (+ `updated_at` ของสำเนาที่โหลดมา เมื่อแก้ไข) | asset | | ✓ | ✓ |
| `alerts.list` | `status?` (ค่าเริ่มต้น `OPEN`, `''` = ทั้งหมด), `hotel_id?, page?` | หน้าของ alerts (+ `hotel_name`) | ✓ | ✓ | ✓ |
| `alerts.update` | `alert_id, status` | alert | | ✓ | ✓ |
| `users.list` | `q?, page?` | หน้าของ users (+ `hotels`), `roles` | | | ✓ |
| `users.save` | `email, name, role, active, hotels?: ['*'] \| [hotel_id…]` | user | | | ✓ |
| `audit.list` | `entity?, entity_id?, user_email?, page?` | หน้าของ audit_log ใหม่สุดก่อน | | | ✓ |
| `admin.clearCache` | – | ล้าง cache ทั้งหมด (ใช้หลังแก้ role_permissions ในชีตโดยตรง) | | | ✓ |
| `admin.runLicenseCheck` | – | รัน Scheduled Job ทันที | | | ✓ |

ทุก action ที่บันทึกข้อมูล (`*.save`, `alerts.update`) ตรวจสิทธิ์ + validate บน server → บันทึก → เขียน Audit Log ตาม Flow 1 ใน Brief
