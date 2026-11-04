import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AntiFraudDialog from '@/components/AntiFraudDialog.vue'

describe('AntiFraudDialog 倒计时', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('必须等满 5 秒才能关闭', async () => {
    const wrapper = mount(AntiFraudDialog, {
      props: {
        title: '国家反诈中心',
        headline: '检测到你疑似正在被诈骗',
        body: '这是一条测试提醒。',
        countdownSeconds: 5,
      },
    })

    const button = wrapper.find('.af__ok')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.text()).toContain('请稍等 5 秒')

    // 倒计时结束前点击不应关闭
    await button.trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(button.text()).toContain('请稍等 4 秒')

    await vi.advanceTimersByTimeAsync(4_000)
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.text()).toContain('我知道了')

    await button.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
