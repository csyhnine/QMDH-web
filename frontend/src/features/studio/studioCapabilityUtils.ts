export function parseCapabilities(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatCapabilities(value: string[]): string {
  return value.join(", ");
}

export function hasCapability(value: string, capability: string): boolean {
  return parseCapabilities(value).includes(capability);
}

export function toggleCapability(value: string, capability: string, enabled: boolean): string {
  const capabilities = new Set(parseCapabilities(value));
  if (enabled) {
    capabilities.add(capability);
  } else {
    capabilities.delete(capability);
  }
  return formatCapabilities(Array.from(capabilities));
}
