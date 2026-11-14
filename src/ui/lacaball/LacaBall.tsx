import { useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  GOLD_TOKEN_ID,
  TOKEN_ID,
  lacaBallCourse,
  lacaBallCourses,
} from '../../game/data/lacaball.ts'
import { getItem } from '../../game/data/items.ts'
import {
  lacaBallCost,
  lacaBallDisplayPool,
  lacaBallDrawDuration,
} from '../../game/logic/lacaball.ts'
import { countOwned } from '../../game/logic/potions.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { useModalFocus } from '../useModalFocus.ts'
import { useLacaBallRound } from './useLacaBallRound.ts'
import './lacaball.css'

export function LacaBallButton({ onClick }: { onClick(): void }) {
  const expedition = useGameStore((s) => !!s.character?.expedition)
  const boss = useGameStore((s) => !!s.character?.worldBoss?.active || !!s.worldBossResult)
  if (boss) return null
  return (
    <button
      type="button"
      className="icon-button hud__menu hud__menu--lacaball"
      aria-label="Laca Ball"
      title="Laca Ball"
      disabled={expedition}
      onClick={onClick}
    />
  )
}

/*
 * The client's CUILacaball window (UILacarette.cpp), piece by piece from Data/Interface/lacaball.tex
 * (`public/ui/lc/lacaball-atlas.webp`, scripts/lc/lacaball-gui.mjs). Every box is in the client's
 * window pixels; CSS turns them into screen pixels with one scale (`--K`, and `--k` for a group),
 * so the window keeps the original proportions at any size. A tall phone stacks the machine over
 * the right-hand panel, with the same pieces.
 */

/** x, y, width and height in the window's (or a group's) client pixels. */
type Box = readonly [number, number, number, number]
/** Left, top, right and bottom texel of lacaball.tex. */
type Uv = readonly [number, number, number, number]

const at = ([x, y, w, h]: Box) => ({ '--x': x, '--y': y, '--w': w, '--h': h }) as CSSProperties
const sprite = (box: Box, [u0, v0, u1, v1]: Uv) =>
  ({ ...at(box), '--u0': u0, '--v0': v0, '--uw': u1 - u0, '--vh': v1 - v0 }) as CSSProperties

function Piece({ box, uv, className }: { box: Box; uv: Uv; className?: string }) {
  return (
    <i
      className={className ? `lb-px ${className}` : 'lb-px'}
      style={sprite(box, uv)}
      aria-hidden="true"
    />
  )
}

/** Text centred on `x` from `top` (PutTextExCX), `width` wide. */
function Label({
  x,
  top,
  width,
  className,
  children,
  color,
}: {
  x: number
  top: number
  width: number
  className?: string
  children: ReactNode
  color?: string
}) {
  return (
    <span
      className={`lb-at lb-text${className ? ' ' + className : ''}`}
      style={{ ...at([x - width / 2, top, width, 14]), color }}
    >
      {children}
    </span>
  )
}

/** _initBackground: 500×375, the middle row stretched from 36 texels. */
const FRAME_WIDE: [Box, Uv][] = [
  [
    [0, 0, 500, 42],
    [0, 0, 500, 42],
  ],
  [
    [0, 42, 500, 311],
    [0, 42, 500, 78],
  ],
  [
    [0, 353, 500, 22],
    [0, 78, 500, 100],
  ],
]
/** The machine (0.7) over the panel: 282 wide, the frame's corners kept and its plate shortened. */
const TALL_WIDTH = 282
const TALL_HEIGHT = 610
const FRAME_TALL: [Box, Uv][] = (
  [
    [0, 42, 0, 42],
    [42, TALL_HEIGHT - 22, 42, 78],
    [TALL_HEIGHT - 22, TALL_HEIGHT, 78, 100],
  ] as const
).flatMap(([top, bottom, v0, v1]) => [
  [
    [0, top, 100, bottom - top],
    [0, v0, 100, v1],
  ],
  [
    [100, top, TALL_WIDTH - 200, bottom - top],
    [200, v0, 300, v1],
  ],
  [
    [TALL_WIDTH - 100, top, 100, bottom - top],
    [400, v0, 500, v1],
  ],
])

/** A 9-slice panel of the right column (UV 205..296 × 105..176), `edge` texels top and bottom. */
function panel(top: number, height: number, edge: number, middle: readonly [number, number]) {
  const rows: [number, number, number, number][] = [
    [top, edge, 105, 105 + edge],
    [top + edge, height - 2 * edge, middle[0], middle[1]],
    [top + height - edge, edge, 176 - edge, 176],
  ]
  return rows.flatMap(([y, h, v0, v1]): [Box, Uv][] => [
    [
      [0, y, 20, h],
      [205, v0, 225, v1],
    ],
    [
      [20, y, 230, h],
      [225, v0, 276, v1],
    ],
    [
      [250, y, 20, h],
      [276, v0, 296, v1],
    ],
  ])
}

