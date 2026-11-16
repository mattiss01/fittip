/**
 * The notice a person reads before deciding whether the coach may use their
 * data (ADR-043 decision 5). Plain data, read by the dialog after sign-in and
 * by Settings › Coach and your data.
 *
 * Changing what it says changes what people agreed to: give it a new
 * `COACH_NOTICE_VERSION` (the date of the change), and everyone is asked
 * again, since a decision made against an older version counts as none. The
 * database stores the version a person read and checks its shape only.
 *
 * The OpenAI terms below were checked against OpenAI's "Your data" page for
 * the API on 12 November 2026: not used for training by default, abuse
 * monitoring logs kept up to 30 days, and FitTip calls the US endpoint
 * (the adapter's default host) with no stored application state. Data sharing is off on
 * the owner's OpenAI organization (owner, 12 Nov 2026).
 */
export const COACH_NOTICE_VERSION = "2026-11-16";

export type CoachNoticeSection = {
  readonly heading: string;
  readonly paragraphs: readonly string[];
};

export const COACH_NOTICE_TITLE = "Coach and your data";

export const COACH_NOTICE_SECTIONS: readonly CoachNoticeSection[] = [
  {
    heading: "What the coach is sent",
    paragraphs: [
      "When you ask the coach for a plan, a roadmap or a session's activities, FitTip sends it what it needs to answer: your goals, your memory, your training setup, your recent sessions and logs, and the session or plan you asked about.",
      "That includes what you wrote about pain, illness or injury in your logs and notes.",
    ],
  },
  {
    heading: "Where it goes",
    paragraphs: [
      "The coach is an AI model run by OpenAI in the USA. Under OpenAI's terms for its API, what FitTip sends is not used to train their models, and OpenAI keeps it for up to 30 days to watch for abuse.",
    ],
  },
  {
    heading: "Where FitTip keeps your data",
    paragraphs: [
      "Your account and training records are stored by Supabase in Frankfurt, and the app runs on Vercel. Backups, taken weekly and before each change to the database and encrypted so only the operator can open them, are kept in their Microsoft OneDrive.",
      "FitTip is run by one person, who manages the database and can technically read what is in it. FitTip has no screen for looking at other people's data.",
    ],
  },
  {
    heading: "What the coach gives you",
    paragraphs: [
      "Suggestions you can accept, change or ignore. They are not medical advice.",
    ],
  },
  {
    heading: "Changing your mind",
    paragraphs: [
      "You can decline now, or agree and withdraw later, in Settings › Coach and your data. Withdrawing stops new coach requests at once; plans and notes the coach already made stay yours.",
      "Deleting your account removes your data from FitTip at once. Backups keep it for about 4 weeks, and OneDrive's recycle bin up to 30 days more. Ask for a copy of your data at any time.",
    ],
  },
];
