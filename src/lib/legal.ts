/**
 * FitTip's privacy notice and Terms, shown on the public `/privacy` and
 * `/terms` pages (owner, 15 Nov 2026; ADR-043 decision 5). Plain data, in
 * English (owner's choice), shaped as a layered notice: a short summary
 * first, then sections with stable anchors the consent screens link to.
 *
 * Changing what either says changes what people agreed to: give it a new
 * `TERMS_VERSION` (the date of the change), and everyone is asked again,
 * since an acceptance of an older version counts as none.
 *
 * Written from research of 15 Nov 2026 (GDPR Art. 13, EDPB 05/2020 on
 * consent) and reworked for Austria on 16 Nov 2026, where the operator is
 * based (B4): the Datenschutzbehörde, §165(3) TKG 2021 for cookies, Austrian
 * law with §6(1) Z 9 KSchG for liability, and §25 MedienG for the
 * disclosure. A draft for a private, invitation-only beta, not legal advice;
 * the owner decides whether anyone checks it. The providers' terms are as
 * they stated them on those dates: Vercel's free plan offers no data
 * processing agreement, and OpenAI is named with standard contractual
 * clauses because its Data Privacy Framework entry could not be confirmed.
 *
 * The operator's name, address and email are read from Vercel variables
 * (`readOperator`), not written here: the repository is public, the site
 * must show them (owner, 16 Nov 2026). Without them the pages show
 * placeholders; nothing refuses to run.
 */
export const TERMS_VERSION = "2026-11-17";

/** A labelled fact, drawn as a card: a service, a retention period. */
export type LegalItem = {
  readonly label: string;
  readonly lines: readonly string[];
};

export type LegalSection = {
  /** A stable anchor, so a consent screen can link to the exact place. */
  readonly id: string;
  readonly heading: string;
  /** One plain sentence that says the section in short. */
  readonly lead: string;
  readonly paragraphs?: readonly string[];
  readonly items?: readonly LegalItem[];
};

export type LegalDocument = {
  readonly title: string;
  readonly updated: string;
  /** The first layer: what someone reading only this must know. */
  readonly summary: readonly string[];
  readonly sections: readonly LegalSection[];
};

/** Who runs FitTip, as the documents name them. */
export type Operator = {
  readonly name: string;
  readonly address: string;
  readonly email: string;
};

const PLACEHOLDER: Operator = {
  name: "[full name]",
  address: "[street, postcode, city], Austria",
  email: "[contact email]",
};

/**
 * The operator from `FITTIP_OPERATOR_NAME`, `FITTIP_OPERATOR_ADDRESS` and
 * `FITTIP_OPERATOR_EMAIL`. Each one that is missing or blank shows its
 * placeholder, so a variable not yet set never locks anyone out.
 */
export function readOperator(
  env: Record<string, string | undefined> = process.env,
): Operator {
  const read = (key: string, fallback: string) => env[key]?.trim() || fallback;
  return {
    name: read("FITTIP_OPERATOR_NAME", PLACEHOLDER.name),
    address: read("FITTIP_OPERATOR_ADDRESS", PLACEHOLDER.address),
    email: read("FITTIP_OPERATOR_EMAIL", PLACEHOLDER.email),
  };
}

const AUTHORITY =
  "the Austrian Data Protection Authority (Datenschutzbehörde), Barichgasse 40–42, 1030 Vienna, dsb.gv.at";

