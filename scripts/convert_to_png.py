import os
import pymupdf

svg_path = r'D:\visitor\public\visitor-qr-code.svg'
png_path = r'D:\visitor\public\visitor-qr-code.png'
artifact_png = r'C:\Users\lalit\.gemini\antigravity-ide\brain\bde6e5b2-c453-4dcb-a1d5-24a040032276\visitor-qr-code.png'

with open(svg_path, 'rb') as f:
    svg_data = f.read()

doc = pymupdf.open(stream=svg_data, filetype='svg')
page = doc[0]
# Render at 3x scale for crisp HD quality
mat = pymupdf.Matrix(2.0, 2.0)
pix = page.get_pixmap(matrix=mat)
pix.save(png_path)
pix.save(artifact_png)
print("Generated PNG successfully:", png_path, "Dimensions:", pix.width, "x", pix.height)
