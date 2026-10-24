# คู่มือตั้งค่าและใช้งาน Live local proxy

คู่มือนี้สำหรับ EDITH development runtime โดยเฉพาะการใช้บน macOS ข้อมูลและภาพหน้าจอแต่ละรุ่นอาจมี layout ต่างกันเล็กน้อย

## 1. เริ่ม EDITH

เปิด Terminal ในโฟลเดอร์ repository:

```sh
npm ci
npm run dev
```

เปิด `http://127.0.0.1:1420` และคง Terminal ไว้ หากต้องใช้บัญชี/Login ใช้ `npm run dev:team` แทน แล้วทำตาม [คู่มือ Accounts](accounts.md) อย่าเปิดทั้งสองคำสั่งพร้อมกันบนพอร์ตเดียวกัน

| พอร์ตเริ่มต้น | หน้าที่ |
| --- | --- |
| 1420 | หน้าเว็บและ control API ของ EDITH |
| 8899 | Forward proxy สำหรับตั้งในแอปหรือ Wi-Fi |
| 8080 | Gateway แยกต่างหาก ต้องตั้ง route/Start ของตัวเอง |
| 3000 | Example API เมื่อรัน `npm run dev:api` |

Wi-Fi proxy ต้องใช้ **8899** ไม่ใช่ 1420 หรือ 8080 เว้นแต่ตั้งพอร์ต forward proxy เป็นค่าอื่นเอง

## 2. เริ่มจาก HTTP ก่อน

1. เปิด **Network → Live local proxy → Proxy settings**
2. ใน **Connection** ใช้ listen port `8899`
3. ปิด **Enable inspection** ไว้ก่อน
4. กด **Start proxy** ให้สถานะเป็น Running
5. ใน Terminal อีกหน้าหนึ่ง รัน API ตัวอย่าง:

```sh
npm run dev:api
```

6. ลองส่ง HTTP ผ่าน proxy:

```sh
curl --noproxy '' -x http://127.0.0.1:8899 http://127.0.0.1:3000/users
```

ใน Network ควรเห็น **GET**, status 200 และรายละเอียด body เลือกแหล่งข้อมูล **Files / HTTP Proxy / selected SDK** และเลือก Files / Local proxy ใน debug target หากก่อนหน้านี้กำลังดู SDK app อยู่

การยิงไปพอร์ต 3000 โดยตรงไม่จำเป็นต้องผ่าน EDITH ส่วน Gateway traffic ใช้แหล่งข้อมูล **Gateway** แยกกัน

## 3. ตั้ง Wi-Fi proxy บน macOS

ทำหลัง Start proxy แล้ว:

1. เปิด **System Settings → Wi-Fi → Details** ของเครือข่ายที่เชื่อมอยู่
2. ไปที่ **Proxies**
3. เปิด **Web proxy (HTTP)**: Server `127.0.0.1`, Port `8899`
4. เปิด **Secure web proxy (HTTPS)**: Server `127.0.0.1`, Port `8899`
5. ปิด **Proxy server requires password** เพราะ forward listener นี้ไม่ได้ใช้บัญชี Team mode เป็น proxy authentication
6. ไม่ต้องเปิด Auto proxy discovery หรือ Automatic proxy configuration เพื่อใช้ manual proxy นี้
7. กด **OK** และ Apply หากมี
8. เปิดเว็บหรือแอปทดสอบใหม่เพื่อสร้าง connection ใหม่

ต้องตรวจพอร์ตทั้ง HTTP และ HTTPS แยกกัน หากเพียงเห็น Server ถูกแต่พอร์ต HTTPS ยังผิด จะเชื่อมต่อไม่ได้

`127.0.0.1` คือเครื่องที่แอปรันอยู่ คู่มือนี้ใช้กับ Mac ที่รัน EDITH เอง ไม่ใช่การตั้งมือถือให้เข้าถึงคอมพิวเตอร์ EDITH ยัง bind proxy เฉพาะ loopback และไม่รองรับการเข้าจาก LAN โดยตรง

