# SQLite persistence

## สถานะและตำแหน่งไฟล์

Development runtime ใช้ SQLite เก็บข้อมูลถาวรที่ `.local/edith.sqlite` ของ repository ทั้ง Local mode และ Team mode โดยใช้ `node:sqlite` ที่มาพร้อม Node.js ไม่ต้องติดตั้ง database server หรือ native npm dependency เพิ่ม

ใช้ Node.js 22.18+ หรือ 24+ ตามข้อกำหนดโปรเจกต์ บางรุ่นของ Node อาจแสดง experimental warning ของ `node:sqlite`

| ข้อมูล | ที่เก็บปัจจุบัน |
| --- | --- |
| บัญชี, role, Active state, scrypt hash และ salt | SQLite ตาราง `users` |
| Gateway ที่กด Save: ID, port, routes และ backend configuration | SQLite ตาราง `gateway_configs` |
| Schema version และสถานะ legacy migration | `PRAGMA user_version` และตาราง `metadata` |
| Login sessions และ login rate limits | หน่วยความจำ server ไม่ลง DB |
| Requests, logs และ CPU/RAM history | หน่วยความจำแบบจำกัดจำนวน ไม่ลง DB |
| ตำแหน่ง node, Preview และ draft ที่ยังไม่ Save | หน้าเว็บปัจจุบัน |
| Browser Gateway profiles/config เดิม | ยังอยู่ใน local storage เพื่อย้ายและเป็นสำเนาชั่วคราว |

ฐานข้อมูลและข้อมูล Gateway เป็นระดับ workspace ไม่ได้แยกตามผู้ใช้ สิทธิ์จาก role ยังคงตรวจใน server ก่อนอ่านหรือเปลี่ยนข้อมูล

## วิธีใช้

รันคำสั่งเดิมได้เลย ระบบสร้าง DB และ schema version 1 อัตโนมัติ:

```sh
npm run dev:web --workspace appsdesktop
```

สำหรับ Team mode:

```sh
EDITH_MODE=team npm run dev:web --workspace appsdesktop
```

บัญชีใหม่และการแก้ไขบัญชีบันทึกลง SQLite เมื่อ API สำเร็จ ส่วน Gateway ต้องกด **Save setup** จึงบันทึกลง DB เมื่อเปิดหน้าใหม่จะโหลดค่าจาก server ก่อน และไม่เปิด listener อัตโนมัติ

หาก DB ใช้ไม่ได้จะไม่แอบบันทึก Gateway ลง browser แทน การโหลด/Save จะแสดงข้อผิดพลาดและไม่อ้างว่าบันทึกสำเร็จ การ Save ไม่เปลี่ยน listener ที่กำลังรัน ต้อง Stop/Start เพื่อใช้ค่าที่แก้ไข

## ย้ายบัญชีเดิมจาก JSON

- เมื่อเริ่ม development server หากมี `.local/accounts.json` และยังไม่มี marker ของ migration จะตรวจรูปแบบไฟล์และบัญชีก่อน
- หากตาราง users ว่าง จะนำบัญชีเดิมรวม hash/salt เข้า DB ภายใน transaction ไม่ต้องตั้งรหัสผ่านใหม่
- หาก DB มีบัญชีอยู่แล้ว DB เป็นข้อมูลหลัก ไม่เขียนทับด้วยไฟล์เก่า
- บันทึก marker เมื่อจัดการไฟล์ legacy สำเร็จ เพื่อไม่ให้นำไฟล์เดิมกลับมาทับการแก้ไขบัญชีในครั้งถัดไป
- **ไม่ลบหรือแก้ไฟล์ accounts.json เดิม** เก็บเป็นสำเนาก่อน migration และยังต้องป้องกันการเข้าถึงไฟล์นี้
- JSON เสีย, schema ไม่รองรับ หรือไม่มี Admin ที่ Active จะทำให้เริ่ม server ไม่สำเร็จ ไม่ reset เป็น workspace ว่าง

การย้ายใช้ได้กับไฟล์ใน repository นี้เท่านั้น ไม่รวมบัญชีจากระบบภายนอก

## ย้าย Gateway จาก browser

Server ไม่สามารถอ่าน local storage จาก browser โดยตรงได้:

1. เปิดหน้า Gateway ด้วย browser/hostname เดิมที่เคยใช้
2. Gateway ที่ยังไม่มีข้อมูลจาก DB จะใช้ configuration เดิมใน browser เป็น draft
3. ตรวจค่าแล้วกด **Save setup** ของแต่ละ Gateway เพื่อส่งไปเก็บใน SQLite
4. หลัง Save จะโหลด configuration เดียวกันจาก server เมื่อเปิด browser อื่นใน workspace เดียวกัน

