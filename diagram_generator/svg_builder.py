"""
Programmatic SVG builder for mathematical diagrams.
Handles precise geometry that AI cannot reliably produce:
angle arcs, polygon vertices, labelled measurements, etc.
"""

import math
from typing import Optional


def _fmt(n: float) -> str:
    """Format a float to 2dp, stripping trailing zeros."""
    return f"{n:.2f}".rstrip("0").rstrip(".")


def regular_polygon_vertices(n: int, cx: float, cy: float, radius: float, rotate_deg: float = -90) -> list[tuple[float, float]]:
    """
    Compute vertices of a regular n-gon centred at (cx,cy).
    rotate_deg: rotation of first vertex from 3-o'clock direction.
                Default -90 puts first vertex at the top.
    """
    verts = []
    for i in range(n):
        angle_rad = math.radians(rotate_deg) + 2 * math.pi * i / n
        x = cx + radius * math.cos(angle_rad)
        y = cy + radius * math.sin(angle_rad)
        verts.append((x, y))
    return verts


def _angle_between(vx: float, vy: float, p1x: float, p1y: float, p2x: float, p2y: float) -> tuple[float, float, bool]:
    """
    Compute the start angle, sweep angle (in degrees) for the interior angle
    at vertex V between sides VP1 and VP2, going counter-clockwise from VP1 to VP2.
    Returns (start_angle_deg, sweep_deg, large_arc_flag).
    Angles are in SVG convention (0=right, clockwise positive).
    """
    # Direction vectors from V to P1 and V to P2
    d1x, d1y = p1x - vx, p1y - vy
    d2x, d2y = p2x - vx, p2y - vy

    # Angles in standard math convention
    a1 = math.atan2(d1y, d1x)
    a2 = math.atan2(d2y, d2x)

    # Sweep from a1 to a2 going clockwise (SVG convention)
    sweep = a2 - a1
    # Normalise to [0, 2pi) — we want the interior sweep
    while sweep < 0:
        sweep += 2 * math.pi
    while sweep >= 2 * math.pi:
        sweep -= 2 * math.pi

    # For convex polygons the interior angle is the smaller sweep
    # For the general case, we take the sweep as-is
    large_arc = sweep > math.pi

    return math.degrees(a1), math.degrees(sweep), large_arc


def angle_arc_path(vx: float, vy: float, p1x: float, p1y: float, p2x: float, p2y: float,
                   radius: float = 22) -> str:
    """
    Generate an SVG <path> d-attribute for a small arc marking the angle
    at vertex V between rays VP1 and VP2.
    Uses explicit line segments along the arc to avoid SVG arc-command
    ambiguity with sweep direction.
    """
    # Angles from vertex to each ray direction
    a1 = math.atan2(p1y - vy, p1x - vx)
    a2 = math.atan2(p2y - vy, p2x - vx)

    # Shortest angular sweep from a1 to a2 (normalise to [-pi, pi])
    diff = a2 - a1
    while diff > math.pi:
        diff -= 2 * math.pi
    while diff < -math.pi:
        diff += 2 * math.pi

    if abs(diff) < 1e-6:
        return ""

    # Generate points along the arc
    n_seg = 24
    parts = [f"M {_fmt(vx + radius * math.cos(a1))},{_fmt(vy + radius * math.sin(a1))}"]
    for i in range(1, n_seg + 1):
        t = i / n_seg
        a = a1 + diff * t
        parts.append(f"L {_fmt(vx + radius * math.cos(a))},{_fmt(vy + radius * math.sin(a))}")
    return " ".join(parts)


def angle_label_pos(vx: float, vy: float, p1x: float, p1y: float, p2x: float, p2y: float,
                    offset: float = 35) -> tuple[float, float]:
    """Compute position for the angle label — along the bisector, inside the shape."""
    d1x, d1y = p1x - vx, p1y - vy
    d2x, d2y = p2x - vx, p2y - vy

    len1 = math.hypot(d1x, d1y)
    len2 = math.hypot(d2x, d2y)
    if len1 == 0 or len2 == 0:
        return vx, vy

    u1x, u1y = d1x / len1, d1y / len1
    u2x, u2y = d2x / len2, d2y / len2

    # Bisector direction
    bx = u1x + u2x
    by = u1y + u2y
    blen = math.hypot(bx, by)
    if blen == 0:
        return vx, vy
    bx /= blen
    by /= blen

    return vx + bx * offset, vy + by * offset


