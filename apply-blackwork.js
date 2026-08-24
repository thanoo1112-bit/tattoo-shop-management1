const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/app/(dashboard)/owner/layout.tsx',
  'src/app/(dashboard)/owner/dashboard/page.tsx',
  'src/app/(auth)/login/page.tsx',
  'src/app/(auth)/register/page.tsx',
  'src/components/owner/owner-sidebar.tsx',
  'src/components/owner/owner-topbar.tsx',
  'src/components/owner/owner-mobile-nav.tsx',
  'src/components/owner/empty-state.tsx',
  'src/components/owner/dashboard-stat-card.tsx'
];

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/bg-\[#171A1E\]/g, 'bg-[#0A0A0A]');
  content = content.replace(/bg-\[#121417\]/g, 'bg-[#121212]');
  content = content.replace(/bg-\[#1B1F23\]/g, 'bg-[#121212]');
  content = content.replace(/bg-\[#252831\]/g, 'bg-[#171717]');
  content = content.replace(/bg-\[#20232A\]/g, 'bg-[#262626]');
  content = content.replace(/border-\[#3A3E47\]/g, 'border-[#262626]');
  content = content.replace(/border-\[#2B3036\]/g, 'border-[#262626]');
  content = content.replace(/hover:bg-\[#2A2C36\]/g, 'hover:bg-[#262626]');

  content = content.replace(/bg-\[#E53935\]/g, 'bg-[#FFFFFF]');
  content = content.replace(/text-\[#E53935\]/g, 'text-[#FFFFFF]');
  content = content.replace(/border-\[#E53935\]/g, 'border-[#FFFFFF]');
  content = content.replace(/border-t-\[#E53935\]/g, 'border-t-[#FFFFFF]');
  
  content = content.replace(/bg-\[#E53935\]\/10/g, 'bg-[#FFFFFF]/10');
  content = content.replace(/border-\[#E53935\]\/20/g, 'border-[#FFFFFF]/20');
  content = content.replace(/border-\[#E53935\]\/10/g, 'border-[#FFFFFF]/10');
  content = content.replace(/border-\[#E53935\]\/30/g, 'border-[#FFFFFF]/30');
  content = content.replace(/text-\[#F05A56\]/g, 'text-[#FFFFFF]');
  content = content.replace(/hover:text-\[#F05A56\]/g, 'hover:text-[#FFFFFF]');
  content = content.replace(/hover:border-\[#E53935\]\/45/g, 'hover:border-[#FFFFFF]/50');
  content = content.replace(/ring-\[#E53935\]/g, 'ring-[#FFFFFF]');
  content = content.replace(/ring-\[#E53935\]\/50/g, 'ring-[#FFFFFF]/50');
  
  content = content.replace(/shadow-\[0_4px_15px_rgba\(229,57,53,0\.25\)\]/g, 'shadow-[0_4px_15px_rgba(255,255,255,0.15)]');
  content = content.replace(/hover:shadow-\[0_6px_20px_rgba\(229,57,53,0\.35\)\]/g, 'hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)]');
  
  content = content.replace(/hover:bg-\[#F04440\]/g, 'hover:bg-[#E5E5E5]');
  content = content.replace(/border-\[#F04440\]/g, 'border-[#E5E5E5]');
  
  if (file.includes('empty-state.tsx') || file.includes('login') || file.includes('register')) {
    content = content.replace(/text-\[#FFFFFF\]/g, 'text-black');
    // revert the one inside empty state title
    content = content.replace(/text-base font-medium text-black mb-2/g, 'text-base font-medium text-[#F3F3F3] mb-2');
  }

  // Restore the semantic colors that might have gotten messed up (they shouldn't have)
  // Revert button text color in login/register if needed...
  // In login/register, the input text was text-[#F3F3F3], only the button was text-[#FFFFFF]
  // Wait, the main text is text-[#F3F3F3]. So changing text-[#FFFFFF] to text-black is perfect for the buttons.

  fs.writeFileSync(filePath, content);
  console.log('Processed: ' + file);
});
