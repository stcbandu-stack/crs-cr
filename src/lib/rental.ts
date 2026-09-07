import type { ProviderInfo, RentalBilledUnit } from './types';

// ============ Pricing ============
//
// คิดค่าเช่าเป็นรายวันเสมอ (ตามคำสั่งผู้บริหาร) — เช่ากี่ชั่วโมงในวันนั้นก็คิดเต็มวัน
// ไม่มีการคิดสัดส่วนตามชั่วโมงอีกต่อไป นับวันแบบรวมวันที่คืน (inclusive):
// เช่าและคืนวันเดียวกัน = 1 วัน, เช่าวันนี้คืนพรุ่งนี้ = 2 วัน

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const RENTAL_CONTRACT_VERSION = 'v3'; // v3: เปลี่ยนเป็นคิดค่าเช่ารายวันล้วน ไม่คิดตามชั่วโมงแล้ว

export interface RentalCharge {
  unit: RentalBilledUnit;
  qty: number; // จำนวนวัน (นับรวมวันคืน)
  label: string;
}

/** null = ช่วงเวลาไม่ถูกต้อง (วันคืนมาก่อนวันรับ หรือกรอกไม่ครบ) */
export const calcRentalCharge = (startAt: string, endAt: string): RentalCharge | null => {
  if (!startAt || !endAt) return null;

  const ms = new Date(endAt).getTime() - new Date(startAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;

  const qty = Math.round(ms / DAY_MS) + 1;
  return { unit: 'day', qty, label: `${qty} วัน` };
};

const roundBaht = (amount: number): number => Math.round(amount * 100) / 100;

export const calcLineTotal = (dailyRate: number, charge: RentalCharge): number =>
  roundBaht(dailyRate * charge.qty);

/** ข้อความอธิบายวิธีคิดเงินของรายการหนึ่ง เช่น "1,000 × 2 วัน" */
export const describeLineCalc = (dailyRate: number, charge: RentalCharge): string =>
  `${dailyRate.toLocaleString()} × ${charge.qty} วัน`;

/**
 * เกินกำหนดคืนกี่ชั่วโมง (0 = ยังไม่เกิน) — ใช้แค่ขึ้นป้ายเตือน ไม่คิดค่าปรับ
 * endAt คือ "วันคืน" แบบนับรวม จึงยังไม่ถือว่าเกินกำหนดจนกว่าจะพ้นเที่ยงคืนของวันนั้นไปแล้ว
 */
export const overdueHours = (endAt: string, now: Date = new Date()): number => {
  const dueBy = new Date(endAt).getTime() + DAY_MS;
  const ms = now.getTime() - dueBy;
  return ms > 0 ? Math.floor(ms / HOUR_MS) : 0;
};

export const formatOverdue = (hours: number): string =>
  hours >= 24 ? `เกินกำหนด ${Math.floor(hours / 24)} วัน` : `เกินกำหนด ${hours} ชม.`;

// ============ สัญญาเช่าทรัพย์สิน ============
//
// เช่าสังหาริมทรัพย์ตาม ป.พ.พ. ม.537 ไม่มีแบบบังคับ จึงไม่ต้องลงลายมือชื่อ
// และไม่ต้องปิดอากรแสตมป์ การกดยอมรับในระบบมีผลผูกพันตาม
// พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 ม.7-9
// (ข้อความสัญญาผูกกับ RENTAL_CONTRACT_VERSION — แก้ข้อความเมื่อไหร่ให้ขยับเวอร์ชัน
//  ใบเก่าจะได้รู้ว่าลูกค้ายอมรับฉบับไหนไว้)

export interface RentalContractItem {
  asset_name: string;
  daily_rate: number;
  line_total: number;
}

export interface RentalContractContext {
  rentalId?: string;
  customerName: string;
  eventName?: string | null;
  startAt: string;
  endAt: string;
  charge: RentalCharge;
  items: RentalContractItem[];
  totalPrice: number;
  acceptedByName?: string;
  acceptedAt?: string;
  provider?: ProviderInfo | null;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[ch];
  });

const thDateTime = (value?: string): string =>
  value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }) : '-';

const thDate = (value?: string): string =>
  value ? new Date(value).toLocaleDateString('th-TH', { dateStyle: 'long' }) : '-';

