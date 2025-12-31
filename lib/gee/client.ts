/**
 * Google Earth Engine Client
 * Server-side only - handles authentication and initialization
 */

import ee from "@google/earthengine";

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize Earth Engine with service account credentials
 * This should be called once before any GEE operations
 */
export async function initializeEarthEngine(): Promise<void> {
  // Return existing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  // Skip if already initialized
  if (isInitialized) {
    return Promise.resolve();
  }

  initializationPromise = new Promise<void>((resolve, reject) => {
    const serviceAccountEmail = process.env.GEE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GEE_PRIVATE_KEY;

    if (!serviceAccountEmail || !privateKey) {
      const error = new Error(
        "GEE credentials not configured. Please set GEE_SERVICE_ACCOUNT_EMAIL and GEE_PRIVATE_KEY environment variables."
      );
      console.error(error.message);
      reject(error);
      return;
    }

    // Parse private key (handle both raw and escaped newlines)
    const formattedKey = privateKey.replace(/\\n/g, "\n");

    ee.data.authenticateViaPrivateKey(
      {
        client_email: serviceAccountEmail,
        private_key: formattedKey,
      },
      () => {
        ee.initialize(
          null,
          null,
          () => {
            console.log("✓ Earth Engine initialized successfully");
            isInitialized = true;
            resolve();
          },
          (error: Error) => {
            console.error("✗ Earth Engine initialization failed:", error);
            reject(error);
          }
        );
      },
      (error: Error) => {
        console.error("✗ Earth Engine authentication failed:", error);
        reject(error);
      }
    );
  });

  return initializationPromise;
}

/**
 * Get the initialized Earth Engine instance
 * Throws if not initialized
 */
export function getEarthEngine() {
  if (!isInitialized) {
    throw new Error(
      "Earth Engine not initialized. Call initializeEarthEngine() first."
    );
  }
  return ee;
}

/**
 * Check if Earth Engine is initialized
 */
export function isEarthEngineInitialized(): boolean {
  return isInitialized;
}

/**
 * Export the ee instance for convenience
 * Note: This should only be used after initialization
 */
export { ee };
