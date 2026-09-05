import { createSignal } from 'solid-js';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/store/ui';
import { authState } from '@/store/auth';
import { validateUploadFile } from '@/lib/image';
import { generateJobIdPrefix } from '@/lib/utils';
import { calcRentalCharge, calcLineTotal, buildContractHtml, RENTAL_CONTRACT_VERSION } from '@/lib/rental';
import type { Rental, RentalAsset, RentalItem } from '@/lib/types';

const RENTAL_IMAGE_BUCKET = 'rental-images';

export type ImageKind = 'handover' | 'return';

export interface RentalFormInput {
  customerName: string;
  eventName: string;
  /** ค่าจาก <input type="datetime-local"> */
  startAt: string;
  endAt: string;
  assetIds: string[];
  note: string;
  acceptedByName: string;
}

export interface RentalConflict {
  assetId: string;
  assetName: string;
  rentalId: string;
  /** true = ใบเก่ายังไม่คีย์คืน ของจึงยังไม่กลับเข้าระบบ */
  notReturned: boolean;
  startAt: string;
  endAt: string;
}

// ============ State ============

const [assets, setAssets] = createSignal<RentalAsset[]>([]);
const [rentals, setRentals] = createSignal<Rental[]>([]);
const [loading, setLoading] = createSignal(false);

// ============ Assets ============

const fetchAssets = async (): Promise<void> => {
  const { data, error } = await supabase
    .from('rental_assets')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    showToast('โหลดรายการทรัพย์สินไม่สำเร็จ', 'error');
    return;
  }
  setAssets(data || []);
};

const addAsset = async (name: string, dailyRate: number): Promise<boolean> => {
  const { error } = await supabase.from('rental_assets').insert({ name, daily_rate: dailyRate });
  if (error) {
    showToast('เพิ่มทรัพย์สินไม่สำเร็จ', 'error');
    return false;
  }
  await fetchAssets();
  return true;
};

const updateAssetRate = async (id: string, dailyRate: number): Promise<boolean> => {
  const { error } = await supabase.from('rental_assets').update({ daily_rate: dailyRate }).eq('id', id);
  if (error) {
    showToast('บันทึกราคาไม่สำเร็จ', 'error');
    return false;
  }
  await fetchAssets();
  return true;
};

// ปิดการใช้งานแทนการลบ — ของที่เคยถูกเช่าไปแล้วยังต้องอ้างอิงได้จากใบเช่าเก่า
const setAssetActive = async (id: string, isActive: boolean): Promise<boolean> => {
  const { error } = await supabase.from('rental_assets').update({ is_active: isActive }).eq('id', id);
  if (error) {
    showToast('อัปเดตสถานะไม่สำเร็จ', 'error');
    return false;
  }
  await fetchAssets();
  return true;
};

// ============ Rentals ============

const sortItems = (rental: Rental): Rental => ({
  ...rental,
  items: [...(rental.items || [])].sort((a, b) => a.asset_name.localeCompare(b.asset_name, 'th')),
});

const fetchRentals = async (): Promise<void> => {
  setLoading(true);
  const { data, error } = await supabase
    .from('rentals')
    .select('*, items:rental_items(*)')
    .order('start_at', { ascending: false });

  if (error) {
    console.error(error);
    showToast('โหลดรายการเช่าไม่สำเร็จ', 'error');
  } else {
    setRentals((data || []).map(sortItems));
  }
  setLoading(false);
};

const findRental = (rentalId: string): Rental | undefined =>
  rentals().find((r) => r.rental_id === rentalId);

// ============ Availability ============
//
// อุปกรณ์ชิ้นหนึ่งไม่ว่างสำหรับช่วง [s, e) ถ้ามีรายการเช่าที่ยังไม่ถูกยกเลิก และ
//   • ยังไม่คีย์คืน  → บล็อกตั้งแต่ start_at เป็นต้นไปแบบไม่มีที่สิ้นสุด
//                     (เลยกำหนดคืนแล้วก็ยังบล็อก ของยังไม่กลับเข้าระบบ)
//   • คีย์คืนแล้ว    → บล็อกเฉพาะช่วง [start_at, end_at) ของใบนั้น

