<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import { SHOP_CATEGORIES, SHOP_ORDER, SHOP_PRODUCTS, type ShopProduct } from '@/data/shop'
import { playSound } from '@/app/sound'

/**
 * 虚构购物应用「青集商城」。
 *
 * 只做浏览：分类、搜索、商品详情、心愿单。没有下单、支付、地址、
 * 客服或任何外链 —— 看得像正常商城，但不会产生真实交易。
 */
const props = withDefaults(
  defineProps<{
    /** 从聊天里的「订单详情」进入时直接落到订单页。 */
    initialTab?: 'home' | 'orders'
  }>(),
  { initialTab: 'home' },
)

const emit = defineEmits<{ (e: 'back'): void }>()

const products = SHOP_PRODUCTS
const categories = SHOP_CATEGORIES

const tab = ref<'home' | 'orders'>(props.initialTab)
const category = ref('全部')
const query = ref('')
const wishlist = ref<string[]>([])
const active = ref<ShopProduct | null>(null)
const policyOpen = ref(false)

const filtered = computed(() => {
  const keyword = query.value.trim()
  return products.filter((product) => {
    if (category.value !== '全部' && product.category !== category.value) return false
    if (!keyword) return true
    return `${product.name}${product.description}${product.tag}`.includes(keyword)
  })
})

function openProduct(product: ShopProduct): void {
  playSound('tap')
  active.value = product
}

function closeProduct(): void {
  playSound('tap')
  active.value = null
}

function toggleWish(id: string): void {
  playSound('tap')
  wishlist.value = wishlist.value.includes(id)
    ? wishlist.value.filter((item) => item !== id)
    : [...wishlist.value, id]
}

/** 给父级手势返回用：先关详情/政策，再回首页，最后才退出应用。 */
function handleBack(): boolean {
  if (active.value) {
    closeProduct()
    return true
  }
  if (policyOpen.value) {
    policyOpen.value = false
    return true
  }
  if (tab.value !== 'home') {
    tab.value = 'home'
    return true
  }
  return false
}

defineExpose({ handleBack })

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && active.value) closeProduct()
}

onMounted(() => globalThis.addEventListener('keydown', closeOnEscape))
onBeforeUnmount(() => globalThis.removeEventListener('keydown', closeOnEscape))
</script>

