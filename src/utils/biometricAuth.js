import { Capacitor } from '@capacitor/core';
import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric';
import { isAndroidApp } from './phoneNumbers';

const SERVER = 'com.alubee.tasks.login';
const FLAG_KEY = 'alubee_biometric_enabled';

export function isBiometricSupportedPlatform() {
  return isAndroidApp() || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios');
}

export async function checkBiometricAvailability() {
  if (!isBiometricSupportedPlatform()) {
    return { available: false, biometryType: BiometryType.NONE, reason: 'web' };
  }
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: true });
    const available = !!(result?.isAvailable || result?.biometryType);
    return {
      available: available || isAndroidApp(),
      biometryType: result?.biometryType || BiometryType.NONE,
      reason: result?.errorCode || null,
    };
  } catch (err) {
    return { available: false, biometryType: BiometryType.NONE, reason: err?.message || 'unavailable' };
  }
}

export function biometryLabel(biometryType) {
  switch (biometryType) {
    case BiometryType.FACE_AUTHENTICATION:
    case BiometryType.FACE_ID:
      return 'Face unlock';
    case BiometryType.FINGERPRINT:
    case BiometryType.TOUCH_ID:
      return 'Fingerprint';
    case BiometryType.IRIS_AUTHENTICATION:
      return 'Iris unlock';
    default:
      return 'Biometric login';
  }
}

export function isBiometricEnabledLocally() {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export async function enableBiometricLogin(mobile, pin) {
  const avail = await checkBiometricAvailability();
  if (!avail.available) throw new Error('Biometric sensor is not available on this device');

  await NativeBiometric.verifyIdentity({
    reason: 'Enable biometric login for Alubee',
    title: 'Alubee',
    subtitle: 'Confirm fingerprint or face',
    description: 'Use your device biometrics to unlock the app next time',
    negativeButtonText: 'Cancel',
    maxAttempts: 5,
  });

  await NativeBiometric.setCredentials({
    username: String(mobile),
    password: String(pin),
    server: SERVER,
  });

  localStorage.setItem(FLAG_KEY, '1');
  return true;
}

export async function disableBiometricLogin() {
  try {
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch (_) {}
  try {
    localStorage.removeItem(FLAG_KEY);
  } catch (_) {}
}

/**
 * Prompt fingerprint/face, then return { mobile, pin } from secure storage.
 */
export async function loginWithBiometrics() {
  const avail = await checkBiometricAvailability();
  if (!avail.available) throw new Error('Biometric sensor is not available');

  if (!isBiometricEnabledLocally()) {
    throw new Error('Biometric login is not set up yet. Sign in with PIN first.');
  }

  await NativeBiometric.verifyIdentity({
    reason: 'Log in to Alubee',
    title: 'Alubee Login',
    subtitle: 'Fingerprint or face',
    description: 'Authenticate to continue',
    negativeButtonText: 'Cancel',
    maxAttempts: 5,
  });

  const creds = await NativeBiometric.getCredentials({ server: SERVER });
  if (!creds?.username || !creds?.password) {
    throw new Error('No saved biometric credentials. Sign in with PIN once.');
  }
  return { mobile: creds.username, pin: creds.password };
}
