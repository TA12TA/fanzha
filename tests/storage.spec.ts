import { beforeEach, describe, expect, it } from 'vitest'
import { choose, createInitialState } from '@/game/engine'
import { SAVE_KEY, clearSave, loadSave, parseSave, restoreOrInitial, saveGame } from '@/game/storage'
import type { GameState, OptionId } from '@/game/types'

/** 内存版 Storage，避免依赖 jsdom 实现细节。 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

function play(optionIds: OptionId[], from: GameState = createInitialState()): GameState {
  let state = from
  for (const id of optionIds) {
    const result = choose(state, id)
    if (!result.ok) throw new Error(`选项 ${id} 在节点 ${state.node} 非法`)
    state = result.state
  }
  return state
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
})

describe('C. 存档（C04）', () => {
  it('正常往返：保存后能恢复出等价状态', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100', 'continue-task'])
    expect(saveGame(state, storage)).toBe(true)
    const restored = loadSave(storage)
    expect(restored).toEqual(state)
    expect(restored?.balance).toBe(700)
    expect(restored?.platformDisplayed).toBe(130)
  })

  it('损坏 JSON 自动回退并清档', () => {
    storage.setItem(SAVE_KEY, '{ 这不是 JSON')
    expect(loadSave(storage)).toBeNull()
    expect(storage.getItem(SAVE_KEY)).toBeNull()
    expect(restoreOrInitial(storage)).toEqual(createInitialState())
  })

  it('旧版/未知版本存档回退到开场', () => {
    const state = play(['start', 'enter-group'])
    storage.setItem(SAVE_KEY, JSON.stringify({ ...state, version: 0 }))
    expect(loadSave(storage)).toBeNull()
    storage.setItem(SAVE_KEY, JSON.stringify({ ...state, version: 99 }))
    expect(loadSave(storage)).toBeNull()
  })

  it('金额不变式被破坏的存档判定为损坏', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    // 伪造余额：钱凭空变多。
    storage.setItem(SAVE_KEY, JSON.stringify({ ...state, balance: 9999 }))
    expect(loadSave(storage)).toBeNull()
    // 平台展示金额被写进余额。
    storage.setItem(SAVE_KEY, JSON.stringify({ ...state, balance: 830 }))
    expect(loadSave(storage)).toBeNull()
  })

  it('未知节点/未知选项/非法历史被拒绝', () => {
    const state = play(['start', 'enter-group'])
    expect(parseSave({ ...state, node: 'hacked-node' })).toBeNull()
    expect(parseSave({ ...state, riskTags: ['unknown-tag'] })).toBeNull()
    expect(
      parseSave({
        ...state,
        history: [{ optionId: 'confirm-300', from: 'group', to: 'end-loss', moneyChanged: true }],
      }),
    ).toBeNull()
    // 历史与当前节点不一致。
    expect(
      parseSave({
        ...state,
        history: [{ optionId: 'start', from: 'intro', to: 'invite', moneyChanged: false }],
      }),
    ).toBeNull()
  })

  it('不能通过伪造存档绕过节点直接进入复盘', () => {
    const state = play(['start', 'enter-group'])
    expect(parseSave({ ...state, node: 'debrief', ending: null })).toBeNull()
  })

  it('重开清除存档', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    saveGame(state, storage)
    expect(loadSave(storage)).not.toBeNull()
    clearSave(storage)
    expect(storage.getItem(SAVE_KEY)).toBeNull()
    expect(restoreOrInitial(storage)).toEqual(createInitialState())
  })

  it('存储不可用时静默降级：不抛异常，游戏仍可进行', () => {
    const throwing: Storage = {
      length: 0,
      clear() {},
      getItem() {
        throw new Error('SecurityError')
      },
      key() {
        return null
      },
      removeItem() {},
      setItem() {
        throw new Error('QuotaExceededError')
      },
    }
    expect(loadSave(throwing)).toBeNull()
    expect(saveGame(createInitialState(), throwing)).toBe(false)
    expect(() => clearSave(throwing)).not.toThrow()
  })

  it('恢复后的状态不能重复扣款（A08 的持久化版本）', () => {
    const paid = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    saveGame(paid, storage)
    const restored = loadSave(storage)
    expect(restored).not.toBeNull()
    if (!restored) return
    const again = choose(restored, 'confirm-100')
    expect(again.ok).toBe(false)
    expect(again.state.balance).toBe(700)
  })

  it('没有存档时返回初始状态', () => {
    expect(loadSave(storage)).toBeNull()
    expect(restoreOrInitial(storage)).toEqual(createInitialState())
  })
})
