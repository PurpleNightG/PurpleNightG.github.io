/**
 * 火山引擎屏幕共享：自定义 getDisplayMedia（restrictOwnAudio 防回声）
 * + 房间麦克风语音辅助。
 */

export type VolcScreenCaptureResult = {
  /** 自定义采集时的 MediaStream，cleanup 时需 stop */
  stream: MediaStream | null
  hasSystemAudio: boolean
  mode: 'custom' | 'sdk'
}

export type ScreenQuality = 240 | 480 | 720 | 1080
export type ScreenFps = 30 | 60
/** 清晰=保细节(detail)；流畅=保帧率(motion) */
export type ScreenEncodeMode = 'detail' | 'motion'

export type VolcScreenEncoderConfig = {
  width: number
  height: number
  frameRate: number
  maxKbps?: number
  contentHint?: ScreenEncodeMode
}

export const SCREEN_QUALITY_OPTIONS: {
  id: ScreenQuality
  label: string
  height: number
  maxKbpsDetail: number
  maxKbpsMotion: number
}[] = [
  { id: 240, label: '240p', height: 240, maxKbpsDetail: 500, maxKbpsMotion: 900 },
  { id: 480, label: '480p', height: 480, maxKbpsDetail: 1200, maxKbpsMotion: 2200 },
  { id: 720, label: '720p', height: 720, maxKbpsDetail: 2800, maxKbpsMotion: 5000 },
  { id: 1080, label: '1080p', height: 1080, maxKbpsDetail: 5000, maxKbpsMotion: 9000 },
]

export const SCREEN_ENCODE_MODE_OPTIONS: { id: ScreenEncodeMode; label: string; hint: string }[] = [
  { id: 'motion', label: '流畅', hint: '优先保帧率，适合游戏/视频；高动态时更稳' },
  { id: 'detail', label: '清晰', hint: '优先保细节，适合文档/PPT；高动态可能掉帧' },
]

export const SCREEN_FPS_OPTIONS: { id: ScreenFps; label: string }[] = [
  { id: 30, label: '30fps' },
  { id: 60, label: '60fps' },
]

export function getScreenQualityPreset(q: ScreenQuality) {
  return SCREEN_QUALITY_OPTIONS.find((o) => o.id === q) || SCREEN_QUALITY_OPTIONS[3]
}

export function getVolcMaxKbps(quality: ScreenQuality, fps: ScreenFps, encodeMode: ScreenEncodeMode) {
  const preset = getScreenQualityPreset(quality)
  const base = encodeMode === 'motion' ? preset.maxKbpsMotion : preset.maxKbpsDetail
  const brScale = fps === 30 ? 0.75 : 1
  return Math.round(base * brScale)
}

export function getVolcEncoderConfig(
  quality: ScreenQuality,
  fps: ScreenFps,
  encodeMode: ScreenEncodeMode
): VolcScreenEncoderConfig {
  const preset = getScreenQualityPreset(quality)
  return {
    width: Math.round((preset.height * 16) / 9),
    height: preset.height,
    frameRate: fps,
    maxKbps: getVolcMaxKbps(quality, fps, encodeMode),
    contentHint: encodeMode,
  }
}

/** 点对点语音控制信令 */
export type VolcVoiceMessage =
  | { t: 'ziye-voice'; action: 'force-mute'; by?: string }
  | { t: 'ziye-voice'; action: 'force-unmute'; by?: string }
  | { t: 'ziye-voice'; action: 'force-kick'; by?: string; banned?: boolean }
  | { t: 'ziye-voice'; action: 'share-approved'; by?: string; toSessionId?: string; toUserId?: string }
  | { t: 'ziye-voice'; action: 'share-rejected'; by?: string; cooldownMs?: number; toSessionId?: string; toUserId?: string }

export function parseVolcVoiceMessage(raw: string): VolcVoiceMessage | null {
  try {
    const data = JSON.parse(raw)
    if (data?.t !== 'ziye-voice') return null
    if (
      data.action !== 'force-mute' &&
      data.action !== 'force-unmute' &&
      data.action !== 'force-kick' &&
      data.action !== 'share-approved' &&
      data.action !== 'share-rejected'
    ) {
      return null
    }
    return data as VolcVoiceMessage
  } catch {
    return null
  }
}

/**
 * 仅申请屏幕采集，不绑定 RTC（便于等待审批；拒绝时停轨不会触发 SDK 报错）
 */
export async function acquireDisplayMedia(
  enc: Pick<VolcScreenEncoderConfig, 'width' | 'height' | 'frameRate'>
): Promise<VolcScreenCaptureResult> {
  const displayConstraints: MediaStreamConstraints & Record<string, unknown> = {
    video: {
      width: { ideal: enc.width },
      height: { ideal: enc.height },
      frameRate: { ideal: enc.frameRate, max: enc.frameRate },
    },
    audio: {
      restrictOwnAudio: true,
      echoCancellation: true,
      noiseSuppression: true,
    } as MediaTrackConstraints,
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
  }

  const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints as MediaStreamConstraints)
  const videoTrack = stream.getVideoTracks()[0]
  if (!videoTrack) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('未获取到屏幕视频轨道')
  }
  return { stream, hasSystemAudio: stream.getAudioTracks().length > 0, mode: 'custom' }
}