บางแอปอาจไม่ใช้ proxy ของระบบ หรือใช้ trust store ของตัวเอง การตั้ง Wi-Fi ไม่ได้ทำให้เห็น traffic ทุกโปรแกรมโดยอัตโนมัติ

## 4. ทำไมเห็นแต่ CONNECT

HTTPS ปกติส่งข้อมูลแบบเข้ารหัส เมื่อยังไม่เปิด inspection หรือ hostname ไม่อยู่ในขอบเขต EDITH จะเห็นเฉพาะอุโมงค์ CONNECT:

- CONNECT 200 หมายถึงเปิด tunnel สำเร็จ ไม่ใช่ response 200 ของ API
- 0 B ใน tunnel record หมายถึงยังไม่ได้เก็บขนาด payload ใน tunnel ไม่ได้ยืนยันว่าไม่มีข้อมูลวิ่ง
- GET/POST, path, headers และ body อยู่ภายใน TLS จึงอ่านไม่ได้จาก CONNECT อย่างเดียว
- Summary ของ HTTP requests ไม่รวม CONNECT จึงอาจแสดง 0 แม้ตารางมี tunnel หลายรายการ
- รายการ CONNECT เก่าไม่เปลี่ยนเป็น GET ย้อนหลังหลังเปิด inspection

## 5. สร้างและติดตั้ง CA

1. Stop proxy แล้วเปิด **Proxy settings → Local certificate**
2. หาก CA ยังไม่พร้อม ให้ Admin กด **Create local CA** หรือรัน:

```sh
npm run ca:create
```

3. ต้องมี OpenSSL/LibreSSL ระบบจะไม่ overwrite CA directory ที่มีอยู่
4. กด **Download public CA** และตรวจ SHA-256 fingerprint กับที่แสดงใน EDITH
5. ไฟล์ที่ใช้ติดตั้งคือ public certificate `.cert.pem` หรือ `.cer` ไม่ใช่ `.key.pem`

### ติดตั้งบน macOS

1. เปิด **Keychain Access** และเลือก **login** ทางซ้าย
2. เลือก **File → Import Items…** แล้วนำเข้า public CA
3. เปิด certificate ชื่อ **EDITH Local Debug CA …**
4. ขยาย **Trust**
5. เปลี่ยนเฉพาะ **Secure Sockets Layer (SSL)** เป็น **Always Trust**
6. ค่า **When using this certificate** สามารถคง **Use System Defaults** ได้
7. ปิดหน้าต่าง และใส่รหัสผ่าน Mac หากระบบถาม
8. หน้ารายละเอียดควรแสดงว่า certificate ถูก marked as trusted สำหรับบัญชีนี้

EDITH ตรวจได้ว่า CA/key ใช้งานได้ แต่ไม่สามารถยืนยัน trust ของระบบหรือของทุกแอปได้ จึงยังแสดงคำอธิบายว่า client trust ต้องตั้งเอง

### Error -25294 ตอน import

รหัสนี้หมายถึง **ไม่พบ Keychain ปลายทาง** (`errSecNoSuchKeychain`) ให้เปิด Keychain Access เอง เลือก login และใช้ File → Import Items แทนการเปิดไฟล์โดยไม่เลือกปลายทาง หาก login ถูกล็อกให้ปลดล็อกก่อน ไม่ต้อง reset หรือลบ keychain เพื่อแก้ขั้นตอนนี้

ข้อความ **This root certificate is not trusted** หลัง import หมายถึงนำเข้าแล้วแต่ยังไม่ได้ตั้ง trust ให้ทำขั้นตอน SSL ด้านบน

## 6. เลือกขอบเขต HTTPS inspection

Stop proxy ก่อนแก้ค่า เปิด **Proxy settings → HTTPS inspection** และเปิด **Enable inspection**

### Selected hostnames

ปิด **All hostnames** แล้วใส่ hostname จริง เช่น:

```text
api.my-project.test
staging.my-project.test
```

ตัวอย่างข้างต้นต้องแทนด้วยโดเมนของระบบที่ใช้งานจริง ไม่ใช่ endpoint ที่ EDITH สร้างให้ ใส่ DNS hostname เท่านั้น ไม่ใส่ `https://`, port, path หรือ wildcard

