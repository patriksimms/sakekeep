import { MOTIF_VIEWBOX, type FillerMotif, type FillerPalette } from "#/domain/filler-art.ts"

export function FillerArt({ motif, palette }: { motif: FillerMotif; palette: FillerPalette }) {
  return (
    <svg
      className="size-full"
      viewBox={`0 0 ${MOTIF_VIEWBOX} ${MOTIF_VIEWBOX}`}
      preserveAspectRatio="xMidYMid meet"
      data-filler-motif={motif.id}
      aria-hidden="true"
    >
      {motif.shapes.map((shape, index) => (
        <path
          key={index}
          d={shape.d}
          fill={shape.strokeWidth ? "none" : palette[shape.tone]}
          stroke={shape.strokeWidth ? palette[shape.tone] : undefined}
          strokeWidth={shape.strokeWidth}
          strokeLinecap={shape.strokeWidth ? "round" : undefined}
        />
      ))}
    </svg>
  )
}
