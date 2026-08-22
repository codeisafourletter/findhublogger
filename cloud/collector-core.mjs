export function coordinatesFromHref(href) {
  if (!href) return null;
  try {
    const destination = new URL(href).searchParams.get("destination");
    const match = destination?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

export function detailsFromLines(lines, person) {
  const cleaned = lines.map(line => String(line).trim()).filter(Boolean);
  const nameIndex = cleaned.indexOf(person);
  const nearby = nameIndex >= 0 ? cleaned.slice(nameIndex + 1, nameIndex + 10) : cleaned;
  return {
    address: nearby.find(line => !/^(\d+%|•|Get directions|Manage who)/i.test(line) && !/\b(minutes?|hours?|days?) ago$/i.test(line)) || "",
    battery: nearby.find(line => /^\d+%$/.test(line)) || "",
    displayed_age: nearby.find(line => /\b(minutes?|hours?|days?) ago$/i.test(line)) || ""
  };
}
