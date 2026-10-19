<template>
  <n-form>
    <n-form-item label="规则组名称" required>
      <n-input v-model:value="groupName" placeholder="请输入规则组名称" />
    </n-form-item>

    <n-tabs type="line" default-value="video" animated>
      <n-tab-pane
        name="video"
        tab="视频筛选"
        display-directive="show"
        class="max-h-[55vh] overflow-y-auto"
      >
        <n-form-item label="规则类型" required>
          <n-radio-group v-model:value="ruleType" name="ruleType">
            <n-space>
              <n-radio :value="'manual'">手动配置规则</n-radio>
              <n-popover trigger="hover" :disabled="isAiConfigured">
                <template #trigger>
                  <n-radio :value="'ai'" :disabled="!isAiConfigured || loading">JEV 判断</n-radio>
                </template>
                <div>
                  请前往<strong class="px-1 text-green-300">全局设置-模型设置-判断模型</strong
                  >，完成AI相关配置后启用
                </div>
              </n-popover>
            </n-space>
          </n-radio-group>
        </n-form-item>

        <div v-if="ruleType === 'ai'">
          <n-form-item label="AI提示词" required>
            <n-input
              v-model:value="aiPrompt"
              type="textarea"
              placeholder="请输入提示词，描述您希望AI以什么规则判断是否观看视频"
              :maxlength="1000"
              show-count
              :rows="5"
            />
          </n-form-item>
        </div>

        <div v-else>
          <n-form-item label="规则关系" required>
            <n-select v-model:value="relation" placeholder="规则关系" :options="relationOptions" />
          </n-form-item>
          <n-form-item label="规则列表" required>
            <div class="flex flex-col gap-3 flex-1">
              <div v-for="(rule, idx) in rules" :key="idx" class="flex items-center gap-2">
                <n-select
                  v-model:value="rule.field"
                  placeholder="选择类型"
                  :options="ruleOptions"
                />
                <span class="text-nowrap">包含关键字</span>
                <n-input v-model:value="rule.keyword" placeholder="输入关键字" class="w-full" />
                <n-button
                  v-if="rules.length > 1"
                  size="small"
                  type="error"
                  tertiary
                  @click="removeRule(idx)"
                >
                  删除
                </n-button>
              </div>
              <div class="w-10 flex gap-2">
                <n-button class="w-10" size="medium" tertiary type="primary" @click="addRule">
                  添加条件
                </n-button>
              </div>
            </div>
          </n-form-item>
        </div>
      </n-tab-pane>
      <n-tab-pane
        v-if="!ruleGroup?.children?.length"
        name="comment-like"
        tab="评论点赞"
        display-directive="show"
        class="max-h-[55vh] overflow-y-auto"
      >
        <div class="pt-1">
          <n-checkbox v-model:checked="commentLike.enabled"> 点赞评论区评论 </n-checkbox>
          <div v-if="commentLike.enabled" class="mt-4 flex flex-col gap-3">
            <p class="text-sm text-white/60">
              本规则组匹配成功后执行，自动跳过已点赞和自己的评论。
            </p>
            <n-form-item label="JEV 判断条件（可选）" label-placement="top" :show-feedback="false">
              <n-input
                v-model:value="commentLike.aiPrompt"
                type="textarea"
                :rows="3"
                placeholder="例如：评论表达了购买意向或正在咨询价格时才点赞；留空仅使用下方条件"
              />
            </n-form-item>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <n-form-item
                label="最多浏览页数（可选）"
                label-placement="top"
                :show-feedback="false"
              >
                <n-input-number
                  v-model:value="commentLike.maxPages"
                  :min="1"
                  :precision="0"
                  placeholder="默认 1 页"
                  clearable
                />
              </n-form-item>
              <n-form-item
                label="每个视频最多点赞（可选）"
                label-placement="top"
                :show-feedback="false"
              >
                <n-input-number
                  v-model:value="commentLike.maxLikesPerVideo"
                  :min="0"
                  :precision="0"
                  placeholder="默认 3 条，0 为不点赞"
                  clearable
                />
              </n-form-item>
            </div>
            <p class="text-sm text-white/60">
              首屏为第 1 页，每向下滚动一屏加 1 页；达到点赞上限即停止。
            </p>
            <n-form-item
              label="评论包含关键词（可选，匹配任意一个）"
              label-placement="top"
              :show-feedback="false"
            >
              <n-dynamic-tags v-model:value="commentLike.includeKeywords" />
            </n-form-item>
            <n-form-item
              label="评论排除关键词（可选，命中即跳过）"
              label-placement="top"
              :show-feedback="false"
            >
              <n-dynamic-tags v-model:value="commentLike.excludeKeywords" />
            </n-form-item>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <n-form-item
                label="已有点赞数下限（可选）"
                label-placement="top"
                :show-feedback="false"
              >
                <n-input-number
                  v-model:value="commentLike.minLikes"
                  :min="0"
                  :max="commentLike.maxLikes ?? undefined"
                  :precision="0"
                  placeholder="不限"
                  clearable
                />
              </n-form-item>
              <n-form-item
                label="已有点赞数上限（可选）"
                label-placement="top"
                :show-feedback="false"
              >
                <n-input-number
                  v-model:value="commentLike.maxLikes"
                  :min="commentLike.minLikes ?? 0"
                  :precision="0"
                  placeholder="不限"
                  clearable
                />
              </n-form-item>
            </div>
            <n-checkbox v-model:checked="commentLike.includeReplies"> 包含已展开的回复 </n-checkbox>
            <p class="text-sm text-white/60">
              各项条件同时满足才点赞；不填筛选条件时按展示顺序点赞。
            </p>
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>

    <div class="mt-4 flex justify-end gap-2">
      <n-button @click="handleCancel">取消</n-button>
      <n-button type="primary" @click="handleConfirm">确定</n-button>
    </div>
  </n-form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NRadioGroup,
  NRadio,
  NSpace,
  NInput,
  NSelect,
  NButton,
  NPopover,
  NCheckbox,
  NInputNumber,
  NDynamicTags,
  useMessage
} from 'naive-ui'
import type { CommentLikeSettings, FeedAcRule, FeedAcRuleGroups } from '@/shared/feed-ac-setting'
import { useSettingsStore } from '../../stores/settings'
import { useAiSettings } from '../../hooks/useAiSettings'

