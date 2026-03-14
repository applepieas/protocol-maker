import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const projects = [
  {
    id: "electrolyte-curve",
    title: "VA charakteristika elektrolytu",
    lastEdited: "Naposledy upraveno: před 2 hodinami",
  },
  {
    id: "conductivity-lab",
    title: "Měření vodivosti roztoku",
    lastEdited: "Naposledy upraveno: včera",
  },
  {
    id: "thermal-resistance",
    title: "Tepelný odpor vzorku",
    lastEdited: "Naposledy upraveno: před 3 dny",
  },
  {
    id: "battery-cycle",
    title: "Cyklické zatížení článku",
    lastEdited: "Naposledy upraveno: před týdnem",
  },
];

export default function Dashboard() {
  return (
    <PageWrapper
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Overview", href: "/dashboard" },
      ]}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your workspace.</p>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Link href="/new-protocol" className="block h-full">
          <Card className="h-full bg-blue-50 ring-blue-200 hover:bg-blue-100">
            <CardHeader className="sr-only">
              <CardTitle>New Protocol</CardTitle>
              <CardDescription>Create a new protocol.</CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3">
              <PlusIcon className="size-14 text-blue-700" aria-hidden="true" />
              <p className="font-medium text-blue-900">Start new protocol</p>
            </CardContent>
          </Card>
        </Link>

        {projects.map((project) => (
          <Link key={project.id} href="/dashboard/project" className="block h-full">
            <Card className="h-full hover:bg-muted/30">
              <CardContent>
                <div className="relative h-36 overflow-hidden rounded-md border bg-muted">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] bg-size-[14px_14px] opacity-70" />
                  <div className="absolute inset-0 bg-linear-to-br from-transparent via-background/20 to-transparent" />
                </div>
              </CardContent>
              <CardHeader>
                <CardTitle>{project.title}</CardTitle>
                <CardDescription>{project.lastEdited}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}