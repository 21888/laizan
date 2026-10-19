import { Page } from '@playwright/test'
import { sleep } from '@/utils/common'
import { CommentLikeSettings } from '@/shared/feed-ac-setting'

export interface CommentLikeCandidate {
  id: string
  text: string
  likes: number
  liked: boolean
  isReply: boolean
  isOwn: boolean
}

export default class DYElementHandler {
  private _page?: Page

  constructor(page: Page) {
    this._page = page
  }

  // 只读取当前一屏；评论与回复嵌套，必须限定按钮所属的 comment-item。
  async getVisibleComments(): Promise<CommentLikeCandidate[]> {
    return this._page!.locator('#videoSideCard [data-e2e="comment-item"]').evaluateAll((items) => {
      interface Fiber {
        return?: Fiber
        memoizedProps?: {
          commentInfo?: {
            cid: string
            text: string
            diggCount: number
            userDigged: number | boolean
            replyId: string
            user?: { uid: string }
          }
          userInfo?: { uid: string }
        }
      }
      const container = document.querySelector('#videoSideCard [data-e2e="comment-list"]')
      if (!container) return []
      const viewport = container.getBoundingClientRect()
      return items.flatMap((item) => {
        const stats = [...item.querySelectorAll('.comment-item-stats-container')].find(
          (element) => element.closest('[data-e2e="comment-item"]') === item
        )
        const button = stats?.firstElementChild?.firstElementChild
        if (!button || button.tagName !== 'P') return []
        const rect = button.getBoundingClientRect()
        if (rect.height === 0 || rect.top < viewport.top || rect.bottom > viewport.bottom) return []

        // 组件属性可能滞后一帧；红心图标反映当前交互状态。
        const key = Object.keys(item).find((name) => name.startsWith('__reactFiber'))
        let fiber = key ? (item as unknown as Record<string, Fiber>)[key] : undefined
        while (fiber && !fiber.memoizedProps?.commentInfo) fiber = fiber.return
        const props = fiber?.memoizedProps
        const comment = props?.commentInfo
        if (
          !comment ||
          !/^\d+$/.test(comment.cid) ||
          typeof comment.text !== 'string' ||
          typeof comment.diggCount !== 'number' ||
          ![0, 1, false, true].includes(comment.userDigged)
        )
          return []
        button.setAttribute('data-laizan-comment-like', comment.cid)
        const fill = button.querySelector('svg path')?.getAttribute('fill')?.toLowerCase()
        const liked = fill === '#fe2c55' || Boolean(comment.userDigged)
        return [
          {
            id: comment.cid,
            text: comment.text,
            likes: comment.diggCount + (liked && !comment.userDigged ? 1 : 0),
            liked,
            isReply: Boolean(comment.replyId && comment.replyId !== '0'),
            isOwn: Boolean(props?.userInfo?.uid && props.userInfo.uid === comment.user?.uid)
          }
        ]
      })
    })
  }

  async scrollComments(): Promise<boolean> {
    return this._page!.locator('#videoSideCard [data-e2e="comment-list"]').evaluate(
      async (element) => {
        const before = element.scrollTop
        element.scrollBy(0, element.clientHeight)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return element.scrollTop > before
      }
    )
  }