<template>
  <section class="shop" aria-label="青集商城">
    <AppHeader title="青集商城" subtitle="慢慢挑，挑喜欢的" show-back @back="emit('back')">
      <template #action>
        <span class="shop__wish" :aria-label="`心愿单 ${wishlist.length} 件`">♡ {{ wishlist.length }}</span>
      </template>
    </AppHeader>

    <nav class="shop__tabs" aria-label="商城导航">
      <button
        type="button"
        class="shop__tab"
        :class="{ 'shop__tab--on': tab === 'home' }"
        :aria-current="tab === 'home' ? 'page' : undefined"
        @click="tab = 'home'"
      >
        首页
      </button>
      <button
        type="button"
        class="shop__tab"
        :class="{ 'shop__tab--on': tab === 'orders' }"
        :aria-current="tab === 'orders' ? 'page' : undefined"
        @click="tab = 'orders'"
      >
        订单
      </button>
    </nav>

    <div v-if="tab === 'home'" class="shop__body">
      <label class="shop__search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.4" />
          <path d="m16 16 4.4 4.4" stroke-linecap="round" />
        </svg>
        <input v-model="query" type="search" placeholder="搜一搜想要的东西" aria-label="搜索商品" />
        <button v-if="query" type="button" class="shop__clear" aria-label="清空搜索" @click="query = ''">
          ✕
        </button>
      </label>

      <div class="shop__chips" role="tablist" aria-label="商品分类">
        <button
          v-for="item in categories"
          :key="item"
          type="button"
          role="tab"
          class="chip"
          :class="{ 'chip--on': category === item }"
          :aria-selected="category === item"
          @click="category = item"
        >
          {{ item }}
        </button>
      </div>

      <div class="sectionhead">
        <h2>{{ category === '全部' ? '今日好物' : category }}</h2>
        <span>{{ filtered.length }} 件</span>
      </div>

      <ul v-if="filtered.length" class="shop__grid">
        <li v-for="product in filtered" :key="product.id">
          <button
            type="button"
            class="product"
            :aria-label="`查看${product.name}，${product.price} 元`"
            @click="openProduct(product)"
          >
            <span class="product__art">
              <img :src="product.image" :alt="product.name" loading="lazy" />
              <span class="product__tag">{{ product.tag }}</span>
            </span>
            <span class="product__info">
              <span class="product__name">{{ product.name }}</span>
              <span class="product__desc">{{ product.description }}</span>
              <span class="product__price">¥{{ product.price }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="shop__empty">没有找到相关商品，换个词试试。</p>
    </div>

    <!-- 我的订单：订单问题在购物 App 内核实，不回到聊天里听客服转述 -->
    <div v-else class="shop__body shop__orders" aria-label="我的订单">
      <div class="sectionhead">
        <h2>我的订单</h2>
        <span>1 笔</span>
      </div>

      <article class="order">
        <div class="order__top">
          <span class="order__shop">青集商城</span>
          <span class="order__status">{{ SHOP_ORDER.status }}</span>
        </div>
        <div class="order__main">
          <div class="order__art">
            <img :src="SHOP_ORDER.image" :alt="SHOP_ORDER.title" loading="lazy" />
          </div>
          <div class="order__info">
            <p class="order__title">{{ SHOP_ORDER.title }}</p>
            <p class="order__meta">实付 ¥{{ SHOP_ORDER.amount }} · {{ SHOP_ORDER.paidWith }}</p>
          </div>
        </div>
        <dl class="order__facts">
          <div>
            <dt>订单编号</dt>
            <dd>{{ SHOP_ORDER.id }}</dd>
          </div>
          <div>
            <dt>下单时间</dt>
            <dd>{{ SHOP_ORDER.date }}</dd>
          </div>
          <div>
            <dt>订单状态</dt>
            <dd>{{ SHOP_ORDER.status }}</dd>
          </div>
          <div>
            <dt>重复扣款</dt>
            <dd>无，只有这一笔正常扣款</dd>
          </div>
        </dl>
        <p class="order__note">{{ SHOP_ORDER.note }}</p>
        <button type="button" class="order__policybtn" @click="policyOpen = !policyOpen">
          {{ policyOpen ? '收起售后规则' : '查看售后规则' }}
        </button>
        <p v-if="policyOpen" class="order__policy">{{ SHOP_ORDER.policy }}</p>
      </article>

    </div>

    <div v-if="active" class="detail" role="dialog" aria-modal="true" :aria-label="active.name">
      <header class="detail__head">
        <button type="button" class="detail__back" aria-label="返回商品列表" @click="closeProduct">←</button>
        <span>商品详情</span>
        <span class="detail__spacer" aria-hidden="true"></span>
      </header>

      <div class="detail__scroll">
        <div class="detail__art">
          <img :src="active.image" :alt="active.name" />
        </div>
        <div class="detail__body">
          <span class="detail__tag">{{ active.tag }}</span>
          <h2 class="detail__name">{{ active.name }}</h2>
          <p class="detail__price">¥{{ active.price }}</p>
          <p class="detail__desc">{{ active.description }}</p>
          <dl class="detail__facts">
            <div>
              <dt>发货</dt>
              <dd>虚构店铺 · 48 小时内</dd>
            </div>
            <div>
              <dt>保障</dt>
              <dd>七天无理由 · 运费险</dd>
            </div>
            <div>
              <dt>库存</dt>
              <dd>充足</dd>
            </div>
          </dl>
        </div>
      </div>

      <footer class="detail__foot">
        <span class="detail__wish">心愿单 {{ wishlist.length }} 件</span>
        <button
          type="button"
          class="btn"
          :class="wishlist.includes(active.id) ? 'btn--secondary' : 'btn--primary'"
          @click="toggleWish(active.id)"
        >
          {{ wishlist.includes(active.id) ? '已加入心愿单' : '加入心愿单' }}
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.shop {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--c-surface-2);
}

.shop__wish {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  padding: 0 var(--space-2);
  color: var(--c-text-soft);
  font-size: var(--font-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.shop__tabs {
  display: flex;
  flex: none;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--c-line);
  background: var(--c-surface);
}

.shop__tab {
  flex: 1;
  min-height: 42px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--c-text-soft);
  font-size: var(--font-sm);
  font-weight: 700;
}

.shop__tab--on {
  border-bottom-color: var(--c-primary);
  color: var(--c-primary);
}

.shop__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  padding: var(--space-3) var(--space-4) var(--space-5);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/*
 * 关键：滚动容器里的卡片/横滑条不能被 flex 压缩。
 * 之前 `.shop__chips` 被挤成 1px 高，分类按钮看上去只剩一条线。
 */
.shop__body > * {
  flex: none;
}

.shop__orders {
  gap: var(--space-3);
}

/* ============ 订单 ============ */

.order {
  padding: var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.order__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--c-line);
}

