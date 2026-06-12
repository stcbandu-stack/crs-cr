# แผน Refactor: รวมตรรกะคำนวณราคาไว้ที่เดียว (Single Source of Truth)

> สถานะ: แผนผ่านการรีวิว 3 รอบ (รอบแรก, รอบ adversarial, รอบ data-compatibility) — พร้อมลงมือ
> อัปเดตล่าสุด: 2026-06-12

## 1. เป้าหมาย

ตรรกะคำนวณราคา (แปลงหน่วย → พื้นที่ → ราคา → ยอดรวม) ปัจจุบันถูกเขียนซ้ำ 3 ชุดใน
`src/composables/useOrder.ts` (`setItemService`, `updatePrice`, `calcRow`) และมีค่าคงที่
hardcode กระจายอยู่ (`'อื่นๆ'`, `/ 100`, ลิมิต 30 รายการ) ต้องรวมเป็น helper ชุดเดียวใน
`src/lib/pricing.ts` โดยมีเงื่อนไขสูงสุดคือ **กระทบข้อมูลเก่าใน DB น้อยที่สุด**

## 2. กฎธุรกิจที่ตรึงไว้ (ห้ามเปลี่ยนใน refactor นี้)

1. **ปัดเศษขึ้นเสมอ (`Math.ceil`) เป็นกลยุทธ์ธุรกิจ — ตั้งใจ** รวมถึงผลข้างเคียงจาก
   floating point (เช่น 1.1 × 1.1 × 100 = 121.00000000000003 → ปัดเป็น 122)
   **ห้ามใส่ epsilon/rounding fix** เพื่อให้ผลคำนวณตรงกับระบบเดิมทุกกรณี
2. สูตรราคาต่อชิ้น: `Math.ceil(พื้นที่(ตร.ม.) × ราคาต่อหน่วย)` แล้วคูณจำนวน
3. รายการที่ `base_price === 0` (รวมถึง "อื่นๆ") ใช้ราคาที่กรอกเอง (manual price)
   — key จาก `base_price === 0` ตามพฤติกรรม `calcRow` เดิม ไม่ใช่จากชื่อ service
   (service จริงที่ตั้งราคา 0 บาทก็รับ manual price ได้ — เป็นฟีเจอร์ ไม่ใช่บั๊ก)
4. ชื่อ "อื่นๆ" เป็นแค่ sentinel ระดับ UI — การเช็คใช้**ชื่อ**ตามโค้ดเดิมทุกจุด
   (ไม่เพิ่มการเช็ค `id` เพราะจะตีความ record เก่าต่างจากเดิม)

## 3. นโยบายความเข้ากันได้กับข้อมูลเก่า (หัวใจของแผน)

- **ไม่มี migration ฝั่ง DB** — refactor ฝั่ง client เท่านั้น ไม่แตะ row ใด ๆ ใน `job_orders`
- **ค่า stored คือ snapshot:** `item.price`, `item.total`, `job.total_price` ที่บันทึกแล้ว
  เป็นความจริง ณ วันออกใบสั่งงาน ห้าม recompute ย้อนหลัง
- **Recalc เกิดเฉพาะเมื่อ user แก้ input ของแถวนั้น** (เลือก service / แก้ w, h, unit, qty /
  กรอกราคา manual) — เปิด `editJob` แล้วกดบันทึกโดยไม่แตะรายการ `total_price` ต้องเท่าเดิมเป๊ะ
- **`grandTotal` ยังคงรวมจาก `item.total` ที่ stored** (ผ่าน `sumStoredTotals`)
  ไม่ recompute จากสูตร — กันงานเก่าถูก reprice เงียบ ๆ
- หน้าแสดงผล (`JobDetail.tsx`, `pdf.ts`, `History.tsx`) อ่านค่า stored ตรง ๆ อยู่แล้ว — ไม่แก้
- `editJob`/`updateJob` clone และเขียน items กลับทั้งก้อน — field ที่ไม่รู้จักใน record เก่า
  ต้องไม่หาย (พฤติกรรมเดิมของ shallow clone + setState merge รักษาไว้แล้ว)

## 4. ไฟล์ใหม่: `src/lib/pricing.ts`

