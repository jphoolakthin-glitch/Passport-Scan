# Sheet schema v1 (ขั้นตอนที่ 1: ล็อก schema)

แหล่งจริงของ schema อยู่ใน `backend/Schema.gs` — ไฟล์นี้คือฉบับอ่านง่าย ถ้าแก้ ต้องแก้ทั้งสองที่

กฎการออกแบบ (จาก Project Brief หัวข้อ 4): 1 sheet = 1 ตาราง, แถวแรกเป็นชื่อคอลัมน์ snake_case, คีย์หลักเป็น UUID,
เชื่อมตารางด้วย ID, วันที่เป็น ISO, ทุก cell เป็น Plain text (ไม่มีสูตร/merge/สีที่มีความหมาย), Audit before/after เป็น JSON

ประเภทคอลัมน์: `string` · `bool` (`TRUE`/`FALSE`) · `int` · `date` (`YYYY-MM-DD`) · `datetime` (`2026-11-04T14:18:00.123+07:00`) · `json`

## ไฟล์ "PSMS Data"

| ตาราง | คอลัมน์ | หมายเหตุ |
| --- | --- | --- |
| `users` | email, name, role, active, created_at, updated_at | คีย์ = email (ตัวพิมพ์เล็ก) |
| `role_permissions` | id, role, action | `action` = ชื่อ API action หรือ `*` = ทุกอย่าง |
| `user_hotels` | id, user_email, hotel_id | `hotel_id` = `*` คือทุกโรงแรม |
| `hotels` | hotel_id, code, name, province, address, contact_name, contact_phone, active, created_at, updated_at | `code` ไม่ซ้ำ, เก็บเป็นตัวพิมพ์ใหญ่ |
| `assets` | asset_id, hotel_id, type, name, brand, model, serial_number, ip_address, location, status, license_name, license_expiry, notes, created_at, created_by, updated_at, updated_by | `type` = PC / SCANNER / SERVER |
| `alerts` | alert_id, created_at, asset_id, hotel_id, alert_type, license_expiry, days_left, message, status, updated_at, updated_by | สร้างโดย Scheduled Job |

## ไฟล์ "PSMS Audit Log" (แยกไฟล์ เพราะโตเร็วที่สุด)

| ตาราง | คอลัมน์ |
| --- | --- |
| `audit_log` | audit_id, timestamp, user_email, action, entity, entity_id, before, after, request_id |

## ค่าที่กำหนดไว้ (enum)

| ฟิลด์ | ค่า |
| --- | --- |
| `assets.type` | PC, SCANNER, SERVER |
| `assets.status` | ACTIVE, REPAIR, INACTIVE, RETIRED |
| `alerts.alert_type` | LICENSE_EXPIRING, LICENSE_EXPIRED |
| `alerts.status` | OPEN, ACKNOWLEDGED, RESOLVED |

## สิ่งที่ต่างจาก Brief และค่าเริ่มต้นที่ตั้งไว้แทนคำถามที่ยังเปิดอยู่

- `user_hotels.user` → `user_email` และ `audit_log.user` → `user_email` เพราะ `user` เป็นคำสงวนใน Postgres (ย้ายไป Supabase ได้ไม่ต้องเปลี่ยนชื่อ)
- เพิ่ม `id` ให้ `role_permissions` และ `user_hotels` (ทุกตารางมีคีย์หลัก)
- **[ค่าเริ่มต้น]** ฟิลด์ของ assets: ใช้ชุดเดียวกันทั้ง PC / Scanner / Server (ยังไม่มีฟิลด์เฉพาะประเภท)
- **[ค่าเริ่มต้น]** 1 อุปกรณ์มี License ได้ 1 รายการ (`license_name`, `license_expiry`) ทุกประเภท
- **[ค่าเริ่มต้น]** Role 3 แบบ: `admin` (ทุกอย่าง), `editor` (ดู + เพิ่ม/แก้อุปกรณ์ + จัดการการแจ้งเตือน), `viewer` (ดูอย่างเดียว) — แก้ได้ในตาราง `role_permissions`
- **[ค่าเริ่มต้น]** ผู้ใช้เห็นเฉพาะโรงแรมที่กำหนดใน `user_hotels` (admin เห็นทุกโรงแรม)
- ไม่มีข้อมูลพาสปอร์ตของแขกในระบบ — เก็บเฉพาะข้อมูลอุปกรณ์ (Brief หัวข้อ 8 ยังเปิดอยู่)
