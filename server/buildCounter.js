const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const counterPath = path.join(dataDir, 'build-counter.json');

function readCounter() {
  try {
    if (!fs.existsSync(counterPath)) return 0;
    const data = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
    return Number(data.build) || 0;
  } catch {
    return 0;
  }
}

function writeCounter(build) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(counterPath, JSON.stringify({ build }, null, 2), 'utf8');
}

function bumpBuildCounter() {
  const next = readCounter() + 1;
  writeCounter(next);
  return next;
}

function getBuildCounter() {
  return readCounter();
}

module.exports = {
  bumpBuildCounter,
  getBuildCounter,
};
