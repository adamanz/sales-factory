export const TOUR_STEPS = [
  {
    id: "calls",
    title: "Three calls are already here",
    body: "Acme Robotics is the call with a quote. Northwind is a clean discovery. Brightline is the call where the coaching has a fix.",
  },
  {
    id: "transcript",
    title: "You are at the end of the call",
    body: "The quote is already on screen. Replay from the start and the lines arrive over about 50 seconds.",
  },
  {
    id: "coaching",
    title: "Each tip quotes the call",
    body: "The tip sits on the line it came from. Until Deepgram coaching is connected, these tips are samples in that shape.",
  },
  {
    id: "nudges",
    title: "A nudge is the short version",
    body: "One line the rep could use while the call is still going. On Acme that is pricing, then Glean, then the ask for two options.",
  },
  {
    id: "quotes",
    title: "Lean is $100,000. Full is $185,000",
    body: "Forty seats are waived to $0. The usage pool is the $100,000. Full adds a forward deployed engineer and premium support, and that option is marked recommended.",
  },
  {
    id: "slots",
    title: "Holding a time does not send an invite",
    body: "Slot Finder is not wired in this build, so the times are samples. Accept and hold stay in this browser.",
  },
] as const;

export type TourStepId = (typeof TOUR_STEPS)[number]["id"];
