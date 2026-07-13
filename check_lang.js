const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) walkDir(dirPath, callback);
    else callback(dirPath);
  });
}

let errors = false;
walkDir('./src', (filePath) => {
  if (filePath.endsWith('.tsx')) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('language ===') || content.includes('language ==')) {
      // Check if useLanguage is used
      if (!content.includes('useLanguage')) {
        console.log(`Missing useLanguage in: ${filePath}`);
        errors = true;
      }
    }
  }
});
if (!errors) console.log("No missing useLanguage imports found.");