การใส่ `example.com` ไม่ครอบคลุม `www.example.com` หรือ subdomain อื่นโดยอัตโนมัติ ใช้ exact match สูงสุด 32 โดเมน

### All hostnames

เปิด **All hostnames** หากต้องการตรวจทุก DNS hostname บนพอร์ต 443 ที่ถูกส่งผ่าน proxy ช่อง Selected hostnames จะไม่ใช้ในโหมดนี้

โหมดนี้อาจเห็น tokens, cookies และข้อมูลส่วนตัวจากแอปเบื้องหลัง ควรเปิดเฉพาะช่วง debug ที่ตั้งใจ ข้อมูลที่แอปไม่ส่งผ่าน proxy, IP-based destinations, HTTPS พอร์ตอื่น และ QUIC ไม่อยู่ในขอบเขตนี้

### Excluded hostnames

ใส่ hostname ที่ไม่ต้องการถอด HTTPS ได้ใน **Excluded hostnames** เช่น hostname ของ media/CDN ที่พบปัญหา ใช้ exact match สูงสุด 32 รายการ ไม่ใช่ suffix/wildcard

ข้อยกเว้นมีผลเหนือการเลือก inspect: โดเมนที่ยกเว้นจะยังส่งผ่านแบบ encrypted CONNECT tunnel ไม่ใช่การบล็อก traffic

ตั้งค่าแล้วกด **Start proxy** หรือ Stop/Start ใหม่ ค่ามีผลตอน Start ไม่ใช่ทันทีที่แก้ฟอร์ม การเปลี่ยน settings ไม่แก้ trust; Wi-Fi proxy ควบคุมแยกผ่าน System Proxy ใน macOS desktop

## 7. ดู request/response

1. เรียก URL ใหม่ของ hostname ที่อยู่ในขอบเขต
2. เปิด Network และตรวจว่าไม่มี source/method/status/search filter ซ่อนรายการที่ต้องการ
3. เลือก request เพื่อดู Overview, Request, Response และ Timing
4. GET/POST และ URL path จะปรากฏสำหรับ HTTPS ที่ถอดสำเร็จ พร้อม status ของ backend จริง
5. Response body preview เก็บสูงสุด 32 KiB ต่อ body โดยข้อมูลที่ส่งต่อจริงไม่ถูกตัด Binary/compressed data อาจแสดงเป็น base64

ต้องรอ response จบก่อน completed record ปรากฏ Streams ที่ยังไม่จบอาจไม่แสดงทันที สิทธิ์ Viewer/Developer อาจซ่อน body หรือ credentials ตาม [Access policy](access-control.md) การไม่เห็นข้อมูลจึงไม่ได้แปลว่าไม่ได้ capture เสมอไป

### ทดสอบด้วย curl โดยไม่เปลี่ยน system trust

รันจาก repository root และแทน hostname เป็น endpoint จริงที่ต้องการทดสอบ:

```sh
curl --noproxy '' -x http://127.0.0.1:8899 \
  --cacert .local/ca/edith-debug-ca.cert.pem \
  https://YOUR-TEST-HOST/health
```

ไม่ใช้ `-k` เพื่อให้ทดสอบ certificate validation จริง Windows PowerShell ใช้ `curl.exe` หาก `curl` เป็น alias ของคำสั่งอื่น

## 8. วิดีโอ รูปภาพ หรือบางเนื้อหาโหลดไม่ได้

ภาพ error ในหน้าเว็บไซต์อย่างเดียวไม่ระบุว่า EDITH เป็นสาเหตุเสมอไป ให้แยกทดสอบ:

