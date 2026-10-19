<template>
  <n-tooltip :disabled="!isRunning" trigger="hover">
    <template #trigger>
      <n-button
        type="primary"
        strong
        :loading="taskStatus === 'starting'"
        :disabled="isRunning"
        @click="handleStart"
      >
        <template #icon>
          <NIcon>
            <PlayOutline />
          </NIcon>
        </template>
        {{ taskStatus === 'starting' ? '启动中...' : '开始任务' }}
      </n-button>
    </template>
    任务正在运行，请等待前一个任务结束
  </n-tooltip>

  <!-- 抖音限制提示弹窗 -->
  <DouyinLimitDialog
    v-model:show="showDouyinLimitDialog"
    @confirm="handleDouyinLimitConfirm"
    @cancel="handleDouyinLimitCancel"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NButton, useMessage, NIcon, NTooltip } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@renderer/stores/feed-ac-tasks/task'
import { useSettingsStore } from '../stores/settings'
import { useLogsStore } from '@renderer/stores/feed-ac-tasks/logs'
import { storeToRefs } from 'pinia'
import { PlayOutline } from '@vicons/ionicons5'
import DouyinLimitDialog from './DouyinLimitDialog.vue'
import { LocalStorageManager, STORAGE_KEYS } from '@renderer/utils/storage-keys'
import { FeedAcRuleGroups } from '@/shared/feed-ac-setting'

const taskStore = useTaskStore()
const settingsStore = useSettingsStore()
const logsStore = useLogsStore()
const message = useMessage()
const router = useRouter()

const { taskStatus, isRunning } = storeToRefs(taskStore)
const { settings } = storeToRefs(settingsStore)
const { start } = taskStore

// 弹窗状态
const showDouyinLimitDialog = ref(false)

const validateForm = (): boolean => {
  // 检查是否有规则组
  if (settings.value!.ruleGroups.length === 0) {
    message.error('请至少配置一个规则组')
    return false
  }

  return true
}

const handleStart = async (): Promise<void> => {
  try {
    // 表单验证
    if (!validateForm()) {
      return
    }

    const aiSettings = await window.api.getAISettings()
    if (!aiSettings.apiKeys[aiSettings.platform]?.trim() || !aiSettings.model.trim()) {
      message.error('请先在全局设置中配置文字生成模型及 API Key')
      return
    }
    const usesJev = (groups: FeedAcRuleGroups[]): boolean =>
      groups.some((group) => group.type === 'ai' || usesJev(group.children || []))
    if (usesJev(settings.value!.ruleGroups) && !aiSettings.jevApiKey.trim()) {
      message.error('请先在全局设置中配置判断模型 JEV 的 API Key')
      return
    }

    // 检查是否需要显示抖音限制提示
    const dismissed = LocalStorageManager.get(STORAGE_KEYS['laizan-douyin-limit-dialog-dismissed'])
    if (!dismissed) {
      showDouyinLimitDialog.value = true
      return
    }

    // 直接启动任务
    await startTask()
  } catch (error) {
    logsStore.addLog(`启动失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const startTask = async (): Promise<void> => {
  try {
    logsStore.clearLogs()
    const taskId = await start()

    console.log('任务启动， taskId:', taskId)

    // 启动成功后，跳转到任务详情页
    if (taskId) {
      router.push({ name: 'feedAcTasksDetail', params: { taskId: taskId } })
    }
  } catch (error) {
    logsStore.addLog(`启动失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const handleDouyinLimitConfirm = async (dontShowAgain: boolean): Promise<void> => {
  // 如果用户选择了"不再提示"，保存到 localStorage
  if (dontShowAgain) {
    LocalStorageManager.set(STORAGE_KEYS['laizan-douyin-limit-dialog-dismissed'], true)
  }

  // 开始任务
  await startTask()
}

const handleDouyinLimitCancel = (): void => {
  // 用户取消，不做任何操作
}
</script>