/** เนื้อสัญญาล้วนๆ ใช้ได้ทั้งใน modal และในหน้าพิมพ์ */
export const buildContractHtml = (ctx: RentalContractContext): string => {
  const prov = ctx.provider;
  const lessor = escapeHtml(prov?.org_name || 'ผู้ให้เช่า');
  const lessorDetail = [prov?.address, prov?.phone && `โทร. ${prov.phone}`, prov?.tax_id && `เลขประจำตัวผู้เสียภาษี ${prov.tax_id}`]
    .filter(Boolean)
    .map((line) => escapeHtml(String(line)))
    .join(' · ');

  const itemRows = ctx.items
    .map(
      (item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(item.asset_name)}</td>
        <td class="num">${item.daily_rate.toLocaleString()}</td>
        <td class="num">${item.line_total.toLocaleString()}</td>
      </tr>`
    )
    .join('');

  const acceptanceBlock = ctx.acceptedByName
    ? `
    <div class="accept">
      <div class="accept-title">บันทึกการยอมรับสัญญาทางอิเล็กทรอนิกส์</div>
      <p>ผู้เช่าโดย <strong>${escapeHtml(ctx.acceptedByName)}</strong> ได้แสดงเจตนายอมรับข้อตกลงตามสัญญาฉบับนี้ผ่านระบบ</p>
      <p>เมื่อวันที่ ${thDateTime(ctx.acceptedAt)} · สัญญาเลขที่ ${escapeHtml(ctx.rentalId || '-')} · ฉบับ ${RENTAL_CONTRACT_VERSION}</p>
      <p class="fineprint">
        บันทึกอิเล็กทรอนิกส์นี้ใช้แทนการลงลายมือชื่อ และมีผลผูกพันคู่สัญญาตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์
        พ.ศ. 2544 มาตรา 7 มาตรา 8 และมาตรา 9
      </p>
    </div>`
    : `
    <div class="accept pending">
      <div class="accept-title">การยอมรับสัญญา</div>
      <p>เมื่อผู้เช่ากดยอมรับในระบบ ระบบจะบันทึกชื่อผู้ยอมรับ วันเวลา และเลขที่สัญญาไว้เป็นหลักฐานแทนการลงลายมือชื่อ</p>
    </div>`;

  return `
  <div class="contract">
    <h1>สัญญาเช่าทรัพย์สิน</h1>
    <p class="subtitle">
      สัญญาเลขที่ ${escapeHtml(ctx.rentalId || '(ยังไม่ออกเลขที่)')}
      · ทำขึ้นเมื่อวันที่ ${thDate(ctx.acceptedAt || new Date().toISOString())}
    </p>

    <p class="party">
      สัญญาฉบับนี้ทำขึ้นระหว่าง <strong>${lessor}</strong>${lessorDetail ? ` (${lessorDetail})` : ''}
      ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>“ผู้ให้เช่า”</strong> ฝ่ายหนึ่ง
      กับ <strong>${escapeHtml(ctx.customerName)}</strong>
      ซึ่งต่อไปในสัญญานี้เรียกว่า <strong>“ผู้เช่า”</strong> อีกฝ่ายหนึ่ง
      ${ctx.eventName ? `โดยผู้เช่าแจ้งว่าจะนำทรัพย์สินที่เช่าไปใช้ในงาน <strong>${escapeHtml(ctx.eventName)}</strong>` : ''}
    </p>
    <p>คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญากันโดยมีข้อความดังต่อไปนี้</p>

    <h2>ข้อ 1 ทรัพย์สินที่เช่า</h2>
    <p>ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าทรัพย์สินซึ่งเป็นสังหาริมทรัพย์ดังต่อไปนี้</p>
    <table>
      <thead>
        <tr><th style="width:40px">ลำดับ</th><th>รายการทรัพย์สิน</th><th class="num" style="width:130px">ค่าเช่า/วัน (บาท)</th><th class="num" style="width:130px">รวม (บาท)</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="3" class="num"><strong>รวมค่าเช่าทั้งสิ้น</strong></td><td class="num"><strong>${ctx.totalPrice.toLocaleString()}</strong></td></tr>
      </tfoot>
    </table>

    <h2>ข้อ 2 กำหนดระยะเวลาเช่า</h2>
    <p>
      ผู้เช่าเช่าทรัพย์สินตามข้อ 1 ตั้งแต่วันที่ <strong>${thDate(ctx.startAt)}</strong>
      ถึงวันที่ <strong>${thDate(ctx.endAt)}</strong> รวมระยะเวลาเช่า <strong>${escapeHtml(ctx.charge.label)}</strong>
    </p>
    <p>
      คู่สัญญาตกลงคิดค่าเช่าเป็นรายวัน โดยไม่ว่าผู้เช่าจะใช้ทรัพย์สินที่เช่าในแต่ละวันเป็นระยะเวลากี่ชั่วโมงก็ตาม
      ให้คิดค่าเช่าเต็มจำนวนหนึ่งวันสำหรับวันนั้น และนับรวมวันที่รับและวันที่คืนเป็นวันเช่าด้วยทั้งสองวัน
    </p>

    <h2>ข้อ 3 ค่าเช่าและการชำระเงิน</h2>
    <p>
      ผู้เช่าตกลงชำระค่าเช่าเป็นจำนวนเงินทั้งสิ้น <strong>${ctx.totalPrice.toLocaleString()} บาท</strong>
      ให้แก่ผู้ให้เช่าตามที่ผู้ให้เช่าเรียกเก็บ หากผู้เช่าใช้ทรัพย์สินเกินกำหนดระยะเวลาตามข้อ 2
      ผู้เช่าตกลงชำระค่าเช่าสำหรับระยะเวลาส่วนที่เกินตามหลักเกณฑ์การคำนวณในข้อ 2 เพิ่มเติมจากค่าเช่าข้างต้น
    </p>

    <h2>ข้อ 4 การส่งมอบและสภาพทรัพย์สิน</h2>
    <p>
      ผู้เช่าได้ตรวจสอบทรัพย์สินที่เช่าแล้วในวันรับมอบ และยอมรับว่าทรัพย์สินอยู่ในสภาพเรียบร้อยใช้การได้ดี
      ภาพถ่ายสภาพทรัพย์สิน ณ วันส่งมอบที่บันทึกไว้ในระบบของผู้ให้เช่า (ถ้ามี)
      ให้ถือเป็นส่วนหนึ่งของสัญญาฉบับนี้และเป็นหลักฐานแสดงสภาพทรัพย์สินในเวลาส่งมอบ
      ทั้งนี้ หากมิได้ทำบันทึกสภาพทรัพย์สินกันไว้ ให้เป็นไปตามข้อสันนิษฐานแห่งประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 561
    </p>

    <h2>ข้อ 5 หน้าที่ของผู้เช่า</h2>
    <p>
      ผู้เช่าตกลงใช้ทรัพย์สินที่เช่าเพื่อการอันเป็นปกติตามที่กำหนดไว้ในสัญญานี้
      และสงวนรักษาทรัพย์สินเสมอกับที่วิญญูชนจะพึงสงวนทรัพย์สินของตนเอง
      ผู้เช่าจะเป็นผู้รับผิดชอบการบำรุงรักษาและการซ่อมแซมเล็กน้อย
      จะไม่ดัดแปลงหรือต่อเติมทรัพย์สินที่เช่าโดยมิได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่า
      และยอมให้ผู้ให้เช่าหรือตัวแทนเข้าตรวจดูทรัพย์สินที่เช่าได้ในเวลาและระยะอันสมควร
      ทั้งนี้ตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 552 มาตรา 553 มาตรา 555 และมาตรา 558
    </p>

    <h2>ข้อ 6 ห้ามให้เช่าช่วงและโอนสิทธิ</h2>
    <p>
      ผู้เช่าจะไม่ให้เช่าช่วง หรือโอนสิทธิการเช่าทรัพย์สินไม่ว่าทั้งหมดหรือแต่บางส่วนให้แก่บุคคลภายนอก
      เว้นแต่จะได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่าก่อน ตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 544
      หากผู้เช่าฝ่าฝืน ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาได้ทันที
    </p>

    <h2>ข้อ 7 ความรับผิดกรณีทรัพย์สินสูญหายหรือบุบสลาย</h2>
    <p>
      ผู้เช่าต้องรับผิดในความสูญหายหรือบุบสลายอย่างใด ๆ อันเกิดขึ้นแก่ทรัพย์สินที่เช่า
      เพราะความผิดของผู้เช่าเอง หรือของบุคคลซึ่งอยู่กับผู้เช่า หรือของผู้เช่าช่วง
      ตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 562 โดยผู้เช่าตกลงชดใช้ตามค่าซ่อมแซมที่เกิดขึ้นจริง
      หรือชดใช้ตามราคาทรัพย์สินในกรณีที่ทรัพย์สินสูญหายหรือเสียหายจนไม่อาจซ่อมแซมได้
      ทั้งนี้ ผู้เช่าไม่ต้องรับผิดในความเสื่อมสภาพอันเกิดแต่การใช้ทรัพย์สินโดยชอบ
    </p>

    <h2>ข้อ 8 การส่งคืนทรัพย์สิน</h2>
    <p>
      เมื่อสัญญาเช่าสิ้นสุดลง ผู้เช่าต้องส่งคืนทรัพย์สินที่เช่าแก่ผู้ให้เช่า ณ สถานที่ที่ผู้ให้เช่ากำหนด
      ในสภาพเดียวกับที่ได้รับมอบไป เว้นแต่ความเสื่อมสภาพอันเกิดแต่การใช้ทรัพย์สินโดยชอบ
      ตามประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 561
      การส่งคืนถือว่าสมบูรณ์เมื่อผู้ให้เช่าได้บันทึกการรับคืนไว้ในระบบ
      กรณีผู้ให้เช่าบันทึกภาพถ่ายสภาพทรัพย์สิน ณ วันรับคืนไว้ในระบบ ให้ถือภาพถ่ายดังกล่าวเป็นหลักฐานการตรวจรับคืนทรัพย์สิน
    </p>

    <h2>ข้อ 9 การผิดสัญญาและการบอกเลิกสัญญา</h2>
    <p>
      หากผู้เช่าผิดสัญญาข้อหนึ่งข้อใด ผู้ให้เช่ามีสิทธิบอกเลิกสัญญาและเรียกทรัพย์สินที่เช่าคืนได้ทันที
      โดยผู้เช่ายังคงต้องรับผิดชดใช้ค่าเสียหายที่เกิดขึ้นแก่ผู้ให้เช่า
      และผู้ให้เช่าไม่จำต้องคืนค่าเช่าสำหรับระยะเวลาที่เหลืออยู่
    </p>

    <h2>ข้อ 10 การยอมรับสัญญาโดยวิธีการทางอิเล็กทรอนิกส์</h2>
    <p>
      คู่สัญญาตกลงว่าการที่ผู้เช่าแสดงเจตนายอมรับข้อตกลงตามสัญญาฉบับนี้ผ่านระบบของผู้ให้เช่า
      ให้มีผลผูกพันคู่สัญญาเช่นเดียวกับการลงลายมือชื่อในเอกสาร
      และให้ข้อมูลอิเล็กทรอนิกส์ที่ระบบบันทึกไว้ อันได้แก่ ชื่อผู้แสดงเจตนายอมรับ วันและเวลาที่ยอมรับ
      เลขที่สัญญา และฉบับของข้อความสัญญา เป็นพยานหลักฐานแห่งการแสดงเจตนาดังกล่าว
      ทั้งนี้ตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 มาตรา 7 มาตรา 8 และมาตรา 9
      คู่สัญญาตกลงจะไม่โต้แย้งความสมบูรณ์หรือการบังคับใช้ของสัญญาฉบับนี้ด้วยเหตุเพียงว่าอยู่ในรูปข้อมูลอิเล็กทรอนิกส์
    </p>

    <h2>ข้อ 11 กฎหมายที่ใช้บังคับ</h2>
    <p>
      สัญญาฉบับนี้อยู่ภายใต้บังคับแห่งกฎหมายไทย
      ในกรณีที่สัญญานี้มิได้กำหนดไว้เป็นอย่างอื่น ให้นำบทบัญญัติแห่งประมวลกฎหมายแพ่งและพาณิชย์
      ลักษณะเช่าทรัพย์มาใช้บังคับ
    </p>

    ${acceptanceBlock}
  </div>`;
};

const CONTRACT_STYLE = `
  .contract { font-family: 'Sarabun', 'Tahoma', 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.75; color: #111; }
  .contract h1 { font-size: 22px; text-align: center; margin-bottom: 4px; }
  .contract h2 { font-size: 15px; margin: 18px 0 4px; }
  .contract p { margin: 6px 0; text-align: justify; }
  .contract .subtitle { text-align: center; color: #555; font-size: 12px; margin-bottom: 18px; }
  .contract .party { margin-top: 14px; }
  .contract table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  .contract th, .contract td { border: 1px solid #999; padding: 6px 8px; }
  .contract th { background: #f1f5f9; }
  .contract .num { text-align: right; }
  .contract .accept { margin-top: 24px; border: 1px solid #333; padding: 12px 14px; background: #fafafa; }
  .contract .accept.pending { border-style: dashed; color: #555; }
  .contract .accept-title { font-weight: bold; margin-bottom: 6px; }
  .contract .fineprint { font-size: 11px; color: #555; }
`;

/** style สำหรับแสดงสัญญาใน modal (ฝัง <style> ไปกับ innerHTML) */
export const contractStyleTag = `<style>${CONTRACT_STYLE}</style>`;

/** พิมพ์จาก HTML ที่มีอยู่แล้ว (ปกติคือ rentals.contract_html ที่ snapshot ไว้ตอนยอมรับ) */
export const printContractHtml = (body: string, rentalId?: string): void => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>สัญญาเช่าทรัพย์สิน ${rentalId || ''}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 28px 32px; }
    ${CONTRACT_STYLE}
    @page { size: A4; margin: 15mm; }
  </style>
</head>
<body>${body}</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('กรุณาอนุญาต Popup เพื่อพิมพ์เอกสาร');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  // รอฟอนต์ Sarabun โหลดเสร็จก่อนสั่งพิมพ์ ไม่งั้นบางเครื่องจะได้ฟอนต์สำรอง
  printWindow.onload = () => {
    const doc = printWindow.document as Document & { fonts?: FontFaceSet };
    const ready = doc.fonts?.ready ?? Promise.resolve();
    ready.then(() => printWindow.print()).catch(() => printWindow.print());
  };
};

export const printRentalContract = (ctx: RentalContractContext): void =>
  printContractHtml(buildContractHtml(ctx), ctx.rentalId);