const conflictsFor = (startAt: string, endAt: string, assetIds: string[]): RentalConflict[] => {
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return [];

  const wanted = new Set(assetIds);
  const found: RentalConflict[] = [];

  for (const rental of rentals()) {
    if (rental.status === 'cancelled') continue;

    for (const item of rental.items || []) {
      if (!wanted.has(item.asset_id)) continue;

      const busyFrom = new Date(rental.start_at).getTime();
      const busyUntil = item.returned_at ? new Date(rental.end_at).getTime() : Infinity;

      if (busyFrom < e && busyUntil > s) {
        found.push({
          assetId: item.asset_id,
          assetName: item.asset_name,
          rentalId: rental.rental_id,
          notReturned: !item.returned_at,
          startAt: rental.start_at,
          endAt: rental.end_at,
        });
      }
    }
  }

  return found;
};

/** ชุด asset id ที่ไม่ว่างในช่วงเวลาที่เลือก — ใช้ทำปุ่มเทาในหน้าคีย์ใบเช่า */
const unavailableAssets = (startAt: string, endAt: string): Map<string, RentalConflict> => {
  const map = new Map<string, RentalConflict>();
  if (!startAt || !endAt) return map;

  const all = assets().map((a) => a.id);
  for (const conflict of conflictsFor(startAt, endAt, all)) {
    if (!map.has(conflict.assetId)) map.set(conflict.assetId, conflict);
  }
  return map;
};

// ============ Rental ID ============

const generateRentalId = async (): Promise<string> => {
  const prefix = `R${generateJobIdPrefix()}`;

  const { data } = await supabase
    .from('rentals')
    .select('rental_id')
    .ilike('rental_id', `${prefix}%`)
    .order('rental_id', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    const lastNum = parseInt(data[0].rental_id.slice(-2)) + 1;
    return `${prefix}${String(lastNum).padStart(2, '0')}`;
  }
  return `${prefix}00`;
};

// ============ Create ============