def _right_angle_svg(vx: float, vy: float, p1x: float, p1y: float, p2x: float, p2y: float,
                     size: float = 16) -> str:
    """Return an SVG <polygon> for a right-angle square marker at vertex V.

    Computes the 4 corners directly from unit vectors along each arm —
    no transforms, no bisector math, no ambiguity.
    """
    d1x, d1y = p1x - vx, p1y - vy
    d2x, d2y = p2x - vx, p2y - vy
    len1 = math.hypot(d1x, d1y)
    len2 = math.hypot(d2x, d2y)
    if len1 == 0 or len2 == 0:
        return ""
    u1x, u1y = d1x / len1, d1y / len1
    u2x, u2y = d2x / len2, d2y / len2

    # 4 corners: vertex, along arm1, diagonal, along arm2
    ax, ay = vx + u1x * size, vy + u1y * size
    bx, by = ax + u2x * size, ay + u2y * size
    cx, cy = vx + u2x * size, vy + u2y * size
    pts = f"{_fmt(vx)},{_fmt(vy)} {_fmt(ax)},{_fmt(ay)} {_fmt(bx)},{_fmt(by)} {_fmt(cx)},{_fmt(cy)}"
    return (
        f'  <polygon points="{pts}" '
        f'stroke="#1e293b" stroke-width="1.5" fill="none" />'
    )


class SVGBuilder:
    """Builds an SVG string element by element."""

    def __init__(self, width: int = 400, height: int = 400):
        self.width = width
        self.height = height
        self._elements: list[str] = []
        self._title = ""

    def set_title(self, title: str):
        self._title = title

    def polygon(self, vertices: list[tuple[float, float]],
                stroke: str = "#1e293b", stroke_width: float = 2,
                fill: str = "#e0e7ff", fill_opacity: float = 1.0):
        pts = " ".join(f"{_fmt(x)},{_fmt(y)}" for x, y in vertices)
        self._elements.append(
            f'  <polygon points="{pts}" stroke="{stroke}" stroke-width="{stroke_width}" '
            f'fill="{fill}" fill-opacity="{fill_opacity}" />'
        )

    def line(self, x1: float, y1: float, x2: float, y2: float,
             stroke: str = "#1e293b", stroke_width: float = 2,
             dash: Optional[str] = None):
        extra = f' stroke-dasharray="{dash}"' if dash else ""
        self._elements.append(
            f'  <line x1="{_fmt(x1)}" y1="{_fmt(y1)}" x2="{_fmt(x2)}" y2="{_fmt(y2)}" '
            f'stroke="{stroke}" stroke-width="{stroke_width}"{extra} />'
        )

    def path(self, d: str, stroke: str = "#6366f1", stroke_width: float = 1.5,
             fill: str = "none"):
        self._elements.append(
            f'  <path d="{d}" stroke="{stroke}" stroke-width="{stroke_width}" fill="{fill}" />'
        )

    def circle(self, cx: float, cy: float, r: float,
               stroke: str = "#1e293b", stroke_width: float = 2,
               fill: str = "none"):
        self._elements.append(
            f'  <circle cx="{_fmt(cx)}" cy="{_fmt(cy)}" r="{_fmt(r)}" '
            f'stroke="{stroke}" stroke-width="{stroke_width}" fill="{fill}" />'
        )

    def text(self, x: float, y: float, content: str,
             font_size: int = 18, fill: str = "#1e293b",
             anchor: str = "middle", font_weight: str = "normal"):
        self._elements.append(
            f'  <text x="{_fmt(x)}" y="{_fmt(y)}" font-family="Arial, Helvetica, sans-serif" '
            f'font-size="{font_size}px" fill="{fill}" text-anchor="{anchor}" '
            f'font-weight="{font_weight}" dominant-baseline="middle">{content}</text>'
        )

    def angle_mark(self, vx: float, vy: float, p1x: float, p1y: float, p2x: float, p2y: float,
                   label: Optional[str] = None, radius: float = 22, is_right: bool = False):
        """Draw an angle marker at vertex V with optional label."""
        if is_right:
            self._elements.append(_right_angle_svg(vx, vy, p1x, p1y, p2x, p2y))
        else:
            d = angle_arc_path(vx, vy, p1x, p1y, p2x, p2y, radius)
            if d:
                self.path(d, stroke="#6366f1", stroke_width=1.5, fill="none")

        if label:
            lx, ly = angle_label_pos(vx, vy, p1x, p1y, p2x, p2y, offset=radius + 15)
            self.text(lx, ly, label, font_size=17, fill="#4338ca")

    def vertex_label(self, x: float, y: float, label: str, cx: float, cy: float, offset: float = 18):
        """Place a vertex label pushed outward from centre (cx,cy)."""
        dx, dy = x - cx, y - cy
        dist = math.hypot(dx, dy)
        if dist == 0:
            lx, ly = x, y - offset
        else:
            lx = x + dx / dist * offset
            ly = y + dy / dist * offset
        self.text(lx, ly, label, font_size=20, font_weight="bold")

    def build(self) -> str:
        title_el = f"  <title>{self._title}</title>\n" if self._title else ""
        elements = "\n".join(self._elements)
        return (
            f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}">\n'
            f'{title_el}'
            f'  <rect width="100%" height="100%" fill="white" />\n'
            f'{elements}\n'
            f'</svg>'
        )


# ── High-level geometry builders ──

