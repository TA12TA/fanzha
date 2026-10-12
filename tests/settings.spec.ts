import { beforeEach, describe, expect, it } from 'vitest'
import {
  SETTINGS_KEY,
  SETTINGS_VERSION,
  loadSettings,
  parseSettings,
  saveSettings,
} from '@/app/settings'
import { REMINDER_TITLE, allReminders, reminderFor } from '@/data/antifraud'
import type { NodeId } from '@/game/types'

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

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
})

describe('H. 设置（音效与提醒开关）', () => {
  it('默认开启音效与顶部提醒', () => {
    const s = loadSettings(storage)
    expect(s.sound).toBe(true)
    expect(s.banner).toBe(true)
    expect(s.version).toBe(SETTINGS_VERSION)
  })

  it('保存后可读回', () => {
    saveSettings({ version: SETTINGS_VERSION, sound: false, banner: true }, storage)
    const s = loadSettings(storage)
    expect(s.sound).toBe(false)
    expect(s.banner).toBe(true)
  })

  it('损坏或旧版设置回退到默认值并清档', () => {
    storage.setItem(SETTINGS_KEY, '{不是 JSON')
    expect(loadSettings(storage).sound).toBe(true)

    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 0, sound: false, banner: false }))
    expect(loadSettings(storage).sound).toBe(true)

    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, sound: 'yes' }))
    expect(loadSettings(storage).sound).toBe(true)
  })

  it('parseSettings 拒绝非布尔与缺字段', () => {
    expect(parseSettings(null)).toBeNull()
    expect(parseSettings([])).toBeNull()
    expect(parseSettings({ version: SETTINGS_VERSION, sound: true })).toBeNull()
    expect(parseSettings({ version: SETTINGS_VERSION, sound: true, banner: true })).toEqual({
      version: SETTINGS_VERSION,
      sound: true,
      banner: true,
    })
  })

  it('存储不可用时不抛异常', () => {
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
    expect(() => loadSettings(throwing)).not.toThrow()
    expect(saveSettings({ version: SETTINGS_VERSION, sound: false, banner: false }, throwing)).toBe(false)
  })
})

describe('I. 反诈提醒内容', () => {
  it('标题为「国家反诈中心提醒您」', () => {
    expect(REMINDER_TITLE).toBe('国家反诈中心提醒您')
  })

  it('关键节点都有提醒，开场与复盘不需要', () => {
    const required: NodeId[] = [
      'invite',
      'group',
      'transfer-100',
      'rebate',
      'freeze',
      'transfer-300',
      'end-clear',
      'end-stop',
      'end-loss',
    ]
    for (const node of required) {
      expect(reminderFor(node), `节点 ${node} 应有提醒`).toBeTruthy()
    }
    expect(reminderFor('intro')).toBeNull()
    expect(reminderFor('debrief')).toBeNull()
  })

  it('提醒内容不写具体报警电话与外部链接', () => {
    for (const { node, body } of allReminders()) {
      expect(body, `节点 ${node} 不应含网址`).not.toMatch(/https?:\/\//)
      expect(body, `节点 ${node} 不应含 11 位号码`).not.toMatch(/\b1[3-9]\d{9}\b/)
      // 不写具体报警电话号码（如 110 / 96110）
      expect(body, `节点 ${node} 不应写具体报警号码`).not.toMatch(/96110|\b110\b/)
    }
  })

  it('提醒内容不承诺追回损失', () => {
    for (const { node, body } of allReminders()) {
      expect(body, `节点 ${node} 不应承诺追回`).not.toMatch(/保证追回|必定追回|一定能追回/)
      expect(body, `节点 ${node} 不应出现反杀表述`).not.toMatch(/反杀/)
    }
  })

  it('提醒文案长度适中，便于顶部横幅阅读', () => {
    for (const { node, body } of allReminders()) {
      expect(body.length, `节点 ${node} 提醒过长`).toBeLessThanOrEqual(70)
      expect(body.length, `节点 ${node} 提醒过短`).toBeGreaterThan(10)
    }
  })

  it('提醒鼓励止损与举报，而非与骗子周旋', () => {
    const joined = allReminders()
      .map((r) => r.body)
      .join('\n')
    expect(joined).toContain('停止')
    expect(joined).toContain('举报')
    // 不鼓励与骗子互动套话
    expect(joined).not.toContain('套话')
    expect(joined).not.toContain('周旋')
  })
})
