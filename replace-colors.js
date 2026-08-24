const fs = require('fs');
const path = require('path');

const replacers = [
  // Owner Sidebar
  {
    file: 'src/components/owner/owner-sidebar.tsx',
    replaces: [
      { from: /bg-\[#2A181B\]/g, to: 'bg-[#E53935]/10' },
      { from: /text-\[#D65A62\]/g, to: 'text-[#F05A56]' },
      { from: /bg-\[#8E232B\]/g, to: 'bg-[#E53935]' },
      { from: /bg-\[#1E2227\]/g, to: 'bg-[#20232A]' },
      { from: /bg-\[#20242A\]/g, to: 'bg-[#252831]' },
      { from: /border-\[#343A40\]/g, to: 'border-[#3A3E47]' },
    ]
  },
  // Owner Mobile Nav
  {
    file: 'src/components/owner/owner-mobile-nav.tsx',
    replaces: [
      { from: /bg-\[#2A181B\]/g, to: 'bg-[#E53935]/10' },
      { from: /text-\[#D65A62\]/g, to: 'text-[#F05A56]' },
      { from: /bg-\[#8E232B\]/g, to: 'bg-[#E53935]' },
      { from: /bg-\[#1E2227\]/g, to: 'bg-[#20232A]' },
      { from: /bg-\[#20242A\]/g, to: 'bg-[#252831]' },
      { from: /border-\[#343A40\]/g, to: 'border-[#3A3E47]' },
    ]
  },
  // Empty State
  {
    file: 'src/components/owner/empty-state.tsx',
    replaces: [
      { from: /bg-\[#1C2025\]/g, to: 'bg-[#20232A]' },
      { from: /bg-\[#20242A\]/g, to: 'bg-[#252831]' },
      { from: /border-\[#8E232B\]\/20/g, to: 'border-[#E53935]/20' },
      { from: /border-\[#8E232B\]\/10/g, to: 'border-[#E53935]/10' },
      { from: /bg-\[#8E232B\]/g, to: 'bg-[#E53935]' },
      { from: /hover:bg-\[#A52B34\]/g, to: 'hover:bg-[#F04440]' },
      { from: /border-\[#A52B34\]/g, to: 'border-[#F04440]' },
      { from: /shadow-\[0_2px_10px_-2px_rgba\(142,35,43,0\.3\)\]/g, to: 'shadow-[0_4px_15px_rgba(229,57,53,0.25)] hover:shadow-[0_6px_20px_rgba(229,57,53,0.35)]' },
      { from: /ring-\[#8E232B\]\/50/g, to: 'ring-[#E53935]/50' },
    ]
  },
  // Owner Dashboard Page
  {
    file: 'src/app/(dashboard)/owner/dashboard/page.tsx',
    replaces: [
      { from: /bg-\[#20242A\]/g, to: 'bg-[#252831]' },
      { from: /border-\[#343A40\]/g, to: 'border-[#3A3E47]' },
      { from: /bg-\[#1C2025\]/g, to: 'bg-[#20232A]' },
      { from: /bg-\[#8E232B\]/g, to: 'bg-[#E53935]' },
      { from: /text-\[#D65A62\]/g, to: 'text-[#E53935]' },
      { from: /bg-\[#1B1F23\]/g, to: 'bg-[#20232A]' },
      { from: /hover:bg-\[#262B31\]/g, to: 'hover:bg-[#2A2C36]' },
      { from: /hover:border-\[#8E232B\]\/50/g, to: 'hover:border-[#E53935]/45' },
      { from: /<DashboardStatCard[\s\S]*?คิววันนี้[\s\S]*?\/>/, to: `<DashboardStatCard \n          title="คิววันนี้" \n          value="0" \n          subtitle="ยังไม่มีข้อมูลคิว" \n          icon={<CalendarDays className="h-5 w-5" />} \n          type="appointments"\n        />` },
      { from: /<DashboardStatCard[\s\S]*?คำขอจองใหม่[\s\S]*?\/>/, to: `<DashboardStatCard \n          title="คำขอจองใหม่" \n          value="0" \n          subtitle="ยังไม่มีคำขอใหม่" \n          icon={<Inbox className="h-5 w-5" />} \n          type="requests"\n        />` },
      { from: /<DashboardStatCard[\s\S]*?ช่างที่มีงานวันนี้[\s\S]*?\/>/, to: `<DashboardStatCard \n          title="ช่างที่มีงานวันนี้" \n          value="0" \n          subtitle="ระบบช่างจะเพิ่มในขั้นตอนถัดไป" \n          icon={<Users className="h-5 w-5" />} \n          type="artists"\n        />` },
      { from: /<DashboardStatCard[\s\S]*?รายได้วันนี้[\s\S]*?\/>/, to: `<DashboardStatCard \n          title="รายได้วันนี้" \n          value="฿0" \n          subtitle="ระบบการเงินจะเพิ่มในภายหลัง" \n          icon={<Wallet className="h-5 w-5" />} \n          type="revenue"\n        />` },
    ]
  },
  // Login Page
  {
    file: 'src/app/(auth)/login/page.tsx',
    replaces: [
      { from: /bg-\[#20242A\]\/95/g, to: 'bg-[#252831]/95' },
      { from: /border-\[#343A40\]/g, to: 'border-[#3A3E47]' },
      { from: /border-t-\[#8E232B\]/g, to: 'border-t-[#E53935]' },
      { from: /bg-\[#2A181B\]/g, to: 'bg-[#E53935]/10' },
      { from: /border-\[#6F1D24\]/g, to: 'border-[#E53935]/30' },
      { from: /text-\[#D65A62\]/g, to: 'text-[#E53935]' },
      { from: /bg-\[#181C20\]/g, to: 'bg-[#20232A]' },
      { from: /ring-\[#8E232B\]/g, to: 'ring-[#E53935]' },
      { from: /border-\[#8E232B\]/g, to: 'border-[#E53935]' },
      { from: /bg-\[#8E232B\]/g, to: 'bg-[#E53935]' },
      { from: /hover:bg-\[#A52B34\]/g, to: 'hover:bg-[#F04440]' },
      { from: /border-\[#A52B34\]/g, to: 'border-[#F04440]' },
      { from: /shadow-\[0_2px_10px_-2px_rgba\(142,35,43,0\.4\)\]/g, to: 'shadow-[0_4px_15px_rgba(229,57,53,0.25)] hover:shadow-[0_6px_20px_rgba(229,57,53,0.35)]' },
    ]
  },
  // Register Page
  {
    file: 'src/app/(auth)/register/page.tsx',
    replaces: [
      { from: /bg-\[#20242A\]\/95/g, to: 'bg-[#252831]/95' },
      { from: /border-\[#343A40\]/g, to: 'border-[#3A3E47]' },
      { from: /border-t-\[#8E232B\]/g, to: 'border-t-[#E53935]' },
      { from: /bg-\[#2A181B\]/g, to: 'bg-[#E53935]/10' },
      { from: /border-\[#6F1D24\]/g, to: 'border-[#E53935]/30' },
      { from: /text-\[#D65A62\]/g, to: 'text-[#E53935]' },
      { from: /bg-\[#181C20\]/g, to: 'bg-[#20232A]' },
      { from: /ring-\[#8E232B\]/g, to: 'ring-[#E53935]' },
      { from: /border-\[#8E232B\]/g, to: 'border-[#E53935]' },
      { from: /bg-\[#8E232B\]/g, to: 'bg-[#E53935]' },
      { from: /hover:bg-\[#A52B34\]/g, to: 'hover:bg-[#F04440]' },
      { from: /border-\[#A52B34\]/g, to: 'border-[#F04440]' },
      { from: /shadow-\[0_2px_10px_-2px_rgba\(142,35,43,0\.4\)\]/g, to: 'shadow-[0_4px_15px_rgba(229,57,53,0.25)] hover:shadow-[0_6px_20px_rgba(229,57,53,0.35)]' },
    ]
  }
];

replacers.forEach(r => {
  const f = path.join(__dirname, r.file);
  let c = fs.readFileSync(f, 'utf8');
  r.replaces.forEach(rep => {
    c = c.replace(rep.from, rep.to);
  });
  fs.writeFileSync(f, c);
  console.log('Replaced in ' + r.file);
});
