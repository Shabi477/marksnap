"""
Core diagram generator — uses GPT-4o to produce SVG code for math diagrams.
For geometry diagrams, uses a hybrid approach: GPT-4o produces structured JSON,
then Python renders precise SVG with correct angle arcs and measurements.
"""

import os
import re
import json
import uuid
import math
from pathlib import Path

from .types import DiagramType, TYPE_GUIDANCE

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


SYSTEM_PROMPT = """You are an expert SVG diagram generator for UK mathematics education.
You generate ONLY valid SVG code — no markdown, no explanations, no code fences.

CRITICAL RULES:
1. Output ONLY the raw SVG code starting with <svg and ending with </svg>.
2. Use the xmlns attribute: <svg xmlns="http://www.w3.org/2000/svg" ...>
3. All text must use a clean sans-serif font: font-family="Arial, Helvetica, sans-serif"
4. Use a white background rectangle as the first element.
5. Mathematical labels must be precise and correctly positioned.
6. Use clear, high-contrast colours suitable for printing in black & white too.
7. Keep text sizes readable (minimum 14px for labels, 12px for small annotations).
8. All shapes must have explicit stroke="#1e293b" stroke-width="2" unless otherwise specified.
9. The SVG must be self-contained — no external references, images, or fonts.
10. Ensure the diagram is mathematically accurate — angles, proportions, and measurements must be correct.
11. For geometric diagrams: label vertices with capital letters (A, B, C...).
12. Include a title element: <title>Brief description</title> for accessibility.

ANGLE MARKING — THIS IS CRITICAL, follow exactly:
- An INTERIOR angle of a polygon is the angle INSIDE the shape between two adjacent sides meeting at a vertex.
- To mark an angle at vertex V between sides VA and VB:
  1. Compute unit vectors from V toward A and from V toward B.
  2. Place a small arc (radius ~20-25px) at V, sweeping from the direction of one side to the other THROUGH THE INTERIOR of the shape.
  3. Use a <path> with M (move to arc start point), A (arc command).
  4. Place the degree label (e.g. "120°") just inside the arc, offset slightly from V toward the interior.
- NEVER draw a triangle or extra lines to indicate an angle. Use ONLY a small curved arc.
- NEVER place the angle arc on the exterior/outside of the polygon unless specifically asked for an exterior angle.
- For a right angle (90°), draw a small square (side ~12px) at the vertex instead of an arc.
- Use the actual unicode degree symbol ° in labels, not "degrees".

COLOUR PALETTE (use these for consistency):
- Primary shapes: stroke="#1e293b" fill="none" or fill="#e0e7ff"
- Highlighted/shaded areas: fill="#818cf8" fill-opacity="0.3"
- Angle arcs: stroke="#6366f1" stroke-width="1.5" fill="none"
- Labels/text: fill="#1e293b"
- Grid lines: stroke="#cbd5e1" stroke-width="0.5"
- Axes: stroke="#1e293b" stroke-width="2"
- Construction lines: stroke="#94a3b8" stroke-dasharray="5,5"
"""


def _build_prompt(description: str, diagram_type: str, extra_context: str | None = None) -> str:
    """Build the user prompt for SVG generation."""
    dtype = DiagramType(diagram_type) if diagram_type in DiagramType.__members__.values() else DiagramType.GENERAL
    guidance = TYPE_GUIDANCE.get(dtype, TYPE_GUIDANCE[DiagramType.GENERAL])

    parts = [
        f"Generate an SVG diagram for this mathematical concept:",
        f"",
        f"DESCRIPTION: {description}",
        f"",
        f"DIAGRAM TYPE: {dtype.value}",
        f"",
        f"TYPE-SPECIFIC GUIDANCE:{guidance}",
    ]
    if extra_context:
        parts.extend(["", f"ADDITIONAL CONTEXT: {extra_context}"])

    return "\n".join(parts)


def _extract_svg(raw: str) -> str:
    """Extract clean SVG from the AI response, handling markdown fences etc."""
    # Strip markdown code fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:svg|xml|html)?\s*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw)
        raw = raw.strip()

    # Find the SVG tag
    match = re.search(r"(<svg[\s\S]*?</svg>)", raw, re.IGNORECASE)
    if match:
        return match.group(1)

    # If no svg tags found, the response might be the SVG content itself
    if raw.startswith("<"):
        return raw

    raise ValueError("AI response did not contain valid SVG code")


def _add_png_background(svg_code: str) -> str:
    """Ensure SVG has a white background for PNG rendering."""
    if 'fill="white"' not in svg_code and 'fill="#fff' not in svg_code.lower():
        # Add white background rect after opening svg tag
        svg_code = re.sub(
            r"(<svg[^>]*>)",
            r'\1\n  <rect width="100%" height="100%" fill="white"/>',
            svg_code,
            count=1,
        )
    return svg_code