const createRental = async (input: RentalFormInput): Promise<string | null> => {
  if (!input.customerName) {
    showToast('เลือกลูกค้าก่อน', 'error');
    return null;
  }
  if (input.assetIds.length === 0) {
    showToast('เลือกอุปกรณ์ที่ต้องการเช่า', 'error');
    return null;
  }
  if (!input.acceptedByName.trim()) {
    showToast('ระบุชื่อผู้กดยอมรับสัญญา', 'error');
    return null;
  }

  const startAt = new Date(input.startAt).toISOString();
  const endAt = new Date(input.endAt).toISOString();
  const charge = calcRentalCharge(startAt, endAt);
  if (!charge) {
    showToast('ช่วงเวลาเช่าไม่ถูกต้อง — เวลาคืนต้องหลังเวลารับ', 'error');
    return null;
  }

  // เช็กชนอีกรอบด้วยข้อมูลสดก่อนเขียนจริง กันกรณีมีคนคีย์ใบอื่นแทรกระหว่างกรอกฟอร์ม
  await fetchRentals();
  const conflicts = conflictsFor(startAt, endAt, input.assetIds);
  if (conflicts.length > 0) {
    const detail = conflicts
      .map((c) => `${c.assetName} (ติดใบ ${c.rentalId}${c.notReturned ? ' — ยังไม่คืน' : ''})`)
      .join(', ');
    showToast(`อุปกรณ์ไม่ว่าง: ${detail}`, 'error');
    return null;
  }

  const chosen = assets().filter((a) => input.assetIds.includes(a.id));
  const unpriced = chosen.filter((a) => a.daily_rate <= 0);
  if (unpriced.length > 0) {
    showToast(`ยังไม่ตั้งราคา: ${unpriced.map((a) => a.name).join(', ')} — ตั้งค่าเช่า/วันก่อนออกสัญญา`, 'error');
    return null;
  }
  const lines = chosen.map((asset) => ({
    asset_id: asset.id,
    asset_name: asset.name,
    daily_rate: asset.daily_rate,
    line_total: calcLineTotal(asset.daily_rate, charge),
  }));
  const totalPrice = lines.reduce((sum, l) => sum + l.line_total, 0);

  const rentalId = await generateRentalId();
  const acceptedByName = input.acceptedByName.trim();
  // accepted_at ปล่อยให้ DB ใส่ now() เอง — เวลาที่ใช้เป็นหลักฐานต้องมาจากเซิร์ฟเวอร์ ไม่ใช่นาฬิกาเครื่องพนักงาน
  const { data: created, error: rentalError } = await supabase
    .from('rentals')
    .insert({
    rental_id: rentalId,
    customer_name: input.customerName,
    event_name: input.eventName || null,
    start_at: startAt,
    end_at: endAt,
    billed_unit: charge.unit,
    billed_qty: charge.qty,
    total_price: totalPrice,
    status: 'active',
    note: input.note || null,
    created_by: authState.profile?.display_name || null,
    contract_version: RENTAL_CONTRACT_VERSION,
    accepted_by_name: acceptedByName,
    })
    .select('accepted_at')
    .single();

  if (rentalError || !created) {
    console.error(rentalError);
    showToast('บันทึกใบเช่าไม่สำเร็จ', 'error');
    return null;
  }

  const { error: itemsError } = await supabase
    .from('rental_items')
    .insert(lines.map((l) => ({ ...l, rental_id: rentalId })));

  if (itemsError) {
    // อย่าปล่อยใบเช่าเปล่าที่ไม่มีรายการทรัพย์สินค้างไว้
    await supabase.from('rentals').delete().eq('rental_id', rentalId);
    console.error(itemsError);
    showToast('บันทึกรายการทรัพย์สินไม่สำเร็จ', 'error');
    return null;
  }

  // snapshot ข้อความสัญญาฉบับที่ยอมรับจริงไว้กับใบเช่า — แก้ข้อความสัญญาในโค้ดภายหลัง
  // ใบเก่าต้องยังพิมพ์ฉบับเดิมออกมาได้ ไม่ใช่ render ใหม่ด้วยข้อความปัจจุบัน
  const contractHtml = buildContractHtml({
    rentalId,
    customerName: input.customerName,
    eventName: input.eventName || null,
    startAt,
    endAt,
    charge,
    items: lines,
    totalPrice,
    acceptedByName,
    acceptedAt: created.accepted_at,
    provider: authState.provider,
  });
  const { error: snapshotError } = await supabase
    .from('rentals')
    .update({ contract_html: contractHtml })
    .eq('rental_id', rentalId);
  if (snapshotError) {
    // ใบเช่าบันทึกแล้ว แค่ snapshot ไม่เข้า — ให้ผู้ใช้รู้ แต่ไม่ต้อง rollback (หน้าแสดงผลมี fallback render จากข้อมูล)
    console.error(snapshotError);
    showToast('บันทึกใบเช่าแล้ว แต่เก็บสำเนาสัญญาไม่สำเร็จ', 'warning');
  }

  await fetchRentals();
  showToast(`บันทึกใบเช่า ${rentalId} แล้ว`);
  return rentalId;
};

const cancelRental = async (rentalId: string): Promise<boolean> => {
  const rental = findRental(rentalId);
  if (rental?.items?.some((i) => i.returned_at)) {
    showToast('ใบนี้มีของที่รับคืนแล้ว ยกเลิกไม่ได้ — ให้คีย์คืนส่วนที่เหลือแทน', 'error');
    return false;
  }

  const { error } = await supabase.from('rentals').update({ status: 'cancelled' }).eq('rental_id', rentalId);
  if (error) {
    showToast('ยกเลิกไม่สำเร็จ', 'error');
    return false;
  }

  await fetchRentals();
  showToast('ยกเลิกใบเช่าแล้ว');
  return true;
};

// ============ Condition Photos ============

const imageColumn = (kind: ImageKind) => (kind === 'return' ? 'return_images' : 'handover_images');

const imagesOf = (item: RentalItem, kind: ImageKind): string[] =>
  (kind === 'return' ? item.return_images : item.handover_images) || [];

