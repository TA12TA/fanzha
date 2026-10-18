import { beforeEach, describe, expect, it } from 'vitest'
import { choose, createInitialState } from '@/game/engine'
import {
  ACTIVE_LEVEL_KEY,
  LEGACY_SAVE_KEY,
  SAVE_VERSION,
  clearAllSaves,
  clearSave,
  ensureMigrated,
  loadActiveLevel,
  loadSave,
  parseSave,
  restoreOrInitial,
  saveActiveLevel,
  saveGame,
  saveKey,
} from '@/game/storage'
import type { GameState, LevelId, OptionId } from '@/game/types'

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

/** 依次提交选项（默认第一关）。 */
function play(optionIds: OptionId[], levelId: LevelId = 'level-01'): GameState {
  let state = createInitialState(levelId)
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
    storage.setItem(saveKey('level-01'), '{ 这不是 JSON')
    expect(loadSave(storage)).toBeNull()
    expect(storage.getItem(saveKey('level-01'))).toBeNull()
    expect(restoreOrInitial(storage)).toEqual(createInitialState())
  })

  it('旧版/未知版本存档回退到开场', () => {
    const state = play(['start', 'enter-group'])
    storage.setItem(saveKey('level-01'), JSON.stringify({ ...state, version: 0 }))
    expect(loadSave(storage)).toBeNull()
    storage.setItem(saveKey('level-01'), JSON.stringify({ ...state, version: 99 }))
    expect(loadSave(storage)).toBeNull()
  })

  it('金额不变式被破坏的存档判定为损坏', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    // 伪造余额：钱凭空变多。
    storage.setItem(saveKey('level-01'), JSON.stringify({ ...state, balance: 9999 }))
    expect(loadSave(storage)).toBeNull()
    // 平台展示金额被写进余额。
    storage.setItem(saveKey('level-01'), JSON.stringify({ ...state, balance: 830 }))
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

  it('重开清除本关存档', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    saveGame(state, storage)
    expect(loadSave(storage)).not.toBeNull()
    clearSave(storage, 'level-01')
    expect(storage.getItem(saveKey('level-01'))).toBeNull()
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
    expect(() => clearAllSaves(throwing)).not.toThrow()
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

/**
 * 多关卡存档：每关一个槽位。
 *
 * 这是本轮改动里最容易出错的地方 —— 一旦退回「一个大键」，
 * 玩家在第二关付的钱就会覆盖第一关的进度（或反过来），
 * 而界面看起来一切正常。所以这一组断言写得比较死。
 */
describe('C2. 多关卡存档（每关一个槽位）', () => {
  it('两关各自保存，互不覆盖', () => {
    const l1 = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    const l2 = play(['start', 'l2-cooperate', 'l2-confirm-200'], 'level-02')

    expect(saveGame(l1, storage)).toBe(true)
    expect(saveGame(l2, storage)).toBe(true)

    const back1 = loadSave(storage, 'level-01')
    const back2 = loadSave(storage, 'level-02')
    expect(back1?.balance, '第一关应保持 700').toBe(700)
    expect(back2?.balance, '第二关应是 600').toBe(600)
    expect(back1?.node).toBe('rebate')
    expect(back2?.node).toBe('l2-refund-claim')

    // 两个键确实不同（不是同一个槽被写两次）
    expect(saveKey('level-01')).not.toBe(saveKey('level-02'))
    expect(storage.getItem(saveKey('level-01'))).not.toBe(storage.getItem(saveKey('level-02')))
  })

  it('清一关不影响另一关', () => {
    saveGame(play(['start', 'enter-group', 'accept-task', 'confirm-100']), storage)
    saveGame(play(['start', 'l2-cooperate', 'l2-confirm-200'], 'level-02'), storage)

    clearSave(storage, 'level-02')

    expect(loadSave(storage, 'level-02'), '第二关应被清掉').toBeNull()
    expect(loadSave(storage, 'level-01')?.balance, '第一关必须留着').toBe(700)
  })

  it('清空全部关卡会清掉所有槽与当前关卡记录', () => {
    saveGame(play(['start', 'enter-group']), storage)
    saveGame(play(['start', 'l2-cooperate'], 'level-02'), storage)
    saveActiveLevel('level-02', storage)
    expect(loadActiveLevel(storage)).toBe('level-02')

    clearAllSaves(storage)

    expect(loadSave(storage, 'level-01')).toBeNull()
    expect(loadSave(storage, 'level-02')).toBeNull()
    expect(storage.getItem(ACTIVE_LEVEL_KEY), '当前关卡记录也应清掉').toBeNull()
    expect(loadActiveLevel(storage), '清空后回退默认关卡').toBe('level-01')
  })

  it('单关损坏只清那一关，其他关不受影响', () => {
    saveGame(play(['start', 'enter-group', 'accept-task', 'confirm-100']), storage)
    saveGame(play(['start', 'l2-cooperate', 'l2-confirm-200'], 'level-02'), storage)
    // 只把第二关的槽写坏
    storage.setItem(saveKey('level-02'), '{"version":2,"levelId":"level-02","balance":999999}')

    expect(loadSave(storage, 'level-02'), '损坏的槽应回退').toBeNull()
    expect(storage.getItem(saveKey('level-02')), '损坏的槽应被清掉').toBeNull()
    expect(loadSave(storage, 'level-01')?.balance, '第一关必须完好').toBe(700)
  })

  it('槽里的关卡 id 与请求的关卡不一致时判为损坏', () => {
    // 把第一关的存档塞进第二关的槽
    const l1 = play(['start', 'enter-group'])
    storage.setItem(saveKey('level-02'), JSON.stringify(l1))
    expect(loadSave(storage, 'level-02')).toBeNull()
  })

  it('未知关卡 id 的存档被拒绝', () => {
    const state = play(['start', 'enter-group'])
    expect(parseSave({ ...state, levelId: 'level-99' })).toBeNull()
    // 锁定关卡（第三关）也不该有存档
    expect(parseSave({ ...state, levelId: 'level-03' })).toBeNull()
  })

  it('关卡 id 缺失（v1 结构）被拒绝，必须走迁移', () => {
    const state = play(['start', 'enter-group', 'accept-task', 'confirm-100'])
    const { levelId, ...withoutLevel } = state
    void levelId
    expect(parseSave({ ...withoutLevel, version: SAVE_VERSION })).toBeNull()
  })

  it('「当前关卡」记忆可读回，非法值回退默认', () => {
    expect(loadActiveLevel(storage), '没记录时回退第一关').toBe('level-01')
    saveActiveLevel('level-02', storage)
    expect(loadActiveLevel(storage)).toBe('level-02')
    // 未知关卡不接受
    saveActiveLevel('level-99' as LevelId, storage)
    expect(loadActiveLevel(storage), '未知关卡不该被记住').toBe('level-02')
    storage.setItem(ACTIVE_LEVEL_KEY, 'nonsense')
    expect(loadActiveLevel(storage)).toBe('level-01')
  })
})

/**
 * v1 → v2 迁移。
 *
 * v1 只有一个键（`fj-juzhongju:save:v1`），升级到多关卡后必须把它迁进
 * 第一关的槽位，否则玩家正玩到一半的进度会因为一次升级消失。
 */
describe('C3. v1 存档迁移', () => {
  /** 构造一份 v1 格式的存档（无 levelId，版本 1）。 */
  function legacySave(optionIds: OptionId[]): string {
    const state = play(optionIds)
    const { levelId, ...rest } = state
    void levelId
    return JSON.stringify({ ...rest, version: 1 })
  }

  it('有效 v1 存档迁移进第一关槽位，并删除旧键', () => {
    storage.setItem(LEGACY_SAVE_KEY, legacySave(['start', 'enter-group', 'accept-task', 'confirm-100']))

    expect(ensureMigrated(storage)).toBe(true)

    const migrated = loadSave(storage, 'level-01')
    expect(migrated, '迁移后第一关应能读到进度').not.toBeNull()
    expect(migrated?.balance, '迁移必须保住金额').toBe(700)
    expect(migrated?.node).toBe('rebate')
    expect(migrated?.levelId).toBe('level-01')
    expect(storage.getItem(LEGACY_SAVE_KEY), '旧键应被删除，避免下次启动复活').toBeNull()
  })

  it('损坏的 v1 存档不迁移，直接清掉', () => {
    storage.setItem(LEGACY_SAVE_KEY, '{"version":1,"node":"group","balance":999999}')
    expect(ensureMigrated(storage)).toBe(false)
    expect(loadSave(storage, 'level-01')).toBeNull()
    expect(storage.getItem(LEGACY_SAVE_KEY), '损坏的旧键也要删掉').toBeNull()
  })

  it('迁移不会覆盖第一关已有的新版存档', () => {
    // 新版已经存了一份进度
    saveGame(play(['start', 'enter-group']), storage)
    // 旧键还留着（理论上不该发生，但必须保证不倒退进度）
    storage.setItem(LEGACY_SAVE_KEY, legacySave(['start', 'enter-group', 'accept-task', 'confirm-100']))

    ensureMigrated(storage)

    // 迁移只在槽位为空时写入，避免用旧数据覆盖新进度
    expect(loadSave(storage, 'level-01')?.balance).toBe(800)
    expect(storage.getItem(LEGACY_SAVE_KEY)).toBeNull()
  })

  it('没有旧键时迁移是空操作', () => {
    expect(ensureMigrated(storage)).toBe(false)
    expect(storage.length, '不该写入任何东西').toBe(0)
  })
})
