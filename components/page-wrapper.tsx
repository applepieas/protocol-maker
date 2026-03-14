import { Fragment } from "react";
import Link from "next/link";

import { AppSidebar } from "@/components/app-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface PageWrapperProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href: string }[];
}

export function PageWrapper({
  children,
  breadcrumbs = [],
}: Readonly<PageWrapperProps>) {
  const lastIndex = breadcrumbs.length - 1;

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          {breadcrumbs.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((item, index) => (
                    <Fragment key={`${item.href}-${item.label}`}>
                      <BreadcrumbItem>
                        {index === lastIndex ? (
                          <BreadcrumbPage>{item.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link href={item.href}>{item.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {index < lastIndex ? <BreadcrumbSeparator /> : null}
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </>
          ) : null}
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}