/**
 * 将已有屏幕流绑定到火山引擎（审批通过后再调用）
 */
export async function bindVolcScreenCapture(
  engine: any,
  volcModule: any,
  capture: VolcScreenCaptureResult,
  enc: VolcScreenEncoderConfig
): Promise<VolcScreenCaptureResult> {
  const { StreamIndex, VideoSourceType, AudioSourceType } = volcModule
  await engine.setScreenEncoderConfig?.(enc)

  if (capture.mode === 'sdk' || !capture.stream) {
    await engine.startScreenCapture({
      enableAudio: true,
      selfBrowserSurface: 'exclude',
      systemAudio: 'include',
    })
    return { stream: null, hasSystemAudio: true, mode: 'sdk' }
  }

  const videoTrack = capture.stream.getVideoTracks()[0]
  if (!videoTrack || videoTrack.readyState !== 'live') {
    throw new Error('屏幕画面已失效，请重新选择')
  }

  await engine.setVideoSourceType(
    StreamIndex.STREAM_INDEX_SCREEN,
    VideoSourceType.VIDEO_SOURCE_TYPE_EXTERNAL
  )
  await engine.setExternalVideoTrack(StreamIndex.STREAM_INDEX_SCREEN, videoTrack)

  const audioTrack = capture.stream.getAudioTracks()[0] || null
  if (audioTrack && audioTrack.readyState === 'live') {
    await engine.setAudioSourceType(
      StreamIndex.STREAM_INDEX_SCREEN,
      AudioSourceType.AUDIO_SOURCE_TYPE_EXTERNAL
    )
    await engine.setExternalAudioTrack(StreamIndex.STREAM_INDEX_SCREEN, audioTrack)
  }

  return {
    stream: capture.stream,
    hasSystemAudio: !!audioTrack,
    mode: 'custom',
  }
}

/** 解除屏幕轨绑定并停止本地流（拒绝/取消共享时调用） */
export async function releaseVolcScreenCapture(
  engine: any,
  volcModule: any | null,
  stream: MediaStream | null | undefined
) {
  if (engine) {
    try {
      await engine.setLocalVideoPlayer?.(1, { renderDom: null })
    } catch {}
    try {
      if (volcModule?.StreamIndex != null) {
        await engine.setExternalVideoTrack?.(volcModule.StreamIndex.STREAM_INDEX_SCREEN, null)
      }
    } catch {}
    try {
      await engine.stopScreenCapture?.()
    } catch {}
  }
  if (stream) {
    try {
      stream.getTracks().forEach((t) => {
        try { t.stop() } catch {}
      })
    } catch {}
  }
}

/**
 * 优先用浏览器 getDisplayMedia + restrictOwnAudio，避开本标签页声音进系统声回环。
 * 失败（非用户取消）时回退 SDK 内部采集。
 */
export async function startVolcScreenCapture(
  engine: any,
  volcModule: any,
  enc: VolcScreenEncoderConfig
): Promise<VolcScreenCaptureResult> {
  try {
    const acquired = await acquireDisplayMedia(enc)
    return await bindVolcScreenCapture(engine, volcModule, acquired, enc)
  } catch (error: any) {
    if (error?.name === 'NotAllowedError' || error?.name === 'AbortError' || error?.name === 'NotFoundError') {
      throw error
    }
    console.warn('[Volc] 自定义屏幕采集失败，回退 SDK 内部采集:', error?.message || error)
    await engine.startScreenCapture({
      enableAudio: true,
      selfBrowserSurface: 'exclude',
      systemAudio: 'include',
    })
    return { stream: null, hasSystemAudio: true, mode: 'sdk' }
  }
}

type VolcAnsHandle = {
  ext: InstanceType<typeof import('@volcengine/rtc/extension-ainr').default>
  AnsMode: typeof import('@volcengine/rtc/extension-ainr').AnsMode
}

/** 每个 engine 只注册一次 AI 降噪扩展 */
const ansExtByEngine = new WeakMap<object, VolcAnsHandle | null>()

/**
 * 浏览器内置降噪（稳态底噪）+ 火山 AI 降噪扩展（键盘/突发噪声）。
 * 需在 startAudioCapture 前配置 capture config；AI 扩展在采集后 enable。
 */
async function ensureVolcAns(engine: any): Promise<VolcAnsHandle | null> {
  if (ansExtByEngine.has(engine)) return ansExtByEngine.get(engine) ?? null
  try {
    const mod = await import('@volcengine/rtc/extension-ainr')
    const RTCAIAnsExtension = mod.default
    const { AnsMode, EventTypes } = mod
    const ext = new RTCAIAnsExtension()
    if (!(await ext.isSupported())) {
      console.info('[Volc] 当前浏览器不支持 AI 降噪，使用内置 noiseSuppression')
      ansExtByEngine.set(engine, null)
      return null
    }
    await engine.registerExtension(ext)
    ext.on(EventTypes.onUnsupported, ({ message }) => {
      console.warn('[Volc] AI 降噪不支持:', message)
    })
    ext.on(EventTypes.onOverload, () => {
      console.warn('[Volc] AI 降噪负载过高，可考虑降低强度')
    })
    ext.on(EventTypes.onError, ({ message }) => {
      console.warn('[Volc] AI 降噪错误:', message)
      void ext.resume().catch(() => {})
    })
    const handle: VolcAnsHandle = { ext, AnsMode }
    ansExtByEngine.set(engine, handle)
    return handle
  } catch (e) {
    console.warn('[Volc] AI 降噪初始化失败，回退浏览器降噪', e)
    ansExtByEngine.set(engine, null)
    return null
  }
}

