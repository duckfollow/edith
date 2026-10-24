# Team mode และ Account Management

## สถานะ

เพิ่มระบบบัญชีระยะแรกสำหรับ **Vite development runtime และแอป macOS แบบติดตั้ง** แล้ว Local mode เดิมไม่ต้องสมัครบัญชี ทั้งสองโหมดยังใช้บนเครื่องเดียวผ่าน loopback ไม่ใช่บริการบัญชีสำหรับเปิดให้เข้าใช้งานจากอินเทอร์เน็ต

| โหมด | วิธีตรวจสิทธิ์ |
| --- | --- |
| Local (ค่าเริ่มต้น) | `EDITH_ACCESS_ROLE` ของ workspace เดิม ไม่มี login |
| Team | Cookie session ของผู้ใช้ที่ login และ role ที่ server อ่านจากบัญชี |

Team mode ใช้ role จากบัญชีแทน `EDITH_ACCESS_ROLE` ไม่มีการรับ role ที่ client ส่งมาเพื่อเพิ่มสิทธิ์

## เริ่มใช้งาน

หยุด development server เดิมก่อน แล้วรันจาก repository root:

macOS/Linux:

```sh
EDITH_MODE=team npm run dev:web --workspace appsdesktop
```

Windows PowerShell:

```powershell
$env:EDITH_MODE = 'team'
npm run dev:web --workspace appsdesktop
```

1. เปิด `http://127.0.0.1:1420` โดยใช้ hostname นี้สม่ำเสมอ เพราะ cookie ของ localhost และ 127.0.0.1 เป็นคนละชุด
2. หากยังไม่มีบัญชี Terminal จะแสดง **EDITH first-owner setup token** ให้ใช้กับหน้าสร้างเจ้าของครั้งแรก ไม่ต้องส่ง token นี้ให้ผู้อื่น
3. ตั้ง username 3–64 ตัวอักษร (letters/numbers/dot/underscore/hyphen) โดยระบบ normalize เป็น lowercase และ password 12–256 ตัวอักษร
4. บัญชีแรกเป็น Admin และ login อัตโนมัติหลังตั้งค่า
5. ครั้งถัดไปใช้หน้า Login; session ไม่คงอยู่ข้ามการ restart server

หากต้องการกำหนด bootstrap token เอง ตั้ง `EDITH_SETUP_TOKEN` ความยาว 24–256 ตัวอักษรก่อนรัน ค่าเริ่มต้นสร้างแบบสุ่มด้วย cryptographic RNG การตั้งเจ้าของทำได้ครั้งเดียวและ serialize การเขียนเพื่อป้องกัน setup พร้อมกัน

กลับ Local mode ด้วยการหยุด server แล้วรันคำสั่งเดิมโดยไม่มี `EDITH_MODE=team` (PowerShell ใช้ `Remove-Item Env:EDITH_MODE` ก่อน) บัญชีที่บันทึกไว้ไม่ถูกลบทิ้ง

## Management

### Local mode: Workspace & access

หน้า **Management** ใน Local mode ใช้หัวข้อ **Workspace & access** พร้อมป้าย **Local mode** และแบ่งเนื้อหาเป็นสองการ์ด:

- **Current workspace** แสดง Local owner, ข้อมูลการเข้าถึง workspace และสถานะที่ไม่ต้องลงชื่อเข้าใช้ พร้อมปุ่ม **Open Network Inspector** เพื่อไปหน้า Network
- **Work with a team** อธิบายบัญชีรายบุคคล, Admin / Developer / Viewer และการควบคุม session

กด **Set up Team mode** เพื่อขยายคำแนะนำ แล้วกด **Copy command** เพื่อคัดลอก `npm run dev:team` หากเบราว์เซอร์ไม่อนุญาตให้คัดลอก สามารถเลือกข้อความคำสั่งแล้วคัดลอกเองได้

การเปิดคำแนะนำหรือคัดลอกคำสั่งไม่ได้เปลี่ยนโหมดทันที ต้องหยุด development server เดิม รันคำสั่งจาก repository root แล้วเปิด `http://127.0.0.1:1420/` หากเป็นการตั้งค่าครั้งแรก ให้ใช้ setup token จาก terminal เพื่อสร้าง Admin รายละเอียดอยู่ในหัวข้อเริ่มใช้งานด้านบน

แถบ **SDK connection** ซ่อนเฉพาะขณะอยู่หน้า Management และกลับมาเมื่อเปิดเครื่องมืออื่น การซ่อนแถบไม่ได้หยุด SDK receiver การ์ดเรียงข้างกันเมื่อมีพื้นที่เพียงพอ และเรียงลงมาในหน้าจอแคบ

หน้าตา Local mode เป็นข้อมูลประกอบการใช้งาน สิทธิ์จริงยังตรวจจาก [workspace policy](access-control.md) การเปิด Team mode ไม่ลบบัญชีเดิม และยังต้องใช้ development runtime

### Team mode: จัดการบัญชี

