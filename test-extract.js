const extract = require('extract-zip');
const path = require('path');
const fs = require('fs');

const zipPath = 'C:\\Users\\Jaymi\\AppData\\Local\\electron\\Cache\\41a5d68646d956d50e13830e121ea0b3d6ab378b6a0ce422aefc1ff214707879\\electron-v39.8.10-win32-x64.zip';
const dest = path.join(__dirname, 'test-extract');

if (!fs.existsSync(dest)) fs.mkdirSync(dest);

console.log('Starting extraction...');
extract(zipPath, { dir: dest })
  .then(() => console.log('Success!'))
  .catch(err => console.error('Failure:', err));