```ts
import type { OrderItem, Service } from './types';

export const OTHER_SERVICE_NAME = 'อื่นๆ';
const CM_PER_METER = 100;

type ServiceRef = Service | { service_name: string; unit_price: number };

/** เช็คด้วยชื่อเท่านั้น — ตรงกับโค้ดเดิมทุกจุด เพื่อความเข้ากันได้กับ record เก่า */
export const isOtherService = (s: ServiceRef): boolean =>
  s.service_name === OTHER_SERVICE_NAME;

/** กันเฉพาะ NaN/undefined (record เก่า field หาย) — ไม่ clamp ค่าติดลบ/ศูนย์
 *  เพื่อคงพฤติกรรมเดิมทุกประการ */
const safeNum = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0;

export const toMeters = (value: number, unit: 'cm' | 'm'): number =>
  unit === 'cm' ? value / CM_PER_METER : value;

export const calcArea = (w: number, h: number, unit: 'cm' | 'm'): number =>
  toMeters(safeNum(w), unit) * toMeters(safeNum(h), unit);

/** base_price อาจหายใน record เก่า — fallback ไปที่ snapshot unit_price ของ service */
export const resolveBasePrice = (item: OrderItem): number =>
  isOtherService(item.service)
    ? 0
    : safeNum(item.base_price) || safeNum(item.service.unit_price);

/**
 * กฎราคารวมศูนย์ — แทน setItemService / updatePrice / calcRow ทั้งสามตัว
 * - base === 0  → ราคา manual ที่กรอกเอง (ครอบทั้ง "อื่นๆ" และ service ราคา 0)
 * - มีพื้นที่    → Math.ceil(พื้นที่ × ราคาต่อหน่วย)  [ปัดขึ้น = กลยุทธ์ธุรกิจ ห้ามแก้]
 * - ไม่มีพื้นที่  → Math.ceil(base) เป็นราคาตั้งต้น (ตามกฎ calcRow ซึ่งเป็นตัวที่รันตอนแก้ไข)
 */
export const calcItemPrice = (item: OrderItem): number => {
  const base = resolveBasePrice(item);
  if (base === 0) return safeNum(item.price);
  const area = calcArea(item.w, item.h, item.unit);
  return area > 0 ? Math.ceil(area * base) : Math.ceil(base);
};

export const calcItemTotal = (item: OrderItem): number => {
  const qty = Number.isFinite(item.qty) ? item.qty : 1;
  return calcItemPrice(item) * qty;
};

/** รวมจากค่า stored โดยตั้งใจ — item.total เป็น snapshot ห้าม recompute งานเก่า */
export const sumStoredTotals = (items: OrderItem[]): number =>
  items.reduce((sum, item) => sum + safeNum(item.total), 0);
```

## 5. ไฟล์ที่แก้

### 5.1 `src/lib/types.ts`
- เพิ่ม `MAX_ORDER_ITEMS: 30` เข้า `CONFIG` (บรรทัด ~156) — ไม่ใส่ใน pricing.ts
  เพราะไม่ใช่เรื่อง pricing

### 5.2 `src/composables/useOrder.ts`
- `grandTotal` → ใช้ `sumStoredTotals(state.form.items)` (พฤติกรรมเดิมเป๊ะ แค่ย้ายสูตร)
- ยุบ `updatePrice` (บรรทัด 204) + `calcRow` (บรรทัด 231) เหลือ **`recalcItem(index)`**
  ตัวเดียว: เซ็ต `base_price` จาก `resolveBasePrice` แล้วเซ็ต `price`/`total` จาก
  `calcItemPrice`/`calcItemTotal`
- `setItemService` (บรรทัด 176): เซ็ต `service` + `base_price`
  (= 0 ถ้าชื่อ "อื่นๆ", ไม่งั้น `unit_price`) แล้วเรียก `recalcItem` ต่อ — เลิกเขียนสูตรเอง
- `addItem` (บรรทัด 151): เปลี่ยน `30` → `CONFIG.MAX_ORDER_ITEMS`,
  เปลี่ยน `updatePrice(...)` → `recalcItem(...)`
- ลบ `updatePrice`, `calcRow` ออกจาก export, เพิ่ม `recalcItem`
- เช็คสตริง `'อื่นๆ'` ที่เหลือ → ใช้ `OTHER_SERVICE_NAME` / `isOtherService`

### 5.3 `src/routes/Order.tsx`
- บรรทัด 163, 182, 184: `'อื่นๆ'` → `OTHER_SERVICE_NAME`
- บรรทัด 201, 212, 222, 236, 249: `order.calcRow(idx(), '...')` → `order.recalcItem(idx())`
  (พารามิเตอร์ type เป็น dead code อยู่แล้ว — calcRow เดิมไม่เคยใช้)
- บรรทัด 392-393: `item.unit === 'cm' ? item.w / 100 : item.w` → `toMeters(item.w, item.unit)`
  (และ `item.h` เช่นกัน)

### 5.4 ไฟล์ที่**ไม่**แตะ
`JobDetail.tsx`, `pdf.ts`, `History.tsx`, `Inventory*` — อ่านค่า stored อย่างเดียว ถูกต้องอยู่แล้ว

## 6. พฤติกรรมที่ต่างจากเดิม (มีเท่านี้ — ทั้งหมดเกิดเฉพาะตอน user แก้แถว ไม่กระทบค่าที่ stored)

