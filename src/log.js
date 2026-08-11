const fs = require('fs')
const config = require('./config')
const stream = fs.createWriteStream('packets.log', { flags: 'a' })
const ts = () => new Date().toISOString()
module.exports = {
  info: (...a) => console.log(ts(), '[bot]', ...a),
  warn: (...a) => console.warn(ts(), '[bot]', ...a),
  // One line per packet, timestamped — cross-reference against the server
  // console log if another player ever gets kicked during testing.
  packet: (dir, name, note = '') => {
    const line = `${ts()} ${dir} ${name}${note ? ' ' + note : ''}`
    stream.write(line + '\n')
    if (config.logPacketsToConsole) console.log(line)
  },
}
