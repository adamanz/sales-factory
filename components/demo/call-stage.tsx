"use client";

import { Meter } from "@/components/demo/meter";
import { isVisibleAt, PLAYBACK_MS, callSecond } from "@/lib/demo/playback";
import type { CoachingTip, DemoCall, TranscriptTurn } from "@/lib/demo/types";

function tipsFor(turn: TranscriptTurn, turns: TranscriptTurn[], tips: CoachingTip[]) {
  const next = turns.find((item) => item.atSec > turn.atSec);
  const end = next ? next.atSec : Number.POSITIVE_INFINITY;
  return tips.filter((tip) => tip.atSec >= turn.atSec && tip.atSec < end);
}

export function CallStage({
  call,
  elapsed,
  playing,
  onReplay,
  onToggle,
}: {
  call: DemoCall;
  elapsed: number;
  playing: boolean;
  onReplay: () => void;
  onToggle: () => void;
}) {
  const second = callSecond(elapsed, call.durationSec);
  const turns = call.turns.filter((turn) => isVisibleAt(turn.atSec, second));
  const tips = call.tips.filter((tip) => isVisibleAt(tip.atSec, second));
  const atEnd = elapsed >= PLAYBACK_MS - 16;
  const percent = Math.round((Math.min(elapsed, PLAYBACK_MS) / PLAYBACK_MS) * 100);

  return (
    <section className="sf-panel sf-stage" data-tour="transcript" aria-label="Transcript">
      <div className="sf-callhead">
        <div>
          <p className="sf-kicker">{call.whenLabel} · {call.durationLabel}</p>
          <h2>{call.account}</h2>
          <p className="sf-quiet">{call.prospect}, {call.prospectTitle} · Rep {call.rep}</p>
        </div>
        <div className="sf-cta-row">
          {playing ? (
            <button className="sf-btn-small" type="button" onClick={onToggle}>Pause</button>
          ) : atEnd || elapsed < 16 ? (
            <button className="sf-btn-small" type="button" onClick={onReplay}>Play from the start</button>
          ) : (
            <button className="sf-btn-small" type="button" onClick={onToggle}>Resume</button>
          )}
        </div>
      </div>
      <Meter value={percent} label="Call playback" />
      <div data-tour="coaching">
        {turns.map((turn) => (
          <article className="sf-turn" key={turn.id}>
            <div className="sf-who">{turn.speaker === "Rep" ? call.rep : call.prospect}</div>
            <p>{turn.text}</p>
            {tipsFor(turn, call.turns, tips).map((tip) => (
              <div className="sf-tip" key={tip.id}>
                <b>Coaching. </b>
                {tip.tip}
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
