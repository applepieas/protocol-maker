import { PageWrapper } from "@/components/page-wrapper";
import TextEditor from "@/components/text-editor";

export default function ProjectPage() {
  return (
    <PageWrapper>
      <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border bg-background">
        <TextEditor />
      </div>
    </PageWrapper>
  );
}
