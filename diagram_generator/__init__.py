"""
Standalone Math Diagram Generator
==================================
Generates SVG diagrams for mathematical questions using AI (GPT-4o).
Portable module — can be used in any Python project.

Usage:
    from diagram_generator import DiagramGenerator

    gen = DiagramGenerator(api_key="sk-...")
    svg_code, png_path = gen.generate(
        description="A right-angled triangle with sides 3cm, 4cm, 5cm, with the right angle marked",
        diagram_type="geometry",
        output_dir="./output",
        output_format="both",  # "svg", "png", or "both"
    )
"""

from .generator import DiagramGenerator
from .types import DiagramType

__all__ = ["DiagramGenerator", "DiagramType"]
__version__ = "1.0.0"
