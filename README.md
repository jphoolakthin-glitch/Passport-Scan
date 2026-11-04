# Passport Scanner Management System (Phase 1)

ระบบจัดการ PC / Scanner / Server ของโรงแรม 200–300 แห่ง ฟรีทั้งหมด:
**Google Apps Script** เป็น API + **Google Sheets** เป็นฐานข้อมูล + หน้าเว็บ HTML/JS แยกโฮสต์ (GitHub Pages / Cloudflare Pages)

```
frontend/  (GitHub Pages)  ──fetch POST text/plain──▶  backend/ (Apps Script Web App)  ──▶  Google Sheets: PSMS Data, PSMS Audit Log
 index.html, app.js           api.js คือไฟล์เดียวที่รู้ URL     Router → Service → Repository        ▲
 auth.js (Sign in with Google)                                                                       └ Time-driven Trigger: runLicenseCheck() ทุกวัน
```

| ไฟล์ | หน้าที่ |
| --- | --- |
| `backend/Router.gs` | `doPost` รับ action → ตรวจตัวตน + สิทธิ์ → เรียก Service (ทิ้งได้ตอนย้ายระบบ) |
| `backend/*Service.gs`, `Auth.gs`, `Audit.gs` | กฎธุรกิจ, validation, ตรวจสิทธิ์, Audit Log |
| `backend/Repository.gs` | ชั้นเดียวที่แตะ `SpreadsheetApp` (ชั้นเดียวที่ต้องเขียนใหม่ตอนย้ายไป Supabase) |
| `backend/LicenseJob.gs` | Flow 2: ตรวจ License หมดอายุ สร้าง/ปิดการแจ้งเตือน ส่งอีเมล |
| `backend/Setup.gs` | `setup()`, `installTriggers()`, `seedDemoData()` |
| `docs/schema.md`, `docs/api.md` | Schema และ API contract v1 (ขั้นตอนที่ 1 ของ Brief) |
| `dev/` | mock ของบริการ Google สำหรับรัน backend จริงบนเครื่อง + tests |

## ติดตั้ง (ครั้งแรก ประมาณ 30 นาที)

ใช้บัญชี Google ที่จะเป็นเจ้าของข้อมูล (Brief หัวข้อ 8: ยังต้องตัดสินใจว่าบัญชีไหน)