1. Stop proxy → ปิด Enable inspection → Start proxy โดยยังตั้ง Wi-Fi proxy เหมือนเดิม
2. เปิดหน้าเนื้อหาใหม่ หากกลับมาใช้ได้ ปัญหามีแนวโน้มเกี่ยวกับ inspection
3. เปิด inspection กลับ แล้วกรอง Network เป็น **Failed** และ **5xx** แยกกัน เพื่อตรวจ hostname/status และ Error ในรายละเอียด
4. หากพบ media/CDN hostname ที่ล้มเหลว ให้ใส่ชื่อจริงใน Excluded hostnames แล้ว Stop/Start และโหลดใหม่
5. หากยังล้มเหลวแม้ปิด inspection ให้ปิด Wi-Fi proxy ด้วย แล้วเทียบอีกครั้ง เพื่อแยก forwarding, เว็บไซต์ และเครือข่าย

สาเหตุที่อาจพบ ได้แก่ client ไม่เชื่อถือ CA, แอปมี certificate pinning, upstream certificate ไม่ผ่าน, protocol ที่ยังไม่รองรับ, timeout หรือ certificate generation queue เต็ม ข้อจำกัดปัจจุบันรองรับ certificate generation pending สูงสุด 4 hostname และ cache สูงสุด 32 ใบ จึงอาจมี error เมื่อ All-host mode เปิดเว็บที่เรียกหลายโดเมนใหม่พร้อมกัน ต้องดู Error จริงก่อนสรุปสาเหตุ

EDITH รุ่นนี้รองรับ inspected HTTP/1.1 ยังไม่รองรับ HTTP/2, HTTP/3/QUIC, WebSocket inspection หรือ mutual TLS และจะไม่ bypass pinning/ปิด upstream certificate verification เพื่อแก้ปัญหา

## 9. เมื่อใช้งานเสร็จ

1. ปิด Web proxy (HTTP) และ Secure web proxy (HTTPS) ใน Wi-Fi แล้วกด OK/Apply
2. Stop proxy ใน EDITH
3. ยกเลิก SSL Always Trust ของ EDITH CA เมื่อไม่ต้องการ inspection แล้ว

หาก Stop EDITH แต่ยังเปิด Wi-Fi proxy อยู่ แอปที่ใช้ proxy นั้นจะเข้าเว็บไม่ได้จนกว่าจะปิดค่า proxy หรือเปิด EDITH proxy ใหม่

อย่าแชร์หรือ commit `.local/ca/edith-debug-ca.key.pem`, account database หรือ exports ที่มีข้อมูลส่วนตัว CA เป็นของแต่ละเครื่องและไม่ควรส่ง private key ให้ผู้อื่น

## คู่มือที่เกี่ยวข้อง

- [HTTPS inspection: implementation และขอบเขต](https-inspection.md)
- [Local proxy: controls และ limits](local-proxy.md)
- [CA generation](debug-ca.md)
- [Gateway](gateway.md)
- [Access policy](access-control.md)


## เปิด–ปิด System Proxy จาก EDITH (macOS desktop)

ใน **Network → Live local proxy → Proxy settings → System Proxy**:

1. เปิด EDITH ผ่าน `npm run dev:desktop` และกด **Start proxy** ก่อน
2. เลือก Network service เช่น Wi-Fi หรือ Ethernet แล้วเปิด **Use EDITH as System Proxy**
3. ยืนยันสิทธิ์ผู้ดูแลผ่านหน้าต่างของ macOS หากระบบร้องขอ
4. ปิดสวิตช์หรือกด **Restore saved settings** เพื่อคืนค่าที่บันทึกไว้

เปลี่ยนเฉพาะ HTTP และ HTTPS ของ service ที่เลือกเป็น `127.0.0.1` และ port ของ Proxy ที่กำลังทำงาน ไม่แก้ SOCKS, PAC, auto discovery, bypass list หรือ certificate trust หน้าเว็บและระบบอื่นจะแจ้งว่าใช้ได้เฉพาะ macOS desktop

สถานะอ่านจาก macOS และมีปุ่ม Refresh status เมื่อแก้ค่าจากภายนอก แอปเก็บค่าเดิมใน app data ก่อนเปลี่ยน และคืนค่าก่อน Stop หรือปิดหน้าต่างตามปกติ หากกดยกเลิกสิทธิ์หรือเปลี่ยนได้ไม่ครบ จะเก็บข้อมูลคืนค่าไว้และแสดงปุ่ม Restore การ force quit, crash หรือหยุด dev server ไม่รับประกันการคืนค่าอัตโนมัติ ให้เปิดแอปใหม่เพื่อ Restore หรือปิด HTTP/HTTPS Proxy ใน macOS Settings ก่อนใช้อินเทอร์เน็ตต่อ

