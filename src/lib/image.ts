// ============ Image Prepare (WebP + Resize) ============
// รูปแนบใบสั่งงาน: รับเฉพาะ PNG / JPG → แปลงเป็น WebP + ย่อขนาดก่อนอัปโหลด
// ถ้าบีบอัดจนสุดแล้วยังเกินเพดาน ค่อยแจ้ง error
//
// สำคัญ: ต้องดัก "ขนาดภาพ (พิกเซล)" ไม่ใช่แค่ "ขนาดไฟล์"
// PNG 6MB ที่ 22441x11812 px = 265MP ต้องใช้แรมตอน decode ~1GB และเกินลิมิต canvas
// ของ browser (ส่วนใหญ่ 16384px ต่อด้าน) → เครื่องค้าง
// เลยอ่าน header ของไฟล์เพื่อรู้ขนาดภาพ "ก่อน" decode แล้วตัดจบตั้งแต่ต้นทาง

export const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // เพดานไฟล์ผลลัพธ์หลังบีบอัด
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024; // ไฟล์ต้นทางใหญ่เกินนี้ไม่ต้องเสียเวลาอ่าน
export const MAX_PIXELS = 60_000_000; // ~60MP (กล้องมือถือ 50MP ยังผ่าน)
export const MAX_SIDE = 15000; // ด้านเดียวยาวเกินนี้ canvas เอาไม่อยู่
export const MAX_FILES_PER_BATCH = 20; // กันลากทีเดียว 100 ไฟล์
export const IMAGE_ACCEPT_ATTR = 'image/png,image/jpeg,.png,.jpg,.jpeg';

// ชนิดไฟล์ที่ยอมให้ส่งขึ้น storage (รวม WebP ที่แปลงมาแล้ว)
export const UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const MAX_DIMENSION = 2000; // ด้านที่ยาวที่สุดหลังย่อ (px)
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4]; // ไล่ลดคุณภาพถ้ายังใหญ่เกิน
const SCALE_STEPS = [1, 0.7, 0.5]; // คุณภาพต่ำสุดแล้วยังไม่พอ ค่อยย่อซ้ำ
const HEADER_BYTES = 512 * 1024; // ช่วงหัวไฟล์ที่อ่านมาหาขนาดภาพ
const DECODE_TIMEOUT_MS = 30_000; // decode ค้างเกินนี้ถือว่าไม่ไหว

export interface PreparedImage {
  file: File | null;
  error: string | null;
}

export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * ด่านสุดท้ายก่อนส่งขึ้น storage — คืนข้อความแจ้งเตือน หรือ null ถ้าผ่าน
 */
export function validateUploadFile(file: File): string | null {
  if (!UPLOAD_MIME_TYPES.includes(file.type)) {
    return `"${file.name}" ไม่ใช่ไฟล์รูปที่รองรับ`;
  }
  if (file.size > IMAGE_MAX_SIZE) {
    return `"${file.name}" ใหญ่เกิน ${formatMb(IMAGE_MAX_SIZE)}`;
  }
  if (file.size === 0) {
    return `"${file.name}" เป็นไฟล์ว่าง`;
  }
  return null;
}

// ---------- อ่านขนาดภาพจาก header (ไม่ decode ทั้งไฟล์) ----------

interface ImageHeader {
  kind: 'png' | 'jpeg';
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const readPngHeader = (bytes: Uint8Array): ImageHeader | null => {
  if (bytes.length < 24) return null;
  if (PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  // IHDR ต้องเป็น chunk แรกเสมอ: [8..12]=length, [12..16]='IHDR', [16..20]=width, [20..24]=height
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { kind: 'png', width: view.getUint32(16), height: view.getUint32(20) };
};

const readJpegHeader = (bytes: Uint8Array): ImageHeader | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++; // ขยะระหว่าง segment — เลื่อนหา marker ตัวถัดไป
      continue;
    }
    const marker = bytes[i + 1];
    // padding / marker ที่ไม่มี payload
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // จบ / เริ่ม scan data แล้ว

    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) break;

    // SOF0-SOF15 ยกเว้น DHT(c4) / JPG(c8) / DAC(cc) คือ segment ที่บอกขนาดภาพ
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSOF) {
      return {
        kind: 'jpeg',
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
      };
    }

    i += 2 + length;
  }

  return null;
};

