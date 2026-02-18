from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT_DIR / "public"


def build_base_icon(size: int = 1024) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Brand background: rounded square with vertical blue gradient.
    gradient = Image.new("RGBA", (size, size))
    gradient_draw = ImageDraw.Draw(gradient)
    top = (14, 165, 233, 255)  # sky-500
    bottom = (29, 78, 216, 255)  # blue-700

    for y in range(size):
        t = y / (size - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        gradient_draw.line(((0, y), (size, y)), fill=color)

    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    image.paste(gradient, (0, 0), mask)

    # Soft highlight to avoid a flat look at large sizes.
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (int(size * 0.12), int(size * 0.08), int(size * 0.80), int(size * 0.76)),
        fill=(255, 255, 255, 38),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.03)))
    image.alpha_composite(glow)

    draw = ImageDraw.Draw(image)

    # Core symbol: magnifier for research/discovery.
    lens_center = (int(size * 0.42), int(size * 0.42))
    lens_radius = int(size * 0.22)
    stroke = int(size * 0.08)
    white = (255, 255, 255, 245)

    draw.ellipse(
        (
            lens_center[0] - lens_radius,
            lens_center[1] - lens_radius,
            lens_center[0] + lens_radius,
            lens_center[1] + lens_radius,
        ),
        outline=white,
        width=stroke,
    )

    handle_start = (int(size * 0.57), int(size * 0.57))
    handle_end = (int(size * 0.80), int(size * 0.80))
    draw.line((handle_start, handle_end), fill=white, width=stroke, joint="curve")

    cap_radius = stroke // 2
    for x, y in (handle_start, handle_end):
        draw.ellipse((x - cap_radius, y - cap_radius, x + cap_radius, y + cap_radius), fill=white)

    # Subtle "paper lines" inside lens to hint at literature search.
    line_color = (186, 230, 253, 235)
    line_width = max(4, int(size * 0.026))
    line_left = lens_center[0] - int(size * 0.10)
    line_top = lens_center[1] - int(size * 0.08)
    line_gap = int(size * 0.06)
    line_lengths = [int(size * 0.17), int(size * 0.13), int(size * 0.15)]

    for i, length in enumerate(line_lengths):
        y = line_top + i * line_gap
        draw.line((line_left, y, line_left + length, y), fill=line_color, width=line_width)

    return image


def save_png(source: Image.Image, path: Path, size: int) -> None:
    icon = source.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(path, format="PNG", optimize=True)


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    base = build_base_icon()

    save_png(base, PUBLIC_DIR / "researchfinder-icon.png", 256)
    save_png(base, PUBLIC_DIR / "android-chrome-512x512.png", 512)
    save_png(base, PUBLIC_DIR / "android-chrome-192x192.png", 192)
    save_png(base, PUBLIC_DIR / "apple-touch-icon.png", 180)
    save_png(base, PUBLIC_DIR / "favicon-32x32.png", 32)
    save_png(base, PUBLIC_DIR / "favicon-16x16.png", 16)

    base.save(PUBLIC_DIR / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    main()
