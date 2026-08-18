type Rgb = readonly [red: number, green: number, blue: number];
type Color = string | Rgb;

function rgb(color: Color): Rgb {
  if (typeof color !== "string") return color;
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

export function blendRgb(foreground: string, background: string, alpha: number): Rgb {
  const foregroundRgb = rgb(foreground);
  const backgroundRgb = rgb(background);
  return [
    foregroundRgb[0] * alpha + backgroundRgb[0] * (1 - alpha),
    foregroundRgb[1] * alpha + backgroundRgb[1] * (1 - alpha),
    foregroundRgb[2] * alpha + backgroundRgb[2] * (1 - alpha),
  ];
}

export function blendHex(foreground: string, background: string, alpha: number): string {
  return `#${blendRgb(foreground, background, alpha)
    .map((value) =>
      Math.round(value)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function contrastRatio(foreground: Color, background: Color): number {
  const channel = (value: number) => {
    value /= 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color: Color) => {
    const [red, green, blue] = rgb(color);
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