export function privacyNotice({
  name: OPERATOR,
  address: ADDRESS,
  email: EMAIL,
}: Operator): LegalDocument {
  return {
    title: "Privacy notice",
    updated: "17 November 2026",
    summary: [
      `FitTip is a free, invitation-only training app run by one person, ${OPERATOR}.`,
      "It keeps your account, your training and what you tell it about yourself, so it can plan with you.",
      "What you write about your health (pain, illness, injury) is kept only with your separate consent.",
      "The AI coach is optional. Only if you agree to it is what it needs sent to OpenAI in the USA.",
      "The operator runs the database and can technically read it. Encrypted backups are kept for about 4 weeks.",
      "No ads, no analytics, no tracking. Delete your account and everything in it at any time.",
      `Questions: ${EMAIL}.`,
    ],
    sections: [
      {
        id: "who",
        heading: "Who is responsible",
        lead: `${OPERATOR} runs FitTip and is responsible for your data.`,
        paragraphs: [
          `${OPERATOR}, ${ADDRESS}, ${EMAIL}. FitTip is too small to need a data protection officer: write to me directly.`,
          "This is also the disclosure under §25 of the Austrian Media Act (MedienG): a private, non-commercial site.",
        ],
      },
      {
        id: "what",
        heading: "What FitTip keeps",
        lead: "Your account, what you tell FitTip about yourself, and your training.",
        paragraphs: [
          "You need an email address and a password to have an account; without them FitTip cannot work. Everything else is up to you: leave out what you don't want to share, and FitTip plans with less.",
        ],
        items: [
          {
            label: "Account",
            lines: [
              "Your email address, and your password, which the sign-in service keeps only in scrambled form.",
            ],
          },
          {
            label: "About you",
            lines: [
              "Name, birth date, height, gender, weight history, units, time zone, sports, training places, equipment and when you can train.",
            ],
          },
          {
            label: "Training",
            lines: [
              "Plans, sessions, activities, logs and your notes, goals, your roadmap, the coach's memory of you, and the coach's suggestions and notes.",
            ],
          },
          {
            label: "Your decisions",
            lines: [
              "When you agreed to the Terms, the health consent and the coach, and to which version.",
            ],
          },
        ],
      },
      {
        id: "why",
        heading: "Why, and on what legal basis",
        lead: "Only to run FitTip for you, and each use has its basis in the GDPR.",
        items: [
          {
            label: "Your account and training",
            lines: [
              "Our agreement under the Terms (Art. 6(1)(b) GDPR). FitTip is free; it is still an agreement.",
            ],
          },
          {
            label: "Health information you write down",
            lines: ["Your explicit consent (Art. 9(2)(a) GDPR)."],
          },
          {
            label: "The AI coach",
            lines: [
              "Your separate explicit consent (Art. 6(1)(a) and 9(2)(a) GDPR).",
            ],
          },
          {
            label: "Security and backups",
            lines: [
              "My legitimate interest in a safe service that can be restored (Art. 6(1)(f) GDPR). You may object to this.",
            ],
          },
          {
            label: "A record of what you agreed to",
            lines: [
              "To be able to show it (Art. 6(1)(c) with Art. 7(1) GDPR).",
            ],
          },
        ],
      },
      {
        id: "health",
        heading: "Health information",
        lead: "What you write about pain, illness, injury or how tired you are is kept only with your consent.",
        paragraphs: [
          "FitTip asks for this consent on its own line, before you start. It is needed to use FitTip, because the app reads these notes to plan more carefully when something hurts: it backs off rather than pushing on.",
          "You can withdraw it at any time, with effect for the future, by deleting your account (Settings › Delete account) or by writing to me. Withdrawing does not make what happened before unlawful.",
          "FitTip does not diagnose anything. Its suggestions are not medical advice.",
        ],
      },
      {
        id: "coach",
        heading: "The AI coach",
        lead: "Optional, and only with your separate yes: then what the coach needs goes to OpenAI.",
        paragraphs: [
          "When you ask the coach for a plan, a roadmap or a session's activities, FitTip sends it your goals, memory, training setup, recent sessions and logs, including health notes, and what you asked about.",
          "Under OpenAI's terms for its API, this is not used to train their models and is kept for up to 30 days to watch for abuse.",
          "Agree, decline or withdraw at any time in Settings › Coach and your data. Withdrawing stops new requests at once; what the coach already made stays yours.",
          "The coach only suggests. Nothing changes in your plan until you accept it, so FitTip makes no automated decisions about you (Art. 22 GDPR).",
        ],
      },
      {
        id: "services",
        heading: "Who else handles your data",
        lead: "Supabase and OpenAI act only on FitTip's instructions under a data processing agreement (Art. 28 GDPR). Vercel's free plan and a personal OneDrive account come without one; OneDrive holds only encrypted backups.",
        items: [
          {
            label: "Supabase",
            lines: [
              "Database and sign-in.",
              "Data stored in Frankfurt (EU). Supabase is a US company; any access from there is covered by the European Commission's standard contractual clauses.",
            ],
          },
          {
            label: "Vercel",
            lines: [
              "Runs the app and sees each request, unencrypted, as it passes.",
              "On its free plan, which FitTip uses, Vercel offers no data processing agreement and handles requests under its own terms and privacy notice. EU and USA; certified under the EU–US Data Privacy Framework.",
            ],
          },
          {
            label: "OpenAI",
            lines: [
              "The AI coach, only with your consent.",
              "USA. Covered by the European Commission's standard contractual clauses in OpenAI's data processing addendum.",
            ],
          },
          {
            label: "Microsoft OneDrive",
            lines: [
              "Keeps the backups, encrypted on the operator's computer before they are uploaded, so Microsoft cannot read them. A personal account, without a data processing agreement.",
              "EU and USA. Certified under the EU–US Data Privacy Framework.",
            ],
          },
        ],
        paragraphs: [
          "Nobody else is given your data. Ask me for a copy of the safeguards.",
        ],
      },
      {
        id: "retention",
        heading: "How long",
        lead: "As long as you have an account, and a short while after in backups.",
        items: [
          {
            label: "Account and training",
            lines: ["Until you delete your account, then removed at once."],
          },
          {
            label: "Backups",
            lines: [
              "A weekly copy, and one before each change to the database, encrypted with a key only the operator holds, kept in their OneDrive for 4 weeks and deleted at the next backup after that. OneDrive's recycle bin can keep a deleted copy for up to 30 more days.",
            ],
          },
          {
            label: "Request logs at Vercel",
            lines: ["Up to 1 hour."],
          },
          {
            label: "Coach requests at OpenAI",
            lines: ["Up to 30 days, for abuse monitoring."],
          },
          {
            label: "Records of what you agreed to",
            lines: ["As long as your account exists."],
          },
        ],
      },
      {
        id: "cookies",
        heading: "Cookies",
        lead: "Only the cookies FitTip needs to work, so no cookie banner.",
        paragraphs: [
          "One keeps you signed in; one remembers that you closed the coach question until your next sign-in. They need no consent (§165(3) TKG 2021). No analytics, ads or tracking.",
        ],
      },
      {
        id: "rights",
        heading: "Your rights",
        lead: "See, correct, delete, restrict, take with you, object, withdraw, complain.",
        paragraphs: [
          "You can ask for a copy of your data (Art. 15 GDPR), have it corrected (16) or deleted (17), have its use restricted (18), receive it in a machine-readable form (20), and object to the processing based on legitimate interest (21). Much of it you can do in the app yourself.",
          "You can withdraw any consent at any time, with effect for the future (7(3)): the coach in Settings › Coach and your data, the health consent by deleting your account or writing to me.",
          `Write to ${EMAIL}; I answer within one month. You can also complain to a data protection authority, in particular ${AUTHORITY}.`,
        ],
      },
      {
        id: "changes",
        heading: "Changes",
        lead: "If this notice changes, FitTip shows it to you again before you go on.",
        paragraphs: [
          "If a change needs your consent, FitTip asks for it first.",
        ],
      },
    ],
  };
}

