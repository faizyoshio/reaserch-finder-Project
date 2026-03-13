from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT_DIR = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT_DIR / "public"


def build_base_icon(size: int = 1024) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Brand background: rounded square with forest-to-amber gradient.
    gradient = Image.new("RGBA", (size, size))
    gradient_draw = ImageDraw.Draw(gradient)
    top = (15, 92, 82, 255)
    bottom = (170, 112, 34, 255)

    for y in range(size):
        t = y / (size - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        gradient_draw.line(((0, y), (size, y)), fill=color)

    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    image.paste(gradient, (0, 0), mask)

    # Soft highlights to avoid a flat look at large sizes.
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (int(size * 0.08), int(size * 0.06), int(size * 0.78), int(size * 0.72)),
        fill=(255, 255, 255, 44),
    )
    glow_draw.ellipse(
        (int(size * 0.32), int(size * 0.36), int(size * 0.96), int(size * 0.94)),
        fill=(20, 60, 54, 32),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.03)))
    image.alpha_composite(glow)

    draw = ImageDraw.Draw(image)

    # Core symbol: open book + search lens to represent broad research discovery.
    page_fill = (255, 255, 255, 238)
    page_shadow = (12, 55, 49, 56)
    page_radius = int(size * 0.07)

    left_page = (int(size * 0.18), int(size * 0.26), int(size * 0.50), int(size * 0.78))
    right_page = (int(size * 0.50), int(size * 0.26), int(size * 0.82), int(size * 0.78))

    # Subtle depth below pages.
    draw.rounded_rectangle(
        (left_page[0], left_page[1] + int(size * 0.015), left_page[2], left_page[3] + int(size * 0.015)),
        radius=page_radius,
        fill=page_shadow,
    )
    draw.rounded_rectangle(
        (right_page[0], right_page[1] + int(size * 0.015), right_page[2], right_page[3] + int(size * 0.015)),
        radius=page_radius,
        fill=page_shadow,
    )

    draw.rounded_rectangle(left_page, radius=page_radius, fill=page_fill)
    draw.rounded_rectangle(right_page, radius=page_radius, fill=page_fill)

    center_line_x = int(size * 0.50)
    draw.rectangle(
        (center_line_x - int(size * 0.012), int(size * 0.26), center_line_x + int(size * 0.012), int(size * 0.78)),
        fill=(243, 237, 224, 245),
    )

    line_color = (27, 94, 84, 190)
    line_width = max(4, int(size * 0.018))
    line_gap = int(size * 0.08)
    for i in range(4):
        y = int(size * 0.34) + i * line_gap
        draw.line((int(size * 0.24), y, int(size * 0.44), y), fill=line_color, width=line_width)
        draw.line((int(size * 0.56), y, int(size * 0.76), y), fill=line_color, width=line_width)

    lens_center = (int(size * 0.74), int(size * 0.74))
    lens_radius = int(size * 0.13)
    stroke = int(size * 0.045)

    draw.ellipse(
        (
            lens_center[0] - lens_radius,
            lens_center[1] - lens_radius,
            lens_center[0] + lens_radius,
            lens_center[1] + lens_radius,
        ),
        outline=(255, 255, 255, 250),
        width=stroke,
    )

    handle_start = (int(size * 0.82), int(size * 0.82))
    handle_end = (int(size * 0.90), int(size * 0.92))
    draw.line((handle_start, handle_end), fill=(255, 255, 255, 250), width=stroke, joint="curve")

    cap_radius = stroke // 2
    for x, y in (handle_start, handle_end):
        draw.ellipse((x - cap_radius, y - cap_radius, x + cap_radius, y + cap_radius), fill=(255, 255, 255, 250))

    return image


def save_png(source: Image.Image, path: Path, size: int) -> None:
    icon = source.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(path, format="PNG", optimize=True)


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    base = build_base_icon()

    save_png(base, PUBLIC_DIR / "researchatlas-icon.png", 256)
    save_png(base, PUBLIC_DIR / "researchfinder-icon.png", 256)
    save_png(base, PUBLIC_DIR / "android-chrome-512x512.png", 512)
    save_png(base, PUBLIC_DIR / "android-chrome-192x192.png", 192)
    save_png(base, PUBLIC_DIR / "apple-touch-icon.png", 180)
    save_png(base, PUBLIC_DIR / "favicon-32x32.png", 32)
    save_png(base, PUBLIC_DIR / "favicon-16x16.png", 16)

    base.save(PUBLIC_DIR / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    main()
