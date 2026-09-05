import * as m from "#/paraglide/messages.js"
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

export function ExportPanel({ project }: { project: Project }) {
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
      toast.success(m.ui_book_exported_pick_a_format_below())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m.ui_export_failed())
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 data-testid="heading-print-export" className="font-heading text-2xl">
          {m.ui_print_export()}
        </h2>
        <p className="text-sm text-muted-foreground">
          {m.ui_render_source_assets_and_canonical_geometry_into_individual()}{" "}
          {specification.standard}
          {m.ui_pages()}{" "}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          [m.ui_trim_size(), `${specification.trimWidthMm} × ${specification.trimHeightMm} mm`],
          [
            m.ui_page_with_bleed(),
            `${specification.mediaWidthMm} × ${specification.mediaHeightMm} mm`,
          ],
          [m.ui_print_condition(), "PSO Coated v3 · FOGRA51"],
          [m.ui_image_target(), "300 effective PPI"],
          [m.ui_blocking_threshold(), "< 150 PPI"],
          [m.ui_output_target(), "Structurally verified PDF/X-4"],
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
          <AlertTitle>{m.ui_this_project_is_archived()}</AlertTitle>
          <AlertDescription>
            {m.ui_unarchive_it_from_the_project_header_to_run_a_new_export_earlier_()}{" "}
          </AlertDescription>
        </Alert>
      ) : !project.book ? (
        <Alert>
          <PrinterIcon />
          <AlertTitle>{m.ui_no_generated_book()}</AlertTitle>
          <AlertDescription>
            {m.ui_close_collection_create_layouts_and_generate_the_complete_book_be()}{" "}
          </AlertDescription>
        </Alert>
      ) : project.bookStatus === "stale" ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{m.ui_export_blocked_by_stale_output()}</AlertTitle>
          <AlertDescription>
            {m.ui_return_to_book_review_and_regenerate_the_complete_book()}{" "}
          </AlertDescription>
        </Alert>
      ) : blocking > 0 && allowBlockingProblems ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>{m.accepted_blocking_count({ count: blocking })} </AlertTitle>
          <AlertDescription>
            {m.ui_export_is_enabled_the_preflight_report_will_list_every_accepted_p()}{" "}
          </AlertDescription>
        </Alert>
      ) : blocking > 0 ? (
        <Alert variant="destructive">
          <XCircleIcon />
          <AlertTitle>{m.export_blocked_count({ count: blocking })}</AlertTitle>
          <AlertDescription>
            {m.ui_enable_export_despite_blocking_problems_below_to_accept_them_for_()}{" "}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{m.ui_ready_for_final_preflight()}</AlertTitle>
          <AlertDescription>
            {m.ui_the_generated_source_is_current_and_no_blocking_layout_problems_r()}{" "}
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle data-testid="heading-printer-options">{m.ui_printer_options()}</CardTitle>
          <CardDescription>
            {m.ui_bleed_is_always_included_marks_are_optional_because_printer_requi()}{" "}
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
                <FieldLabel htmlFor="printer-marks">{m.ui_crop_and_printer_marks()}</FieldLabel>
                <FieldDescription>
                  {m.ui_off_by_default_pages_are_never_imposed_as_spreads()}{" "}
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
                    {m.ui_export_despite_blocking_problems()}{" "}
                  </FieldLabel>
                  <FieldDescription>
                    {m.accept_export_problems({ count: blocking })}{" "}
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
                data-testid="button-rendering-and-preflighting"
                render={<Button size="lg" disabled={!ready || exporting} />}
              >
                {exporting ? (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <FileCheck2Icon data-icon="inline-start" />
                )}
                {exporting ? m.ui_rendering_and_preflighting() : m.ui_export_book()}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle data-testid="heading-export-with-blocking-problems">
                    {m.ui_export_with_blocking_problems()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.export_warning({ count: blocking })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel">{m.ui_cancel()}</AlertDialogCancel>
                  <AlertDialogAction data-testid="button-export-anyway" onClick={exportBook}>
                    {m.ui_export_anyway()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              data-testid="button-rendering-and-preflighting"
              size="lg"
              disabled={!ready || exporting}
              onClick={exportBook}
            >
              {exporting ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <FileCheck2Icon data-icon="inline-start" />
              )}
              {exporting ? m.ui_rendering_and_preflighting() : m.ui_export_book()}
            </Button>
          )}
        </CardFooter>
      </Card>

      {artifact && (
        <Card className="bg-card/95">
          <CardHeader>
            <CardTitle data-testid="heading-export-complete" className="flex items-center gap-2">
              <CheckCircle2Icon aria-hidden="true" />
              {m.ui_export_complete()}{" "}
            </CardTitle>
            <CardDescription>
              {m.ui_source_fingerprint()} {artifact.report.sourceFingerprint}
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
              <AlertTitle>{m.ui_pdf_x_verification_scope()}</AlertTitle>
              <AlertDescription>{artifact.report.pdfx.limitation}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <p className="text-sm font-medium">{m.ui_downloads()}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  href: artifact.pdfUrl,
                  icon: <DownloadIcon aria-hidden="true" />,
                  label: m.ui_complete_book_pdf(),
                  detail: m.ui_every_page_in_one_print_ready_file(),
                },
                {
                  href: artifact.pagePdfZipUrl,
                  icon: <FileArchiveIcon aria-hidden="true" />,
                  label: m.ui_one_pdf_per_page_zip(),
                  detail: m.ui_the_same_print_ready_pages_as_separate_files(),
                },
                {
                  href: artifact.pageJpegZipUrl,
                  icon: <ImagesIcon aria-hidden="true" />,
                  label: m.ui_one_jpeg_per_page_zip(),
                  detail: "300 PPI images with bleed, for previews and photo prints.",
                },
                {
                  href: artifact.reportUrl,
                  icon: <FileTextIcon aria-hidden="true" />,
                  label: m.ui_preflight_report_txt(),
                  detail: m.ui_what_was_checked_before_this_export_was_stored(),
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