.order__shop {
  font-size: var(--font-sm);
  font-weight: 700;
}

.order__status {
  font-size: var(--font-xs);
  font-weight: 700;
  color: var(--c-accent);
}

.order__main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
}

.order__art {
  flex: none;
  width: 74px;
  height: 74px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--c-surface-2);
}

.order__art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.order__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.order__title {
  font-size: var(--font-sm);
  font-weight: 700;
}

.order__meta {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.order__facts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: var(--space-2) 0;
  border-top: 1px solid var(--c-line);
  border-bottom: 1px solid var(--c-line);
}

.order__facts div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--font-xs);
}

.order__facts dt {
  flex: none;
  color: var(--c-text-soft);
}

.order__facts dd {
  margin: 0;
  text-align: right;
}

.order__note {
  margin-top: var(--space-2);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
  line-height: 1.6;
}

.order__policybtn {
  min-height: 36px;
  margin-top: var(--space-1);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--c-primary);
  font-size: var(--font-xs);
  font-weight: 700;
}

.order__policy {
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--c-surface-2);
  font-size: var(--font-xs);
  color: var(--c-text-soft);
  line-height: 1.6;
}



.shop__search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--c-line);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-text-soft);
}

.shop__search svg {
  flex: none;
  width: 19px;
  height: 19px;
}

.shop__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--c-text);
  /* 16px 避免 iOS 聚焦输入框时自动放大页面 */
  font: inherit;
  font-size: 16px;
}

.shop__search input::placeholder {
  color: var(--c-text-tertiary);
}

.shop__clear {
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--c-surface-2);
  color: var(--c-text-soft);
}

.shop__chips {
  display: flex;
  gap: var(--space-2);
  padding-bottom: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.shop__chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: none;
  min-height: 36px;
  padding: 0 var(--space-4);
  border: 1px solid var(--c-line);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-text-soft);
  font-size: var(--font-sm);
  font-weight: 600;
}

.chip--on {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
  color: var(--c-primary);
}

.sectionhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.sectionhead h2 {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.sectionhead span {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

.shop__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.product {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: var(--radius-md);
  background: var(--c-surface);
  color: inherit;
  text-align: left;
  box-shadow: var(--shadow-card);
}

.product:active {
  transform: scale(0.99);
}

.product__art {
  position: relative;
  display: block;
  aspect-ratio: 1.15;
  overflow: hidden;
  background: var(--c-surface-2);
}

.product__art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product__tag {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-text);
  font-size: 10px;
  font-weight: 700;
}

.product__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 10px 11px;
  min-width: 0;
}

.product__name,
.product__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product__name {
  font-size: var(--font-sm);
  font-weight: 700;
}

.product__desc {
  font-size: 11px;
  color: var(--c-text-soft);
}

.product__price {
  margin-top: 2px;
  color: var(--c-danger);
  font-size: var(--font-md);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.shop__empty {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--c-text-soft);
}

/* ============ 商品详情 ============ */

.detail {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: var(--c-surface);
  animation: detail-in var(--dur-base) ease both;
}

@keyframes detail-in {
  from {
    transform: translateX(16px);
    opacity: 0;
  }
}

.detail__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  min-height: 46px;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--c-line);
  font-size: var(--font-md);
  font-weight: 700;
}

.detail__back {
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--c-primary);
  font-size: var(--font-lg);
}

.detail__spacer {
  width: var(--tap-min);
}

.detail__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.detail__art {
  height: 230px;
  background: var(--c-surface-2);
}

.detail__art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
}

.detail__tag {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--c-primary-soft);
  color: var(--c-primary);
  font-size: var(--font-xs);
  font-weight: 700;
}

.detail__name {
  font-size: var(--font-lg);
  font-weight: 800;
}

.detail__price {
  color: var(--c-danger);
  font-size: 26px;
  font-weight: 800;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.detail__desc {
  font-size: var(--font-sm);
  color: var(--c-text-soft);
  line-height: 1.7;
}

.detail__facts {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--c-surface-2);
}

.detail__facts div {
  display: flex;
  gap: var(--space-3);
  font-size: var(--font-xs);
}

.detail__facts dt {
  width: 40px;
  flex: none;
  color: var(--c-text-soft);
}

.detail__facts dd {
  margin: 0;
}

.detail__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: none;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--c-line);
  background: var(--c-surface);
}

.detail__wish {
  font-size: var(--font-xs);
  color: var(--c-text-soft);
}

@media (prefers-reduced-motion: reduce) {
  .detail {
    animation: none;
  }
}
</style>