class DiagramGenerator:
    """
    Standalone math diagram generator.
    Uses GPT-4o to generate SVG code, with optional PNG conversion.

    Usage:
        gen = DiagramGenerator(api_key="sk-...")
        result = gen.generate(
            description="Right-angled triangle with sides 3, 4, 5",
            diagram_type="geometry",
            output_dir="./diagrams",
        )
    """

    def __init__(self, api_key: str | None = None):
        """
        Args:
            api_key: OpenAI API key. Falls back to OPEN_AI_KEY / OPENAI_API_KEY env vars.
        """
        if OpenAI is None:
            raise ImportError("openai package is required: pip install openai")

        key = api_key or os.getenv("OPEN_AI_KEY") or os.getenv("OPENAI_API_KEY")
        if not key:
            raise ValueError("OpenAI API key required — pass api_key or set OPEN_AI_KEY env var")

        self._client = OpenAI(api_key=key)

    def _generate_geometry_svg(self, description: str, extra_context: str | None = None) -> str:
        """
        Geometry-specific pipeline: GPT-4o describes the diagram as JSON,
        Python renders perfect SVG with correct angle arcs and labels.
        """
        from .svg_builder import (
            build_regular_polygon_svg, build_triangle_svg, build_parallel_lines_svg,
            build_trapezium_svg, build_angles_on_line_svg, build_angles_at_point_svg,
            build_circle_svg,
            SVGBuilder, regular_polygon_vertices, angle_arc_path, angle_label_pos,
        )

        geo_prompt = f"""Analyse this geometry diagram request and return a JSON description.
Do NOT generate SVG. Return ONLY valid JSON.

REQUEST: {description}
{f"CONTEXT: {extra_context}" if extra_context else ""}

Return one of these JSON structures:

For a REGULAR POLYGON:
{{
  "shape": "regular_polygon",
  "n_sides": 6,
  "vertex_labels": ["A", "B", "C", "D", "E", "F"],
  "angle_vertices": [0],
  "title": "Regular hexagon with interior angle",
  "side_length_label": null
}}

For a TRIANGLE (with custom vertices):
{{
  "shape": "triangle",
  "type": "general",
  "vertex_labels": ["A", "B", "C"],
  "side_labels": ["5cm", "3cm", "4cm"],
  "angle_labels": [null, null, null],
  "right_angle_vertex": null,
  "height_label": null,
  "base_label": null,
  "title": "Triangle"
}}
- "type" MUST be one of: "right_angled", "equilateral", "isosceles", "general"
- ONLY set "type": "right_angled" AND "right_angle_vertex" if the question explicitly states it is a RIGHT-ANGLED triangle
- For area questions that mention height and base, use "type": "general" (NOT "right_angled") and set "height_label" and "base_label" to draw a dashed perpendicular height line
- "right_angle_vertex" is the 0-based index of the vertex with the right angle — set to null unless the triangle IS right-angled
- "side_labels" are labels for the sides OPPOSITE each vertex: side_labels[0] is opposite vertex 0, etc.
- "height_label" is the PERPENDICULAR HEIGHT (vertical dashed line from apex to base) — this is NOT a side length
- "base_label" is the HORIZONTAL BASE of the triangle — labelled below the base
- Do NOT confuse height_label with side_labels — height is the perpendicular distance, not a sloped side

For PARALLEL LINES cut by a transversal:
{{
  "shape": "parallel_lines",
  "angle_type": "corresponding",
  "given_angle": 50,
  "given_label": "50°",
  "unknown_label": "x",
  "title": "Corresponding angles on parallel lines"
}}
- "angle_type" must be one of: "corresponding", "alternate", "co-interior"
- "given_angle" is the numeric value of the known angle
- "given_label" is the display label for the known angle (include ° symbol)
- "unknown_label" is the letter for the unknown angle

For a TRAPEZIUM (trapezoid):
{{
  "shape": "trapezium",
  "top_label": "6cm",
  "bottom_label": "10cm",
  "height_label": "4cm",
  "left_label": null,
  "right_label": null,
  "vertex_labels": ["A", "B", "C", "D"],
  "title": "Trapezium with dimensions"
}}
- "top_label" is the shorter parallel side
- "bottom_label" is the longer parallel side
- "height_label" is the perpendicular height
- vertex_labels order: [bottom-left, bottom-right, top-right, top-left]

For ANGLES ON A STRAIGHT LINE (angles summing to 180°):
{{
  "shape": "angles_on_line",
  "angles": [120, 60],
  "labels": ["120°", "x"],
  "title": "Angles on a straight line"
}}
- "angles" is the list of angle values in degrees (MUST sum to 180)
- "labels" is the display label for each angle (use the degree symbol ° for known angles, a letter like "x" for the unknown)
- Order is left to right along the line

For ANGLES AT A POINT (angles summing to 360°):
{{
  "shape": "angles_at_point",
  "angles": [90, 120, 80, 70],
  "labels": ["90°", "120°", "x", "70°"],
  "title": "Angles at a point"
}}
- "angles" is the list of angle values in degrees (MUST sum to 360)
- "labels" is the display label for each angle
- Order is counter-clockwise starting from the right (3 o'clock position)

For a CIRCLE (radius, diameter, circumference questions):
{{
  "shape": "circle",
  "radius_label": "5cm",
  "diameter_label": null,
  "centre_label": "O",
  "show_radius": true,
  "show_diameter": false,
  "title": "Circle with radius"
}}
- Set "show_radius": true and "radius_label" to a measurement to draw a radius line
- Set "show_diameter": true and "diameter_label" to a measurement to draw a diameter line
- Both can be shown together
- "centre_label" defaults to "O"

For a CUSTOM shape that doesn't fit the above:
{{
  "shape": "custom",
  "fallback": true
}}

RULES:
- "angle_vertices" is a list of 0-based vertex indices where angles should be marked
- For regular polygons, angles are calculated automatically — you just need to say which vertices
- "side_labels" is a list of labels for sides opposite each vertex — ONLY include if the user specifically mentions side lengths or measurements. Use null if not requested.
- "side_length_label" — ONLY include an actual measurement (like "5cm") if the user asks for it. Set to null otherwise. NEVER use generic labels like "s" or "a".
- "right_angle_vertex" is the 0-based index of the vertex with the right angle — ONLY set this for explicitly right-angled triangles, NOT for general area questions with height and base
- For triangle AREA questions: use type "general" with height_label and base_label. Do NOT set right_angle_vertex.
- Return ONLY the JSON, no markdown or explanations"""

        response = self._client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a geometry analysis assistant. Return ONLY valid JSON."},
                {"role": "user", "content": geo_prompt},
            ],
            temperature=0.1,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content.strip()
        spec = json.loads(raw)

        if spec.get("fallback") or spec.get("shape") == "custom":
            # Fall back to full SVG generation for complex/custom shapes
            return self._generate_raw_svg(description, "geometry", extra_context)

        if spec["shape"] == "regular_polygon":
            return build_regular_polygon_svg(
                n_sides=spec["n_sides"],
                angle_vertices=spec.get("angle_vertices"),
                vertex_labels=spec.get("vertex_labels"),
                title=spec.get("title", ""),
                side_length_label=spec.get("side_length_label"),
            )

        if spec["shape"] == "parallel_lines":
            return build_parallel_lines_svg(
                angle_type=spec.get("angle_type", "corresponding"),
                given_angle=spec.get("given_angle", 50),
                given_label=spec.get("given_label", f"{spec.get('given_angle', 50)}\u00b0"),
                unknown_label=spec.get("unknown_label", "x"),
                title=spec.get("title", "Parallel lines"),
            )

        if spec["shape"] == "trapezium":
            return build_trapezium_svg(
                top_label=spec.get("top_label"),
                bottom_label=spec.get("bottom_label"),
                height_label=spec.get("height_label"),
                left_label=spec.get("left_label"),
                right_label=spec.get("right_label"),
                vertex_labels=spec.get("vertex_labels"),
                title=spec.get("title", "Trapezium"),
            )

        if spec["shape"] == "angles_on_line":
            return build_angles_on_line_svg(
                angles=spec.get("angles", [120, 60]),
                labels=spec.get("labels", []),
                title=spec.get("title", "Angles on a straight line"),
            )

        if spec["shape"] == "angles_at_point":
            return build_angles_at_point_svg(
                angles=spec.get("angles", [90, 90, 90, 90]),
                labels=spec.get("labels", []),
                title=spec.get("title", "Angles at a point"),
            )

        if spec["shape"] == "triangle":
            # Determine triangle vertices based on type
            tri_type = spec.get("type", "general")
            ra_idx = spec.get("right_angle_vertex")  # which vertex has the 90°

            # If right_angle_vertex is specified, force right_angled type
            if ra_idx is not None:
                tri_type = "right_angled"

            if tri_type == "right_angled":
                # Base triangle: right angle at vertex 0 (bottom-left)
                # bottom-left = right angle, bottom-right, top-left
                base_verts = [(80, 320), (320, 320), (80, 80)]
                # Rotate so the right angle is at the requested vertex index
                if ra_idx is not None and 0 <= ra_idx <= 2:
                    shift = ra_idx  # rotate list so ra_idx gets the 90° corner
                    base_verts = base_verts[-shift:] + base_verts[:-shift] if shift else base_verts
                vertices = base_verts
            elif tri_type == "equilateral":
                h = 240 * math.sin(math.radians(60))
                vertices = [(200, 200 - h * 0.6), (200 - 120, 200 + h * 0.4), (200 + 120, 200 + h * 0.4)]
            elif tri_type == "isosceles":
                vertices = [(200, 60), (100, 320), (300, 320)]
            else:
                vertices = [(100, 300), (350, 300), (250, 60)]

            return build_triangle_svg(
                vertices=vertices,
                vertex_labels=spec.get("vertex_labels"),
                side_labels=spec.get("side_labels"),
                angle_labels=spec.get("angle_labels"),
                mark_right_angle=ra_idx,
                height_label=spec.get("height_label"),
                base_label=spec.get("base_label"),
                title=spec.get("title", "Triangle"),
            )

        if spec["shape"] == "circle":
            return build_circle_svg(
                radius_label=spec.get("radius_label"),
                diameter_label=spec.get("diameter_label"),
                centre_label=spec.get("centre_label", "O"),
                show_radius=spec.get("show_radius", True),
                show_diameter=spec.get("show_diameter", False),
                title=spec.get("title", "Circle"),
            )

        # Unknown shape — fall back
        return self._generate_raw_svg(description, "geometry", extra_context)

    def _generate_raw_svg(self, description: str, diagram_type: str, extra_context: str | None = None) -> str:
        """Original AI SVG generation for non-geometry diagram types."""
        prompt = _build_prompt(description, diagram_type, extra_context)
        response = self._client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
        )
        raw = response.choices[0].message.content.strip()
        return _extract_svg(raw)

    def generate_svg(
        self,
        description: str,
        diagram_type: str = "general",
        extra_context: str | None = None,
    ) -> str:
        """
        Generate SVG code for a mathematical diagram.

        For geometry: uses hybrid AI+Python approach (AI describes, Python renders).
        For other types: AI generates SVG directly.
        """
        if diagram_type == DiagramType.GEOMETRY or diagram_type == "geometry":
            return self._generate_geometry_svg(description, extra_context)
        return self._generate_raw_svg(description, diagram_type, extra_context)

    def save_svg(self, svg_code: str, output_dir: str, filename: str | None = None) -> str:
        """
        Save SVG code to a file.

        Args:
            svg_code: The SVG string to save.
            output_dir: Directory to save into (created if needed).
            filename: Optional filename (without extension). Auto-generated if omitted.

        Returns:
            Full path to the saved SVG file.
        """
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        if not filename:
            filename = f"diagram_{uuid.uuid4().hex[:8]}"
        filepath = os.path.join(output_dir, f"{filename}.svg")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(svg_code)
        return filepath

    def svg_to_png(self, svg_code: str, output_dir: str, filename: str | None = None, scale: float = 2.0) -> str:
        """
        Convert SVG code to a PNG file using cairosvg.

        Args:
            svg_code: The SVG string to convert.
            output_dir: Directory to save into.
            filename: Optional filename (without extension).
            scale: Resolution multiplier (2.0 = 2x for print quality).

        Returns:
            Full path to the saved PNG file.

        Raises:
            ImportError: If cairosvg is not installed.
        """
        try:
            import cairosvg
        except ImportError:
            raise ImportError(
                "cairosvg is required for PNG conversion: pip install cairosvg\n"
                "On Windows you may also need GTK3: https://github.com/niccokunzmann/cairosvg-wheels"
            )

        Path(output_dir).mkdir(parents=True, exist_ok=True)
        if not filename:
            filename = f"diagram_{uuid.uuid4().hex[:8]}"

        svg_with_bg = _add_png_background(svg_code)
        filepath = os.path.join(output_dir, f"{filename}.png")
        cairosvg.svg2png(
            bytestring=svg_with_bg.encode("utf-8"),
            write_to=filepath,
            scale=scale,
        )
        return filepath

    def generate(
        self,
        description: str,
        diagram_type: str = "general",
        output_dir: str = "./diagrams",
        output_format: str = "svg",
        filename: str | None = None,
        extra_context: str | None = None,
    ) -> dict:
        """
        Generate a diagram and save to file(s).

        Args:
            description: What to draw.
            diagram_type: Type of diagram (geometry, graph, number_line, etc.).
            output_dir: Where to save output files.
            output_format: "svg", "png", or "both".
            filename: Optional base filename (no extension).
            extra_context: Optional extra generation context.

        Returns:
            Dict with keys: svg_code, svg_path, png_path (if applicable).
        """
        svg_code = self.generate_svg(description, diagram_type, extra_context)

        result = {"svg_code": svg_code, "svg_path": None, "png_path": None}

        if not filename:
            filename = f"diagram_{uuid.uuid4().hex[:8]}"

        if output_format in ("svg", "both"):
            result["svg_path"] = self.save_svg(svg_code, output_dir, filename)

        if output_format in ("png", "both"):
            result["png_path"] = self.svg_to_png(svg_code, output_dir, filename)

        return result
