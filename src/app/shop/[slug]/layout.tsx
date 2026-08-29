import { requireCustomer } from '@/lib/auth/customer'

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await requireCustomer(slug)

  return <>{children}</>
}
