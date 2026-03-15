import { LogoIcon } from '@/components/logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card size="sm" className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/50">
            <LogoIcon uniColor className="size-6" />
          </div>
          <CardTitle>Protocol Maker</CardTitle>
          <CardDescription>Přihlášení a správa účtu</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}