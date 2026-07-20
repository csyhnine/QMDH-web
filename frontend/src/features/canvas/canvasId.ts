/** Tiny id helper to avoid adding nanoid dependency. */
export function nanoid(size = 10): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (let i = 0; i < size; i += 1) {
    id += alphabet[bytes[i]! % alphabet.length];
  }
  return id;
}