  async likeComment(id: string): Promise<void> {
    // 点击前重新读取状态，防止将已点赞评论取消点赞。
    const current = (await this.getVisibleComments()).find((comment) => comment.id === id)
    if (!current || current.liked || current.isOwn)
      throw new Error('评论状态已变化，停止本视频点赞')
    const page = this._page!
    const responsePromise = page
      .waitForResponse(
        (response) => {
          const url = new URL(response.url())
          const body = new URLSearchParams(response.request().postData() || '')
          return (
            /\/comment\/digg\/?$/.test(url.pathname) &&
            (url.searchParams.get('cid') || body.get('cid')) === id
          )
        },
        { timeout: 5000 }
      )
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok() || data.status_code !== 0) throw new Error('评论点赞接口未返回成功')
      })
    // 同时等待点击与接口结果，避免留下未处理的响应超时。
    await Promise.all([
      responsePromise,
      page.locator(`[data-laizan-comment-like="${id}"]`).click({ timeout: 3000 })
    ])
  }

  matchesCommentLikeRule(comment: CommentLikeCandidate, settings: CommentLikeSettings): boolean {
    const include = (settings.includeKeywords || []).map((word) => word.trim()).filter(Boolean)
    const exclude = (settings.excludeKeywords || []).map((word) => word.trim()).filter(Boolean)
    return (
      !comment.liked &&
      !comment.isOwn &&
      (settings.includeReplies || !comment.isReply) &&
      (!include.length || include.some((word) => comment.text.includes(word))) &&
      !exclude.some((word) => comment.text.includes(word)) &&
      (settings.minLikes == null || comment.likes >= settings.minLikes) &&
      (settings.maxLikes == null || comment.likes <= settings.maxLikes)
    )
  }

  async isCurrentFeedLive(): Promise<boolean> {
    return this._page!.evaluate(() => {
      const item = [...document.querySelectorAll('[data-e2e="feed-item"]')].find((element) => {
        const rect = element.getBoundingClientRect()
        return rect.top < innerHeight / 2 && rect.bottom > innerHeight / 2
      })
      if (!item || item.querySelector('[data-e2e="feed-active-video"]')) return false
      return (
        Boolean(item.querySelector('a[href*="live.douyin.com/"]')) ||
        /进入直播间|直播中|直播已结束/.test(item.textContent || '')
      )
    })
  }

  // 检查评论区是否打开
  async isCommentSectionOpen(): Promise<boolean> {
    try {
      // 使用css选择器查找id为videoSideCard的元素
      const videoSideCard = await this._page?.$('#videoSideCard')

      if (!videoSideCard) {
        console.log('未找到评论区元素(#videoSideCard)')
        return false
      }

      // 获取元素的clientWidth属性
      const clientWidth = await videoSideCard.evaluate((el) => (el as HTMLElement).clientWidth)

      // 如果clientWidth大于0，则表示评论区已打开
      const isOpen =
        clientWidth > 0 &&
        Boolean(await this._page?.locator('#videoSideCard [data-e2e="comment-list"]').isVisible())
      console.log(`评论区状态: ${isOpen ? '已打开' : '已关闭'} (clientWidth: ${clientWidth})`)

      return isOpen
    } catch (error) {
      console.log('检查评论区状态时出错:', error)
      return false
    }
  }

  // 使用快捷键关闭评论区
  async closeCommentSection(): Promise<void> {
    try {
      // 使用键盘快捷键 "X" 关闭评论区
      console.log('使用快捷键X关闭评论区')
      await this._page?.keyboard.press('x')

      // 给评论区收起一些时间
      await sleep(500)
    } catch (error) {
      console.log('关闭评论区时出错:', error)
    }
  }

  // 通过点击评论按钮关闭评论区
  async closeCommentSectionByButton(): Promise<void> {
    try {
      // 使用评论按钮选择器
      const commentButtonSelector = '[data-e2e="feed-active-video"] [data-e2e="feed-comment-icon"]'
      console.log('通过点击评论按钮关闭评论区')

      // 等待评论按钮可见并点击
      const commentButton = await this._page
        ?.waitForSelector(commentButtonSelector, {
          state: 'visible',
          timeout: 3000
        })
        .catch(() => null)

      if (commentButton) {
        await commentButton.click()
        console.log('成功点击评论按钮关闭评论区')
      } else {
        console.log('未找到评论按钮，尝试使用快捷键关闭')
        await this.closeCommentSection()
      }

      // 给评论区收起一些时间
      await sleep(500)
    } catch (error) {
      console.log('通过点击评论按钮关闭评论区时出错:', error)
      // 失败时尝试使用快捷键关闭
      await this.closeCommentSection()
    }
  }

  // 点赞
  async like(): Promise<void> {
    await this._page?.keyboard.press('z')
    // 等待点赞动画完成
    await sleep(500)
  }

  // 跳转到下一个视频
  async goToNextVideo(): Promise<void> {
    try {
      // 检查评论区是否打开，如果打开则关闭
      const commentSectionOpen = await this.isCommentSectionOpen()
      if (commentSectionOpen) {
        console.log('检测到评论区已打开，尝试关闭评论区')
        await this.closeCommentSection()

        // 等待评论区关闭
        await sleep(1000)

        // 再次检查评论区是否已关闭
        const stillOpen = await this.isCommentSectionOpen()
        if (stillOpen) {
          console.log('评论区仍未关闭，再次尝试关闭')
          await this.closeCommentSectionByButton()
          await sleep(1000)
        }
      }

      // 使用键盘方向键向下跳转到下一个视频
      await this._page?.keyboard.press('ArrowDown')

      await sleep(1000)
      console.log('成功跳转到下一视频')

      // 等待视频加载
      try {
        // 等待视频元素出现
        await this._page?.waitForFunction(
          () => {
            if (document.querySelector('[data-e2e="feed-active-video"]')) return true
            // 直播没有常规视频元素；当前卡片已出现时无需继续等视频选择器。
            return [...document.querySelectorAll('[data-e2e="feed-item"]')].some((element) => {
              const rect = element.getBoundingClientRect()
              return (
                rect.top < innerHeight / 2 &&
                rect.bottom > innerHeight / 2 &&
                (element.querySelector('a[href*="live.douyin.com/"]') ||
                  /进入直播间|直播中|直播已结束/.test(element.textContent || ''))
              )
            })
          },
          undefined,
          { timeout: 5000 }
        )
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        console.log('等待下一个视频加载超时，继续执行')
      }
    } catch (error) {
      console.log('跳转到下一视频时出错:', error)
    }
  }
}
