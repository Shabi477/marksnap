"""Diagram type definitions and SVG generation prompts."""

from enum import Enum


class DiagramType(str, Enum):
    GEOMETRY = "geometry"           # Shapes, angles, triangles, circles, constructions
    GRAPH = "graph"                 # Coordinate axes, function plots, scatter plots
    NUMBER_LINE = "number_line"     # Number lines, inequalities, ranges
    BAR_CHART = "bar_chart"         # Bar charts, histograms
    PIE_CHART = "pie_chart"         # Pie charts / sector diagrams
    FRACTION = "fraction"           # Fraction walls, shaded shapes, fraction bars
    TABLE = "table"                 # Data tables, frequency tables
    PATTERN = "pattern"             # Shape patterns, sequences, tessellations
    VENN = "venn"                   # Venn diagrams, set diagrams
    PLACE_VALUE = "place_value"     # Place value charts, counters
    AREA_MODEL = "area_model"       # Area/grid models for multiplication
    TRANSFORMATION = "transformation"  # Reflections, rotations, translations on grids
    GENERAL = "general"             # Any other mathematical diagram


# Specific SVG generation guidance per diagram type
TYPE_GUIDANCE: dict[str, str] = {
    DiagramType.GEOMETRY: """
- Calculate vertex coordinates mathematically (e.g. regular polygon vertices using cos/sin at equal angular intervals).
- Label all side lengths and angles as requested.
- To mark an angle at vertex V between sides to adjacent vertices P1 and P2:
  * Calculate the directions from V to P1 and V to P2.
  * Draw a small arc (radius 20-25px) sweeping between those two directions INSIDE the polygon.
  * Use <path d="M startX,startY A radius,radius 0 0,sweep endX,endY"> with NO fill, just stroke.
  * Place the degree label (e.g. "120°") near the arc, inside the shape.
- Mark right angles with a small square (two short perpendicular lines forming a corner), NOT an arc.
- NEVER draw extra triangles, lines, or shapes to represent angles — use ONLY a curved arc.
- Use dashed lines for construction lines or hidden edges.
- Shade interior regions with semi-transparent fill only if requested.
- Centre the diagram and use viewBox="0 0 400 300" or "0 0 400 400".
- Ensure the polygon is geometrically correct (e.g. regular hexagon has equal sides and 120° interior angles).""",

    DiagramType.GRAPH: """
- Draw x and y axes with arrowheads at the positive ends.
- Label axes with names and scale numbers at regular intervals.
- Use a grid of light grey lines behind the plot if helpful.
- Plot curves/lines with <path> or <polyline>, using stroke colours.
- Mark key points (intercepts, turning points) with small circles and labels.
- Use viewBox="0 0 400 400" and invert y-axis logic (SVG y goes down).""",

    DiagramType.NUMBER_LINE: """
- Draw a horizontal line with arrowheads at both ends.
- Mark tick marks at regular intervals with numbers below.
- Use filled/open circles for inclusive/exclusive inequality endpoints.
- Shade or bold the region if showing a range/inequality.
- Use viewBox="0 0 500 100".""",

    DiagramType.BAR_CHART: """
- Draw x and y axes with labels.
- Use <rect> elements for bars with different fill colours.
- Label each bar category below the x-axis.
- Add y-axis scale markings.
- Use viewBox="0 0 500 350".""",

    DiagramType.PIE_CHART: """
- Use <path> elements with arc commands (A) to draw sectors.
- Label each sector with its value/percentage.
- Use distinct colours with good contrast.
- Centre the pie in the viewBox.
- Use viewBox="0 0 400 400".""",

    DiagramType.FRACTION: """
- For fraction bars: draw a rectangle divided into equal parts, shade the numerator parts.
- For fraction circles: draw a circle divided into equal sectors, shade appropriately.
- Label the fraction clearly.
- Use viewBox="0 0 400 200".""",

    DiagramType.TABLE: """
- Use <rect> and <line> elements to create a clean grid.
- Use <text> elements for cell contents, centred in each cell.
- Header row should have a light background fill.
- Use viewBox="0 0 500 300".""",

    DiagramType.PATTERN: """
- Repeat shapes in a clear sequence pattern.
- Use consistent spacing and sizing.
- Show at least 4-5 elements in the pattern.
- Use different fill colours to distinguish shapes.
- Use viewBox="0 0 600 150".""",

    DiagramType.VENN: """
- Draw overlapping circles with semi-transparent fills.
- Label each set clearly outside or inside the circles.
- Place elements/numbers in the correct regions.
- Draw a surrounding rectangle for the universal set if needed.
- Use viewBox="0 0 500 350".""",

    DiagramType.PLACE_VALUE: """
- Create a table-like structure with columns for each place value (H, T, U etc).
- Use circles/counters to represent values if needed.
- Label columns clearly.
- Use viewBox="0 0 400 200".""",

    DiagramType.AREA_MODEL: """
- Draw a rectangle divided into sections.
- Label dimensions along the top and left sides.
- Show partial products inside each section.
- Use viewBox="0 0 400 300".""",

    DiagramType.TRANSFORMATION: """
- Draw a coordinate grid with x and y axes.
- Show the original shape with a solid outline.
- Show the transformed shape with a dashed outline or different colour.
- Mark the centre of rotation or mirror line if applicable.
- Use viewBox="0 0 400 400".""",

    DiagramType.GENERAL: """
- Use appropriate SVG elements for the diagram described.
- Keep it clean, well-labelled, and mathematically precise.
- Centre the content in the viewBox.
- Use viewBox="0 0 400 300".""",
}
