// Lena — a hybrid athlete at the limits, writing in German. Three core goals,
// supporting, achieved, paused and abandoned ones, long memory, a twelve-entry
// library and ten weeks of five sessions a week, with a knee complaint three
// weeks ago. The coach's heaviest input: what is cut to fit is the test.

import {
  act,
  addDays,
  effort,
  FRI,
  lift,
  MON,
  ramp,
  run,
  SAT,
  skill,
  todayIn,
  TUE,
  WED,
} from "../lib.mjs";

const squat = (kg) =>
  act(
    "Kniebeuge",
    "Krafttraining",
    "lift",
    ramp([
      [2, 5, 40],
      [4, 5, kg],
    ]),
    {
      lib: "squat",
    },
  );
const deadlift = (kg) =>
  act(
    "Kreuzheben",
    "Krafttraining",
    "lift",
    ramp([
      [1, 5, 60],
      [3, 4, kg],
    ]),
    {
      lib: "deadlift",
      instructions: "Konventionell, Gürtel erst ab dem letzten Satz.",
    },
  );
const pullups = (sets, reps) =>
  act("Klimmzüge", "Krafttraining", "lift", lift(sets, reps), {
    lib: "pullup",
    instructions: "Vollständige Streckung unten, Kinn über die Stange.",
  });
const bench = (kg) =>
  act("Bankdrücken", "Krafttraining", "lift", lift(4, 6, kg), { lib: "bench" });
const row = (kg) =>
  act("Rudern am Kabel", "Krafttraining", "lift", lift(3, 10, kg), {
    lib: "row",
  });
const lunges = (kg) =>
  act("Ausfallschritte", "Krafttraining", "lift", lift(3, 8, kg), {
    lib: "lunge",
  });
const latPull = (kg) =>
  act("Latzug", "Krafttraining", "lift", lift(3, 10, kg), { lib: "lat" });

// Written into memory as dates, so computed: always nine weeks ahead.
const germanDate = (offset) => {
  const [, month, day] = addDays(todayIn("Europe/Berlin"), offset).split("-");
  return `${Number(day)}.${Number(month)}.`;
};
const holidayStart = germanDate(63);
const holidayEnd = germanDate(70);

/** Ten weeks of progress: occurrence n of a weekly session. */
const step = (start, per, n) => start + per * Math.min(n, 9);

