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
      if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(srcDir);

const replacements = [
  // Backgrounds
  { from: /bg-\[\#0B0B0B\]/g, to: 'bg-[#050505]' },
  { from: /bg-\[\#101010\]/g, to: 'bg-[#0B0B0B]' },
  { from: /bg-\[\#151515\]/g, to: 'bg-[#111111]' },
  
  // Surfaces / Cards
  { from: /bg-\[\#181818\]/g, to: 'bg-[#141414]' },
  { from: /bg-\[\#1E1E1E\]/g, to: 'bg-[#181818]' },
  
  // Borders
  { from: /border-\[\#3A3A3A\]/g, to: 'border-[#303030]' },
  
  // Texts
  { from: /text-neutral-500/g, to: 'text-[#9EA4AA]' },
  { from: /text-neutral-400/g, to: 'text-[#BFC3C9]' },
  { from: /text-neutral-300/g, to: 'text-[#D8DDE3]' },
  { from: /text-white/g, to: 'text-[#F5F5F5]' },
  { from: /text-neutral-200/g, to: 'text-[#F5F5F5]' },
  
  // Accents (Replace Amber with Silver/Gray)
  { from: /text-amber-500\/70/g, to: 'text-[#AEB6BF]' },
  { from: /text-amber-500/g, to: 'text-[#E8E8E8]' },
  { from: /text-amber-400/g, to: 'text-[#D8DDE3]' },
  { from: /bg-amber-500/g, to: 'bg-[#E8E8E8]' },
  
  // Buttons
  { from: /bg-amber-600 hover:bg-amber-500/g, to: 'bg-[#181818] hover:bg-[#1D1D1D] border border-[#303030] text-[#F5F5F5]' },
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  // Specific replacements for Logo Integration
  if (file.endsWith('owner-sidebar.tsx')) {
    if (!newContent.includes('import { BrandLogo }')) {
      newContent = newContent.replace("import { LogOut", "import { BrandLogo } from '@/components/brand-logo'\nimport { LogOut");
      newContent = newContent.replace(
        /<div className="flex items-center h-16 flex-shrink-0 px-6 border-b border-\[\#2A2A2A\]">[\s\S]*?<\/div>\s*<div className="px-6 py-4">\s*<p.*?<\/p>\s*<\/div>/,
        `<div className="flex items-center h-20 flex-shrink-0 px-6 border-b border-[#2A2A2A]">\n          <BrandLogo />\n        </div>`
      );
    }
  }

  if (file.endsWith('owner-mobile-nav.tsx')) {
    if (!newContent.includes('import { BrandLogo }')) {
      newContent = newContent.replace("import { Menu", "import { BrandLogo } from '@/components/brand-logo'\nimport { Menu");
      newContent = newContent.replace(
        /<div className="text-lg font-light tracking-widest text-\[\#E8E8E8\]">157 TATTOO<\/div>/,
        `<BrandLogo showText={false} />`
      );
      // Drawer top
      newContent = newContent.replace(
        /<h1 className="text-xl font-light tracking-widest text-\[\#E8E8E8\]">157 TATTOO<\/h1>/,
        `<BrandLogo />`
      );
    }
  }

  if (file.endsWith('login\\page.tsx') || file.endsWith('register\\page.tsx')) {
    if (!newContent.includes('import { BrandLogo }')) {
      newContent = newContent.replace("import Link", "import { BrandLogo } from '@/components/brand-logo'\nimport Link");
      
      // Look for the "157 TATTOO" header
      if (newContent.includes('<h1 className="text-3xl font-light text-[#F5F5F5] tracking-widest">')) {
         newContent = newContent.replace(
           /<h1 className="text-3xl font-light text-\[\#F5F5F5\] tracking-widest">\s*157 TATTOO\s*<\/h1>/,
           `<div className="flex justify-center"><BrandLogo className="scale-125" /></div>`
         );
      } else if (newContent.includes('157 TATTOO')) {
        // Fallback for register page if it doesn't match exactly
        newContent = newContent.replace(
           /<h1 className="text-3xl font-light text-white tracking-widest mb-2">\s*157 TATTOO\s*<\/h1>/,
           `<div className="flex justify-center mb-4"><BrandLogo className="scale-125" /></div>`
         );
      }
    }
  }

  replacements.forEach(r => {
    newContent = newContent.replace(r.from, r.to);
  });
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log(`Updated: ${file}`);
  }
});
