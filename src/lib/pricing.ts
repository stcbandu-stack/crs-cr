// ============ Pricing — Single Source of Truth ============
// กฎคำนวณราคาทั้งหมดของใบสั่งงานอยู่ที่ไฟล์นี้ที่เดียว
// ดูเหตุผลการออกแบบและนโยบายความเข้ากันได้กับข้อมูลเก่าใน docs/PRICING_REFACTOR_PLAN.md

import type { OrderItem, Service } from './types';

export const OTHER_SERVICE_NAME = 'อื่นๆ';

const CM_PER_METER = 100;

type ServiceRef = Service | { service_name: string; unit_price: number };

/** เช็คด้วยชื่อเท่านั้น — ตรงกับ record เก่าที่บันทึก sentinel ไว้ด้วยชื่อ */
export const isOtherService = (s: ServiceRef): boolean =>
  s.service_name === OTHER_SERVICE_NAME;

/** กันเฉพาะ NaN/undefined จาก record เก่าที่ field หาย — ไม่เปลี่ยนค่าติดลบ/ศูนย์ */
const safeNum = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0;

export const toMeters = (value: number, unit: 'cm' | 'm'): number =>
  unit === 'cm' ? value / CM_PER_METER : value;

/** พื้นที่เป็น ตร.ม. */
export const calcArea = (w: number, h: number, unit: 'cm' | 'm'): number =>
  toMeters(safeNum(w), unit) * toMeters(safeNum(h), unit);

/** base_price อาจหายใน record เก่า — fallback ไปที่ snapshot unit_price ของ service */
export const resolveBasePrice = (item: OrderItem): number =>
  isOtherService(item.service)
    ? 0
    : safeNum(item.base_price) || safeNum(item.service.unit_price);

/**
 * ราคาต่อชิ้น:
 * - base === 0  → ราคา manual ที่กรอกเอง (ครอบทั้ง "อื่นๆ" และ service ราคา 0)
 * - มีพื้นที่    → Math.ceil(พื้นที่ × ราคาต่อหน่วย) — ปัดขึ้นเสมอเป็นกลยุทธ์ธุรกิจ ห้ามแก้
 * - ไม่มีพื้นที่  → Math.ceil(base) เป็นราคาตั้งต้นจนกว่าจะกรอกขนาด
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

/** รวมจากค่า stored โดยตั้งใจ — item.total เป็น snapshot ณ วันออกใบสั่งงาน ห้าม recompute */
export const sumStoredTotals = (items: OrderItem[]): number =>
  items.reduce((sum, item) => sum + safeNum(item.total), 0);
