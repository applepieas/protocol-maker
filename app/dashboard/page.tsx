import { PageWrapper } from "@/components/page-wrapper";

export default function Dashboard() {
  return (
    <PageWrapper
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Overview", href: "/dashboard" },
      ]}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your workspace.</p>
      </div>
    </PageWrapper>
  );
}