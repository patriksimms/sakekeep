import { orientationLabel } from "#/domain/project-labels.ts"
import * as m from "#/paraglide/messages.js"
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BringToFrontIcon,
  CheckIcon,
  CircleIcon,
  CopyIcon,
  FileTextIcon,
  GalleryHorizontalIcon,
  GripVerticalIcon,
  ImageIcon,
  ImagePlusIcon,
  LayersIcon,
  LayoutTemplateIcon,
  LoaderCircleIcon,
  LockIcon,
  MinusIcon,
  PanelBottomIcon,
  PanelTopIcon,
  PlusIcon,
  Redo2Icon,
  RectangleHorizontalIcon,
  SaveIcon,
  SendToBackIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TypeIcon,
  Undo2Icon,
  UnlockIcon,
  XIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import {
  LAYOUT_ELEMENT_DRAG_TYPE,
  LayoutCanvas,
  type InlineEditableCanvas,
  type LayoutElementDragData,
} from "#/components/layout-canvas.tsx"
import { LayoutPageElements } from "#/components/layout-page.tsx"
import { NumericField } from "#/components/numeric-field.tsx"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx"
import { Button } from "#/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field.tsx"
import { Input } from "#/components/ui/input.tsx"
import { ScrollArea } from "#/components/ui/scroll-area.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import { Separator } from "#/components/ui/separator.tsx"
import { Switch } from "#/components/ui/switch.tsx"
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx"
import {
  isEditorDeleteKey,
  moveElementLayer,
  type LayerAction,
} from "#/domain/layout-editor-actions.ts"
import { cssFontStack, FONT_FAMILIES, FONT_FAMILY_GROUPS, type FontFamily } from "#/domain/fonts.ts"
import { backgroundPresets, type BackgroundPreset } from "#/domain/layout-backgrounds.ts"
import { boundTextLabel } from "#/domain/layout-label.ts"
import { reorderElementsFromTopmostList, type DropEdge } from "#/domain/layout-layer-order.ts"
import {
  boundQuestionLabel,
  layoutQuestionPalette,
  questionPrompt,
} from "#/domain/layout-question-palette.ts"
import { addElement, layoutStyleLimits } from "#/domain/layout.ts"
import {
  PAGE_FORMATS,
  PAGE_ORIENTATIONS,
  pageFormatLabel,
  pageSpecificationForLayout,
} from "#/domain/page-format.ts"
import { photoSlotMismatches } from "#/domain/photo-assignment.ts"
import { enforceMinimumTextBoxHeight } from "#/domain/text-layout.ts"
import {
  type FormQuestion,
  type LayoutElement,
  type LayoutRecord,
  type LayoutRole,
  type LayoutSchema,
  type PageFormat,
  type PageOrientation,
  type Project,
  type TextSettings,
} from "#/domain/types.ts"
import {
  LAYOUT_ROLES,
  allowsResponseBoundElements,
  defaultLayoutName,
  isCoverRole,
  layoutRoleLabel,
  orderedLayouts,
  reorderableLayouts,
} from "#/domain/layout-roles.ts"
import { api, projectApi } from "#/lib/api.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"

type SaveState = "saved" | "unsaved" | "saving" | "failed"

/** Marks the tabs that are not response layouts, so a pinned cover reads as one at a glance. */
const LAYOUT_ROLE_ICONS: Record<LayoutRole, LucideIcon | null> = {
  submission: null,
  "front-cover": PanelTopIcon,
  "back-cover": PanelBottomIcon,
  static: FileTextIcon,
}

