"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
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
import { Button } from "@/components/ui/button";

interface PageWrapperProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href: string }[];
  scrollable?: boolean;
}

export function PageWrapper({
  children,
  breadcrumbs = [],
  scrollable = false,
}: Readonly<PageWrapperProps>) {
  const router = useRouter();
  const lastIndex = breadcrumbs.length - 1;

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        {breadcrumbs.length > 0 ? (
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
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          <Separator orientation="vertical" className="h-4" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="h-8 gap-2 px-2 text-muted-foreground hover:text-foreground"
          >
            <LogOutIcon className="size-4" />
            <span className="hidden sm:inline">Odhlásit se</span>
          </Button>
        </div>
      </header>
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col p-4 ${scrollable ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden"
          }`}
      >
        {children}
      </div>
    </div>
  );
}