const athlete = {
  key: "lena",
  // Fixed, so FITTIP_AI_OWNER_ALLOWLIST survives a re-seed.
  id: "00000000-0000-4000-a000-000000000002",
  email: "lena@fittip.local",
  displayName: "Lena",
  profile: {
    timezone: "Europe/Berlin",
    birthDate: "1991-08-23",
    heightCm: 172,
    gender: "female",
    units: "metric",
    sports: ["Krafttraining", "Laufen", "Klettern", "Mobility", "Radfahren"],
    sessionsPerWeek: 6,
    unavailableDays: ["thursday"],
    availabilityNote:
      "Mo–Fr vor der Arbeit (6:30–7:45) oder ab 18 Uhr. Donnerstags Spätdienst bis 21 Uhr. Sonntag nur locker.",
    trainingPlaces: [
      "Fitnessstudio (FitX)",
      "Boulderhalle",
      "Stadtpark / Isarufer",
      "Zuhause",
    ],
    homeEquipment: [
      "Klimmzugstange",
      "Kettlebell 16 kg",
      "Widerstandsbänder",
      "Faszienrolle",
      "Yogamatte",
    ],
  },
  weights: [
    [-70, 66.8],
    [-49, 66.1],
    [-28, 65.7],
    [-7, 65.4],
  ],
  goals: [
    {
      key: "hm",
      title: "Halbmarathon unter 1:50",
      outcome:
        "Den Münchner Halbmarathon im Frühjahr in unter 1:50:00 laufen, gleichmäßig eingeteilt (Pace ≤ 5:12/km), ohne Gehpausen.",
      sports: ["Laufen"],
      target: 140,
      tier: "core",
    },
    {
      key: "pullups",
      title: "8 saubere Klimmzüge",
      outcome:
        "8 Klimmzüge am Stück mit voller Streckung und Kinn über der Stange, ohne Kipping.",
      sports: ["Krafttraining"],
      target: 84,
      tier: "core",
    },
    {
      key: "deadlift",
      title: "Kreuzheben 1,5× Körpergewicht",
      outcome:
        "Ein sauberes Kreuzheben mit ca. 100 kg (1,5× Körpergewicht), Technik vom Trainer abgenommen.",
      sports: ["Krafttraining"],
      target: 112,
      tier: "core",
    },
    {
      key: "boulder",
      title: "6b+ flashen",
      outcome: "Einen 6b+ Boulder in der Halle im ersten Versuch schaffen.",
      sports: ["Klettern"],
      tier: "supporting",
    },
    {
      key: "mobility",
      title: "Hüfte und Brustwirbelsäule beweglicher",
      outcome:
        "Tiefe Kniebeuge mit aufrechtem Oberkörper ohne Fersen heben; Schulterbeweglichkeit für Überkopf ohne Hohlkreuz.",
      sports: ["Mobility"],
      tier: "supporting",
    },
    {
      key: "10k",
      title: "10 km unter 50 Minuten",
      outcome: "Einen 10-km-Lauf unter 50:00 schaffen.",
      sports: ["Laufen"],
      tier: "supporting",
      then: "achieve",
    },
    {
      key: "handstand",
      title: "30 Sekunden freier Handstand",
      outcome: "30 Sekunden freier Handstand ohne Wand.",
      sports: ["Mobility", "Krafttraining"],
      tier: "supporting",
      then: "pause",
    },
    {
      key: "marathon",
      title: "Marathon 2026",
      outcome: "Einen Marathon im Herbst 2026 laufen.",
      sports: ["Laufen"],
      tier: "supporting",
      then: "abandon",
    },
  ],
  memory: [
    {
      type: "profile_fact",
      content:
        "Trainiert seit ca. 6 Jahren regelmäßig. Angefangen mit Laufen (2019 erster 10 km, 2021 erster Halbmarathon in 2:04), seit 2023 strukturiertes Krafttraining nach einem 5×5-Programm, seit 2024 Bouldern einmal pro Woche. Beste Zeiten: 10 km 49:12 (Sommer 2026), Halbmarathon 1:58:40 (Frühjahr 2025). Kniebeuge 5er-Max ca. 72,5 kg, Kreuzheben 3er-Max ca. 92,5 kg, Bankdrücken 5er-Max 45 kg.",
    },
    {
      type: "profile_fact",
      content:
        "Arbeitet als Pflegekraft im Schichtdienst (meist Früh, donnerstags Spät bis 21 Uhr). An Tagen nach dem Spätdienst schläft sie oft nur 6 Stunden und fühlt sich am Freitagmorgen schwer. Hat ein Fahrrad als Hauptverkehrsmittel, ca. 25 Minuten pro Strecke zur Arbeit, das zählt sie nicht als Training.",
    },
    {
      type: "constraint",
      content:
        "Knie rechts: seit drei Wochen ziehender Schmerz außen am Knie bei längeren Läufen ab ca. km 6–7, besonders bergab. Beim Krafttraining unauffällig. Hat einen Termin beim Orthopäden in zwei Wochen. Bis dahin will sie lange Läufe kürzer halten und nicht bergab laufen.",
      expires: 14,
    },
    {
      type: "constraint",
      content:
        "Keine schweren Beine (Kniebeuge, Kreuzheben) am Tag vor einem Intervalltraining oder langen Lauf. Das hat sie im Sommer mehrmals probiert und die Qualität der Läufe hat jedes Mal gelitten.",
    },
    {
      type: "constraint",
      content:
        "Maximal 75 Minuten pro Einheit unter der Woche, weil sie vor der Frühschicht trainiert. Nur am Samstag sind längere Einheiten möglich (bis 2 Stunden).",
    },
    {
      type: "preference",
      content:
        "Mag Intervalltraining auf der Bahn lieber als Tempoläufe auf der Straße. Hört bei langen Läufen Podcasts und läuft dann gern locker. Mag es, wenn Einheiten klare Zahlen haben (Sätze, Wiederholungen, Gewicht, Pace), statt 'nach Gefühl'.",
    },
    {
      type: "preference",
      content:
        "Bouldern dienstagabends mit Freundinnen ist ihr sozial sehr wichtig und soll bleiben, auch wenn es nicht perfekt in den Plan passt. Lieber dafür woanders etwas weglassen.",
    },
    {
      type: "preference",
      content:
        "Schreibt Notizen meist auf Deutsch und möchte die Vorschläge auf Deutsch, Übungsnamen dürfen gemischt sein (z. B. 'Romanian Deadlift' ist ok).",
    },
    {
      type: "observed_pattern",
      content:
        "Wenn sie sich gut fühlt, läuft sie lockere Läufe zu schnell (oft 5:20 statt 6:00/km). Danach sind die Intervalle in der Woche schlechter. Erinnerungen an die lockere Pace helfen ihr.",
    },
    {
      type: "observed_pattern",
      content:
        "In Wochen mit vier Frühschichten in Folge fällt fast immer eine Einheit aus, meist die am Freitag. Sie fühlt sich dann schlecht, wenn sie es nicht 'nachholt'.",
    },
    {
      type: "profile_fact",
      content:
        "Ernährung: isst vegetarisch, achtet auf ca. 110 g Eiweiß am Tag, trinkt keinen Alkohol in der Woche. Hat einmal einen Eisenmangel gehabt (2024), lässt das jährlich prüfen.",
    },
    {
      type: "preference",
      content: "Möchte im Winter keinen Laufbandlauf länger als 40 Minuten.",
      then: "disable",
    },
    {
      type: "constraint",
      content:
        "Schulter links: alte Instabilität nach Sturz beim Snowboarden 2020. Kein Überkopfdrücken mit Langhantel; Kurzhantel und Landmine sind okay. Beim Bouldern keine dynamischen Züge mit links in voller Streckung.",
    },
    {
      type: "profile_fact",
      content: `Urlaub vom ${holidayStart} bis ${holidayEnd} bei der Familie im Allgäu: kein Fitnessstudio, aber Laufstrecken und eine Klimmzugstange im Keller.`,
    },
  ],
  library: [
    {
      key: "squat",
      name: "Kniebeuge",
      sport: "Krafttraining",
      description: "Low-Bar, bis parallel oder tiefer.",
      kind: "lift",
      value: lift(5, 5, 65),
    },
    {
      key: "deadlift",
      name: "Kreuzheben",
      sport: "Krafttraining",
      kind: "lift",
      value: lift(3, 5, 85),
    },
    {
      key: "pullup",
      name: "Klimmzüge",
      sport: "Krafttraining",
      description: "Obergriff, schulterbreit.",
      kind: "lift",
      value: lift(4, 4),
    },
    {
      key: "bench",
      name: "Bankdrücken",
      sport: "Krafttraining",
      kind: "lift",
      value: lift(4, 6, 42.5),
    },
    {
      key: "lat",
      name: "Latzug",
      sport: "Krafttraining",
      kind: "lift",
      value: lift(3, 10, 40),
    },
    {
      key: "row",
      name: "Rudern am Kabel",
      sport: "Krafttraining",
      kind: "lift",
      value: lift(3, 10, 35),
    },
    {
      key: "lunge",
      name: "Ausfallschritte",
      sport: "Krafttraining",
      description: "Mit Kurzhanteln, Gewicht pro Hand.",
      kind: "lift",
      value: lift(3, 8, 10),
    },
    {
      key: "easy",
      name: "Dauerlauf locker",
      sport: "Laufen",
      description: "Gesprächstempo, 5:55–6:15/km.",
      kind: "run",
      value: run({ min: 45, pace: "6:05" }),
    },
    {
      key: "intervals",
      name: "Intervalle 800 m",
      sport: "Laufen",
      description: "Auf der Bahn, 400 m Trabpause.",
      kind: "run",
      value: run({ dist: 4.8, pace: "4:50" }),
    },
    {
      key: "tempo",
      name: "Tempodauerlauf",
      sport: "Laufen",
      kind: "run",
      value: run({ min: 25, pace: "5:15" }),
    },
    {
      key: "boulder",
      name: "Bouldern",
      sport: "Klettern",
      kind: "skill",
      value: skill(25, "Boulder"),
    },
    {
      key: "flow",
      name: "Mobility-Flow",
      sport: "Mobility",
      description:
        "Hüftöffner, 90/90, Brustwirbelsäulenrotation, Couch Stretch.",
      kind: "effort",
      value: effort(15, "easy"),
    },
  ],
  saved: [
    {
      name: "Kraft Ganzkörper kurz",
      title: "Kraft Ganzkörper (45 min)",
      sport: "Krafttraining",
      intent: "Wenn die Zeit knapp ist: das Wichtigste in 45 Minuten.",
      minutes: 45,
      activities: [squat(65), pullups(3, 4), row(35)],
    },
    {
      name: "Hotel / Zuhause",
      title: "Kettlebell zu Hause",
      sport: "Krafttraining",
      intent: "Ohne Studio: Kettlebell und Stange.",
      minutes: 35,
      activities: [
        act("Kettlebell Swings", "Krafttraining", "lift", lift(5, 15, 16)),
        act("Goblet Squat", "Krafttraining", "lift", lift(4, 10, 16)),
        pullups(4, 3),
      ],
    },
    {
      name: "Lockerer Lauf + Mobility",
      title: "Locker laufen und dehnen",
      sport: "Laufen",
      minutes: 55,
      activities: [
        act(
          "Dauerlauf locker",
          "Laufen",
          "run",
          run({ min: 40, pace: "6:05" }),
          { lib: "easy" },
        ),
        act("Mobility-Flow", "Mobility", "effort", effort(15, "easy"), {
          lib: "flow",
        }),
      ],
    },
  ],
  series: [
    {
      weekdays: [MON],
      start: -70,
      title: "Kraft A",
      sport: "Krafttraining",
      intent: "Kniebeuge und Oberkörper Druck/Zug.",
      minutes: 70,
      activities: [squat(70), bench(45), row(37.5), pullups(4, 4)],
      past: (n) =>
        n === 4
          ? {
              status: "skipped",
              note: "Erkältet, Halskratzen.",
              flags: { illness: true },
            }
          : {
              status: "completed",
              minutes: 68 + (n % 3) * 4,
              effort: 7,
              actual: [
                ramp([
                  [2, 5, 40],
                  [4, 5, step(62.5, 1.25, n)],
                ]),
                lift(4, 6, step(40, 0.5, n)),
                lift(3, 10, 35),
                lift(4, n < 5 ? 3 : 4),
              ],
            },
    },
    {
      weekdays: [TUE],
      start: -70,
      title: "Bouldern mit den Mädels",
      sport: "Klettern",
      intent:
        "Technik und Spaß, keine Maximalversuche mit der linken Schulter.",
      minutes: 90,
      activities: [
        act("Bouldern", "Klettern", "skill", skill(25, "Boulder"), {
          lib: "boulder",
        }),
      ],
      past: (n) =>
        n === 4
          ? { status: "skipped", note: "Noch krank.", flags: { illness: true } }
          : {
              status: "completed",
              minutes: 95,
              effort: 6,
              actual: [skill(20 + n, "Boulder")],
            },
    },
    {
      weekdays: [WED],
      start: -70,
      title: "Intervalle 6×800 m",
      sport: "Laufen",
      intent: "VO2max: 800 m in 3:50–3:55, 400 m Trabpause.",
      minutes: 60,
      activities: [
        act("Einlaufen", "Laufen", "run", run({ min: 15, pace: "6:10" })),
        act(
          "Intervalle 800 m",
          "Laufen",
          "run",
          run({ dist: 4.8, pace: "4:50" }),
          { lib: "intervals" },
        ),
        act("Auslaufen", "Laufen", "run", run({ min: 10 })),
      ],
      past: (n) => {
        if (n === 4)
          return {
            status: "skipped",
            note: "Krank.",
            flags: { illness: true },
          };
        if (n === 7)
          return {
            status: "partially_completed",
            minutes: 40,
            effort: 8,
            actual: [run({ min: 15 }), run({ dist: 3.2, pace: "4:52" }), null],
            note: "Nach dem 4. Intervall Knie rechts außen ziehend (3/10). Abgebrochen und nach Hause gegangen.",
            flags: { pain: true },
          };
        return {
          status: "completed",
          minutes: 58,
          effort: 8,
          actual: [
            run({ min: 15 }),
            run({ dist: 4.8, pace: n < 5 ? "4:56" : "4:48" }),
            run({ min: 10 }),
          ],
        };
      },
    },
    {
      weekdays: [FRI],
      start: -70,
      title: "Kraft B",
      sport: "Krafttraining",
      intent: "Kreuzheben, Zug, einbeinig.",
      minutes: 70,
      activities: [deadlift(85), pullups(4, 4), lunges(10), latPull(40)],
      past: (n) => {
        if (n === 2 || n === 6)
          return {
            status: "skipped",
            note: "Vier Frühschichten, zu müde.",
            flags: { fatigue: n === 6 },
          };
        if (n === 4) return { status: "skipped", flags: { illness: true } };
        return {
          status: "completed",
          minutes: 70,
          effort: 8,
          actual: [
            ramp([
              [1, 5, 60],
              [3, 4, step(80, 1.25, n)],
            ]),
            lift(4, n < 5 ? 3 : 4),
            lift(3, 8, 10),
            lift(3, 10, 40),
          ],
        };
      },
    },
    {
      weekdays: [SAT],
      start: -70,
      title: "Langer Lauf",
      sport: "Laufen",
      intent: "Grundlage: locker, 6:00–6:15/km.",
      minutes: 85,
      activities: [
        act(
          "Dauerlauf locker",
          "Laufen",
          "run",
          run({ dist: 14, pace: "6:05" }),
          { lib: "easy" },
        ),
      ],
      past: (n) => {
        if (n === 4) return { status: "skipped", flags: { illness: true } };
        if (n === 7)
          return {
            status: "replaced",
            note: "Knie geschont.",
            replacement: {
              title: "Radtour",
              sport: "Radfahren",
              minutes: 100,
              effort: 4,
              activities: [
                act(
                  "Radfahren locker",
                  "Radfahren",
                  "run",
                  run({ min: 100, dist: 38 }),
                ),
              ],
            },
          };
        if (n >= 8)
          return {
            status: "partially_completed",
            minutes: 55,
            effort: 5,
            actual: [run({ dist: 9, pace: "6:08" })],
            note: "Nach 9 km gestoppt, Knie wieder leicht (2/10). Flach gelaufen.",
            flags: { pain: true },
          };
        return {
          status: "completed",
          minutes: 80 + n * 2,
          effort: 5,
          actual: [
            run({ dist: 12 + n * 0.5, pace: n % 3 === 0 ? "5:35" : "6:02" }),
          ],
          note:
            n % 3 === 0
              ? "Zu schnell gelaufen, fühlte sich aber gut an."
              : undefined,
        };
      },
    },
  ],
  sessions: [
    {
      day: 36,
      title: "Testlauf 10 km",
      sport: "Laufen",
      intent: "Standortbestimmung: 10 km Wettkampf im Olympiapark.",
      minutes: 60,
      note: "Startnummer abholen am Vortag bis 18 Uhr.",
      activities: [
        act(
          "10 km Wettkampf",
          "Laufen",
          "run",
          run({ dist: 10, pace: "4:55" }),
        ),
      ],
    },
  ],
  unplanned: [
    {
      day: -58,
      title: "Yoga-Kurs",
      sport: "Mobility",
      minutes: 60,
      effort: 3,
      activities: [act("Yoga", "Mobility", "effort", effort(60, "easy"))],
    },
    {
      day: -16,
      title: "Mobility abends",
      sport: "Mobility",
      minutes: 20,
      effort: 2,
      activities: [
        act("Mobility-Flow", "Mobility", "effort", effort(20, "easy"), {
          lib: "flow",
        }),
      ],
    },
    {
      day: -2,
      title: "Radfahren zum Badesee",
      sport: "Radfahren",
      minutes: 75,
      effort: 4,
      note: "Spontan mit Freunden, schön locker.",
      activities: [
        act("Radfahren", "Radfahren", "run", run({ min: 75, dist: 27 })),
      ],
    },
  ],
  roadmap: {
    title: "Halbmarathon-Frühjahr mit Kraftaufbau",
    summary:
      "Grundlage und Kraft im Winter, ab Februar spezifisch für den Halbmarathon. Klimmzüge und Kreuzheben laufen mit, werden aber in der Wettkampfphase auf Erhalt reduziert.",
    end: 140,
    phases: [
      {
        title: "Grundlage & Knie beruhigen",
        focus: "Umfang langsam aufbauen, flach laufen, Kraft progressiv.",
        start: 0,
        end: 41,
        attention: [
          ["hm", "secondary"],
          ["pullups", "primary"],
          ["deadlift", "primary"],
          ["boulder", "maintenance"],
        ],
        milestones: [
          {
            title: "5 Klimmzüge am Stück",
            day: 21,
            goals: ["pullups"],
            reached: true,
          },
          {
            title: "Langer Lauf 16 km schmerzfrei",
            details: "Flache Strecke, Knie ≤ 1/10.",
            day: 38,
            goals: ["hm"],
          },
        ],
      },
      {
        title: "Aufbau",
        focus: "Schwellenläufe dazu, Kreuzheben schwerer.",
        start: 42,
        end: 97,
        attention: [
          ["hm", "primary"],
          ["pullups", "secondary"],
          ["deadlift", "primary"],
        ],
        milestones: [
          { title: "Kreuzheben 95 kg × 3", day: 84, goals: ["deadlift"] },
          { title: "8 Klimmzüge", day: 84, goals: ["pullups"] },
        ],
      },
      {
        title: "Spezifisch & Wettkampf",
        focus:
          "Halbmarathon-Pace, Kraft auf Erhalt, Taper in den letzten 10 Tagen.",
        start: 98,
        end: 140,
        attention: [
          ["hm", "primary"],
          ["deadlift", "maintenance"],
          ["pullups", "maintenance"],
        ],
        milestones: [
          { title: "Halbmarathon unter 1:50", day: 140, goals: ["hm"] },
        ],
      },
    ],
  },
};

export default athlete;