- Login/Logout ผ่าน session
- Admin เพิ่มบัญชีและเลือก Viewer / Developer / Admin ได้
- Admin เปลี่ยน role และ Active state ของบัญชีได้
- เปลี่ยนบัญชีแล้วกด **Apply** จะยกเลิก session เดิมของบัญชีนั้น ต้อง login ใหม่ด้วยสิทธิ์ปัจจุบัน
- ป้องกันการปิดบัญชีหรือถอดสิทธิ์ Admin คนสุดท้าย
- Viewer/Developer เห็นข้อมูลบัญชีตนเองและ Logout ได้ แต่เรียก API จัดการบัญชีไม่ได้
- บัญชีสูงสุด 100 รายการ ยังไม่มีการลบถาวร ใช้การปิด Active แทน
- หาก session หมดอายุหรือถูกยกเลิก backend ปฏิเสธ API ทันที UI ตรวจสถานะทุก 15 วินาทีและ reload เพื่อกลับสู่ Login; ข้อมูลที่เคยได้รับก่อนถอนสิทธิ์ไม่สามารถเรียกคืนได้

สิทธิ์ดู body, ปิดบัง credentials, ควบคุม Gateway และ connections ใช้ [policy เดิม](access-control.md) โดยกรองก่อนข้อมูลถึง browser

## หน้า Account management

- การ์ดสรุปแสดง Total accounts, Active members และ Administrators โดย Admin count นับเฉพาะบัญชีที่ยัง Active
- Workspace members มีช่องค้นหา username และตัวกรอง role พร้อมจำนวนผลลัพธ์เทียบกับบัญชีทั้งหมด
- แต่ละแถวแสดง initials, username, คำอธิบายบัญชี และสถานะ Active แยกจาก role
- บัญชีที่ login อยู่ระบุว่า **Your account**
- ปุ่ม **Apply** เปิดให้กดเมื่อ role หรือ Active state ต่างจากค่าที่บันทึกไว้ พร้อมไฮไลต์แถวที่แก้ไข ข้อมูลจะยังไม่เปลี่ยนฝั่ง server จนกด Apply
- ปุ่ม **Add account** เลื่อนไปยังฟอร์มและโฟกัส username; ฟอร์มแยกด้านข้างพร้อม Role guide และคำแนะนำรหัสผ่าน
- หน้าจอแคบปรับฟอร์มลงด้านล่าง และรายการบัญชีปรับการจัดวางตามพื้นที่
- Viewer/Developer ไม่มีรายการจัดการบัญชีของผู้อื่น แต่ยัง Logout ได้

## แถบบัญชีด้านบน

Breadcrumb แสดง Local workspace หรือ Team workspace และชื่อเครื่องมือทางซ้าย ส่วนด้านขวาจัด Local processing กับ account control ไว้กลุ่มเดียวกัน

Account control รวม initials, username และ role ไว้ปุ่มเดียว กดเพื่อเปิด Management ไม่มีป้าย `Access: admin` กับชื่อผู้ใช้แยกซ้ำกัน ใน Local mode แสดง Local owner พร้อม workspace role เมื่ออ่าน policy ไม่ได้แสดง Access unavailable/Offline พร้อมสิทธิ์แบบจำกัด

หน้าจอแคบซ่อนข้อความเสริมเพื่อคงพื้นที่ breadcrumb โดยปุ่มบัญชียังมี accessible label ที่บอกชื่อและ role ข้อมูลบัญชีใน header อ่านจาก server policy ไม่ใช่ค่าที่ผู้ใช้ตั้งเอง

## การเก็บข้อมูลและ session

- Accounts บันทึกใน SQLite `.local/edith.sqlite` ของ repository ซึ่งอยู่ใน `.gitignore` และ Vite ปฏิเสธการ serve ไฟล์ภายใน `.local` ไฟล์ accounts.json เดิมย้ายแบบครั้งเดียวโดยไม่ลบต้นฉบับ ดู [Database และ migration](database.md)
- รหัสผ่านเก็บเฉพาะ scrypt hash และ salt สุ่มแยกแต่ละบัญชี ไม่เก็บ plaintext
- บันทึกบัญชีภายใน SQLite transaction; permission DB file `0600`, directory ที่สร้างใหม่ `0700` การคุ้มครอง ACL บน Windows ต้องพิจารณาตาม environment
- Session token สุ่ม 256 บิต เก็บ digest ในหน่วยความจำ server มีอายุ 8 ชั่วโมง สูงสุด 1,024 sessions
- Cookie ใช้ HttpOnly, SameSite=Strict, Path=/ และ Max-Age; Secure ถูกตั้งเมื่อใช้ HTTPS control origin แต่ development ปัจจุบันใช้ loopback HTTP
- Logout ลบ session ฝั่ง server และ cookie
- Login จำกัด 10 attempts ต่อนาทีต่อ socket IP และตอบ username/password ผิดด้วยข้อความเดียวกัน
- ตรวจ Host, Origin และ Sec-Fetch-Site สำหรับ account API; ไม่มี permissive CORS
- ไม่ serialize hash, salt หรือ session token ใน account JSON responses
- Account file ที่ไม่ถูกต้องทำให้เริ่ม server ไม่สำเร็จ ไม่ fallback เป็นบัญชีว่างหรือเปิด setup ใหม่

