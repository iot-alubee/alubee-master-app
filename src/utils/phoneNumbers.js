import { Capacitor, registerPlugin } from '@capacitor/core';

const PhoneNumbers = registerPlugin('PhoneNumbers');

/**
 * Returns SIM / line numbers available on the device (Android).
 * Web returns [].
 */
export async function getDevicePhoneNumbers() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return [];
  }
  try {
    const result = await PhoneNumbers.getPhoneNumbers();
    const numbers = Array.isArray(result?.numbers) ? result.numbers : [];
    return numbers
      .map((n) => ({
        label: n.label || n.number || 'SIM',
        number: String(n.number || '').replace(/\D/g, ''),
        display: n.display || n.number || '',
      }))
      .filter((n) => n.number.length >= 10)
      .map((n) => ({
        ...n,
        number: n.number.slice(-10),
        display: n.display || n.number.slice(-10),
      }));
  } catch (err) {
    console.warn('getDevicePhoneNumbers failed', err);
    return [];
  }
}

export function isAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
