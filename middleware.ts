export { default } from 'next-auth/middleware'

export const config = {
  matcher: ['/dashboard/:path*', '/api/data/:path*', '/api/export/:path*'],
}
