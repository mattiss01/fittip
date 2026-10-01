/**
 * The mark beside anything the Coach AI does (owner, 1 Oct 2026): two
 * four-point sparks, as most apps mark their AI features. Decorative — the
 * control it sits in always says in words that the coach is involved.
 */
export function CoachSpark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-coach-spark
    >
      <path d="M10 3.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5z" />
      <path d="M18.5 14c.25 1.95 1.3 3 3.25 3.25-1.95.25-3 1.3-3.25 3.25-.25-1.95-1.3-3-3.25-3.25 1.95-.25 3-1.3 3.25-3.25z" />
    </svg>
  );
}
