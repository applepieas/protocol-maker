"use client";

import { useState } from "react";
import { TriangleAlertIcon, UploadIcon } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface ProtocolFormState {
  title: string;
  zadani: string;
  postup: string;
  pomucky: string;
  files: string[];
}

const initialFormState: ProtocolFormState = {
  title: "",
  zadani: "",
  postup: "",
  pomucky: "",
  files: [],
};

export default function NewProtocolPage() {
  const [formState, setFormState] = useState<ProtocolFormState>(initialFormState);
  const [isDragActive, setIsDragActive] = useState(false);

  const onFileSelection = (files: FileList | null) => {
    if (!files) {
      return;
    }

    const names = Array.from(files).map((file) => file.name);
    setFormState((previous) => ({
      ...previous,
      files: names,
    }));
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("New protocol form state:", formState);
  };

  return (
    <PageWrapper
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Nový protokol", href: "/new-protocol" },
      ]}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-2">
        <h1 className="text-2xl font-semibold">Nový protokol</h1>

        <form className="flex flex-col gap-6" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nazev-pokusu">Název pokusu</FieldLabel>
              <Input
                id="nazev-pokusu"
                value={formState.title}
                onChange={(event) =>
                  setFormState((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                placeholder="např. VA charakteristika elektrolytu"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="data-soubory">Data / měření / fotografie</FieldLabel>
              <label
                htmlFor="data-soubory"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center",
                  isDragActive ? "border-primary bg-primary/5" : "border-input bg-background"
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                  onFileSelection(event.dataTransfer.files);
                }}
              >
                <UploadIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                <p>Přetáhněte soubory sem nebo klikněte pro výběr</p>
                <p className="text-sm text-muted-foreground">
                  Podporované formáty: CSV, XLSX, JPG, PNG, PDF
                </p>
                <input
                  id="data-soubory"
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.jpg,.jpeg,.png,.pdf,image/*"
                  className="sr-only"
                  onChange={(event) => onFileSelection(event.target.files)}
                />
              </label>
            </Field>
          </FieldGroup>

          <FieldSet>
            <FieldLegend variant="label">Popis experimentu</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="zadani">Zadání</FieldLabel>
                <Textarea
                  id="zadani"
                  rows={4}
                  placeholder="Popište zadání úlohy..."
                  value={formState.zadani}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      zadani: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="postup">Postup</FieldLabel>
                <Textarea
                  id="postup"
                  rows={4}
                  placeholder="Popište postup měření..."
                  value={formState.postup}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      postup: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="pomucky">Pomůcky</FieldLabel>
                <Textarea
                  id="pomucky"
                  rows={4}
                  placeholder="Seznam použitých pomůcek..."
                  value={formState.pomucky}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      pomucky: event.target.value,
                    }))
                  }
                />
              </Field>
            </FieldGroup>
          </FieldSet>

          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <TriangleAlertIcon className="text-amber-700" aria-hidden="true" />
            <AlertTitle>Upozornění</AlertTitle>
            <AlertDescription className="text-amber-900">
              Výsledky generované AI mohou obsahovat chyby. Pro nejlepší výsledky poskytněte
              co nejvíce detailů — přesné hodnoty, jednotky a postup měření.
            </AlertDescription>
          </Alert>

          <Button type="submit" className="w-full py-5">
            Generovat protokol
          </Button>
        </form>
      </div>
    </PageWrapper>
  );
}