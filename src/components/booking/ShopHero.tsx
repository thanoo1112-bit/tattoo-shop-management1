export default function ShopHero({ shopName }: { shopName: string }) {
  return (
    <div className="text-center md:text-left pt-6 md:pt-10 pb-8 md:pb-12">
      <h1 className="text-3xl md:text-[40px] font-bold tracking-tight text-[#F5F5F5] mb-4 md:mb-6">
        จองคิวสักกับเรา
      </h1>
      <p className="text-[#A3A3A3] text-sm md:text-base max-w-[600px] mx-auto md:mx-0 leading-relaxed md:leading-loose">
        เลือกช่างสักที่คุณต้องการ จากนั้นเลือกวันและเวลาที่ช่างเปิดรับคิว
      </p>
    </div>
  );
}
