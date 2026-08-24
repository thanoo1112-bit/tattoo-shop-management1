export function calculateTattooEstimate(widthCm: string, heightCm: string) {
  const widthVal = parseFloat(widthCm) || 0;
  const heightVal = parseFloat(heightCm) || 0;
  
  const area = (widthVal > 0 && heightVal > 0) ? widthVal * heightVal : 0;
  const maxDimension = Math.max(widthVal, heightVal);

  let sizeCategory = '';

  if (area > 0) {
    if (maxDimension <= 5 && area <= 25) {
      sizeCategory = 'จิ๋ว';
    } else if (maxDimension <= 10 && area <= 75) {
      sizeCategory = 'เล็ก';
    } else if (maxDimension <= 15 && area <= 150) {
      sizeCategory = 'กลาง';
    } else if (maxDimension <= 25 && area <= 350) {
      sizeCategory = 'ใหญ่';
    } else {
      sizeCategory = 'ใหญ่มาก';
    }
  }

  return {
    area,
    maxDimension,
    sizeCategory
  };
}

export function getSizeBasedBookingBuffer(sizeCategory: string): number {
  switch (sizeCategory) {
    case 'จิ๋ว': return 2;
    case 'เล็ก': return 3;
    case 'กลาง': return 4;
    case 'ใหญ่': return 6;
    case 'ใหญ่มาก': return 8;
    default: return 2;
  }
}

export function getLatestPreferredStartTime(sizeCategory: string, closingTimeDecimal: number = 23.5): number {
  const bufferHours = getSizeBasedBookingBuffer(sizeCategory);
  return closingTimeDecimal - bufferHours;
}
