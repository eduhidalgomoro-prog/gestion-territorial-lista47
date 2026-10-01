import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...p }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...p,
  };
}

export const IconHome = (p: P) => (<svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>);
export const IconUsers = (p: P) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c1.9.7 3 2.4 3.5 5.2" /></svg>);
export const IconCalendar = (p: P) => (<svg {...base(p)}><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>);
export const IconFunnel = (p: P) => (<svg {...base(p)}><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" /></svg>);
export const IconCheck = (p: P) => (<svg {...base(p)}><path d="m4.5 12.5 5 5L20 7" /></svg>);
export const IconChecklist = (p: P) => (<svg {...base(p)}><path d="m3.5 6.5 2 2 3.5-3.5M3.5 15.5l2 2 3.5-3.5M12 7h8.5M12 16h8.5" /></svg>);
export const IconCash = (p: P) => (<svg {...base(p)}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.8" /><path d="M6 9.5v5M18 9.5v5" /></svg>);
export const IconChart = (p: P) => (<svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></svg>);
export const IconGear = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
export const IconPlus = (p: P) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconX = (p: P) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconSearch = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>);
export const IconArrowRight = (p: P) => (<svg {...base(p)}><path d="M4 12h15M13 6l6 6-6 6" /></svg>);
export const IconArrowLeft = (p: P) => (<svg {...base(p)}><path d="M20 12H5M11 6l-6 6 6 6" /></svg>);
export const IconMore = (p: P) => (<svg {...base(p)}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>);
export const IconDownload = (p: P) => (<svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></svg>);
export const IconUpload = (p: P) => (<svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>);
export const IconLink = (p: P) => (<svg {...base(p)}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>);
export const IconPhone = (p: P) => (<svg {...base(p)}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>);
export const IconAlert = (p: P) => (<svg {...base(p)}><path d="M12 3 2 20.5h20z" /><path d="M12 10v4.5M12 17.5v.2" /></svg>);
export const IconLogout = (p: P) => (<svg {...base(p)}><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4M6 12h10" /></svg>);
export const IconEdit = (p: P) => (<svg {...base(p)}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /></svg>);
export const IconWhatsApp = ({ size = 22, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2.2A9.7 9.7 0 0 0 3.7 16.9L2.3 21.8l5-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.7-1.2.2-.6.2-1 .1-1.2l-.6-.3z" />
  </svg>
);

export const IconMap = (p: P) => (<svg {...base(p)}><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></svg>);
/** Gazebo de feria. */
export const IconGazebo = (p: P) => (<svg {...base(p)}><path d="M12 3 3 9h18z" /><path d="M5 9v11M19 9v11M3 14h18" /></svg>);
export const IconPin =(p: P) => (<svg {...base(p)}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>);
export const IconList = (p: P) => (<svg {...base(p)}><path d="M8.5 6h12M8.5 12h12M8.5 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>);
export const IconClock = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>);
export const IconUserPlus = (p: P) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M19 8v6M16 11h6" /></svg>);
export const IconClipboard = (p: P) => (<svg {...base(p)}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></svg>);
export const IconLock = (p: P) => (<svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>);
export const IconForm = (p: P) => (<svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>);
export const IconCloudOff = (p: P) => (<svg {...base(p)}><path d="M3 3l18 18M8.5 7.1A5 5 0 0 1 17 10a4 4 0 0 1 3 6.6M16 19H7a4.5 4.5 0 0 1-1.5-8.7" /></svg>);
export const IconTarget = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>);export const IconImage = (p: P) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m21 16-5-5-8 8" /></svg>);
