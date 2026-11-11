import { useCallback, useEffect, useRef, useState } from 'react'
import { MOONSTONES } from '../../game/data/moonstones.ts'
import type { MoonstoneSpin } from '../../game/logic/moonstones.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { countOwned } from '../../game/logic/potions.ts'
import { useGameStore } from '../../state/gameStore.ts'

type Phase = 'idle' | 'starting' | 'rolling' | 'claiming' | 'waiting' | 'paused'
const AUTO_RESULT_HOLD_MS = 350

/** A saved draw is paid only by the reel's landing event, including after an interruption. */
export function useMoonstoneRound(onClose: () => void) {
  const character = useGameStore((s) => s.character)
  const initial = character?.moonstoneSpin
  const [stoneId, setStoneId] = useState(
    () =>
      initial?.stoneId ??
      MOONSTONES.find((s) => countOwned(character?.inventory ?? [], s.itemId))?.itemId ??
      MOONSTONES[0]!.itemId,
  )
  const [phase, setPhase] = useState<Phase>(initial ? 'paused' : 'idle')
  const [spin, setSpin] = useState<MoonstoneSpin | null>(initial ?? null)
  const [replay, setReplay] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [prize, setPrize] = useState<ItemStack | null>(null)
  const [rounds, setRounds] = useState(0)
  const [error, setError] = useState('')
  const [stopping, setStopping] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const job = useRef({
    mounted: true,
    phase: initial ? ('paused' as Phase) : ('idle' as Phase),
    pending: initial ?? (null as MoonstoneSpin | null),
    auto: false,
    stopAfter: false,
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
    current.stopAfter = true
    current.closeAfter = false
    if (current.timer) clearTimeout(current.timer)
    current.timer = null
    setAutoPlay(false)
    setStopping(false)
    setLeaving(false)
    if (current.phase === 'rolling') transition('paused')
    else if (current.phase === 'waiting') transition('idle')
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
    current.stopAfter = false
    current.closeAfter = false
    setStopping(false)
    setLeaving(false)
    setError('')
    setPrize(null)
    if (current.pending) {
      setSpin(current.pending)
      setReplay((n) => n + 1)
      transition('rolling')
      return
    }
    transition('starting')
    setSpin(null)
    try {
      const reserved = await useGameStore.getState().beginMoonstonePlay(stoneId, current.auto)
      current.pending = reserved
      if (!current.mounted) return
      setSpin(reserved)
      setReplay((n) => n + 1)
      transition(document.hidden ? 'paused' : 'rolling')
    } catch {
      if (!current.mounted) return
      transition('idle')
      setError('The play could not be started. Check your Moonstones and try again.')
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
      const won = await useGameStore.getState().finishMoonstonePlay(current.pending.id)
      current.pending = null
      if (!current.mounted) return
      setPrize(won)
      setRounds((n) => n + 1)
      if (current.closeAfter) {
        onClose()
        return
      }
      const remaining = countOwned(useGameStore.getState().character?.inventory ?? [], stoneId)
      if (current.auto && !current.stopAfter && remaining > 0 && !document.hidden) {
        transition('waiting')
        current.timer = setTimeout(() => {
          current.timer = null
          if (!current.mounted || !current.auto || document.hidden) return
          transition('idle')
          void start()
        }, AUTO_RESULT_HOLD_MS)
      } else {
        transition('idle')
        setStopping(false)
      }
    } catch {
      if (!current.mounted) return
      current.auto = false
      current.closeAfter = false
      current.stopAfter = true
      setAutoPlay(false)
      setLeaving(false)
      setStopping(false)
      transition('paused')
      setError('The result is saved. Press Resume to finish this roll.')
    }
  }

  const stop = () => {
    const current = job.current
    current.auto = false
    current.stopAfter = true
    setAutoPlay(false)
    if (current.timer) clearTimeout(current.timer)
    current.timer = null
    if (current.phase === 'waiting') transition('idle')
    else if (['starting', 'rolling', 'claiming'].includes(current.phase)) setStopping(true)
  }
  const close = () => {
    const current = job.current
    stop()
    if (['idle', 'paused'].includes(current.phase)) onClose()
    else {
      current.closeAfter = true
      setLeaving(true)
    }
  }
  const chooseStone = (id: number) => {
    if (job.current.phase !== 'idle' || job.current.pending) return
    setStoneId(id)
    setSpin(null)
    setPrize(null)
    setError('')
  }
  const chooseAuto = (value: boolean) => {
    job.current.auto = value
    if (value && !job.current.closeAfter) {
      job.current.stopAfter = false
      setStopping(false)
    }
    setAutoPlay(value)
  }
  const running = ['starting', 'rolling', 'claiming', 'waiting'].includes(phase)
  return {
    character,
    stoneId,
    phase,
    spin,
    replay,
    autoPlay,
    prize,
    rounds,
    error,
    stopping,
    leaving,
    running,
    locked: running || phase === 'paused',
    start,
    stop,
    close,
    landed,
    chooseStone,
    chooseAuto,
  }
}