/** The right column from (224, 37): token bar, courses, remain row, rewards with their header. */
const PANEL: [Box, Uv][] = [
  [
    [0, 0, 10, 22],
    [80, 104, 90, 126],
  ],
  [
    [10, 0, 250, 22],
    [90, 104, 188, 126],
  ],
  [
    [260, 0, 10, 22],
    [188, 104, 198, 126],
  ],
  ...panel(23, 78, 10, [115, 173]),
  ...panel(102, 28, 10, [115, 123]),
  [
    [148, 104, 118, 22],
    [80, 104, 198, 126],
  ],
  ...panel(131, 203, 20, [125, 156]),
  [
    [2, 133, 20, 19],
    [346, 141, 366, 160],
  ],
  [
    [22, 133, 154, 19],
    [356, 141, 407, 160],
  ],
  [
    [176, 133, 20, 19],
    [397, 141, 417, 160],
  ],
  [
    [197, 133, 40, 19],
    [346, 141, 386, 160],
  ],
  [
    [237, 133, 29, 19],
    [386, 141, 417, 160],
  ],
]

/** One reward row (rtList 227,192 + 35 per row): item box, name frame, count frame. */
const rewardRow = (y: number): [Box, Uv][] => [
  [
    [3, y, 35, 34],
    [80, 128, 114, 162],
  ],
  [
    [39, y - 1, 40, 34],
    [346, 104, 386, 139],
  ],
  [
    [79, y - 1, 77, 34],
    [356, 104, 433, 139],
  ],
  [
    [156, y - 1, 40, 34],
    [402, 104, 442, 139],
  ],
  [
    [197, y - 1, 35, 34],
    [346, 104, 381, 139],
  ],
  [
    [232, y - 1, 35, 34],
    [407, 104, 442, 139],
  ],
]
/** The row of a won-out reward, dimmed as in the client (0xA0 alpha). */
const disabledRow = (y: number): [Box, Uv][] => [
  [
    [1, y - 2, 11, 36],
    [441, 267, 451, 301],
  ],
  [
    [12, y - 2, 244, 36],
    [445, 267, 505, 301],
  ],
  [
    [256, y - 2, 11, 36],
    [499, 267, 509, 301],
  ],
]

/** _queryColor: the client's colour of a remain/max count. */
function remainColor(remain: number, max: number) {
  if (remain <= Math.floor(max / 10)) return '#ff0000'
  if (remain <= Math.floor(max / 5)) return '#ffff00'
  if (remain <= Math.floor(max / 2)) return '#00ff00'
  return '#ded9a0'
}

const REWARD_ROWS = 5
const COURSE_BOXES = 3

