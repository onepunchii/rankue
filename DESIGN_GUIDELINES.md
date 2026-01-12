# Petudy Design Guidelines 🎨

## Core Philosophy: Apple Human Interface & Glassmorphism

### 1. Typical Apple Aesthetic

- **Font**: San Francisco (SF Pro) via system font stack.
  - *Weights*: Medium to Bold is preferred on glass backgrounds for readability.
  - *Spacing*: Keep default tracking/leading.
- **Layout**:
  - Consistent spacing using 4pt/8pt grid (e.g., 8px, 16px, 24px).
  - Minimum touch target: 44x44pt.
  - Clean, spacious margins (Safe Area awareness).

### 2. Glassmorphism System

To achieve the premium "frosted glass" look:

| Property | Value / Rule | Utility Class |
|:---|:---|:---|
| **Effect** | `backdrop-filter: blur(10px)` | `.glass` / `.glass-dark` |
| **Color** | Light: `rgba(255, 255, 255, 0.15)`<br>Dark: `rgba(0, 0, 0, 0.3)` | `.glass` / `.glass-dark` |
| **Border** | 1px solid `rgba(255, 255, 255, 0.2)` | Built-in |
| **Shadow** | Soft, elevated: `0 4px 6px rgba(0,0,0,0.1)` | Built-in |

### 3. Usage Implementation

- **Base Background**: The underlying page background should be vibrant or distinctive (e.g., slightly off-white, gradient, or image) so the blur effect is visible. White-on-white hides glassmorphism.
- **Colors**: Use desaturated, simple colors for main elements to let the texture shine.

### 4. Reference

- **Apple Human Interface Guidelines (HIG)**: [https://developer.apple.com/design/human-interface-guidelines](https://developer.apple.com/design/human-interface-guidelines)
