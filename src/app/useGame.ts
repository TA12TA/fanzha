import { computed, ref } from 'vue'
import { choose, createInitialState, isStateConsistent } from '@/game/engine'
import { clearSave, restoreOrInitial, saveGame } from '@/game/storage'
import type { GameState, OptionId, TransitionFailure } from '@/game/types'

/**
 * 游戏状态组合式封装。
 *
 * 唯一写入口是 `dispatch`：所有剧情推进、金额变更都经过 `engine.choose`。
 * UI 组件不得直接修改余额或节点。
 */
export function useGame() {
  const initial = restoreOrInitial()
  const state = ref<GameState>(initial)
  /** 最近一次被拒绝的选项，供界面给出提示（不改变剧情）。 */
  const lastRejection = ref<TransitionFailure | null>(null)

  function persist(next: GameState): void {
    saveGame(next)
  }

  /**
   * 提交一个剧情选项。非法/过期/重复提交不会改变任何数值。
   * @returns 是否被接受
   */
  function dispatch(optionId: OptionId): boolean {
    const result = choose(state.value, optionId)
    if (!result.ok) {
      lastRejection.value = result.reason
      return false
    }
    lastRejection.value = null
    state.value = result.state
    persist(result.state)
    return true
  }

  /** 重新开始：清空存档并回到开场。 */
  function restart(): void {
    clearSave()
    state.value = createInitialState()
    lastRejection.value = null
  }

  /** 开发期自检：状态必须始终满足不变式。 */
  function assertConsistent(): void {
    if (!isStateConsistent(state.value)) {
      // 自检失败时安全回退，避免把损坏状态继续写进存档。
      restart()
    }
  }

  const balance = computed(() => state.value.balance)
  const paidTotal = computed(() => state.value.paidTotal)
  const platformDisplayed = computed(() => state.value.platformDisplayed)
  const node = computed(() => state.value.node)
  const ending = computed(() => state.value.ending)

  return {
    state,
    balance,
    paidTotal,
    platformDisplayed,
    node,
    ending,
    lastRejection,
    dispatch,
    restart,
    assertConsistent,
  }
}

export type GameApi = ReturnType<typeof useGame>
