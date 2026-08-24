const fs = require('fs');
let content = fs.readFileSync('src/components/booking/BookingDetailsFlow.tsx', 'utf8');

content = content.replace(/text-sm text-\[#A3A3A3\]/g, 'text-xs font-medium text-[#A3A3A3]');
content = content.replace(/text-\[13px\] md:text-sm text-\[#A3A3A3\]/g, 'text-xs font-medium text-[#A3A3A3]');
content = content.replace(/text-base font-medium text-\[#F5F5F5\]/g, 'text-sm font-medium text-[#F5F5F5]');

fs.writeFileSync('src/components/booking/BookingDetailsFlow.tsx', content, 'utf8');
