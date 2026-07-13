import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - /api/tools/* (tool gateway — called by voice agent without session cookies)
     * - /api/auth/*  (OAuth callbacks)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|api/tools/|api/workflow/|api/auth/|api/real-estate/|api/knowledge-base/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
