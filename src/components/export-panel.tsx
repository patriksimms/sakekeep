import {
  AlertTriangleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileArchiveIcon,
  FileCheck2Icon,
  FileTextIcon,
  ImagesIcon,
  LoaderCircleIcon,
  PrinterIcon,
  XCircleIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog.tsx"
import { Badge } from "#/components/ui/badge.tsx"
import { Button } from "#/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field.tsx"
import { Switch } from "#/components/ui/switch.tsx"
import { type ExportArtifact, type Project } from "#/domain/types.ts"
import { pageSpecification } from "#/domain/page-format.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import { projectApi } from "#/lib/api.ts"

export function ExportPanel({
  project,
  bookBusy = false,
}: {
  project: Project
  bookBusy?: boolean
}) {
  const specification = pageSpecification(project.pageFormat, project.pageOrientation)
  const [marks, setMarks] = useState(false)
  const [allowBlockingProblems, setAllowBlockingProblems] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [artifact, setArtifact] = useState<ExportArtifact | null>(null)
  const blocking =
    project.book?.pages.flatMap((page) => page.problems.filter((problem) => problem.blocking))
      .length ?? 0
  const ready =
    project.bookStatus === "current" &&
    Boolean(project.book) &&
    (blocking === 0 || allowBlockingProblems) &&
    !project.archivedAt

  useEffect(() => {
    setAllowBlockingProblems(false)
  }, [project.id, project.book?.sourceFingerprint])

  const exportBook = async () => {
    setExporting(true)
    setArtifact(null)
    try {
      const result = await projectApi.export(project.id, {
        marks,
        allowBlockingProblems,
        reviewedBookFingerprint: project.book?.sourceFingerprint ?? null,
      })
      setArtifact(result)
      captureAnalyticsEvent("export:completed", {
        blocking_override: allowBlockingProblems && blocking > 0,
        problem_count: blocking,
        printer_marks: marks,
      })
      toast.success("Book exported — pick a format below")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading text-2xl">Print export</h2>
        <p className="text-sm text-muted-foreground">
          Render source assets and canonical geometry into individual {specification.standard}
          pages.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Trim size", `${specification.trimWidthMm} × ${specification.trimHeightMm} mm`],
          ["Page with bleed", `${specification.mediaWidthMm} × ${specification.mediaHeightMm} mm`],
          ["Print condition", "PSO Coated v3 · FOGRA51"],
          ["Image target", "300 effective PPI"],
          ["Blocking threshold", "< 150 PPI"],
          ["Output target", "Structurally verified PDF/X-4"],
        ].map(([label, value]) => (
          <Card key={label} className="bg-card/85">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {project.archivedAt ? (
        <Alert>
          <ArchiveIcon />
          <AlertTitle>This project is archived</AlertTitle>
          <AlertDescription>
            Unarchive it from the project header to run a new export. Earlier exports stay
            downloadable.
          </AlertDescription>
        </Alert>
      ) : !project.book ? (
        <Alert>
          <PrinterIcon />
          <AlertTitle>No generated book</AlertTitle>
          <AlertDescription>
            Close collection, create layouts, and generate the complete book before export.
          </AlertDescription>
        </Alert>
      ) : project.bookStatus === "stale" ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Export blocked by stale output</AlertTitle>
          <AlertDescription>
            Return to Book review to update the book automatically.
          </AlertDescription>
        </Alert>
      ) : blocking > 0 && allowBlockingProblems ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>
            {blocking} blocking page problem{blocking === 1 ? "" : "s"} accepted
          </AlertTitle>
          <AlertDescription>
            Export is enabled. The preflight report will list every accepted problem.
          </AlertDescription>
        </Alert>
      ) : blocking > 0 ? (
        <Alert variant="destructive">
          <XCircleIcon />
          <AlertTitle>
            Export blocked by {blocking} page problem
            {blocking === 1 ? "" : "s"}
          </AlertTitle>
          <AlertDescription>
            Enable export despite blocking problems below to accept them for this export.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Ready for final preflight</AlertTitle>
          <AlertDescription>
            The generated source is current and no blocking layout problems remain.
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Printer options</CardTitle>
          <CardDescription>
            Bleed is always included. Marks are optional because printer requirements differ. Every
            export produces the complete book, one PDF per page, and one JPEG per page, so you
            choose a format when downloading.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                id="printer-marks"
                checked={marks}
                onCheckedChange={(checked) => setMarks(checked === true)}
              />
              <div>
                <FieldLabel htmlFor="printer-marks">Crop and printer marks</FieldLabel>
                <FieldDescription>
                  Off by default. Pages are never imposed as spreads.
                </FieldDescription>
              </div>
            </Field>
            {blocking > 0 && project.bookStatus === "current" && (
              <Field orientation="horizontal">
                <Switch
                  id="allow-blocking-problems"
                  checked={allowBlockingProblems}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true
                    setAllowBlockingProblems(enabled)
                    captureAnalyticsEvent("export:blocking_override_changed", {
                      enabled,
                      problem_count: blocking,
                    })
                  }}
                />
                <div>
                  <FieldLabel htmlFor="allow-blocking-problems">
                    Export despite blocking problems
                  </FieldLabel>
                  <FieldDescription>
                    Accept {blocking} blocking page problem{blocking === 1 ? "" : "s"} for this
                    export. The preflight report will list each one.
                  </FieldDescription>
                </div>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          {blocking > 0 && allowBlockingProblems ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button size="lg" disabled={!ready || exporting || bookBusy} />}
              >
                {exporting ? (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <FileCheck2Icon data-icon="inline-start" />
                )}
                {exporting ? "Rendering and preflighting…" : "Export book"}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Export with blocking problems?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The PDF may contain content outside the print area, clipped text, or other
                    visible problems. The preflight report will record all {blocking} accepted
                    problem{blocking === 1 ? "" : "s"}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={exportBook}>Export anyway</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button size="lg" disabled={!ready || exporting || bookBusy} onClick={exportBook}>
              {exporting ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <FileCheck2Icon data-icon="inline-start" />
              )}
              {exporting ? "Rendering and preflighting…" : "Export book"}
            </Button>
          )}
        </CardFooter>
      </Card>

      {artifact && (
        <Card className="bg-card/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2Icon aria-hidden="true" />
              Export complete
            </CardTitle>
            <CardDescription>
              Source fingerprint {artifact.report.sourceFingerprint}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {artifact.report.checks.map((check) => (
                <div
                  key={check.id}
                  className="flex flex-col justify-between gap-2 rounded-lg border bg-background p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{check.label}</p>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                  <Badge
                    variant={
                      check.status === "pass"
                        ? "default"
                        : check.status === "warning"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {check.status}
                  </Badge>
                </div>
              ))}
            </div>
            <Alert className="mt-4">
              <AlertTriangleIcon />
              <AlertTitle>PDF/X verification scope</AlertTitle>
              <AlertDescription>{artifact.report.pdfx.limitation}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <p className="text-sm font-medium">Downloads</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  href: artifact.pdfUrl,
                  icon: <DownloadIcon aria-hidden="true" />,
                  label: "Complete book (PDF)",
                  detail: "Every page in one print-ready file.",
                },
                {
                  href: artifact.pagePdfZipUrl,
                  icon: <FileArchiveIcon aria-hidden="true" />,
                  label: "One PDF per page (ZIP)",
                  detail: "The same print-ready pages as separate files.",
                },
                {
                  href: artifact.pageJpegZipUrl,
                  icon: <ImagesIcon aria-hidden="true" />,
                  label: "One JPEG per page (ZIP)",
                  detail: "300 PPI images with bleed, for previews and photo prints.",
                },
                {
                  href: artifact.reportUrl,
                  icon: <FileTextIcon aria-hidden="true" />,
                  label: "Preflight report (TXT)",
                  detail: "What was checked before this export was stored.",
                },
              ].map((download) => (
                <a
                  key={download.label}
                  href={download.href}
                  download
                  className="flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent"
                >
                  {download.icon}
                  <span>
                    <span className="block text-sm font-medium">{download.label}</span>
                    <span className="block text-xs text-muted-foreground">{download.detail}</span>
                  </span>
                </a>
              ))}
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
