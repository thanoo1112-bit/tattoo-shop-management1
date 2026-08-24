'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export function ArtistRouteGuard({ 
  isComplete, 
  children 
}: { 
  isComplete: boolean
  children: React.ReactNode 
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const isOnboardingPage = pathname === '/artist/onboarding'

    if (!isComplete && !isOnboardingPage) {
      router.replace('/artist/onboarding')
    } else if (isComplete && isOnboardingPage) {
      router.replace('/artist/dashboard')
    } else {
      setIsReady(true)
    }
  }, [isComplete, pathname, router])

  if (!isReady) return null

  return <>{children}</>
}