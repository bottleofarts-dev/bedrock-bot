require('dotenv').config()
const num  = (k, d) => process.env[k] === undefined ? d : Number(process.env[k])
const bool = (k, d) => process.env[k] === undefined ? d : process.env[k] === 'true'
const list = (k, d) => process.env[k] ? process.env[k].split(',').map(s => s.trim()) : d
const config = {
  host: process.env.SERVER_HOST,
  port: num('SERVER_PORT', 19132),
  username: process.env.BOT_USERNAME || 'MinerBot',
  offline: bool('OFFLINE_MODE', false),
  version: process.env.MC_PROTOCOL_VERSION,
  chunkRadius: num('CHUNK_RADIUS', 6),
  scanMinY: num('SCAN_MIN_Y', -60),
  scanMaxY: num('SCAN_MAX_Y', 100),
  wantedBlocks: list('MINING_TARGETS', ['minecraft:iron_ore', 'minecraft:oak_log']),
  breakMsDefault: num('BREAK_MS_DEFAULT', 1600),
  combatEnabled: bool('COMBAT_ENABLED', true),
  combatRadius: num('COMBAT_RADIUS', 12),
  fleeHealth: num('FLEE_HEALTH', 8),
  maxPacketsPerSecond: num('MAX_PACKETS_PER_SECOND', 40),
  reconnectDelayMs: num('RECONNECT_DELAY_MS', 10000),
  logPacketsToConsole: bool('LOG_PACKETS_TO_CONSOLE', false),
}
if (!config.host) throw new Error('SERVER_HOST is required')
if (!config.version) {
  throw new Error('MC_PROTOCOL_VERSION is required. Run npm run ping and set it explicitly — auto-detection is disabled by design.')
}
module.exports = config