export const VOLC_MIC_VOLUME_DEFAULT = 100
/** 本端听感 / 自己发送音量滑条上限（SDK 支持到 400） */
export const VOLC_MIC_VOLUME_MAX = 200

function clampVolume(percent: number, max = VOLC_MIC_VOLUME_MAX) {
  const n = Math.round(Number(percent))
  if (!Number.isFinite(n)) return VOLC_MIC_VOLUME_DEFAULT
  return Math.max(0, Math.min(max, n))
}

/**
 * 调节「我这边听到」某远端用户麦克风的音量，不影响对方发送音量。
 * streamIndex 用 MAIN（人声），勿用 SCREEN（系统声）。
 */
export function setVolcRemoteMicVolume(
  engine: any,
  StreamIndex: { STREAM_INDEX_MAIN: number },
  userId: string,
  percent: number,
) {
  if (!engine || !userId) return
  const v = clampVolume(percent)
  try {
    engine.setPlaybackVolume?.(userId, StreamIndex.STREAM_INDEX_MAIN, v)
  } catch (e) {
    console.warn('[Volc] setPlaybackVolume failed', userId, e)
  }
}

/**
 * 调节自己麦克风采集/发送音量（对方会听到变化）。
 */
export function setVolcLocalMicVolume(
  engine: any,
  StreamIndex: { STREAM_INDEX_MAIN: number },
  percent: number,
) {
  if (!engine) return
  const v = clampVolume(percent)
  try {
    engine.setCaptureVolume?.(StreamIndex.STREAM_INDEX_MAIN, v)
  } catch (e) {
    console.warn('[Volc] setCaptureVolume failed', e)
  }
}

/** 开关麦克风自动增益（AGC）。AI 降噪开启时引擎可能强制开启增益。 */
export async function setVolcMicAutoGain(engine: any, enabled: boolean) {
  if (!engine?.setAudioCaptureConfig) return
  try {
    await engine.setAudioCaptureConfig({
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: !!enabled,
    })
  } catch (e) {
    console.warn('[Volc] setAudioCaptureConfig(AGC) failed', e)
  }
}

export async function startVolcMic(
  engine: any,
  MediaType: any,
  opts?: {
    autoGain?: boolean
    captureVolume?: number
    StreamIndex?: { STREAM_INDEX_MAIN: number }
  },
) {
  const autoGain = opts?.autoGain !== false
  // 1) 浏览器约束：稳态底噪 / 回声 / 增益
  try {
    await engine.setAudioCaptureConfig?.({
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: autoGain,
    })
  } catch (e) {
    console.warn('[Volc] setAudioCaptureConfig 失败', e)
  }

  // 2) 提前 register AI 扩展（采集前注册更稳）
  const ans = await ensureVolcAns(engine)

  await engine.startAudioCapture()

  // 3) 开启 AI 降噪（对 SDK 内部麦采集生效；启用后由 AI 接管降噪）
  if (ans) {
    try {
      await ans.ext.setAnsMode(ans.AnsMode.AUTO)
      ans.ext.enable()
      console.info('[Volc] AI 降噪已开启 (AUTO)')
    } catch (e) {
      console.warn('[Volc] AI 降噪 enable 失败', e)
    }
  }

  if (opts?.StreamIndex && opts.captureVolume != null) {
    setVolcLocalMicVolume(engine, opts.StreamIndex, opts.captureVolume)
  }

  await engine.publishStream(MediaType.AUDIO)
}

export async function stopVolcMic(engine: any, MediaType: any) {
  const ans = ansExtByEngine.get(engine)
  if (ans) {
    try { ans.ext.disable() } catch { /* ignore */ }
  }
  try {
    await engine.unpublishStream(MediaType.AUDIO)
  } catch {
    // ignore
  }
  try {
    await engine.stopAudioCapture()
  } catch {
    // ignore
  }
}

export async function subscribeVolcMic(
  engine: any,
  userId: string,
  MediaType: any,
  opts?: {
    StreamIndex?: { STREAM_INDEX_MAIN: number }
    playbackVolume?: number
  },
) {
  try {
    await engine.subscribeStream(userId, MediaType.AUDIO)
    if (opts?.StreamIndex && opts.playbackVolume != null) {
      setVolcRemoteMicVolume(engine, opts.StreamIndex, userId, opts.playbackVolume)
    }
  } catch (e) {
    console.warn('[Volc] subscribe mic failed', userId, e)
  }
}
