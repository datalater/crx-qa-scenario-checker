/**
 * Safely parse JSON text.
 * @param {string} text - The JSON string to parse.
 * @returns {any|null} - The parsed object or null if failed.
 */
export function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}
