# Agent Working Rule

ทุกครั้งที่แก้ไขโค้ดหรือเพิ่มฟีเจอร์เสร็จ ต้องทำขั้นตอนต่อไปนี้เสมอ:

## 1. ตรวจสอบคุณภาพโค้ด
หลังแก้ไขเสร็จ ให้รันคำสั่งตรวจสอบตาม stack ของโปรเจกต์

### Frontend
- ถ้ามี package.json ให้ตรวจสอบ script ที่มีอยู่ก่อน
- ถ้ามี script เหล่านี้ ให้รันตามลำดับ:
  - npm run lint
  - npm run typecheck
  - npm run build
  - npm test ถ้ามี

### Backend Go
- รัน:
  - gofmt -w .
  - go test ./...
  - go vet ./...

### Backend Node.js
- รัน:
  - npm run lint
  - npm run typecheck ถ้ามี
  - npm test ถ้ามี

ถ้าคำสั่งใดไม่มีอยู่ในโปรเจกต์ ห้ามสร้างคำสั่งมั่ว ให้แจ้งว่าไม่มี script นั้นใน package.json หรือ Makefile

## 2. แก้ error ก่อนจบงาน
ถ้า lint, typecheck, test หรือ build ไม่ผ่าน ต้องพยายามแก้ไขก่อน
ห้ามสรุปว่างานเสร็จถ้ายังมี error ที่เกิดจากโค้ดที่เพิ่งแก้

ถ้า error เกิดจาก dependency, environment, database, secret, external service หรือข้อจำกัดของเครื่อง ให้ระบุให้ชัดเจนว่าไม่สามารถตรวจสอบต่อได้เพราะอะไร

## 3. อัปเดตไฟล์บันทึกสิ่งที่ทำ
หลังทำงานเสร็จ ให้สร้างหรืออัปเดตไฟล์นี้เสมอ:

`docs/WORKLOG.md`

ถ้าโฟลเดอร์ `docs` ยังไม่มี ให้สร้างขึ้นมา

รูปแบบที่ต้องเขียนในไฟล์:

```md
# Work Log

## YYYY-MM-DD HH:mm

### Summary
- สรุปสั้น ๆ ว่าทำอะไรไป

### Changed Files
- path/to/file
- path/to/file

### Details
- รายละเอียดของสิ่งที่แก้
- เหตุผลที่แก้
- logic สำคัญที่เพิ่มหรือเปลี่ยน

### Validation
- คำสั่งที่รัน
- ผลลัพธ์ เช่น passed / failed
- ถ้า failed ให้เขียนเหตุผลและสิ่งที่ยังต้องแก้

### Notes
- ข้อควรระวัง
- TODO ถ้ามี

## Project Specific Validation

ถ้าเป็นโปรเจกต์ Go microservice:
- gofmt -w .
- go test ./...
- go vet ./...

ถ้าเป็น Next.js / React / Vite:
- npm run lint
- npm run typecheck ถ้ามี
- npm run build

ถ้ามี Dockerfile หรือ docker-compose:
- docker compose config
- docker build เฉพาะ service ที่แก้ ถ้าทำได้

ถ้าแก้ API:
- อัปเดต OpenAPI/Swagger ถ้ามี
- ตรวจว่า endpoint, request, response, error format ตรงกับของเดิม

ถ้าแก้ database:
- ห้ามแก้ schema โดยไม่สร้าง migration หรือ SQL note
- ต้องบันทึกผลกระทบใน docs/WORKLOG.md