หาก Gateway ID เดียวกันมีข้อมูลใน SQLite แล้ว จะใช้ข้อมูล SQLite ก่อน ไม่เขียนทับด้วย draft เก่าอัตโนมัติ เมื่อ DB มีครบ 8 ตัวจะโหลดได้สูงสุด 8 ตัว ข้อมูล legacy ที่เกินยังอยู่ใน browser ไม่ถูกลบ

การสร้าง Gateway ใหม่ยังเป็น draft จนกด Save เช่นกัน ตารางกำหนด unique listener port จึงไม่สามารถบันทึก Gateway คนละตัวด้วยพอร์ตเดียวกันได้ ไม่มีฟังก์ชันลบ Gateway ที่บันทึกแล้วในรุ่นนี้

## โครงสร้างและการเขียนข้อมูล

- ใช้ prepared statements กับค่าที่ผู้ใช้ส่งมา
- ใช้ transaction สำหรับ schema initialization, account migration, การแทนที่บัญชี และการ Save Gateway
- Constraints ครอบคลุม account username ไม่ซ้ำ, role, Active state และ Gateway port ไม่ซ้ำ
- การเขียนผิดพลาด rollback โดยไม่ลบข้อมูลก่อนหน้าทิ้ง
- มี busy timeout 5 วินาที ใช้รูปแบบ journal ค่าเริ่มต้นของ SQLite (ไม่ได้เปิด WAL)
- Schema ใหม่กว่าที่โปรแกรมรองรับจะทำให้เริ่มไม่ได้ ไม่พยายาม downgrade
- ออกแบบให้มี EDITH development server ผู้เขียนข้อมูลเพียงตัวเดียวต่อ repository; ยังไม่รองรับหลาย process เขียนบัญชีพร้อมกัน เพราะ account/session state บางส่วนยัง cache ใน process

## การเข้าถึงและสำรองข้อมูล

`.local` อยู่ใน `.gitignore` และ Vite ปฏิเสธการ serve ไฟล์ภายใน directory นี้ DB ตั้ง file permission `0600` และ directory ที่สร้างใหม่ `0700` โดย ACL บน Windows ยังขึ้นกับระบบที่ใช้ ฐานข้อมูลไม่ได้เข้ารหัสบนดิสก์

สำรองโดยหยุด EDITH server ให้เรียบร้อย แล้วคัดลอก `.local/edith.sqlite` ไปยังพื้นที่ที่เข้าถึงได้เฉพาะผู้ดูแล หากมี legacy accounts.json ให้เก็บด้วยตามความจำเป็น อย่าคัดลอกเฉพาะ DB file ระหว่างมีการเขียน เพราะอาจไม่รวม transaction ใน journal

การ restore ให้หยุด server ก่อน เก็บสำเนาปัจจุบัน แล้วนำ DB ที่สำรองไว้กลับตำแหน่งเดิม ห้าม commit DB หรือแชร์ออกสาธารณะ เพราะมี account hashes และข้อมูล backend

การ restore DB ไม่ restore sessions ต้อง login ใหม่ และต้อง Start Gateway ใหม่หลังเปิด EDITH

## API ของ Gateway configuration

- GET `/__edith_gateway/configs`: รายการ configuration ที่ Save ใน DB ภายใต้สิทธิ์การอ่านปัจจุบัน
- POST `/__edith_gateway/config?gateway=ID`: Save configuration โดยต้องมีสิทธิ์จัดการ Gateway, valid local control token และ JSON ที่ตรวจรูปแบบแล้ว
- Save ตรวจเพดาน 8 รายการและ unique port ใน transaction
- ยังคงป้องกัน Host/Origin และ Team mode ต้องมี session ไม่อนุญาต Viewer เขียน DB ผ่าน API นี้

## ยังไม่ทำ

- ประวัติ requests/logs/metrics ถาวร และ retention/cleanup สำหรับข้อมูลเหล่านี้
- Sessions ถาวร, audit records และสิทธิ์ราย Gateway
- Database encryption, online backup/restore UI และ configuration deletion/import UI
- SQLite service สำหรับ packaged desktop/static hosting

## การตรวจสอบ

ชุดทดสอบ desktop รวมผ่าน 46 รายการ รวม SQLite migration แบบครั้งเดียว, source preservation, reopen persistence, transaction rollback, legacy validation, account login หลังเปิด DB ใหม่, session ไม่คงอยู่ข้าม restart และ Gateway configuration API permissions พร้อม frontend build ผ่าน