export function terms({
  name: OPERATOR,
  address: ADDRESS,
  email: EMAIL,
}: Operator): LegalDocument {
  return {
    title: "Terms",
    updated: "17 November 2026",
    summary: [
      `FitTip is a free private beta, run by ${OPERATOR}, for people they invite.`,
      "It may change, break or end; you get notice and your data first.",
      "It suggests training. It is not medical advice, and the AI can be wrong.",
      "Your account is yours alone, and so is your data.",
      "Liability follows Austrian law, which does not allow excluding it for injury to people or for gross negligence.",
    ],
    sections: [
      {
        id: "who",
        heading: "Who provides FitTip, and for whom",
        lead: `FitTip is provided by ${OPERATOR}, for invited people aged 18 or over.`,
        paragraphs: [
          `${OPERATOR}, ${ADDRESS}, ${EMAIL}.`,
          "This is also the disclosure under §25 of the Austrian Media Act (MedienG).",
        ],
      },
      {
        id: "beta",
        heading: "A private beta",
        lead: "Free, still being built, and without a promise that it is always there.",
        paragraphs: [
          "Features change, and things break and get fixed. There is no promise of availability.",
        ],
      },
      {
        id: "advice",
        heading: "Not medical advice",
        lead: "FitTip and its coach suggest training. You decide what you do.",
        paragraphs: [
          "The suggestions are not medical advice and do not replace a doctor or physiotherapist. With pain, an injury or an illness, ask one.",
          "The coach is an AI. Its suggestions can be wrong or not suit you: check them against how you feel, and stop if something hurts.",
        ],
      },
      {
        id: "account",
        heading: "Your account",
        lead: "For you alone.",
        paragraphs: [
          "Keep your password to yourself, and tell me if you think someone else knows it. Use FitTip for your own training and nothing that harms it or others.",
        ],
      },
      {
        id: "data",
        heading: "Your data",
        lead: "It stays yours.",
        paragraphs: [
          "The privacy notice says what FitTip keeps and why. You can delete your account and everything in it at any time.",
        ],
      },
      {
        id: "liability",
        heading: "Liability",
        lead: "As far as Austrian law allows for a free service, and no further.",
        paragraphs: [
          "I am liable without limit for intent and gross negligence, and for injury to life, body or health. For other damage caused by slight negligence I am not liable (§6(1) Z 9 KSchG). Liability under the Austrian Product Liability Act (PHG) is unaffected.",
        ],
      },
      {
        id: "ending",
        heading: "Ending",
        lead: "You can leave at any time; I give notice before ending your access.",
        paragraphs: [
          "You can delete your account at any time in Settings. I can end the beta or your access; unless there is a serious reason, I give you at least 4 weeks' notice, so you can ask for a copy of your data.",
        ],
      },
      {
        id: "changes",
        heading: "Changes",
        lead: "If these Terms change, FitTip asks you to accept them again before you go on.",
      },
      {
        id: "law",
        heading: "Law and contact",
        lead: "Austrian law applies.",
        paragraphs: [
          "If you are a consumer, this does not take away protection given by the law of the country where you live.",
          `Questions: ${EMAIL}.`,
        ],
      },
    ],
  };
}
