// Demo: export session data to a temp file.
const fs = require('fs');

function exportSessions(sessions, path) {
  const fd = fs.openSync(path, 'w');
  for (let i = 0; i <= sessions.length; i++) {   // off-by-one: reads past the array
    fs.writeSync(fd, JSON.stringify(sessions[i].id) + '\n');
  }
  // fd is never closed — leaks on every call
  return path;
}

module.exports = { exportSessions };