// 定义 props
const props = defineProps<{
  ruleGroup?: FeedAcRuleGroups
}>()

// 定义 emits
interface ModalEmits {
  (e: 'confirm', data: FeedAcRuleGroups): void
  (e: 'cancel'): void
}

const emit = defineEmits<ModalEmits>()

// 使用自定义hooks获取AI设置
const { isAiConfigured, loading } = useAiSettings()

const settingsStore = useSettingsStore()
const message = useMessage()
const commentLike = ref<CommentLikeSettings>({ enabled: false })

// 表单数据
const ruleType = ref<'ai' | 'manual'>('manual')
const aiPrompt = ref('')
const relation = ref<'and' | 'or'>('or')
const rules = ref<FeedAcRule[]>([{ field: 'nickName', keyword: '' }])
const groupName = ref('')

// 选项配置
const relationOptions = [
  { label: '任一满足', value: 'or' },
  { label: '全部满足', value: 'and' }
]

const ruleOptions = [
  { label: '作者名称', value: 'nickName' },
  { label: '视频描述', value: 'videoDesc' },
  { label: '视频标签', value: 'videoTag' }
]

// 监听 ruleGroup 的变化，用于编辑模式
watch(
  () => props.ruleGroup,
  (newRuleGroup) => {
    commentLike.value = JSON.parse(
      JSON.stringify(
        newRuleGroup?.commentLike ?? settingsStore.settings?.commentLike ?? { enabled: false }
      )
    )
    if (newRuleGroup) {
      groupName.value = newRuleGroup.name
      ruleType.value = newRuleGroup.type

      if (newRuleGroup.type === 'ai' && newRuleGroup.aiPrompt) {
        aiPrompt.value = newRuleGroup.aiPrompt
      } else if (newRuleGroup.type === 'manual') {
        relation.value = newRuleGroup.relation || 'or'
        rules.value =
          newRuleGroup.rules && newRuleGroup.rules.length > 0
            ? [...newRuleGroup.rules]
            : [{ field: 'nickName', keyword: '' }]
      }
    }
  },
  { immediate: true }
)

// 规则操作方法
const addRule = (): void => {
  rules.value.push({ field: 'nickName', keyword: '' })
}

const removeRule = (index: number): void => {
  if (rules.value.length > 1) {
    rules.value.splice(index, 1)
  }
}

// 按钮处理方法
const handleCancel = (): void => {
  emit('cancel')
}

const handleConfirm = (): void => {
  // 简单验证
  if (!groupName.value.trim()) {
    // 这里应该添加一个提示，但为了简化代码暂不添加
    return
  }

  if (
    !props.ruleGroup?.children?.length &&
    commentLike.value.enabled &&
    commentLike.value.aiPrompt?.trim() &&
    !isAiConfigured.value
  ) {
    message.error('请先在全局设置中配置判断模型 JEV 的 API Key')
    return
  }

  const result: Omit<FeedAcRuleGroups, 'id'> & { id?: string } = {
    // 如果是编辑模式，保留原有的ID；否则不传 id，由后端生成
    ...(props.ruleGroup?.id ? { id: props.ruleGroup.id } : {}),
    type: ruleType.value,
    name: groupName.value,
    ...(!props.ruleGroup?.children?.length ? { commentLike: commentLike.value } : {}),
    ...(ruleType.value === 'ai'
      ? { aiPrompt: aiPrompt.value }
      : {
          relation: relation.value,
          rules: [...rules.value]
        })
  }

  emit('confirm', result as FeedAcRuleGroups)
}
</script>
