"use client";

import { useState } from "react";
import { TriangleAlertIcon, UploadIcon } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface ProtocolFormState {
  title: string;
  zadani: string;
  postup: string;
  pomucky: string;
  files: File[];
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [streamedOutput, setStreamedOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileNames = formState.files.map((file) => file.name);

  const onFileSelection = (files: FileList | null) => {
    if (!files) {
      return;
    }

    const selectedFiles = Array.from(files);
    setFormState((previous) => ({
      ...previous,
      files: selectedFiles,
    }));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErrorMessage(null);
    setStreamedOutput("");
    setIsSubmitting(true);

    const supabase = createClient();

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Unauthorized");
      }

      if (!formState.title || !formState.zadani || !formState.postup || !formState.pomucky) {
        throw new Error("Vyplňte prosím všechna povinná textová pole.");
      }

      const { data: createdProtocol, error: createProtocolError } = await supabase
        .from("protocols")
        .insert({
          user_id: user.id,
          title: formState.title,
          zadani: formState.zadani,
          postup: formState.postup,
          pomucky: formState.pomucky,
          status: "draft",
        })
        .select("id")
        .single();

      if (createProtocolError || !createdProtocol?.id) {
        throw new Error(createProtocolError?.message || "Nepodařilo se vytvořit protokol.");
      }

      const protocolId = createdProtocol.id;

      const filePaths: string[] = [];

      for (const file of formState.files) {
        const path = `${user.id}/${protocolId}/${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("protocol-uploads")
          .upload(path, file);

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        filePaths.push(path);
      }

      if (filePaths.length > 0) {
        const { error: fileRowsError } = await supabase.from("protocol_files").insert(
          filePaths.map((path) => ({
            protocol_id: protocolId,
            storage_path: path,
            file_type: path.split(".").pop() ?? null,
          }))
        );

        if (fileRowsError) {
          throw new Error(fileRowsError.message);
        }
      }

      const response = await fetch("/api/generate-protocol", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocolId,
          title: formState.title,
          zadani: formState.zadani,
          postup: formState.postup,
          pomucky: formState.pomucky,
          filePaths,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const message =
          errorPayload && typeof errorPayload.error === "string"
            ? errorPayload.error
            : "Generování protokolu selhalo.";
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("Server nevrátil stream odpovědi.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();

          if (!line.startsWith("data:")) {
            continue;
          }

          const payload = line.replace(/^data:\s*/, "");
          if (!payload || payload === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(payload);
            const token = parsed?.choices?.[0]?.delta?.content;
            if (typeof token === "string") {
              setStreamedOutput((previous) => previous + token);
            }
          } catch {
            // Ignore malformed SSE lines from partial chunks.
          }
        }
      }

      setFormState(initialFormState);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Generování protokolu selhalo neznámou chybou."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageWrapper
      scrollable
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
              {fileNames.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                  {fileNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : null}
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

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Chyba</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          {streamedOutput ? (
            <Field>
              <FieldLabel>Živý výstup generování</FieldLabel>
              <Textarea
                readOnly
                rows={10}
                value={streamedOutput}
                className="font-mono text-xs"
              />
            </Field>
          ) : null}

          <Button type="submit" className="w-full py-5" disabled={isSubmitting}>
            {isSubmitting ? "Generuji protokol..." : "Generovat protokol"}
          </Button>
        </form>
      </div>
    </PageWrapper>
  );
}