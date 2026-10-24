# Appearance — Dark, Light และ System

เลือกธีมจากไอคอน **Appearance** บนแถบด้านบนของ EDITH: จอภาพหมายถึง System, ดวงอาทิตย์หมายถึง Light และพระจันทร์หมายถึง Dark กดไอคอนเพื่อเปิดรายการตัวเลือก ใช้คีย์บอร์ดเลือกได้ และวางเมาส์เพื่อดูชื่อธีมปัจจุบัน:

| ตัวเลือก | พฤติกรรม |
| --- | --- |
| System | ตาม Dark/Light ของระบบ และอัปเดตเมื่อระบบเปลี่ยนธีม |
| Light | ใช้พื้นสว่างและข้อความเข้ม |
| Dark | ใช้พื้น graphite และข้อความสว่าง |

ค่าเริ่มต้นเป็น System แอปจำค่าที่เลือกใน local storage ของ browser profile ด้วย key `edith-appearance` การล้างข้อมูลเว็บไซต์จะคืนค่าเป็น System การตั้งค่าใน `localhost` กับ `127.0.0.1` แยกกันตาม origin และไม่เปลี่ยนสีธีมของระบบปฏิบัติการ

ธีมครอบคลุม workbench, Gateway/canvas, กราฟ, Network/Proxy/Certificate, Management, Login, dropdowns และ Loading ป้ายสถานะยังใช้สีเขียว/เหลือง/แดงตามความหมายเดิม โดยปรับเฉดให้เหมาะกับพื้นหลัง

สคริปต์ `public/theme-init.js` ตั้งค่าธีมก่อนโหลด stylesheet เพื่อลดการกะพริบผิดธีม ส่วน `src/theme.ts` ดูแลตัวเลือก, การเปลี่ยนธีมระบบ, การ sync ระหว่างแท็บ และการตั้งธีมหน้าต่าง Tauri หาก local storage ใช้ไม่ได้จะยังเลือกธีมใน session ปัจจุบันได้

ใน desktop เมื่อกลับไป System แอปจะปลด native theme override ด้วย `setTheme(null)` ก่อนอ่านธีมหน้าต่างใหม่ ไม่บังคับค่าที่อ่านจาก `matchMedia` กลับไปยังหน้าต่าง เพื่อป้องกัน Light/Dark ค้างจากการเลือกครั้งก่อน การเปลี่ยนค่าระบบจะอัปเดต UI โดยไม่สร้าง override ใหม่ มี regression tests ใน `src/theme.test.mjs` ครอบคลุม Light → System, Dark → System, การเลือกอย่างรวดเร็ว และ browser fallback

สีที่ใช้ซ้ำกำหนดด้วย CSS variables ใน `src/styles.css` การเพิ่ม UI ควรใช้ `--gh-bg`, `--gh-surface`, `--gh-text`, `--gh-muted`, `--gh-border` และ semantic status colors แทนสีเข้มแบบตายตัว ปุ่มพื้นเขียวใช้ข้อความสีขาว ส่วนสี mint ของข้อความใช้ `--gh-mint` เพื่อให้มี contrast ใน Light mode

ตรวจหน้าตา Management, Gateway และ HTTPS inspection ใน Light mode และตรวจการสลับธีม/จำค่าหลัง reload แล้ว การตั้งธีม title bar ใน native desktop ตรวจผ่าน compile แต่ยังไม่ได้ visual QA ครบทุกระบบ
