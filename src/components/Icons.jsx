function Icon({ children, size = 20, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function MicrophoneIcon(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6.8 11.5a5.2 5.2 0 0 0 10.4 0M12 16.7V21M9 21h6" />
    </Icon>
  );
}

export function DrawIcon(props) {
  return (
    <Icon {...props}>
      <path d="m4 20 4.2-1 10-10-3.2-3.2-10 10L4 20Z" />
      <path d="m13.7 7.2 3.2 3.2" />
    </Icon>
  );
}

export function KeyboardIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h.01M17 14h.01M10 14h4" />
    </Icon>
  );
}

export function ProjectsIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 7h12M6 12h12M6 17h12" />
      <path d="M3.5 7h.01M3.5 12h.01M3.5 17h.01" />
    </Icon>
  );
}

export function BackIcon(props) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function RetryIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </Icon>
  );
}

export function ArrowIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </Icon>
  );
}

export function InstallIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3v12M8 11l4 4 4-4" />
      <path d="M5 15v5h14v-5" />
    </Icon>
  );
}

export function OfflineIcon(props) {
  return (
    <Icon {...props}>
      <path d="m3 3 18 18" />
      <path d="M8.5 8.5A7.7 7.7 0 0 1 12 7c3.2 0 6 1.9 7.2 4.6M5 11.5c.4-.7.9-1.3 1.5-1.9M9.5 15.5c.7-.4 1.6-.7 2.5-.7 1.2 0 2.3.4 3.1 1.1M12 20h.01" />
    </Icon>
  );
}

export function SearchIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}

export function ExternalLinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

export function ChevronIcon(props) {
  return (
    <Icon {...props}>
      <path d="m8 10 4 4 4-4" />
    </Icon>
  );
}

export function DoneIcon(props) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </Icon>
  );
}
