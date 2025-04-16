"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input"; // Assuming these paths are correct
import { Card } from "@/components/ui/card";   // Assuming these paths are correct
import { PaintBucket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// --- Constants ---
const exampleColors = [
  { label: "Deep Blue", value: "oklch(0.277 0.179 263.84)" },
  { label: "Vibrant Red", value: "oklch(0.627 0.277 27.23)" },
  { label: "Forest Green", value: "oklch(0.517 0.177 142.71)" },
  { label: "Royal Purple", value: "#800080" },
  { label: "Coral", value: "rgb(255, 127, 80)" },
];

// --- Helper Functions ---

// Clamps a number between min and max
function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(value, max));
}

// Converts Linear sRGB component to sRGB component (gamma correction)
function linearTosRGB(c: number): number {
  // Clamp input to avoid issues with Math.pow or out-of-range values
  c = clamp(c, 0, 1);
  if (c <= 0.0031308) {
    return 12.92 * c;
  } else {
    return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }
}

// Converts sRGB component to Linear sRGB component (gamma decompression)
function sRGBtoLinear(c: number): number {
   // Clamp input
  c = clamp(c, 0, 1);
  if (c <= 0.04045) {
    return c / 12.92;
  } else {
    return Math.pow((c + 0.055) / 1.055, 2.4);
  }
}

// --- Core Conversion Functions ---

/**
 * Converts OKLCH color space to sRGB. (ACCURATE VERSION)
 * Follows the process: OKLCH -> OKLab -> LMS -> Linear sRGB -> sRGB
 */
function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  // Handle potential NaN or undefined hue, defaulting to 0
  if (h === undefined || isNaN(h)) h = 0;

  const hRad = h * (Math.PI / 180);

  // OKLCH to OKLab
  const lab_l = l;
  const lab_a = c * Math.cos(hRad);
  const lab_b = c * Math.sin(hRad);

  // OKLab to LMS (cone fundamentals) - Using specific matrices for OKLab
  const lms_l_ = lab_l + 0.3963377774 * lab_a + 0.2158037573 * lab_b;
  const lms_m_ = lab_l - 0.1055613458 * lab_a - 0.0638541728 * lab_b;
  const lms_s_ = lab_l - 0.0894841775 * lab_a - 1.2914855480 * lab_b;

  // Apply cube root non-linearity backward (cube the components)
  const lms_l = lms_l_ * lms_l_ * lms_l_;
  const lms_m = lms_m_ * lms_m_ * lms_m_;
  const lms_s = lms_s_ * lms_s_ * lms_s_;

  // LMS to Linear sRGB (using standard transformation matrix)
  let linear_r =  4.0767468522 * lms_l - 3.3077115882 * lms_m + 0.2309647360 * lms_s;
  let linear_g = -1.2684380046 * lms_l + 2.6097574011 * lms_m - 0.3413193965 * lms_s;
  let linear_b = -0.0041960863 * lms_l - 0.7034186147 * lms_m + 1.7076147010 * lms_s;

  // Linear sRGB to sRGB (apply gamma correction)
  const r_srgb = linearTosRGB(linear_r);
  const g_srgb = linearTosRGB(linear_g);
  const b_srgb = linearTosRGB(linear_b);

  // Scale to 0-255 and round
  const r = Math.round(r_srgb * 255);
  const g = Math.round(g_srgb * 255);
  const b = Math.round(b_srgb * 255);

  // Final clamp to ensure values are strictly within 0-255 range
  return [
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255)
  ];
}

/**
 * Converts sRGB color space (0-255 range) to OKLCH. (ACCURATE VERSION)
 * Follows the process: sRGB -> Linear sRGB -> LMS -> OKLab -> OKLCH
 */
function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  // sRGB (0-255) to Linear sRGB (0-1)
  const r_linear = sRGBtoLinear(r / 255);
  const g_linear = sRGBtoLinear(g / 255);
  const b_linear = sRGBtoLinear(b / 255);

  // Linear sRGB to LMS (using standard transformation matrix)
  const lms_l = 0.4121656120 * r_linear + 0.5362752080 * g_linear + 0.0514575653 * b_linear;
  const lms_m = 0.2118561070 * r_linear + 0.6807189584 * g_linear + 0.1074065790 * b_linear;
  const lms_s = 0.0883097947 * r_linear + 0.2818474174 * g_linear + 0.6302613616 * b_linear;

  // Apply cube root non-linearity (use Math.cbrt for numerical stability)
  const lms_l_ = Math.cbrt(lms_l);
  const lms_m_ = Math.cbrt(lms_m);
  const lms_s_ = Math.cbrt(lms_s);

  // LMS to OKLab (using specific matrices for OKLab)
  const lab_l = 0.2104542553 * lms_l_ + 0.7936177850 * lms_m_ - 0.0040720468 * lms_s_;
  const lab_a = 1.9779984951 * lms_l_ - 2.4285922050 * lms_m_ + 0.4505937099 * lms_s_;
  const lab_b = 0.0259040371 * lms_l_ + 0.7827717662 * lms_m_ - 0.8086757660 * lms_s_;

  // OKLab to OKLCH
  const c = Math.sqrt(lab_a * lab_a + lab_b * lab_b); // Chroma
  let h = Math.atan2(lab_b, lab_a) * (180 / Math.PI); // Hue in degrees
  if (h < 0) {
    h += 360; // Ensure hue is in the range [0, 360)
  }

  // Return L, C, H. Clamp L (Lightness) to [0, 1] range just in case.
  return [clamp(lab_l, 0, 1), c, h];
}