function BackgroundPicker({
  compact = false,
  pageFormat,
  pageOrientation,
  takenRoles,
  onCreate,
}: {
  compact?: boolean
  pageFormat: PageFormat
  pageOrientation: PageOrientation
  takenRoles: LayoutRole[]
  onCreate: (preset: BackgroundPreset, role: LayoutRole) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<LayoutRole>("submission")
  const [creatingId, setCreatingId] = useState<BackgroundPreset["id"] | null>(null)

  const create = async (preset: BackgroundPreset) => {
    setCreatingId(preset.id)
    try {
      await onCreate(preset, role)
      captureAnalyticsEvent("layout_editor:background_created", {
        background_id: preset.id,
      })
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m.ui_create_failed())
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        data-testid="button-new-layout"
        render={
          <Button
            data-testid="button-new-layout"
            variant={compact ? "ghost" : "default"}
            size={compact ? "icon-sm" : "default"}
            aria-label={compact ? m.ui_new_layout() : undefined}
          />
        }
      >
        <PlusIcon data-icon={compact ? undefined : "inline-start"} />
        {!compact && m.ui_new_layout()}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle data-testid="heading-choose-a-background">
            {m.ui_choose_a_background()}
          </DialogTitle>
          <DialogDescription>
            {m.ui_decorative_elements_start_locked_and_can_be_unlocked_in_the_edito()}{" "}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{m.ui_this_layout_is_for()}</FieldLabel>
          <Select
            items={LAYOUT_ROLES.map((candidate) => ({
              value: candidate,
              label: layoutRoleLabel(candidate),
            }))}
            value={role}
            onValueChange={(value) => value && setRole(value as LayoutRole)}
          >
            <SelectTrigger
              data-testid="combobox-new-layout-role"
              className="w-full"
              aria-label={m.ui_new_layout_role()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LAYOUT_ROLES.map((candidate) => (
                  <SelectItem
                    key={candidate}
                    value={candidate}
                    disabled={isCoverRole(candidate) && takenRoles.includes(candidate)}
                  >
                    {layoutRoleLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {allowsResponseBoundElements(role)
              ? m.ui_response_layouts_are_assigned_to_submissions_when_the_book_is_gen()
              : m.ui_standalone_pages_carry_no_response_so_only_static_elements_can_be()}
          </FieldDescription>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {backgroundPresets(pageFormat, pageOrientation).map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              className="h-auto min-w-0 flex-col items-stretch gap-2 p-2"
              disabled={creatingId !== null}
              data-testid={`create-background-${preset.id}`}
              aria-label={m.create_background({ value0: preset.name })}
              onClick={() => void create(preset)}
            >
              <span
                className="relative block w-full overflow-hidden rounded-sm"
                style={{
                  aspectRatio: `${preset.schema.trim.widthMm + preset.schema.bleedMm * 2} / ${preset.schema.trim.heightMm + preset.schema.bleedMm * 2}`,
                  background: preset.schema.background,
                  containerType: "inline-size",
                }}
              >
                <LayoutPageElements schema={preset.schema} ariaHidden />
              </span>
              <span className="flex items-center justify-center gap-1">
                {creatingId === preset.id && <LoaderCircleIcon className="animate-spin" />}
                {preset.name}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IconAction({
  label,
  disabled = false,
  children,
}: {
  label: string
  disabled?: boolean
  children: ReactElement
}) {
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              tabIndex={0}
              aria-label={m.unavailable_element({ value0: label })}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function elementLabel(element: LayoutElement, questions: FormQuestion[]): string {
  if (element.type === "static-text") return element.content || m.ui_static_text()
  if (
    element.type === "bound-text" ||
    element.type === "image-frame" ||
    element.type === "gallery-frame"
  ) {
    return boundQuestionLabel(questions, element.questionId)
  }
  const labels: Record<LayoutElement["type"], string> = {
    "bound-text": m.ui_question_text(),
    "static-text": m.ui_static_text(),
    "image-frame": m.ui_image_frame(),
    "gallery-frame": m.ui_gallery(),
    rectangle: m.ui_rectangle(),
    circle: m.ui_circle(),
    line: m.ui_line(),
    "decorative-image": m.ui_decorative_image(),
  }
  return labels[element.type]
}

function SaveIndicator({ state }: { state: SaveState }) {
  const value = {
    saved: { icon: CheckIcon, label: m.ui_saved() },
    unsaved: { icon: SaveIcon, label: m.ui_unsaved() },
    saving: { icon: LoaderCircleIcon, label: m.ui_saving() },
    failed: { icon: XCircleIcon, label: m.ui_save_failed() },
  }[state]
  return (
    <span
      data-testid="save-status"
      data-save-state={state}
      role="status"
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <value.icon className={state === "saving" ? "animate-spin" : undefined} />
      {value.label}
    </span>
  )
}

function PaletteAction({
  label,
  addLabel,
  icon: Icon,
  dragData,
  onAdd,
}: {
  label: string
  addLabel: string
  icon: LucideIcon
  dragData: LayoutElementDragData
  onAdd: () => void
}) {
  return (
    <div className="flex min-w-0 items-center rounded-lg border bg-background">
      <span
        draggable
        data-palette-element-type={dragData.type}
        data-palette-question-id={dragData.questionId}
        title={m.drag_element({ value0: label })}
        className="flex h-7 min-w-0 cursor-grab items-center gap-1.5 px-2 text-[0.8rem] font-medium select-none active:cursor-grabbing"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy"
          event.dataTransfer.setData(LAYOUT_ELEMENT_DRAG_TYPE, JSON.stringify(dragData))
        }}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-l-none border-l"
        data-testid={`add-${dragData.type}`}
        aria-label={addLabel}
        onClick={onAdd}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}

/**
 * Handwriting faces such as Caveat ship no italic cut, so switching to one
 * drops italic instead of silently rendering upright text.
 */
function withFontFamily(settings: TextSettings, fontFamily: FontFamily): TextSettings {
  const hasItalic = FONT_FAMILIES[fontFamily].hasItalic
  return { ...settings, fontFamily, fontStyle: hasItalic ? settings.fontStyle : "normal" }
}

function TextSettingsEditor({
  settings,
  onChange,
  limits,
}: {
  settings: TextSettings
  onChange: (settings: TextSettings) => void
  limits: ReturnType<typeof layoutStyleLimits>
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel data-testid="text-ui_font_family">{m.ui_font_family()}</FieldLabel>
        <Select
          value={settings.fontFamily}
          onValueChange={(value) => onChange(withFontFamily(settings, value as FontFamily))}
        >
          <SelectTrigger
            data-testid="combobox-font-family"
            className="w-full"
            aria-label={m.ui_font_family()}
          >
            <SelectValue style={{ fontFamily: cssFontStack(settings.fontFamily) }} />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILY_GROUPS.map((group) => (
              <SelectGroup key={group.category}>
                <SelectLabel>
                  {
                    {
                      Sans: m.font_group_sans(),
                      Serif: m.font_group_serif(),
                      Handwriting: m.font_group_handwriting(),
                    }[group.category]
                  }
                </SelectLabel>
                {group.families.map((family) => (
                  <SelectItem
                    key={family}
                    value={family}
                    style={{ fontFamily: cssFontStack(family) }}
                  >
                    {family}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <NumericField
          label={m.ui_font_size()}
          value={settings.fontSize}
          min={limits.fontSize.min}
          max={limits.fontSize.max}
          onChange={(fontSize) => onChange({ ...settings, fontSize })}
        />
        <NumericField
          label={m.label_minimum()}
          value={settings.minFontSize}
          min={limits.fontSize.min}
          max={limits.fontSize.max}
          onChange={(minFontSize) => onChange({ ...settings, minFontSize })}
        />
      </div>
      <Field>
        <FieldLabel>{m.ui_text_colour()}</FieldLabel>
        <Input
          aria-label={m.ui_text_colour()}
          type="color"
          value={settings.color}
          onChange={(event) => onChange({ ...settings, color: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>{m.ui_style()}</FieldLabel>
          <Select
            items={[
              { value: "normal", label: m.ui_normal() },
              { value: "italic", label: m.ui_italic() },
            ]}
            value={settings.fontStyle}
            onValueChange={(value) =>
              onChange({
                ...settings,
                fontStyle: value as TextSettings["fontStyle"],
              })
            }
          >
            <SelectTrigger
              data-testid="combobox-font-style"
              className="w-full"
              aria-label={m.ui_font_style()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="normal">{m.ui_normal()}</SelectItem>
                <SelectItem value="italic" disabled={!FONT_FAMILIES[settings.fontFamily].hasItalic}>
                  {m.ui_italic()}{" "}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{m.ui_weight()}</FieldLabel>
          <Select
            items={[
              { value: "normal", label: m.ui_normal() },
              { value: "bold", label: m.ui_bold() },
            ]}
            value={settings.fontWeight}
            onValueChange={(value) =>
              onChange({
                ...settings,
                fontWeight: value as TextSettings["fontWeight"],
              })
            }
          >
            <SelectTrigger
              data-testid="combobox-font-weight"
              className="w-full"
              aria-label={m.ui_font_weight()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="normal">{m.ui_normal()}</SelectItem>
                <SelectItem value="bold">{m.ui_bold()}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field>
        <FieldLabel>{m.ui_alignment()}</FieldLabel>
        <Select
          items={[
            { value: "left", label: m.ui_left() },
            { value: "center", label: m.ui_centre() },
            { value: "right", label: m.ui_right() },
          ]}
          value={settings.alignment}
          onValueChange={(value) =>
            onChange({
              ...settings,
              alignment: value as TextSettings["alignment"],
            })
          }
        >
          <SelectTrigger
            data-testid="combobox-text-alignment"
            className="w-full"
            aria-label={m.ui_text_alignment()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="left">{m.ui_left()}</SelectItem>
              <SelectItem value="center">{m.ui_centre()}</SelectItem>
              <SelectItem value="right">{m.ui_right()}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>{m.ui_vertical_alignment()}</FieldLabel>
        <Select
          items={[
            { value: "top", label: m.ui_top() },
            { value: "middle", label: m.ui_middle() },
            { value: "bottom", label: m.ui_bottom() },
          ]}
          value={settings.verticalAlignment}
          onValueChange={(value) =>
            onChange({
              ...settings,
              verticalAlignment: value as TextSettings["verticalAlignment"],
            })
          }
        >
          <SelectTrigger
            data-testid="combobox-vertical-text-alignment"
            className="w-full"
            aria-label={m.ui_vertical_text_alignment()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="top">{m.ui_top()}</SelectItem>
              <SelectItem value="middle">{m.ui_middle()}</SelectItem>
              <SelectItem value="bottom">{m.ui_bottom()}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{m.ui_where_the_text_sits_inside_its_bounding_box()}</FieldDescription>
      </Field>
      <NumericField
        label={m.label_line_height()}
        value={settings.lineHeight}
        step={0.05}
        onChange={(lineHeight) => onChange({ ...settings, lineHeight })}
      />
      <Field>
        <FieldLabel>{m.ui_overflow_policy()}</FieldLabel>
        <Select
          items={[
            { value: "shrink", label: m.ui_shrink_to_minimum() },
            { value: "truncate", label: m.ui_truncate_visibly() },
            { value: "flag", label: m.ui_flag_for_attention() },
          ]}
          value={settings.overflow}
          onValueChange={(value) =>
            onChange({
              ...settings,
              overflow: value as TextSettings["overflow"],
            })
          }
        >
          <SelectTrigger
            data-testid="combobox-overflow-policy"
            className="w-full"
            aria-label={m.ui_overflow_policy()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="shrink">{m.ui_shrink_to_minimum()}</SelectItem>
              <SelectItem value="truncate">{m.ui_truncate_visibly()}</SelectItem>
              <SelectItem value="flag">{m.ui_flag_for_attention()}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}

function ElementInspector({
  element,
  questions,
  limits,
  actions,
  onChange,
  onChooseDecorative,
  decorativeUploading,
}: {
  element: LayoutElement
  questions: FormQuestion[]
  limits: ReturnType<typeof layoutStyleLimits>
  actions: ReactNode
  onChange: (element: LayoutElement) => void
  onChooseDecorative: (file: File) => void
  decorativeUploading: boolean
}) {
  const updateGeometry = (key: keyof LayoutElement["geometry"], value: number) =>
    onChange({
      ...element,
      geometry: { ...element.geometry, [key]: value },
    })
  const boundQuestion =
    element.type === "bound-text" ||
    element.type === "image-frame" ||
    element.type === "gallery-frame"
      ? questions.find((question) => question.id === element.questionId)
      : undefined

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{element.type}</p>
        <div className="-mx-1 flex flex-wrap items-center gap-0.5">{actions}</div>
      </div>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            label={m.label_x_mm()}
            value={element.geometry.x}
            onChange={(value) => updateGeometry("x", value)}
          />
          <NumericField
            label={m.label_y_mm()}
            value={element.geometry.y}
            onChange={(value) => updateGeometry("y", value)}
          />
          <NumericField
            label={m.ui_width()}
            value={element.geometry.width}
            onChange={(value) => updateGeometry("width", Math.max(0.1, value))}
          />
          <NumericField
            label={m.ui_height()}
            value={element.geometry.height}
            onChange={(value) => updateGeometry("height", Math.max(0.1, value))}
          />
        </div>
        <NumericField
          label={m.label_rotation()}
          value={element.geometry.rotation}
          onChange={(value) => updateGeometry("rotation", value)}
        />
        <NumericField
          label={m.label_opacity()}
          value={element.opacity}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => onChange({ ...element, opacity: value })}
        />
        <Field orientation="horizontal">
          <Switch
            id={`locked-${element.id}`}
            checked={element.locked ?? false}
            onCheckedChange={(checked) => onChange({ ...element, locked: checked === true })}
          />
          <FieldLabel htmlFor={`locked-${element.id}`}>
            {element.locked ? <LockIcon /> : <UnlockIcon />}
            {m.ui_lock_element()}{" "}
          </FieldLabel>
        </Field>
      </FieldGroup>

      {(element.type === "bound-text" ||
        element.type === "image-frame" ||
        element.type === "gallery-frame") && (
        <>
          <Separator />
          <Field>
            <FieldLabel data-testid="text-ui_question_binding">
              {m.ui_question_binding()}
            </FieldLabel>
            <p
              aria-label={m.ui_question_binding()}
              className="rounded-lg border bg-muted/45 px-3 py-2 text-sm"
            >
              {questionPrompt(boundQuestion)}
            </p>
            <FieldDescription>{m.ui_frozen_with_the_published_questionnaire()}</FieldDescription>
          </Field>
        </>
      )}

      {element.type === "bound-text" && (
        <>
          <Separator />
          <TextSettingsEditor
            settings={element.text}
            limits={limits}
            onChange={(text) => onChange({ ...element, text })}
          />
        </>
      )}
      {element.type === "static-text" && (
        <>
          <Field>
            <FieldLabel>{m.ui_content()}</FieldLabel>
            <Textarea
              data-testid="static-text-content"
              aria-label={m.ui_content()}
              value={element.content}
              onChange={(event) => onChange({ ...element, content: event.target.value })}
            />
          </Field>
          <Separator />
          <TextSettingsEditor
            settings={element.text}
            limits={limits}
            onChange={(text) => onChange({ ...element, text })}
          />
        </>
      )}
      {element.type === "gallery-frame" && (
        <>
          <Field>
            <FieldLabel>{m.ui_arrangement()}</FieldLabel>
            <Select
              items={[
                { value: "two-portrait", label: m.ui_two_portraits() },
                { value: "four-square", label: m.ui_four_squares() },
                { value: "hero-two", label: m.ui_hero_plus_two() },
                { value: "three-column", label: m.ui_three_columns() },
              ]}
              value={element.arrangement}
              onValueChange={(arrangement) =>
                onChange({
                  ...element,
                  arrangement: arrangement as typeof element.arrangement,
                })
              }
            >
              <SelectTrigger
                data-testid="combobox-arrangement"
                className="w-full"
                aria-label={m.ui_arrangement()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="two-portrait">{m.ui_two_portraits()}</SelectItem>
                  <SelectItem value="four-square">{m.ui_four_squares()}</SelectItem>
                  <SelectItem value="hero-two">{m.ui_hero_plus_two()}</SelectItem>
                  <SelectItem value="three-column">{m.ui_three_columns()}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <NumericField
            label={m.label_slot_gap_mm()}
            value={element.gap}
            min={0}
            max={limits.gapMax}
            onChange={(gap) => onChange({ ...element, gap: Math.max(0, gap) })}
          />
        </>
      )}
      {(element.type === "rectangle" || element.type === "circle" || element.type === "line") && (
        <>
          <Field>
            <FieldLabel>{m.ui_fill()}</FieldLabel>
            <Input
              aria-label={m.ui_fill_colour()}
              type="color"
              value={element.fill === "transparent" ? "#ffffff" : element.fill}
              disabled={element.type === "line"}
              onChange={(event) => onChange({ ...element, fill: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{m.ui_stroke()}</FieldLabel>
            <Input
              aria-label={m.ui_stroke_colour()}
              type="color"
              value={element.stroke}
              onChange={(event) => onChange({ ...element, stroke: event.target.value })}
            />
          </Field>
          <NumericField
            label={m.ui_stroke_width()}
            value={element.strokeWidth}
            min={0}
            max={limits.strokeWidthMax}
            onChange={(strokeWidth) =>
              onChange({ ...element, strokeWidth: Math.max(0, strokeWidth) })
            }
          />
        </>
      )}
      {element.type === "decorative-image" && (
        <>
          <Separator />
          <Field>
            <FieldLabel>{element.assetId ? m.ui_replace_image() : m.ui_choose_image()}</FieldLabel>
            <Input
              type="file"
              data-testid="decorative-image-file"
              aria-label={
                element.assetId ? m.ui_replace_decorative_image() : m.ui_choose_decorative_image()
              }
              accept=".jpg,.jpeg,.png,.webp,.heif,.heic,image/*"
              disabled={decorativeUploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) onChooseDecorative(file)
              }}
            />
            <FieldDescription>
              {decorativeUploading
                ? m.ui_uploading_image()
                : element.assetId
                  ? m.ui_replacing_or_removing_it_keeps_this_element_s_size_and_position()
                  : m.ui_the_placeholder_appears_only_in_the_layout_editor()}
            </FieldDescription>
          </Field>
          {element.assetId && (
            <Button
              data-testid="button-remove-image"
              type="button"
              variant="outline"
              disabled={decorativeUploading}
              onClick={() => onChange({ ...element, assetId: undefined })}
            >
              <Trash2Icon data-icon="inline-start" />
              {m.ui_remove_image()}{" "}
            </Button>
          )}
        </>
      )}
      {(element.type === "decorative-image" ||
        element.type === "image-frame" ||
        element.type === "gallery-frame") && (
        <>
          <Separator />
          <p className="text-sm font-medium">{m.ui_focal_point()}</p>
          <div className="grid grid-cols-2 gap-3">
            <NumericField
              label={m.label_horizontal()}
              value={element.focalPoint?.x ?? 0.5}
              step={0.05}
              onChange={(x) =>
                onChange({
                  ...element,
                  focalPoint: {
                    ...(element.focalPoint ?? { x: 0.5, y: 0.5 }),
                    x: Math.min(1, Math.max(0, x)),
                  },
                })
              }
            />
            <NumericField
              label={m.label_vertical()}
              value={element.focalPoint?.y ?? 0.5}
              step={0.05}
              onChange={(y) =>
                onChange({
                  ...element,
                  focalPoint: {
                    ...(element.focalPoint ?? { x: 0.5, y: 0.5 }),
                    y: Math.min(1, Math.max(0, y)),
                  },
                })
              }
            />
          </div>
          <FieldDescription>{m.ui_values_run_from_0_to_1()}</FieldDescription>
        </>
      )}
    </div>
  )
}

interface EditorHandle {
  discard: () => void
  flush: () => Promise<boolean>
  settle: () => Promise<void>
}

const Editor = forwardRef<
  EditorHandle,
  {
    project: Project
    layout: LayoutRecord
    onSaved: (layout: LayoutRecord) => void
    onSaveStateChange: (state: SaveState) => void
  }
>(function Editor({ project, layout, onSaved, onSaveStateChange }, ref) {
  const [schema, setSchema] = useState(layout.schema)
  const [name, setName] = useState(layout.name)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [canvasWidth, setCanvasWidth] = useState(700)
  const [decorativeUploadingId, setDecorativeUploadingId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: DropEdge } | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<InlineEditableCanvas | null>(null)
  const history = useRef<LayoutSchema[]>([layout.schema])
  const historyIndex = useRef(0)
  const revision = useRef(layout.revision)
  const schemaRef = useRef(schema)
  const nameRef = useRef(name)
  const editVersion = useRef(0)
  const savedVersion = useRef(0)
  const saveInFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSavedRef = useRef(onSaved)
  const onSaveStateChangeRef = useRef(onSaveStateChange)
  schemaRef.current = schema
  nameRef.current = name
  onSavedRef.current = onSaved
  onSaveStateChangeRef.current = onSaveStateChange
  const pageSpecification = pageSpecificationForLayout(schema)
  const styleLimits = layoutStyleLimits(pageSpecification)

  useEffect(() => onSaveStateChangeRef.current(saveState), [saveState])

  useEffect(() => {
    const node = container.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.min(900, entry?.contentRect.width ?? 700))
      setCanvasWidth(width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const save = useCallback(
    async (reschedule = true): Promise<boolean> => {
      if (saveInFlight.current) return saveInFlight.current
      if (savedVersion.current === editVersion.current) return true
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      const version = editVersion.current
      setSaveState("saving")
      const request = (async () => {
        try {
          const updated = await projectApi.updateLayout<LayoutRecord>(project.id, layout.id, {
            expectedRevision: revision.current,
            name: nameRef.current,
            schema: schemaRef.current,
          })
          revision.current = updated.revision
          savedVersion.current = version
          onSavedRef.current(updated)
          setSaveState(savedVersion.current === editVersion.current ? "saved" : "unsaved")
          if (reschedule && savedVersion.current !== editVersion.current) {
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => void save(), 400)
          }
          return true
        } catch (error) {
          setSaveState("failed")
          toast.error(error instanceof Error ? error.message : m.ui_layout_save_failed())
          return false
        } finally {
          saveInFlight.current = null
        }
      })()
      saveInFlight.current = request
      return request
    },
    [layout.id, project.id]
  )

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    while (savedVersion.current !== editVersion.current) {
      if (!(await save(false))) return false
    }
    return true
  }, [save])

  const settle = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    await saveInFlight.current
  }, [])

  const discard = useCallback(() => {
    savedVersion.current = editVersion.current
    setSaveState("saved")
  }, [])

  useImperativeHandle(ref, () => ({ discard, flush, settle }), [discard, flush, settle])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    },
    [flush]
  )

  useEffect(() => {
    const flushPendingSave = () => {
      if (savedVersion.current === editVersion.current) return
      void fetch(`/api/projects/${project.id}/layouts/${layout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision.current,
          name: nameRef.current,
          schema: schemaRef.current,
        }),
        keepalive: true,
      })
    }
    window.addEventListener("pagehide", flushPendingSave)
    return () => window.removeEventListener("pagehide", flushPendingSave)
  }, [layout.id, project.id])

  const markChanged = (next: LayoutSchema, addHistory = true) => {
    setSchema(next)
    schemaRef.current = next
    editVersion.current += 1
    setSaveState("unsaved")
    if (addHistory) {
      history.current = history.current.slice(0, historyIndex.current + 1)
      history.current.push(structuredClone(next))
      historyIndex.current = history.current.length - 1
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 700)
  }

  const changeName = (value: string) => {
    setName(value)
    nameRef.current = value
    editVersion.current += 1
    setSaveState("unsaved")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 700)
  }

  const selected = schema.elements.find((element) => element.id === selectedId)
  const responseBound = allowsResponseBoundElements(layout.role)
  const questionPalette = responseBound ? layoutQuestionPalette(project.formSchema.questions) : []
  const slotMismatches = new Map(
    photoSlotMismatches(schema.elements, project.formSchema.questions).map((mismatch) => [
      mismatch.questionId,
      mismatch,
    ])
  )

  const add = (
    type: LayoutElement["type"],
    questionId?: string,
    center?: { x: number; y: number }
  ) => {
    const next = addElement(schemaRef.current, type, questionId, center, project.bookLanguage)
    const added = next.elements.at(-1)!
    markChanged(next)
    setSelectedId(added.id)
  }

  const changeSelected = (nextElement: LayoutElement) => {
    const question =
      nextElement.type === "bound-text"
        ? project.formSchema.questions.find((item) => item.id === nextElement.questionId)
        : undefined
    const label =
      nextElement.type === "bound-text"
        ? boundTextLabel(nextElement, question, project.bookLanguage)
        : ""
    const constrainedElement = enforceMinimumTextBoxHeight(nextElement, label, project.bookLanguage)
    markChanged({
      ...schema,
      elements: schema.elements.map((element) =>
        element.id === constrainedElement.id ? constrainedElement : element
      ),
    })
  }

  const moveLayer = (action: LayerAction) => {
    if (!selected) return
    const elements = moveElementLayer(schema.elements, selected.id, action)
    if (elements === schema.elements) return
    markChanged({ ...schema, elements })
  }

  const deleteSelected = () => {
    if (!selected) return
    markChanged({
      ...schema,
      elements: schema.elements.filter((element) => element.id !== selected.id),
    })
    setSelectedId(null)
  }

  const selectedIndex = selected
    ? schema.elements.findIndex((element) => element.id === selected.id)
    : -1
  const isBackmost = selectedIndex <= 0
  const isFrontmost = selectedIndex === schema.elements.length - 1

  const resetDrag = () => {
    setDraggedId(null)
    setDropTarget(null)
  }

  const dragOverLayer = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggedId || draggedId === targetId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge: DropEdge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
    setDropTarget((current) =>
      current?.id === targetId && current.edge === edge ? current : { id: targetId, edge }
    )
  }

  const dropLayer = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = draggedId ?? event.dataTransfer.getData("text/plain")
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge =
      dropTarget?.id === targetId
        ? dropTarget.edge
        : event.clientY < bounds.top + bounds.height / 2
          ? "before"
          : "after"
    const elements = reorderElementsFromTopmostList(schema.elements, sourceId, targetId, edge)
    if (elements !== schema.elements) {
      markChanged({ ...schema, elements })
      setSelectedId(sourceId)
    }
    resetDrag()
  }

  const uploadDecorative = async (elementId: string, file: File) => {
    setDecorativeUploadingId(elementId)
    const body = new FormData()
    body.set("file", file)
    try {
      const uploaded = await api<{ id: string }>(`/api/projects/${project.id}/assets`, {
        method: "POST",
        body,
      })
      const current = schemaRef.current
      let changed = false
      const next = {
        ...current,
        elements: current.elements.map((element) => {
          if (element.id !== elementId || element.type !== "decorative-image") return element
          changed = true
          return { ...element, assetId: uploaded.id }
        }),
      }
      if (!changed) return
      markChanged(next)
      setSelectedId(elementId)
      toast.success(m.ui_decorative_image_updated())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m.ui_upload_failed())
    } finally {
      setDecorativeUploadingId(null)
    }
  }

  return (
    <div
      aria-label={m.ui_layout_editor_workspace()}
      className="grid min-h-0 items-stretch gap-4 xl:grid-cols-[230px_minmax(0,1fr)_280px]"
      onKeyDown={(event) => {
        const activeObject = canvas.current?.getActiveObject() as
          | { isEditing?: boolean }
          | undefined
        const target = event.target as HTMLElement
        const startsInlineEdit =
          event.key === "Enter" &&
          selected?.type === "bound-text" &&
          activeObject?.isEditing !== true &&
          (target instanceof HTMLCanvasElement || target.closest("[data-layer-select]"))
        if (startsInlineEdit && canvas.current?.startInlineEditing?.()) {
          event.preventDefault()
          return
        }
        if (
          !selected ||
          !isEditorDeleteKey(event, event.target, activeObject?.isEditing === true)
        ) {
          return
        }
        event.preventDefault()
        deleteSelected()
      }}
    >
      <Card
        aria-label={m.ui_layers()}
        className="h-48 bg-card/90 xl:sticky xl:top-20 xl:h-[calc(100dvh-6rem)]"
      >
        <CardHeader>
          <CardTitle data-testid="heading-layers">{m.ui_layers()}</CardTitle>
          <CardDescription>{m.ui_topmost_first()}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-1 pr-2">
              {[...schema.elements].reverse().map((element) => {
                const label = elementLabel(element, project.formSchema.questions)
                const target = dropTarget?.id === element.id ? dropTarget.edge : null
                return (
                  <div
                    key={element.id}
                    data-layer-row={label}
                    data-dragging={draggedId === element.id || undefined}
                    data-drop-edge={target ?? undefined}
                    className="relative flex items-center rounded-lg data-[dragging=true]:opacity-45 data-[drop-edge=after]:after:absolute data-[drop-edge=after]:after:inset-x-1 data-[drop-edge=after]:after:-bottom-0.5 data-[drop-edge=after]:after:h-0.5 data-[drop-edge=after]:after:rounded-full data-[drop-edge=after]:after:bg-primary data-[drop-edge=before]:before:absolute data-[drop-edge=before]:before:inset-x-1 data-[drop-edge=before]:before:-top-0.5 data-[drop-edge=before]:before:h-0.5 data-[drop-edge=before]:before:rounded-full data-[drop-edge=before]:before:bg-primary"
                    onDragOver={(event) => dragOverLayer(event, element.id)}
                    onDrop={(event) => dropLayer(event, element.id)}
                  >
                    <button
                      type="button"
                      draggable
                      aria-label={m.drag_layer({ value0: label })}
                      className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData("text/plain", element.id)
                        setDraggedId(element.id)
                        setDropTarget(null)
                      }}
                      onDragEnd={resetDrag}
                    >
                      <GripVerticalIcon aria-hidden="true" />
                    </button>
                    <Button
                      data-layer-select
                      data-testid={`layer-${element.type}`}
                      type="button"
                      variant={selectedId === element.id ? "secondary" : "ghost"}
                      className="h-auto min-w-0 flex-1 justify-start text-left"
                      onClick={() => setSelectedId(element.id)}
                    >
                      <LayersIcon data-icon="inline-start" />
                      <span className="truncate">{label}</span>
                    </Button>
                  </div>
                )
              })}
              {schema.elements.length === 0 && (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  {m.ui_add_an_element_from_the_toolbar()}{" "}
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="min-w-0">
        <Card className="mb-4 bg-card/90">
          <CardContent className="flex flex-col gap-3">
            {responseBound ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {questionPalette.map((item) => {
                    const mismatch = slotMismatches.get(item.questionId)
                    return (
                      <div
                        key={item.questionId}
                        className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-background/70 p-2"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span
                            className="min-w-0 truncate text-sm font-medium"
                            title={item.prompt}
                          >
                            {item.prompt}
                          </span>
                          {mismatch && (
                            <span className="flex items-center gap-1 text-xs text-destructive">
                              <TriangleAlertIcon aria-hidden="true" className="size-3 shrink-0" />
                              {m.photo_capacity({
                                slots: mismatch.slotCount,
                                uploads: mismatch.maxImages,
                              })}
                            </span>
                          )}
                        </span>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {item.actions.map((action) => (
                            <PaletteAction
                              key={action.elementType}
                              label={action.label}
                              addLabel={m.add_question_element({
                                value0: action.label.toLowerCase(),
                                value1: item.prompt,
                              })}
                              icon={
                                action.elementType === "bound-text"
                                  ? TypeIcon
                                  : action.elementType === "image-frame"
                                    ? ImageIcon
                                    : GalleryHorizontalIcon
                              }
                              dragData={{ type: action.elementType, questionId: item.questionId }}
                              onAdd={() => add(action.elementType, item.questionId)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <Separator />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {layoutRoleLabel(layout.role)}{" "}
                {m.ui_pages_carry_no_response_so_only_static_elements_can_be_placed_on_()}{" "}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <PaletteAction
                label={m.ui_static_text()}
                addLabel={m.label_add_static_text()}
                icon={TypeIcon}
                dragData={{ type: "static-text" }}
                onAdd={() => add("static-text")}
              />
              <PaletteAction
                label={m.ui_rectangle()}
                addLabel={m.label_add_rectangle()}
                icon={RectangleHorizontalIcon}
                dragData={{ type: "rectangle" }}
                onAdd={() => add("rectangle")}
              />
              <PaletteAction
                label={m.ui_circle()}
                addLabel={m.label_add_circle()}
                icon={CircleIcon}
                dragData={{ type: "circle" }}
                onAdd={() => add("circle")}
              />
              <PaletteAction
                label={m.ui_line()}
                addLabel={m.label_add_line()}
                icon={MinusIcon}
                dragData={{ type: "line" }}
                onAdd={() => add("line")}
              />
              <PaletteAction
                label={m.ui_decorative_image()}
                addLabel={m.label_add_decorative_image()}
                icon={ImagePlusIcon}
                dragData={{ type: "decorative-image" }}
                onAdd={() => add("decorative-image")}
              />
            </div>
          </CardContent>
        </Card>

        <div
          ref={container}
          className="print-canvas flex min-h-[420px] items-center justify-center overflow-auto rounded-xl border p-3 sm:p-6"
        >
          <LayoutCanvas
            locale={project.bookLanguage}
            schema={schema}
            width={canvasWidth}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={markChanged}
            canvasRef={canvas}
            questions={project.formSchema.questions}
            onDropElement={(data, center) => add(data.type, data.questionId, center)}
          />
        </div>
      </div>

      <Card
        data-testid="layout-inspector"
        aria-label={m.ui_inspector()}
        className="h-[28rem] bg-card/90 xl:sticky xl:top-20 xl:h-[calc(100dvh-6rem)]"
      >
        <CardHeader>
          <div className="-mx-1 flex items-center gap-0.5">
            <IconAction label={m.ui_undo()} disabled={historyIndex.current <= 0}>
              <Button
                data-testid="button-undo"
                variant="ghost"
                size="icon-sm"
                aria-label={m.ui_undo()}
                disabled={historyIndex.current <= 0}
                onClick={() => {
                  if (historyIndex.current <= 0) return
                  historyIndex.current -= 1
                  markChanged(structuredClone(history.current[historyIndex.current]!), false)
                }}
              >
                <Undo2Icon />
              </Button>
            </IconAction>
            <IconAction
              label={m.ui_redo()}
              disabled={historyIndex.current >= history.current.length - 1}
            >
              <Button
                data-testid="button-redo"
                variant="ghost"
                size="icon-sm"
                aria-label={m.ui_redo()}
                disabled={historyIndex.current >= history.current.length - 1}
                onClick={() => {
                  if (historyIndex.current >= history.current.length - 1) return
                  historyIndex.current += 1
                  markChanged(structuredClone(history.current[historyIndex.current]!), false)
                }}
              >
                <Redo2Icon />
              </Button>
            </IconAction>
          </div>
          <CardAction>
            <SaveIndicator state={saveState} />
          </CardAction>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ScrollArea className="h-full pr-3">
            <FieldGroup>
              <Field>
                <FieldLabel>{m.ui_layout_name()}</FieldLabel>
                <Input
                  aria-label={m.ui_layout_name()}
                  value={name}
                  maxLength={200}
                  onChange={(event) => changeName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{m.ui_page_background()}</FieldLabel>
                <Input
                  aria-label={m.ui_page_background()}
                  type="color"
                  value={schema.background}
                  onChange={(event) =>
                    markChanged({
                      ...schema,
                      background: event.target.value,
                    })
                  }
                />
              </Field>
            </FieldGroup>
            <Separator className="my-5" />
            {selected ? (
              <ElementInspector
                element={selected}
                questions={project.formSchema.questions}
                limits={styleLimits}
                onChange={changeSelected}
                onChooseDecorative={(file) => void uploadDecorative(selected.id, file)}
                decorativeUploading={decorativeUploadingId === selected.id}
                actions={
                  <>
                    <IconAction label={m.ui_align_horizontal_centre()}>
                      <Button
                        data-testid="button-align-horizontal-centre"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_align_horizontal_centre()}
                        onClick={() =>
                          changeSelected({
                            ...selected,
                            geometry: {
                              ...selected.geometry,
                              x: (pageSpecification.trimWidthMm - selected.geometry.width) / 2,
                            },
                          })
                        }
                      >
                        <AlignCenterHorizontalIcon />
                      </Button>
                    </IconAction>
                    <IconAction label={m.ui_align_vertical_centre()}>
                      <Button
                        data-testid="button-align-vertical-centre"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_align_vertical_centre()}
                        onClick={() =>
                          changeSelected({
                            ...selected,
                            geometry: {
                              ...selected.geometry,
                              y: (pageSpecification.trimHeightMm - selected.geometry.height) / 2,
                            },
                          })
                        }
                      >
                        <AlignCenterVerticalIcon />
                      </Button>
                    </IconAction>
                    <IconAction label={m.ui_send_backward_one_layer()} disabled={isBackmost}>
                      <Button
                        data-testid="button-send-backward-one-layer"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_send_backward_one_layer()}
                        disabled={isBackmost}
                        onClick={() => moveLayer("backward")}
                      >
                        <ArrowDownIcon />
                      </Button>
                    </IconAction>
                    <IconAction label={m.ui_bring_forward_one_layer()} disabled={isFrontmost}>
                      <Button
                        data-testid="button-bring-forward-one-layer"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_bring_forward_one_layer()}
                        disabled={isFrontmost}
                        onClick={() => moveLayer("forward")}
                      >
                        <ArrowUpIcon />
                      </Button>
                    </IconAction>
                    <IconAction label={m.ui_send_to_back()} disabled={isBackmost}>
                      <Button
                        data-testid="button-send-to-back"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_send_to_back()}
                        disabled={isBackmost}
                        onClick={() => moveLayer("back")}
                      >
                        <SendToBackIcon />
                      </Button>
                    </IconAction>
                    <IconAction label={m.ui_bring_to_front()} disabled={isFrontmost}>
                      <Button
                        data-testid="button-bring-to-front"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_bring_to_front()}
                        disabled={isFrontmost}
                        onClick={() => moveLayer("front")}
                      >
                        <BringToFrontIcon />
                      </Button>
                    </IconAction>
                    <IconAction label={m.ui_duplicate_selected_element()}>
                      <Button
                        data-testid="button-duplicate-selected-element"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_duplicate_selected_element()}
                        onClick={() => {
                          const duplicate = {
                            ...structuredClone(selected),
                            id: crypto.randomUUID(),
                            geometry: {
                              ...selected.geometry,
                              x: selected.geometry.x + 4,
                              y: selected.geometry.y + 4,
                            },
                          }
                          markChanged({
                            ...schema,
                            elements: [...schema.elements, duplicate],
                          })
                          setSelectedId(duplicate.id)
                        }}
                      >
                        <CopyIcon />
                      </Button>
                    </IconAction>
                    <IconAction label={m.ui_delete_selected_element()}>
                      <Button
                        data-testid="button-delete-selected-element"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={m.ui_delete_selected_element()}
                        onClick={deleteSelected}
                      >
                        <Trash2Icon />
                      </Button>
                    </IconAction>
                  </>
                }
              />
            ) : (
              <p
                data-testid="text-ui_select_an_element_on_the_canvas_or_in_the_layers_list"
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {m.ui_select_an_element_on_the_canvas_or_in_the_layers_list()}{" "}
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
})

export function LayoutsPanel({
  project,
  onProjectChange,
}: {
  project: Project
  onProjectChange: (project: Project) => void
}) {
  const [selectedId, setSelectedId] = useState(project.layouts[0]?.id ?? null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editorSaveState, setEditorSaveState] = useState<SaveState>("saved")
  const [formatChanging, setFormatChanging] = useState(false)
  const [layoutChanging, setLayoutChanging] = useState(false)
  const [pendingOrientation, setPendingOrientation] = useState<PageOrientation | null>(null)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const editorRef = useRef<EditorHandle>(null)
  const projectRef = useRef(project)
  projectRef.current = project
  const selected = project.layouts.find((layout) => layout.id === selectedId) ?? project.layouts[0]

  useEffect(() => {
    if (selectedId && !project.layouts.some((layout) => layout.id === selectedId)) {
      setSelectedId(project.layouts[0]?.id ?? null)
    }
  }, [project.layouts, selectedId])

  if (project.archivedAt) {
    return (
      <Alert>
        <ArchiveIcon />
        <AlertTitle>{m.ui_this_project_is_archived()}</AlertTitle>
        <AlertDescription>
          {m.ui_layouts_stay_exactly_as_they_were_unarchive_the_project_to_edit_t()}{" "}
        </AlertDescription>
      </Alert>
    )
  }

  if (project.state !== "closed") {
    return (
      <Alert>
        <LockIcon />
        <AlertTitle>{m.ui_layout_authoring_begins_after_collection_closes()}</AlertTitle>
        <AlertDescription>
          {m.ui_this_keeps_the_workflow_deliberate_and_ensures_the_response_set_i()}{" "}
        </AlertDescription>
      </Alert>
    )
  }

  const updateLayouts = (layouts: LayoutRecord[]) =>
    onProjectChange({
      ...projectRef.current,
      layouts,
      bookStatus: projectRef.current.bookStatus === "not-generated" ? "not-generated" : "stale",
    })

  const onEditorSaved = (updated: LayoutRecord) =>
    updateLayouts(
      projectRef.current.layouts.map((layout) => (layout.id === updated.id ? updated : layout))
    )

  const selectLayout = async (layoutId: string) => {
    if (layoutId === selected?.id || formatChanging || layoutChanging) return
    setLayoutChanging(true)
    try {
      if ((await editorRef.current?.flush()) === false) return
      setEditorSaveState("saved")
      setSelectedId(layoutId)
    } finally {
      setLayoutChanging(false)
    }
  }

  async function runAfterEditorSave(action: () => Promise<void>) {
    if (formatChanging || layoutChanging) return
    setLayoutChanging(true)
    try {
      if ((await editorRef.current?.flush()) === false) return
      await action()
    } finally {
      setLayoutChanging(false)
    }
  }

  const tabLayouts = orderedLayouts(project.layouts)
  const movable = reorderableLayouts(project.layouts)
  const movableIndex = selected ? movable.findIndex((layout) => layout.id === selected.id) : -1

  const canMove = (offset: -1 | 1) =>
    movableIndex >= 0 && movableIndex + offset >= 0 && movableIndex + offset < movable.length

  const moveLabel = (direction: "up" | "down") =>
    selected && isCoverRole(selected.role)
      ? m.pinned_cover({
          value0: layoutRoleLabel(selected.role),
          value1: selected.role === "front-cover" ? m.position_first() : m.position_last(),
        })
      : m.move_layout({ value0: direction === "up" ? m.direction_up() : m.direction_down() })

  const moveSelectedLayout = async (offset: -1 | 1) => {
    if (!canMove(offset)) return
    await runAfterEditorSave(async () => {
      const ids = movable.map((layout) => layout.id)
      const index = movableIndex
      ;[ids[index + offset], ids[index]] = [ids[index], ids[index + offset]]
      const result = await projectApi.layoutAction<{ layouts: LayoutRecord[] }>(project.id, {
        action: "reorder",
        layoutIds: ids,
      })
      updateLayouts(result.layouts)
    })
  }

  const deleteSelectedLayout = async () => {
    if (!selected || formatChanging || layoutChanging) return

    setLayoutChanging(true)
    try {
      await editorRef.current?.settle()
      await projectApi.deleteLayout(project.id, selected.id)
      editorRef.current?.discard()
      const index = project.layouts.findIndex((layout) => layout.id === selected.id)
      const remaining = orderedLayouts(
        project.layouts.filter((layout) => layout.id !== selected.id)
      ).map((layout, position) => ({ ...layout, position }))
      setSelectedId(remaining[Math.max(0, index - 1)]?.id ?? null)
      setEditorSaveState("saved")
      updateLayouts(remaining)
    } catch (error) {
      void editorRef.current?.flush()
      toast.error(error instanceof Error ? error.message : m.ui_delete_failed())
    } finally {
      setLayoutChanging(false)
    }
  }

  const changePageFormat = async (
    pageFormat: PageFormat,
    pageOrientation: PageOrientation,
    resetLayouts = false
  ) => {
    if (formatChanging || layoutChanging) return
    setFormatChanging(true)
    try {
      if ((await editorRef.current?.flush()) === false) return
      const updated = await projectApi.layoutAction<Project>(project.id, {
        action: "set-page-format",
        pageFormat,
        pageOrientation,
        resetLayouts,
      })
      onProjectChange(updated)
      setSelectedId(
        updated.layouts.some((layout) => layout.id === selectedId)
          ? selectedId
          : (updated.layouts[0]?.id ?? null)
      )
      setEditorEpoch((value) => value + 1)
      captureAnalyticsEvent("layout_editor:page_format_changed", {
        page_format: pageFormat,
        page_orientation: pageOrientation,
        layouts_reset: resetLayouts,
      })
      toast.success(
        m.page_format_changed({
          value0: pageFormatLabel(pageFormat),
          value1: orientationLabel(pageOrientation),
        })
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m.ui_page_format_change_failed())
    } finally {
      setFormatChanging(false)
      setPendingOrientation(null)
    }
  }

  const workspaceDisabled = formatChanging || layoutChanging
  const formatControlsDisabled = workspaceDisabled || editorSaveState !== "saved"

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <h2 data-testid="heading-page-layouts" className="font-heading text-2xl">
            {m.ui_page_layouts()}
          </h2>
          <div className="flex items-end gap-2">
            <Field className="w-24 gap-1">
              <FieldLabel>{m.ui_page_size()}</FieldLabel>
              <Select
                items={PAGE_FORMATS.map((format) => ({
                  value: format,
                  label: pageFormatLabel(format),
                }))}
                value={project.pageFormat}
                disabled={formatControlsDisabled}
                onValueChange={(value) => {
                  if (!value || value === project.pageFormat) return
                  void changePageFormat(value as PageFormat, project.pageOrientation)
                }}
              >
                <SelectTrigger data-testid="combobox-page-size" aria-label={m.ui_page_size()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PAGE_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {pageFormatLabel(format)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-32 gap-1">
              <FieldLabel>{m.ui_orientation()}</FieldLabel>
              <Select
                value={project.pageOrientation}
                items={PAGE_ORIENTATIONS.map((value) => ({
                  value,
                  label: orientationLabel(value),
                }))}
                disabled={formatControlsDisabled}
                onValueChange={(value) => {
                  if (!value || value === project.pageOrientation) return
                  const orientation = value as PageOrientation
                  if (project.layouts.length > 0) setPendingOrientation(orientation)
                  else void changePageFormat(project.pageFormat, orientation, true)
                }}
              >
                <SelectTrigger
                  data-testid="combobox-page-orientation"
                  aria-label={m.ui_page_orientation()}
                  className="capitalize"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PAGE_ORIENTATIONS.map((orientation) => (
                      <SelectItem
                        data-testid={`orientation-${orientation}`}
                        key={orientation}
                        value={orientation}
                        className="capitalize"
                      >
                        {orientationLabel(orientation)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <div
          className="flex min-w-0 flex-wrap items-center gap-2"
          inert={workspaceDisabled || undefined}
          aria-busy={workspaceDisabled}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Tabs
              className="min-w-0"
              value={selected?.id ?? ""}
              onValueChange={(value) => void selectLayout(value)}
            >
              <TabsList className="max-w-full justify-start overflow-x-auto">
                {tabLayouts.map((layout) => {
                  const active = layout.id === selected?.id
                  const RoleIcon = LAYOUT_ROLE_ICONS[layout.role]

                  return (
                    <TabsTrigger
                      key={layout.id}
                      value={layout.id}
                      className="max-w-56 shrink-0 text-foreground"
                      onKeyDown={(event) => {
                        if (active && event.key === "Delete") setDeleteDialogOpen(true)
                      }}
                    >
                      {RoleIcon && (
                        <RoleIcon
                          aria-label={layoutRoleLabel(layout.role)}
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="truncate">{layout.name}</span>
                      {active && (
                        <span
                          data-testid={`delete-layout-${layout.id}`}
                          aria-label={m.delete_named_layout({ value0: layout.name })}
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleteDialogOpen(true)
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <XIcon />
                        </span>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
            <BackgroundPicker
              compact
              pageFormat={project.pageFormat}
              pageOrientation={project.pageOrientation}
              takenRoles={project.layouts.map((layout) => layout.role)}
              onCreate={async (preset, role) => {
                await runAfterEditorSave(async () => {
                  const layout = await projectApi.layoutAction<LayoutRecord>(project.id, {
                    action: "create",
                    name:
                      preset.id === "blank" || role !== "submission"
                        ? defaultLayoutName(
                            role,
                            project.layouts.filter((item) => item.role === "submission").length
                          )
                        : m.background_name({ value0: preset.name }),
                    backgroundPresetId: preset.id,
                    role,
                  })
                  updateLayouts([...projectRef.current.layouts, layout])
                  setSelectedId(layout.id)
                })
              }}
            />
          </div>
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle data-testid="heading-delete-this-layout">
                  {m.ui_delete_this_layout()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.ui_if_this_layout_is_used_in_the_generated_book_you_must_regenerate_()}{" "}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel">{m.ui_cancel()}</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-delete-layout"
                  variant="destructive"
                  onClick={() => void deleteSelectedLayout()}
                >
                  {m.ui_delete_layout()}{" "}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {selected && (
            <>
              <IconAction label={moveLabel("up")} disabled={!canMove(-1)}>
                <Button
                  data-testid="button-move-layout-up"
                  variant="outline"
                  size="icon"
                  aria-label={m.ui_move_layout_up()}
                  disabled={!canMove(-1)}
                  onClick={() => void moveSelectedLayout(-1)}
                >
                  <ArrowUpIcon />
                </Button>
              </IconAction>
              <IconAction label={moveLabel("down")} disabled={!canMove(1)}>
                <Button
                  data-testid="button-move-layout-down"
                  variant="outline"
                  size="icon"
                  aria-label={m.ui_move_layout_down()}
                  disabled={!canMove(1)}
                  onClick={() => void moveSelectedLayout(1)}
                >
                  <ArrowDownIcon />
                </Button>
              </IconAction>
              <Button
                data-testid="button-duplicate-layout"
                variant="outline"
                onClick={async () => {
                  await runAfterEditorSave(async () => {
                    const duplicate = await projectApi.layoutAction<LayoutRecord>(project.id, {
                      action: "duplicate",
                      layoutId: selected.id,
                    })
                    updateLayouts([...projectRef.current.layouts, duplicate])
                    setSelectedId(duplicate.id)
                  })
                }}
              >
                <CopyIcon data-icon="inline-start" />
                {m.ui_duplicate_layout()}{" "}
              </Button>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <div inert={workspaceDisabled || undefined} aria-busy={workspaceDisabled}>
          <Editor
            ref={editorRef}
            key={`${selected.id}:${editorEpoch}`}
            project={project}
            layout={selected}
            onSaveStateChange={setEditorSaveState}
            onSaved={onEditorSaved}
          />
        </div>
      ) : (
        <Card className="min-h-80 bg-card/80">
          <CardHeader className="m-auto place-items-center text-center">
            <span className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted">
              <LayoutTemplateIcon />
            </span>
            <CardTitle data-testid="heading-create-the-first-layout">
              {m.ui_create_the_first_layout()}
            </CardTitle>
            <CardDescription>
              {m.ui_add_text_image_frames_galleries_shapes_and_decorative_images()}{" "}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <AlertDialog
        open={pendingOrientation !== null}
        onOpenChange={(open) => {
          if (!open && !formatChanging) setPendingOrientation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="heading-reset-layouts-and-change-orientation">
              {m.ui_reset_layouts_and_change_orientation()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.orientation_reset({
                orientation:
                  pendingOrientation === "portrait"
                    ? m.orientation_portrait()
                    : m.orientation_landscape(),
                count: project.layouts.length,
              })}{" "}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel" disabled={formatChanging}>
              {m.ui_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-reset-layouts"
              variant="destructive"
              disabled={formatChanging || !pendingOrientation}
              onClick={() => {
                if (!pendingOrientation) return
                void changePageFormat(project.pageFormat, pendingOrientation, true)
              }}
            >
              {formatChanging && (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              )}
              {m.ui_reset_layouts()}{" "}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
