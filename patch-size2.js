const fs = require('fs');

// BookingSummaryFlow.tsx
let file4 = 'src/components/booking/BookingSummaryFlow.tsx';
let code4 = fs.readFileSync(file4, 'utf8');
const target4 = `<span className="text-[#F5F5F5] text-right">{formData.widthCm} × {formData.heightCm} cm · ขนาด{sizeCategory}</span>`;
const replacement4 = `<span className="text-[#F5F5F5] sm:text-right">กว้าง {formData.widthCm} ซม. × สูง {formData.heightCm} ซม.</span>`;
code4 = code4.replace(target4, replacement4);
fs.writeFileSync(file4, code4);

// BookingDetailsFlow.tsx
let file5 = 'src/components/booking/BookingDetailsFlow.tsx';
let code5 = fs.readFileSync(file5, 'utf8');
const target5 = `{formData.widthCm} × {formData.heightCm} cm · พื้นที่ประมาณ {area} cm²`;
const replacement5 = `กว้าง {formData.widthCm} ซม. × สูง {formData.heightCm} ซม. · พื้นที่ประมาณ {area} cm²`;
code5 = code5.replace(target5, replacement5);
fs.writeFileSync(file5, code5);