def build_regular_polygon_svg(
    n_sides: int,
    angle_vertices: Optional[list[int]] = None,
    vertex_labels: Optional[list[str]] = None,
    title: str = "",
    show_all_labels: bool = True,
    side_length_label: Optional[str] = None,
    width: int = 400,
    height: int = 400,
) -> str:
    """
    Build SVG for a regular polygon.

    Args:
        n_sides: number of sides (3=triangle, 4=square, 5=pentagon, 6=hexagon, etc.)
        angle_vertices: list of vertex indices (0-based) where interior angles should be marked
        vertex_labels: custom labels for vertices (default: A, B, C, ...)
        title: SVG title text
        show_all_labels: if True, label all vertices
        side_length_label: if set, label one side with this measurement
    """
    cx, cy = width / 2, height / 2
    radius = min(width, height) * 0.35

    verts = regular_polygon_vertices(n_sides, cx, cy, radius)

    if not vertex_labels:
        vertex_labels = [chr(65 + i) for i in range(n_sides)]  # A, B, C, ...

    svg = SVGBuilder(width, height)
    svg.set_title(title or f"Regular {n_sides}-sided polygon")

    # Draw the polygon
    svg.polygon(verts)

    # Label vertices
    if show_all_labels:
        for i, (x, y) in enumerate(verts):
            if i < len(vertex_labels):
                svg.vertex_label(x, y, vertex_labels[i], cx, cy)

    # Interior angle = (n-2)*180/n for regular polygon
    interior_angle = (n_sides - 2) * 180 / n_sides
    is_right = abs(interior_angle - 90) < 0.5

    # Mark angles
    if angle_vertices:
        for vi in angle_vertices:
            v = verts[vi]
            prev_v = verts[(vi - 1) % n_sides]
            next_v = verts[(vi + 1) % n_sides]
            svg.angle_mark(
                v[0], v[1],
                prev_v[0], prev_v[1],
                next_v[0], next_v[1],
                label=f"{interior_angle:.0f}°",
                is_right=is_right,
            )

    # Side length label
    if side_length_label and len(verts) >= 2:
        mx = (verts[0][0] + verts[1][0]) / 2
        my = (verts[0][1] + verts[1][1]) / 2
        # Push outward slightly
        dx, dy = mx - cx, my - cy
        dist = math.hypot(dx, dy)
        if dist > 0:
            mx += dx / dist * 14
            my += dy / dist * 14
        svg.text(mx, my, side_length_label, font_size=17, fill="#4338ca")

    return svg.build()


