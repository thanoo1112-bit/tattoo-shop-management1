export interface PortfolioItem {
  id: string
  name: string
  style: string
  artist: string
  image: string
  concept: string
  placement: string
  size: string
}

export interface Artist {
  id: string
  name: string
  specialties: string[]
  avatar: string
}

export const mockPortfolio: PortfolioItem[] = [
  {
    id: 'p1',
    name: 'BOTANICAL FLOW',
    style: 'Fine Line',
    artist: 'A-KEE',
    image: 'https://images.unsplash.com/photo-1549490349-8643362247b5?w=500&auto=format&fit=crop&q=80',
    concept: 'การออกแบบลายใบเฟิร์นและใบไม้อื่นๆ ที่มีความพริ้วไหวไปกับความโค้งมนของสรีระร่างกาย ลายเส้นบางคมกริบ',
    placement: 'ไหปลาร้า / ข้างลำตัว',
    size: '8 × 15 ซม.'
  },
  {
    id: 'p2',
    name: 'NOIR SERPENT',
    style: 'Blackwork',
    artist: 'TON',
    image: 'https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?w=500&auto=format&fit=crop&q=80',
    concept: 'งูพันรอบแขนลงเงาดำทึบสไตล์นีโอทราดิชันนอล ไล่เฉดเงาไล่โทนคมชัด ดุดันและมีมิติ',
    placement: 'ท่อนแขนด้านนอก',
    size: '10 × 20 ซม.'
  },
  {
    id: 'p3',
    name: 'MINIMAL WAVE',
    style: 'Minimal',
    artist: 'MIKI',
    image: 'https://images.unsplash.com/photo-1550537687-c91072c4792d?w=500&auto=format&fit=crop&q=80',
    concept: 'เกลียวคลื่นขนาดเล็กสไตล์มินิมอลสามระลอก เส้นบางสม่ำเสมอ เรียบง่าย ซ่อนความหมายส่วนตัว',
    placement: 'ข้อมือ / ข้อเท้า',
    size: '3 × 5 ซม.'
  },
  {
    id: 'p4',
    name: 'SIGIL PROTOCOL',
    style: 'Cyber Sigil',
    artist: 'A-KEE',
    image: 'https://images.unsplash.com/photo-1598136490941-30d885318abd?w=500&auto=format&fit=crop&q=80',
    concept: 'ลวดลายไซเบอร์ซิกิลทรงกราฟิกเหลี่ยมคมพาดผ่านผิวหนัง ผสานเทคโนโลยีดิจิทัลและจิตวิญญาณดิบเท่',
    placement: 'หลังคอ / กลางอก',
    size: '6 × 12 ซม.'
  },
  {
    id: 'p5',
    name: 'RYU ASCEND',
    style: 'Japanese',
    artist: 'TON',
    image: 'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=500&auto=format&fit=crop&q=80',
    concept: 'มังกรทะยานขึ้นฟ้าสไตล์ญี่ปุ่นดั้งเดิม ประดับดอกเบญจมาศและเมฆหมอกสีเทาดำดูลึกลับทรงพลัง',
    placement: 'เต็มแผ่นหลัง / ต้นขา',
    size: '20 × 35 ซม.'
  },
  {
    id: 'p6',
    name: 'FINE BLOOM',
    style: 'Fine Line',
    artist: 'MIKI',
    image: 'https://images.unsplash.com/photo-1568515045052-f9a854d70bfd?w=500&auto=format&fit=crop&q=80',
    concept: 'ดอกกุหลาบตูมและใบไม้พาดเส้นบางเบาแบบเกรย์วอช อ่อนโยนและสง่างาม',
    placement: 'ใต้กระดูกไหปลาร้า',
    size: '5 × 10 ซม.'
  }
]

export const mockArtists: Artist[] = [
  {
    id: 'a1',
    name: 'A-KEE',
    specialties: ['Fine Line', 'Blackwork'],
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'a2',
    name: 'TON',
    specialties: ['Blackwork', 'Japanese'],
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80'
  },
  {
    id: 'a3',
    name: 'MIKI',
    specialties: ['Fine Line', 'Botanical'],
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80'
  }
]
