const fs = require('fs');
const path = require('path');

const replaceColors = (content) => {
  return content
    .replace(/bg-neutral-950/g, 'bg-[#0A0A0A]')
    .replace(/bg-neutral-900\/30/g, 'bg-[#171717]/30')
    .replace(/bg-neutral-900/g, 'bg-[#121212]')
    .replace(/bg-neutral-800/g, 'bg-[#262626]')
    .replace(/bg-neutral-700/g, 'bg-[#404040]')
    .replace(/bg-neutral-100/g, 'bg-[#F5F5F5]')
    
    .replace(/text-neutral-100/g, 'text-[#F5F5F5]')
    .replace(/text-neutral-400/g, 'text-[#A3A3A3]')
    .replace(/text-neutral-500/g, 'text-[#737373]')
    .replace(/text-neutral-600/g, 'text-[#737373]')
    .replace(/text-neutral-900/g, 'text-[#0A0A0A]')
    
    .replace(/border-neutral-900/g, 'border-[#121212]')
    .replace(/border-neutral-800/g, 'border-[#262626]')
    .replace(/border-neutral-700/g, 'border-[#404040]')
    .replace(/border-neutral-600/g, 'border-[#737373]')
    
    .replace(/ring-neutral-800/g, 'ring-[#262626]')
    .replace(/ring-neutral-700/g, 'ring-[#404040]')
    
    .replace(/placeholder-neutral-500/g, 'placeholder-[#737373]')
    .replace(/placeholder-neutral-600/g, 'placeholder-[#737373]')
    
    .replace(/hover:bg-neutral-800/g, 'hover:bg-[#262626]')
    .replace(/hover:bg-neutral-900/g, 'hover:bg-[#121212]')
    .replace(/hover:text-neutral-300/g, 'hover:text-[#F5F5F5]')
    .replace(/hover:border-neutral-600/g, 'hover:border-[#737373]')
    
    .replace(/focus:border-neutral-500/g, 'focus:border-[#737373]')
    .replace(/focus:ring-neutral-500/g, 'focus:ring-[#737373]')
    
    .replace(/amber-/g, 'neutral-')
    .replace(/yellow-/g, 'neutral-');
};

const processDir = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const newContent = replaceColors(content);
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log('Updated: ' + fullPath);
      }
    }
  }
};

processDir('src/components/booking');
processDir('src/app/book');
