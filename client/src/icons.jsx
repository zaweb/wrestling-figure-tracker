// Stroke icons used across the app. All decorative: the control around each one carries the label.

function Svg({ size = 24, children, fill = 'none', strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? 'currentColor' : 'none'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const EyeIcon = (p) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)
export const SearchIcon = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Svg>
)
export const CameraIcon = (p) => (
  <Svg {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.2-1.8a1.5 1.5 0 0 1 1.25-.7h4.9a1.5 1.5 0 0 1 1.25.7L16.9 6h1.6A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    <circle cx="12" cy="12.5" r="3.75" />
  </Svg>
)
export const StackIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
)
export const PersonIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Svg>
)
export const SortIcon = (p) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
)
export const BackIcon = (p) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)
export const ChevronIcon = (p) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)
export const ChevronDownIcon = (p) => (
  <Svg {...p} strokeWidth={2.5}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)
export const CloseIcon = (p) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
export const PlusIcon = (p) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const CheckIcon = (p) => (
  <Svg {...p} strokeWidth={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const ImageIcon = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M21 16l-5-5-9 9" />
  </Svg>
)
export const HomeScreenIcon = (p) => (
  <Svg {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 8v6M9 11h6" />
  </Svg>
)

// A generic figure silhouette for rows without a photo.
export function FigureSilhouette({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      <circle cx="20" cy="8" r="5" />
      <path d="M12 15h16l-2 11h-3l-1 11h-4l-1-11h-3z" />
      <path d="M12 15l-6 6 3 3 4-4zM28 15l6 6-3 3-4-4z" />
    </svg>
  )
}

export function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}
