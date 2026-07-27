// ============ Image Prepare (WebP + Resize) ============
// รูปแนบใบสั่งงาน: รับเฉพาะ PNG / JPG → แปลงเป็น WebP + ย่อขนาดก่อนอัปโหลด
// ถ้าบีบอัดจนสุดแล้วยังเกินเพดาน ค่อยแจ้ง error

export const IMAGE_MAX_SIZE = 5 * 1024 * 1024;
export const IMAGE_ACCEPT_ATTR = 'image/png,image/jpeg,.png,.jpg,.jpeg';

// ชนิดไฟล์ที่ผู้ใช้เลือก/ลากเข้ามาได้
const INPUT_MIME_TYPES = ['image/png', 'image/jpeg'];
const INPUT_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// ชนิดไฟล์ที่ยอมให้ส่งขึ้น storage (รวม WebP ที่แปลงมาแล้ว)
export const UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const MAX_DIMENSION = 2000; // ด้านที่ยาวที่สุดหลังย่อ (px)
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4]; // ไล่ลดคุณภาพถ้ายังใหญ่เกิน
const SCALE_STEPS = [1, 0.7, 0.5]; // คุณภาพต่ำสุดแล้วยังไม่พอ ค่อยย่อซ้ำ

export interface PreparedImage {
  file: File | null;
  error: string | null;
}

/**
 * ตรวจชนิดไฟล์ก่อนบีบอัด — คืนข้อความแจ้งเตือน หรือ null ถ้าผ่าน
 * (ไม่เช็คขนาดตรงนี้ เพราะขนาดจะถูกแก้ด้วยการบีบอัด)
 */
export function validateImageInput(file: File): string | null {
  // บาง OS ส่ง type ว่างมาตอนลากไฟล์ — ใช้นามสกุลไฟล์ช่วยตัดสิน
  const typeOk = file.type
    ? INPUT_MIME_TYPES.includes(file.type)
    : INPUT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

  return typeOk ? null : `"${file.name}" ไม่ใช่ไฟล์ PNG หรือ JPG`;
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
  return null;
}

export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ---------- internal ----------

type Decoded = ImageBitmap | HTMLImageElement;

const decodeImage = async (file: File): Promise<Decoded> => {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image = หมุนตาม EXIF ให้ด้วย (รูปจากมือถือ)
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // บาง browser ไม่รองรับ option นี้ — ตกไปใช้ <img> แทน
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
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
  });
};

const sizeOf = (img: Decoded): { width: number; height: number } => ({
  width: img instanceof HTMLImageElement ? img.naturalWidth : img.width,
  height: img instanceof HTMLImageElement ? img.naturalHeight : img.height,
});

const toBlob = (canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, mime, quality));

const renameTo = (name: string, ext: string): string =>
  `${name.replace(/\.[^./\\]+$/, '') || 'image'}.${ext}`;

/**
 * แปลงเป็น WebP + ย่อขนาด แล้วไล่ลดคุณภาพ/ขนาดจนกว่าจะไม่เกินเพดาน
 * - ชนิดไฟล์ผิด → error ทันที
 * - บีบอัดจนสุดแล้วยังเกิน → error
 * - ผลลัพธ์ใหญ่กว่าไฟล์เดิม และไฟล์เดิมไม่เกินเพดาน → ใช้ไฟล์เดิม
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const invalid = validateImageInput(file);
  if (invalid) return { file: null, error: invalid };

  let decoded: Decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    return { file: null, error: `"${file.name}" อ่านไฟล์รูปไม่สำเร็จ` };
  }

  const { width, height } = sizeOf(decoded);
  if (!width || !height) {
    return { file: null, error: `"${file.name}" อ่านไฟล์รูปไม่สำเร็จ` };
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // ไม่มี canvas ให้ใช้ — ตกกลับไปเช็คขนาดไฟล์เดิมตรง ๆ
    return file.size > IMAGE_MAX_SIZE
      ? { file: null, error: `"${file.name}" ใหญ่เกิน ${formatMb(IMAGE_MAX_SIZE)}` }
      : { file, error: null };
  }

  // ย่อครั้งแรกให้ด้านยาวสุดไม่เกิน MAX_DIMENSION
  const baseScale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  let output: Blob | null = null;
  let mime = 'image/webp';

  for (const scaleStep of SCALE_STEPS) {
    const scale = baseScale * scaleStep;
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, mime, quality);
      if (!blob) continue;

      // browser ที่ encode WebP ไม่ได้จะคืน PNG มาแทน — สลับไปใช้ JPEG
      if (mime === 'image/webp' && blob.type !== 'image/webp') {
        mime = 'image/jpeg';
        ctx.fillStyle = '#ffffff';
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

  if (decoded instanceof ImageBitmap) decoded.close();

  if (!output) {
    return { file: null, error: `"${file.name}" บีบอัดรูปไม่สำเร็จ` };
  }

  if (output.size > IMAGE_MAX_SIZE) {
    return {
      file: null,
      error: `"${file.name}" ใหญ่เกิน ${formatMb(IMAGE_MAX_SIZE)} แม้บีบอัดแล้ว (${formatMb(output.size)})`,
    };
  }

  // บีบอัดแล้วใหญ่กว่าเดิม (รูปเล็ก/สีเรียบ) — เก็บไฟล์เดิมไว้ดีกว่า
  if (output.size >= file.size && file.size <= IMAGE_MAX_SIZE) {
    return { file, error: null };
  }

  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  return {
    file: new File([output], renameTo(file.name, ext), { type: mime }),
    error: null,
  };
}
