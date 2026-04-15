/**
 * Get current timestamp in milliseconds.
 */
export function nowTs() {
    return Date.now();
}

/**
 * Get current date in ISO string format.
 */
export function nowIso() {
    return new Date().toISOString();
}
