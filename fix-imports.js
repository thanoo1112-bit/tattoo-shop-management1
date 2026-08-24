const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(srcDir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  if (newContent.includes('tattoo-background')) {
    newContent = newContent.replace(/import \{ LogoWatermark \} from '@\/components\/tattoo-background'/g, '');
    newContent = newContent.replace(/<LogoWatermark[^>]*\/>/g, '');
    fs.writeFileSync(file, newContent);
    console.log('Fixed: ' + file);
  }
});
