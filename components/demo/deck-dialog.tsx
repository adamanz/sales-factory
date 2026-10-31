"use client";

import { Dialog, Tabs } from "radix-ui";
import { ACME_DECK } from "@/lib/demo/seed";

export function DeckDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="sf-btn-ghost">Open the sample deck</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sf-overlay" />
        <Dialog.Content className="sf-dialog" aria-describedby="deck-note">
          <p className="sf-kicker">Sample deck</p>
          <Dialog.Title>Acme Robotics, for Dana's VP</Dialog.Title>
          <Dialog.Description id="deck-note">
            Three slides. This deck is not published to Slack.
          </Dialog.Description>
          <Tabs.Root defaultValue="0">
            <Tabs.List className="sf-tabs" aria-label="Deck slides">
              {ACME_DECK.map((slide, index) => (
                <Tabs.Trigger key={slide.kicker} value={String(index)}>{slide.kicker}</Tabs.Trigger>
              ))}
            </Tabs.List>
            {ACME_DECK.map((slide, index) => (
              <Tabs.Content key={slide.title} value={String(index)}>
                <h3 className="sf-section-title">{slide.title}</h3>
                <p>{slide.body}</p>
              </Tabs.Content>
            ))}
          </Tabs.Root>
          <div className="sf-cta-row">
            <Dialog.Close className="sf-btn">Close</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