| # | กรณี | เดิม | ใหม่ | เหตุผล |
|---|------|------|------|--------|
| 1 | เลือก service ปกติ, ยังไม่กรอกขนาด (area = 0), ราคาต่อหน่วยมีทศนิยม | `setItemService` ให้ราคาดิบไม่ปัด / `calcRow` ปัดขึ้น (สองฟังก์ชันขัดกันเอง) | ปัดขึ้นเสมอ (`Math.ceil(base)`) | สอดคล้องกลยุทธ์ปัดขึ้น และตรงกับ `calcRow` ซึ่งเป็นตัวที่รันตอนแก้ไขจริง |
| 2 | เลือก service ที่ unit_price = 0, กรอกขนาดแล้ว | `setItemService` บังคับราคาเป็น 0 / `calcRow` คงราคา manual (ขัดกันเอง) | คงราคา manual | ตามกฎ `base === 0 → manual` ของ `calcRow` |
| 3 | record เก่าที่ `base_price` หาย (undefined) ถูกแก้ไขแถว | `NaN` ไหลลง `total` แล้ว persist ลง DB | fallback ไป `service.unit_price` → 0 | กัน data corruption — NaN ที่ persist คือความเสียหายถาวร |
| 4 | `w`/`h`/`qty` เป็น NaN (record พัง) ถูกแก้ไขแถว | NaN propagate | treat เป็น 0 (qty เป็น 1) | เหตุผลเดียวกับข้อ 3 |

ข้อ 1-2 คือการ resolve ความขัดแย้งระหว่างสองฟังก์ชันเดิมที่มีอยู่แล้ว (เลือกข้าง `calcRow`)
ไม่ใช่กฎใหม่ — ราคาบริการปัจจุบันเป็นจำนวนเต็ม ทำให้ข้อ 1 ไม่มีผลในทางปฏิบัติ

## 7. Known quirks ที่**คงไว้โดยตั้งใจ** (ไม่แก้ในงานนี้)

- **ราคา manual ของ admin บน service ปกติถูกเขียนทับ:** ช่องราคาใน `Order.tsx:244-251`
  เปิดให้ admin พิมพ์ได้ทุกแถว แต่สำหรับ service ที่ `base_price > 0` ราคาจะถูกคำนวณทับทันที
  — manual price มีผลจริงเฉพาะแถวที่ `base_price = 0` ถ้าจะให้ manual ชนะทุกกรณี
  เป็นการเปลี่ยน business rule ต้องตัดสินใจแยกต่างหาก
- **ค่าติดลบ:** `qty` ติดลบหรือ `w`/`h` ติดลบยังผ่านได้ตามเดิม (ควรกันที่ชั้น input validation
  ของ `Order.tsx` ในงานแยก ไม่เกี่ยวกับ refactor นี้)
- **Float + ceil ปัดขึ้นเกินจริงในบางเคส:** ตั้งใจ — กลยุทธ์ธุรกิจ (ดูข้อ 2.1)

## 8. การทดสอบ (โปรเจกต์ไม่มี test runner — ใช้ manual checklist)

สร้างออเดอร์ใหม่:
- [ ] เลือก service ปกติ + กรอก 110×110 ซม. ราคา/ตร.ม. ที่รู้ค่า → ราคาตรงกับระบบเดิม (รวมเคสปัดขึ้น)
- [ ] สลับหน่วย ซม. ↔ ม. → ราคา recalc ถูกต้อง
- [ ] เลือก "อื่นๆ" + กรอกราคาเอง + เปลี่ยน qty → total = ราคา × qty
- [ ] เปลี่ยน service ไป-กลับ → base_price/ราคาตามทัน
- [ ] เพิ่มรายการจนชน limit 30 → toast แจ้งเหมือนเดิม

ความเข้ากันได้กับข้อมูลเก่า (สำคัญสุด):
- [ ] เปิดงานเก่าจาก History (ดู/พิมพ์/PDF) → ตัวเลขทุกตัวตรงกับก่อน refactor
- [ ] **`editJob` งานเก่า → แก้แค่ชื่อลูกค้า → บันทึก → `total_price` ใน DB ไม่เปลี่ยนแม้แต่บาทเดียว**
- [ ] `editJob` งานเก่า → แก้ขนาด 1 แถว → เฉพาะแถวนั้น recalc แถวอื่นคงเดิม

(อนาคต: ถ้าเพิ่ม vitest, `pricing.ts` เป็น pure function ทดสอบง่ายที่สุดในระบบ — นอก scope งานนี้)

## 9. ลำดับการลงมือ

1. สร้าง `src/lib/pricing.ts` + เพิ่ม `MAX_ORDER_ITEMS` ใน `types.ts`
2. แก้ `useOrder.ts` (ยุบ 3 ฟังก์ชัน → `recalcItem`)
3. แก้ call sites ใน `Order.tsx`
4. `npm run lint` + `npm run build` ผ่าน
5. ไล่ manual checklist ข้อ 8