// --- Parsing Function ---

/**
 * Parses a color string input into a format and its numerical values.
 */
function parseColor(input: string): { format: string; values: number[] } {
  const cleaned = input.trim().toLowerCase(); // Trim whitespace and convert to lower case

  // OKLCH: oklch(L C H / A) or oklch(L C H) - uses spaces
  if (cleaned.startsWith("oklch(")) {
    try {
        // Extract values between parentheses, ignore alpha if present
        const parts = cleaned.substring(6, cleaned.length - 1).split('/');
        const values = parts[0] // Get L C H part
                         .trim()
                         .split(/\s+/) // Split by one or more spaces
                         .map(Number);
        // Expecting 3 values (L, C, H)
        if (values.length === 3 && values.every(v => !isNaN(v))) {
             return { format: "oklch", values };
        }
    } catch (e) { /* Fall through if parsing fails */ }
  }

  // RGB/RGBA: rgb(R, G, B) or rgba(R, G, B, A) - uses commas
  if (cleaned.startsWith("rgb")) {
     try {
        const values = cleaned
          .substring(cleaned.indexOf('(') + 1, cleaned.length - 1)
          .split(",")
          .map(v => Number(v.trim())); // Trim spaces around numbers

        // Expecting 3 (RGB) or 4 (RGBA) values
        if ((values.length === 3 || values.length === 4) && values.every(v => !isNaN(v))) {
          return { format: values.length === 4 ? "rgba" : "rgb", values };
        }
    } catch (e) { /* Fall through */ }
  }

  // HEX: #RRGGBB or #RGB
  if (cleaned.startsWith("#")) {
    let hex = cleaned.substring(1);
    if (hex.length === 3) { // Expand shorthand hex #RGB to #RRGGBB
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 6) {
      try {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
             return { format: "hex", values: [r, g, b] };
        }
      } catch(e) { /* Fall through */ }
    }
  }

  // If no format matches or parsing fails
  return { format: "unknown", values: [] };
}

// --- React Components ---

/**
 * Card component to display an example color.
 */
function ColorCard({ color, onClick }: { color: { label: string; value: string }, onClick: (value: string) => void }) {
  const { format, values } = parseColor(color.value);
  let backgroundColor = color.value; // Default to original value

  // If the example is OKLCH, convert it to RGB for reliable display
  // Use the ACCURATE oklchToRgb function
  if (format === "oklch" && values.length === 3) {
    const [r, g, b] = oklchToRgb(values[0], values[1], values[2]);
    backgroundColor = `rgb(${r}, ${g}, ${b})`;
  } else if (format === "hex" && values.length === 3) {
      backgroundColor = `#${values.map(x => x.toString(16).padStart(2, '0')).join('')}`;
  } else if (format === "rgb" && values.length === 3) {
       backgroundColor = `rgb(${values[0]}, ${values[1]}, ${values[2]})`;
  }
   // Note: rgba examples might not display opacity correctly here, but background is solid

  return (
    <button
      onClick={() => onClick(color.value)}
      className="group relative overflow-hidden rounded-lg transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <div
        className="h-20 w-full rounded-t-lg shadow-md transition-transform" // Apply rounding only to top if text is below
        style={{ backgroundColor }}
      />
      {/* Moved text below the color swatch for better layout */}
      <div className="bg-card p-2 text-card-foreground rounded-b-lg">
        <p className="text-sm font-medium truncate">{color.label}</p>
        <code className="block text-xs opacity-80 truncate">{color.value}</code>
      </div>
    </button>
  );
}


/**
 * Main conversion function that orchestrates calls to specific converters.
 */
