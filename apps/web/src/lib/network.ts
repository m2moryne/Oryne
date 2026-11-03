/** GABCD…WXYZ: a Stellar key or contract ID, shortened for display. */
export const shortKey = (key: string, head = 5, tail = 4) =>
  key.length > head + tail + 1 ? `${key.slice(0, head)}…${key.slice(-tail)}` : key