export function LacaBall({ onClose }: { onClose(): void }) {
  const round = useLacaBallRound(onClose)
  const dialog = useRef<HTMLDivElement>(null)
  useModalFocus(dialog, round.close)
  const {
    character,
    progress,
    courseId,
    tokenId,
    phase,
    draw,
    replay,
    auto,
    prize,
    error,
    locked,
    busy,
  } = round
  if (!character) return null
  const course = lacaBallCourse(courseId)!
  const courses = lacaBallCourses(tokenId)
  const selected = courses.indexOf(course)
  const first = Math.max(0, Math.min(selected - 1, courses.length - COURSE_BOXES))
  const pool = lacaBallDisplayPool(progress, courseId)
  const total = pool.reduce((n, count) => n + count, 0)
  const max = course.rewards.reduce((n, r) => n + r.max, 0)
  const cost = draw?.cost ?? lacaBallCost(courseId, tokenId)!
  const owned = countOwned(character.inventory, tokenId)
  const otherCharacter = progress?.pending && progress.pending.characterId !== character.id
  const duration = draw ? lacaBallDrawDuration(draw) : 2000
  const token = getItem(tokenId)
  const animating = phase === 'rolling' || phase === 'claiming' || phase === 'result'
  const status =
    error ||
    (otherCharacter
      ? 'Finish the saved draw on your other character first.'
      : phase === 'paused'
        ? 'Your draw is saved. Press Start to see your prize.'
        : !draw && owned < cost && phase === 'idle'
          ? `You need a ${token.name} to play.`
          : '')
  return createPortal(
    <div className="sheet-backdrop sheet-backdrop--center lacaball-backdrop" onClick={round.close}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lacaball-title"
        tabIndex={-1}
        className="sheet lacaball"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lacaball__frame lacaball__frame--wide" aria-hidden="true">
          {FRAME_WIDE.map(([box, uv], i) => (
            <Piece key={i} box={box} uv={uv} />
          ))}
        </div>
        <div className="lacaball__frame lacaball__frame--tall" aria-hidden="true">
          {FRAME_TALL.map(([box, uv], i) => (
            <Piece key={i} box={box} uv={uv} />
          ))}
        </div>
        <h2 id="lacaball-title" className="lacaball__title">
          Laca Ball
        </h2>
        <label
          className="lacaball__auto"
          title="Draw again and again, the animation at double speed"
        >
          <input
            type="checkbox"
            aria-label="Auto Draw at double speed"
            checked={auto}
            onChange={(e) => round.chooseAuto(e.target.checked)}
          />
          <span>
            Auto <b>×2</b>
          </span>
        </label>
        <button
          type="button"
          className="lb-px lacaball__close"
          aria-label="Close Laca Ball"
          onClick={round.close}
        />

        <div
          className={`lacaball__machine${phase === 'rolling' ? ' is-rolling' : ''}`}
          style={{ '--lacaball-duration': `${duration}ms` } as CSSProperties}
          aria-label={phase === 'rolling' ? 'Laca Ball machine drawing' : 'Laca Ball machine'}
        >
          <Piece
            key={`balls-${replay}`}
            className="lacaball__balls"
            box={[4, 30, 208, 158]}
            uv={[218, 334, 426, 492]}
          />
          <Piece box={[0, 0, 216, 333]} uv={[0, 180, 216, 512]} />
          {animating && (
            // _renderAnim: the ball stays in the basket and fades while the prize capsule appears
            <i
              key={`ball-${replay}`}
              className={`lb-px lacaball__ball${phase === 'claiming' ? ' is-landed' : ''}${phase === 'result' ? ' is-fading' : ''}`}
              style={sprite([87, 187, 48, 48], [450, 384, 498, 432])}
              aria-hidden="true"
              onAnimationEnd={(e) => {
                // the drop (or its reduced-motion stand-in) ends the round, the fade does not
                if (e.target === e.currentTarget && e.animationName !== 'lacaball-fade')
                  requestAnimationFrame(() => void round.landed())
              }}
            />
          )}
          {animating && <Piece box={[70, 304, 76, 17]} uv={[70, 483, 146, 500]} />}
          <button
            type="button"
            className="lb-px lacaball__start"
            style={at([154, 278, 38, 38])}
            aria-label={phase === 'paused' ? 'Resume Laca Ball' : 'Start Laca Ball'}
            title={phase === 'paused' ? 'Resume' : 'Start'}
            disabled={busy || !!otherCharacter || (!draw && owned < cost)}
            onClick={() => void round.start()}
          />
          {status && (
            <p className="lacaball__status" role="status">
              {status}
            </p>
          )}
        </div>

        <div className="lacaball__panel">
          {PANEL.map(([box, uv], i) => (
            <Piece key={i} box={box} uv={uv} />
          ))}
          <button
            type="button"
            className="lb-px lacaball__arrow lacaball__arrow--prev"
            style={at([2, 4, 14, 14])}
            aria-label="Previous token"
            disabled={locked || tokenId === TOKEN_ID}
            onClick={() => round.chooseToken(TOKEN_ID)}
          />
          <Label x={135} top={4} width={220} className="lacaball__token">
            {token.name} <b>×{owned.toLocaleString('en')}</b>
          </Label>
          <button
            type="button"
            className="lb-px lacaball__arrow lacaball__arrow--next"
            style={at([254, 4, 14, 14])}
            aria-label="Next token"
            disabled={locked || tokenId === GOLD_TOKEN_ID}
            onClick={() => round.chooseToken(GOLD_TOKEN_ID)}
          />

          <button
            type="button"
            className="lb-px lacaball__course-arrow lacaball__course-arrow--prev"
            style={at([2, 26, 22, 69])}
            aria-label="Previous course"
            disabled={locked || selected === 0}
            onClick={() => round.chooseCourse(courses[selected - 1]!.id)}
          />
          <div className="lacaball__courses" role="tablist" aria-label="Laca Ball courses">
            {courses.slice(first, first + COURSE_BOXES).map((c, i) => {
              const left = 26 + 73 * i
              const remaining = lacaBallDisplayPool(progress, c.id).reduce((n, k) => n + k, 0)
              const maximum = c.rewards.reduce((n, r) => n + r.max, 0)
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={c.id === courseId}
                  className="lb-px lacaball__course"
                  style={sprite([left, 28, 72, 69], [0, 105, 71, 176])}
                  disabled={locked}
                  key={c.id}
                  title={`${c.name}: ${remaining} of ${maximum} prizes left`}
                  aria-label={`${c.name}, ${remaining} of ${maximum} prizes remaining`}
                  onClick={() => round.chooseCourse(c.id)}
                >
                  <Piece box={[31, 6, 34, 34]} uv={[80, 128, 114, 162]} />
                  <Piece box={[6, 43, 30, 21]} uv={[80, 104, 110, 126]} />
                  <Piece box={[36, 43, 30, 21]} uv={[168, 104, 198, 126]} />
                  <span className="lb-at lacaball__icon" style={at([32, 7, 32, 32])}>
                    <ItemIcon item={getItem(c.rewards[0]!.itemId)} fluid />
                  </span>
                  <span className="lb-at lb-text lacaball__letter" style={at([5, 20, 24, 18])}>
                    {c.name.slice(-1)}
                  </span>
                  <Label x={36} top={47} width={60} color={remainColor(remaining, maximum)}>
                    {remaining}/{maximum}
                  </Label>
                </button>
              )
            })}
          </div>
          {selected >= first && selected < first + COURSE_BOXES && (
            <Piece
              className="lacaball__selected"
              box={[26 + 73 * (selected - first), 27, 72, 69]}
              uv={[442, 198, 509, 265]}
            />
          )}
          <button
            type="button"
            className="lb-px lacaball__course-arrow lacaball__course-arrow--next"
            style={at([244, 26, 22, 69])}
            aria-label="Next course"
            disabled={locked || selected === courses.length - 1}
            onClick={() => round.chooseCourse(courses[selected + 1]!.id)}
          />

          <span
            className="lb-at lb-text lacaball__remain-label"
            style={at([4, 108, 140, 14])}
            title="Win the 1/1 grand prize to refill this course."
          >
            {course.name} left / total
          </span>
          <Label x={207} top={108} width={116} color={remainColor(total, max)}>
            <span role="status" aria-label="Course pool remaining">
              {total} / {max}
            </span>
          </Label>

          <Label x={99} top={137} width={150}>
            Reward
          </Label>
          <Label x={232} top={137} width={68}>
            Remaining
          </Label>
          <div className="lacaball__rewards" aria-label={`${course.name} rewards`}>
            {Array.from({ length: REWARD_ROWS }, (_, i) => {
              const y = 155 + 35 * i
              const reward = course.rewards[i]
              const left = pool[i] ?? 0
              return (
                <div key={i} className="lacaball__reward">
                  {rewardRow(y).map(([box, uv], j) => (
                    <Piece key={j} box={box} uv={uv} />
                  ))}
                  {reward ? (
                    <>
                      <span className="lb-at lacaball__icon" style={at([4, y + 1, 32, 32])}>
                        <ItemIcon item={getItem(reward.itemId)} fluid />
                      </span>
                      <span
                        className="lb-at lb-text lacaball__reward-name"
                        style={at([41, y, 154, 32])}
                        title={getItem(reward.itemId).name}
                      >
                        <span>
                          {getItem(reward.itemId).name} <b>×{reward.count}</b>
                        </span>
                      </span>
                      <span
                        className="lb-at lb-text lacaball__reward-count"
                        style={{ ...at([199, y, 66, 32]), color: remainColor(left, reward.max) }}
                      >
                        {left}/{reward.max}
                      </span>
                      {left === 0 &&
                        disabledRow(y).map(([box, uv], j) => (
                          <Piece key={`d${j}`} className="lacaball__won-out" box={box} uv={uv} />
                        ))}
                    </>
                  ) : (
                    <>
                      <Piece box={[4, y + 1, 32, 32]} uv={[118, 128, 150, 160]} />
                      <Label x={116} top={y + 11} width={150} color="#ada97e">
                        -
                      </Label>
                      <Label x={234} top={y + 11} width={66} color="#ada97e">
                        -/-
                      </Label>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {prize && (
          <div className="lacaball__prize" role="status">
            <Piece box={[0, 0, 24, 48]} uv={[450, 330, 474, 378]} />
            <Piece box={[24, 4, 178, 40]} uv={[450, 111, 458, 151]} />
            <Piece box={[202, 0, 24, 48]} uv={[480, 330, 504, 378]} />
            <Piece box={[26, 8, 34, 34]} uv={[80, 128, 114, 162]} />
            <Piece box={[61, 8, 139, 34]} uv={[436, 478, 498, 512]} />
            <span className="lb-at lacaball__icon" style={at([27, 9, 32, 32])}>
              <ItemIcon item={getItem(prize.itemId)} fluid />
            </span>
            <span className="lb-at lb-text lacaball__prize-name" style={at([63, 8, 135, 34])}>
              <span>
                {getItem(prize.itemId).name} <b>×{prize.count}</b>
              </span>
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