def build_triangle_svg(
    vertices: list[tuple[float, float]],
    vertex_labels: Optional[list[str]] = None,
    side_labels: Optional[list[str]] = None,
    angle_labels: Optional[list[str]] = None,
    mark_right_angle: Optional[int] = None,
    height_label: Optional[str] = None,
    base_label: Optional[str] = None,
    title: str = "Triangle",
    width: int = 400,
    height: int = 400,
) -> str:
    """
    Build SVG for a triangle with custom vertices.

    Args:
        vertices: 3 (x,y) tuples
        vertex_labels: labels for vertices (default: A, B, C)
        side_labels: labels for sides opposite to vertices [side_a, side_b, side_c]
        angle_labels: labels for angles at each vertex
        mark_right_angle: vertex index (0-2) that has a right angle
        height_label: if provided, draw a dashed height line from the apex to the base
        base_label: if provided, label the base
        title: SVG title
    """
    if not vertex_labels:
        vertex_labels = ["A", "B", "C"]

    cx = sum(v[0] for v in vertices) / 3
    cy = sum(v[1] for v in vertices) / 3

    svg = SVGBuilder(width, height)
    svg.set_title(title)
    svg.polygon(vertices)

    # Label vertices
    for i, (x, y) in enumerate(vertices):
        if i < len(vertex_labels):
            svg.vertex_label(x, y, vertex_labels[i], cx, cy)

    # Mark angles
    for i in range(3):
        v = vertices[i]
        prev_v = vertices[(i - 1) % 3]
        next_v = vertices[(i + 1) % 3]

        is_right = (mark_right_angle == i)
        # Validate the angle is actually ~90° before drawing the marker
        if is_right:
            d1 = (prev_v[0] - v[0], prev_v[1] - v[1])
            d2 = (next_v[0] - v[0], next_v[1] - v[1])
            l1, l2 = math.hypot(*d1), math.hypot(*d2)
            if l1 > 0 and l2 > 0:
                cos_a = (d1[0]*d2[0] + d1[1]*d2[1]) / (l1 * l2)
                angle_deg = math.degrees(math.acos(max(-1, min(1, cos_a))))
                if abs(angle_deg - 90) > 5:
                    is_right = False  # Don't mark non-90° angles

        label = angle_labels[i] if angle_labels and i < len(angle_labels) else None

        if is_right or label:
            svg.angle_mark(v[0], v[1], prev_v[0], prev_v[1], next_v[0], next_v[1],
                           label=label, is_right=is_right)

    # Side labels
    if side_labels:
        for i in range(3):
            if i < len(side_labels) and side_labels[i]:
                p1 = vertices[(i + 1) % 3]
                p2 = vertices[(i + 2) % 3]
                mx = (p1[0] + p2[0]) / 2
                my = (p1[1] + p2[1]) / 2
                dx, dy = mx - cx, my - cy
                dist = math.hypot(dx, dy)
                if dist > 0:
                    mx += dx / dist * 14
                    my += dy / dist * 14
                svg.text(mx, my, side_labels[i], font_size=17, fill="#4338ca")

    # Height line (dashed, from apex perpendicular to base)
    if height_label:
        # Find the apex (vertex with highest y — smallest y in SVG = top)
        # and the base (the opposite side)
        apex_idx = min(range(3), key=lambda i: vertices[i][1])
        base_p1 = vertices[(apex_idx + 1) % 3]
        base_p2 = vertices[(apex_idx + 2) % 3]
        apex = vertices[apex_idx]

        # Project apex onto the base line
        bx, by = base_p2[0] - base_p1[0], base_p2[1] - base_p1[1]
        blen2 = bx * bx + by * by
        if blen2 > 0:
            t = ((apex[0] - base_p1[0]) * bx + (apex[1] - base_p1[1]) * by) / blen2
            foot_x = base_p1[0] + t * bx
            foot_y = base_p1[1] + t * by

            # Draw dashed height line from apex to foot
            svg.line(apex[0], apex[1], foot_x, foot_y,
                     stroke="#6366f1", stroke_width=1.5, dash="5,4")

            # Right-angle marker at foot
            svg._elements.append(_right_angle_svg(
                foot_x, foot_y, apex[0], apex[1], base_p2[0], base_p2[1], size=12
            ))

            # Height label — placed alongside the dashed line, offset away from triangle centre
            hmx = (apex[0] + foot_x) / 2
            hmy = (apex[1] + foot_y) / 2
            # Compute perpendicular direction to the height line (away from centroid)
            hdir_x, hdir_y = foot_x - apex[0], foot_y - apex[1]
            h_len = math.hypot(hdir_x, hdir_y)
            if h_len > 0:
                # Perpendicular to height (two options, pick the one away from centroid)
                perp_x, perp_y = -hdir_y / h_len, hdir_x / h_len
                to_centre_x, to_centre_y = cx - hmx, cy - hmy
                if perp_x * to_centre_x + perp_y * to_centre_y > 0:
                    perp_x, perp_y = -perp_x, -perp_y  # flip to go away from centre
                svg.text(hmx + perp_x * 18, hmy + perp_y * 18, height_label, font_size=17, fill="#4338ca")
            else:
                svg.text(hmx - 20, hmy, height_label, font_size=17, fill="#4338ca")

    # Base label (below the base)
    if base_label:
        apex_idx = min(range(3), key=lambda i: vertices[i][1])
        base_p1 = vertices[(apex_idx + 1) % 3]
        base_p2 = vertices[(apex_idx + 2) % 3]
        bmx = (base_p1[0] + base_p2[0]) / 2
        bmy = (base_p1[1] + base_p2[1]) / 2
        svg.text(bmx, bmy + 22, base_label, font_size=17, fill="#4338ca")

    return svg.build()


