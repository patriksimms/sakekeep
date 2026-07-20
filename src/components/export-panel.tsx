import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileCheck2Icon,
  FileTextIcon,
  LoaderCircleIcon,
  PrinterIcon,
  XCircleIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx"
import { Badge } from "#/components/ui/badge.tsx"
import { Button, buttonVariants } from "#/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx"
import { Switch } from "#/components/ui/switch.tsx"
import { type ExportArtifact, type Project } from "#/domain/types.ts"
import { projectApi } from "#/lib/api.ts"

export function ExportPanel({ project }: { project: Project }) {
  const [marks, setMarks] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [artifact, setArtifact] = useState<ExportArtifact | null>(null)
  const blocking =
    project.book?.pages.flatMap((page) => page.problems.filter((problem) => problem.blocking))
      .length ?? 0
  const ready = project.bookStatus === "current" && Boolean(project.book) && blocking === 0

  const exportBook = async () => {
    setExporting(true)
    setArtifact(null)
    try {
      const result = await projectApi.export(project.id, marks)
      setArtifact(result)
      toast.success("PDF and preflight report exported")
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
          Render source assets and canonical geometry into individual DIN A5 landscape pages.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Trim size", "210 × 148 mm"],
          ["Page with bleed", "216 × 154 mm"],
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

      {!project.book ? (
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
            Return to Book review and regenerate the complete book.
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
            Resolve or explicitly override every blocking problem, then regenerate.
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
            Bleed is always included. Marks are optional because printer requirements differ.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
        <CardFooter className="justify-end">
          <Button size="lg" disabled={!ready || exporting} onClick={exportBook}>
            {exporting ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <FileCheck2Icon data-icon="inline-start" />
            )}
            {exporting ? "Rendering and preflighting…" : "Export PDF + report"}
          </Button>
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
          <CardFooter className="flex flex-wrap gap-2">
            <a href={artifact.pdfUrl} download className={buttonVariants()}>
              <DownloadIcon data-icon="inline-start" />
              Download PDF
            </a>
            <a
              href={artifact.reportUrl}
              download
              className={buttonVariants({ variant: "outline" })}
            >
              <FileTextIcon data-icon="inline-start" />
              Download report
            </a>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
