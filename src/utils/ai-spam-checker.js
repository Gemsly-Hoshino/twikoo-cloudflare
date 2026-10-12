/**
 * AI 垃圾评论过滤模块
 * 基于 OpenAI 兼容 API（支持 OpenAI 官方及第三方兼容接口）
 */

import logger from 'twikoo-func/utils/logger'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1/'
const DEFAULT_SPAM_CHECK_MODEL = 'gpt-4o-mini'

/**
 * 使用 OpenAI 兼容 API 检测评论是否为垃圾评论
 * @param {Object} commentData - 评论数据，包含 nick, mail, ip, comment 等字段
 * @param {Object} env - Cloudflare Workers 环境变量
 * @returns {Promise<boolean>} true 表示判定为垃圾评论，false 表示正常评论
 */
export async function checkSpamWithAI (commentData, env) {
  const openaiBaseUrl = (env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '')
  const openaiApiKey = env.OPENAI_API_KEY || ''
  const model = env.SPAM_CHECK_MODEL || DEFAULT_SPAM_CHECK_MODEL

  if (!openaiApiKey) {
    logger.warn('[AI Spam Check] OPENAI_API_KEY 未配置，跳过 AI 审核')
    return false
  }

  // 构建审核提示词
  const systemPrompt = `You are a professional spam detection assistant. Analyze the following comment and determine if it is SPAM or NOT SPAM.

Rules for judging SPAM:
1. Advertising / promotional content (products, services, websites, courses, etc.)
2. Irrelevant links or URLs aimed at driving traffic
3. Repetitive or bulk-style comments
4. Gibberish, random characters, or meaningless text
5. Phishing, scam, or malicious content
6. Excessive emojis without meaningful content
7. Cryptocurrency / NFT promotion without context

Rules for judging as NOT SPAM (normal human comments):
1. Genuine questions, opinions, or feedback about the content
2. Polite greetings or thank-you messages
3. Constructive discussion related to the page/topic
4. Brief but meaningful interaction

Output format: Reply with ONLY one word - "SPAM" or "NOT SPAM". Nothing else.`

  const userPrompt = buildCommentPrompt(commentData)

  try {
    const response = await fetch(`${openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 16,
        temperature: 0
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[AI Spam Check] API 请求失败:', response.status, errorText)
      // API 请求失败时默认不视为 spam，避免误伤正常评论
      return false
    }

    const json = await response.json()

    if (json.choices && json.choices.length > 0) {
      const content = json.choices[0].message.content?.trim()
      const isSpam = content.toUpperCase().includes('SPAM') && !content.toUpperCase().includes('NOT SPAM')
      logger.log(`[AI Spam Check] 评论判定: ${isSpam ? 'SPAM' : '正常'} (回复: "${content}")`)
      return isSpam
    }

    logger.warn('[AI Spam Check] API 返回无有效 choices')
    return false
  } catch (error) {
    logger.error('[AI Spam Check] 请求异常:', error.message)
    // 网络异常时默认不视为 spam
    return false
  }
}

/**
 * 构建评论内容的提示词文本
 */
function buildCommentPrompt (data) {
  const lines = []
  lines.push('Please analyze the following comment:')
  lines.push('')

  if (data.nick) {
    lines.push(`Nickname: ${data.nick}`)
  }
  if (data.mail) {
    lines.push(`Email: ${data.mail}`)
  }
  if (data.ip) {
    lines.push(`IP Address: ${data.ip}`)
  }
  if (data.link) {
    lines.push(`Website/Link: ${data.link}`)
  }
  if (data.comment) {
    lines.push(`Comment Content: ${data.comment}`)
  }
  if (data.url) {
    lines.push(`Page URL: ${data.url}`)
  }
  if (data.href) {
    lines.push(`Page Title: ${data.href}`)
  }
  if (data.pid || data.rid) {
    lines.push(`Parent ID: ${data.pid || data.rid}`)
  }
  if (data.ipRegion) {
    lines.push(`IP Region: ${data.ipRegion}`)
  }

  return lines.join('\n')
}
