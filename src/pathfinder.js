const PASSABLE = new Set([
  'minecraft:air', 'minecraft:cave_air', 'minecraft:short_grass', 'minecraft:grass',
  'minecraft:tall_grass', 'minecraft:seagrass', 'minecraft:snow_layer', 'minecraft:torch',
  'minecraft:water', 'minecraft:flowing_water',
])
const DANGER = new Set([
  'minecraft:lava', 'minecraft:flowing_lava', 'minecraft:fire', 'minecraft:soul_fire',
  'minecraft:magma', 'minecraft:cactus', 'minecraft:sweet_berry_bush',
])
const MAX_DROP = 3
const MAX_NODES = 6000
// null (unloaded/unknown) is deliberately impassable — never walk into
// terrain the bot can't see. Danger blocks are never passable or standable.
const passable = n => n !== null && PASSABLE.has(n) && !DANGER.has(n)
const solid = n => n !== null && !PASSABLE.has(n) && !DANGER.has(n)
function standable(world, x, y, z) {
  const feet = world.blockAt(x, y, z)
  const head = world.blockAt(x, y + 1, z)
  const floor = world.blockAt(x, y - 1, z)
  // Feet may be shallow water; head must be breathable (drowning avoidance).
  return passable(feet) && passable(head) && head !== 'minecraft:water' && solid(floor)
}
function findPath(world, start, isGoal, heuristicTarget) {
  const sx = Math.floor(start.x), sy = Math.floor(start.y), sz = Math.floor(start.z)
  const key = (x, y, z) => `${x},${y},${z}`
  const h = n => Math.abs(n.x - heuristicTarget.x) + Math.abs(n.y - heuristicTarget.y) + Math.abs(n.z - heuristicTarget.z)
  const open = [{ x: sx, y: sy, z: sz, g: 0, f: 0, parent: null }]
  const seen = new Map([[key(sx, sy, sz), 0]])
  let nodes = 0
  while (open.length && nodes++ < MAX_NODES) {
    open.sort((a, b) => a.f - b.f)
    const cur = open.shift()
    if (isGoal(cur)) {
      const path = []
      for (let n = cur; n; n = n.parent) path.unshift({ x: n.x + 0.5, y: n.y, z: n.z + 0.5 })
      return path
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, nz = cur.z + dz
      const candidates = []
      if (standable(world, nx, cur.y, nz)) candidates.push({ y: cur.y, cost: 1 })
      // Step up: needs headroom above the current position.
      if (standable(world, nx, cur.y + 1, nz) && passable(world.blockAt(cur.x, cur.y + 2, cur.z)))
        candidates.push({ y: cur.y + 1, cost: 1.5 })
      // Controlled drop, never more than MAX_DROP (fall-damage avoidance).
      if (!candidates.length) {
        for (let drop = 1; drop <= MAX_DROP; drop++) {
          if (!passable(world.blockAt(nx, cur.y - drop + 1, nz))) break
          if (standable(world, nx, cur.y - drop, nz)) {
            candidates.push({ y: cur.y - drop, cost: 1 + drop * 0.5 })
            break
          }
        }
      }
      for (const c of candidates) {
        const k = key(nx, c.y, nz)
        const g = cur.g + c.cost
        if (seen.has(k) && seen.get(k) <= g) continue
        seen.set(k, g)
        const node = { x: nx, y: c.y, z: nz, g, parent: cur }
        node.f = g + h(node)
        open.push(node)
      }
    }
  }
  return null
}
module.exports = {
  toCoord: (world, start, target) =>
    findPath(world, start,
      n => n.x === Math.floor(target.x) && n.z === Math.floor(target.z) && Math.abs(n.y - target.y) <= 1,
      target),
  nearBlock: (world, start, blockPos) =>
    findPath(world, start,
      n => Math.abs(n.x - blockPos.x) + Math.abs(n.y - blockPos.y) + Math.abs(n.z - blockPos.z) <= 2,
      blockPos),
  nearEntity: (world, start, entityPos, reach = 2.5) =>
    findPath(world, start,
      n => ((n.x + 0.5 - entityPos.x) ** 2 + (n.y - entityPos.y) ** 2 + (n.z + 0.5 - entityPos.z) ** 2) <= reach * reach,
      entityPos),
  DANGER,
}
