/**
 * Shuffle bag: each round plays every item exactly once in random order, the next round is
 * reshuffled, and an item never plays twice in a row (including across rounds and the wrap back
 * to the start). The first item stays first so a server render matches the first client frame.
 */
export function shuffleBag<T>(
  items: readonly T[],
  rounds = 12,
  random = Math.random,
): T[] {
  if (items.length < 3) return [...items]
  const shuffle = (list: T[]) => {
    const a = [...list]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const [first, ...rest] = items
  const out = [first, ...shuffle(rest)]
  for (let r = 1; r < rounds; r++) {
    const next = shuffle([...items])
    if (next[0] === out[out.length - 1]) next.push(next.shift()!)
    out.push(...next)
  }
  // The sequence loops: its last item must not equal the first.
  if (out[out.length - 1] === first) {
    const n = out.length
    ;[out[n - 1], out[n - 2]] = [out[n - 2], out[n - 1]]
  }
  return out
}