def _parallel_markers(svg: SVGBuilder, x1: float, y1: float, x2: float, y2: float,
                      count: int = 1, size: float = 8):
    """Draw arrow-style parallel line markers (chevrons) on a line segment."""
    mx = (x1 + x2) / 2
    my = (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length  # unit along line
    nx, ny = -uy, ux  # unit normal

    offsets = [0] if count == 1 else [-6, 6]
    for off in offsets:
        cx = mx + ux * off
        cy = my + uy * off
        # Chevron: two short lines forming a > shape
        tip_x = cx + ux * size
        tip_y = cy + uy * size
        top_x = cx - ux * (size * 0.4) + nx * (size * 0.5)
        top_y = cy - uy * (size * 0.4) + ny * (size * 0.5)
        bot_x = cx - ux * (size * 0.4) - nx * (size * 0.5)
        bot_y = cy - uy * (size * 0.4) - ny * (size * 0.5)
        d = f"M {_fmt(top_x)},{_fmt(top_y)} L {_fmt(tip_x)},{_fmt(tip_y)} L {_fmt(bot_x)},{_fmt(bot_y)}"
        svg.path(d, stroke="#1e293b", stroke_width=2, fill="none")


def _angle_arc_at_intersection(
    svg: SVGBuilder,
    ix: float, iy: float,
    ray1_x: float, ray1_y: float,
    ray2_x: float, ray2_y: float,
    label: str,
    radius: float = 28,
):
    """
    Draw an angle arc at intersection point (ix,iy) between two rays,
    marking the acute/obtuse angle between them with a label.
    ray1 and ray2 are points along each ray (direction from intersection).
    """
    d = angle_arc_path(ix, iy, ray1_x, ray1_y, ray2_x, ray2_y, radius)
    if d:
        svg.path(d, stroke="#6366f1", stroke_width=2, fill="none")
    lx, ly = angle_label_pos(ix, iy, ray1_x, ray1_y, ray2_x, ray2_y, offset=radius + 14)
    svg.text(lx, ly, label, font_size=17, fill="#4338ca")


def build_parallel_lines_svg(
    angle_type: str = "corresponding",
    given_angle: float = 50,
    given_label: str = "50\u00b0",
    unknown_label: str = "x",
    title: str = "Parallel lines",
    width: int = 400,
    height: int = 400,
) -> str:
    """
    Build SVG for two parallel lines cut by a transversal, with angle markings.

    Args:
        angle_type: "corresponding", "alternate", or "co-interior"
        given_angle: the known angle in degrees (used to compute transversal slope)
        given_label: label for the known angle (e.g. "50°")
        unknown_label: label for the unknown angle (e.g. "x")
        title: SVG title text
    """
    svg = SVGBuilder(width, height)
    svg.set_title(title)

    # Layout: two horizontal parallel lines with a transversal cutting through
    line_left = 40
    line_right = 360
    line1_y = 140  # top parallel line
    line2_y = 280  # bottom parallel line

    # Draw parallel lines
    svg.line(line_left, line1_y, line_right, line1_y, stroke="#1e293b", stroke_width=2.5)
    svg.line(line_left, line2_y, line_right, line2_y, stroke="#1e293b", stroke_width=2.5)

    # Parallel markers (double chevrons)
    _parallel_markers(svg, line_left, line1_y, line_right, line1_y, count=2)
    _parallel_markers(svg, line_left, line2_y, line_right, line2_y, count=2)

    # Transversal: compute slope from the given angle
    # The angle is measured from the parallel line to the transversal
    angle_rad = math.radians(given_angle)
    # Intersection points on each parallel line
    ix1 = 170  # x-coordinate where transversal crosses line 1
    ix2 = ix1 + (line2_y - line1_y) / math.tan(angle_rad)  # x on line 2

    # Extend transversal beyond both lines
    extend = 40
    dx = ix2 - ix1
    dy = line2_y - line1_y
    length = math.hypot(dx, dy)
    ux, uy = dx / length, dy / length
    t_x1 = ix1 - ux * extend
    t_y1 = line1_y - uy * extend
    t_x2 = ix2 + ux * extend
    t_y2 = line2_y + uy * extend

    svg.line(t_x1, t_y1, t_x2, t_y2, stroke="#1e293b", stroke_width=2)

    # Now mark the angles
    # Ray directions from each intersection point:
    # Along line going right
    right1 = (line_right, line1_y)
    right2 = (line_right, line2_y)
    # Along line going left
    left1 = (line_left, line1_y)
    left2 = (line_left, line2_y)
    # Along transversal going down
    trans_down1 = (ix2 + ux * 100, line2_y + uy * 60)
    trans_down2 = (ix2 + ux * 60, line2_y + uy * 60)
    # Along transversal going up
    trans_up1 = (ix1 - ux * 100, line1_y - uy * 60)
    trans_up2 = (ix2 - ux * 100, line2_y - uy * 60)

    # Determine which angle to mark based on type
    # For acute angles (< 90°), mark the acute angle between transversal and line
    # For obtuse angles, we still mark the angle as specified

    if angle_type == "corresponding":
        # Same position at both intersections
        # Given angle at top intersection (between line-right and transversal-down)
        if given_angle <= 90:
            _angle_arc_at_intersection(svg, ix1, line1_y,
                                       right1[0], right1[1],
                                       t_x2, t_y2,
                                       given_label, radius=28)
            _angle_arc_at_intersection(svg, ix2, line2_y,
                                       right2[0], right2[1],
                                       t_x2, t_y2,
                                       unknown_label, radius=28)
        else:
            _angle_arc_at_intersection(svg, ix1, line1_y,
                                       t_x2, t_y2,
                                       right1[0], right1[1],
                                       given_label, radius=28)
            _angle_arc_at_intersection(svg, ix2, line2_y,
                                       t_x2, t_y2,
                                       right2[0], right2[1],
                                       unknown_label, radius=28)

    elif angle_type == "alternate":
        # Opposite sides of the transversal (Z-angles)
        # Given: top intersection, between transversal-down and line-right
        # Unknown: bottom intersection, between transversal-up and line-left
        if given_angle <= 90:
            _angle_arc_at_intersection(svg, ix1, line1_y,
                                       right1[0], right1[1],
                                       t_x2, t_y2,
                                       given_label, radius=28)
            _angle_arc_at_intersection(svg, ix2, line2_y,
                                       left2[0], left2[1],
                                       t_x1, t_y1,
                                       unknown_label, radius=28)
        else:
            _angle_arc_at_intersection(svg, ix1, line1_y,
                                       t_x2, t_y2,
                                       right1[0], right1[1],
                                       given_label, radius=28)
            _angle_arc_at_intersection(svg, ix2, line2_y,
                                       t_x1, t_y1,
                                       left2[0], left2[1],
                                       unknown_label, radius=28)

    elif angle_type == "co-interior":
        # Same side of transversal, between the parallel lines (C-angles)
        # Given: top intersection, between line-right and transversal-down
        # Unknown: bottom intersection, between line-right and transversal-up
        if given_angle <= 90:
            _angle_arc_at_intersection(svg, ix1, line1_y,
                                       right1[0], right1[1],
                                       t_x2, t_y2,
                                       given_label, radius=28)
            _angle_arc_at_intersection(svg, ix2, line2_y,
                                       t_x1, t_y1,
                                       right2[0], right2[1],
                                       unknown_label, radius=28)
        else:
            _angle_arc_at_intersection(svg, ix1, line1_y,
                                       t_x2, t_y2,
                                       right1[0], right1[1],
                                       given_label, radius=28)
            _angle_arc_at_intersection(svg, ix2, line2_y,
                                       right2[0], right2[1],
                                       t_x1, t_y1,
                                       unknown_label, radius=28)

    return svg.build()


def build_circle_svg(
    radius_label: str | None = None,
    diameter_label: str | None = None,
    centre_label: str | None = "O",
    show_radius: bool = True,
    show_diameter: bool = False,
    title: str = "Circle",
    width: int = 400,
    height: int = 400,
) -> str:
    """
    Build SVG for a circle with prominent radius and/or diameter lines.

    Args:
        radius_label: label for the radius line (e.g. "5cm" or "r")
        diameter_label: label for the diameter line (e.g. "10cm" or "d")
        centre_label: label for the centre point (default "O")
        show_radius: whether to draw a radius line
        show_diameter: whether to draw a diameter line
        title: SVG title
    """
    svg = SVGBuilder(width, height)
    svg.set_title(title)

    cx, cy = width / 2, height / 2
    r = min(width, height) * 0.33

    # Draw circle
    svg.circle(cx, cy, r, stroke="#1e293b", stroke_width=2, fill="#e0e7ff")

    # Centre dot
    svg._elements.append(
        f'  <circle cx="{_fmt(cx)}" cy="{_fmt(cy)}" r="4" '
        f'stroke="#1e293b" stroke-width="1" fill="#1e293b" />'
    )

    # Centre label
    if centre_label:
        svg.text(cx - 14, cy - 12, centre_label, font_size=18, fill="#1e293b", font_weight="bold")

    # Diameter line (horizontal, full width)
    if show_diameter:
        svg.line(cx - r, cy, cx + r, cy,
                 stroke="#dc2626", stroke_width=3)
        # Small endpoint dots
        svg._elements.append(
            f'  <circle cx="{_fmt(cx - r)}" cy="{_fmt(cy)}" r="3" fill="#dc2626" stroke="none" />'
        )
        svg._elements.append(
            f'  <circle cx="{_fmt(cx + r)}" cy="{_fmt(cy)}" r="3" fill="#dc2626" stroke="none" />'
        )
        if diameter_label:
            svg.text(cx, cy - 10, diameter_label, font_size=18, fill="#dc2626", font_weight="bold")

    # Radius line (from centre toward upper-right at 30°)
    if show_radius:
        angle = math.radians(30)
        rx = cx + r * math.cos(angle)
        ry = cy - r * math.sin(angle)
        svg.line(cx, cy, rx, ry,
                 stroke="#2563eb", stroke_width=3)
        # Endpoint dot on circumference
        svg._elements.append(
            f'  <circle cx="{_fmt(rx)}" cy="{_fmt(ry)}" r="3" fill="#2563eb" stroke="none" />'
        )
        if radius_label:
            lx = (cx + rx) / 2
            ly = (cy + ry) / 2 - 12
            svg.text(lx, ly, radius_label, font_size=18, fill="#2563eb", font_weight="bold")

    return svg.build()


def build_trapezium_svg(
    top_width: float = 120,
    bottom_width: float = 220,
    height_val: float = 100,
    top_label: str | None = None,
    bottom_label: str | None = None,
    height_label: str | None = None,
    left_label: str | None = None,
    right_label: str | None = None,
    vertex_labels: list[str] | None = None,
    title: str = "Trapezium",
    width: int = 400,
    height: int = 400,
) -> str:
    """
    Build SVG for a trapezium with the height line drawn OUTSIDE the shape.

    The trapezium has a longer bottom side and a shorter top side,
    centred horizontally. The height is shown as a dashed line to the
    left of the shape with right-angle markers.

    Args:
        top_width: length of the top (shorter) parallel side in SVG units
        bottom_width: length of the bottom (longer) parallel side in SVG units
        height_val: vertical distance between the two parallel sides in SVG units
        top_label: label for the top side (e.g. "6cm")
        bottom_label: label for the bottom side (e.g. "10cm")
        height_label: label for the height (e.g. "4cm")
        left_label: label for the left sloped side
        right_label: label for the right sloped side
        vertex_labels: optional list [bottom-left, bottom-right, top-right, top-left]
        title: SVG title text
    """
    svg = SVGBuilder(width, height)
    svg.set_title(title)

    # Centre the trapezium in the canvas, shifted right to leave room for height line
    cx = width / 2 + 20
    cy = height / 2

    # Vertex positions (bottom-left, bottom-right, top-right, top-left)
    by = cy + height_val / 2     # bottom y
    ty = cy - height_val / 2     # top y
    bx1 = cx - bottom_width / 2  # bottom-left x
    bx2 = cx + bottom_width / 2  # bottom-right x
    tx1 = cx - top_width / 2     # top-left x
    tx2 = cx + top_width / 2     # top-right x

    verts = [(bx1, by), (bx2, by), (tx2, ty), (tx1, ty)]

    # Draw the trapezium
    svg.polygon(verts, stroke="#1e293b", stroke_width=2.5, fill="#e0e7ff", fill_opacity=0.4)

    # --- Height line OUTSIDE the shape (to the left) ---
    h_x = bx1 - 35  # x position for the height line
    sq = 8  # right-angle marker size

    # Dashed height line
    svg.line(h_x, by, h_x, ty, stroke="#6366f1", stroke_width=1.5, dash="5,4")

    # Small horizontal ticks at top and bottom
    svg.line(h_x - 5, by, h_x + 5, by, stroke="#6366f1", stroke_width=1.5)
    svg.line(h_x - 5, ty, h_x + 5, ty, stroke="#6366f1", stroke_width=1.5)

    # Right-angle markers at top and bottom
    svg._elements.append(_right_angle_svg(h_x, by, h_x, by - 20, h_x + 20, by, size=sq))
    svg._elements.append(_right_angle_svg(h_x, ty, h_x, ty + 20, h_x + 20, ty, size=sq))

    # Height label
    if height_label:
        svg.text(h_x - 18, cy + 5, height_label, font_size=17, fill="#4338ca", anchor="middle")

    # --- Side labels ---
    label_offset = 18

    # Bottom label (below the bottom side)
    if bottom_label:
        svg.text(cx, by + label_offset + 5, bottom_label, font_size=17, fill="#4338ca")

    # Top label (above the top side)
    if top_label:
        svg.text(cx, ty - label_offset + 6, top_label, font_size=17, fill="#4338ca")

    # Left side label (midpoint of left sloped side, offset outward)
    if left_label:
        lmx = (bx1 + tx1) / 2
        lmy = (by + ty) / 2
        # Offset perpendicular to the side (outward = left)
        ldx, ldy = tx1 - bx1, ty - by
        llen = math.hypot(ldx, ldy)
        if llen > 0:
            nx, ny = ldy / llen, -ldx / llen  # outward normal (points left)
            svg.text(lmx + nx * label_offset - 5, lmy + ny * label_offset + 5,
                     left_label, font_size=17, fill="#4338ca")

    # Right side label (midpoint of right sloped side, offset outward)
    if right_label:
        rmx = (bx2 + tx2) / 2
        rmy = (by + ty) / 2
        rdx, rdy = tx2 - bx2, ty - by
        rlen = math.hypot(rdx, rdy)
        if rlen > 0:
            nx, ny = -rdy / rlen, rdx / rlen  # outward normal (points right)
            svg.text(rmx + nx * label_offset + 5, rmy + ny * label_offset + 5,
                     right_label, font_size=17, fill="#4338ca")

    # --- Vertex labels ---
    if vertex_labels:
        v_offset = 18
        positions = [
            (bx1 - v_offset, by + v_offset),       # bottom-left
            (bx2 + v_offset, by + v_offset),       # bottom-right
            (tx2 + v_offset, ty - v_offset + 8),    # top-right
            (tx1 - v_offset, ty - v_offset + 8),    # top-left
        ]
        for i, label in enumerate(vertex_labels):
            if label and i < 4:
                svg.text(positions[i][0], positions[i][1], label,
                         font_size=20, fill="#1e293b", font_weight="bold", anchor="middle")

    # --- Parallel markers on top and bottom sides ---
    _parallel_markers(svg, bx1, by, bx2, by, count=2)
    _parallel_markers(svg, tx1, ty, tx2, ty, count=2)

    return svg.build()


def build_angles_on_line_svg(
    angles: list[float],
    labels: list[str],
    title: str = "Angles on a straight line",
    width: int = 400,
    height: int = 300,
) -> str:
    """
    Build SVG showing angles on a straight line (summing to 180°).

    Args:
        angles: list of angle values in degrees (must sum to 180)
        labels: list of labels for each angle (e.g. ["120°", "x"])
        title: SVG title text
    """
    svg = SVGBuilder(width, height)
    svg.set_title(title)

    # Layout: horizontal line with vertex at centre, rays upward
    cx = width / 2
    cy = height * 0.65
    line_half = 160
    ray_len = 120

    # Draw the straight line
    svg.line(cx - line_half, cy, cx + line_half, cy, stroke="#1e293b", stroke_width=2.5)

    # Rays divide the upper semicircle into the given angles.
    # In math convention: left = π, right = 0, counter-clockwise through top.
    # SVG y-axis is flipped so we use  cy - r*sin(a)  for all y-coordinates.
    current_angle = math.pi  # start pointing left
    ray_angles = [current_angle]

    for i in range(len(angles) - 1):
        current_angle -= math.radians(angles[i])
        ray_angles.append(current_angle)
        rx = cx + ray_len * math.cos(current_angle)
        ry = cy - ray_len * math.sin(current_angle)  # y-flip: UP in SVG
        svg.line(cx, cy, rx, ry, stroke="#1e293b", stroke_width=2)

    ray_angles.append(0.0)  # right end of line

    # Draw angle arcs and labels
    arc_radius = 35
    colours = ["#6366f1", "#e11d48", "#059669", "#d97706", "#7c3aed"]
    for i in range(len(angles)):
        a_start = ray_angles[i]
        a_end = ray_angles[i + 1]
        sweep = a_start - a_end  # positive: going from larger to smaller angle

        colour = colours[i % len(colours)]
        r = arc_radius + i * 8  # stagger arcs slightly for readability

        # Draw arc from a_start to a_end (counter-clockwise in math = upward in SVG)
        n_seg = 24
        parts = [f"M {_fmt(cx + r * math.cos(a_start))},{_fmt(cy - r * math.sin(a_start))}"]
        for j in range(1, n_seg + 1):
            t = j / n_seg
            a = a_start - sweep * t
            parts.append(f"L {_fmt(cx + r * math.cos(a))},{_fmt(cy - r * math.sin(a))}")
        svg.path(" ".join(parts), stroke=colour, stroke_width=2, fill="none")

        # Label at the bisector of the angle
        mid_angle = a_start - sweep / 2
        label_r = r + 18
        lx = cx + label_r * math.cos(mid_angle)
        ly = cy - label_r * math.sin(mid_angle)
        if i < len(labels) and labels[i]:
            svg.text(lx, ly, labels[i], font_size=17, fill=colour)

    # Small filled circle at the vertex
    svg._elements.append(
        f'  <circle cx="{_fmt(cx)}" cy="{_fmt(cy)}" r="4" fill="#1e293b" />'
    )

    return svg.build()


def build_angles_at_point_svg(
    angles: list[float],
    labels: list[str],
    title: str = "Angles at a point",
    width: int = 400,
    height: int = 400,
) -> str:
    """
    Build SVG showing angles at a point (summing to 360°).

    Args:
        angles: list of angle values in degrees (must sum to 360)
        labels: list of labels for each angle (e.g. ["90°", "120°", "x", "60°"])
        title: SVG title text
    """
    svg = SVGBuilder(width, height)
    svg.set_title(title)

    cx = width / 2
    cy = height / 2
    ray_len = 140

    # Draw rays from centre, accumulating angles from 0° (pointing right)
    current_angle = 0.0
    ray_angles = [current_angle]
    for a in angles:
        current_angle += math.radians(a)
        ray_angles.append(current_angle)

    # Draw each ray
    for a in ray_angles[:-1]:  # last duplicates first (full circle)
        rx = cx + ray_len * math.cos(a)
        ry = cy - ray_len * math.sin(a)  # SVG y-axis flipped
        svg.line(cx, cy, rx, ry, stroke="#1e293b", stroke_width=2)

    # Draw angle arcs and labels
    arc_radius = 35
    colours = ["#6366f1", "#e11d48", "#059669", "#d97706", "#7c3aed", "#0284c7"]
    for i in range(len(angles)):
        a1 = ray_angles[i]
        a2 = ray_angles[i + 1]
        sweep = a2 - a1  # always positive

        colour = colours[i % len(colours)]
        r = arc_radius + (i % 3) * 8  # slight stagger for readability

        # Draw arc (counter-clockwise in math = clockwise in SVG because y is flipped)
        n_seg = 24
        parts = [f"M {_fmt(cx + r * math.cos(a1))},{_fmt(cy - r * math.sin(a1))}"]
        for j in range(1, n_seg + 1):
            t = j / n_seg
            a = a1 + sweep * t
            parts.append(f"L {_fmt(cx + r * math.cos(a))},{_fmt(cy - r * math.sin(a))}")
        svg.path(" ".join(parts), stroke=colour, stroke_width=2, fill="none")

        # Right angle marker instead of arc for 90°
        if abs(angles[i] - 90) < 0.5:
            sq = 12
            d1x = math.cos(a1)
            d1y = -math.sin(a1)
            d2x = math.cos(a2)
            d2y = -math.sin(a2)
            p1x = cx + d1x * sq
            p1y = cy + d1y * sq
            p2x = cx + d1x * sq + d2x * sq
            p2y = cy + d1y * sq + d2y * sq
            p3x = cx + d2x * sq
            p3y = cy + d2y * sq
            ra = f"M {_fmt(p1x)},{_fmt(p1y)} L {_fmt(p2x)},{_fmt(p2y)} L {_fmt(p3x)},{_fmt(p3y)}"
            svg.path(ra, stroke=colour, stroke_width=1.5, fill="none")

        # Label at the bisector
        mid_angle = a1 + sweep / 2
        label_r = r + 20
        lx = cx + label_r * math.cos(mid_angle)
        ly = cy - label_r * math.sin(mid_angle)
        if i < len(labels) and labels[i]:
            svg.text(lx, ly, labels[i], font_size=17, fill=colour)

    # Small filled circle at the centre point
    svg._elements.append(
        f'  <circle cx="{_fmt(cx)}" cy="{_fmt(cy)}" r="4" fill="#1e293b" />'
    )

    return svg.build()