**1. สร้างโปรเจกต์ Apps Script**
ไปที่ [script.google.com](https://script.google.com) → New project → ตั้งชื่อ `PSMS API`
สร้างไฟล์ Script ตามชื่อใน `backend/` แล้ววางโค้ดทุกไฟล์ `.gs`
เปิด Project Settings → ติ๊ก "Show appsscript.json" แล้ววางเนื้อหา `backend/appsscript.json`
(หรือใช้ [clasp](https://github.com/google/clasp): `cd backend && clasp create --type standalone --title "PSMS API" && clasp push`)

**2. รัน `setup()`**
เลือกฟังก์ชัน `setup` → Run → อนุญาตสิทธิ์ ระบบจะสร้าง Google Sheets 2 ไฟล์ใน Drive ของคุณ และตั้งคุณเป็น admin คนแรก
(ถ้าต้องการข้อมูลตัวอย่างไว้ทดลอง รัน `seedDemoData()` ด้วย แล้วลบแถวออกก่อนใช้งานจริง)

**3. สร้าง OAuth Client ID สำหรับปุ่ม Sign in with Google**
1. [console.cloud.google.com](https://console.cloud.google.com) → สร้างโปรเจกต์ใหม่ (ฟรี)
2. APIs & Services → OAuth consent screen → User type: **External** → กรอกชื่อแอปและอีเมล → Publish app (ใช้แค่ email/profile จึงไม่ต้องให้ Google ตรวจสอบ)
3. Credentials → Create credentials → OAuth client ID → **Web application**
   → Authorized JavaScript origins: URL หน้าเว็บ เช่น `https://<github-user>.github.io`
4. คัดลอก Client ID → กลับไป Apps Script → Project Settings → Script Properties → เพิ่ม `GOOGLE_CLIENT_ID`

**4. Deploy เป็น Web App**
Deploy → New deployment → Web app
- Execute as: **Me**
- Who has access: **Anyone** — จำเป็นเพื่อให้หน้าเว็บที่อยู่คนละโดเมนเรียกได้ ความปลอดภัยมาจากการตรวจ Google ID token และตาราง users ทุกคำขอ ไม่ใช่จากการซ่อน URL (Brief หัวข้อ 6: ข้อนี้ยังเปิดอยู่)

คัดลอก Web app URL (ลงท้าย `/exec`) เปิดใน browser ควรเห็น `{"ok":true,...}`

**5. ตั้งค่าและเผยแพร่หน้าเว็บ**
แก้ `frontend/config.js`: ใส่ `API_URL` (ข้อ 4) และ `GOOGLE_CLIENT_ID` (ข้อ 3)
อัปโหลดโฟลเดอร์ `frontend/` ขึ้น GitHub Pages หรือ Cloudflare Pages

**6. ตั้ง Scheduled Job** — รัน `installTriggers()` หนึ่งครั้ง (ตรวจ License ทุกวันราว 07:00 น.)

**7. เพิ่มผู้ใช้** — เข้าเว็บด้วยบัญชี admin → เมนูผู้ใช้งาน → เพิ่มอีเมล Gmail ของพนักงาน เลือก Role และโรงแรมที่ดูแล

### เมื่อแก้โค้ด backend
Deploy → Manage deployments → ✏️ → Version: **New version** → Deploy (URL เดิม ไม่ต้องแก้ config.js)

### ตั้งค่าเพิ่มเติม (Script Properties)
| Key | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `ALERT_DAYS_BEFORE` | `30` | แจ้งเตือนล่วงหน้ากี่วันก่อน License หมดอายุ |
| `ALERT_EMAILS` | (ว่าง) | อีเมลรับสรุปการแจ้งเตือนใหม่รายวัน คั่นด้วย `,` |

แก้ Role/สิทธิ์ได้ที่ชีต `role_permissions` (1 แถว = role + action ดู `docs/api.md`) แล้วกด action `admin.clearCache` หรือรอ 10 นาที

## พัฒนาและทดสอบบนเครื่อง

ต้องมี Node.js 18+ ไม่ต้องติดตั้งแพ็กเกจเพิ่ม

```bash
npm test
```

```bash
npm run dev
```

`npm run dev` เปิด http://localhost:8080 ด้วย backend จริงบน mock + ข้อมูลตัวอย่าง (ล็อกอินโดยพิมพ์ `owner@example.com`; ลบ `dev/.data.json` เพื่อเริ่มใหม่)
`node dev/e2e.js` ทดสอบผ่าน browser ทั้ง flow (ต้องเปิด dev server และมี Playwright)

## ความคืบหน้าตาม Proposed next steps ใน Brief

1. ✅ ล็อก sheet schema และ API action list (ร่าง v1: `docs/schema.md`, `docs/api.md`)
2. ✅ Backend 3 ชั้น + Google Sign-In + ตรวจ Role
3. ✅ แดชบอร์ด, ค้นหาโรงแรม, รายการอุปกรณ์
4. ✅ เพิ่ม/แก้ไข + validation + Audit Log (+ กันการเขียนทับด้วย LockService และ conflict check)
5. ✅ Scheduled license check
6. ⏳ Pilot กับโรงแรมกลุ่มแรก — ต้อง deploy บนบัญชีจริงก่อน (ขั้นตอนด้านบน)

ค่าที่ตั้งไว้แทนคำถามที่ยังเปิดอยู่ใน Brief หัวข้อ 10 (แก้ได้โดยไม่ต้องเขียนโค้ดใหม่ ยกเว้นฟิลด์อุปกรณ์):
Role `admin`/`editor`/`viewer` · ผู้ใช้เห็นเฉพาะโรงแรมที่ได้รับมอบหมาย · ฟิลด์อุปกรณ์ชุดเดียวกันทุกประเภท ·
1 อุปกรณ์มี 1 License · แจ้งเตือนล่วงหน้า 30 วัน ทุกวัน แสดงในระบบ + อีเมล (ถ้าตั้ง) · ไม่เก็บข้อมูลพาสปอร์ตแขก