function convertColor(format: string, values: number[]): Array<{ format: string; value: string }> {
  // Basic check for invalid numbers early on
  if (!values.length || values.some(isNaN)) return [];

  let rgb: [number, number, number];
  let oklch: [number, number, number];

  try { // Wrap conversions in try-catch for safety
      switch (format) {
        case "oklch":
          // Input L is typically 0-1, C usually 0-~0.4, H is 0-360
          rgb = oklchToRgb(values[0], values[1], values[2]);
          return [
            { format: "rgb", value: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` },
            { format: "hex", value: `#${rgb.map(x => x.toString(16).padStart(2, "0")).join("")}` }
          ];
        case "rgb":
        case "rgba":
          // Ensure input RGB values are clamped 0-255 before conversion
          const r_rgb = clamp(values[0], 0, 255);
          const g_rgb = clamp(values[1], 0, 255);
          const b_rgb = clamp(values[2], 0, 255);
          oklch = rgbToOklch(r_rgb, g_rgb, b_rgb);
          return [
            // Use toFixed for cleaner output, adjust precision as needed
            { format: "oklch", value: `oklch(${oklch[0].toFixed(4)} ${oklch[1].toFixed(4)} ${oklch[2].toFixed(2)})` },
            { format: "hex", value: `#${[r_rgb, g_rgb, b_rgb].map(x => Math.round(x).toString(16).padStart(2, "0")).join("")}` }
          ];
        case "hex":
          // Input values from hex parsing should already be 0-255
          const r_hex = values[0];
          const g_hex = values[1];
          const b_hex = values[2];
          oklch = rgbToOklch(r_hex, g_hex, b_hex);
          return [
            { format: "oklch", value: `oklch(${oklch[0].toFixed(4)} ${oklch[1].toFixed(4)} ${oklch[2].toFixed(2)})` },
            { format: "rgb", value: `rgb(${r_hex}, ${g_hex}, ${b_hex})` }
          ];
        default:
          return [];
      }
  } catch (error) {
      console.error("Color conversion error:", error);
      return []; // Return empty array on error
  }
}

/**
 * The main page component.
 */
export default function Home() {
  const [input, setInput] = useState<string>("");
  const [conversions, setConversions] = useState<Array<{ format: string; value: string }>>([]);
  // previewColor should store a displayable color string (rgb/hex) for the swatch
  const [previewColor, setPreviewColor] = useState<string>("");

  const handleColorChange = (value: string) => {
    setInput(value);
    const { format, values } = parseColor(value);

    // Check if parsing was successful and values are valid numbers
    if (format !== "unknown" && values.every(v => typeof v === 'number' && !isNaN(v))) {
      const results = convertColor(format, values);
      setConversions(results);

      // Set previewColor to a calculated RGB or HEX value for reliable display
      let displayColor = "";
      try {
          if (format === 'oklch') {
              const rgb = oklchToRgb(values[0], values[1], values[2]);
              displayColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          } else if (format === 'rgb' || format === 'rgba') {
              // Ensure RGB values are clamped for display string
              displayColor = `rgb(${clamp(values[0],0,255)}, ${clamp(values[1],0,255)}, ${clamp(values[2],0,255)})`;
          } else if (format === 'hex') {
              // Hex values are already 0-255 from parsing
              displayColor = `#${values.map(x => x.toString(16).padStart(2, "0")).join("")}`;
          }
           setPreviewColor(displayColor);
      } catch (error) {
          console.error("Error setting preview color:", error);
          setPreviewColor(""); // Clear preview on error
      }

    } else {
      // Parsing failed or resulted in invalid numbers
      setConversions([]);
      setPreviewColor("");
    }
  };


  // Call the useToast hook
  const { toast } = useToast(); // <-- Use the hook here

  // --- JSX Rendering ---
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <PaintBucket className="h-8 w-8" />
            <h1 className="text-3xl font-bold tracking-tight">Color Converter</h1>
          </div>
          <p className="text-muted-foreground">
            Instantly convert between OKLCH, RGB, and HEX color formats.
          </p>
        </div>

        {/* Example Colors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {exampleColors.map((color, index) => (
            <ColorCard key={index} color={color} onClick={handleColorChange} />
          ))}
        </div>

        {/* Input and Conversion Area */}
        <div className="space-y-6">
          {/* Color Input */}
          <div className="relative">
            <Input
              value={input}
              onChange={(e) => handleColorChange(e.target.value)}
              placeholder="Enter color: oklch(...), rgb(...), #..."
              className="text-lg p-4 pr-12 w-full" // Increased padding-right for swatch
              aria-label="Color Input"
            />
            {/* Color Preview Swatch */}
            {previewColor && (
              <div
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-7 h-7 rounded-full shadow-inner border-2 border-background" // Use theme background for border
                style={{ backgroundColor: previewColor }}
                title={`Preview: ${previewColor}`} // Add tooltip
              />
            )}
          </div>

          {/* Conversion Results */}
          {conversions.length > 0 && (
            <div className="grid gap-4">
              <h2 className="text-lg font-semibold text-foreground">Conversions:</h2>
              {conversions.map((conversion, index) => (
                <Card key={index} className="p-4 bg-card shadow-sm">
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-sm font-medium uppercase text-muted-foreground tracking-wider">
                      {conversion.format}
                    </span>
                    {/* Selectable Code Block */}
                    <Button
                      variant='link'
                      onClick={() => {
                        navigator.clipboard.writeText(conversion.value);
                        toast({
                          title: "Copied!",
                          description: `${conversion.format}: ${conversion.value}`,
                          // You can add variant: "success" or other props if needed
                      });
                      }}
                      className="flex-1 bg-muted px-3 py-1.5 rounded-md text-sm font-mono text-muted-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      aria-label={`${conversion.format} value`}
                    >{conversion.value}</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Placeholder/Instructions when no input/conversion */}
          {input && conversions.length === 0 &&(
             <p className="text-center text-destructive">Invalid color value or format.</p>
          )}
           {!input && (
             <p className="text-center text-muted-foreground">Enter a color value above or click an example to see conversions.</p>
          )}

        </div>
      </div>
    </div>
  );
}