/**
 * อ่าน magic bytes + ขนาดภาพจากหัวไฟล์
 * ใช้เนื้อไฟล์จริงตัดสิน ไม่เชื่อ file.type / นามสกุล (กันไฟล์เปลี่ยนนามสกุลมาหลอก)
 */
const readImageHeader = async (file: File): Promise<ImageHeader | null> => {
  try {
    const buffer = await file.slice(0, HEADER_BYTES).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return readPngHeader(bytes) || readJpegHeader(bytes);
  } catch {
    return null;
  }
};

// ---------- decode / encode ----------

type Decoded = ImageBitmap | HTMLImageElement;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

/**
 * decode พร้อมย่อในขั้นตอนเดียว — browser จะไม่กางภาพเต็มขนาดไว้ในแรม
 */
const decodeImage = async (file: File, targetW: number, targetH: number): Promise<Decoded> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await withTimeout(
        createImageBitmap(file, {
          resizeWidth: targetW,
          resizeHeight: targetH,
          resizeQuality: 'high',
          // from-image = หมุนตาม EXIF ให้ด้วย (รูปจากมือถือ)
          imageOrientation: 'from-image',
        }),
        DECODE_TIMEOUT_MS
      );
    } catch {
      // บาง browser ไม่รองรับ option พวกนี้ — ตกไปใช้ <img> แทน
    }
  }

  return await withTimeout(
    new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('decode failed'));
      };
      img.src = url;
    }),
    DECODE_TIMEOUT_MS
  );
};

const sizeOf = (img: Decoded): { width: number; height: number } => ({
  width: img instanceof HTMLImageElement ? img.naturalWidth : img.width,
  height: img instanceof HTMLImageElement ? img.naturalHeight : img.height,
});

const releaseDecoded = (img: Decoded | null): void => {
  if (img && typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close();
};

const toBlob = (canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, mime, quality));

const renameTo = (name: string, ext: string): string =>
  `${name.replace(/\.[^./\\]+$/, '') || 'image'}.${ext}`;

const fail = (message: string): PreparedImage => ({ file: null, error: message });