const uploadItemImages = async (
  item: RentalItem,
  kind: ImageKind,
  files: File[]
): Promise<string[] | null> => {
  // รับคืนไปแล้วห้ามแก้รูป — รูปชุดนี้คือหลักฐานสภาพทรัพย์สิน ณ วันรับคืน
  if (item.returned_at) {
    showToast('รายการนี้รับคืนแล้ว แก้ไขรูปไม่ได้', 'error');
    return null;
  }

  const urls: string[] = [];
  for (const file of files) {
    const invalid = validateUploadFile(file);
    if (invalid) {
      showToast(invalid, 'error');
      return null;
    }

    const ext = file.name.split('.').pop() || 'webp';
    const path = `${item.rental_id}/${item.asset_id}/${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from(RENTAL_IMAGE_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (error) {
      showToast(`อัปโหลดไม่สำเร็จ: ${error.message}`, 'error');
      return null;
    }

    const { data } = supabase.storage.from(RENTAL_IMAGE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  const newImages = [...imagesOf(item, kind), ...urls];
  const { error } = await supabase
    .from('rental_items')
    .update({ [imageColumn(kind)]: newImages })
    .eq('id', item.id);

  if (error) {
    showToast(error.message, 'error');
    return null;
  }

  await fetchRentals();
  showToast(`แนบรูปแล้ว ${urls.length} รูป`);
  return newImages;
};

const removeItemImage = async (item: RentalItem, kind: ImageKind, url: string): Promise<boolean> => {
  if (item.returned_at) {
    showToast('รายการนี้รับคืนแล้ว แก้ไขรูปไม่ได้', 'error');
    return false;
  }

  const newImages = imagesOf(item, kind).filter((u) => u !== url);
  const { error } = await supabase
    .from('rental_items')
    .update({ [imageColumn(kind)]: newImages })
    .eq('id', item.id);

  if (error) {
    showToast(error.message, 'error');
    return false;
  }

  // Best-effort: ลบไฟล์ใน storage ตามไปด้วย
  const marker = `/object/public/${RENTAL_IMAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const path = decodeURIComponent(url.slice(idx + marker.length));
    await supabase.storage.from(RENTAL_IMAGE_BUCKET).remove([path]);
  }

  await fetchRentals();
  return true;
};

// ============ Return ============

const returnItem = async (item: RentalItem, note: string): Promise<boolean> => {
  if (item.returned_at) return false;

  const photos = imagesOf(item, 'return');
  if (photos.length === 0) {
    showToast('แนบรูปสภาพอุปกรณ์อย่างน้อย 1 รูปก่อนรับคืน', 'error');
    return false;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rental_items')
    .update({
      returned_at: now,
      returned_by: authState.profile?.display_name || null,
      return_note: note || null,
    })
    .eq('id', item.id)
    .is('returned_at', null); // กันกดซ้ำจากสองเครื่องพร้อมกัน

  if (error) {
    console.error(error);
    showToast('บันทึกการรับคืนไม่สำเร็จ', 'error');
    return false;
  }

  // สภาพล่าสุดของอุปกรณ์ = รูปตอนรับคืนครั้งหลังสุด
  await supabase
    .from('rental_assets')
    .update({ last_condition_image: photos[photos.length - 1], last_condition_at: now })
    .eq('id', item.asset_id);

  // คืนครบทั้งใบเมื่อไหร่ ใบเช่าถึงจะปิด
  const { data: siblings } = await supabase
    .from('rental_items')
    .select('returned_at')
    .eq('rental_id', item.rental_id);

  if (siblings && siblings.every((s) => s.returned_at)) {
    await supabase.from('rentals').update({ status: 'returned' }).eq('rental_id', item.rental_id);
  }

  await fetchRentals();
  showToast(`รับคืน ${item.asset_name} แล้ว`);
  return true;
};

// ============ Export Hook ============

export const useRentals = () => ({
  assets,
  rentals,
  loading,
  fetchAssets,
  fetchRentals,
  findRental,
  addAsset,
  updateAssetRate,
  setAssetActive,
  conflictsFor,
  unavailableAssets,
  createRental,
  cancelRental,
  uploadItemImages,
  removeItemImage,
  returnItem,
});
