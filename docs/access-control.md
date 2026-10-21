# สิทธิ์เข้าถึงข้อมูล: ระยะแรก

## ขอบเขต

อัปเดต: [Team mode และ Account Management](accounts.md) เพิ่มบัญชีและ session แล้ว รายละเอียดด้านล่างอธิบาย Local workspace policy; Team mode ใช้ role จาก session แทน environment ส่วนสิทธิ์ราย Gateway และ audit ยังไม่ทำ

EDITH เพิ่ม **local workspace policy** สำหรับ Vite development runtime กำหนดจากฝั่ง server ตอนเริ่มโปรแกรม ไม่ใช่ระบบ login/RBAC รายผู้ใช้ ผู้ที่เปิด workspace เดียวกันได้รับ role เดียวกัน ห้ามใช้ฟีเจอร์นี้เป็นเหตุผลในการเปิด EDITH สู่เครือข่ายสาธารณะ

| ความสามารถ | Viewer | Developer | Admin |
| --- | --- | --- | --- |
| ดู metrics และรายการ requests/logs | ได้ | ได้ | ได้ |
| รับ request/response body จาก server | ไม่ได้ | ได้ | ได้ |
| รับ credentials แบบไม่ปิดบัง | ไม่ได้ | ไม่ได้ | ได้ |
| Start/Stop Gateway และจัดการ connections | ไม่ได้ | ได้ | ได้ |
| Export ผ่าน UI | ไม่ได้ | ได้ | ได้ |

ค่าเริ่มต้นเป็น **Admin** เพื่อคงพฤติกรรม local-owner เดิม ค่าที่ไม่รู้จักทำให้เริ่ม development server ไม่สำเร็จ ไม่ fallback ไปสิทธิ์สูงกว่า ไม่มี endpoint เปลี่ยน role หรือเพิ่มสิทธิ์ผ่าน client header

## วิธีรัน

macOS/Linux:

```sh
EDITH_ACCESS_ROLE=viewer npm run dev:web --workspace appsdesktop
EDITH_ACCESS_ROLE=developer npm run dev:web --workspace appsdesktop
EDITH_ACCESS_ROLE=admin npm run dev:web --workspace appsdesktop
```

Windows PowerShell:

```powershell
$env:EDITH_ACCESS_ROLE = 'viewer'
npm run dev:web --workspace appsdesktop
```

ต้องหยุด server เดิมก่อน แล้วเริ่มด้วย role ใหม่และ reload หน้าเว็บ การลดสิทธิ์ไม่สามารถถอนข้อมูลที่ browser ได้รับไปแล้วก่อนหน้านั้นได้ สถานะ `Access: ...` แสดงบนแถบด้านบน หากอ่าน policy ไม่ได้ UI จะไม่อนุญาต body/reveal/export หรือควบคุม Gateway

## สิ่งที่เริ่มทำแล้ว

- Middleware อยู่ก่อน service ของ Gateway, HTTP Proxy, SDK และ System Monitor
- `/__edith_access/policy` เป็น GET แบบ read-only ตรวจ local Host/Origin และไม่ใช้ CORS เปิดกว้าง
- Viewer ถูกปฏิเสธคำสั่งเปลี่ยนสถานะของ Gateway, HTTP Proxy และ SDK receiver ด้วย HTTP 403 ฝั่ง server แม้เรียก API เอง
- SDK ingestion POST/OPTIONS ใช้การตรวจ pairing token และ CORS เดิม ไม่ถูกเปลี่ยนให้ใช้ workspace role แทน การอ่าน SDK records ยังคงผ่านตัวกรอง policy
- Server กรอง JSON ก่อนส่งกลับ ไม่ใช่เพียงซ่อนปุ่ม: Viewer ไม่ได้รับ requestBody/responseBody; Developer/Viewer ปิดบัง header เช่น Authorization, Cookie และ API key รวมถึง credentials และ secret query parameters ใน URL ที่รู้จัก
- มีการกรอง secret keys ใน structured JSON และแพตเทิร์นที่รู้จักในข้อความ body/log โดยไม่แก้ข้อมูลที่ส่งต่อให้ backend
- UI ตรวจสิทธิ์ก่อนเปิดเผย credentials/ดาวน์โหลด และปิดปุ่ม export ของเครื่องมือ รวมถึง Start/Stop ใน Gateway node ตาม role
- หาก policy โหลดไม่ได้ UI ใช้สิทธิ์จำกัด ส่วน packaged/static frontend ยังไม่มี policy service ในระยะนี้

## ข้อจำกัดที่ต้องเข้าใจ

- Local mode ไม่มี login; Team mode มีบัญชีและ session แล้ว แต่ยังไม่มีสิทธิ์ราย Gateway, audit trail หรือ permission editor
- Role นี้จำกัดการเข้าถึงผ่าน development UI/API เท่านั้น ผู้ที่ควบคุมเครื่องหรือ environment ของ server ยังเปลี่ยน role และอ่านหน่วยความจำได้
- Server ยังเก็บข้อมูล capture ต้นฉบับไว้ใน buffer ชั่วคราว ตัวกรองใช้กับการส่งออกจาก API ไม่ใช่การลบ secret ก่อนเก็บลงหน่วยความจำ
- การกรอง secret เป็น best effort ไม่สามารถรับรองการตรวจพบข้อมูลส่วนบุคคล, secret ที่ใช้ชื่ออื่น, binary หรือ free-form logs ได้ทั้งหมด
- การปิด Export เป็นข้อจำกัดใน UI ไม่มี server-side export endpoint ปัจจุบัน ไม่สามารถห้ามคัดลอกข้อมูลที่ผู้ใช้ได้รับสิทธิ์อ่านแล้ว
- ไฟล์ที่ผู้ใช้ import เองอยู่ฝั่ง browser จึงอยู่นอกขอบเขตการคุ้มครองข้อมูลฝั่ง server นี้ การดาวน์โหลดผ่าน UI ยังตรวจ policy
- ปุ่มควบคุมบาง service ยังใช้หน้าตาเดิม แต่ server ปฏิเสธคำสั่งที่ Viewer ไม่มีสิทธิ์
- ยังไม่มีการใช้สิทธิ์นี้กับ native Tauri commands หรือการป้องกันระดับระบบปฏิบัติการ

## ระยะถัดไป

1. เพิ่ม identity และ authenticated session ที่ฝั่ง server ตรวจสอบได้
2. ผูก role และสิทธิ์ราย Gateway เข้ากับ session แทน environment เดียว
3. เพิ่ม audit events สำหรับ Start/Stop, config changes, reveal และ export
4. ออกแบบ ingestion/storage redaction และ retention settings ให้ชัดเจน
5. ทดสอบ role/session isolation และ permission revocation ก่อนรองรับ shared/remote deployment

## การทดสอบ

ชุดทดสอบ policy ตรวจ role ไม่ถูกต้อง, nested secret/header/body/URL filtering, การไม่แก้ต้นฉบับ, Viewer mutation rejection, การส่ง header อ้าง role Admin ที่ไม่ทำให้เพิ่มสิทธิ์, API filtering และ foreign-origin rejection ชุดทดสอบ desktop รวมล่าสุดผ่าน 40 รายการ
