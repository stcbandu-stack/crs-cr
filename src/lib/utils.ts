// ============ Utility Functions ============

/**
 * Format date to Thai locale string
 */
export const formatDate = (dateStr: string | Date | undefined): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('th-TH');
};

/**
 * Format date and time to Thai locale string
 */
export const formatDateTime = (dateStr: string | Date | undefined): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('th-TH');
};

/**
 * Format number as currency
 */
export const formatCurrency = (amount: number | undefined): string => {
  return (amount || 0).toLocaleString();
};

/**
 * Get device name from user agent
 */
export const getDeviceName = (): string => {
  const ua = navigator.userAgent;
  const osMap = [
    { pattern: 'Win', name: 'Windows PC' },
    { pattern: 'Mac', name: 'Mac' },
    { pattern: 'Linux', name: 'Linux' },
    { pattern: 'Android', name: 'Android' },
    { pattern: 'iPhone', name: 'iOS' },
    { pattern: 'iPad', name: 'iOS' },
  ];
  const browserMap = [
    { pattern: 'Chrome', name: ' (Chrome)' },
    { pattern: 'Safari', name: ' (Safari)' },
    { pattern: 'Firefox', name: ' (Firefox)' },
    { pattern: 'Edge', name: ' (Edge)' },
  ];

  const osName = osMap.find((os) => ua.includes(os.pattern))?.name || 'Unknown Device';
  const browserName = browserMap.find((br) => ua.includes(br.pattern))?.name || '';

  return osName + browserName;
};

/**
 * Get or create device ID
 */
export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
};

/**
 * Generate Job ID based on date
 */
export const generateJobIdPrefix = (): string => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543; // Buddhist Era
  return `${day}${month}${year}`;
};

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return function (...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Class names utility (like clsx)
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