อย่า commit ไฟล์ `.local`, รหัสผ่าน, session cookie หรือ bootstrap token การลบบัญชีทั้งหมดเพื่อ reset workspace ยังไม่มี flow รองรับ ไม่ควรลบไฟล์บัญชีขณะ server ทำงาน

## API

| Endpoint | การใช้งาน |
| --- | --- |
| GET `/__edith_auth/status` | สถานะ initialized และบัญชีปัจจุบัน หรือ null |
| POST `/__edith_auth/setup` | สร้าง Admin ครั้งแรกพร้อม bootstrap token |
| POST `/__edith_auth/login` | เริ่ม session |
| POST `/__edith_auth/logout` | ยกเลิก session |
| GET `/__edith_auth/users` | Admin ดูรายชื่อบัญชี |
| POST `/__edith_auth/users` | Admin เพิ่มบัญชี |
| POST `/__edith_auth/users/update` | Admin เปลี่ยน role/Active state |

Protected development API จะตอบ 401 หากไม่มี session หรือ session ใช้ไม่ได้ และ 403 หาก role ไม่มีสิทธิ์ SDK ingestion POST/OPTIONS ยังคงใช้ pairing token เดิมเพื่อให้นำ SDK ไปใช้กับแอปได้ ไม่ใช้ browser session แทน ส่วนการอ่าน SDK data ต้องผ่าน session

## ยังไม่อยู่ในรุ่นนี้

- สิทธิ์ราย Gateway และ audit logs: ยังเป็นงานถัดไป
- Password reset/change, forgot password, MFA, SSO, invitation/email และ self-signup
- Remote deployment, TLS สำหรับหน้าเว็บ, distributed sessions และ shared database
- การบังคับ auth กับ backend request ที่ไหลผ่าน listener: ระบบนี้คุม management/inspection API ไม่ได้เพิ่ม authentication ให้ application routes
- Packaged desktop/native Tauri commands และ static web deployment ยังไม่ได้เชื่อมระบบบัญชีนี้
- หน้า Management ใน Local mode ตรวจหน้าตาและการเปิดคำแนะนำผ่านเบราว์เซอร์แล้ว ส่วน Team flows และ native Windows/Linux ยังไม่ได้ทำ visual QA/platform certification ครบทุกกรณี

## ตรวจสอบ

ชุดทดสอบ desktop รวมล่าสุดผ่าน 46 รายการ โดย account tests ครอบคลุม first-owner setup, ไม่เก็บ plaintext, cookie attributes, login, session role policy, ข้ามสิทธิ์เรียก account API ไม่ได้, body/token filtering, role/disable revocation, last Admin, foreign-origin rejection, logout, restart และ corrupt-store failure พร้อม frontend build ผ่าน

## Root command shortcuts

From the repository root use `npm run dev` for Local web mode, `npm run dev:team` for Team web mode, `npm run dev:desktop` for native development, and `npm run dev:api` for the example backend in a second terminal. No shell-specific environment syntax is needed for these commands. Stop the current server before changing modes. Original workspace commands remain available; the old Turbo dev command is now `npm run dev:legacy`.

## Loading และการเปลี่ยนหน้า Login

ตรวจ session ผ่าน loading dialog ก่อนแสดง Login โดยใช้ backdrop เดียวกัน ปุ่ม submit มี loading animation และป้องกันการส่งซ้ำ เมื่อ Login/สร้าง Admin สำเร็จจะโหลด policy และข้อมูลบัญชีต่อโดยไม่ reload ทั้งหน้า แล้วค่อย fade เข้าสู่ workspace หากรหัสผ่านผิดฟอร์มยังอยู่และแสดงข้อความให้ลองใหม่ รองรับ reduced motion ส่วน Logout/session revocation ยัง reload เพื่อล้างข้อมูลบัญชีก่อนหน้า ดู [Shared loading component](loading-component.md)

## แอป macOS แบบติดตั้ง

ตั้งแต่ 0.1.0-alpha.3 เปิด **Management → Enable Team mode** ได้จากแอปโดยตรง แล้วสร้างบัญชี Admin แรก ไม่ต้องใช้ terminal หรือกรอก setup token เอง Admin สามารถเลือก **Switch to Local mode** ได้ภายหลัง การเปลี่ยนโหมดหยุด Proxy/Gateway และคืนค่า System Proxy ก่อนเริ่มบริการใหม่ บัญชีและ Gateway ที่กด Save ไว้ยังอยู่ แต่ต้องเริ่ม listener ใหม่

ข้อมูลของแอปติดตั้งแยกจาก `.local` ใน repository ดู [Desktop runtime](desktop-runtime.md)