กรณีเดิมยังไม่เคยกำหนด server/port จะคืนสถานะเป็น Off; macOS อาจยังแสดง address ของ EDITH ในช่องที่ปิดอยู่ ไม่รองรับการแทนที่ Proxy เดิมที่ใช้ authentication เพื่อหลีกเลี่ยงการสูญเสียข้อมูลรับรอง ค่าเดิมที่มี server/port ปกติจะถูกคืนพร้อมสถานะเปิด–ปิด

Proxy runtime ยังไม่รวมใน packaged desktop: ฟีเจอร์นี้ใช้งานกับ desktop development runtime ในตอนนี้ การยืนยันสิทธิ์และการเปิด–ปิด System Proxy จริงยังต้องทดสอบบนเครื่องโดยผู้ใช้


### Enable System Proxy on Start

On macOS desktop, this preference defaults to on and remembers both the preference and selected network service in app local storage. An explicit Start first starts the local proxy, then requests macOS permission to configure HTTP/HTTPS for the selected service. Cancellation or failure keeps the local proxy running and displays an error. Turn this preference off for manually configured test apps. Reloading the page does not enable System Proxy automatically. Stop still restores the saved settings.


### Remember HTTPS inspection settings

HTTPS inspection defaults to off on first use. The inspection switch, all-hostnames option, selected domains and exclusions are saved locally on edits and Start, and restored on the next visit. Stopped proxies show "Enabled on next Start" for a saved enabled configuration; running proxies display actual runtime settings. Restoring preferences does not start inspection or trust a CA automatically. A trusted client CA is still required.

## ตั้งค่า Local certificate แบบสามขั้นตอน

เปิด **Proxy settings → Certificate**:

1. **Create your certificate** — หยุด Proxy แล้วกด Create certificate ด้วยสิทธิ์ Admin หากมี CA ที่ใช้งานได้อยู่แล้ว ไม่ต้องสร้างซ้ำ
2. **Add to Keychain & set trust** — ใน macOS desktop กด Open in Keychain Access เพื่อเปิดใบรับรองสาธารณะ เลือก login keychain แล้วเปรียบเทียบ SHA-256 ด้วย Copy fingerprint หรือ Certificate details จากนั้นเปิด Trust → Secure Sockets Layer (SSL) → Always Trust ปิดหน้าต่างใบรับรองและยืนยันรหัสผ่าน macOS ด้วยตนเอง
3. **Check certificate trust** — กด Check trust on this Mac เพื่อตรวจการยอมรับ CA ตาม SSL policy ของ macOS โดยไม่แก้ trust หากผ่านจะแสดง Trusted by macOS จากนั้นเปิด HTTPS inspection และ Start proxy

การตรวจ Trust เป็นการตรวจใบรับรองกับ keychains ของ macOS ไม่ใช่การทดสอบ HTTPS ผ่าน Proxy แบบครบวงจร และไม่ได้ยืนยันว่าแอปที่มี trust store ของตัวเองหรือ certificate pinning จะยอมรับ CA ด้วย สถานะ Not checked ไม่ได้หมายความว่าไม่เชื่อถือ ต้องกดตรวจหลังตั้งค่า Trust หรือเปลี่ยนค่าใน Keychain Access

ในเบราว์เซอร์หรือระบบอื่น ใช้ Download certificate และติดตั้ง/ตั้งค่า trust ผ่านเครื่องมือของระบบเอง ปุ่มเปิด Keychain และตรวจ Trust ใช้ได้บน macOS desktop โดยต้องเป็น Admin ของ workspace การเปิดใน Keychain Access ส่งเฉพาะ public certificate ไปยังแอปนั้น ไม่ส่ง private key และไม่ตั้งค่า Always Trust อัตโนมัติ
