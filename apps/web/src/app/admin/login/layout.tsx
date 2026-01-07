export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No auth check - this is the login page
  return <>{children}</>
}
