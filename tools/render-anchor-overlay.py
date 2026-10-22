import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description="Render private projected-anchor diagnostics over a Racooze map image.")
parser.add_argument("image")
parser.add_argument("projection")
parser.add_argument("output")
parser.add_argument("--scene-x", type=float, default=0)
parser.add_argument("--scene-y", type=float, default=0)
parser.add_argument("--image-scale", type=float, default=1)
parser.add_argument("--max-width", type=int, default=2200)
args = parser.parse_args()

image = Image.open(args.image).convert("RGBA")
data = json.loads(Path(args.projection).read_text(encoding="utf8"))
if isinstance(data, list):
    data = data[0]
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=max(12, image.width // 120))
for region in data["regions"]:
    point = region["projected"]
    x = (float(point["x"]) - args.scene_x) / args.image_scale
    y = (float(point["y"]) - args.scene_y) / args.image_scale
    radius = max(8, image.width // 250)
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 40, 40, 210), outline=(255, 255, 255, 255), width=2)
    draw.text((x + radius + 2, y - radius), region["area"], font=font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
Path(args.output).parent.mkdir(parents=True, exist_ok=True)
if image.width > args.max_width:
    ratio = args.max_width / image.width
    image = image.resize((args.max_width, round(image.height * ratio)), Image.Resampling.LANCZOS)
if Path(args.output).suffix.lower() in {".jpg", ".jpeg"}:
    image.convert("RGB").save(args.output, quality=88, optimize=True)
else:
    image.save(args.output, optimize=True)
