"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlertIcon, UploadIcon, XIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageWrapper } from "@/components/page-wrapper";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface ProtocolFormState {
  title: string;
  zadani: string;
  postup: string;
  pomucky: string;
}

const initialFormState: ProtocolFormState = {
  title: "",
  zadani: "",
  postup: "",
  pomucky: "",
};

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".jpg", ".jpeg", ".png", ".docx"];
const ACCEPTED_INPUT = ACCEPTED_EXTENSIONS.join(",");

type SubmitPhase = "idle" | "uploading" | "redirecting";

function isAcceptedFile(file: File) {
  const fileName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

export default function NewProtocolPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formState, setFormState] = useState<ProtocolFormState>(initialFormState);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [uploadIndex, setUploadIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSubmitting = submitPhase !== "idle";

  const submitLabel = useMemo(() => {
    if (submitPhase === "redirecting") {
      return "Přesměrovávám...";
    }

    if (submitPhase === "uploading" && uploadIndex !== null) {
      return `Nahrávám soubor ${uploadIndex} z ${selectedFiles.length}...`;
    }

    return "Generovat protokol";
  }, [selectedFiles.length, submitPhase, uploadIndex]);

  const addFiles = (files: FileList | File[]) => {
    const incomingFiles = Array.from(files);
    const invalidFile = incomingFiles.find((file) => !isAcceptedFile(file));

    if (invalidFile) {
      setErrorMessage(
        `Soubor ${invalidFile.name} není podporovaný. Použijte ${ACCEPTED_EXTENSIONS.join(", ")}.`
      );
      return;
    }

    setErrorMessage(null);
    setSelectedFiles((previous) => {
      const nextFiles = [...previous];
      for (const file of incomingFiles) {
        const alreadyExists = nextFiles.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (!alreadyExists) {
          nextFiles.push(file);
        }
      }
      return nextFiles;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErrorMessage(null);

    if (!formState.title || !formState.zadani || !formState.postup || !formState.pomucky) {
      setErrorMessage("Vyplňte prosím všechna povinná textová pole.");
      return;
    }

    const supabase = createClient();

    setSubmitPhase("uploading");
    setUploadIndex(selectedFiles.length > 0 ? 1 : null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Not authenticated");
      }

      const { data: createdProtocol, error: createError } = await supabase
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

      if (createError || !createdProtocol?.id) {
        throw new Error(createError?.message || "Nepodařilo se vytvořit protokol.");
      }

      const protocolId = createdProtocol.id;
      const uploadedPaths: string[] = [];

      for (const [index, file] of selectedFiles.entries()) {
        setUploadIndex(index + 1);

        const path = `${user.id}/${protocolId}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("protocol-uploads")
          .upload(path, file);

        if (uploadError) {
          throw uploadError;
        }

        uploadedPaths.push(path);

        const { error: fileInsertError } = await supabase.from("protocol_files").insert({
          protocol_id: protocolId,
          storage_path: path,
          file_type: file.type || file.name.split(".").pop() || null,
        });

        if (fileInsertError) {
          throw fileInsertError;
        }
      }

      setSubmitPhase("redirecting");
      setUploadIndex(null);

      const params = new URLSearchParams({
        title: formState.title,
        zadani: formState.zadani,
        postup: formState.postup,
        pomucky: formState.pomucky,
        filePaths: JSON.stringify(uploadedPaths),
      });

      setFormState(initialFormState);
      setSelectedFiles([]);
      router.push(`/editor/${protocolId}?${params.toString()}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nastala chyba");
      setSubmitPhase("idle");
      setUploadIndex(null);
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

        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
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
                disabled={isSubmitting}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="data-soubory">Data / měření / fotografie</FieldLabel>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!isSubmitting) {
                    fileInputRef.current?.click();
                  }
                }}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !isSubmitting) {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (!isSubmitting) {
                    setIsDragActive(true);
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isSubmitting) {
                    setIsDragActive(true);
                  }
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  const currentTarget = event.currentTarget;
                  const relatedTarget = event.relatedTarget;
                  if (!relatedTarget || !currentTarget.contains(relatedTarget as Node)) {
                    setIsDragActive(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                  if (!isSubmitting) {
                    addFiles(event.dataTransfer.files);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background p-8 text-center transition-colors",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-primary/50 hover:bg-accent/40",
                  isSubmitting && "cursor-not-allowed opacity-70"
                )}
                aria-disabled={isSubmitting}
              >
                <UploadIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                <p>Přetáhněte soubory sem nebo klikněte pro výběr</p>
                <p className="text-sm text-muted-foreground">
                  Podporované formáty: XLSX, XLS, CSV, JPG, JPEG, PNG, DOCX
                </p>
              </div>
              <input
                ref={fileInputRef}
                id="data-soubory"
                type="file"
                multiple
                accept={ACCEPTED_INPUT}
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    addFiles(event.target.files);
                  }
                  event.target.value = "";
                }}
                disabled={isSubmitting}
              />
              <FieldDescription>
                Vybrané soubory se nahrají do úložiště před spuštěním generování.
              </FieldDescription>

              {selectedFiles.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {selectedFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.lastModified}-${file.size}`}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
                    >
                      <span className="truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() =>
                          setSelectedFiles((previous) =>
                            previous.filter(
                              (candidate) =>
                                !(
                                  candidate.name === file.name &&
                                  candidate.size === file.size &&
                                  candidate.lastModified === file.lastModified
                                )
                            )
                          )
                        }
                        disabled={isSubmitting}
                      >
                        <XIcon aria-hidden="true" />
                        <span className="sr-only">Odebrat soubor {file.name}</span>
                      </Button>
                    </div>
                  ))}
                </div>
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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

          <Button type="submit" className="w-full py-5" disabled={isSubmitting}>
            {submitLabel}
          </Button>
        </form>
      </div>
    </PageWrapper>
  );
}
