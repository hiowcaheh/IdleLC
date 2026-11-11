import { useCallback, useEffect, useRef, useState } from 'react'
import { lacaBallCourses, TOKEN_ID } from '../../game/data/lacaball.ts'
import { LACABALL_RESULT_MS, type LacaBallDraw } from '../../game/logic/lacaball.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { countOwned } from '../../game/logic/potions.ts'
import { useGameStore } from '../../state/gameStore.ts'

type Phase = 'idle' | 'starting' | 'rolling' | 'claiming' | 'result' | 'paused'

/** One saved reservation; Auto never queues another draw until the current reveal finishes. */
export function useLacaBallRound(onClose: () => void) {
  const character = useGameStore((s) => s.character)
  const progress = useGameStore((s) => s.save.lacaBall)
  const pending = progress?.pending?.characterId === character?.id ? progress?.pending : undefined
  const [tokenId, setTokenId] = useState(pending?.tokenId ?? TOKEN_ID)
  const [courseId, setCourseId] = useState(
    () =>
      lacaBallCourses(pending?.tokenId ?? TOKEN_ID).find((c) => c.id === pending?.courseId)?.id ??
      lacaBallCourses(pending?.tokenId ?? TOKEN_ID)[0]!.id,
  )
  const [phase, setPhase] = useState<Phase>(pending ? 'paused' : 'idle')
  const [draw, setDraw] = useState<LacaBallDraw | null>(pending ?? null)
  const [auto, setAuto] = useState(false)
  const [prize, setPrize] = useState<ItemStack | null>(null)
  const [error, setError] = useState('')
  const [replay, setReplay] = useState(0)
  const job = useRef({
    mounted: true,
    phase: pending ? ('paused' as Phase) : ('idle' as Phase),
    pending: pending ?? (null as LacaBallDraw | null),
    auto: false,
    closeAfter: false,
    timer: null as ReturnType<typeof setTimeout> | null,
  })
  const transition = useCallback((next: Phase) => {
    job.current.phase = next
    setPhase(next)
  }, [])
  const pause = useCallback(() => {
    const current = job.current
    current.auto = false
    setAuto(false)
    if (current.phase === 'rolling') transition('paused')
  }, [transition])
  useEffect(() => {
    const current = job.current
    current.mounted = true
    const hidden = () => {
      if (document.hidden) pause()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      current.mounted = false
      current.auto = false
      if (current.timer) clearTimeout(current.timer)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [pause])

  const start = async () => {
    const current = job.current
    if (!current.mounted || document.hidden || !['idle', 'paused'].includes(current.phase)) return
    if (current.timer) clearTimeout(current.timer)
    current.timer = null
    setPrize(null)
    setError('')
    if (current.pending) {
      setDraw(current.pending)
      setReplay((n) => n + 1)
      transition('rolling')
      return
    }
    transition('starting')
    try {
      const reserved = await useGameStore.getState().beginLacaBall(courseId, tokenId, current.auto)
      current.pending = reserved
      if (!current.mounted) return
      setDraw(reserved)
      setReplay((n) => n + 1)
      transition(document.hidden ? 'paused' : 'rolling')
      if (current.closeAfter) onClose()
    } catch (cause) {
      if (!current.mounted) return
      current.auto = false
      setAuto(false)
      transition('idle')
      setError(
        cause instanceof Error && cause.message === 'lacaball-not-enough-tokens'
          ? 'Not enough tokens for this course.'
          : 'The play could not be saved. Please try again.',
      )
      if (current.closeAfter) onClose()
    }
  }
  const landed = async () => {
    const current = job.current
    if (!current.mounted || current.phase !== 'rolling' || !current.pending) return
    if (document.hidden) {
      pause()
      return
    }
    transition('claiming')
    try {
      const won = await useGameStore.getState().finishLacaBall(current.pending.id)
      current.pending = null
      if (!current.mounted) return
      setDraw(null)
      setPrize(won)
      if (current.closeAfter) {
        onClose()
        return
      }
      transition('result')
      current.timer = setTimeout(() => {
        current.timer = null
        if (!current.mounted) return
        setPrize(null)
        transition('idle')
        if (
          current.auto &&
          !document.hidden &&
          countOwned(useGameStore.getState().character?.inventory ?? [], tokenId) > 0
        )
          void start()
        else if (current.auto) {
          current.auto = false
          setAuto(false)
        }
      }, LACABALL_RESULT_MS)
    } catch {
      if (!current.mounted) return
      current.auto = false
      setAuto(false)
      transition('paused')
      setError('Your draw is saved. Press Resume to finish it.')
      if (current.closeAfter) onClose()
    }
  }
  const close = () => {
    const current = job.current
    current.auto = false
    setAuto(false)
    if (['starting', 'claiming'].includes(current.phase)) current.closeAfter = true
    else onClose()
  }
  const chooseAuto = (value: boolean) => {
    job.current.auto = value
    setAuto(value)
  }
  const chooseCourse = (id: number) => {
    if (job.current.phase !== 'idle') return
    setCourseId(id)
    setPrize(null)
    setError('')
  }
  const chooseToken = (id: number) => {
    if (job.current.phase !== 'idle') return
    setTokenId(id)
    setCourseId(lacaBallCourses(id)[0]!.id)
    setPrize(null)
    setError('')
  }
  return {
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
    locked: phase !== 'idle',
    busy: ['starting', 'rolling', 'claiming', 'result'].includes(phase),
    start,
    landed,
    close,
    chooseCourse,
    chooseToken,
    chooseAuto,
  }
}
