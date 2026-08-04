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

/** 点对点语音控制信令 */
export type VolcVoiceMessage =
  | { t: 'ziye-voice'; action: 'force-mute'; by?: string }
  | { t: 'ziye-voice'; action: 'force-unmute'; by?: string }

export function parseVolcVoiceMessage(raw: string): VolcVoiceMessage | null {
  try {
    const data = JSON.parse(raw)
    if (data?.t !== 'ziye-voice') return null
    if (data.action !== 'force-mute' && data.action !== 'force-unmute') return null
    return data as VolcVoiceMessage
  } catch {
    return null
  }
}

/**
 * 优先用浏览器 getDisplayMedia + restrictOwnAudio，避开本标签页声音进系统声回环。
 * 失败（非用户取消）时回退 SDK 内部采集。
 */
export async function startVolcScreenCapture(
  engine: any,
  volcModule: any,
  enc: { width: number; height: number; frameRate: number }
): Promise<VolcScreenCaptureResult> {
  const { StreamIndex, VideoSourceType, AudioSourceType } = volcModule
  await engine.setScreenEncoderConfig?.(enc)

  try {
    const displayConstraints: MediaStreamConstraints & Record<string, unknown> = {
      video: {
        width: { ideal: enc.width },
        height: { ideal: enc.height },
        frameRate: { ideal: enc.frameRate, max: enc.frameRate },
      },
      audio: {
        // Chrome 较新版本：排除当前标签页发出的声音，避免语音回声
        restrictOwnAudio: true,
        echoCancellation: true,
        noiseSuppression: true,
      } as MediaTrackConstraints,
      // Chrome 扩展字段
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
    }

    const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints as MediaStreamConstraints)
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('未获取到屏幕视频轨道')
    }

    await engine.setVideoSourceType(
      StreamIndex.STREAM_INDEX_SCREEN,
      VideoSourceType.VIDEO_SOURCE_TYPE_EXTERNAL
    )
    await engine.setExternalVideoTrack(StreamIndex.STREAM_INDEX_SCREEN, videoTrack)

    const audioTrack = stream.getAudioTracks()[0] || null
    if (audioTrack) {
      await engine.setAudioSourceType(
        StreamIndex.STREAM_INDEX_SCREEN,
        AudioSourceType.AUDIO_SOURCE_TYPE_EXTERNAL
      )
      await engine.setExternalAudioTrack(StreamIndex.STREAM_INDEX_SCREEN, audioTrack)
      // 确认设置是否生效（不支持时浏览器会忽略）
      try {
        const settings = audioTrack.getSettings?.() as { restrictOwnAudio?: boolean }
        if (settings && 'restrictOwnAudio' in settings) {
          console.info('[Volc] restrictOwnAudio =', settings.restrictOwnAudio)
        }
      } catch {
        // ignore
      }
    }

    return { stream, hasSystemAudio: !!audioTrack, mode: 'custom' }
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
