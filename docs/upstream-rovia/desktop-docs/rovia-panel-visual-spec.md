# Rovia Panel Visual Spec

## 1. Design Intent
Rovia panel should feel like a calm support surface instead of a productivity dashboard.
The reference language combines system precision, emotional warmth, and low-pressure guidance.

Three principles:
- Calm first: avoid loud alerts, dense charts, and overly sharp contrast.
- One card, one message: each card should communicate a single state, task, or insight.
- Sensor to feeling: physiological and distance data should be translated into human-readable cues.

## 2. Visual Direction

### Color System
- App background: `#586157`
- Light surface: `#E0DFDD`
- Dark surface: `#1D1D1D`
- Text on light: `#111111`
- Text on dark: `#F0F0F0`
- Accent purple: `#9855D4`
- Accent yellow: `#E6FF00`
- Accent coral: `#FF665E`
- Accent green: `#7DCC77`
- Accent orange: `#F5A623`

### Typography
- System labels: `Space Mono`, fallback to local monospace
- Reading copy: `Georgia`, fallback to serif
- Use uppercase mono labels for section framing
- Use large serif or tabular numerals for timers, greetings, and key values

### Shape And Spacing
- Outer frame radius: `28px`
- Card radius: `16px - 18px`
- Card padding: `18px - 24px`
- Vertical gap between cards: `20px - 24px`
- Use stacked-card shadows only for the primary card on each page

## 3. Component Rules

### Header
- Use date as a mono system label
- Greeting is the primary headline
- Utility actions stay minimal and pill-shaped

### Cards
- Light cards carry task management and editable content
- Dark cards carry timer, focus, and insight content
- Each card gets one circular accent icon at top-right
- Primary card may use a stacked background to imply priority

### Navigation
- Keep page switching minimal
- Use two rounded tabs: `Focus` and `Todo`
- Tabs should be calm and clear, never overly saturated

### Buttons
- Primary action uses coral or orange
- Secondary action uses light neutral surfaces
- Preserve generous hit areas and visible pressed states

## 4. Content Mapping For Rovia

### Focus Page
- Primary stacked card: current session and active task
- Dark timer card: countdown and focus state
- Dark insight card: HRV, stress, presence, last sensor update
- Light support card: quick actions, sync mode, session summary, sensor demo controls

### Todo Page
- Primary stacked card: active task and current binding
- Summary card: progress, latest session, sync mode
- Input card: add new task
- Task stream: editable todo list with clear current and done states

## 5. Tone Of Copy
- Prefer gentle guidance over command language
- Avoid guilt-inducing phrasing
- Use short, quiet copy for empty states and system updates

Examples:
- "You can start with one small task."
- "Rovia is holding this round for you."
- "Sensor data updated just now."

## 6. Do / Don't

Do:
- Keep the hierarchy obvious with size and spacing
- Use accent colors as signals, not decoration everywhere
- Let the timer and current task remain the two strongest elements

Don't:
- Mix glassmorphism with this language
- Use tiny unreadable labels
- Overload one card with too many metrics
- Turn every state into a bright warning
