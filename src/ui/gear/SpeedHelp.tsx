import { Sheet } from '../Sheet.tsx'

/** Describes the timing and movement rules used by combat and skill details. */
export function SpeedHelp({ onClose }: { onClose(): void }) {
  return (
    <Sheet
      centered
      title="How speeds work"
      titleId="speed-help-title"
      className="sheet--client sheet--speed-help"
      onClose={onClose}
    >
      <dl className="speed-help">
        <div>
          <dt>Run speed and movement bonus</dt>
          <dd>
            Run speed is your final movement speed in metres per second, including movement bonuses.
            It affects both travel between spots and running to the next monster. Higher is faster:
            increasing speed from 6 to 9 m/s makes the same trip take two thirds of the time.
          </dd>
        </div>
        <div>
          <dt>Attack interval</dt>
          <dd>
            The time between normal attacks. Lower is faster. A 20% attack speed buff can shorten a
            1.00 s interval to 0.80 s. The green change beside the stat is the difference in
            seconds, such as −0.20 s, compared with your stats without temporary buffs. The number
            in the box already includes that change.
          </dd>
        </div>
        <div>
          <dt>Cast speed and cast time adjustment</dt>
          <dd>
            Cast speed reduces skill preparation by its percentage. Cast time adjustment then adds
            or removes a fixed number of seconds. For example, 20% cast speed turns 2.00 s of
            preparation into 1.60 s; a −0.10 s adjustment makes it 1.50 s. Zero adjustment means no
            extra change. Preparation cannot be negative. The skill's release animation follows
            preparation and has its own duration.
          </dd>
        </div>
        <div>
          <dt>Cooldown adjustment and cooldown bonus</dt>
          <dd>
            Cooldown is the wait before the same skill can be used again. The adjustment adds or
            removes seconds from its base cooldown. The bonus then shortens that time using the
            client's cooldown formula; +80% is not a direct 80% reduction. For example, a 3.50 s
            cooldown with +80% bonus and no adjustment becomes 1.30 s. Times round up to the next
            tenth of a second. Skills with a fixed cooldown ignore both modifiers. The final
            cooldown is shown in each skill's details.
          </dd>
        </div>
        <div>
          <dt>Skill MP cost</dt>
          <dd>
            Reduces the mana spent per skill use, up to 75%. It does not change casting speed or
            cooldown. The final mana cost is shown in the skill's details.
          </dd>
        </div>
      </dl>
    </Sheet>
  )
}
