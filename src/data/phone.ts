/**
 * 虚构电话应用的数据。
 *
 * 号码全部是游戏内虚构的短号/分机，不指向任何真实电话、紧急号码或服务。
 * 点击拨号只在本机显示通话界面，不申请通话权限、不发起真实呼叫。
 */

export interface CallRecord {
  id: string
  name: string
  number: string
  time: string
  direction: 'in' | 'out' | 'missed'
}

export const RECENT_CALLS: CallRecord[] = [
  { id: 'mom', name: '妈妈', number: '661', time: '今天 12:08', direction: 'in' },
  { id: 'campus', name: '校园服务中心', number: '6600', time: '今天 09:41', direction: 'out' },
  { id: 'shop', name: '青集商城客服', number: '6688', time: '昨天 18:22', direction: 'in' },
  { id: 'parcel', name: '快递驿站', number: '6622', time: '昨天 16:05', direction: 'missed' },
]

export interface KeypadKey {
  digit: string
  letters?: string
}

export const KEYPAD_KEYS: KeypadKey[] = [
  { digit: '1' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*' },
  { digit: '0', letters: '+' },
  { digit: '#' },
]