/**
 * แปลงเป็น WebP + ย่อขนาด แล้วไล่ลดคุณภาพ/ขนาดจนกว่าจะไม่เกินเพดาน
 *
 * ลำดับการดัก:
 *  1. ไฟล์ว่าง / ใหญ่เกิน MAX_SOURCE_BYTES → error ทันที (ไม่แตะเนื้อไฟล์)
 *  2. magic bytes ไม่ใช่ PNG/JPEG จริง → error (ไม่เชื่อนามสกุล)
 *  3. ขนาดภาพเกิน MAX_PIXELS / MAX_SIDE → error ทันที (กันเครื่องค้างตอน decode)
 *  4. decode + ย่อในขั้นตอนเดียว, มี timeout กันค้าง
 *  5. บีบอัดจนสุดแล้วยังเกิน IMAGE_MAX_SIZE → error
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (file.size === 0) {
    return fail(`"${file.name}" เป็นไฟล์ว่าง (0 byte)`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return fail(
      `"${file.name}" ไฟล์ใหญ่เกินไป ${formatMb(file.size)} (รับไม่เกิน ${formatMb(MAX_SOURCE_BYTES)})`
    );
  }

  const header = await readImageHeader(file);
  if (!header) {
    return fail(`"${file.name}" ไม่ใช่ไฟล์ PNG หรือ JPG (หรือไฟล์เสียหาย)`);
  }

  const { width, height } = header;
  if (!width || !height) {
    return fail(`"${file.name}" อ่านขนาดภาพไม่ได้ ไฟล์อาจเสียหาย`);
  }

  const dimensionText = `${width.toLocaleString()}×${height.toLocaleString()} px`;

  if (width > MAX_SIDE || height > MAX_SIDE) {
    return fail(
      `"${file.name}" ภาพยาวเกินไป ${dimensionText} (รับด้านละไม่เกิน ${MAX_SIDE.toLocaleString()} px)`
    );
  }
  if (width * height > MAX_PIXELS) {
    return fail(
      `"${file.name}" ภาพละเอียดเกินไป ${dimensionText} — ย่อก่อนแล้วค่อยอัปโหลดใหม่นะครับ`
    );
  }

  // ย่อให้ด้านยาวสุดไม่เกิน MAX_DIMENSION ตั้งแต่ตอน decode
  const baseScale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * baseScale));
  const targetH = Math.max(1, Math.round(height * baseScale));

  let decoded: Decoded | null = null;
  const canvas = document.createElement('canvas');

  try {
    try {
      decoded = await decodeImage(file, targetW, targetH);
    } catch {
      return fail(`"${file.name}" เปิดไฟล์รูปไม่สำเร็จ (ไฟล์ใหญ่เกินไปหรือเสียหาย)`);
    }

    // EXIF อาจสลับด้านกว้าง/สูง — ใช้ขนาดจริงหลัง decode เป็นหลัก
    const decodedSize = sizeOf(decoded);
    if (!decodedSize.width || !decodedSize.height) {
      return fail(`"${file.name}" อ่านไฟล์รูปไม่สำเร็จ`);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // ไม่มี canvas ให้ใช้ — ตกกลับไปเช็คขนาดไฟล์เดิมตรง ๆ
      return file.size > IMAGE_MAX_SIZE
        ? fail(`"${file.name}" ใหญ่เกิน ${formatMb(IMAGE_MAX_SIZE)} และบีบอัดในเครื่องไม่ได้`)
        : { file, error: null };
    }

    const fitScale = Math.min(1, MAX_DIMENSION / Math.max(decodedSize.width, decodedSize.height));
    let output: Blob | null = null;
    let mime = 'image/webp';

    for (const scaleStep of SCALE_STEPS) {
      const scale = fitScale * scaleStep;
      canvas.width = Math.max(1, Math.round(decodedSize.width * scale));
      canvas.height = Math.max(1, Math.round(decodedSize.height * scale));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITY_STEPS) {
        const blob = await toBlob(canvas, mime, quality);
        if (!blob) continue;

        // browser ที่ encode WebP ไม่ได้จะคืน PNG มาแทน — สลับไปใช้ JPEG
        if (mime === 'image/webp' && blob.type !== 'image/webp') {
          mime = 'image/jpeg';
          ctx.fillStyle = '#ffffff'; // JPEG ไม่มี alpha — พื้นใสจะกลายเป็นดำถ้าไม่รองพื้น
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
          const jpeg = await toBlob(canvas, mime, quality);
          if (!jpeg) continue;
          output = jpeg;
        } else {
          output = blob;
        }

        if (output.size <= IMAGE_MAX_SIZE) break;
      }

      if (output && output.size <= IMAGE_MAX_SIZE) break;
    }

    if (!output) {
      return fail(`"${file.name}" บีบอัดรูปไม่สำเร็จ`);
    }

    if (output.size > IMAGE_MAX_SIZE) {
      return fail(
        `"${file.name}" ใหญ่เกิน ${formatMb(IMAGE_MAX_SIZE)} แม้บีบอัดแล้ว (${formatMb(output.size)})`
      );
    }

    // บีบอัดแล้วใหญ่กว่าเดิม (รูปเล็ก/สีเรียบ) — เก็บไฟล์เดิมไว้ดีกว่า
    // แต่ต้องเป็นชนิดที่ storage รับได้ด้วย
    if (output.size >= file.size && file.size <= IMAGE_MAX_SIZE) {
      const originalMime = header.kind === 'png' ? 'image/png' : 'image/jpeg';
      return {
        file: file.type === originalMime ? file : new File([file], file.name, { type: originalMime }),
        error: null,
      };
    }

    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    return { file: new File([output], renameTo(file.name, ext), { type: mime }), error: null };
  } finally {
    releaseDecoded(decoded);
    // คืนแรมของ canvas ทันที ไม่รอ GC
    canvas.width = 0;
    canvas.height = 0;
  }
}
